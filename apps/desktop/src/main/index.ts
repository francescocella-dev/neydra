import { app, BrowserWindow, ipcMain, protocol, screen, shell } from 'electron';
import { join } from 'node:path';
import { createCompanionHost } from './companion-host';
import { rendererSession } from './renderer-session';
import { WINDOW_CHANNELS } from '../shared/window-contracts';
import { windowCommand, fullscreenShortcut } from './window-controls';
import { CHANNELS } from '../shared/contracts';
import { ChatGPTAdapter } from './chatgpt/adapter';
import { registrationStore } from './chatgpt/registration';
import { offlineProvider } from './offline';
import { DesktopService } from './service';
import { APP_URL, rendererAsset, rendererPreferences, trustedSender } from './security';

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.enableSandbox();
let window: BrowserWindow | undefined;
let companionHost: ReturnType<typeof createCompanionHost> | undefined;
let quitting = false;

async function createWindow() {
  const isolatedSession = rendererSession('neydra-offline', join(__dirname, '../renderer'), rendererAsset);
  const current = new BrowserWindow({
    title: 'NEYDRA — desktop sperimentale', width: 1280, height: 860, minWidth: 720, minHeight: 600,
    backgroundColor: '#090a0c', show: false,
    webPreferences: { ...rendererPreferences, session: isolatedSession, preload: join(__dirname, '../preload/index.cjs') },
  });
  window = current;
  current.removeMenu();
  companionHost = createCompanionHost(current);
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
  contents.on('render-process-gone', () => { service.dispose(); app.quit(); });
  contents.on('did-start-loading', () => service.dispose());
  current.on('closed', () => {
    companionHost?.dispose();
    service.dispose();
    ipcMain.removeHandler(CHANNELS.invoke);
    ipcMain.removeHandler(WINDOW_CHANNELS.invoke);
    isolatedSession.protocol.unhandle('app');
    window = undefined;
  });
  current.once('ready-to-show', () => current.show());
  await current.loadURL(APP_URL);
}

// A second launch recovers the existing session instead of creating another pair.
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { companionHost?.restore(); });
  app.on('activate', () => { companionHost?.restore(); });
  app.whenReady().then(() => {
    const reposition = () => { companionHost?.displaysChanged(); };
    screen.on('display-added', reposition);
    screen.on('display-removed', reposition);
    screen.on('display-metrics-changed', reposition);
    app.once('will-quit', () => {
      screen.removeListener('display-added', reposition);
      screen.removeListener('display-removed', reposition);
      screen.removeListener('display-metrics-changed', reposition);
    });
    return createWindow();
  }).catch(() => { console.error('NEYDRA: desktop startup failed'); app.exit(1); });
}
app.on('window-all-closed', () => { if (!quitting) app.quit(); });
app.on('before-quit', () => {
  quitting = true; companionHost?.dispose();
  if (window && !window.isDestroyed()) window.destroy();
});
