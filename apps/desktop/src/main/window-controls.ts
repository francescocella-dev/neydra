import { windowCommandSchema, type WindowResult } from '../shared/window-contracts';

export interface WindowPort {
  isDestroyed(): boolean;
  isFullScreen(): boolean;
  setFullScreen(enabled: boolean): void;
}
export function windowCommand(raw: unknown, trusted: boolean, window: WindowPort): WindowResult {
  if (!trusted) return { ok: false, code: 'untrusted-sender' };
  const parsed = windowCommandSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: 'invalid-request' };
  try {
    if (window.isDestroyed()) return { ok: false, code: 'unavailable' };
    if (parsed.data.type === 'setFullscreen') window.setFullScreen(parsed.data.input.enabled);
    // The native event publishes the final state if the OS transition is asynchronous.
    return { ok: true, state: { fullscreen: window.isFullScreen() } };
  } catch { return { ok: false, code: 'unavailable' }; }
}
export function fullscreenShortcut(input: { type: string; key: string; isAutoRepeat: boolean; control?: boolean; alt?: boolean; meta?: boolean }, window: WindowPort): boolean {
  if (input.type !== 'keyDown' || input.key !== 'F11' || input.isAutoRepeat || input.control || input.alt || input.meta || window.isDestroyed()) return false;
  window.setFullScreen(!window.isFullScreen());
  return true;
}
