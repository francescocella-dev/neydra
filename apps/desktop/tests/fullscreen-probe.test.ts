import { EventEmitter } from 'node:events';
import type { Event, Input, KeyboardInputEvent } from 'electron';
import { expect, it, vi } from 'vitest';
import { fullscreenShortcut } from '../src/main/window-controls';
import { observeFullscreen } from './helpers/fullscreen-probe';

function fixture(withHandler = true) {
  const windowEvents = new EventEmitter();
  const contentsEvents = new EventEmitter();
  let fullscreen = false;
  let focused = true;
  const nativeSetter = vi.fn((enabled: boolean) => {
    fullscreen = enabled;
    windowEvents.emit(enabled ? 'enter-full-screen' : 'leave-full-screen');
  });
  const target = {
    isDestroyed: () => false, isMinimized: () => false,
    isFocused: () => focused, isFullScreen: () => fullscreen,
    focus() { focused = true; }, setFullScreen: nativeSetter,
    on: windowEvents.on.bind(windowEvents), off: windowEvents.off.bind(windowEvents),
    webContents: {
      isFocused: () => focused, focus() { focused = true; },
      on: contentsEvents.on.bind(contentsEvents), off: contentsEvents.off.bind(contentsEvents),
      sendInputEvent(input: KeyboardInputEvent) {
        const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
        contentsEvents.emit('before-input-event', event, {
          type: input.type, key: input.keyCode, isAutoRepeat: false, control: false, alt: false, meta: false,
        });
      },
    },
  };
  if (withHandler) contentsEvents.on('before-input-event', (event: Event, input: Input) => {
    if (fullscreenShortcut(input, target)) event.preventDefault();
  });
  return { target, nativeSetter, windowEvents, contentsEvents, blur() { focused = false; } };
}
it('injects F11 through the input listener and observes the unchanged production shortcut and native setter', () => {
  const { target, nativeSetter } = fixture();
  const probe = observeFullscreen({ BrowserWindow: { getAllWindows: () => [target] } });
  try {
    probe.begin('f11-enter'); probe.pressF11();
    expect(probe.snapshot()).toMatchObject({ fullscreen: true, calls: [{ phase: 'f11-enter', enabled: true, threw: false }],
      transitions: [{ phase: 'f11-enter', fullscreen: true }] });
    expect(probe.snapshot().inputs[0]).toMatchObject({ down: true, prevented: true, focused: true, modified: false, repeat: false });
    probe.begin('f11-exit'); probe.pressF11();
    expect(probe.snapshot().fullscreen).toBe(false);
    expect(nativeSetter.mock.calls).toEqual([[true], [false]]);
  } finally { probe.dispose(); }
});
it('fails the focus precondition before sending anything and never toggles by itself if the app handler is missing', () => {
  const fixtureWithoutHandler = fixture(false);
  const { target, nativeSetter } = fixtureWithoutHandler;
  const probe = observeFullscreen({ BrowserWindow: { getAllWindows: () => [target] } });
  try {
    fixtureWithoutHandler.blur();
    expect(() => probe.pressF11()).toThrow('not focused');
    expect(probe.snapshot().inputs).toHaveLength(0);
    probe.focus(); probe.begin('f11-enter'); probe.pressF11();
    expect(probe.snapshot()).toMatchObject({ fullscreen: false, calls: [], transitions: [] });
    expect(probe.snapshot().inputs[0]?.prevented).toBe(false);
    expect(nativeSetter).not.toHaveBeenCalled();
  } finally { probe.dispose(); }
});
it('records a setter exception without hiding it or manufacturing a successful transition', () => {
  const { target, nativeSetter } = fixture();
  nativeSetter.mockImplementationOnce(() => { throw new Error('synthetic failure'); });
  const probe = observeFullscreen({ BrowserWindow: { getAllWindows: () => [target] } });
  try {
    probe.begin('f11-enter');
    expect(() => probe.pressF11()).toThrow('synthetic failure');
    expect(probe.snapshot()).toMatchObject({ fullscreen: false, transitions: [], calls: [{ phase: 'f11-enter', enabled: true, threw: true }] });
  } finally { probe.dispose(); }
});
it('records only F11 booleans and restores the original method and listeners on cleanup', () => {
  const { target, nativeSetter, windowEvents, contentsEvents } = fixture(false);
  const probe = observeFullscreen({ BrowserWindow: { getAllWindows: () => [target] } });
  contentsEvents.emit('before-input-event', { defaultPrevented: false }, { key: 'private-input-fixture', token: 'private-token-fixture' });
  probe.pressF11();
  expect(probe.snapshot().inputs).toHaveLength(2);
  expect(JSON.stringify(probe.snapshot())).not.toMatch(/private-input-fixture|private-token-fixture/);
  probe.dispose();
  expect(target.setFullScreen).toBe(nativeSetter);
  expect(windowEvents.listenerCount('enter-full-screen')).toBe(0);
  expect(windowEvents.listenerCount('leave-full-screen')).toBe(0);
  expect(contentsEvents.listenerCount('before-input-event')).toBe(0);
});
