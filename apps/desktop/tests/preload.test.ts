import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { DesktopBridge } from '../src/shared/contracts';
import { CHANNELS } from '../src/shared/contracts';
import { desktopStatus } from '../src/main/service';

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(), invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn(),
}));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: { invoke: electron.invoke, on: electron.on, removeListener: electron.removeListener },
}));
let bridge: DesktopBridge;
let exposedName: string;
beforeAll(async () => {
  await import('../src/preload/index');
  bridge = electron.exposeInMainWorld.mock.calls[0]![1] as DesktopBridge;
  exposedName = electron.exposeInMainWorld.mock.calls[0]![0] as string;
});
beforeEach(() => {
  electron.invoke.mockReset(); electron.on.mockClear(); electron.removeListener.mockClear();
});

it('exposes only the named narrow frozen API, without raw IPC', () => {
  expect(exposedName).toBe('neydra');
  expect(Object.keys(bridge).sort()).toEqual(['cancel', 'cancelConnect', 'connectChatGPT', 'disconnectChatGPT', 'getConnection', 'getStatus', 'getWindowState', 'onEvent', 'onWindowState', 'resetChat', 'setFullscreen', 'startChatGPT', 'startOfflineDemo']);
  expect(Object.isFrozen(bridge)).toBe(true);
});

it('rejects invalid requests before invoking main', async () => {
  expect(await bridge.startOfflineDemo({ requestId: 'not-uuid', prompt: 'test' })).toEqual({ ok: false, code: 'invalid-request' });
  expect(await bridge.cancel({ requestId: 'not-uuid' })).toEqual({ ok: false, code: 'invalid-request' });
  expect(electron.invoke).not.toHaveBeenCalled();
});

it('validates outgoing status and rejects unexpected private fields', async () => {
  electron.invoke.mockResolvedValueOnce({ ok: true, status: desktopStatus });
  expect(await bridge.getStatus()).toEqual(desktopStatus);
  expect(electron.invoke).toHaveBeenLastCalledWith(CHANNELS.invoke, { type: 'status' });
  electron.invoke.mockResolvedValueOnce({ ok: true, status: { ...desktopStatus, token: 'synthetic-fixture' } });
  await expect(bridge.getStatus()).rejects.toThrow();
  electron.invoke.mockResolvedValueOnce({ ok: true, token: 'synthetic-fixture' });
  await expect(bridge.cancel({ requestId: '92cf0535-d871-4fde-a953-c9bf91a7a7fa' })).rejects.toThrow();
});

it('validates events and removes exactly its own wrapped listener', () => {
  const listener = vi.fn();
  const off = bridge.onEvent(listener);
  const [channel, handler] = electron.on.mock.calls[0]!;
  expect(channel).toBe(CHANNELS.event);
  const event = { type: 'responseCompleted', requestId: '92cf0535-d871-4fde-a953-c9bf91a7a7fa' };
  handler({ sender: 'private-ipc-object' }, { ...event, token: 'synthetic-fixture' });
  expect(listener).not.toHaveBeenCalled();
  handler({ sender: 'private-ipc-object' }, event);
  expect(listener).toHaveBeenCalledWith(event);
  off();
  expect(electron.removeListener).toHaveBeenCalledWith(CHANNELS.event, handler);
});

it('validates connection and real-request DTOs; OAuth URLs, credentials and headers never cross the bridge', async () => {
  const requestId = '92cf0535-d871-4fde-a953-c9bf91a7a7fa';
  expect(await bridge.startChatGPT({ requestId, prompt: 'fixture', model: 'visible', consent: 'wrong' } as never)).toMatchObject({ code: 'invalid-request' });
  expect(await bridge.connectChatGPT({ consent: 'system-browser', url: 'https://example.org' } as never)).toMatchObject({ code: 'invalid-request' });
  expect(electron.invoke).not.toHaveBeenCalled();
  electron.invoke.mockResolvedValueOnce({ ok: true, connection: { state: 'connected', models: [{ slug: 'visible', name: 'Visible' }] } });
  expect((await bridge.getConnection()).models[0]?.slug).toBe('visible');
  electron.invoke.mockResolvedValueOnce({ ok: true, connection: { state: 'connected', models: [], accessToken: 'synthetic' } });
  await expect(bridge.getConnection()).rejects.toThrow();
  electron.invoke.mockResolvedValueOnce({ ok: true });
  expect(await bridge.startChatGPT({ requestId, prompt: 'fixture', model: 'visible', consent: 'included-plan-checked' })).toEqual({ ok: true });
  expect(electron.invoke).toHaveBeenLastCalledWith(CHANNELS.invoke, { type: 'startChatGPT', input: { requestId, prompt: 'fixture', model: 'visible', consent: 'included-plan-checked' } });
});

it('validates the isolated fullscreen API and strips private event objects', async () => {
  const { WINDOW_CHANNELS } = await import('../src/shared/window-contracts');
  expect(await bridge.setFullscreen({ enabled: true, url: 'https://example.org' } as never)).toMatchObject({ code: 'invalid-request' });
  expect(electron.invoke).not.toHaveBeenCalled();
  electron.invoke.mockResolvedValueOnce({ ok: true, state: { fullscreen: true } });
  expect(await bridge.setFullscreen({ enabled: true })).toEqual({ ok: true, state: { fullscreen: true } });
  expect(electron.invoke).toHaveBeenLastCalledWith(WINDOW_CHANNELS.invoke, { type: 'setFullscreen', input: { enabled: true } });
  electron.invoke.mockResolvedValueOnce({ ok: true, state: { fullscreen: false, token: 'fixture' } });
  await expect(bridge.getWindowState()).rejects.toThrow();
  const listener = vi.fn();
  const off = bridge.onWindowState(listener);
  const [channel, handler] = electron.on.mock.calls[0]!;
  expect(channel).toBe(WINDOW_CHANNELS.event);
  handler({ private: 'fixture' }, { fullscreen: true, token: 'fixture' });
  expect(listener).not.toHaveBeenCalled();
  handler({ private: 'fixture' }, { fullscreen: true });
  expect(listener).toHaveBeenCalledWith({ fullscreen: true });
  off();
  expect(electron.removeListener).toHaveBeenCalledWith(WINDOW_CHANNELS.event, handler);
});
