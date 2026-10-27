import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { APP_NAME, AUTHORIZE, ISSUER, JWKS, RESOURCE, TOKEN, SCOPES, Stop,
  authorizationUrl, consumeCallback, exchange, models, request, sse, textRequest,
  transaction, verifyIdentity } from '../auth.mjs';
import { initializeMessage, providerArgs } from '../codex.mjs';

const redirect = 'http://127.0.0.1:34567/auth/callback';
const hostId = 'urn:uuid:7e1afc03-91ae-4971-b61b-a9957ec61339';
const clientId = 'oaiapp_test_fixture';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'fixture', alg: 'RS256', use: 'sig' };
const now = Math.floor(Date.now() / 1000);
function jwt(overrides = {}, nonce = 'nonce', header = {}) {
  const parts = [{ alg: 'RS256', kid: 'fixture', ...header }, { iss: ISSUER, aud: clientId,
    nonce, sub: 'fixture-subject', exp: now + 3600, iat: now, ...overrides }]
    .map(p => Buffer.from(JSON.stringify(p)).toString('base64url'));
  return `${parts.join('.')}.${sign('RSA-SHA256', Buffer.from(parts.join('.')), privateKey).toString('base64url')}`;
}
function callback(tx, extra = {}) {
  return new URL(`${redirect}?${new URLSearchParams({ state: tx.state, code: 'fixture-code', client_id: clientId, ...extra })}`);
}
function eventResponse(events) {
  return new Response(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join(''), {
    headers: { 'content-type': 'text/event-stream' },
  });
}
const completed = { type: 'response.completed', response: { status: 'completed' } };

test('fresh state, nonce and PKCE; dynamic registration uses documented parameters', () => {
  const tx = transaction(redirect, hostId);
  const other = transaction(redirect, hostId);
  for (const field of ['state', 'nonce', 'verifier']) assert.notEqual(tx[field], other[field]);
  const url = new URL(authorizationUrl(tx));
  assert.equal(`${url.origin}${url.pathname}`, AUTHORIZE);
  assert.equal(url.searchParams.get('client_id'), 'dynamic_agent_client');
  assert.equal(url.searchParams.get('agent_name_hint'), APP_NAME);
  assert.equal(url.searchParams.get('ext_agent_host_id'), hostId);
  assert.equal(url.searchParams.get('resource'), RESOURCE);
  assert.equal(url.searchParams.get('scope'), SCOPES);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('code_challenge'), createHash('sha256').update(tx.verifier).digest('base64url'));
  const returning = new URL(authorizationUrl(transaction(redirect, hostId, clientId)));
  assert.equal(returning.searchParams.get('client_id'), clientId);
  assert.equal(returning.searchParams.has('agent_name_hint'), false);
});

test('callback rejects missing/mismatched/duplicate state, denial, missing or changed client, replay, expiry', () => {
  for (const extra of [{ state: '' }, { state: 'wrong' }, { error: 'access_denied' },
    { client_id: '' }, { client_id: 'dynamic_agent_client' }, { code: '' }]) {
    const tx = transaction(redirect, hostId);
    assert.throws(() => consumeCallback(tx, callback(tx, extra)), Stop);
    assert.throws(() => consumeCallback(tx, callback(tx)), Stop);
  }
  const tx = transaction(redirect, hostId);
  const duplicate = callback(tx); duplicate.searchParams.append('state', tx.state);
  assert.throws(() => consumeCallback(tx, duplicate), /duplicate_callback_parameter/);
  const expired = transaction(redirect, hostId); expired.expiresAt = 0;
  assert.throws(() => consumeCallback(expired, callback(expired)), /expired/);
  const changed = transaction(redirect, hostId, 'different');
  assert.throws(() => consumeCallback(changed, callback(changed)), /invalid_issued_client/);
  const valid = transaction(redirect, hostId);
  assert.equal(consumeCallback(valid, callback(valid)).clientId, clientId);
  assert.throws(() => consumeCallback(valid, callback(valid)), /replayed/);
  const returning = transaction(redirect, hostId, clientId);
  const returningUrl = callback(returning); returningUrl.searchParams.delete('client_id');
  assert.equal(consumeCallback(returning, returningUrl).clientId, clientId);
});

test('only documented loopback host/path/scheme are accepted', () => {
  for (const uri of ['http://localhost:123/auth/callback', 'https://127.0.0.1/auth/callback',
    'http://127.0.0.1:123/callback', `${redirect}?test=true`])
    assert.throws(() => transaction(uri, hostId), Stop);
});

test('real fixture signature verified; forged signatures and invalid identity claims fail closed', () => {
  assert.equal(verifyIdentity(jwt(), [jwk], clientId, 'nonce').subject, 'fixture-subject');
  for (const claims of [{ iss: 'https://evil.invalid' }, { aud: 'other' }, { exp: now - 1 },
    { exp: '9999999999' }, { iat: now + 120 }, { nbf: now + 120 }, { nonce: 'other' },
    { sub: '' }, { azp: 'other' }, { aud: [clientId, 'other'] }])
    assert.throws(() => verifyIdentity(jwt(claims), [jwk], clientId, 'nonce'), /identity_verification_failed/);
  for (const header of [{ alg: 'none' }, { alg: 'HS256' }, { kid: 'unknown' }, { crit: ['x'] }])
    assert.throws(() => verifyIdentity(jwt({}, 'nonce', header), [jwk], clientId, 'nonce'), Stop);
  const forged = jwt().split('.'); forged[1] = Buffer.from('{"sub":"forged"}').toString('base64url');
  assert.throws(() => verifyIdentity(forged.join('.'), [jwk], clientId, 'nonce'), Stop);
  assert.throws(() => verifyIdentity(jwt(), [jwk, jwk], clientId, 'nonce'), Stop);
});

test('exchange uses issued ID and exact redirect/resource; granted scopes and account checked', async () => {
  for (const variant of ['ok', 'no-plan', 'wrong-account', 'api-key']) {
    const tx = transaction(redirect, hostId);
    const cb = consumeCallback(tx, callback(tx));
    const calls = [];
    const fake = async (url, options) => {
      calls.push(url);
      assert.equal(options.redirect, 'error');
      if (url === JWKS) return Response.json({ keys: [jwk] });
      assert.equal(url, TOKEN);
      assert.equal(options.body.get('client_id'), clientId);
      assert.equal(options.body.get('code_verifier'), tx.verifier);
      assert.equal(options.body.get('redirect_uri'), redirect);
      assert.equal(options.body.get('resource'), RESOURCE);
      assert.equal(options.body.has('client_secret'), false);
      return Response.json({ id_token: jwt({}, tx.nonce), token_type: 'Bearer', expires_in: 3600,
        access_token: variant === 'api-key' ? 'sk-fixture' : 'oauth-fixture',
        scope: variant === 'no-plan' ? 'openid' : SCOPES });
    };
    const task = exchange(tx, cb, variant === 'wrong-account' ? 'another-subject' : null, fake);
    if (variant === 'ok') assert.equal((await task).accessToken, 'oauth-fixture');
    else await assert.rejects(task, Stop);
    assert.deepEqual(calls, [TOKEN, JWKS]); // No inference on failed authorization.
  }
});

test('account catalog preserves visible server order and does not accept generic API data shape', async () => {
  const fake = async (url, options) => {
    assert.equal(url, `${RESOURCE}/models`);
    assert.equal(options.headers.authorization, 'Bearer oauth-fixture');
    return Response.json({ models: [{ slug: 'b', visibility: 'list' },
      { slug: 'hidden', visibility: 'hide' }, { slug: 'a', visibility: 'list' }] });
  };
  assert.deepEqual(await models('oauth-fixture', fake), ['b', 'a']);
  await assert.rejects(models('oauth-fixture', async () => Response.json({ data: [] })), /catalog/);
});

test('one streamed text request uses OAuth, store=false, stream=true and minimal permitted body', async () => {
  let calls = 0;
  const result = await textRequest('oauth-fixture', 'catalog-model', async (url, options) => {
    calls++;
    assert.equal(url, `${RESOURCE}/responses`);
    assert.equal(options.headers.authorization, 'Bearer oauth-fixture');
    const body = JSON.parse(options.body);
    assert.deepEqual(Object.keys(body).sort(), ['input', 'model', 'store', 'stream']);
    assert.equal(body.store, false); assert.equal(body.stream, true);
    assert.equal(body.model, 'catalog-model'); assert.equal(body.input[0].role, 'user');
    return eventResponse([{ type: 'response.output_text.delta', delta: 'NEYDRA_AUTH_OK' }, completed]);
  });
  assert.deepEqual(result, { completed: true, expectedText: true });
  assert.equal(calls, 1);
});

test('SSE handles byte/chunk boundaries, CRLF, comments, Unicode and multiline data', async () => {
  const bytes = new TextEncoder().encode(': comment\r\ndata: {"type":\r\ndata: "è"}\r\n\r\ndata: [DONE]\r\n\r\n');
  async function* chunks() { for (const byte of bytes) yield Uint8Array.of(byte); }
  const events = []; for await (const event of sse(chunks())) events.push(event);
  assert.deepEqual(events, [{ type: 'è' }]);
});

test('partial text/HTTP 200 never imply success; late errors, incomplete and truncated streams stop', async () => {
  for (const events of [[], [{ type: 'response.output_text.delta', delta: 'partial' }],
    [{ type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } }],
    [{ type: 'response.incomplete' }], [{ type: 'error' }],
    [{ type: 'response.completed', response: { status: 'failed' } }],
    [completed, { type: 'response.failed' }]]) {
    await assert.rejects(textRequest('oauth-fixture', 'model', async () => eventResponse(events)), Stop);
  }
  await assert.rejects(textRequest('oauth-fixture', 'model', async () =>
    new Response('data: {', { headers: { 'content-type': 'text/event-stream' } })), /truncated/);
});

test('HTTP errors are classified without leaking body, no retry and no endpoint fallback', async () => {
  for (const body of [{ detail: 'sensitive@example.invalid' },
    { error: { code: 'subscription_sharing_user_not_eligible', message: 'private' } }]) {
    let calls = 0;
    await assert.rejects(request(`${RESOURCE}/responses`, {}, async () => {
      calls++; return Response.json(body, { status: 403 });
    }), error => error.httpStatus === 403 && !JSON.stringify(error).includes('private') &&
      !JSON.stringify(error).includes('@'));
    assert.equal(calls, 1);
  }
  await assert.rejects(request('https://chatgpt.com/backend-api/anything'), /unsupported_endpoint/);
  await assert.rejects(request(TOKEN, {}, async () => { throw new Error('secret'); }), /transport_or_timeout/);
});

test('Codex provider matches documented public Responses route and initialize app attribution', () => {
  const args = providerArgs();
  assert.deepEqual(args.slice(0, 3), ['app-server', '--listen', 'stdio://']);
  for (const config of ['model_provider="openai_chatgpt_plan"',
    `model_providers.openai_chatgpt_plan.base_url="${RESOURCE}"`,
    'model_providers.openai_chatgpt_plan.env_key="ACCESS_TOKEN"',
    'model_providers.openai_chatgpt_plan.requires_openai_auth=false',
    'model_providers.openai_chatgpt_plan.supports_websockets=false']) assert.ok(args.includes(config));
  assert.equal(initializeMessage().params.clientInfo.name, APP_NAME);
  assert.equal(args.some(a => a.includes('oauth-fixture')), false);
});
