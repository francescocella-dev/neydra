import test from 'node:test';
import assert from 'node:assert/strict';
import { failureEvidence, textRequest } from '../auth.mjs';
import { inspectMissingMimeFixture as inspect, PROPOSAL_LIMITS } from '../sse-proposal.mjs';

const encoder = new TextEncoder();
const created = { type: 'response.created', response: { id: 'resp_fixture', status: 'in_progress' } };
const completed = { type: 'response.completed', response: { id: 'resp_fixture', status: 'completed' } };
const delta = { type: 'response.output_text.delta', delta: 'test è' };
const frame = event => `data: ${JSON.stringify(event)}\n\n`;
const valid = frame(created) + frame(delta) + frame(completed);
const fixture = text => new Response(typeof text === 'string' ? encoder.encode(text) : text);

test('offline proposal recognizes full structure only; preserves missing MIME and UNVERIFIED', async () => {
  const result = await inspect(fixture(valid + 'data: [DONE]\n\n'));
  assert.deepEqual(result, { status: 'UNVERIFIED', mode: 'offline-fixture', httpStatus: 200,
    contentTypeCategory: 'missing', hasBodyStream: true, requestId: null,
    structureRecognized: 'sse', completedObserved: true });
});

test('valid LF, CRLF, CR, BOM, comments and UTF-8 work across every byte boundary', async () => {
  for (const newline of ['\n', '\r\n', '\r']) {
    const bytes = encoder.encode(('\uFEFF: fixture\n\n' + valid).replaceAll('\n', newline));
    const stream = new ReadableStream({
      start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); },
    });
    assert.equal((await inspect(new Response(stream))).completedObserved, true);
  }
});

test('event/data agreement, multiline JSON and harmless id field are checked', async () => {
  const body = `event: response.created\nid: fixture\ndata: {"type":"response.created",\ndata: "response":{"id":"resp_fixture","status":"in_progress"}}\n\n` + frame(completed);
  assert.equal((await inspect(fixture(body))).completedObserved, true);
  await assert.rejects(inspect(fixture('event: error\n' + frame(completed))), /proposal_event_mismatch/);
});

for (const [name, body] of [
  ['JSON', '{"detail":"private fixture"}'], ['HTML', '<html>private fixture</html>'],
  ['plain text', 'private fixture'], ['empty object body', ''],
  ['garbage before valid frames', 'private fixture\n\n' + valid],
  ['comments only', ': keepalive\n\n'], ['delta without created', frame(delta) + frame(completed)],
  ['completed without created', frame(completed)], ['DONE without completed', frame(created) + 'data: [DONE]\n\n'],
  ['missing completion', frame(created) + frame(delta)], ['truncated frame', valid.trimEnd()],
  ['trailing garbage', valid + 'private fixture'],
  ['unknown field', 'retry: 1000\n\n' + valid], ['unknown event', frame(created) + frame({ type: 'response.future' })],
  ['duplicate event field', 'event: response.created\nevent: response.created\n' + valid],
  ['different response ID', frame(created) + frame({ ...completed, response: { id: 'other', status: 'completed' } })],
  ['duplicate completion', valid + frame(completed)], ['late delta', valid + frame(delta)],
  ['SSE JSON primitive', 'data: null\n\n'], ['malformed SSE JSON', 'data: {private}\n\n'],
]) {
  test(`offline proposal rejects ${name} without emitting contents`, async () => {
    await assert.rejects(inspect(fixture(body)), error => {
      assert.ok(error.code.startsWith('proposal_'));
      assert.equal(error.httpStatus, 200);
      assert.equal(error.contentTypeCategory, 'missing');
      assert.equal(JSON.stringify(failureEvidence(error)).includes('private'), false);
      return true;
    });
  });
}

test('failure, incomplete and explicit errors, including after completion, always reject', async () => {
  for (const type of ['error', 'response.failed', 'response.incomplete']) {
    for (const prefix of [frame(created), valid]) {
      await assert.rejects(inspect(fixture(prefix + frame({ type, message: 'private fixture' }))), /proposal_response_failed/);
    }
  }
  await assert.rejects(inspect(fixture(frame(created) + frame({ ...completed,
    response: { ...completed.response, error: { message: 'private fixture' } } }))), /proposal_invalid_response/);
  await assert.rejects(inspect(fixture(frame({ ...created,
    response: { ...created.response, error: { message: 'private fixture' } } }) + frame(completed))), /proposal_missing_created/);
});

test('invalid UTF-8, including a trailing incomplete sequence, fails closed', async () => {
  for (const suffix of [[0xff], [0xc3]]) {
    const bytes = Uint8Array.from([...encoder.encode(valid), ...suffix]);
    await assert.rejects(inspect(fixture(bytes)), /proposal_invalid_utf8/);
  }
});

test('prefix, per-frame, cumulative byte, event and output budgets are enforced', async () => {
  await assert.rejects(inspect(fixture(':'.repeat(20)), { prefixBytes: 10 }), /proposal_prefix_limit/);
  await assert.rejects(inspect(fixture(valid), { frameBytes: 10 }), /proposal_frame_limit/);
  await assert.rejects(inspect(fixture(valid), { totalBytes: 10 }), /proposal_total_limit/);
  await assert.rejects(inspect(fixture(valid), { events: 1 }), /proposal_event_limit/);
  await assert.rejects(inspect(fixture(valid), { outputCharacters: 1 }), /proposal_output_limit/);
  const emptyChunks = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array()); } });
  await assert.rejects(inspect(new Response(emptyChunks), { reads: 2 }), /proposal_read_limit/);
  for (const key of Object.keys(PROPOSAL_LIMITS)) {
    await assert.rejects(inspect(fixture(valid), { [key]: PROPOSAL_LIMITS[key] + 1 }), /invalid_proposal_limit/);
  }
});

test('global deadline covers stalled input and cancels without waiting for a hostile cancel promise', async () => {
  for (const prefix of ['', frame(created)]) {
    let cancelled = false;
    const stream = new ReadableStream({
      start(controller) { if (prefix) controller.enqueue(encoder.encode(prefix)); },
      cancel() { cancelled = true; return new Promise(() => {}); },
    });
    await assert.rejects(inspect(new Response(stream), { deadlineMs: 20 }), /proposal_deadline/);
    assert.equal(cancelled, true);
  }
});

test('transport rejection cancels and cannot leak the producer error message', async () => {
  const stream = new ReadableStream({ pull() { throw new Error('private fixture'); } });
  await assert.rejects(inspect(new Response(stream)), error => {
    assert.equal(error.code, 'proposal_stream_error');
    assert.equal(JSON.stringify(failureEvidence(error)).includes('private'), false);
    return true;
  });
});

test('proposal refuses an explicit, empty or malformed MIME, non-200, or absent body without reading', async () => {
  for (const response of [fixture(null),
    new Response(encoder.encode(valid), { status: 202 }),
    ...['text/event-stream', 'application/json', 'text/html', '', '; charset=utf-8'].map(type =>
      new Response(encoder.encode(valid), { headers: { 'content-type': type } })),
  ]) {
    await assert.rejects(inspect(response), /proposal_not_applicable/);
    assert.equal(response.bodyUsed, false);
  }
});

test('runtime validates a complete missing-MIME SSE response independently of offline proposal; one request', async () => {
  const response = fixture(valid);
  let calls = 0;
  const result = await textRequest('fixture-oauth', 'fixture-model', async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body);
    assert.equal(body.store, false); assert.equal(body.stream, true);
    assert.equal(options.redirect, 'error');
    return response;
  });
  assert.equal(calls, 1, 'only one mocked HTTP request');
  assert.equal(response.bodyUsed, true, 'validated existing stream was read once');
  assert.deepEqual(result, {
    completed: true,
    expectedText: false, // Fixture says "test è", not the fixed NEYDRA_AUTH_OK string.
    httpStatus: 200, contentTypeCategory: 'missing', hasBodyStream: true,
    requestId: null, missingMimeStreamValidated: true,
  });
});
