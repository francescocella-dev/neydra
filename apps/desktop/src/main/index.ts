import { app, BrowserWindow, ipcMain, net, protocol, session, shell } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WINDOW_CHANNELS } from '../shared/window-contracts';
import { windowCommand, fullscreenShortcut } from './window-controls';
import { CHANNELS } from '../shared/contracts';
import { ChatGPTAdapter } from './chatgpt/adapter';
import { registrationStore } from './chatgpt/registration';
import { offlineProvider } from './offline';
import { DesktopService } from './service';
import { APP_URL, CSP, rendererAsset, rendererPreferences, trustedSender } from './security';

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.enableSandbox();
let window: BrowserWindow | undefined;

async function createWindow() {
  const isolatedSession = session.fromPartition('neydra-offline'); // In memory, no persistent cookies.
  isolatedSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  isolatedSession.setPermissionCheckHandler(() => false);
  isolatedSession.setDevicePermissionHandler(() => false);
  isolatedSession.on('will-download', (event) => event.preventDefault());
  isolatedSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !rendererAsset(details.url) });
  });
  isolatedSession.protocol.handle('app', async (request) => {
    const asset = rendererAsset(request.url);
    if (!asset || request.method !== 'GET') return new Response(null, { status: 403 });
    try {
      const response = await net.fetch(pathToFileURL(join(__dirname, '../renderer', asset)).href);
      const headers = new Headers(response.headers);
      headers.set('Content-Security-Policy', CSP);
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('Cache-Control', 'no-store');
      return new Response(response.body, { status: response.status, headers });
    } catch { return new Response(null, { status: 404 }); }
  });
  const current = new BrowserWindow({
    title: 'NEYDRA — desktop sperimentale', width: 1280, height: 860, minWidth: 720, minHeight: 600,
    backgroundColor: '#090a0c', show: false,
    webPreferences: { ...rendererPreferences, session: isolatedSession, preload: join(__dirname, '../preload/index.cjs') },
  });
  window = current;
  current.removeMenu();
  const contents = current.webContents;
  const adapter = new ChatGPTAdapter(registrationStore(app.getPath('userData')), url => shell.openExternal(url));
  const service = new DesktopService(offlineProvider, event => {
    if (!contents.isDestroyed()) contents.send(CHANNELS.event, event);
  }, adapter);
  ipcMain.handle(CHANNELS.invoke, async (event, payload: unknown) => {
    if (!trustedSender(event.sender.id, contents.id, event.senderFrame?.url, event.senderFrame === contents.mainFrame)) {
      return { ok: false, code: 'untrusted-sender' };
    }
    try { return await service.handle(payload); }
    catch { return { ok: false, code: 'internal' }; }
  });
  ipcMain.handle(WINDOW_CHANNELS.invoke, (event, payload: unknown) => windowCommand(payload,
    trustedSender(event.sender.id, contents.id, event.senderFrame?.url, event.senderFrame === contents.mainFrame), current));
  const publishWindowState = () => {
    if (!contents.isDestroyed()) contents.send(WINDOW_CHANNELS.event, { fullscreen: current.isFullScreen() });
  };
  current.on('enter-full-screen', publishWindowState);
  current.on('leave-full-screen', publishWindowState);
  contents.on('before-input-event', (event, input) => {
    try { if (fullscreenShortcut(input, current)) event.preventDefault(); }
    catch { publishWindowState(); }
  });
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', event => event.preventDefault());
  contents.on('will-frame-navigate', event => event.preventDefault());
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.on('render-process-gone', () => service.dispose());
  contents.on('did-start-loading', () => service.dispose());
  current.on('closed', () => {
    service.dispose();
    ipcMain.removeHandler(CHANNELS.invoke);
    ipcMain.removeHandler(WINDOW_CHANNELS.invoke);
    isolatedSession.protocol.unhandle('app');
    window = undefined;
  });
  current.once('ready-to-show', () => current.show());
  await current.loadURL(APP_URL);
}

app.whenReady().then(createWindow).catch(() => { console.error('NEYDRA: desktop startup failed'); app.exit(1); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { window?.destroy(); });
