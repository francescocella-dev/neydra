import { authorizationUrl, exchange, models, textStream, type Message, type Session, Stop } from './protocol.mjs';
import { listen, type Listener } from './loopback.mjs';
import type { RegistrationStore } from './registration';
import type { Connection, ConnectDiagnostic, RealRequest } from '../../shared/contracts';
import type { ProviderChunk } from '../ports';


// Only fixed reviewed codes cross IPC, not upstream error messages or secrets.
const safeCodes = new Set<ConnectDiagnostic['code']>([
  'invalid_grant', 'invalid_client', 'identity_verification_failed',
  'plan_permission_missing', 'account_changed', 'invalid_token_response',
  'invalid_issued_client', 'invalid_state', 'consent_denied', 'consent_timeout',
  'cancelled', 'transport_or_timeout', 'http_rejected', 'unexpected_model_catalog',
  'missing_json_body', 'oversized_json', 'invalid_host_identifier',
  'loopback_unavailable', 'no_authorized_models',
  'subscription_sharing_user_not_eligible', 'subscription_sharing_usage_limit_exceeded',
  'subscription_sharing_usage_unavailable', 'chatpass_v2_scope_not_authorized',
  'chatpass_v2_invalid_authorization_context',
]);
function sanitizedDiagnostic(phase: ConnectDiagnostic['phase'], error: unknown, aborted: boolean): ConnectDiagnostic {
  const code: ConnectDiagnostic['code'] = aborted ? 'cancelled'
    : error instanceof Stop && safeCodes.has(error.code as ConnectDiagnostic['code'])
      ? error.code as ConnectDiagnostic['code'] : 'local_error';
  const status = error instanceof Stop ? error.httpStatus : null;
  return { phase, code,
    ...(typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599
      ? { httpStatus: status } : {}) };
}

export interface ChatGPTPort {
  state(): Connection;
  connect(signal: AbortSignal): Promise<void>;
  disconnect(): void;
  stream(input: RealRequest, signal: AbortSignal): AsyncIterable<ProviderChunk>;
  reset(): void;
}
export class ChatGPTAdapter implements ChatGPTPort {
  private session?: Session;
  private catalog: Connection['models'] = [];
  private history: Message[] = [];
  private connecting = false;
  private diagnostic?: ConnectDiagnostic;
  constructor(private readonly store: RegistrationStore, private readonly openBrowser: (url: string) => Promise<void>,
    private readonly fetchImpl: typeof fetch = fetch, private readonly listener: typeof listen = listen) {}

  state(): Connection {
    if (this.session && Date.now() >= this.session.expiresAt - 5000) this.disconnect();
    return { state: this.connecting ? 'connecting' : this.session ? 'connected' : 'disconnected',
      models: this.catalog.map(model => ({ ...model })),
      ...(this.diagnostic ? { diagnostic: { ...this.diagnostic } } : {}) };
  }
  async connect(signal: AbortSignal) {
    this.disconnect();
    this.connecting = true;
    let phase: ConnectDiagnostic['phase'] = 'registration-load';
    let server: Listener | undefined;
    const cancel = () => server?.close();
    try {
      const registration = await this.store.load();
      signal.throwIfAborted();
      phase = 'listener';
      server = await this.listener(registration.hostId, registration.clientId);
      signal.addEventListener('abort', cancel, { once: true });
      signal.throwIfAborted();
      phase = 'browser';
      // URL is generated entirely in main and is never returned over IPC.
      await this.openBrowser(authorizationUrl(server.tx));
      phase = 'callback';
      const result = await server.result;
      signal.throwIfAborted();
      if (result.error) throw result.error;
      phase = 'client-save';
      registration.clientId = result.callback.clientId;
      await this.store.save(registration); // Preserve issued client even if exchange fails.
      phase = 'token-exchange';
      const session = await exchange(server.tx, result.callback, registration.subject, this.fetchImpl, signal);
      signal.throwIfAborted();
      phase = 'account-save';
      registration.subject = session.identity.subject;
      await this.store.save(registration);
      phase = 'model-catalog';
      const listed = await models(session.accessToken, this.fetchImpl, signal);
      const catalog = [...new Map(listed.map(model => [model.slug, model])).values()];
      signal.throwIfAborted();
      if (!catalog.length) throw new Stop('no_authorized_models');
      this.catalog = catalog;
      this.session = session;
      this.diagnostic = undefined;
    } catch (error) {
      this.diagnostic = sanitizedDiagnostic(phase, error, signal.aborted);
      throw error;
    } finally {
      this.connecting = false;
      signal.removeEventListener('abort', cancel);
      server?.close();
    }
  }
  disconnect() { this.session = undefined; this.catalog = []; this.reset(); this.diagnostic = undefined; }
  reset() { this.history = []; }
  async *stream(input: RealRequest, signal: AbortSignal) {
    if (this.state().state !== 'connected' || !this.session || !this.catalog.some(model => model.slug === input.model)) throw new Error('Connection unavailable');
    const user: Message = { role: 'user', content: input.prompt };
    const messages = [...this.history, user];
    if (messages.length > 20 || messages.reduce((sum, message) => sum + message.content.length, 0) > 32000)
      throw new Error('Conversation limit');
    let text = '';
    try {
      for await (const chunk of textStream(this.session.accessToken, { model: input.model, messages }, signal, this.fetchImpl)) {
        signal.throwIfAborted();
        if (chunk.type === 'delta') text += chunk.text;
        else this.history = [...messages, { role: 'assistant', content: text }];
        yield chunk;
      }
    } catch (error) {
      if (error instanceof Stop && error.httpStatus === 401) this.disconnect();
      throw error;
    }
  }
}
