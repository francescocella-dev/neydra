import { app, BrowserWindow, ipcMain, Menu, protocol, screen, shell } from 'electron';
import { join } from 'node:path';
import { COMPANION_CHANNEL } from '../shared/companion-contracts';
import { CompanionController, companionCommand, COMPANION_SIZE } from './companion-controller';
import { companionAsset, COMPANION_URL, trustedCompanion } from './companion-security';
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
let companion: BrowserWindow | undefined;
let controller: CompanionController | undefined;
let companionReady: (() => void) | undefined;
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
  const companionSession = rendererSession('neydra-companion', join(__dirname, '../companion'), companionAsset);
  controller = new CompanionController(current, async () => {
    const bounds = current.getBounds();
    const floating = new BrowserWindow({
      title: 'NEYDRA Mini', width: COMPANION_SIZE, height: COMPANION_SIZE,
      x: bounds.x + bounds.width - COMPANION_SIZE - 24, y: bounds.y + bounds.height - COMPANION_SIZE - 24,
      show: false, frame: false, transparent: true, backgroundColor: '#00000000',
      alwaysOnTop: true, skipTaskbar: true, resizable: false, minimizable: false,
      maximizable: false, fullscreenable: false, hasShadow: false,
      webPreferences: { ...rendererPreferences, session: companionSession, preload: join(__dirname, '../preload/companion.cjs') },
    });
    companion = floating;
    floating.removeMenu();
    const recover = () => { controller?.recover(); };
    const failed = () => { recover(); if (!floating.isDestroyed()) floating.destroy(); };
    floating.on('closed', recover);
    floating.on('hide', () => { if (!quitting && !current.isDestroyed() && !current.isVisible()) recover(); });
    floating.on('moved', () => { if (!quitting && !floating.isDestroyed() && floating.isVisible() && !controller?.reposition()) recover(); });
    floating.on('unresponsive', failed);
    floating.webContents.on('render-process-gone', failed);
    floating.webContents.on('preload-error', failed);
    floating.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    floating.webContents.on('will-navigate', event => event.preventDefault());
    floating.webContents.on('will-frame-navigate', event => event.preventDefault());
    floating.webContents.on('will-attach-webview', event => event.preventDefault());
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ready = new Promise<void>((resolve, reject) => {
      companionReady = resolve;
      timer = setTimeout(() => reject(new Error('Companion not ready')), 5000);
    });
    try { await Promise.all([floating.loadURL(COMPANION_URL), ready]); return floating; }
    catch { failed(); throw new Error('Companion unavailable'); }
    finally { clearTimeout(timer); companionReady = undefined; }
  }, () => screen.getAllDisplays().map(display => display.workArea), () => screen.getCursorScreenPoint(), () => app.quit());
  ipcMain.handle(COMPANION_CHANNEL, (event, payload: unknown) => {
    if (current.isDestroyed()) return { ok: false, code: 'unavailable' };
    const source = trustedSender(event.sender.id, current.webContents.id, event.senderFrame?.url, event.senderFrame === current.webContents.mainFrame) ? 'main'
      : companion && !companion.isDestroyed() && trustedCompanion(event.sender.id, companion.webContents.id, event.senderFrame?.url,
        event.senderFrame === companion.webContents.mainFrame) ? 'companion' : undefined;
    return companionCommand(payload, source, controller!, () => {
      if (!companion || companion.isDestroyed() || !companion.isVisible()) throw new Error('Companion unavailable');
      Menu.buildFromTemplate([
        { label: 'Apri NEYDRA', click: () => { controller?.restore(); } },
        { label: 'Esci', click: () => app.quit() },
      ]).popup({ window: companion });
    }, () => companionReady?.());
  });
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
    controller?.dispose();
    service.dispose();
    ipcMain.removeHandler(CHANNELS.invoke);
    ipcMain.removeHandler(WINDOW_CHANNELS.invoke);
    ipcMain.removeHandler(COMPANION_CHANNEL);
    isolatedSession.protocol.unhandle('app');
    companionSession.protocol.unhandle('app');
    window = undefined;
  });
  current.once('ready-to-show', () => current.show());
  await current.loadURL(APP_URL);
}

// A second launch recovers the existing session instead of creating another pair.
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { controller?.restore(); });
  app.on('activate', () => { controller?.restore(); });
  app.whenReady().then(() => {
    const reposition = () => { controller?.displaysChanged(); };
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
  quitting = true; controller?.dispose();
  if (window && !window.isDestroyed()) window.destroy();
});
