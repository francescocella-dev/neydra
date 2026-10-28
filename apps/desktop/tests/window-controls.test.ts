import { expect, it, vi } from 'vitest';
import { fullscreenShortcut, windowCommand } from '../src/main/window-controls';
import { rendererAsset } from '../src/main/security';

function fixture() {
  let fullscreen = false;
  return { isDestroyed: vi.fn(() => false), isFullScreen: vi.fn(() => fullscreen), setFullScreen: vi.fn((value: boolean) => { fullscreen = value; }) };
}
it('only the trusted renderer can request native fullscreen; strict DTOs reject generic window operations', () => {
  const window = fixture();
  expect(windowCommand({ type: 'setFullscreen', input: { enabled: true } }, false, window)).toEqual({ ok: false, code: 'untrusted-sender' });
  for (const input of [null, { type: 'execute', code: 'fixture' }, { type: 'setFullscreen', input: { enabled: 'true' } }, { type: 'setFullscreen', input: { enabled: true, url: 'https://example.org' } }]) {
    expect(windowCommand(input, true, window)).toEqual({ ok: false, code: 'invalid-request' });
  }
  expect(window.setFullScreen).not.toHaveBeenCalled();
  expect(windowCommand({ type: 'setFullscreen', input: { enabled: true } }, true, window)).toEqual({ ok: true, state: { fullscreen: true } });
  expect(windowCommand({ type: 'getState' }, true, window)).toEqual({ ok: true, state: { fullscreen: true } });
  expect(windowCommand({ type: 'setFullscreen', input: { enabled: false } }, true, window)).toMatchObject({ state: { fullscreen: false } });
  window.isDestroyed.mockReturnValue(true);
  expect(windowCommand({ type: 'getState' }, true, window)).toEqual({ ok: false, code: 'unavailable' });
});
it('handles F11 in main once and leaves Escape, key-up and modified shortcuts alone', () => {
  const window = fixture();
  const input = { type: 'keyDown', key: 'F11', isAutoRepeat: false };
  expect(fullscreenShortcut(input, window)).toBe(true);
  expect(window.isFullScreen()).toBe(true);
  for (const other of [{ ...input, isAutoRepeat: true }, { ...input, type: 'keyUp' }, { ...input, key: 'Escape' }, { ...input, control: true }]) expect(fullscreenShortcut(other, window)).toBe(false);
  expect(window.setFullScreen).toHaveBeenCalledTimes(1);
  expect(fullscreenShortcut(input, window)).toBe(true);
  expect(window.isFullScreen()).toBe(false);
});
it('serves only local generated WOFF2 assets and retains path/query/remote restrictions', () => {
  expect(rendererAsset('app://desktop/assets/manrope-latin-ABC123.woff2')).toBe('assets/manrope-latin-ABC123.woff2');
  for (const url of ['https://fonts.example.org/a.woff2', 'app://desktop/fonts/a.woff2', 'app://desktop/assets/a.woff2?token=fixture', 'app://desktop/assets/../private.woff2', 'app://desktop/assets/a.ttf']) expect(rendererAsset(url)).toBeUndefined();
});
