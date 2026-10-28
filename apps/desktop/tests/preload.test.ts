import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { DesktopBridge } from '../src/shared/contracts';
import type { CompanionBridge } from '../src/shared/companion-contracts';
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
let mini: CompanionBridge;
let miniExposedName: string;
beforeAll(async () => {
  await import('../src/preload/index');
  bridge = electron.exposeInMainWorld.mock.calls[0]![1] as DesktopBridge;
  exposedName = electron.exposeInMainWorld.mock.calls[0]![0] as string;
  await import('../src/preload/companion');
  [miniExposedName, mini] = electron.exposeInMainWorld.mock.calls.at(-1)! as [string, CompanionBridge];
});
beforeEach(() => {
  electron.invoke.mockReset(); electron.on.mockClear(); electron.removeListener.mockClear();
});

it('exposes only the named narrow frozen API, without raw IPC', () => {
  expect(exposedName).toBe('neydra');
  expect(Object.keys(bridge).sort()).toEqual(['cancel', 'cancelConnect', 'connectChatGPT', 'disconnectChatGPT', 'getConnection', 'getStatus', 'getWindowState', 'onEvent', 'onWindowState', 'reduceToMini', 'resetChat', 'setFullscreen', 'startChatGPT', 'startOfflineDemo']);
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

it('routes reduction only to the companion channel and validates the result', async () => {
  const { COMPANION_CHANNEL } = await import('../src/shared/companion-contracts');
  electron.invoke.mockResolvedValueOnce({ ok: true });
  expect(await bridge.reduceToMini()).toEqual({ ok: true });
  expect(electron.invoke).toHaveBeenLastCalledWith(COMPANION_CHANNEL, { type: 'reduce' });
  electron.invoke.mockResolvedValueOnce({ ok: true, conversation: 'synthetic-private' });
  await expect(bridge.reduceToMini()).rejects.toThrow();
});

it('exposes a separate minimal companion bridge; validates replies and never subscribes to chat events', async () => {
  const { COMPANION_CHANNEL } = await import('../src/shared/companion-contracts');
  expect(miniExposedName).toBe('neydraCompanion');
  expect(Object.isFrozen(mini)).toBe(true);
  expect(Object.keys(mini).sort()).toEqual(['beginDrag', 'cancelDrag', 'closeMenu', 'endDrag', 'moveDrag', 'navigateMenu', 'onMenuState', 'openMenu', 'ready', 'restore']);
  for (const [method, command] of [['ready', 'ready'], ['beginDrag', 'dragStart'], ['moveDrag', 'dragMove'], ['endDrag', 'dragEnd'], ['cancelDrag', 'dragCancel'], ['closeMenu', 'dismissMenu'], ['restore', 'restore']]) {
    electron.invoke.mockResolvedValueOnce({ ok: true });
    expect(await (mini[method! as keyof CompanionBridge] as () => Promise<unknown>)()).toEqual({ ok: true });
    expect(electron.invoke).toHaveBeenLastCalledWith(COMPANION_CHANNEL, { type: command });
  }
  expect(electron.on).not.toHaveBeenCalled();
  electron.invoke.mockResolvedValueOnce({ ok: true, accessToken: 'synthetic' });
  await expect(mini.restore()).rejects.toThrow();
});

it('validates menu navigation/state and keeps orbital actions restricted to a distinct bridge and role result', async () => {
  const { COMPANION_CHANNEL, COMPANION_MENU_EVENT } = await import('../src/shared/companion-contracts');
  const { ORBIT_CHANNEL, ORBIT_EVENT } = await import('../src/shared/orbit-contracts');
  expect(await mini.openMenu({ keyboard: false, url: 'https://example.org' } as never)).toMatchObject({ code: 'invalid-request' });
  expect(await mini.navigateMenu('elsewhere' as never)).toMatchObject({ code: 'invalid-request' });
  expect(electron.invoke).not.toHaveBeenCalled();
  electron.invoke.mockResolvedValueOnce({ ok: true }); await mini.openMenu({ keyboard: true });
  expect(electron.invoke).toHaveBeenLastCalledWith(COMPANION_CHANNEL, { type: 'menu', input: { keyboard: true } });
  const menuState = vi.fn(), off = mini.onMenuState(menuState);
  const [channel, handler] = electron.on.mock.calls.at(-1)!; expect(channel).toBe(COMPANION_MENU_EVENT);
  handler({}, { open: true, token: 'synthetic' }); expect(menuState).not.toHaveBeenCalled();
  handler({}, { open: true }); expect(menuState).toHaveBeenCalledWith({ open: true }); off();
  await import('../src/preload/orbit');
  const [name, orbit] = electron.exposeInMainWorld.mock.calls.at(-1)!;
  expect(name).toBe('neydraOrbit'); expect(Object.isFrozen(orbit)).toBe(true);
  expect(Object.keys(orbit).sort()).toEqual(['activate', 'dismiss', 'getRole', 'navigate', 'onVisibility', 'ready']);
  electron.invoke.mockResolvedValueOnce({ ok: true, role: 'exit' }); expect(await orbit.getRole()).toEqual({ ok: true, role: 'exit' });
  expect(electron.invoke).toHaveBeenLastCalledWith(ORBIT_CHANNEL, { type: 'role' });
  electron.invoke.mockResolvedValueOnce({ ok: true, role: 'exit', account: 'synthetic' }); await expect(orbit.getRole()).rejects.toThrow();
  electron.invoke.mockResolvedValueOnce({ ok: true }); await orbit.activate();
  expect(electron.invoke).toHaveBeenLastCalledWith(ORBIT_CHANNEL, { type: 'activate' });
  const listener = vi.fn(), offVisibility = orbit.onVisibility(listener);
  const [eventChannel, eventHandler] = electron.on.mock.calls.at(-1)!; expect(eventChannel).toBe(ORBIT_EVENT);
  eventHandler({}, { phase: 'reveal', account: 'synthetic' }); expect(listener).not.toHaveBeenCalled();
  eventHandler({}, 'reveal'); expect(listener).toHaveBeenCalledWith('reveal'); offVisibility();
  expect(electron.removeListener).toHaveBeenLastCalledWith(ORBIT_EVENT, eventHandler);
});
