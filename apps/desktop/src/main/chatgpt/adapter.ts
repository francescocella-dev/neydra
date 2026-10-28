import { authorizationUrl, exchange, models, textStream, type Message, type Session, Stop } from './protocol.mjs';
import { listen, type Listener } from './loopback.mjs';
import type { RegistrationStore } from './registration';
import type { Connection, RealRequest } from '../../shared/contracts';
import type { ProviderChunk } from '../ports';

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
  constructor(private readonly store: RegistrationStore, private readonly openBrowser: (url: string) => Promise<void>,
    private readonly fetchImpl: typeof fetch = fetch, private readonly listener: typeof listen = listen) {}

  state(): Connection {
    if (this.session && Date.now() >= this.session.expiresAt - 5000) this.disconnect();
    return { state: this.connecting ? 'connecting' : this.session ? 'connected' : 'disconnected', models: this.catalog.map(model => ({ ...model })) };
  }
  async connect(signal: AbortSignal) {
    this.disconnect();
    this.connecting = true;
    let server: Listener | undefined;
    const cancel = () => server?.close();
    try {
      const registration = await this.store.load();
      signal.throwIfAborted();
      server = await this.listener(registration.hostId, registration.clientId);
      signal.addEventListener('abort', cancel, { once: true });
      signal.throwIfAborted();
      // URL is generated entirely in main and is never returned over IPC.
      await this.openBrowser(authorizationUrl(server.tx));
      const result = await server.result;
      signal.throwIfAborted();
      if (result.error) throw result.error;
      registration.clientId = result.callback.clientId;
      await this.store.save(registration); // Preserve issued client even if exchange fails.
      const session = await exchange(server.tx, result.callback, registration.subject, this.fetchImpl, signal);
      signal.throwIfAborted();
      registration.subject = session.identity.subject;
      await this.store.save(registration);
      const listed = await models(session.accessToken, this.fetchImpl, signal);
      const catalog = [...new Map(listed.map(model => [model.slug, model])).values()];
      signal.throwIfAborted();
      if (!catalog.length) throw new Error('No authorized models');
      this.catalog = catalog;
      this.session = session;
    } finally {
      this.connecting = false;
      signal.removeEventListener('abort', cancel);
      server?.close();
    }
  }
  disconnect() { this.session = undefined; this.catalog = []; this.reset(); }
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
