// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { bindCompanion } from '../src/companion/controls';

let unbind: (() => void) | undefined;
afterEach(() => { unbind?.(); document.body.replaceChildren(); vi.unstubAllGlobals(); });
function fixture() {
  const button = document.createElement('button'); document.body.append(button);
  const ok = async () => ({ ok: true as const });
  const bridge = { ready: vi.fn(ok), restore: vi.fn(ok), beginDrag: vi.fn(ok), moveDrag: vi.fn(ok), endDrag: vi.fn(ok), cancelDrag: vi.fn(ok), openMenu: vi.fn(ok) };
  button.setPointerCapture = vi.fn(); button.hasPointerCapture = vi.fn(() => true); button.releasePointerCapture = vi.fn();
  let nextFrame: FrameRequestCallback | undefined;
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { nextFrame = callback; return 1; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn(() => { nextFrame = undefined; }));
  unbind = bindCompanion(button, bridge);
  return { button, bridge, frame() { const callback = nextFrame; nextFrame = undefined; callback?.(0); },
    pointer(type: string, properties = {}) {
      const event = new Event(type); Object.assign(event, { button: 0, isPrimary: true, pointerId: 1, ...properties }); button.dispatchEvent(event);
    } };
}
it('captures and coalesces drag pointer events, flushes the final point via endDrag and does not also activate on mouse click', () => {
  const f = fixture(); f.pointer('pointerdown');
  expect(f.button.setPointerCapture).toHaveBeenCalledWith(1); expect(f.bridge.beginDrag).toHaveBeenCalledOnce();
  f.pointer('pointermove'); f.pointer('pointermove'); f.frame(); expect(f.bridge.moveDrag).toHaveBeenCalledOnce();
  f.pointer('pointermove'); f.pointer('pointerup'); f.frame();
  expect(f.bridge.endDrag).toHaveBeenCalledOnce(); expect(f.bridge.moveDrag).toHaveBeenCalledOnce();
  expect(f.button.releasePointerCapture).toHaveBeenCalledWith(1);
  f.button.dispatchEvent(new MouseEvent('click', { detail: 1 })); expect(f.bridge.restore).not.toHaveBeenCalled();
});
it('supports keyboard activation and context menu; secondary pointers never begin a drag', () => {
  const f = fixture(); f.pointer('pointerdown', { button: 2 }); f.pointer('pointerdown', { isPrimary: false });
  expect(f.bridge.beginDrag).not.toHaveBeenCalled();
  f.button.click(); expect(f.bridge.restore).toHaveBeenCalledOnce();
  const context = new MouseEvent('contextmenu', { cancelable: true }); f.button.dispatchEvent(context);
  expect(context.defaultPrevented).toBe(true); expect(f.bridge.openMenu).toHaveBeenCalledOnce();
  f.button.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, cancelable: true }));
  expect(f.bridge.openMenu).toHaveBeenCalledTimes(2);
});
it('cancels on pointer cancellation, capture loss or blur without restoring; reports IPC failure without retry', async () => {
  const f = fixture();
  for (const type of ['pointercancel', 'lostpointercapture', 'blur']) {
    f.pointer('pointerdown'); f.pointer('pointermove');
    if (type === 'blur') window.dispatchEvent(new Event('blur')); else f.pointer(type);
    f.frame(); f.pointer('pointerup');
  }
  expect(f.bridge.cancelDrag).toHaveBeenCalledTimes(3); expect(f.bridge.endDrag).not.toHaveBeenCalled();
  expect(f.bridge.restore).not.toHaveBeenCalled(); expect(f.bridge.moveDrag).not.toHaveBeenCalled();
  f.bridge.restore.mockRejectedValueOnce(new Error('synthetic')); f.button.click();
  await vi.waitFor(() => expect(f.button.title).toContain('Comando non disponibile'));
  expect(f.bridge.restore).toHaveBeenCalledOnce();
});
