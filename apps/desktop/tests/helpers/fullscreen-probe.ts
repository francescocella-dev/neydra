import type { Event, Input, KeyboardInputEvent } from 'electron';

export type FullscreenPhase = 'button-enter' | 'f11-exit' | 'f11-enter' | 'button-exit';
interface ProbeWindow {
  isDestroyed(): boolean;
  isFocused(): boolean;
  isMinimized(): boolean;
  isFullScreen(): boolean;
  setFullScreen(enabled: boolean): void;
  focus(): void;
  on(name: string, listener: () => void): unknown;
  off(name: string, listener: () => void): unknown;
  webContents: {
    isFocused(): boolean;
    focus(): void;
    sendInputEvent(input: KeyboardInputEvent): void;
    on(name: 'before-input-event', listener: (event: Event, input: Input) => void): unknown;
    off(name: 'before-input-event', listener: (event: Event, input: Input) => void): unknown;
  };
}

// Executed in the Electron main process by evaluateHandle; all instrumentation is test-only.
// Never records other keys, text, URLs, account data, headers or raw errors.
export function observeFullscreen({ BrowserWindow }: { BrowserWindow: { getAllWindows(): ProbeWindow[] } }) {
  const windows = BrowserWindow.getAllWindows();
  const target = windows[0];
  if (windows.length !== 1 || !target) throw new Error('Expected one Electron test window');
  let phase: FullscreenPhase = 'button-enter';
  const inputs: { phase: FullscreenPhase; down: boolean; repeat: boolean; modified: boolean; prevented: boolean; focused: boolean }[] = [];
  const calls: { phase: FullscreenPhase; enabled: boolean; threw: boolean }[] = [];
  const transitions: { phase: FullscreenPhase; fullscreen: boolean }[] = [];
  const nativeSetFullScreen = target.setFullScreen;
  // Transparent spy: only production code invokes this method. It always forwards to Electron.
  target.setFullScreen = function (enabled) {
    const call = { phase, enabled, threw: false };
    if (calls.length < 16) calls.push(call);
    try { nativeSetFullScreen.call(this, enabled); }
    catch (error) { call.threw = true; throw error; }
  };
  const onInput = (event: Event, input: Input) => {
    if (input.key !== 'F11' || inputs.length >= 16) return;
    inputs.push({ phase, down: input.type === 'keyDown', repeat: input.isAutoRepeat,
      modified: input.control || input.alt || input.meta, prevented: event.defaultPrevented,
      focused: target.isFocused() && target.webContents.isFocused() });
  };
  const onEnter = () => { if (transitions.length < 16) transitions.push({ phase, fullscreen: true }); };
  const onLeave = () => { if (transitions.length < 16) transitions.push({ phase, fullscreen: false }); };
  // App listeners already exist, so defaultPrevented reflects their decision.
  target.webContents.on('before-input-event', onInput);
  target.on('enter-full-screen', onEnter);
  target.on('leave-full-screen', onLeave);
  return {
    begin(next: FullscreenPhase) { phase = next; },
    focus() { target.focus(); target.webContents.focus(); },
    pressF11() {
      if (!target.isFocused() || !target.webContents.isFocused()) throw new Error('F11 test window is not focused');
      target.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'F11' });
      target.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'F11' });
    },
    snapshot() {
      return { phase, destroyed: target.isDestroyed(), focused: target.isFocused(),
        contentsFocused: target.webContents.isFocused(), minimized: target.isMinimized(),
        fullscreen: target.isFullScreen(), inputs: inputs.map(input => ({ ...input })),
        calls: calls.map(call => ({ ...call })), transitions: transitions.map(transition => ({ ...transition })) };
    },
    dispose() {
      target.setFullScreen = nativeSetFullScreen;
      target.webContents.off('before-input-event', onInput);
      target.off('enter-full-screen', onEnter);
      target.off('leave-full-screen', onLeave);
    },
  };
}
