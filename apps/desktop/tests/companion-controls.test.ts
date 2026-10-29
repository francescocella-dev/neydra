// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { bindCompanion } from '../src/companion/controls';
import userEvent from '@testing-library/user-event';

let unbind: (() => void) | undefined;
afterEach(() => { unbind?.(); document.body.replaceChildren(); vi.unstubAllGlobals(); });
function fixture() {
  const button = document.createElement('button'); document.body.append(button);
  const ok = async () => ({ ok: true as const });
  let menuListener: ((state: { open: boolean }) => void) | undefined;
  const bridge = { ready: vi.fn(ok), getMode: vi.fn(async () => ({ ok: true, mode: 'circle' } as const)), restore: vi.fn(ok), openMenu: vi.fn(ok),
    closeMenu: vi.fn(ok), navigateMenu: vi.fn(ok), onMenuState: vi.fn((listener: (state: { open: boolean }) => void) => { menuListener = listener; return vi.fn(); }) };
  button.setPointerCapture = vi.fn(); button.releasePointerCapture = vi.fn();
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  unbind = bindCompanion(button, bridge);
  return { button, bridge, menu(open: boolean) { menuListener?.({ open }); } };
}
it('ignores mouse movement without capture, frames or bridge movement; mouse click restores once', () => {
  const f = fixture();
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) f.button.dispatchEvent(new Event(type));
  expect(f.button.setPointerCapture).not.toHaveBeenCalled(); expect(requestAnimationFrame).not.toHaveBeenCalled();
  expect(f.bridge.restore).not.toHaveBeenCalled();
  f.button.dispatchEvent(new MouseEvent('click', { detail: 1 })); expect(f.bridge.restore).toHaveBeenCalledOnce();
});
it('uses native Enter/Space activation once and preserves focus/menu/Escape navigation', async () => {
  const f = fixture(), user = userEvent.setup();
  window.dispatchEvent(new Event('focus')); expect(document.activeElement).toBe(f.button);
  await user.keyboard('{Enter}'); expect(f.bridge.restore).toHaveBeenCalledTimes(1);
  await user.keyboard(' '); expect(f.bridge.restore).toHaveBeenCalledTimes(2);
  const context = new MouseEvent('contextmenu', { cancelable: true }); f.button.dispatchEvent(context);
  expect(context.defaultPrevented).toBe(true); expect(f.bridge.openMenu).toHaveBeenLastCalledWith({ keyboard: false });
  f.button.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, cancelable: true }));
  expect(f.bridge.openMenu).toHaveBeenLastCalledWith({ keyboard: true });
  f.menu(true); f.button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }));
  expect(f.bridge.navigateMenu).toHaveBeenCalledWith('first');
  f.button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })); expect(f.bridge.closeMenu).toHaveBeenCalledOnce();
});
it('removes listeners and reports failures without repeated requests', async () => {
  const f = fixture(); f.bridge.restore.mockRejectedValueOnce(new Error('synthetic')); f.button.click();
  await vi.waitFor(() => expect(f.button.title).toContain('Comando non disponibile'));
  expect(f.bridge.restore).toHaveBeenCalledOnce(); unbind?.(); unbind = undefined;
  f.button.click(); expect(f.bridge.restore).toHaveBeenCalledOnce();
});
