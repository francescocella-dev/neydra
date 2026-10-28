// Adapted from PR #6, 4cd91e9 (MIT). Main process only; no live calls at import.
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

// Return only bounded metadata. Never consume a body or enumerate arbitrary headers.
export function responseMetadata(response) {
  const mediaType = (response.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
  let contentTypeCategory = 'other';
  if (!mediaType) contentTypeCategory = 'missing';
  else if (mediaType === 'text/event-stream') contentTypeCategory = 'sse';
  else if (mediaType === 'application/json' || /^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(mediaType))
    contentTypeCategory = 'json';
  else if (['text/html', 'application/xhtml+xml'].includes(mediaType)) contentTypeCategory = 'html';
  const requestId = response.headers.get('x-request-id');
  return {
    httpStatus: response.status,
    contentTypeCategory,
    hasBodyStream: typeof response.body?.getReader === 'function',
    // Conservative local privacy policy, not a claim about all possible OpenAI ID formats.
    // Drop unfamiliar, oversized or malformed IDs whole; never truncate a potential secret.
    requestId: typeof requestId === 'string' && requestId.length === 36 &&
      /^req_[a-f0-9]{32}$/i.test(requestId) ? requestId : null,
  };
}

export function failureEvidence(error) {
  const stop = error instanceof Stop ? error : null;
  return { status: 'BLOCKED', reason: stop?.code ?? 'local_or_protocol_error',
    httpStatus: stop?.httpStatus ?? null, bodyShape: stop?.bodyShape ?? null,
    contentTypeCategory: stop?.contentTypeCategory ?? null,
    hasBodyStream: stop?.hasBodyStream ?? null, requestId: stop?.requestId ?? null };
}

export function transaction(redirectUri, hostId, clientId = null) {
  const redirect = new URL(redirectUri);
  if (redirect.protocol !== 'http:' || redirect.hostname !== '127.0.0.1' ||
      redirect.pathname !== '/auth/callback' || redirect.search || redirect.hash ||
      redirect.username || redirect.password) throw new Stop('invalid_loopback');
  // SIWC requires a host identifier in a documented URI format, not a bare UUID.
  // Refuse malformed IDs locally before launching the user's system browser.
  if (typeof hostId !== 'string' ||
      !/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(hostId))
    throw new Stop('invalid_host_identifier');
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
  if (!clientId || clientId.length > 512 || clientId === 'dynamic_agent_client' ||
      (tx.clientId && tx.clientId !== clientId)) throw new Stop('invalid_issued_client');
  const code = url.searchParams.get('code');
  if (!code || code.length > 4096) throw new Stop('missing_code');
  return { clientId, code };
}

// Bound control-plane JSON and error bodies as well as streamed inference.
export async function boundedJson(response, limit = 262144) {
  if (!response.body) throw new Stop('missing_json_body');
  const reader = response.body.getReader();
  let bytes = 0;
  let text = '';
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new Stop('oversized_json');
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

// No caller-supplied URLs, API-key fallback, redirects, retries or raw error logging.
export async function request(url, options = {}, fetchImpl = fetch) {
  if (![TOKEN, JWKS, `${RESOURCE}/models`, `${RESOURCE}/responses`].includes(url))
    throw new Stop('unsupported_endpoint');
  options.signal?.throwIfAborted();
  try {
    const response = await fetchImpl(url, {
      ...options, redirect: 'error', signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      const metadata = responseMetadata(response);
      let body;
      try { body = await boundedJson(response); } catch { /* Non-JSON error, never print it. */ }
      const known = new Set(['invalid_grant', 'invalid_client',
        'subscription_sharing_user_not_eligible', 'subscription_sharing_usage_limit_exceeded',
        'subscription_sharing_usage_unavailable', 'subscription_sharing_unsupported_capability',
        'subscription_sharing_route_not_supported', 'subscription_sharing_invalid_user',
        'subscription_sharing_user_unavailable', 'chatpass_v2_scope_not_authorized',
        'chatpass_v2_invalid_authorization_context']);
      const code = typeof body?.error === 'string' ? body.error : body?.error?.code;
      const error = new Stop(known.has(code) ? code : 'http_rejected', response.status);
      Object.assign(error, metadata);
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
    if (typeof jwt !== 'string' || jwt.length > 32768) throw new Error();
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

export async function exchange(tx, callback, previousSubject = null, fetchImpl = fetch, signal = undefined) {
  const startedAt = Date.now();
  const response = await request(TOKEN, { method: 'POST', signal,
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: callback.clientId,
      code: callback.code, code_verifier: tx.verifier, redirect_uri: tx.redirectUri, resource: RESOURCE }),
  }, fetchImpl);
  const tokens = await boundedJson(response);
  const jwks = await boundedJson(await request(JWKS, { signal }, fetchImpl));
  const identity = verifyIdentity(tokens.id_token, jwks.keys, callback.clientId, tx.nonce);
  if (previousSubject && identity.subject !== previousSubject) throw new Stop('account_changed');
  const scopes = typeof tokens.scope === 'string' ? tokens.scope.split(/\s+/) : [];
  if (!['resource.invoke', 'chatgpt.tokens.use.direct'].every(s => scopes.includes(s)))
    throw new Stop('plan_permission_missing');
  if (tokens.token_type?.toLowerCase() !== 'bearer' || typeof tokens.access_token !== 'string' ||
      !tokens.access_token || tokens.access_token.startsWith('sk-') ||
      !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0 || tokens.expires_in > 86400)
    throw new Stop('invalid_token_response');
  // Refresh and ID tokens are not retained: this memory-only session requires fresh OAuth after expiry or restart.
  return { accessToken: tokens.access_token, identity, expiresAt: startedAt + tokens.expires_in * 1000 };
}

export async function models(accessToken, fetchImpl = fetch, signal = undefined) {
  const response = await request(`${RESOURCE}/models`, { signal,
    headers: { authorization: `Bearer ${accessToken}` },
  }, fetchImpl);
  const body = await boundedJson(response);
  if (!Array.isArray(body.models) || body.models.length > 512) throw new Stop('unexpected_model_catalog');
  return body.models.filter(m => m.visibility === 'list' &&
    typeof m.slug === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(m.slug)).map(m => ({ slug: m.slug, name: typeof m.display_name === 'string' && m.display_name.trim() && m.display_name.length <= 128 ? m.display_name : m.slug }));
}

// The adapter applies strict framing to both SSE and HTTP 200 without MIME.
// It never issues a second request or accepts arbitrary JSON/HTML as a stream.
export async function* sse(body, { strictMissingMime = false } = {}) {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '';
  let cumulativeBytes = 0;
  let frames = 0;
  for await (const chunk of body) {
    if (!(chunk instanceof Uint8Array)) throw new Stop('unexpected_stream_chunk');
    cumulativeBytes += chunk.byteLength;
    if (cumulativeBytes > 262_144) throw new Stop('missing_mime_stream_too_large');
    buffer += decoder.decode(chunk, { stream: true });
    if (buffer.length > 65_536)
      throw new Stop('oversized_stream_event');
    while (true) {
      const match = /\r?\n\r?\n/.exec(buffer);
      if (!match) break;
      const frame = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      if (++frames > 512) throw new Stop('missing_mime_event_limit');
      const dataLines = [];
      let declaredEvent = null;
      for (const line of frame.split(/\r?\n/)) {
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
        else if (strictMissingMime && line.startsWith('event:')) {
          if (declaredEvent !== null) throw new Stop('missing_mime_duplicate_event');
          declaredEvent = line.slice(6).trimStart();
        } else if (strictMissingMime && !(line === '' || line.startsWith(':') || line.startsWith('id:')))
          throw new Stop('missing_mime_not_sse');
      }
      const data = dataLines.join('\n');
      if (strictMissingMime && !data) {
        if (declaredEvent !== null) throw new Stop('missing_mime_not_sse');
        continue;
      }
      if (data && data !== '[DONE]') {
        let event;
        try { event = JSON.parse(data); } catch {
          throw new Stop('invalid_stream_json');
        }
        if (strictMissingMime &&
          (!event || typeof event.type !== 'string' ||
            (declaredEvent !== null && declaredEvent !== event.type)))
          throw new Stop('missing_mime_not_sse');
        yield event;
      } else if (strictMissingMime && data === '[DONE]' && declaredEvent !== null) {
        throw new Stop('missing_mime_not_sse');
      }
    }
  }
  // A final UTF-8 decoder flush detects truncated trailing multibyte sequences.
  decoder.decode();
  if (buffer.trim()) throw new Stop('truncated_stream_frame');
}

// One POST; yield text progressively, but success only after checked EOF.
export async function* textStream(accessToken, input, signal, fetchImpl = fetch) {
  const response = await request(`${RESOURCE}/responses`, {
    method: 'POST', signal, headers: { authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({ model: input.model, input: input.messages,
      store: false, stream: true }),
  }, fetchImpl);
  const metadata = responseMetadata(response);
  let completed = false;
  let responseId;
  let length = 0;
  try {
    const missingMime = metadata.contentTypeCategory === 'missing' && response.status === 200;
    if ((!missingMime && metadata.contentTypeCategory !== 'sse') || !metadata.hasBodyStream)
      throw new Stop('expected_event_stream');
    for await (const event of sse(response.body, { strictMissingMime: true })) {
      signal.throwIfAborted();
      if (!event || typeof event.type !== 'string' ||
          !(event.type === 'error' || /^response\.[a-z][a-z_.]*$/.test(event.type)) || completed)
        throw new Stop('invalid_stream_order');
      if (!responseId) {
        if (event.type !== 'response.created' || event.response?.status !== 'in_progress' ||
            typeof event.response?.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(event.response.id))
          throw new Stop('missing_created');
        responseId = event.response.id;
      } else if (event.type === 'response.created') throw new Stop('duplicate_created');
      if (['response.failed', 'response.incomplete', 'error'].includes(event.type)) {
        const code = event.response?.error?.code ?? event.error?.code ?? event.code;
        throw new Stop(['subscription_sharing_usage_limit_exceeded', 'subscription_sharing_usage_unavailable'].includes(code) ? code : 'inference_failed_or_incomplete');
      }
      if (event.type === 'response.output_text.delta') {
        if (typeof event.delta !== 'string') throw new Stop('invalid_delta');
        length += event.delta.length;
        if (length > 16384) throw new Stop('unexpected_output_size');
        for (let i = 0; i < event.delta.length; i += 4096)
          yield { type: 'delta', text: event.delta.slice(i, i + 4096) };
      }
      if (event.type === 'response.completed') {
        if (event.response?.status !== 'completed' || event.response.id !== responseId)
          throw new Stop('invalid_completion');
        completed = true;
      }
    }
    signal.throwIfAborted();
    if (!completed) throw new Stop('stream_without_completion');
    yield { type: 'completed', missingMimeStreamValidated: missingMime };
  } finally {
    // A rejected MIME/body must also release the transport.
    if (!response.body?.locked) await response.body?.cancel().catch(() => {});
  }
}
