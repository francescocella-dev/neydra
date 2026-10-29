import type { ElectronApplication } from '@playwright/test';
import type { EventEmitter } from 'node:events';

// Test-only wrappers delegate to the original native methods. No app bridge,
// URLs, titles, conversation data, raw errors or screenshots enter the samples.
export async function installOrbitNativeProbe(desktop: ElectronApplication) {
  return desktop.evaluateHandle(({ app, BrowserWindow, screen }) => {
    type Window = InstanceType<typeof BrowserWindow>;
    const records: unknown[] = [], disposers: (() => void)[] = [];
    let sequence = 0;
    const record = (window: Window, phase: string, operation: string, target?: { x: number; y: number }) => {
      if (records.length >= 2048 || window.isDestroyed()) return;
      const contents = window.webContents;
      if (!contents || contents.isDestroyed()) return;
      try {
        if (contents.getURL() !== 'app://orbit/index.html') return;
        const bounds = window.getBounds();
        records.push({ sequence: ++sequence, phase, operation, id: contents.id, target,
          bounds, content: window.getContentBounds(), minimum: window.getMinimumSize(), maximum: window.getMaximumSize(),
          scale: screen.getDisplayMatching(bounds).scaleFactor, visible: window.isVisible(), focused: window.isFocused(),
          physicalBounds: process.platform === 'win32' ? screen.dipToScreenRect(window, bounds) : undefined });
      } catch (error) {
        if (window.isDestroyed() || !window.webContents || contents.isDestroyed()) return; // Expected measurement race only.
        throw error;
      }
    };
    const created = (_event: unknown, window: Window) => {
      const events = window as unknown as EventEmitter;
      for (const event of ['move', 'moved', 'resize', 'show', 'hide', 'focus', 'blur'] as const) {
        const listener = () => record(window, 'event', event);
        events.on(event, listener); disposers.push(() => { if (!window.isDestroyed()) events.removeListener(event, listener); });
      }
    };
    app.on('browser-window-created', created);
    const prototype = BrowserWindow.prototype;
    for (const method of ['hide', 'setPosition', 'setBounds', 'showInactive', 'focus'] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, method), original = Reflect.get(prototype, method);
      if (typeof original !== 'function') continue;
      Object.defineProperty(prototype, method, { configurable: true, writable: true,
        value: function(this: Window, ...args: unknown[]) {
          const target = method === 'setPosition' && typeof args[0] === 'number' && typeof args[1] === 'number' ? { x: args[0], y: args[1] } : undefined;
          record(this, 'before', method, target);
          try { return Reflect.apply(original, this, args); }
          finally { record(this, 'after', method, target); }
        },
      });
      disposers.push(() => { if (descriptor) Object.defineProperty(prototype, method, descriptor); else Reflect.deleteProperty(prototype, method); });
    }
    return {
      drain() { return records.splice(0); },
      dispose() { app.removeListener('browser-window-created', created); for (const dispose of disposers.reverse()) dispose(); },
    };
  });
}
