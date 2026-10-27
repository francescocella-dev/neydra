import test from 'node:test';
import assert from 'node:assert/strict';
import { RESOURCE, Stop, failureEvidence, textRequest } from '../auth.mjs';

const utf8 = text => new TextEncoder().encode(text);
const event = (type, extra = {}) => ({ type, ...extra });
const created = event('response.created', { response: { id: 'resp_fixture_1', status: 'in_progress' } });
const completed = event('response.completed', { response: { id: 'resp_fixture_1', status: 'completed' } });
const frame = item => `event: ${item.type}\ndata: ${JSON.stringify(item)}\n\n`;
const okStream = frame(created) +
  frame(event('response.in_progress', { response: { id: 'resp_fixture_1', status: 'in_progress' } })) +
  frame(event('response.output_item.added', { output_index: 0 })) +
  frame(event('response.content_part.added', { content_index: 0 })) +
  frame(event('response.output_text.delta', { delta: 'NEYDRA_AUTH_OK' })) +
  frame(event('response.output_text.done', { text: 'NEYDRA_AUTH_OK' })) +
  frame(event('response.content_part.done', { content_index: 0 })) +
  frame(event('response.output_item.done', { output_index: 0 })) +
  frame(completed) + 'data: [DONE]\n\n';

function withoutMime(payload, status = 200) {
  // Uint8Array avoids Node Response auto-supplying text/plain Content-Type.
  const result = new Response(payload === null ? null : utf8(payload), { status });
  assert.equal(result.headers.get('content-type'), null);
  return result;
}
async function run(response) {
  let attempts = 0;
  try {
    return await textRequest('fixture-oauth-access-token', 'gpt-5.6-luna', async (url, options) => {
      attempts++;
      assert.equal(url, `${RESOURCE}/responses`);
      assert.equal(options.method, 'POST');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.authorization, 'Bearer fixture-oauth-access-token');
      assert.equal(options.headers['content-type'], 'application/json');
      const request = JSON.parse(options.body);
      assert.deepEqual(Object.keys(request).sort(), ['input', 'model', 'store', 'stream']);
      assert.equal(request.model, 'gpt-5.6-luna');
      assert.equal(request.store, false);
      assert.equal(request.stream, true);
      return response;
    });
  } finally {
    assert.equal(attempts, 1, 'exactly one mocked HTTP request, never a retry');
  }
}

test('HTTP 200 without MIME: genuine complete SSE events return verified completion', async () => {
  assert.deepEqual(await run(withoutMime(okStream)), {
    completed: true, expectedText: true,
    httpStatus: 200, contentTypeCategory: 'missing', hasBodyStream: true, requestId: null,
    missingMimeStreamValidated: true,
  });
});

test('HTTP 200 without MIME: no body is blocked without retry', async () => {
  await assert.rejects(run(withoutMime(null)), error => error.code === 'expected_event_stream');
});

for (const [name, payload] of [
  ['plain JSON', '{"detail":"private-fixture"}'],
  ['HTML', '<html>private-fixture</html>'],
  ['arbitrary text', 'private-fixture'],
  ['SSE with no created event', frame(event('response.output_text.delta', { delta: 'NEYDRA_AUTH_OK' })) + frame(completed)],
  ['created, then wrong completed ID', frame(created) + frame(event('response.completed', {
    response: { status: 'completed', id: 'resp_not_the_same' },
  }))],
  ['created, then incomplete', frame(created) + frame(event('response.incomplete', { response: { status: 'incomplete' } }))],
  ['created, then failed', frame(created) + frame(event('response.failed', {
    response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } },
  }))],
  ['created without completion', frame(created) + frame(event('response.output_text.delta', { delta: 'NEYDRA_AUTH_OK' }))],
  ['event label mismatch', frame(created) + 'event: response.completed\ndata: {"type":"response.output_text.delta","delta":"private"}\n\n'],
  ['not an SSE field', 'Private-Header: private-fixture\n\n' + okStream],
  ['duplicate created event', frame(created) + frame(created) + frame(completed)],
  ['stream event after completion', frame(created) + frame(completed) + frame(event('response.output_text.delta', { delta: 'private' }))],
  ['too many incoming bytes', frame(created) + frame(event('response.output_text.delta', { delta: 'x'.repeat(280000) })) + frame(completed)],
]) {
  test(`HTTP 200 without MIME rejects ${name}, never exposes response body`, async () => {
    await assert.rejects(run(withoutMime(payload)), error => {
      assert.ok(error instanceof Stop);
      const evidence = JSON.stringify(failureEvidence(error));
      assert.equal(evidence.includes('private-fixture'), false);
      assert.equal(evidence.includes('fixture-oauth-access-token'), false);
      assert.equal(failureEvidence(error).httpStatus, 200);
      assert.equal(failureEvidence(error).contentTypeCategory, 'missing');
      return true;
    });
  });
}

test('explicit non-SSE MIME stays blocked without inspecting body', async () => {
  const response = new Response('private-fixture', { headers: { 'content-type': 'application/json' } });
  await assert.rejects(run(response), error => error.code === 'expected_event_stream');
  assert.equal(response.bodyUsed, false);
});

test('HTTP 202 without MIME stays blocked without reading body', async () => {
  const response = withoutMime(okStream, 202);
  await assert.rejects(run(response), error => error.code === 'expected_event_stream');
  assert.equal(response.bodyUsed, false);
});

test('unexpected wrong text is not reported as expectedText even on completed SSE', async () => {
  const payload = frame(created) + frame(event('response.output_text.delta', { delta: 'WRONG' })) + frame(completed);
  const result = await run(withoutMime(payload));
  assert.equal(result.completed, true);
  assert.equal(result.expectedText, false);
});

test('regular MIME SSE path remains backward compatible', async () => {
  const response = new Response('data: {"type":"response.output_text.delta","delta":"NEYDRA_AUTH_OK"}\n\n' +
    'data: {"type":"response.completed","response":{"status":"completed"}}\n\n',
    { headers: { 'content-type': 'text/event-stream' } });
  const result = await run(response);
  assert.equal(result.completed, true);
  assert.equal(result.expectedText, true);
  assert.equal(result.contentTypeCategory, 'sse');
  assert.equal(Object.hasOwn(result, 'missingMimeStreamValidated'), false);
});
