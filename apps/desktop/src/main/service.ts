import { PROTOCOL_VERSION, commandSchema, streamEventSchema, type DesktopStatus, type StreamEvent } from '../shared/contracts';
import { Stop } from './chatgpt/protocol.mjs';
import type { ChatGPTPort } from './chatgpt/adapter';
import type { ProviderPort } from './ports';

export const desktopStatus: DesktopStatus = {
  protocolVersion: PROTOCOL_VERSION, mode: 'offline', auth: 'available-in-main',
  provider: 'offline-demo', avatar: 'not-integrated', voice: 'not-integrated',
};

export class DesktopService {
  private authAttempt?: AbortController;
  private usedIds = new Set<string>();
  private active?: { id: string; controller: AbortController };
  constructor(private readonly provider: ProviderPort, private readonly send: (event: StreamEvent) => void, private readonly chatgpt?: ChatGPTPort) {
    if (provider.mode !== 'offline-demo') throw new Error('Only offline demo is enabled');
  }

  handle(raw: unknown) {
    const parsed = commandSchema.safeParse(raw);
    if (!parsed.success) return { ok: false as const, code: 'invalid-request' as const };
    const command = parsed.data;
    if (command.type === 'status') return { ok: true as const, status: desktopStatus };
    if (command.type === 'connection') return { ok: true as const, connection: this.chatgpt?.state() ?? { state: 'disconnected' as const, models: [] } };
    if (command.type === 'cancelConnect' || command.type === 'disconnectChatGPT') {
      this.authAttempt?.abort();
      if (command.type === 'disconnectChatGPT') { this.stop(); this.chatgpt?.disconnect(); }
      return { ok: true as const };
    }
    if (command.type === 'connectChatGPT') {
      if (this.active || this.authAttempt) return { ok: false as const, code: 'busy' as const };
      if (!this.chatgpt) return { ok: false as const, code: 'unavailable' as const };
      const attempt = new AbortController();
      this.authAttempt = attempt;
      return this.chatgpt.connect(attempt.signal).then(() => ({ ok: true as const }), () => ({ ok: false as const, code: 'unavailable' as const }))
        .finally(() => { if (this.authAttempt === attempt) this.authAttempt = undefined; });
    }
    if (command.type === 'resetChat') {
      if (this.active || this.authAttempt) return { ok: false as const, code: 'busy' as const };
      this.chatgpt?.reset();
      return { ok: true as const };
    }
    if (command.type === 'cancel') {
      if (this.active?.id !== command.input.requestId) return { ok: false as const, code: 'not-active' as const };
      this.stop();
      return { ok: true as const };
    }
    if (this.active || this.authAttempt) return { ok: false as const, code: 'busy' as const };
    const official = command.type === 'startChatGPT';
    if (official && (!this.chatgpt || this.chatgpt.state().state !== 'connected')) return { ok: false as const, code: 'auth-required' as const };
    if (official && !this.chatgpt!.state().models.some(model => model.slug === command.input.model)) return { ok: false as const, code: 'invalid-request' as const };
    if (this.usedIds.has(command.input.requestId) || this.usedIds.size >= 1000) return { ok: false as const, code: 'replayed' as const };
    this.usedIds.add(command.input.requestId);
    const run = { id: command.input.requestId, controller: new AbortController() };
    this.active = run;
    this.emit({ type: 'responseStarted', requestId: run.id, source: official ? 'chatgpt-plan' : 'offline-demo' });
    void this.consume(() => official ? this.chatgpt!.stream(command.input, run.controller.signal) : this.provider.stream(command.input, run.controller.signal), run);
    return { ok: true as const };
  }

  private emit(event: StreamEvent) { this.send(streamEventSchema.parse(event)); }

  private async consume(createStream: () => ReturnType<ProviderPort['stream']>, run: NonNullable<DesktopService['active']>) {
    let length = 0;
    try {
      for await (const chunk of createStream()) {
        if (this.active !== run) return;
        if (chunk.type === 'completed') {
          this.active = undefined;
          this.emit({ type: 'responseCompleted', requestId: run.id, ...(chunk.missingMimeStreamValidated === undefined ? {} : { missingMimeStreamValidated: chunk.missingMimeStreamValidated }) });
          return;
        }
        length += chunk.text.length;
        if (length > 16_384) throw new Error('Output limit');
        this.emit({ type: 'textDelta', requestId: run.id, text: chunk.text });
      }
      if (this.active === run) throw new Error('Missing terminal event');
    } catch (error) {
      if (this.active === run) {
        this.active = undefined;
        run.controller.abort();
        this.emit({ type: 'responseFailed', requestId: run.id, code: error instanceof Stop && (error.httpStatus === 429 || ['subscription_sharing_usage_limit_exceeded', 'subscription_sharing_usage_unavailable'].includes(error.code)) ? 'quota' : error instanceof Stop && error.httpStatus === 401 ? 'auth-required' : 'unavailable' });
      }
    }
  }

  dispose() { this.authAttempt?.abort(); this.stop(); this.chatgpt?.disconnect(); }

  stop() {
    const run = this.active;
    this.active = undefined;
    if (run) {
      run.controller.abort();
      this.emit({ type: 'responseCancelled', requestId: run.id });
    }
  }
}
