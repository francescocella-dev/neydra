import { EventEmitter } from 'node:events';
import type { ElectronApplication } from '@playwright/test';
import { expect, it } from 'vitest';
import { installCompanionLifecycleProbe } from './helpers/companion-lifecycle-probe';

it('records the contents-first destruction gap and recovery order without handling exceptions or retaining listeners', async () => {
  class Window extends EventEmitter {
    static windows = new Map<number, Window>();
    static fromId = (id: number) => Window.windows.get(id);
    dead = false; contentsDead = false; visible = false; focused = false;
    webContents = Object.assign(new EventEmitter(), { isDestroyed: () => this.contentsDead });
    constructor(readonly id: number, readonly parent?: Window) { super(); Window.windows.set(id, this); }
    isDestroyed = () => this.dead;
    isVisible = () => { if (this.contentsDead) throw new Error('native query must not run in the destruction gap'); return this.visible; };
    isFocused = () => this.focused;
    getParentWindow = () => this.parent;
  }
  const app = new EventEmitter(), main = new Window(1), core = new Window(2), runtime = { app, BrowserWindow: Window };
  const monitorCount = process.listenerCount('uncaughtExceptionMonitor');
  const desktop = { evaluateHandle: async (callback: (runtime: object, ids: object) => unknown, ids: object) => {
    const value = callback(runtime, ids);
    return { evaluate: async (read: (value: unknown) => unknown) => read(value) };
  } } as unknown as ElectronApplication;
  // Simulate a production listener throwing after contents died. Prepending
  // the observer preserves the event evidence without intercepting the error.
  const fail = () => { throw new Error('synthetic production error'); };
  core.webContents.on('destroyed', fail);
  const probe = await installCompanionLifecycleProbe(desktop, { main: 1, core: 2 });
  try {
    const child = new Window(3, core); app.emit('browser-window-created', {}, child);
    core.emit('close'); child.emit('closed');
    core.contentsDead = true;
    expect(() => core.webContents.emit('destroyed')).toThrow('synthetic production error');
    core.dead = true; core.emit('closed'); main.visible = true; main.focused = true; main.emit('focus');
    const records = await probe.evaluate(probe => probe.drain());
    expect(records).toContainEqual(expect.objectContaining({ event: 'contents-destroyed', id: 2,
      core: expect.objectContaining({ destroyed: false, contentsDestroyed: true }) }));
    expect(records).toContainEqual(expect.objectContaining({ event: 'closed', id: 3 }));
    expect(records.at(-1)).toMatchObject({ event: 'focus', id: 1, main: { visible: true, focused: true } });
    expect(await probe.evaluate(probe => probe.uncaught())).toBe(0);
    expect(JSON.stringify(records)).not.toMatch(/synthetic production error|token|url|prompt|header/i);
  } finally { await probe.evaluate(probe => probe.dispose()); core.webContents.removeListener('destroyed', fail); }
  expect(app.listenerCount('browser-window-created')).toBe(0);
  expect(process.listenerCount('uncaughtExceptionMonitor')).toBe(monitorCount);
  expect(core.listenerCount('close') + core.webContents.listenerCount('destroyed')).toBe(0);
});
