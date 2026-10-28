import { EventEmitter } from 'node:events';
import { expect, it } from 'vitest';
import type { ElectronApplication } from '@playwright/test';
import { installOrbitNativeProbe } from './helpers/orbit-native-probe';

it('traces before/after native operations and events, delegates unchanged and restores original methods', async () => {
  class Window extends EventEmitter {
    bounds = { x: 0, y: 0, width: 72, height: 72 }; visible = true; focused = false;
    webContents = { id: 3, getURL: () => 'app://orbit/index.html' };
    isDestroyed = () => false; isVisible = () => this.visible; isFocused = () => this.focused;
    getBounds = () => ({ ...this.bounds }); getContentBounds = this.getBounds;
    getMinimumSize = () => [72, 72]; getMaximumSize = this.getMinimumSize;
    hide() { this.visible = false; this.emit('hide'); }
    setPosition(x: number, y: number) { this.bounds = { ...this.bounds, x, y, width: this.bounds.width + 1 }; this.emit('move'); this.emit('resize'); }
    setBounds() { this.emit('resize'); }
    showInactive() { this.visible = true; this.emit('show'); }
    focus() { this.focused = true; this.emit('focus'); }
  }
  const app = new EventEmitter(), before = Object.getOwnPropertyDescriptors(Window.prototype);
  const runtime = { app, BrowserWindow: Window, screen: {
    getDisplayMatching: () => ({ scaleFactor: 1.25 }), dipToScreenRect: (_window: Window, rect: object) => rect,
  } };
  const desktop = { evaluateHandle: async (callback: (runtime: object) => unknown) => {
    const value = callback(runtime);
    return { evaluate: async (read: (value: unknown) => unknown) => read(value) };
  } } as unknown as ElectronApplication;
  const probe = await installOrbitNativeProbe(desktop);
  try {
    const window = new Window(); app.emit('browser-window-created', {}, window);
    window.setPosition(10, 20); window.hide(); window.showInactive(); window.focus();
    const records = await probe.evaluate(probe => probe.drain());
    expect(records).toContainEqual(expect.objectContaining({ phase: 'before', operation: 'setPosition', bounds: { x: 0, y: 0, width: 72, height: 72 } }));
    expect(records).toContainEqual(expect.objectContaining({ phase: 'after', operation: 'setPosition', target: { x: 10, y: 20 }, bounds: { x: 10, y: 20, width: 73, height: 72 } }));
    for (const operation of ['hide', 'showInactive', 'focus']) {
      expect(records).toContainEqual(expect.objectContaining({ phase: 'before', operation }));
      expect(records).toContainEqual(expect.objectContaining({ phase: 'after', operation }));
    }
    expect(records).toContainEqual(expect.objectContaining({ phase: 'event', operation: 'resize' }));
    expect(JSON.stringify(records)).not.toMatch(/app:\/\/|title|token|prompt|headers/i);
    expect(await probe.evaluate(probe => probe.drain())).toEqual([]);
  } finally { await probe.evaluate(probe => probe.dispose()); }
  expect(Object.getOwnPropertyDescriptors(Window.prototype)).toEqual(before);
  expect(app.listenerCount('browser-window-created')).toBe(0);
});
