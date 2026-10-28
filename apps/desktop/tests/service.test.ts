import { describe, expect, it, vi } from 'vitest';
import { DesktopService } from '../src/main/service';
import { offlineProvider } from '../src/main/offline';
import type { ProviderPort } from '../src/main/ports';
import { startSchema, streamEventSchema, type StreamEvent } from '../src/shared/contracts';
import { demoReducer, initialState } from '../src/renderer/model';

const first = '92cf0535-d871-4fde-a953-c9bf91a7a7fa';
const second = 'a8379d74-6d12-422f-8562-1ce41bb96de5';
const command = (id = first) => ({ type: 'startOfflineDemo', input: { requestId: id, prompt: 'test locale' } });

describe('validated offline service', () => {
  it('rejects extra fields, oversized input and arbitrary operations', () => {
    const service = new DesktopService(offlineProvider, vi.fn());
    for (const input of [null, { type: 'shell', command: 'whoami' }, { type: 'status', token: 'not-a-secret' },
      { ...command(), input: { requestId: first, prompt: 'x'.repeat(2001) } }]) {
      expect(service.handle(input)).toEqual({ ok: false, code: 'invalid-request' });
    }
    expect(startSchema.safeParse({ requestId: first, prompt: '  ' }).success).toBe(false);
    expect(streamEventSchema.safeParse({ type: 'responseCompleted', requestId: first, token: 'fixture' }).success).toBe(false);
  });

  it('streams the explicit offline fixture in order and completes once', async () => {
    const events: StreamEvent[] = [];
    const service = new DesktopService(offlineProvider, event => events.push(event));
    expect(service.handle(command())).toEqual({ ok: true });
    expect(service.handle(command(second))).toEqual({ ok: false, code: 'busy' });
    await vi.waitFor(() => expect(events.at(-1)?.type).toBe('responseCompleted'), { timeout: 2500 });
    expect(events.map(event => event.type)).toEqual(['responseStarted', 'textDelta', 'textDelta', 'textDelta', 'responseCompleted']);
    expect(events[0]).toMatchObject({ source: 'offline-demo' });
    expect(events.filter(event => event.type === 'textDelta').map(event => event.text).join('')).toContain('testo è predefinito');
  });

  it('cancels, ignores a late producer, and starts another request', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const provider: ProviderPort = { mode: 'offline-demo', async *stream() { await gate; yield { type: 'delta', text: 'late' }; yield { type: 'completed' }; } };
    const events: StreamEvent[] = [];
    const service = new DesktopService(provider, event => events.push(event));
    service.handle(command());
    expect(service.handle({ type: 'cancel', input: { requestId: second } })).toEqual({ ok: false, code: 'not-active' });
    service.handle({ type: 'cancel', input: { requestId: first } });
    expect(service.handle(command(second))).toEqual({ ok: true });
    release();
    await vi.waitFor(() => expect(events.at(-1)?.type).toBe('responseCompleted'));
    expect(events.filter(event => event.requestId === first).map(event => event.type)).toEqual(['responseStarted', 'responseCancelled']);
    expect(events.at(-1)?.requestId).toBe(second);
  });

  it.each(['incomplete', 'throws', 'oversized'] as const)('fails closed for %s streams without exposing raw errors', async scenario => {
    const events: StreamEvent[] = [];
    const provider: ProviderPort = { mode: 'offline-demo', async *stream() {
      if (scenario === 'throws') throw new Error('private diagnostic fixture');
      if (scenario === 'oversized') for (let i = 0; i < 5; i++) yield { type: 'delta', text: 'x'.repeat(4096) };
    } };
    const service = new DesktopService(provider, event => events.push(event));
    service.handle(command());
    await vi.waitFor(() => expect(events.at(-1)?.type).toBe('responseFailed'));
    expect(events.at(-1)).toEqual({ type: 'responseFailed', requestId: first, code: 'unavailable' });
  });

  it('stop on teardown aborts the producer', async () => {
    let signal: AbortSignal | undefined;
    const provider: ProviderPort = { mode: 'offline-demo', stream(input, current) {
      signal = current;
      return offlineProvider.stream(input, current);
    } };
    const send = vi.fn();
    const service = new DesktopService(provider, send);
    service.handle(command());
    service.stop();
    expect(signal?.aborted).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(send.mock.calls.map(call => call[0].type)).toEqual(['responseStarted', 'responseCancelled']);
  });

  it('refuses a live provider in this slice', () => {
    expect(() => new DesktopService({ ...offlineProvider, mode: 'official' }, vi.fn())).toThrow('Only offline');
  });
});

it('renderer ignores events from old requests and terminal streams', () => {
  const running = demoReducer(initialState, { type: 'begin', requestId: first });
  expect(demoReducer(running, { type: 'textDelta', requestId: second, text: 'stale' })).toBe(running);
  const cancelled = demoReducer(running, { type: 'responseCancelled', requestId: first });
  expect(demoReducer(cancelled, { type: 'textDelta', requestId: first, text: 'late' })).toBe(cancelled);
  expect(demoReducer(cancelled, { type: 'responseCompleted', requestId: first })).toBe(cancelled);
});
