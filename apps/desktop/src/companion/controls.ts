import type { CompanionBridge, CompanionResult } from '../shared/companion-contracts';

// No app-region:drag: native draggable regions swallow clicks. The main process
// measures the OS cursor in DIPs and distinguishes a click from a real drag.
export function bindCompanion(button: HTMLButtonElement, bridge: CompanionBridge) {
  let dragging = false;
  let frame: number | undefined;
  let menuOpen = false;
  button.setAttribute('aria-haspopup', 'menu');
  const offMenu = bridge.onMenuState(({ open }) => { menuOpen = open; button.setAttribute('aria-expanded', String(open)); });
  const run = (operation: () => Promise<CompanionResult>) => {
    void operation().then(result => { if (!result.ok) button.title = 'Comando non disponibile · riprova Apri NEYDRA'; })
      .catch(() => { button.title = 'Comando non disponibile · riprova Apri NEYDRA'; });
  };
  const clearFrame = () => { if (frame !== undefined) cancelAnimationFrame(frame); frame = undefined; };
  const cancel = () => { if (dragging) { dragging = false; clearFrame(); run(() => bridge.cancelDrag()); } };
  const focus = () => button.focus({ preventScroll: true });
  window.addEventListener('focus', focus);
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary) return;
    dragging = true;
    button.setPointerCapture(event.pointerId);
    run(() => bridge.beginDrag());
  });
  button.addEventListener('pointermove', () => {
    if (dragging && frame === undefined) frame = requestAnimationFrame(() => {
      frame = undefined; if (dragging) run(() => bridge.moveDrag());
    });
  });
  button.addEventListener('pointerup', event => {
    if (event.button !== 0 || !dragging) return;
    dragging = false; clearFrame(); run(() => bridge.endDrag());
    if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
  });
  button.addEventListener('pointercancel', cancel);
  button.addEventListener('lostpointercapture', cancel);
  window.addEventListener('blur', cancel);
  button.addEventListener('click', event => { if (event.detail === 0) run(() => bridge.restore()); });
  button.addEventListener('contextmenu', event => { event.preventDefault(); cancel(); run(() => bridge.openMenu({ keyboard: false })); });
  button.addEventListener('keydown', event => {
    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault(); cancel(); run(() => bridge.openMenu({ keyboard: true }));
    } else if (event.key === 'Escape') {
      event.preventDefault(); cancel(); run(() => bridge.closeMenu());
    } else if (menuOpen && ['Tab', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      run(() => bridge.navigateMenu(event.shiftKey || ['ArrowLeft', 'ArrowUp'].includes(event.key) ? 'last' : 'first'));
    }
  });
  return () => { clearFrame(); offMenu(); window.removeEventListener('blur', cancel); window.removeEventListener('focus', focus); };
}
