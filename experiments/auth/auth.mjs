import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from 'node:crypto';

export const ISSUER = 'https://auth.openai.com';
export const RESOURCE = 'https://api.openai.com/v1';
export const AUTHORIZE = `${ISSUER}/api/accounts/authorize`;
export const TOKEN = `${ISSUER}/api/accounts/oauth/token`;
export const JWKS = `${ISSUER}/.well-known/jwks.json`;
export const APP_NAME = 'neydra';
export const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const random = () => randomBytes(32).toString('base64url');

export class Stop extends Error {
  constructor(code, httpStatus = null) {
    super(code);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function transaction(redirectUri, hostId, clientId = null) {
  const redirect = new URL(redirectUri);
  if (redirect.protocol !== 'http:' || redirect.hostname !== '127.0.0.1' ||
      redirect.pathname !== '/auth/callback' || redirect.search || redirect.hash ||
      redirect.username || redirect.password) throw new Stop('invalid_loopback');
  return { redirectUri, hostId, clientId, state: random(), nonce: random(), verifier: random(),
    expiresAt: Date.now() + 180_000, consumed: false };
}

export function authorizationUrl(tx) {
  const params = new URLSearchParams({
    client_id: tx.clientId ?? 'dynamic_agent_client',
    ext_agent_host_id: tx.hostId, response_type: 'code', redirect_uri: tx.redirectUri,
    scope: SCOPES, resource: RESOURCE, state: tx.state, nonce: tx.nonce,
    code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(tx.verifier).digest('base64url'),
  });
  if (!tx.clientId) params.set('agent_name_hint', APP_NAME);
  return `${AUTHORIZE}?${params}`;
}

export function consumeCallback(tx, url) {
  if (tx.consumed || Date.now() >= tx.expiresAt) throw new Stop('expired_or_replayed_callback');
  // Every callback ends this attempt, including errors. No code is ever retried.
  tx.consumed = true;
  const expected = new URL(tx.redirectUri);
  if (url.origin !== expected.origin || url.pathname !== expected.pathname)
    throw new Stop('invalid_loopback');
  for (const key of ['state', 'code', 'client_id', 'error']) {
    if (url.searchParams.getAll(key).length > 1) throw new Stop('duplicate_callback_parameter');
  }
  const state = Buffer.from(url.searchParams.get('state') ?? '');
  const original = Buffer.from(tx.state);
  if (state.length !== original.length || !timingSafeEqual(state, original))
    throw new Stop('invalid_state');
  if (url.searchParams.has('error')) throw new Stop('consent_denied');
  const clientId = url.searchParams.get('client_id') ?? tx.clientId;
  if (!clientId || clientId === 'dynamic_agent_client' ||
      (tx.clientId && tx.clientId !== clientId)) throw new Stop('invalid_issued_client');
  const code = url.searchParams.get('code');
  if (!code) throw new Stop('missing_code');
  return { clientId, code };
}

// No caller-supplied URLs, API-key fallback, redirects, retries or raw error logging.
export async function request(url, options = {}, fetchImpl = fetch) {
  if (![TOKEN, JWKS, `${RESOURCE}/models`, `${RESOURCE}/responses`].includes(url))
    throw new Stop('unsupported_endpoint');
  try {
    const response = await fetchImpl(url, {
      ...options, redirect: 'error', signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      let body;
      try { body = await response.json(); } catch { /* Non-JSON error, never print it. */ }
      const known = new Set(['invalid_grant', 'invalid_client',
        'subscription_sharing_user_not_eligible', 'subscription_sharing_usage_limit_exceeded',
        'subscription_sharing_usage_unavailable', 'subscription_sharing_unsupported_capability',
        'subscription_sharing_route_not_supported', 'subscription_sharing_invalid_user',
        'subscription_sharing_user_unavailable', 'chatpass_v2_scope_not_authorized',
        'chatpass_v2_invalid_authorization_context']);
      const code = typeof body?.error === 'string' ? body.error : body?.error?.code;
      const error = new Stop(known.has(code) ? code : 'http_rejected', response.status);
      error.bodyShape = body?.detail !== undefined ? 'detail' : body?.error !== undefined ? 'error' : 'other';
      throw error;
    }
    return response;
  } catch (error) {
    if (error instanceof Stop) throw error;
    throw new Stop('transport_or_timeout');
  }
}

// Deliberately narrow RS256 verifier using Node's maintained cryptographic primitives.
// Other signing algorithms fail closed. This is an experiment, not a general OIDC SDK.
export function verifyIdentity(jwt, keys, clientId, nonce, now = Math.floor(Date.now() / 1000)) {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3 || parts.some(p => !/^[A-Za-z0-9_-]+$/.test(p))) throw new Error();
    const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.crit) throw new Error();
    const candidates = keys.filter(k => k.kid === header.kid && k.kty === 'RSA' &&
      (!k.alg || k.alg === 'RS256') && (!k.use || k.use === 'sig') &&
      (!k.key_ops || k.key_ops.includes('verify')));
    if (candidates.length !== 1) throw new Error();
    const key = createPublicKey({ key: candidates[0], format: 'jwk' });
    if (!verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key,
      Buffer.from(parts[2], 'base64url'))) throw new Error();
    const p = JSON.parse(Buffer.from(parts[1], 'base64url'));
    const audiences = Array.isArray(p.aud) ? p.aud : [p.aud];
    if (p.iss !== ISSUER || !audiences.includes(clientId) || p.nonce !== nonce ||
        typeof p.sub !== 'string' || !p.sub || !Number.isFinite(p.exp) || p.exp <= now ||
        !Number.isFinite(p.iat) || p.iat > now + 5 ||
        (p.nbf !== undefined && (!Number.isFinite(p.nbf) || p.nbf > now + 5)) ||
        ((audiences.length > 1 || p.azp !== undefined) && p.azp !== clientId)) throw new Error();
    return { issuer: p.iss, subject: p.sub };
  } catch { throw new Stop('identity_verification_failed'); }
}

export async function exchange(tx, callback, previousSubject = null, fetchImpl = fetch) {
  const response = await request(TOKEN, { method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: callback.clientId,
      code: callback.code, code_verifier: tx.verifier, redirect_uri: tx.redirectUri, resource: RESOURCE }),
  }, fetchImpl);
  const tokens = await response.json();
  const jwks = await (await request(JWKS, {}, fetchImpl)).json();
  const identity = verifyIdentity(tokens.id_token, jwks.keys, callback.clientId, tx.nonce);
  if (previousSubject && identity.subject !== previousSubject) throw new Stop('account_changed');
  const scopes = typeof tokens.scope === 'string' ? tokens.scope.split(/\s+/) : [];
  if (!['resource.invoke', 'chatgpt.tokens.use.direct'].every(s => scopes.includes(s)))
    throw new Stop('plan_permission_missing');
  if (tokens.token_type?.toLowerCase() !== 'bearer' || typeof tokens.access_token !== 'string' ||
      !tokens.access_token || tokens.access_token.startsWith('sk-') ||
      !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0)
    throw new Stop('invalid_token_response');
  // Refresh and ID tokens are not retained: this one-shot probe requires fresh OAuth next run.
  return { accessToken: tokens.access_token, identity };
}

export async function models(accessToken, fetchImpl = fetch) {
  const response = await request(`${RESOURCE}/models`, {
    headers: { authorization: `Bearer ${accessToken}` },
  }, fetchImpl);
  const body = await response.json();
  if (!Array.isArray(body.models)) throw new Stop('unexpected_model_catalog');
  return body.models.filter(m => m.visibility === 'list' &&
    typeof m.slug === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(m.slug)).map(m => m.slug);
}

export async function* sse(body) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    if (buffer.length > 2_000_000) throw new Stop('oversized_stream_event');
    while (true) {
      const match = /\r?\n\r?\n/.exec(buffer);
      if (!match) break;
      const frame = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      const data = frame.split(/\r?\n/).filter(l => l.startsWith('data:'))
        .map(l => l.slice(5).trimStart()).join('\n');
      if (data && data !== '[DONE]') {
        try { yield JSON.parse(data); } catch (e) {
          if (e instanceof SyntaxError) throw new Stop('invalid_stream_json');
          throw e;
        }
      }
    }
  }
  if (buffer.trim()) throw new Stop('truncated_stream_frame');
}

export const TEST_PROMPT = 'Rispondi esattamente: NEYDRA_AUTH_OK';
export async function textRequest(accessToken, model, fetchImpl = fetch) {
  const response = await request(`${RESOURCE}/responses`, {
    method: 'POST', headers: { authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({ model, input: [{ role: 'user', content: TEST_PROMPT }],
      store: false, stream: true }),
  }, fetchImpl);
  if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body)
    throw new Stop('expected_event_stream');
  let completed = false;
  let text = '';
  try {
    for await (const event of sse(response.body)) {
      if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
        text += event.delta;
        if (text.length > 16_384) throw new Stop('unexpected_output_size');
      }
      if (['response.failed', 'response.incomplete', 'error'].includes(event.type)) {
        const code = event.response?.error?.code ?? event.error?.code ?? event.code;
        const known = ['subscription_sharing_usage_limit_exceeded', 'subscription_sharing_usage_unavailable'];
        throw new Stop(known.includes(code) ? code : 'inference_failed_or_incomplete');
      }
      if (event.type === 'response.completed') {
        if (event.response?.status !== 'completed') throw new Stop('inference_failed_or_incomplete');
        completed = true;
      }
    }
  } catch (error) {
    if (error instanceof Stop) throw error;
    throw new Stop('interrupted_stream');
  }
  if (!completed) throw new Stop('stream_without_completion');
  // Never write arbitrary generated content to stdout/evidence.
  return { completed: true, expectedText: text.trim() === 'NEYDRA_AUTH_OK' };
}
