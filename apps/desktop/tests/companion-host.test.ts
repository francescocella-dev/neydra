import { EventEmitter } from 'node:events';
import { beforeEach, expect, it, vi } from 'vitest';
import type { BrowserWindowConstructorOptions } from 'electron';
import { COMPANION_CHANNEL } from '../src/shared/companion-contracts';
import { CHANNELS } from '../src/shared/contracts';
import { WINDOW_CHANNELS } from '../src/shared/window-contracts';
import { COMPANION_URL } from '../src/main/companion-security';
import { APP_URL, CSP } from '../src/main/security';

const state = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload: unknown) => Promise<unknown>>(),
  handshake: true,
}));
class MockWindow extends EventEmitter {
  static windows: MockWindow[] = [];
  visible = false; destroyed = false;
  webContents = Object.assign(new EventEmitter(), {
    id: MockWindow.windows.length + 1, mainFrame: { url: '' },
    setWindowOpenHandler: vi.fn(), send: vi.fn(), isDestroyed: () => this.destroyed,
  });
  position = { x: 100, y: 100 };
  constructor(readonly options: BrowserWindowConstructorOptions) { super(); MockWindow.windows.push(this); }
  removeMenu = vi.fn(); isDestroyed = () => this.destroyed; isVisible = () => this.visible;
  isMinimized = () => false; isMaximized = () => false; isFullScreen = () => false; restore = vi.fn(); setFullScreen = vi.fn();
  show = vi.fn(() => { this.visible = true; }); hide = vi.fn(() => { this.visible = false; this.emit('hide'); }); focus = vi.fn();
  getBounds = () => ({ ...this.position, width: this.options.width!, height: this.options.height! });
  setPosition = (x: number, y: number) => { this.position = { x, y }; };
  destroy = () => {
    if (this.destroyed) throw new Error('Window already destroyed');
    this.destroyed = true; this.visible = false; this.emit('closed');
    if (MockWindow.windows.every(window => window.destroyed)) app.emit('window-all-closed');
  };
  async loadURL(url: string) {
    this.webContents.mainFrame.url = url;
    if (url === COMPANION_URL && state.handshake) await invoke(this, COMPANION_CHANNEL, { type: 'ready' });
    this.emit('ready-to-show');
  }
}
const app = Object.assign(new EventEmitter(), {
  enableSandbox: vi.fn(), requestSingleInstanceLock: vi.fn(() => true), whenReady: vi.fn(async () => {}),
  quit: vi.fn(), exit: vi.fn(), getPath: vi.fn(() => '/tmp/neydra-synthetic-tests'),
});
const display = Object.assign(new EventEmitter(), {
  getAllDisplays: vi.fn(() => [{ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }]),
  getCursorScreenPoint: vi.fn(() => ({ x: 100, y: 100 })),
});
const sessions = new Map<string, ReturnType<typeof makeSession>>();
function makeSession() {
  return { setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn(), setDevicePermissionHandler: vi.fn(),
    on: vi.fn(), webRequest: { onBeforeRequest: vi.fn() }, protocol: { handle: vi.fn(), unhandle: vi.fn() } };
}
const popup = vi.fn();
const menu = { popup, buildFromTemplate: vi.fn<(items: { label: string; click(): void }[]) => { popup: typeof popup }>() };
menu.buildFromTemplate.mockImplementation(() => ({ popup: menu.popup }));
const netFetch = vi.fn(async () => new Response('synthetic local asset'));
vi.mock('electron', () => ({
  app, BrowserWindow: MockWindow, screen: display, Menu: menu, net: { fetch: netFetch },
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
  await import('../src/main/index');
  await vi.waitFor(() => expect(MockWindow.windows).toHaveLength(1));
});

it('uses distinct in-memory sessions, sandbox/CSP unchanged, narrow sender authorization and a transparent topmost taskbar-free window', async () => {
  const main = MockWindow.windows[0]!;
  expect(await invoke(main, COMPANION_CHANNEL, { type: 'reduce' })).toEqual({ ok: true });
  const floating = MockWindow.windows[1]!;
  expect(floating.options).toMatchObject({ frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true,
    minimizable: false, maximizable: false, fullscreenable: false, resizable: false, backgroundColor: '#00000000',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, webviewTag: false } });
  expect(floating.options.webPreferences?.preload).toMatch(/preload[\\/]companion.cjs$/);
  expect(main.options.webPreferences?.session).not.toBe(floating.options.webPreferences?.session);
  expect([...sessions.keys()]).toEqual(['neydra-offline', 'neydra-companion']);
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
it('offers exactly Open/Exit, recovers on native close/crash/hide, and second launch/activation reuse the original window', async () => {
  const main = MockWindow.windows[0]!; await invoke(main, COMPANION_CHANNEL, { type: 'reduce' });
  const floating = MockWindow.windows[1]!;
  await invoke(floating, COMPANION_CHANNEL, { type: 'menu' });
  const items = menu.buildFromTemplate.mock.calls[0]![0]; expect(items.map(item => item.label)).toEqual(['Apri NEYDRA', 'Esci']);
  items[0]!.click(); expect(main.visible).toBe(true); expect(floating.visible).toBe(false);
  await invoke(main, COMPANION_CHANNEL, { type: 'reduce' }); app.emit('second-instance');
  expect(main.visible).toBe(true); expect(main.focus).toHaveBeenCalled(); expect(MockWindow.windows).toHaveLength(2);
  await invoke(main, COMPANION_CHANNEL, { type: 'reduce' }); floating.hide(); expect(main.visible).toBe(true);
  await invoke(main, COMPANION_CHANNEL, { type: 'reduce' }); floating.webContents.emit('render-process-gone');
  expect(main.visible).toBe(true); expect(floating.destroyed).toBe(true);
  await invoke(main, COMPANION_CHANNEL, { type: 'reduce' }); const next = MockWindow.windows[2]!; next.destroy(); expect(main.visible).toBe(true);
  await invoke(main, COMPANION_CHANNEL, { type: 'reduce' }); app.emit('activate'); expect(main.visible).toBe(true);
  await invoke(main, COMPANION_CHANNEL, { type: 'reduce' });
  display.getAllDisplays.mockReturnValueOnce([]); display.emit('display-removed'); expect(main.visible).toBe(true);
  items[1]!.click(); expect(app.quit).toHaveBeenCalled();
  app.emit('before-quit'); expect(MockWindow.windows.every(window => window.destroyed)).toBe(true);
  expect(state.handlers.size).toBe(0); app.emit('will-quit'); expect(display.listenerCount('display-removed')).toBe(0);
});
it('never hides main if renderer initialization is missing; has no automated retry after readiness timeout', async () => {
  state.handshake = false; vi.useFakeTimers();
  const main = MockWindow.windows[0]!, pending = invoke(main, COMPANION_CHANNEL, { type: 'reduce' });
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
  await invoke(MockWindow.windows[1]!, COMPANION_CHANNEL, { type: 'restore' });
  app.quit.mockImplementationOnce(() => { app.emit('before-quit'); });
  expect(() => main.destroy()).not.toThrow();
  expect(MockWindow.windows.every(window => window.destroyed)).toBe(true);
  expect(state.handlers.size).toBe(0); expect(app.quit).toHaveBeenCalledOnce();
});
