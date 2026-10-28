import { PROTOCOL_VERSION, commandSchema, streamEventSchema, type DesktopStatus, type StreamEvent } from '../shared/contracts';
import type { ProviderPort } from './ports';

export const desktopStatus: DesktopStatus = {
  protocolVersion: PROTOCOL_VERSION, mode: 'offline', auth: 'not-integrated',
  provider: 'offline-demo', avatar: 'not-integrated', voice: 'not-integrated',
};

export class DesktopService {
  private active?: { id: string; controller: AbortController };
  constructor(private readonly provider: ProviderPort, private readonly send: (event: StreamEvent) => void) {
    if (provider.mode !== 'offline-demo') throw new Error('Only offline demo is enabled');
  }

  handle(raw: unknown) {
    const parsed = commandSchema.safeParse(raw);
    if (!parsed.success) return { ok: false as const, code: 'invalid-request' as const };
    const command = parsed.data;
    if (command.type === 'status') return { ok: true as const, status: desktopStatus };
    if (command.type === 'cancel') {
      if (this.active?.id !== command.input.requestId) return { ok: false as const, code: 'not-active' as const };
      this.stop();
      return { ok: true as const };
    }
    if (this.active) return { ok: false as const, code: 'busy' as const };
    const run = { id: command.input.requestId, controller: new AbortController() };
    this.active = run;
    this.emit({ type: 'responseStarted', requestId: run.id, source: 'offline-demo' });
    void this.consume(command.input, run);
    return { ok: true as const };
  }

  private emit(event: StreamEvent) { this.send(streamEventSchema.parse(event)); }

  private async consume(input: { requestId: string; prompt: string }, run: NonNullable<DesktopService['active']>) {
    let length = 0;
    try {
      for await (const chunk of this.provider.stream(input, run.controller.signal)) {
        if (this.active !== run) return;
        if (chunk.type === 'completed') {
          this.active = undefined;
          this.emit({ type: 'responseCompleted', requestId: run.id });
          return;
        }
        length += chunk.text.length;
        if (length > 16_384) throw new Error('Output limit');
        this.emit({ type: 'textDelta', requestId: run.id, text: chunk.text });
      }
      if (this.active === run) throw new Error('Missing terminal event');
    } catch {
      if (this.active === run) {
        this.active = undefined;
        run.controller.abort();
        this.emit({ type: 'responseFailed', requestId: run.id, code: 'unavailable' });
      }
    }
  }

  stop() {
    const run = this.active;
    this.active = undefined;
    if (run) {
      run.controller.abort();
      this.emit({ type: 'responseCancelled', requestId: run.id });
    }
  }
}
