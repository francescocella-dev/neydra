import { companionCommandSchema, type CompanionResult } from '../shared/companion-contracts';

export interface Point { x: number; y: number }
export interface Rect extends Point { width: number; height: number }
export const COMPANION_SIZE = 120;
export interface CompanionWindow {
  isDestroyed(): boolean;
  isVisible(): boolean;
  show(): void;
  hide(): void;
  focus(): void;
  getBounds(): Rect;
  setPosition(x: number, y: number): void;
  destroy(): void;
}
interface MainWindow extends CompanionWindow {
  isMinimized(): boolean;
  isMaximized(): boolean;
  isFullScreen(): boolean;
  setFullScreen(enabled: boolean): void;
  restore(): void;
}

// Electron screen coordinates are DIPs, including negative origins and mixed-DPI displays.
// Choose an actual work area, never the bounding union (which may contain gaps).
export function reachablePosition(bounds: Rect, areas: Rect[], requireFit = true): Point | undefined {
  let best: Point | undefined;
  let distance = Infinity;
  for (const area of areas) {
    if (area.width <= 0 || area.height <= 0 || (requireFit && (area.width < bounds.width || area.height < bounds.height))) continue;
    const point = { x: Math.round(Math.max(area.x, Math.min(bounds.x, area.x + Math.max(0, area.width - bounds.width)))),
      y: Math.round(Math.max(area.y, Math.min(bounds.y, area.y + Math.max(0, area.height - bounds.height)))) };
    const next = (point.x - bounds.x) ** 2 + (point.y - bounds.y) ** 2;
    if (next < distance) { best = point; distance = next; }
  }
  return best;
}

export class CompanionController {
  private floating?: CompanionWindow;
  private pending = false;
  private epoch = 0;
  private disposed = false;
  private mini = false;
  private restoring = false;
  private fullscreenBeforeHide = false;
  private drag?: { cursor: Point; bounds: Rect; moved: boolean };
  constructor(private readonly main: MainWindow, private readonly create: () => Promise<CompanionWindow>,
    private readonly areas: () => Rect[], private readonly cursor: () => Point, private readonly quit: () => void,
    private readonly beforeChange: () => void = () => {}) {}

  async reduce(): Promise<CompanionResult> {
    if (this.disposed || this.main.isDestroyed()) return { ok: false, code: 'unavailable' };
    if (this.pending) return { ok: false, code: 'busy' };
    if (this.mini) return { ok: true };
    this.pending = true;
    const epoch = ++this.epoch;
    try {
      const floating = this.floating && !this.floating.isDestroyed() ? this.floating : await this.create();
      if (this.disposed || epoch !== this.epoch) {
        if (!floating.isDestroyed()) floating.destroy();
        return { ok: false, code: 'unavailable' };
      }
      this.floating = floating;
      if (!this.reposition()) throw new Error('No reachable companion position');
      floating.show();
      floating.focus();
      if (!floating.isVisible()) throw new Error('Companion not visible');
      this.fullscreenBeforeHide = this.main.isFullScreen();
      this.mini = true;
      this.main.hide(); // Only after a loaded, visible recovery window exists.
      return { ok: true };
    } catch {
      if (epoch === this.epoch) this.restore(); // A close/restore may have already recovered this creation.
      return { ok: false, code: 'unavailable' };
    } finally { this.pending = false; }
  }

  restore(): CompanionResult {
    if (this.disposed) return { ok: false, code: 'unavailable' };
    if (this.restoring) return { ok: true };
    ++this.epoch;
    this.drag = undefined;
    this.mini = false;
    this.restoring = true;
    const restoreFullscreen = this.fullscreenBeforeHide;
    this.fullscreenBeforeHide = false;
    let mainRestored = false;
    try {
      // Overlay callbacks must never prevent restoration of the original main.
      // A genuine callback error is rethrown after this critical recovery.
      let notificationFailure: { error: unknown } | undefined;
      try { this.beforeChange(); } catch (error) { notificationFailure = { error }; }
      if (this.main.isDestroyed()) throw new Error('Main unavailable');
      if (this.main.isMinimized()) this.main.restore();
      if (restoreFullscreen && !this.main.isFullScreen()) this.main.setFullScreen(true);
      if (!restoreFullscreen && !this.main.isFullScreen() && !this.main.isMaximized()) {
        const bounds = this.main.getBounds();
        const point = reachablePosition(bounds, this.areas(), false);
        if (point && (point.x !== bounds.x || point.y !== bounds.y)) this.main.setPosition(point.x, point.y);
      }
      this.main.show();
      this.main.focus();
      if (!this.main.isVisible()) throw new Error('Main not visible');
      mainRestored = true;
      if (notificationFailure) throw notificationFailure.error;
      if (this.floating && !this.floating.isDestroyed()) this.floating.hide();
      return { ok: true };
    } catch (error) {
      if (mainRestored) throw error;
      this.quit(); // Never leave an invisible, unrecoverable process.
      return { ok: false, code: 'unavailable' };
    } finally { this.restoring = false; }
  }
  nativeRestore() { if (this.pending && !this.restoring && !this.mini) this.restore(); }

  reposition(): boolean {
    if (!this.floating || this.floating.isDestroyed()) return false;
    const bounds = this.floating.getBounds();
    const point = reachablePosition(bounds, this.areas());
    if (!point) return false;
    if (point.x !== bounds.x || point.y !== bounds.y) this.floating.setPosition(point.x, point.y);
    return true;
  }
  displaysChanged() { this.beforeChange(); this.drag = undefined; if (this.floating && !this.reposition()) this.restore(); }
  recover(failed?: CompanionWindow) {
    // Detach a closing native window before restore: it may still report alive
    // while its webContents are gone. Do not hide/reuse that window again.
    if (failed && this.floating === failed) this.floating = undefined;
    if (!this.disposed && !this.restoring && (this.mini || this.pending)) this.restore();
  }

  beginDrag(): CompanionResult {
    if (!this.mini || !this.floating || this.floating.isDestroyed()) return { ok: false, code: 'unavailable' };
    this.beforeChange();
    this.drag = { cursor: this.cursor(), bounds: this.floating.getBounds(), moved: false };
    return { ok: true };
  }
  moveDrag(): CompanionResult {
    if (!this.drag || !this.floating || this.floating.isDestroyed()) return { ok: false, code: 'unavailable' };
    const point = this.cursor();
    const dx = point.x - this.drag.cursor.x, dy = point.y - this.drag.cursor.y;
    if (Math.hypot(dx, dy) >= 4) this.drag.moved = true;
    if (this.drag.moved) {
      const next = reachablePosition({ ...this.drag.bounds, x: this.drag.bounds.x + dx, y: this.drag.bounds.y + dy }, this.areas());
      if (!next) { this.restore(); return { ok: false, code: 'unavailable' }; }
      this.floating.setPosition(next.x, next.y);
    }
    return { ok: true };
  }
  endDrag(): CompanionResult {
    if (!this.drag) return { ok: false, code: 'unavailable' };
    const result = this.moveDrag(); // Include the final cursor position, even if pointermove was coalesced.
    if (!result.ok) return result;
    const moved = this.drag?.moved;
    this.drag = undefined;
    return moved === false ? this.restore() : { ok: true };
  }
  cancelDrag(): CompanionResult { this.drag = undefined; return { ok: true }; }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; ++this.epoch; this.drag = undefined; this.mini = false;
    const floating = this.floating;
    this.floating = undefined;
    try { this.beforeChange(); }
    finally { if (floating && !floating.isDestroyed()) floating.destroy(); }
  }
}

export async function companionCommand(raw: unknown, source: 'main' | 'companion' | undefined,
  controller: CompanionController, menu: (keyboard: boolean) => void | Promise<CompanionResult>, ready: () => void = () => {},
  dismiss: () => void = () => {}, navigate: (direction: 'next' | 'previous' | 'first' | 'last') => CompanionResult = () => ({ ok: false, code: 'unavailable' })): Promise<CompanionResult> {
  if (!source) return { ok: false, code: 'untrusted-sender' };
  const parsed = companionCommandSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: 'invalid-request' };
  const type = parsed.data.type;
  if ((source === 'main') !== (type === 'reduce')) return { ok: false, code: 'untrusted-sender' };
  try {
    switch (type) {
      case 'reduce': return await controller.reduce();
      case 'ready': ready(); return { ok: true };
      case 'restore': return controller.restore();
      case 'dragStart': return controller.beginDrag();
      case 'dragMove': return controller.moveDrag();
      case 'dragEnd': return controller.endDrag();
      case 'dragCancel': return controller.cancelDrag();
      case 'menu': controller.cancelDrag(); return await menu(parsed.data.input.keyboard) ?? { ok: true };
      case 'dismissMenu': dismiss(); return { ok: true };
      case 'navigateMenu': return navigate(parsed.data.direction);
    }
  } catch { controller.recover(); return { ok: false, code: 'unavailable' }; }
}
