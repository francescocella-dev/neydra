import { REDUCTION_CHANNEL } from '../src/shared/reduction-contracts';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { BrowserWindowConstructorOptions } from 'electron';
import { COMPANION_CHANNEL } from '../src/shared/companion-contracts';
import { CHANNELS } from '../src/shared/contracts';
import { WINDOW_CHANNELS } from '../src/shared/window-contracts';
import { COMPANION_URL, ORBIT_URL } from '../src/main/companion-security';
import { ORBIT_CHANNEL, ORBIT_EVENT } from '../src/shared/orbit-contracts';
import { APP_URL, CSP } from '../src/main/security';

const state = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload: unknown) => Promise<unknown>>(),
  handshake: true, preferenceMode: 'circle' as 'circle' | 'island',
}));
class MockWindow extends EventEmitter {
  static windows: MockWindow[] = [];
  static focused: MockWindow | null = null;
  static getFocusedWindow = () => MockWindow.focused;
  minimized = false;
  visible = false; destroyed = false; contentsDestroyed = false; closing = false;
  webContents = Object.assign(new EventEmitter(), {
    id: MockWindow.windows.length + 1, mainFrame: { url: '' },
    setWindowOpenHandler: vi.fn(), send: vi.fn((...args: unknown[]) => { void args; if (this.contentsDestroyed) throw new TypeError('Object has been destroyed'); }), isDestroyed: () => this.contentsDestroyed,
  });
  position = { x: 100, y: 100 };
  constructor(readonly options: BrowserWindowConstructorOptions) { super(); this.position = { x: options.x ?? 100, y: options.y ?? 100 }; MockWindow.windows.push(this); }
  removeMenu = vi.fn(); isDestroyed = () => this.destroyed; isVisible = () => this.visible;
  isMinimized = () => this.minimized; isMaximized = () => false; isFullScreen = () => false;
  restore = vi.fn(() => { this.minimized = false; this.emit('restore'); }); setFullScreen = vi.fn();
  minimize() { this.minimized = true; this.emit('minimize'); }
  show = vi.fn(() => { this.visible = true; }); showInactive = vi.fn(() => { this.visible = true; });
  hide = vi.fn(() => { this.visible = false; this.emit('hide'); });
  focus = vi.fn(() => { MockWindow.focused = this; this.emit('focus'); });
  setIgnoreMouseEvents = vi.fn();
  getBounds = () => ({ ...this.position, width: this.options.width!, height: this.options.height! });
  getNormalBounds = this.getBounds;
  setPosition = (x: number, y: number) => { this.position = { x, y }; };
  destroy = () => {
    if (this.destroyed) throw new Error('Window already destroyed');
    this.destroyContents();
    for (const child of [...MockWindow.windows]) if ((child.options.parent as unknown) === this && !child.destroyed) child.destroy();
    this.destroyed = true; this.visible = false;
    if (MockWindow.focused === this) MockWindow.focused = null;
    this.emit('closed');
    if (MockWindow.windows.every(window => window.destroyed)) app.emit('window-all-closed');
  };
  destroyContents() {
    if (this.contentsDestroyed) return;
    this.contentsDestroyed = true; this.webContents.emit('destroyed');
  }
  close() {
    if (this.destroyed || this.closing) return;
    this.closing = true; this.emit('close');
    // BrowserWindow.close does not synchronously mark the native window dead.
    queueMicrotask(() => { if (!this.destroyed) this.destroy(); });
  }
  async loadURL(url: string) {
    this.webContents.mainFrame.url = url;
    if (url === COMPANION_URL && state.handshake) await invoke(this, COMPANION_CHANNEL, { type: 'ready' });
    if (url === ORBIT_URL && state.handshake) await invoke(this, ORBIT_CHANNEL, { type: 'ready' });
    this.emit('ready-to-show');
  }
}
const app = Object.assign(new EventEmitter(), {
  enableSandbox: vi.fn(), requestSingleInstanceLock: vi.fn(() => true), whenReady: vi.fn(async () => {}),
  quit: vi.fn(), exit: vi.fn(), getPath: vi.fn(() => '/tmp/neydra-synthetic-tests'),
});
vi.mock('../src/main/reduction-preference', () => ({ reductionPreference: () => ({
  get: async () => ({ mode: state.preferenceMode, status: 'saved' as const }),
  set: async (mode: 'circle' | 'island') => { state.preferenceMode = mode; return { mode, status: 'saved' as const }; },
}) }));
const display = Object.assign(new EventEmitter(), {
  getAllDisplays: vi.fn(() => [{ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }]),
  getDisplayMatching: vi.fn(() => ({ id: 1, scaleFactor: 1, workArea: display.getAllDisplays()[0]?.workArea ?? { x: 0, y: 0, width: 0, height: 0 } })),
});
const sessions = new Map<string, ReturnType<typeof makeSession>>();
function makeSession() {
  return { setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn(), setDevicePermissionHandler: vi.fn(),
    on: vi.fn(), webRequest: { onBeforeRequest: vi.fn() }, protocol: { handle: vi.fn(), unhandle: vi.fn() } };
}
const netFetch = vi.fn(async () => new Response('synthetic local asset'));
vi.mock('electron', () => ({
  app, BrowserWindow: MockWindow, screen: display, net: { fetch: netFetch },
  shell: { openExternal: vi.fn() }, protocol: { registerSchemesAsPrivileged: vi.fn() },
  session: { fromPartition(partition: string) { const value = makeSession(); sessions.set(partition, value); return value; } },
  ipcMain: { handle: (name: string, handler: (event: unknown, payload: unknown) => Promise<unknown>) => state.handlers.set(name, handler),
    removeHandler: (name: string) => state.handlers.delete(name) },
}));
function invoke(window: MockWindow, channel: string, payload: unknown, frame = window.webContents.mainFrame) {
  return state.handlers.get(channel)!({ sender: window.webContents, senderFrame: frame }, payload);
}
beforeEach(async () => {
  vi.useRealTimers(); vi.resetModules(); vi.clearAllMocks(); state.handlers.clear(); sessions.clear(); MockWindow.windows = [];
  app.removeAllListeners(); display.removeAllListeners(); state.handshake = true; app.requestSingleInstanceLock.mockReturnValue(true);
  MockWindow.focused = null; state.preferenceMode = 'circle';
  await import('../src/main/index');
  await vi.waitFor(() => expect(MockWindow.windows).toHaveLength(1));
});
afterEach(() => { app.emit('before-quit'); });

it('uses distinct in-memory sessions, sandbox/CSP unchanged, narrow sender authorization and a transparent topmost taskbar-free window', async () => {
  const main = MockWindow.windows[0]!;
  expect(await invoke(main, COMPANION_CHANNEL, { type: 'reduce' })).toEqual({ ok: true });
  const floating = MockWindow.windows[1]!;
  expect(floating.options).toMatchObject({ frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true,
    minimizable: false, maximizable: false, fullscreenable: false, resizable: false, backgroundColor: '#00000000',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, webviewTag: false } });
  expect(floating.options.webPreferences?.preload).toMatch(/preload[\\/]companion.cjs$/);
  expect(main.options.webPreferences?.session).not.toBe(floating.options.webPreferences?.session);
  expect([...sessions.keys()]).toEqual(['neydra-offline', 'neydra-companion', 'neydra-orbit']);
  expect(app.enableSandbox).toHaveBeenCalledOnce();
  expect(await invoke(floating, CHANNELS.invoke, { type: 'connection' })).toEqual({ ok: false, code: 'untrusted-sender' });
  expect(await invoke(floating, WINDOW_CHANNELS.invoke, { type: 'getState' })).toEqual({ ok: false, code: 'untrusted-sender' });
  expect(await invoke(floating, COMPANION_CHANNEL, { type: 'restore' }, { url: COMPANION_URL })).toMatchObject({ code: 'untrusted-sender' });
  const isolated = sessions.get('neydra-companion')!;
  expect(isolated.setPermissionCheckHandler.mock.calls[0]![0]()).toBe(false);
  expect(isolated.setDevicePermissionHandler.mock.calls[0]![0]()).toBe(false);
  const permission = vi.fn(); isolated.setPermissionRequestHandler.mock.calls[0]![0](undefined, 'media', permission);
  expect(permission).toHaveBeenCalledWith(false);
  const allowed = vi.fn(); isolated.webRequest.onBeforeRequest.mock.calls[0]![0]({ url: COMPANION_URL }, allowed);
  expect(allowed).toHaveBeenCalledWith({ cancel: false });
  const denied = vi.fn(); isolated.webRequest.onBeforeRequest.mock.calls[0]![0]({ url: 'https://example.org' }, denied);
  expect(denied).toHaveBeenCalledWith({ cancel: true });
  const preventDownload = vi.fn(); isolated.on.mock.calls[0]![1]({ preventDefault: preventDownload });
  expect(preventDownload).toHaveBeenCalledOnce();
  const assetHandler = isolated.protocol.handle.mock.calls[0]![1];
  expect((await assetHandler({ url: COMPANION_URL, method: 'GET' })).headers.get('Content-Security-Policy')).toBe(CSP);
  expect((await assetHandler({ url: APP_URL, method: 'GET' })).status).toBe(403);
  expect((await assetHandler({ url: COMPANION_URL, method: 'POST' })).status).toBe(403);
  for (const event of ['will-navigate', 'will-frame-navigate', 'will-attach-webview']) {
    const preventDefault = vi.fn(); floating.webContents.emit(event, { preventDefault }); expect(preventDefault).toHaveBeenCalledOnce();
  }
  expect(floating.webContents.setWindowOpenHandler.mock.calls[0]![0]()).toEqual({ action: 'deny' });
});
it('offers role-bound Open/Exit satellites, recovers on native close/crash/hide, and second launch/activation reuse main', async () => {
  const main = MockWindow.windows[0]!; await invoke(main, COMPANION_CHANNEL, { type: 'reduce' });
  const floating = MockWindow.windows[1]!;
  const coreBounds = floating.getBounds();
  await invoke(floating, COMPANION_CHANNEL, { type: 'menu', input: { keyboard: true } });
  const open = MockWindow.windows[2]!, exit = MockWindow.windows[3]!;
  expect(await invoke(open, ORBIT_CHANNEL, { type: 'role' })).toEqual({ ok: true, role: 'open' });
  expect(await invoke(exit, ORBIT_CHANNEL, { type: 'role' })).toEqual({ ok: true, role: 'exit' });
  expect(open.visible && exit.visible).toBe(true); expect(MockWindow.focused).toBe(open);
  expect(floating.getBounds()).toEqual(coreBounds);
  expect(await invoke(floating, ORBIT_CHANNEL, { type: 'activate' })).toMatchObject({ code: 'untrusted-sender' });
  expect(await invoke(exit, CHANNELS.invoke, { type: 'connection' })).toMatchObject({ code: 'untrusted-sender' });
  expect(await invoke(exit, COMPANION_CHANNEL, { type: 'restore' })).toMatchObject({ code: 'untrusted-sender' });
  await invoke(open, ORBIT_CHANNEL, { type: 'activate' }); expect(main.visible).toBe(true); expect(floating.visible).toBe(false);
  await invoke(main, COMPANION_CHANNEL, { type: 'reduce' }); app.emit('second-instance');
  expect(main.visible).toBe(true); expect(main.focus).toHaveBeenCalled(); expect(MockWindow.windows).toHaveLength(4);
  await invoke(main, COMPANION_CHANNEL, { type: 'reduce' }); floating.hide(); expect(main.visible).toBe(true);
  await invoke(main, COMPANION_CHANNEL, { type: 'reduce' }); floating.webContents.emit('render-process-gone');
  expect(main.visible).toBe(true); expect(floating.destroyed).toBe(true);
  await invoke(main, COMPANION_CHANNEL, { type: 'reduce' }); const next = MockWindow.windows.at(-1)!; next.destroy(); expect(main.visible).toBe(true);
  await invoke(main, COMPANION_CHANNEL, { type: 'reduce' }); app.emit('activate'); expect(main.visible).toBe(true);
  await invoke(main, COMPANION_CHANNEL, { type: 'reduce' });
  display.getAllDisplays.mockReturnValueOnce([]); display.emit('display-removed'); expect(main.visible).toBe(true);
  display.getAllDisplays.mockReturnValue([{ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }]);
  await invoke(main, COMPANION_CHANNEL, { type: 'reduce' });
  await invoke(MockWindow.windows.at(-1)!, COMPANION_CHANNEL, { type: 'menu', input: { keyboard: false } });
  await invoke(MockWindow.windows.at(-1)!, ORBIT_CHANNEL, { type: 'activate' }); expect(app.quit).toHaveBeenCalled();
  app.emit('before-quit'); expect(MockWindow.windows.every(window => window.destroyed)).toBe(true);
  expect(state.handlers.size).toBe(0); app.emit('will-quit'); expect(display.listenerCount('display-removed')).toBe(0);
});
it('never hides main if renderer initialization is missing; has no automated retry after readiness timeout', async () => {
  state.handshake = false; vi.useFakeTimers();
  const main = MockWindow.windows[0]!, pending = invoke(main, COMPANION_CHANNEL, { type: 'reduce' });
  await Promise.resolve();
  expect(main.visible).toBe(true); await vi.advanceTimersByTimeAsync(5000);
  expect(await pending).toEqual({ ok: false, code: 'unavailable' });
  expect(main.hide).not.toHaveBeenCalled(); expect(MockWindow.windows[1]!.destroyed).toBe(true);
  await vi.advanceTimersByTimeAsync(10000); expect(MockWindow.windows).toHaveLength(2);
  vi.useRealTimers();
});
it('quits a duplicate launch before creating any window', async () => {
  app.emit('before-quit'); app.removeAllListeners(); MockWindow.windows = [];
  vi.resetModules(); app.requestSingleInstanceLock.mockReturnValue(false);
  await import('../src/main/index');
  expect(app.quit).toHaveBeenCalled(); expect(MockWindow.windows).toHaveLength(0);
});
it('closing main destroys the companion and quits without reentering destroyed native windows', async () => {
  const main = MockWindow.windows[0]!;
  await invoke(main, COMPANION_CHANNEL, { type: 'reduce' });
  await invoke(MockWindow.windows[1]!, COMPANION_CHANNEL, { type: 'menu', input: { keyboard: false } });
  await invoke(MockWindow.windows[1]!, COMPANION_CHANNEL, { type: 'restore' });
  app.quit.mockImplementationOnce(() => { app.emit('before-quit'); });
  expect(() => main.destroy()).not.toThrow();
  expect(MockWindow.windows.every(window => window.destroyed)).toBe(true);
  expect(state.handlers.size).toBe(0); expect(app.quit).toHaveBeenCalledOnce();
});

it('native minimize uses the same transition and restores an already minimized main without recreating its session', async () => {
  const main = MockWindow.windows[0]!; main.minimize(); main.emit('minimize');
  await vi.waitFor(() => expect(MockWindow.windows[1]?.visible).toBe(true));
  expect(main.visible).toBe(false); expect(main.minimized).toBe(true); expect(MockWindow.windows).toHaveLength(2);
  const floating = MockWindow.windows[1]!, bounds = floating.getBounds();
  await invoke(floating, COMPANION_CHANNEL, { type: 'restore' });
  expect(main.minimized).toBe(false); expect(main.restore).toHaveBeenCalledOnce(); expect(main.visible).toBe(true);
  main.minimize(); await vi.waitFor(() => expect(floating.visible).toBe(true));
  expect(MockWindow.windows).toHaveLength(2); expect(floating.getBounds()).toEqual(bounds);
});
it('recovers a minimized main on creation failure and cancels a late reduction when the user restores first', async () => {
  state.handshake = false; vi.useFakeTimers();
  const main = MockWindow.windows[0]!; main.minimize();
  await vi.advanceTimersByTimeAsync(5000);
  expect(main.visible).toBe(true); expect(main.minimized).toBe(false); expect(MockWindow.windows[1]!.destroyed).toBe(true);
  main.minimize(); await Promise.resolve(); const next = MockWindow.windows.at(-1)!;
  main.restore(); expect(main.visible).toBe(true);
  main.minimize(); // A new minimize while the cancelled factory is still pending.
  await invoke(next, COMPANION_CHANNEL, { type: 'ready' }); await vi.advanceTimersByTimeAsync(0);
  expect(main.visible).toBe(true); expect(main.minimized).toBe(false); expect(next.destroyed).toBe(true);
  vi.useRealTimers();
});
it('satellite focus stays within the menu; outside blur, Escape cancels it without changing core geometry or exiting', async () => {
  const main = MockWindow.windows[0]!; await invoke(main, COMPANION_CHANNEL, { type: 'reduce' });
  const core = MockWindow.windows[1]!, before = core.getBounds();
  await invoke(core, COMPANION_CHANNEL, { type: 'menu', input: { keyboard: true } });
  const open = MockWindow.windows[2]!, exit = MockWindow.windows[3]!;
  expect(open.options).toMatchObject({ width: 72, height: 72, minWidth: 72, maxWidth: 72, minHeight: 72, maxHeight: 72, skipTaskbar: true, parent: core });
  expect(open.options.webPreferences?.session).not.toBe(core.options.webPreferences?.session);
  vi.useFakeTimers(); core.emit('blur'); await vi.advanceTimersByTimeAsync(0); expect(open.visible && exit.visible).toBe(true);
  MockWindow.focused = null; open.emit('blur'); await vi.advanceTimersByTimeAsync(0);
  expect(open.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true); await vi.advanceTimersByTimeAsync(150);
  expect(open.visible || exit.visible).toBe(false); expect(MockWindow.focused).toBeNull();
  await invoke(core, COMPANION_CHANNEL, { type: 'menu', input: { keyboard: false } });
  expect(await invoke(core, COMPANION_CHANNEL, { type: 'dragStart' })).toMatchObject({ code: 'invalid-request' });
  await invoke(core, COMPANION_CHANNEL, { type: 'dismissMenu' }); await vi.advanceTimersByTimeAsync(150);
  await invoke(core, COMPANION_CHANNEL, { type: 'menu', input: { keyboard: false } });
  await invoke(exit, ORBIT_CHANNEL, { type: 'dismiss' }); await vi.advanceTimersByTimeAsync(150);
  expect(open.visible || exit.visible).toBe(false); expect(MockWindow.focused).toBe(core);
  await invoke(core, COMPANION_CHANNEL, { type: 'menu', input: { keyboard: false } });
  open.setPosition(-5000, -5000); open.emit('resize'); // Late OS/DPI adjustment uses actual bounds.
  expect(open.visible || exit.visible).toBe(false);
  expect(core.getBounds()).toEqual(before); expect(main.visible).toBe(false); expect(app.quit).not.toHaveBeenCalled();
  vi.useRealTimers();
});

it('does not hide an already hidden satellite when reusing the native orbital windows', async () => {
  const main = MockWindow.windows[0]!; await invoke(main, COMPANION_CHANNEL, { type: 'reduce' });
  const core = MockWindow.windows[1]!;
  await invoke(core, COMPANION_CHANNEL, { type: 'menu', input: { keyboard: false } });
  const open = MockWindow.windows[2]!, exit = MockWindow.windows[3]!;
  expect(open.hide).not.toHaveBeenCalled(); expect(exit.hide).not.toHaveBeenCalled();
  const before = [open.getBounds(), exit.getBounds()];
  await invoke(core, COMPANION_CHANNEL, { type: 'menu', input: { keyboard: false } });
  for (let cycle = 0; cycle < 5; ++cycle) {
    const hides = open.hide.mock.calls.length;
    await invoke(core, COMPANION_CHANNEL, { type: 'menu', input: { keyboard: true } });
    expect(open.hide).toHaveBeenCalledTimes(hides);
    expect([open.getBounds(), exit.getBounds()]).toEqual(before);
    await invoke(exit, ORBIT_CHANNEL, { type: 'navigate', direction: 'first' });
    expect(MockWindow.focused).toBe(open);
    await invoke(core, COMPANION_CHANNEL, { type: 'menu', input: { keyboard: false } });
    expect(open.hide).toHaveBeenCalledTimes(hides + 1);
  }
});

async function hiddenOrbit(mode: 'circle' | 'island' = 'circle') {
  state.preferenceMode = mode;
  const main = MockWindow.windows[0]!;
  await invoke(main, COMPANION_CHANNEL, { type: 'reduce' });
  const core = MockWindow.windows[1]!;
  await invoke(core, COMPANION_CHANNEL, { type: 'menu', input: { keyboard: false } });
  const open = MockWindow.windows[2]!, exit = MockWindow.windows[3]!;
  await invoke(core, COMPANION_CHANNEL, { type: 'menu', input: { keyboard: false } });
  expect(open.visible || exit.visible).toBe(false);
  return { main, core, open, exit };
}
it.each(['circle', 'island'] as const)('native close %s with hidden satellites restores the original focused main before asynchronous native destruction', async mode => {
  const { main, core, open, exit } = await hiddenOrbit(mode);
  const contents = main.webContents, session = main.options.webPreferences?.session;
  const reload = vi.spyOn(main, 'loadURL');
  main.show.mockClear(); main.focus.mockClear();
  core.close();
  expect(core.isDestroyed()).toBe(false); // The close event is earlier than closed.
  expect(main.visible).toBe(true); expect(MockWindow.focused).toBe(main);
  await vi.waitFor(() => expect(core.destroyed && open.destroyed && exit.destroyed).toBe(true));
  expect(main.webContents).toBe(contents); expect(main.options.webPreferences?.session).toBe(session);
  expect(reload).not.toHaveBeenCalled(); expect(main.destroyed).toBe(false);
  expect(main.show).toHaveBeenCalledOnce(); expect(main.focus).toHaveBeenCalledOnce(); expect(app.quit).not.toHaveBeenCalled();
});
it('guards a dead core webContents while its BrowserWindow is alive, then recovers on contents destruction', async () => {
  const { main, core, open } = await hiddenOrbit();
  const sends = core.webContents.send.mock.calls.length;
  core.contentsDestroyed = true; // Model the gap before the destroyed event is dispatched.
  expect(core.isDestroyed()).toBe(false); expect(core.webContents.isDestroyed()).toBe(true);
  open.close(); await vi.waitFor(() => expect(open.destroyed).toBe(true));
  expect(core.webContents.send).toHaveBeenCalledTimes(sends);
  expect(main.visible).toBe(false); // An IPC guard alone is not a recovery event.
  core.webContents.emit('destroyed');
  expect(main.visible).toBe(true); expect(MockWindow.focused).toBe(main);
  await vi.waitFor(() => expect(core.destroyed).toBe(true));
  expect(app.quit).not.toHaveBeenCalled();
});
it('does not conceal dead satellite contents or let parent/child close callbacks reenter recovery', async () => {
  const { main, core, open, exit } = await hiddenOrbit();
  const sends = open.webContents.send.mock.calls.length;
  open.contentsDestroyed = true;
  open.once('closed', () => { core.close(); core.emit('closed'); });
  exit.once('closed', () => core.close());
  main.show.mockClear(); main.focus.mockClear();
  core.close(); core.close();
  await vi.waitFor(() => expect(core.destroyed && open.destroyed && exit.destroyed).toBe(true));
  core.emit('closed');
  expect(open.webContents.send).toHaveBeenCalledTimes(sends);
  expect(main.visible).toBe(true); expect(MockWindow.focused).toBe(main);
  expect(main.show).toHaveBeenCalledOnce(); expect(main.focus).toHaveBeenCalledOnce(); expect(app.quit).not.toHaveBeenCalled();
});
it('cancels fade and blur timers when the parent closes during animated conceal', async () => {
  const { main, core, open, exit } = await hiddenOrbit();
  await invoke(core, COMPANION_CHANNEL, { type: 'menu', input: { keyboard: false } });
  vi.useFakeTimers();
  await invoke(exit, ORBIT_CHANNEL, { type: 'dismiss' });
  expect(vi.getTimerCount()).toBeGreaterThan(0);
  core.close(); await vi.runAllTimersAsync();
  const sends = [open.webContents.send.mock.calls.length, exit.webContents.send.mock.calls.length];
  await vi.advanceTimersByTimeAsync(10000);
  expect([open.webContents.send.mock.calls.length, exit.webContents.send.mock.calls.length]).toEqual(sends);
  expect(vi.getTimerCount()).toBe(0); expect(core.destroyed && open.destroyed && exit.destroyed).toBe(true);
  expect(main.visible).toBe(true); expect(MockWindow.focused).toBe(main); expect(app.quit).not.toHaveBeenCalled();
  vi.useRealTimers();
});
it('handles core closure reentered from a satellite hide callback', async () => {
  const { main, core, open } = await hiddenOrbit();
  await invoke(core, COMPANION_CHANNEL, { type: 'menu', input: { keyboard: false } });
  open.once('hide', () => core.close());
  await invoke(core, COMPANION_CHANNEL, { type: 'menu', input: { keyboard: false } });
  await vi.waitFor(() => expect(core.destroyed).toBe(true));
  expect(main.visible).toBe(true); expect(MockWindow.focused).toBe(main); expect(app.quit).not.toHaveBeenCalled();
});
it('filters only an Object-has-been-destroyed send race and detaches a core that dies during notification', async () => {
  const { main, core } = await hiddenOrbit();
  core.webContents.send.mockImplementationOnce(() => { core.destroyContents(); throw new TypeError('Object has been destroyed'); });
  expect(await invoke(core, COMPANION_CHANNEL, { type: 'menu', input: { keyboard: false } })).toMatchObject({ code: 'unavailable' });
  await vi.waitFor(() => expect(core.destroyed).toBe(true));
  expect(main.visible).toBe(true); expect(MockWindow.focused).toBe(main); expect(app.quit).not.toHaveBeenCalled();
});
it('preserves genuine live notification errors after restoring main rather than swallowing them or quitting', async () => {
  const { main, core } = await hiddenOrbit();
  await invoke(core, COMPANION_CHANNEL, { type: 'menu', input: { keyboard: false } });
  core.webContents.send.mockImplementationOnce(() => { throw new Error('synthetic live notification bug'); });
  expect(() => core.hide()).toThrow('synthetic live notification bug');
  expect(main.visible).toBe(true); expect(MockWindow.focused).toBe(main); expect(app.quit).not.toHaveBeenCalled();
});
it('voluntary orbital Exit destroys the group and clears pending timers without showing or focusing main', async () => {
  const { main, core, exit } = await hiddenOrbit();
  await invoke(core, COMPANION_CHANNEL, { type: 'menu', input: { keyboard: false } });
  vi.useFakeTimers(); core.emit('blur');
  main.show.mockClear(); main.focus.mockClear();
  app.quit.mockImplementationOnce(() => app.emit('before-quit'));
  await invoke(exit, ORBIT_CHANNEL, { type: 'activate' });
  await vi.runAllTimersAsync(); app.emit('before-quit');
  expect(main.show).not.toHaveBeenCalled(); expect(main.focus).not.toHaveBeenCalled();
  expect(MockWindow.windows.every(window => window.destroyed)).toBe(true); expect(state.handlers.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0); expect(app.quit).toHaveBeenCalledOnce(); vi.useRealTimers();
});
it('does not reveal or send IPC to a satellite whose contents die during showInactive', async () => {
  const { main, core, open } = await hiddenOrbit();
  const reveals = () => open.webContents.send.mock.calls.filter(call => call[0] === ORBIT_EVENT && call[1] === 'reveal').length;
  const before = reveals();
  open.showInactive.mockImplementationOnce(() => { open.visible = true; open.destroyContents(); });
  expect(await invoke(core, COMPANION_CHANNEL, { type: 'menu', input: { keyboard: false } })).toMatchObject({ code: 'unavailable' });
  await vi.waitFor(() => expect(open.destroyed).toBe(true));
  expect(reveals()).toBe(before); expect(main.visible).toBe(false); expect(core.visible).toBe(true);
  core.close(); await vi.waitFor(() => expect(core.destroyed).toBe(true)); expect(main.visible).toBe(true);
});
it('aborts a pending core handshake when contents die and leaves no readiness timer or automatic retry', async () => {
  state.handshake = false; vi.useFakeTimers();
  const main = MockWindow.windows[0]!, pending = invoke(main, COMPANION_CHANNEL, { type: 'reduce' });
  await vi.waitFor(() => expect(MockWindow.windows[1]).toBeDefined());
  const core = MockWindow.windows[1]!;
  core.destroyContents();
  expect(await pending).toEqual({ ok: false, code: 'unavailable' });
  await vi.runAllTimersAsync();
  expect(vi.getTimerCount()).toBe(0); expect(core.destroyed).toBe(true); expect(main.visible).toBe(true);
  expect(MockWindow.focused).toBe(main); expect(main.focus).toHaveBeenCalledOnce();
  expect(MockWindow.windows).toHaveLength(2); expect(app.quit).not.toHaveBeenCalled();
  vi.useRealTimers();
});

it('restricts persisted reduction preference to main and recreates only the companion on the next reduction', async () => {
  const { main, core, open } = await hiddenOrbit();
  expect(await invoke(core, REDUCTION_CHANNEL, { type: 'get' })).toMatchObject({ code: 'untrusted-sender' });
  expect(await invoke(open, REDUCTION_CHANNEL, { type: 'set', mode: 'island' })).toMatchObject({ code: 'untrusted-sender' });
  expect(await invoke(main, REDUCTION_CHANNEL, { type: 'set', mode: 'island', x: 30 })).toMatchObject({ code: 'invalid-request' });
  expect(await invoke(main, REDUCTION_CHANNEL, { type: 'set', mode: 'unknown' })).toMatchObject({ code: 'invalid-request' });
  expect(await invoke(main, REDUCTION_CHANNEL, { type: 'get' }, { url: APP_URL })).toMatchObject({ code: 'untrusted-sender' });
  expect(await invoke(core, COMPANION_CHANNEL, { type: 'mode', token: 'synthetic' })).toMatchObject({ code: 'invalid-request' });
  expect(await invoke(core, COMPANION_CHANNEL, { type: 'mode' })).toEqual({ ok: true, mode: 'circle' });
  expect(await invoke(main, REDUCTION_CHANNEL, { type: 'set', mode: 'island' })).toMatchObject({ ok: true, preference: { mode: 'island' } });
  expect(core.destroyed).toBe(false); // Preference never changes the current companion.
  await invoke(core, COMPANION_CHANNEL, { type: 'restore' });
  const contents = main.webContents;
  await invoke(main, COMPANION_CHANNEL, { type: 'reduce' });
  const island = MockWindow.windows.find(window => window !== core && window.options.title === 'NEYDRA Island')!;
  expect(core.destroyed).toBe(true); expect(island.visible).toBe(true); expect(main.visible).toBe(false);
  expect(island.options).toMatchObject({ width: 240, height: 64, movable: false, frame: false, transparent: true,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  expect(await invoke(island, COMPANION_CHANNEL, { type: 'mode' })).toEqual({ ok: true, mode: 'island' });
  await invoke(island, COMPANION_CHANNEL, { type: 'restore' });
  expect(main.webContents).toBe(contents); expect(main.visible).toBe(true); expect(app.quit).not.toHaveBeenCalled();
});
it('uses matched display workArea and normal main bounds when minimized, not its window corner or pointer', async () => {
  const main = MockWindow.windows[0]!;
  display.getDisplayMatching.mockReturnValue({ id: 7, scaleFactor: 1.25, workArea: { x: -1536, y: -200, width: 1536, height: 816 } });
  await invoke(main, COMPANION_CHANNEL, { type: 'reduce' });
  const core = MockWindow.windows[1]!;
  expect(core.getBounds()).toMatchObject({ x: -144, y: 472, width: 120, height: 120 });
  expect(core.options.movable).toBe(false);
  const before = core.getBounds(), moves = vi.spyOn(core, 'setPosition');
  await invoke(core, COMPANION_CHANNEL, { type: 'restore' });
  main.position = { x: -600, y: -150 }; main.minimize();
  await vi.waitFor(() => expect(core.visible).toBe(true));
  expect(display.getDisplayMatching).toHaveBeenCalledWith(main.getNormalBounds());
  expect(core.getBounds()).toEqual(before); expect(moves).not.toHaveBeenCalled();
  display.getDisplayMatching.mockReturnValue({ id: 1, scaleFactor: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } });
});
