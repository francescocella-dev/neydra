import type { CompanionBridge, CompanionResult } from '../shared/companion-contracts';

// No app-region:drag: native draggable regions swallow clicks. The main process
// measures the OS cursor in DIPs and distinguishes a click from a real drag.
export function bindCompanion(button: HTMLButtonElement, bridge: CompanionBridge) {
  let dragging = false;
  let frame: number | undefined;
  const run = (operation: () => Promise<CompanionResult>) => {
    void operation().then(result => { if (!result.ok) button.title = 'Comando non disponibile · riprova Apri NEYDRA'; })
      .catch(() => { button.title = 'Comando non disponibile · riprova Apri NEYDRA'; });
  };
  const clearFrame = () => { if (frame !== undefined) cancelAnimationFrame(frame); frame = undefined; };
  const cancel = () => { if (dragging) { dragging = false; clearFrame(); run(() => bridge.cancelDrag()); } };
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
  button.addEventListener('contextmenu', event => { event.preventDefault(); cancel(); run(() => bridge.openMenu()); });
  button.addEventListener('keydown', event => {
    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault(); cancel(); run(() => bridge.openMenu());
    }
  });
  return () => { clearFrame(); window.removeEventListener('blur', cancel); };
}
