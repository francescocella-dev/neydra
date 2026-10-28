import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { join } from 'node:path';
import { COMPANION_CHANNEL, COMPANION_MENU_EVENT } from '../shared/companion-contracts';
import { ORBIT_CHANNEL, ORBIT_EVENT, type OrbitRole } from '../shared/orbit-contracts';
import { CompanionController, companionCommand, COMPANION_SIZE } from './companion-controller';
import { OrbitController, orbitCommand, SATELLITE_SIZE, type Satellite } from './orbit-controller';
import { companionAsset, COMPANION_URL, orbitAsset, ORBIT_URL, trustedCompanion, trustedOrbit } from './companion-security';
import { rendererSession } from './renderer-session';
import { rendererPreferences, trustedSender } from './security';

export function createCompanionHost(main: BrowserWindow) {
  const companionSession = rendererSession('neydra-companion', join(__dirname, '../companion'), companionAsset);
  const orbitSession = rendererSession('neydra-orbit', join(__dirname, '../orbit'), orbitAsset);
  let core: BrowserWindow | undefined;
  let disposed = false;
  let coreReady: (() => void) | undefined;
  let blurTimer: ReturnType<typeof setTimeout> | undefined;
  const satellites = new Map<number, { role: OrbitRole; window: BrowserWindow; ready?: () => void; timer?: ReturnType<typeof setTimeout> }>();
  const areas = () => screen.getAllDisplays().map(display => display.workArea);
  const usableCore = () => core && !core.isDestroyed() && core.isVisible() ? core : undefined;
  const groupBlurred = () => {
    clearTimeout(blurTimer);
    blurTimer = setTimeout(() => {
      if (disposed) return;
      const focused = BrowserWindow.getFocusedWindow();
      if (focused !== usableCore() && ![...satellites.values()].some(entry => entry.window === focused && !entry.window.isDestroyed() && entry.window.isVisible())) orbit.close(false, true);
    }, 0);
  };
  const secure = (window: BrowserWindow) => {
    window.removeMenu();
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.on('will-frame-navigate', event => event.preventDefault());
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    window.on('blur', groupBlurred);
  };
  const loaded = async (window: BrowserWindow, url: string, register: (ready?: () => void) => void) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let rejectReady: (reason: Error) => void = () => {};
    const aborted = () => rejectReady(new Error('UI closed'));
    const ready = new Promise<void>((resolve, reject) => { rejectReady = reject; register(resolve); timer = setTimeout(() => reject(new Error('UI not ready')), 5000); });
    window.once('closed', aborted);
    try { await Promise.all([window.loadURL(url), ready]); }
    finally { clearTimeout(timer); window.removeListener('closed', aborted); register(); }
  };
  const fixedOptions = (size: number) => ({ width: size, height: size, minWidth: size, maxWidth: size, minHeight: size, maxHeight: size,
    show: false, frame: false, transparent: true, backgroundColor: '#00000000', alwaysOnTop: true, skipTaskbar: true,
    resizable: false, minimizable: false, maximizable: false, fullscreenable: false, hasShadow: false });

  const controller = new CompanionController(main, async () => {
    const bounds = main.isMinimized() ? main.getNormalBounds() : main.getBounds();
    const floating = new BrowserWindow({ ...fixedOptions(COMPANION_SIZE), title: 'NEYDRA Mini',
      x: bounds.x + bounds.width - COMPANION_SIZE - 24, y: bounds.y + bounds.height - COMPANION_SIZE - 24,
      webPreferences: { ...rendererPreferences, session: companionSession, preload: join(__dirname, '../preload/companion.cjs') } });
    core = floating; secure(floating);
    const recover = () => {
      orbit.close();
      for (const entry of satellites.values()) if (!entry.window.isDestroyed()) entry.window.destroy();
      controller.recover();
    };
    const failed = () => { recover(); if (!floating.isDestroyed()) floating.destroy(); };
    floating.on('closed', recover);
    floating.on('hide', () => { orbit.close(); if (!disposed && !main.isDestroyed() && !main.isVisible()) recover(); });
    floating.on('moved', () => { if (!disposed && !floating.isDestroyed() && floating.isVisible()) { orbit.close(); if (!controller.reposition()) recover(); } });
    floating.on('unresponsive', failed);
    floating.webContents.on('render-process-gone', failed);
    floating.webContents.on('preload-error', failed);
    try { await loaded(floating, COMPANION_URL, ready => { coreReady = ready; }); return floating; }
    catch { failed(); throw new Error('Companion unavailable'); }
  }, areas, () => screen.getCursorScreenPoint(), () => app.quit(), () => orbit.close());

  const orbit = new OrbitController(() => usableCore()?.getBounds(), areas, async role => {
    const window = new BrowserWindow({ ...fixedOptions(SATELLITE_SIZE), title: role === 'open' ? 'Apri NEYDRA' : 'Esci da NEYDRA',
      parent: core, webPreferences: { ...rendererPreferences, session: orbitSession, preload: join(__dirname, '../preload/orbit.cjs') } });
    const entry = { role, window, ready: undefined as (() => void) | undefined, timer: undefined as ReturnType<typeof setTimeout> | undefined };
    const senderId = window.webContents.id;
    satellites.set(senderId, entry); secure(window);
    const failed = () => { orbit.close(); if (!window.isDestroyed()) window.destroy(); };
    window.on('closed', () => { clearTimeout(entry.timer); satellites.delete(senderId); if (!disposed) orbit.close(); });
    window.on('focus', () => orbit.focused(role));
    window.on('moved', () => orbit.validate());
    window.on('resize', () => orbit.validate());
    window.on('unresponsive', failed);
    window.webContents.on('render-process-gone', failed);
    window.webContents.on('preload-error', failed);
    try { await loaded(window, ORBIT_URL, ready => { entry.ready = ready; }); }
    catch { failed(); throw new Error('Orbit unavailable'); }
    const port: Satellite = {
      isDestroyed: () => window.isDestroyed(),
      getBounds: () => window.getBounds(),
      setPosition: (x, y) => window.setPosition(x, y), focus: () => window.focus(), destroy: () => window.destroy(),
      reveal() { clearTimeout(entry.timer); window.setIgnoreMouseEvents(false); window.showInactive(); window.webContents.send(ORBIT_EVENT, 'reveal'); },
      conceal(animate) {
        clearTimeout(entry.timer);
        if (window.isDestroyed()) return;
        window.setIgnoreMouseEvents(true); // Fading controls cannot intercept or execute clicks.
        window.webContents.send(ORBIT_EVENT, 'conceal');
        if (animate && window.isVisible()) entry.timer = setTimeout(() => { if (!window.isDestroyed()) window.hide(); }, 150);
        else window.hide();
      },
    };
    return port;
  }, open => { if (core && !core.isDestroyed()) core.webContents.send(COMPANION_MENU_EVENT, { open }); },
  () => usableCore()?.focus(), () => { controller.restore(); }, () => app.quit());

  ipcMain.handle(COMPANION_CHANNEL, (event, payload: unknown) => {
    if (disposed || main.isDestroyed()) return { ok: false, code: 'unavailable' };
    const source = trustedSender(event.sender.id, main.webContents.id, event.senderFrame?.url, event.senderFrame === main.webContents.mainFrame) ? 'main'
      : core && !core.isDestroyed() && trustedCompanion(event.sender.id, core.webContents.id, event.senderFrame?.url, event.senderFrame === core.webContents.mainFrame) ? 'companion' : undefined;
    return companionCommand(payload, source, controller, keyboard => orbit.toggle(keyboard), () => coreReady?.(), () => orbit.close(true, true), direction => orbit.navigate(direction));
  });
  ipcMain.handle(ORBIT_CHANNEL, (event, payload: unknown) => {
    if (disposed) return { ok: false, code: 'unavailable' };
    const entry = satellites.get(event.sender.id);
    const role = entry && !entry.window.isDestroyed() && trustedOrbit(event.sender.id, entry.window.webContents.id,
      event.senderFrame?.url, event.senderFrame === entry.window.webContents.mainFrame) ? entry.role : undefined;
    try { return orbitCommand(payload, role, orbit, () => entry?.ready?.()); }
    catch { orbit.close(true); return { ok: false, code: 'unavailable' }; }
  });
  const minimize = () => {
    if (!disposed) void controller.reduce().then(result => {
      // A restore may cancel a pending creation, followed by another native
      // minimize. Recover that minimized main when the cancelled creation ends.
      if (!result.ok && result.code !== 'busy' && !disposed && !main.isDestroyed() && main.isMinimized()) controller.restore();
    });
  };
  const restored = () => controller.nativeRestore();
  main.on('minimize', minimize); main.on('restore', restored);
  return {
    restore: () => controller.restore(),
    displaysChanged: () => controller.displaysChanged(),
    dispose() {
      if (disposed) return;
      disposed = true; clearTimeout(blurTimer); orbit.dispose(); controller.dispose();
      if (core && !core.isDestroyed()) core.destroy();
      // Also destroy a satellite whose ready handshake is still pending.
      for (const entry of satellites.values()) { clearTimeout(entry.timer); if (!entry.window.isDestroyed()) entry.window.destroy(); }
      satellites.clear();
      main.removeListener('minimize', minimize); main.removeListener('restore', restored);
      ipcMain.removeHandler(COMPANION_CHANNEL); ipcMain.removeHandler(ORBIT_CHANNEL);
      companionSession.protocol.unhandle('app'); orbitSession.protocol.unhandle('app');
    },
  };
}
