import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ChatGPTAdapter } from '../src/main/chatgpt/adapter';
import { ISSUER, JWKS, RESOURCE, TOKEN, Stop, authorizationUrl, consumeCallback, exchange, models, request, textStream, transaction, verifyIdentity, type Transaction } from '../src/main/chatgpt/protocol.mjs';
import type { Listener } from '../src/main/chatgpt/loopback.mjs';
import type { Registration, RegistrationStore } from '../src/main/chatgpt/registration';
import { DesktopService } from '../src/main/service';
import { offlineProvider } from '../src/main/offline';
import { commandSchema, type StreamEvent } from '../src/shared/contracts';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'fixture', alg: 'RS256', use: 'sig' };
function jwt(tx: Transaction, overrides = {}) {
  const head = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'fixture' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ iss: ISSUER, sub: 'synthetic-subject', aud: 'fixture-client', nonce: tx.nonce,
    exp: Math.floor(Date.now() / 1000) + 600, iat: Math.floor(Date.now() / 1000), ...overrides })).toString('base64url');
  const data = `${head}.${body}`;
  return `${data}.${sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url')}`;
}
const tx = () => transaction('http://127.0.0.1:54321/auth/callback', 'synthetic-host', 'fixture-client');
const created = { type: 'response.created', response: { id: 'resp_fixture', status: 'in_progress' } };
const delta = { type: 'response.output_text.delta', delta: 'Ciao sintetico' };
const completed = { type: 'response.completed', response: { id: 'resp_fixture', status: 'completed' } };
const frame = (value: unknown) => `data: ${JSON.stringify(value)}\r\n\r\n`;
function streamResponse(events: unknown[] = [created, delta, completed], mime: string | null = null) {
  const bytes = new TextEncoder().encode(events.map(frame).join(''));
  return new Response(new ReadableStream({ start(controller) {
    // Split UTF-8 and frames across arbitrary transport chunks.
    for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
    controller.close();
  } }), { headers: mime === null ? {} : { 'content-type': mime } });
}
const input = { model: 'visible-model', messages: [{ role: 'user' as const, content: 'Test scelto dall’utente' }] };
async function collect(response: Response) {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
  const chunks = [];
  try {
    for await (const chunk of textStream('synthetic-oauth', input, new AbortController().signal, fetchImpl)) chunks.push(chunk);
  } finally { expect(fetchImpl).toHaveBeenCalledTimes(1); }
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(fetchImpl.mock.calls[0]?.[0]).toBe(`${RESOURCE}/responses`);
  const options = fetchImpl.mock.calls[0]?.[1];
  expect(options?.redirect).toBe('error');
  expect(JSON.parse(String(options?.body))).toEqual({ model: input.model, input: input.messages, store: false, stream: true });
  return chunks;
}

describe('OAuth safeguards with signed synthetic tokens', () => {
  it('uses system-browser URL, random state/nonce and S256 without a secret', () => {
    const first = tx(); const second = tx();
    const url = new URL(authorizationUrl(first));
    expect(url.origin).toBe(ISSUER);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.has('client_secret')).toBe(false);
    expect(first.state).not.toBe(second.state);
    expect(first.nonce).not.toBe(second.nonce);
    expect(url.searchParams.get('code_challenge')).not.toBe(first.verifier);
  });
  it('accepts one callback and blocks replay, duplicates, wrong state and path', () => {
    const first = tx();
    const callback = new URL(`${first.redirectUri}?state=${first.state}&code=fixture`);
    expect(consumeCallback(first, callback).clientId).toBe('fixture-client');
    expect(() => consumeCallback(first, callback)).toThrow('expired_or_replayed');
    for (const suffix of ['?state=wrong&code=fixture', '?state=X&state=X&code=fixture', '/wrong?code=fixture']) {
      const next = tx();
      expect(() => consumeCallback(next, new URL(next.redirectUri + suffix))).toThrow();
    }
  });
  it.each([{ iss: 'https://example.org' }, { aud: 'other' }, { nonce: 'other' }, { exp: 0 }, { azp: 'other' }, { iat: 9999999999 }, { nbf: 9999999999 }])('rejects invalid signed claims %j', overrides => {
    const current = tx();
    expect(() => verifyIdentity(jwt(current, overrides), [jwk], 'fixture-client', current.nonce)).toThrow('identity_verification_failed');
  });
  it('rejects bad signatures, unsigned tokens, duplicate keys and accepts a correct identity', () => {
    const current = tx(); const token = jwt(current);
    expect(verifyIdentity(token, [jwk], 'fixture-client', current.nonce).subject).toBe('synthetic-subject');
    expect(() => verifyIdentity(token, [jwk, jwk], 'fixture-client', current.nonce)).toThrow();
    expect(() => verifyIdentity(token.slice(0, -10) + 'fake', [jwk], 'fixture-client', current.nonce)).toThrow();
    expect(() => verifyIdentity('eyJhbGciOiJub25lIn0.e30.fake', [jwk], 'fixture-client', current.nonce)).toThrow();
  });
  it.each(['scope', 'key', 'account'] as const)('blocks unauthorized exchange: %s', async scenario => {
    const current = tx();
    const fetchImpl = vi.fn<typeof fetch>(async url => new Response(JSON.stringify(url === JWKS ? { keys: [jwk] } : {
      id_token: jwt(current), access_token: scenario === 'key' ? 'sk-fixture' : 'synthetic-oauth', token_type: 'Bearer', expires_in: 3600,
      scope: scenario === 'scope' ? 'openid' : 'resource.invoke chatgpt.tokens.use.direct',
    }), { headers: { 'content-type': 'application/json' } }));
    await expect(exchange(current, { code: 'fixture', clientId: 'fixture-client' }, scenario === 'account' ? 'other-subject' : null, fetchImpl)).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('blocks arbitrary endpoints before transport and enforces response size', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(request('https://example.org', {}, fetchImpl)).rejects.toThrow('unsupported_endpoint');
    expect(fetchImpl).not.toHaveBeenCalled();
    fetchImpl.mockResolvedValue(new Response('x'.repeat(262145)));
    await expect(models('synthetic', fetchImpl)).rejects.toThrow('oversized_json');
  });
});

describe('Responses completion and same-response missing-MIME handling', () => {
  it.each([null, 'text/event-stream; charset=utf-8'])('streams and verifies EOF with MIME %s', async mime => {
    const chunks = await collect(streamResponse(undefined, mime));
    expect(chunks).toEqual([{ type: 'delta', text: delta.delta }, { type: 'completed', missingMimeStreamValidated: mime === null }]);
  });
  it.each([
    ['missing terminal', [created, delta]], ['wrong ID', [created, { ...completed, response: { id: 'other', status: 'completed' } }]],
    ['missing created', [delta, completed]], ['duplicate created', [created, created, completed]],
    ['failed', [created, { type: 'response.failed' }]], ['incomplete', [created, { type: 'response.incomplete' }]],
    ['error', [created, { type: 'error', error: { message: 'private diagnostic' } }]],
    ['late event', [created, completed, delta]], ['oversized output', [created, { ...delta, delta: 'x'.repeat(16385) }, completed]],
    ['false complete', [created, { ...completed, response: { id: 'resp_fixture', status: 'incomplete' } }]],
  ])('rejects %s without retry', async (_name, events) => {
    await expect(collect(streamResponse(events as unknown[]))).rejects.toThrow();
  });
  it.each(['application/json', 'text/html', 'text/event-stream-invalid'])('rejects explicit %s', async mime => {
    await expect(collect(streamResponse(undefined, mime))).rejects.toThrow('expected_event_stream');
  });
  it.each(['<html>private</html>', '{"fake":true}', 'data: {bad}\n\n', frame(created) + 'data: {', 'event: wrong\n' + frame(created), frame(created) + '\n'.repeat(300000)])('rejects malformed body without fallback', async body => {
    await expect(collect(new Response(new TextEncoder().encode(body)))).rejects.toThrow();
  });
  it('fails invalid UTF-8, missing body, excess events and non-200 missing MIME', async () => {
    await expect(collect(new Response(new Uint8Array([0xc3, 0x28])))).rejects.toThrow();
    await expect(collect(new Response(null))).rejects.toThrow();
    await expect(collect(streamResponse([created, ...Array.from({ length: 513 }, () => ({ type: 'response.in_progress' })), completed]))).rejects.toThrow();
    await expect(collect(new Response(new TextEncoder().encode([created, completed].map(frame).join('')), { status: 201 }))).rejects.toThrow();
  });
  it('cancels an active reader and surfaces no completed event', async () => {
    let transportSignal: AbortSignal | null | undefined;
    const controller = new AbortController();
    const cancelled = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>(async (_url, options) => {
      transportSignal = options?.signal;
      return new Response(new ReadableStream({ start(body) {
        body.enqueue(new TextEncoder().encode(frame(created) + frame(delta)));
        options?.signal?.addEventListener('abort', () => body.error(new Error('synthetic cancelled')));
      }, cancel: cancelled }));
    });
    const iterator = textStream('synthetic', input, controller.signal, fetchImpl)[Symbol.asyncIterator]();
    expect((await iterator.next()).value?.type).toBe('delta');
    controller.abort();
    await expect(iterator.next()).rejects.toThrow();
    expect(transportSignal?.aborted).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

function fixtureAdapter() {
  const registration: Registration = { hostId: '92cf0535-d871-4fde-a953-c9bf91a7a7fa', clientId: null, subject: null };
  const store: RegistrationStore = { load: vi.fn(async () => ({ ...registration })), save: vi.fn(async value => { Object.assign(registration, value); }) };
  let current: Transaction;
  const open = vi.fn(async (url: string) => { expect(new URL(url).origin).toBe(ISSUER); });
  const listener = vi.fn<() => Promise<Listener>>(async () => {
    current = tx();
    return { tx: current, result: Promise.resolve({ callback: { code: 'fixture', clientId: 'fixture-client' } }), close: vi.fn() } satisfies Listener;
  });
  const calls: { url: string; options?: RequestInit }[] = [];
  const fetchImpl = vi.fn<typeof fetch>(async (url, options) => {
    calls.push({ url: String(url), options });
    if (url === TOKEN) return Response.json({ id_token: jwt(current), access_token: 'synthetic-oauth', token_type: 'Bearer', expires_in: 3600, scope: 'resource.invoke chatgpt.tokens.use.direct' });
    if (url === JWKS) return Response.json({ keys: [jwk] });
    if (url === `${RESOURCE}/models`) return Response.json({ models: [{ slug: 'hidden', visibility: 'hide' }, { slug: 'visible-model', visibility: 'list' }, { slug: 'second-model', visibility: 'list' }] });
    if (url === `${RESOURCE}/responses`) return streamResponse();
    throw new Error('Unexpected transport');
  });
  return { adapter: new ChatGPTAdapter(store, open, fetchImpl, listener), store, calls, open, listener, fetchImpl };
}

describe('main-only adapter and service integration, all transports mocked', () => {
  it('does no work until explicit connect; discovers model IDs and sends user text once per consent', async () => {
    const fixture = fixtureAdapter(); const { adapter, calls } = fixture;
    const events: StreamEvent[] = [];
    const service = new DesktopService(offlineProvider, event => events.push(event), adapter);
    expect(adapter.state().state).toBe('disconnected');
    expect(calls).toEqual([]);
    expect(service.handle({ type: 'connectChatGPT' })).toMatchObject({ ok: false });
    await service.handle({ type: 'connectChatGPT', input: { consent: 'system-browser' } });
    expect(adapter.state()).toEqual({ state: 'connected', models: [{ slug: 'visible-model', name: 'visible-model' }, { slug: 'second-model', name: 'second-model' }] });
    expect(calls.filter(call => call.url.endsWith('/responses'))).toHaveLength(0);
    const command = { type: 'startChatGPT', input: { requestId: '92cf0535-d871-4fde-a953-c9bf91a7a7fa', prompt: 'Test scelto', model: 'second-model', consent: 'included-plan-checked' } };
    expect(service.handle({ ...command, input: { ...command.input, consent: false } })).toMatchObject({ ok: false });
    expect(service.handle({ ...command, input: { ...command.input, model: 'not-authorized' } })).toMatchObject({ ok: false });
    expect(service.handle(command)).toEqual({ ok: true });
    expect(service.handle(command)).toMatchObject({ code: 'busy' });
    await vi.waitFor(() => expect(events.at(-1)?.type).toBe('responseCompleted'));
    expect(service.handle(command)).toMatchObject({ code: 'replayed' });
    expect(calls.filter(call => call.url.endsWith('/responses'))).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain('synthetic-oauth');
    expect(JSON.stringify(adapter.state())).not.toContain('synthetic-subject');
    service.dispose();
    expect(adapter.state()).toEqual({ state: 'disconnected', models: [] });
  });
  it('retains only completed turns; reset clears context and expiry blocks transport', async () => {
    const { adapter, calls } = fixtureAdapter();
    await adapter.connect(new AbortController().signal);
    const real = { requestId: '92cf0535-d871-4fde-a953-c9bf91a7a7fa', prompt: 'Primo turno', model: 'visible-model', consent: 'included-plan-checked' as const };
    for await (const chunk of adapter.stream(real, new AbortController().signal)) expect(chunk).toBeDefined();
    for await (const chunk of adapter.stream({ ...real, prompt: 'Secondo turno' }, new AbortController().signal)) expect(chunk).toBeDefined();
    expect(JSON.parse(String(calls.at(-1)?.options?.body)).input).toHaveLength(3);
    adapter.reset();
    for await (const chunk of adapter.stream(real, new AbortController().signal)) expect(chunk).toBeDefined();
    expect(JSON.parse(String(calls.at(-1)?.options?.body)).input).toHaveLength(1);
    const count = calls.length;
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 3600001);
    try {
      await expect(async () => { for await (const chunk of adapter.stream(real, new AbortController().signal)) expect(chunk).toBeDefined(); }).rejects.toThrow('Connection unavailable');
      expect(calls).toHaveLength(count);
    } finally { vi.restoreAllMocks(); }
  });
  it('cancels connection while waiting for listener and opens no browser', async () => {
    const { adapter, listener, open } = fixtureAdapter();
    let release!: (value: Listener) => void;
    listener.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const controller = new AbortController(); const result = adapter.connect(controller.signal);
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    controller.abort();
    const close = vi.fn(); release({ tx: tx(), result: new Promise(() => {}), close });
    await expect(result).rejects.toThrow();
    expect(close).toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
    expect(adapter.state().state).toBe('disconnected');
  });
  it('sanitizes quota failure, refuses auto retry and validates OAuth-related IPC fields', async () => {
    const fixture = fixtureAdapter();
    await fixture.adapter.connect(new AbortController().signal);
    fixture.fetchImpl.mockImplementationOnce(async () => { throw new Stop('subscription_sharing_usage_limit_exceeded', 429); });
    const events: StreamEvent[] = [];
    const service = new DesktopService(offlineProvider, event => events.push(event), fixture.adapter);
    for (const raw of [{ type: 'connectChatGPT', input: { consent: 'system-browser', url: 'https://example.org' } },
      { type: 'disconnectChatGPT', token: 'synthetic' }, { type: 'startChatGPT', input: { headers: {} } }]) expect(commandSchema.safeParse(raw).success).toBe(false);
    service.handle({ type: 'startChatGPT', input: { requestId: '92cf0535-d871-4fde-a953-c9bf91a7a7fa', prompt: 'Test', model: 'visible-model', consent: 'included-plan-checked' } });
    await vi.waitFor(() => expect(events.at(-1)).toMatchObject({ type: 'responseFailed', code: 'quota' }));
    expect(fixture.fetchImpl).toHaveBeenCalledTimes(4);
  });
});

it('does not retain failed or cancelled partial turns in the next request context', async () => {
  const { adapter, calls, fetchImpl } = fixtureAdapter();
  await adapter.connect(new AbortController().signal);
  const real = { requestId: '92cf0535-d871-4fde-a953-c9bf91a7a7fa', prompt: 'Fixture', model: 'visible-model', consent: 'included-plan-checked' as const };
  fetchImpl.mockResolvedValueOnce(streamResponse([created, delta]));
  await expect(async () => { for await (const chunk of adapter.stream(real, new AbortController().signal)) expect(chunk).toBeDefined(); }).rejects.toThrow('stream_without_completion');
  const controller = new AbortController();
  await expect(async () => { for await (const chunk of adapter.stream(real, controller.signal)) { expect(chunk.type).toBe('delta'); controller.abort(); } }).rejects.toThrow();
  for await (const chunk of adapter.stream(real, new AbortController().signal)) expect(chunk).toBeDefined();
  expect(JSON.parse(String(calls.at(-1)?.options?.body)).input).toHaveLength(1);
});
it('aborts a pending token exchange and never publishes a connected session', async () => {
  const { adapter, fetchImpl, listener } = fixtureAdapter();
  fetchImpl.mockImplementationOnce(async (_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new Error('synthetic-abort')), { once: true });
  }));
  const controller = new AbortController();
  const connecting = adapter.connect(controller.signal);
  await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
  controller.abort();
  await expect(connecting).rejects.toThrow();
  expect(adapter.state().state).toBe('disconnected');
  expect((await listener.mock.results[0]!.value).close).toHaveBeenCalled();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
it('catalogue denial or zero authorized models prevents inference and connection publication', async () => {
  for (const scenario of ['empty', 'forbidden']) {
    const { adapter, fetchImpl } = fixtureAdapter();
    const original = fetchImpl.getMockImplementation()!;
    fetchImpl.mockImplementation(async (url, options) => url === `${RESOURCE}/models`
      ? scenario === 'empty' ? Response.json({ models: [] }) : Response.json({ error: { code: 'subscription_sharing_user_not_eligible' } }, { status: 403 })
      : original(url, options));
    await expect(adapter.connect(new AbortController().signal)).rejects.toThrow();
    expect(adapter.state()).toEqual({ state: 'disconnected', models: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  }
});
