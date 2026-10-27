import test from 'node:test';
import assert from 'node:assert/strict';
import { Stop, RESOURCE, failureEvidence, responseMetadata, textRequest } from '../auth.mjs';

const requestId = 'req_0123456789abcdef0123456789abcdef';
const completed = { type: 'response.completed', response: { status: 'completed' } };
const frame = event => `data: ${JSON.stringify(event)}\n\n`;

async function simulatedTextRequest(response) {
  let calls = 0;
  try {
    return await textRequest('fixture-oauth-credential', 'fixture-catalog-model', async (url, options) => {
      calls++;
      assert.equal(url, `${RESOURCE}/responses`);
      assert.equal(options.method, 'POST');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.authorization, 'Bearer fixture-oauth-credential');
      assert.equal(options.headers.accept, 'text/event-stream');
      const body = JSON.parse(options.body);
      assert.equal(body.store, false);
      assert.equal(body.stream, true);
      assert.deepEqual(Object.keys(body).sort(), ['input', 'model', 'store', 'stream']);
      return response;
    });
  } finally { assert.equal(calls, 1, 'one simulated request; no retry or endpoint fallback'); }
}

for (const fixture of [
  { name: '200 with unexpected JSON object', status: 200, category: 'json',
    type: 'application/json; charset=utf-8', body: '{"detail":"private body fixture"}' },
  { name: '202 with unexpected JSON array', status: 202, category: 'json',
    type: 'application/problem+json', body: '["private body fixture"]' },
  { name: '200 with malformed JSON', status: 200, category: 'json',
    type: 'application/json', body: '{broken private body fixture' },
  { name: '200 with HTML', status: 200, category: 'html',
    type: 'text/html; charset=utf-8', body: '<html>private body fixture</html>' },
  { name: '203 with XHTML', status: 203, category: 'html',
    type: 'application/xhtml+xml', body: '<html>private body fixture</html>' },
  { name: '204 with SSE header but no body', status: 204, category: 'sse',
    type: 'text/event-stream', body: null },
  { name: '200 with missing Content-Type and no body', status: 200, category: 'missing', body: null },
  { name: '200 with body but missing Content-Type', status: 200, category: 'missing',
    body: new TextEncoder().encode('private body fixture') },
  { name: '200 with a non-SSE type containing the SSE substring', status: 200, category: 'other',
    type: 'application/x-text/event-stream', body: 'private body fixture' },
  { name: '206 with plain text', status: 206, category: 'other',
    type: 'text/plain; private=private-header-fixture', body: 'private body fixture' },
]) {
  test(`safe diagnostics: ${fixture.name} stops without reading body`, async () => {
    const response = new Response(fixture.body, { status: fixture.status, headers: {
      ...(fixture.type ? { 'content-type': fixture.type } : {}),
      'x-request-id': requestId,
      'set-cookie': 'fixture-session=private-cookie-fixture',
      'x-arbitrary': 'private-header-fixture',
    } });
    await assert.rejects(simulatedTextRequest(response), error => {
      assert.ok(error instanceof Stop);
      const evidence = failureEvidence(error);
      assert.deepEqual(evidence, { status: 'BLOCKED', reason: 'expected_event_stream',
        httpStatus: fixture.status, bodyShape: null, contentTypeCategory: fixture.category,
        hasBodyStream: fixture.body !== null, requestId });
      const serialized = JSON.stringify(evidence);
      for (const sensitive of ['private', 'fixture-oauth-credential', 'set-cookie', 'x-arbitrary'])
        assert.equal(serialized.includes(sensitive), false);
      return true;
    });
    assert.equal(response.bodyUsed, false, 'unexpected body is never inspected or logged');
  });
}

test('valid SSE accepts normalized media type and records metadata without relaxing completion', async () => {
  const response = new Response(frame({ type: 'response.output_text.delta', delta: 'NEYDRA_AUTH_OK' }) +
    frame(completed), { headers: { 'content-type': 'Text/Event-Stream; Charset=utf-8', 'x-request-id': requestId } });
  assert.deepEqual(await simulatedTextRequest(response), { completed: true, expectedText: true,
    httpStatus: 200, contentTypeCategory: 'sse', hasBodyStream: true, requestId });
});

test('JSON labelled as SSE is rejected with metadata, without leaking its contents', async () => {
  const response = new Response('{"detail":"private body fixture"}', {
    headers: { 'content-type': 'text/event-stream', 'x-request-id': requestId },
  });
  await assert.rejects(simulatedTextRequest(response), error => {
    assert.equal(error.code, 'truncated_stream_frame');
    assert.deepEqual(failureEvidence(error), { status: 'BLOCKED', reason: 'truncated_stream_frame',
      httpStatus: 200, bodyShape: null, contentTypeCategory: 'sse', hasBodyStream: true, requestId });
    assert.equal(JSON.stringify(error).includes('private'), false);
    return true;
  });
});

test('malformed SSE JSON, incomplete stream and late failure retain response metadata', async () => {
  for (const body of ['data: {private-body-fixture}\n\n', frame({ type: 'response.output_text.delta', delta: 'partial' }),
    frame(completed) + frame({ type: 'response.failed', response: { error: {
      code: 'subscription_sharing_usage_limit_exceeded', message: 'private body fixture',
    } } })]) {
    await assert.rejects(simulatedTextRequest(new Response(body, {
      headers: { 'content-type': 'text/event-stream', 'x-request-id': requestId },
    })), error => {
      assert.equal(error.httpStatus, 200);
      assert.equal(error.contentTypeCategory, 'sse');
      assert.equal(error.hasBodyStream, true);
      assert.equal(error.requestId, requestId);
      assert.equal(JSON.stringify(failureEvidence(error)).includes('private'), false);
      return true;
    });
  }
});

test('request IDs use only x-request-id and omit unrecognized values whole', () => {
  for (const id of [null, '', 'req_123', 'private@example.invalid', 'Bearer fixture-secret',
    'sk-fixture-secret', 'https://auth.openai.com/fixture?code=private',
    `req_${'a'.repeat(500)}`, `${requestId}, ${requestId}`, `${requestId};private=secret`,
    `req_${'g'.repeat(32)}`, 'req_0123456789abcdef0123456789abcdef\tprivate']) {
    const response = new Response(null, { headers: {
      ...(id !== null ? { 'x-request-id': id } : {}),
      'openai-request-id': requestId, 'x-client-request-id': requestId,
    } });
    assert.equal(responseMetadata(response).requestId, null);
  }
  assert.equal(responseMetadata(new Response(null, {
    headers: { 'x-request-id': requestId.toUpperCase() },
  })).requestId, requestId.toUpperCase());
  for (const id of [`${requestId}\n`, `${requestId}\r`, `${requestId}\u0000`]) {
    // Native Headers already rejects these bytes; also defend the sanitizer itself.
    assert.equal(responseMetadata({ status: 200, body: null,
      headers: { get: name => name === 'x-request-id' ? id : null } }).requestId, null);
  }
});

test('non-2xx preserves status/body shape and only safe response metadata', async () => {
  await assert.rejects(simulatedTextRequest(Response.json({ error: {
    code: 'subscription_sharing_user_not_eligible', message: 'private body fixture',
  } }, { status: 403, headers: { 'x-request-id': requestId } })), error => {
    assert.deepEqual(failureEvidence(error), { status: 'BLOCKED',
      reason: 'subscription_sharing_user_not_eligible', httpStatus: 403, bodyShape: 'error',
      contentTypeCategory: 'json', hasBodyStream: true, requestId });
    return true;
  });
});

test('formatter emits no extra error properties or raw generic error message', () => {
  const error = new Stop('expected_event_stream', 200);
  error.headers = { authorization: 'private' };
  error.response = { body: 'private' };
  error.stack = 'private';
  assert.equal(JSON.stringify(failureEvidence(error)).includes('private'), false);
  assert.deepEqual(failureEvidence(new Error('private')), { status: 'BLOCKED',
    reason: 'local_or_protocol_error', httpStatus: null, bodyShape: null,
    contentTypeCategory: null, hasBodyStream: null, requestId: null });
});
