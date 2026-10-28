import type { OrbitBridge, OrbitRole } from '../shared/orbit-contracts';

export function bindOrbit(button: HTMLButtonElement, bridge: OrbitBridge, role: OrbitRole) {
  button.dataset.role = role;
  button.setAttribute('aria-label', role === 'open' ? 'Apri NEYDRA' : 'Esci');
  button.title = role === 'open' ? 'Apri NEYDRA' : 'Esci';
  const run = (operation: () => Promise<unknown>) => { void operation().catch(() => { button.disabled = true; }); };
  const off = bridge.onVisibility(phase => {
    button.classList.remove('enter');
    button.disabled = phase !== 'reveal';
    if (phase === 'reveal') { void button.offsetWidth; button.classList.add('enter'); if (document.hasFocus()) button.focus(); }
  });
  const activate = () => { if (!button.disabled) { button.disabled = true; run(() => bridge.activate()); } };
  const context = (event: MouseEvent) => { event.preventDefault(); run(() => bridge.dismiss()); };
  const keyboard = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); run(() => bridge.dismiss()); }
    else if (['Tab', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const direction = event.key === 'Home' ? 'first' : event.key === 'End' ? 'last'
        : event.shiftKey || ['ArrowLeft', 'ArrowUp'].includes(event.key) ? 'previous' : 'next';
      run(() => bridge.navigate(direction));
    }
  };
  button.addEventListener('click', activate); button.addEventListener('keydown', keyboard); button.addEventListener('contextmenu', context);
  return () => { off(); button.removeEventListener('click', activate); button.removeEventListener('keydown', keyboard); button.removeEventListener('contextmenu', context); };
}
