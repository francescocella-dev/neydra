import type { CompanionBridge, CompanionResult } from '../shared/companion-contracts';

export function bindCompanion(button: HTMLButtonElement, bridge: CompanionBridge) {
  let menuOpen = false;
  button.setAttribute('aria-haspopup', 'menu');
  const offMenu = bridge.onMenuState(({ open }) => { menuOpen = open; button.setAttribute('aria-expanded', String(open)); });
  const run = (operation: () => Promise<CompanionResult>) => {
    void operation().then(result => { if (!result.ok) button.title = 'Comando non disponibile · riprova Apri NEYDRA'; })
      .catch(() => { button.title = 'Comando non disponibile · riprova Apri NEYDRA'; });
  };
  const focus = () => button.focus({ preventScroll: true });
  const click = () => run(() => bridge.restore()); // Native button covers mouse, Enter and Space once.
  const context = (event: MouseEvent) => { event.preventDefault(); run(() => bridge.openMenu({ keyboard: false })); };
  const keyboard = (event: KeyboardEvent) => {
    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault(); run(() => bridge.openMenu({ keyboard: true }));
    } else if (event.key === 'Escape') {
      event.preventDefault(); run(() => bridge.closeMenu());
    } else if (menuOpen && ['Tab', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) {
      event.preventDefault(); run(() => bridge.navigateMenu(event.shiftKey || ['ArrowLeft', 'ArrowUp'].includes(event.key) ? 'last' : 'first'));
    }
  };
  window.addEventListener('focus', focus);
  button.addEventListener('click', click); button.addEventListener('contextmenu', context); button.addEventListener('keydown', keyboard);
  return () => {
    offMenu(); window.removeEventListener('focus', focus); button.removeEventListener('click', click);
    button.removeEventListener('contextmenu', context); button.removeEventListener('keydown', keyboard);
  };
}
