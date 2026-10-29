// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { bindOrbit } from '../src/orbit/controls';
let off: (() => void) | undefined;
afterEach(() => { off?.(); document.body.replaceChildren(); });
it('reveals and dismisses accessibly, navigates with arrows/Tab/Home/End, activates only on explicit click and locks duplicate exit', () => {
  const button = document.createElement('button'); button.disabled = true; document.body.append(button);
  let visibility!: (phase: 'reveal' | 'conceal') => void;
  const ok = async () => ({ ok: true as const });
  const bridge = { ready: vi.fn(ok), getRole: vi.fn(async () => ({ ok: true as const, role: 'exit' as const })), activate: vi.fn(ok), dismiss: vi.fn(ok), navigate: vi.fn<(direction: 'next' | 'previous' | 'first' | 'last') => ReturnType<typeof ok>>(ok),
    onVisibility: vi.fn((listener: typeof visibility) => { visibility = listener; return vi.fn(); }) };
  off = bindOrbit(button, bridge, 'exit');
  expect(button.getAttribute('aria-label')).toBe('Esci'); visibility('reveal'); expect(button.disabled).toBe(false);
  for (const key of ['ArrowRight', 'Tab', 'Home', 'End', 'Escape']) button.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
  expect(bridge.navigate.mock.calls.map(call => call[0])).toEqual(['next', 'next', 'first', 'last']);
  expect(bridge.dismiss).toHaveBeenCalledOnce();
  button.dispatchEvent(new MouseEvent('mouseenter')); expect(bridge.activate).not.toHaveBeenCalled();
  visibility('conceal'); button.click(); expect(bridge.activate).not.toHaveBeenCalled();
  visibility('reveal'); button.click(); button.click(); expect(bridge.activate).toHaveBeenCalledOnce(); expect(button.disabled).toBe(true);
});
