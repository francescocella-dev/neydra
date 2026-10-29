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
  const satellites = new Map<number, { role: OrbitRole; window: BrowserWindow; parent: BrowserWindow; ready?: () => void; timer?: ReturnType<typeof setTimeout> }>();
  const areas = () => screen.getAllDisplays().map(display => display.workArea);
  const closing = new WeakSet<BrowserWindow>(), destroying = new WeakSet<BrowserWindow>();
  const alive = (window: BrowserWindow) => !disposed && !closing.has(window) && !window.isDestroyed() && !window.webContents.isDestroyed();
  const usableCore = () => core && alive(core) && core.isVisible() ? core : undefined;
  const send = (window: BrowserWindow, channel: string, payload: unknown): boolean => {
    if (!alive(window)) return false;
    const contents = window.webContents;
    try { contents.send(channel, payload); return true; }
    catch (error) {
      // Only the known native destruction race is expected. Live-window bugs
      // still propagate; never silence arbitrary send/teardown exceptions.
      if (error instanceof TypeError && error.message === 'Object has been destroyed'
        && (!alive(window) || contents.isDestroyed())) return false;
      throw error;
    }
  };
  const destroy = (window: BrowserWindow) => {
    if (window.isDestroyed() || destroying.has(window)) return;
    closing.add(window); destroying.add(window);
    try { window.destroy(); }
    finally { destroying.delete(window); }
  };
  const groupBlurred = () => {
    clearTimeout(blurTimer);
    if (disposed) return;
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
    window.on('close', () => closing.add(window));
    window.on('blur', () => { if (alive(window)) groupBlurred(); });
  };
  const loaded = async (window: BrowserWindow, url: string, register: (ready?: () => void) => void) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let rejectReady: (reason: Error) => void = () => {};
    const aborted = () => rejectReady(new Error('UI closed'));
    const ready = new Promise<void>((resolve, reject) => { rejectReady = reject; register(resolve); timer = setTimeout(() => reject(new Error('UI not ready')), 5000); });
    const contents = window.webContents;
    window.once('closed', aborted); contents.once('destroyed', aborted);
    try { await Promise.all([window.loadURL(url), ready]); }
    finally { clearTimeout(timer); window.removeListener('closed', aborted); contents.removeListener('destroyed', aborted); register(); }
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
    let retired = false;
    const recover = () => {
      if (retired) return;
      retired = true; closing.add(floating); clearTimeout(blurTimer);
      const current = core === floating;
      if (current) { core = undefined; coreReady = undefined; }
      const children = [...satellites.values()].filter(entry => entry.parent === floating);
      for (const entry of children) { closing.add(entry.window); clearTimeout(entry.timer); }
      // Restore first, with the closing core detached. Child callbacks can
      // reenter close, but cannot abort recovery or notify a dying parent.
      try { if (!disposed && current) controller.recover(floating); }
      finally {
        try { orbit.close(); }
        finally { for (const entry of children) destroy(entry.window); }
      }
    };
    const failed = () => { try { recover(); } finally { destroy(floating); } };
    floating.on('close', recover);
    floating.on('closed', recover);
    floating.webContents.on('destroyed', () => {
      try { recover(); }
      finally {
        // Native destroy/close may still be on the C++ stack. If only contents
        // died, finish the dead shell on the next microtask, not reentrantly.
        queueMicrotask(() => destroy(floating));
      }
    });
    floating.on('hide', () => {
      if (disposed || retired) return;
      if (!main.isDestroyed() && !main.isVisible()) controller.recover();
      else orbit.close();
    });
    floating.on('moved', () => { if (alive(floating) && floating.isVisible()) { orbit.close(); if (!controller.reposition()) controller.recover(); } });
    floating.on('unresponsive', failed);
    floating.webContents.on('render-process-gone', failed);
    floating.webContents.on('preload-error', failed);
    try { await loaded(floating, COMPANION_URL, ready => { if (core === floating) coreReady = ready; }); return floating; }
    catch { failed(); throw new Error('Companion unavailable'); }
  }, areas, () => screen.getCursorScreenPoint(), () => app.quit(), () => orbit.close());

  const orbit = new OrbitController(() => usableCore()?.getBounds(), areas, async role => {
    const parent = usableCore();
    if (!parent) throw new Error('Core unavailable');
    const window = new BrowserWindow({ ...fixedOptions(SATELLITE_SIZE), title: role === 'open' ? 'Apri NEYDRA' : 'Esci da NEYDRA',
      parent, webPreferences: { ...rendererPreferences, session: orbitSession, preload: join(__dirname, '../preload/orbit.cjs') } });
    const entry = { role, window, parent, ready: undefined as (() => void) | undefined, timer: undefined as ReturnType<typeof setTimeout> | undefined };
    const senderId = window.webContents.id;
    satellites.set(senderId, entry); secure(window);
    const failed = () => {
      closing.add(window); clearTimeout(entry.timer);
      try { if (!disposed && core === parent && alive(parent)) orbit.close(); }
      finally { destroy(window); }
    };
    window.on('close', () => { closing.add(window); clearTimeout(entry.timer); if (core === parent && alive(parent)) orbit.close(); });
    window.on('closed', () => {
      closing.add(window); clearTimeout(entry.timer); satellites.delete(senderId);
      if (!disposed && core === parent && alive(parent)) orbit.close();
    });
    window.webContents.on('destroyed', () => {
      closing.add(window); clearTimeout(entry.timer);
      try { if (!disposed && core === parent && alive(parent)) orbit.close(); }
      finally { queueMicrotask(() => destroy(window)); }
    });
    window.on('focus', () => orbit.focused(role));
    window.on('moved', () => orbit.validate());
    window.on('resize', () => orbit.validate());
    window.on('unresponsive', failed);
    window.webContents.on('render-process-gone', failed);
    window.webContents.on('preload-error', failed);
    try { await loaded(window, ORBIT_URL, ready => { entry.ready = ready; }); }
    catch { failed(); throw new Error('Orbit unavailable'); }
    const port: Satellite = {
      isDestroyed: () => !alive(window),
      getBounds: () => window.getBounds(),
      setPosition: (x, y) => window.setPosition(x, y), focus: () => { if (alive(window)) window.focus(); }, destroy: () => destroy(window),
      reveal() { clearTimeout(entry.timer); if (!alive(window)) return; window.setIgnoreMouseEvents(false); window.showInactive(); send(window, ORBIT_EVENT, 'reveal'); },
      conceal(animate) {
        clearTimeout(entry.timer);
        if (!alive(window)) return;
        window.setIgnoreMouseEvents(true); // Fading controls cannot intercept or execute clicks.
        if (!send(window, ORBIT_EVENT, 'conceal')) return;
        if (animate && window.isVisible()) entry.timer = setTimeout(() => { if (alive(window)) window.hide(); }, 150);
        else if (window.isVisible()) window.hide();
      },
    };
    return port;
  }, open => { if (core) send(core, COMPANION_MENU_EVENT, { open }); },
  () => usableCore()?.focus(), () => { controller.restore(); }, () => app.quit());

  ipcMain.handle(COMPANION_CHANNEL, (event, payload: unknown) => {
    if (disposed || main.isDestroyed() || main.webContents.isDestroyed()) return { ok: false, code: 'unavailable' };
    const source = trustedSender(event.sender.id, main.webContents.id, event.senderFrame?.url, event.senderFrame === main.webContents.mainFrame) ? 'main'
      : core && alive(core) && trustedCompanion(event.sender.id, core.webContents.id, event.senderFrame?.url, event.senderFrame === core.webContents.mainFrame) ? 'companion' : undefined;
    return companionCommand(payload, source, controller, keyboard => orbit.toggle(keyboard), () => coreReady?.(), () => orbit.close(true, true), direction => orbit.navigate(direction));
  });
  ipcMain.handle(ORBIT_CHANNEL, (event, payload: unknown) => {
    if (disposed) return { ok: false, code: 'unavailable' };
    const entry = satellites.get(event.sender.id);
    const role = entry && alive(entry.window) && trustedOrbit(event.sender.id, entry.window.webContents.id,
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
      disposed = true; clearTimeout(blurTimer);
      const floating = core, children = [...satellites.values()];
      core = undefined; coreReady = undefined; satellites.clear();
      if (floating) closing.add(floating);
      for (const entry of children) { closing.add(entry.window); clearTimeout(entry.timer); }
      try { try { orbit.dispose(); } finally { controller.dispose(); } }
      finally {
        try { if (floating) destroy(floating); }
        finally {
          try { for (const entry of children) destroy(entry.window); }
          finally {
            main.removeListener('minimize', minimize); main.removeListener('restore', restored);
            ipcMain.removeHandler(COMPANION_CHANNEL); ipcMain.removeHandler(ORBIT_CHANNEL);
            companionSession.protocol.unhandle('app'); orbitSession.protocol.unhandle('app');
          }
        }
      }
    },
  };
}
