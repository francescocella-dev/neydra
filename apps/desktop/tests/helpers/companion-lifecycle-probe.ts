import type { ElectronApplication } from '@playwright/test';
import type { EventEmitter } from 'node:events';

// Test-only event ordering and technical state. No error payloads, URLs, text,
// credentials or desktop images. Observes events without changing close behavior.
export async function installCompanionLifecycleProbe(desktop: ElectronApplication, ids: { main: number; core: number }) {
  return desktop.evaluateHandle(({ app, BrowserWindow }, ids) => {
    type Window = InstanceType<typeof BrowserWindow>;
    const main = BrowserWindow.fromId(ids.main)!, core = BrowserWindow.fromId(ids.core)!;
    const mainContents = main.webContents, coreContents = core.webContents;
    const records: unknown[] = [], disposers: (() => void)[] = [];
    let sequence = 0, uncaught = 0;
    const state = (window: Window, contents: typeof mainContents) => {
      const destroyed = window.isDestroyed();
      const contentsDestroyed = !contents || contents.isDestroyed();
      const contentsDetached = !destroyed && !window.webContents;
      return { destroyed, contentsDestroyed, contentsDetached,
        visible: !destroyed && !contentsDestroyed && !contentsDetached ? window.isVisible() : undefined,
        focused: !destroyed && !contentsDestroyed && !contentsDetached ? window.isFocused() : undefined };
    };
    const record = (event: string, id: number) => {
      if (records.length < 2048) records.push({ sequence: ++sequence, event, id,
        main: state(main, mainContents), core: state(core, coreContents) });
    };
    const track = (window: Window) => {
      const id = window.id, contents = window.webContents, events = window as unknown as EventEmitter;
      for (const event of ['close', 'closed', 'show', 'hide', 'focus', 'blur', 'restore', 'minimize']) {
        const listener = () => record(event, id);
        if (event === 'close' || event === 'closed') events.prependListener(event, listener); else events.on(event, listener); disposers.push(() => events.removeListener(event, listener));
      }
      const destroyed = () => record('contents-destroyed', id);
      if (contents) { contents.prependListener('destroyed', destroyed); disposers.push(() => contents.removeListener('destroyed', destroyed)); }
    };
    track(main); track(core);
    const created = (_event: unknown, window: Window) => { if (window.getParentWindow() === core) track(window); };
    app.on('browser-window-created', created);
    const exception = () => { ++uncaught; record('uncaught-main-error', 0); };
    // Monitor does not catch or suppress Electron's real uncaught exception path.
    process.on('uncaughtExceptionMonitor', exception);
    return {
      drain() { return records.splice(0); },
      uncaught() { return uncaught; },
      dispose() {
        app.removeListener('browser-window-created', created); process.removeListener('uncaughtExceptionMonitor', exception);
        for (const dispose of disposers) dispose();
      },
    };
  }, ids);
}
