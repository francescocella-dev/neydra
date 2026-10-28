import type { CompanionResult } from '../shared/companion-contracts';
import { orbitCommandSchema, type OrbitDirection, type OrbitRole } from '../shared/orbit-contracts';
import type { Rect } from './companion-controller';

export const SATELLITE_SIZE = 72;
type Size = Pick<Rect, 'width' | 'height'>;
type SatelliteSizes = Record<OrbitRole, Size>;
export interface Satellite {
  isDestroyed(): boolean;
  getBounds(): Rect;
  setPosition(x: number, y: number): void;
  reveal(): void;
  conceal(animate: boolean): void;
  focus(): void;
  destroy(): void;
}
const contains = (area: Rect, box: Rect) => box.x >= area.x && box.y >= area.y && box.x + box.width <= area.x + area.width && box.y + box.height <= area.y + area.height;
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width + 4 && b.x < a.x + a.width + 4 && a.y < b.y + b.height + 4 && b.y < a.y + a.height + 4;
const valid = (box: Rect) => Object.values(box).every(Number.isFinite) && box.width > 0 && box.height > 0;

// Four DIP is separation between native input surfaces, never a size tolerance.
export function orbitFits(core: Rect, areas: Rect[], boxes: Record<OrbitRole, Rect>): boolean {
  return [core, boxes.open, boxes.exit].every(valid) && !overlaps(boxes.open, core) && !overlaps(boxes.exit, core)
    && !overlaps(boxes.open, boxes.exit) && areas.some(area => contains(area, core) && contains(area, boxes.open) && contains(area, boxes.exit));
}

// The core never moves or resizes to accommodate a menu. Both small native
// overlays must fit a real work area; empty monitor gaps are never candidates.
export function orbitPlacement(core: Rect, areas: Rect[], sizes: SatelliteSizes = {
  open: { width: SATELLITE_SIZE, height: SATELLITE_SIZE }, exit: { width: SATELLITE_SIZE, height: SATELLITE_SIZE },
}): Record<OrbitRole, Rect> | undefined {
  for (const area of areas.filter(area => contains(area, core))) {
    const center = { x: core.x + core.width / 2, y: core.y + core.height / 2 };
    const angles = [315, 45, 0, 90, 270, 180, 225, 135];
    const candidates = (size: Size) => angles.map(angle => ({ angle, x: Math.round(center.x + 106 * Math.cos(angle * Math.PI / 180) - size.width / 2),
      y: Math.round(center.y + 106 * Math.sin(angle * Math.PI / 180) - size.height / 2), width: size.width, height: size.height }))
      .filter(box => valid(box) && contains(area, box) && !overlaps(box, core));
    const angleDistance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
    const pairs = candidates(sizes.open).flatMap(open => candidates(sizes.exit).filter(exit => !overlaps(open, exit)).map(exit => ({ open, exit,
      score: angleDistance(open.angle, 315) + angleDistance(exit.angle, 45) })));
    pairs.sort((a, b) => a.score - b.score);
    const pair = pairs[0];
    if (pair) return { open: { x: pair.open.x, y: pair.open.y, width: pair.open.width, height: pair.open.height },
      exit: { x: pair.exit.x, y: pair.exit.y, width: pair.exit.width, height: pair.exit.height } };
  }
}

export class OrbitController {
  private windows = new Map<OrbitRole, Satellite>();
  private epoch = 0;
  private opening = false;
  private creating = false;
  private opened = false;
  private disposed = false;
  private selected: OrbitRole = 'open';
  constructor(private readonly core: () => Rect | undefined, private readonly areas: () => Rect[],
    private readonly create: (role: OrbitRole) => Promise<Satellite>, private readonly changed: (open: boolean) => void,
    private readonly focusCore: () => void, private readonly restore: () => void, private readonly quit: () => void) {}

  async toggle(keyboard: boolean): Promise<CompanionResult> {
    if (this.disposed) return { ok: false, code: 'unavailable' };
    if (this.opened || this.opening) { this.close(true); return { ok: true }; }
    if (this.creating) return { ok: false, code: 'busy' };
    const core = this.core();
    const positions = core && orbitPlacement(core, this.areas());
    if (!positions) return { ok: false, code: 'unavailable' };
    const epoch = ++this.epoch;
    this.opening = true;
    this.creating = true;
    try {
      // Sequential creation also lets a second right click cancel without orphans.
      for (const role of ['open', 'exit'] as const) {
        let window = this.windows.get(role);
        if (!window || window.isDestroyed()) {
          window = await this.create(role);
          if (this.disposed || epoch !== this.epoch) { if (!window.isDestroyed()) window.destroy(); return { ok: false, code: 'unavailable' }; }
          this.windows.set(role, window);
        }
        if (window.isDestroyed()) throw new Error('Satellite unavailable');
        window.conceal(false);
      }
      if (epoch !== this.epoch || !this.core()) throw new Error('Menu cancelled');
      // Native minima and a move to another DPI can change the requested size.
      // Measure after loading, then again after positioning. At most one replan.
      let fitted = false;
      for (let attempt = 0; attempt < 2; ++attempt) {
        const core = this.core();
        if (!core) throw new Error('Core unavailable');
        const boxes = this.bounds();
        const actualPositions = boxes && orbitPlacement(core, this.areas(), boxes);
        if (!actualPositions) break;
        for (const role of ['open', 'exit'] as const) this.windows.get(role)!.setPosition(actualPositions[role].x, actualPositions[role].y);
        const actual = this.bounds();
        if (actual && orbitFits(core, this.areas(), actual)) { fitted = true; break; }
      }
      if (!fitted) throw new Error('Native satellite bounds do not fit');
      this.opened = true;
      for (const window of this.windows.values()) {
        if (!this.opened) throw new Error('Menu closed during reveal');
        window.reveal();
      }
      if (!this.opened || !this.validate()) throw new Error('Native bounds changed on reveal');
      this.changed(true);
      if (keyboard) this.navigate('first');
      return { ok: true };
    } catch {
      this.close(false);
      return { ok: false, code: 'unavailable' };
    } finally { this.creating = false; if (epoch === this.epoch) this.opening = false; }
  }
  private bounds(): Record<OrbitRole, Rect> | undefined {
    const open = this.windows.get('open'), exit = this.windows.get('exit');
    if (!open || !exit || open.isDestroyed() || exit.isDestroyed()) return;
    return { open: open.getBounds(), exit: exit.getBounds() };
  }
  validate(): boolean {
    if (!this.opened) return true;
    const core = this.core(), boxes = this.bounds();
    if (core && boxes && orbitFits(core, this.areas(), boxes)) return true;
    this.close(false); return false;
  }
  close(focusCore = false, animate = false) {
    ++this.epoch; this.opened = false; this.opening = false;
    for (const window of this.windows.values()) if (!window.isDestroyed()) window.conceal(animate);
    this.changed(false);
    if (focusCore && !this.disposed) this.focusCore();
  }
  navigate(direction: OrbitDirection): CompanionResult {
    if (!this.opened) return { ok: false, code: 'unavailable' };
    this.selected = direction === 'first' ? 'open' : direction === 'last' ? 'exit' : this.selected === 'open' ? 'exit' : 'open';
    const window = this.windows.get(this.selected);
    if (!window || window.isDestroyed()) { this.close(true); return { ok: false, code: 'unavailable' }; }
    window.focus(); return { ok: true };
  }
  focused(role: OrbitRole) { this.selected = role; }
  activate(role: OrbitRole): CompanionResult {
    if (!this.opened) return { ok: false, code: 'unavailable' };
    this.close(false);
    if (role === 'open') this.restore(); else this.quit();
    return { ok: true };
  }
  dispose() {
    this.disposed = true; this.close();
    for (const window of this.windows.values()) if (!window.isDestroyed()) window.destroy();
    this.windows.clear();
  }
}

export function orbitCommand(raw: unknown, role: OrbitRole | undefined, orbit: OrbitController, ready: () => void) {
  if (!role) return { ok: false as const, code: 'untrusted-sender' as const };
  const parsed = orbitCommandSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, code: 'invalid-request' as const };
  switch (parsed.data.type) {
    case 'role': return { ok: true as const, role };
    case 'ready': ready(); return { ok: true as const };
    case 'activate': return orbit.activate(role); // No renderer-selected role or quit target.
    case 'dismiss': orbit.close(true, true); return { ok: true as const };
    case 'navigate': return orbit.navigate(parsed.data.direction);
  }
}
