import { expect, it, vi } from 'vitest';
import { OrbitController, orbitCommand, orbitPlacement, orbitFits, type Satellite } from '../src/main/orbit-controller';
import type { OrbitRole } from '../src/shared/orbit-contracts';
import { orbitAsset, ORBIT_URL, COMPANION_URL, trustedOrbit } from '../src/main/companion-security';

function satelliteFixture(width = 72, height = 72) {
  let bounds = { x: 0, y: 0, width, height };
  return { isDestroyed: vi.fn(() => false), getBounds: vi.fn(() => ({ ...bounds })),
    setPosition: vi.fn((x: number, y: number) => { bounds = { ...bounds, x, y }; }),
    resize(width: number, height: number) { bounds = { ...bounds, width, height }; },
    reveal: vi.fn(), conceal: vi.fn(), focus: vi.fn(), destroy: vi.fn() };
}
function fixture() {
  const core = { x: 300, y: 250, width: 120, height: 120 };
  const windows: ReturnType<typeof satelliteFixture>[] = [];
  const create = vi.fn<(role: OrbitRole) => Promise<Satellite>>(async () => {
    const window = satelliteFixture();
    windows.push(window); return window;
  });
  const changed = vi.fn(), focus = vi.fn(), restore = vi.fn(), quit = vi.fn();
  const orbit = new OrbitController(() => core, () => [{ x: 0, y: 0, width: 1024, height: 688 }], create, changed, focus, restore, quit);
  return { orbit, create, windows, changed, focus, restore, quit, core };
}
it('keeps both satellites in actual work areas at all edges/corners, including negative and DPI-equivalent areas, without moving core', () => {
  const areas = [{ x: 0, y: 0, width: 1920, height: 1040 }, { x: -853, y: -100, width: 853, height: 573 },
    { x: 2500, y: 200, width: 720, height: 480 }, { x: -1024, y: 1000, width: 1024, height: 688 }];
  for (const area of areas) for (const x of [area.x, area.x + (area.width - 120) / 2, area.x + area.width - 120]) {
    for (const y of [area.y, area.y + (area.height - 120) / 2, area.y + area.height - 120]) {
      const core = { x, y, width: 120, height: 120 }, original = { ...core };
      const placement = orbitPlacement(core, areas)!;
      expect(placement).toBeDefined(); expect(core).toEqual(original);
      for (const box of Object.values(placement)) {
        expect(box.width).toBe(72); expect(box.height).toBe(72);
        expect(box.x).toBeGreaterThanOrEqual(area.x); expect(box.y).toBeGreaterThanOrEqual(area.y);
        expect(box.x + box.width).toBeLessThanOrEqual(area.x + area.width);
        expect(box.y + box.height).toBeLessThanOrEqual(area.y + area.height);
      }
      const { open, exit } = placement;
      const disjoint = (a: typeof core, b: typeof core) => a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
      expect(disjoint(open, exit)).toBe(true); expect(disjoint(open, core)).toBe(true); expect(disjoint(exit, core)).toBe(true);
    }
  }
  expect(orbitPlacement({ x: 500, y: 0, width: 120, height: 120 }, [{ x: 0, y: 0, width: 400, height: 500 }, { x: 1000, y: 0, width: 400, height: 500 }])).toBeUndefined();
  expect(orbitPlacement({ x: 0, y: 0, width: 120, height: 120 }, [{ x: 0, y: 0, width: 120, height: 120 }])).toBeUndefined();
});
it('toggles, reuses exactly two overlays, keeps core immutable and supports keyboard navigation without hover actions', async () => {
  const f = fixture(), before = { ...f.core };
  expect(await f.orbit.toggle(true)).toEqual({ ok: true });
  expect(f.windows).toHaveLength(2); expect(f.windows[0]!.focus).toHaveBeenCalledOnce();
  f.orbit.navigate('next'); expect(f.windows[1]!.focus).toHaveBeenCalledOnce();
  f.orbit.focused('exit'); f.orbit.navigate('previous'); expect(f.windows[0]!.focus).toHaveBeenCalledTimes(2);
  expect(f.restore).not.toHaveBeenCalled(); expect(f.quit).not.toHaveBeenCalled();
  await f.orbit.toggle(false); expect(f.focus).toHaveBeenCalledOnce();
  expect(f.windows[0]!.conceal).toHaveBeenCalledWith(false);
  await f.orbit.toggle(false); expect(f.create).toHaveBeenCalledTimes(2); expect(f.core).toEqual(before);
  f.orbit.close(false, true); expect(f.windows[0]!.conceal).toHaveBeenLastCalledWith(true);
  expect(f.orbit.activate('exit')).toMatchObject({ code: 'unavailable' }); expect(f.quit).not.toHaveBeenCalled();
});
it('authorizes activation only from the assigned satellite, rejects extra payloads and never grants core/chat APIs', async () => {
  const f = fixture();
  expect(orbitCommand({ type: 'activate' }, undefined, f.orbit, vi.fn())).toMatchObject({ code: 'untrusted-sender' });
  for (const raw of [{ type: 'activate', role: 'exit' }, { type: 'startChatGPT' }, { type: 'navigate', direction: 'elsewhere' }, { type: 'role', token: 'synthetic' }]) {
    expect(orbitCommand(raw, 'open', f.orbit, vi.fn())).toMatchObject({ code: 'invalid-request' });
  }
  expect(orbitCommand({ type: 'role' }, 'open', f.orbit, vi.fn())).toEqual({ ok: true, role: 'open' });
  await f.orbit.toggle(false); orbitCommand({ type: 'activate' }, 'open', f.orbit, vi.fn());
  expect(f.restore).toHaveBeenCalledOnce(); expect(f.quit).not.toHaveBeenCalled();
  await f.orbit.toggle(false); orbitCommand({ type: 'activate' }, 'exit', f.orbit, vi.fn());
  expect(f.quit).toHaveBeenCalledOnce();
  expect(trustedOrbit(2, 2, ORBIT_URL, true)).toBe(true);
  expect(trustedOrbit(2, 2, ORBIT_URL, false)).toBe(false);
  expect(trustedOrbit(2, 2, COMPANION_URL, true)).toBe(false);
  expect(orbitAsset(ORBIT_URL)).toBe('index.html'); expect(orbitAsset(COMPANION_URL)).toBeUndefined();
  for (const url of ['https://example.org', 'app://orbit/index.html?role=exit', 'app://orbit/secret.json', 'app://orbit/assets/a.js.map']) expect(orbitAsset(url)).toBeUndefined();
});
it('cancels pending creation on second click, drag/restore/disposal without orphaning a late window', async () => {
  for (const action of ['close', 'dispose'] as const) {
    const f = fixture(); let finish!: (window: Satellite) => void;
    f.create.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.orbit.toggle(false);
    f.orbit[action]();
    expect(await f.orbit.toggle(false)).toMatchObject({ code: action === 'dispose' ? 'unavailable' : 'busy' });
    expect(f.create).toHaveBeenCalledOnce();
    const late = satelliteFixture();
    finish(late); expect(await pending).toMatchObject({ code: 'unavailable' });
    expect(late.destroy).toHaveBeenCalledOnce(); expect(late.reveal).not.toHaveBeenCalled();
  }
});
it('recovers from failed creation and disposes every overlay; no automatic retry or exit', async () => {
  const f = fixture(); f.create.mockRejectedValueOnce(new Error('synthetic'));
  expect(await f.orbit.toggle(false)).toMatchObject({ code: 'unavailable' });
  expect(f.changed).toHaveBeenLastCalledWith(false); expect(f.create).toHaveBeenCalledOnce();
  expect(f.quit).not.toHaveBeenCalled();
  await f.orbit.toggle(false); f.orbit.dispose();
  for (const window of f.windows) expect(window.destroy).toHaveBeenCalledOnce();
  expect(await f.orbit.toggle(false)).toMatchObject({ code: 'unavailable' });
});

it('uses each measured native size, including unequal DPI-rounded bounds, for placement and collisions', async () => {
  const f = fixture(), open = satelliteFixture(80, 74), exit = satelliteFixture(73, 78);
  f.create.mockResolvedValueOnce(open).mockResolvedValueOnce(exit);
  expect(await f.orbit.toggle(false)).toEqual({ ok: true });
  expect(orbitFits(f.core, [{ x: 0, y: 0, width: 1024, height: 688 }], { open: open.getBounds(), exit: exit.getBounds() })).toBe(true);
  expect(open.getBounds()).toMatchObject({ width: 80, height: 74 });
  // Raw measured Rects include x/y. They must not override calculated positions.
  expect(open.getBounds()).not.toMatchObject({ x: 0, y: 0 });
});
it('rechecks native bounds after a move across DPI and permits only one replan before revealing', async () => {
  const f = fixture(); f.core.x = 904; f.core.y = 568;
  const open = satelliteFixture(), exit = satelliteFixture();
  const move = open.setPosition.getMockImplementation()!;
  open.setPosition.mockImplementationOnce((x, y) => { move(x, y); open.resize(80, 80); });
  f.create.mockResolvedValueOnce(open).mockResolvedValueOnce(exit);
  expect(await f.orbit.toggle(false)).toEqual({ ok: true });
  expect(open.setPosition).toHaveBeenCalledTimes(2);
  expect(orbitFits(f.core, [{ x: 0, y: 0, width: 1024, height: 688 }], { open: open.getBounds(), exit: exit.getBounds() })).toBe(true);
  expect(open.reveal).toHaveBeenCalledOnce();
});
it('closes on later unsafe native changes and refuses impossible measured bounds without tolerance or automatic retry', async () => {
  const f = fixture(); await f.orbit.toggle(false);
  f.windows[0]!.resize(500, 500); expect(f.orbit.validate()).toBe(false);
  expect(f.changed).toHaveBeenLastCalledWith(false); expect(f.quit).not.toHaveBeenCalled();
  const impossible = fixture(), oversized = satelliteFixture(500, 500); impossible.create.mockResolvedValueOnce(oversized);
  expect(await impossible.orbit.toggle(false)).toMatchObject({ code: 'unavailable' });
  for (const window of impossible.windows) expect(window.reveal).not.toHaveBeenCalled();
  expect(oversized.reveal).not.toHaveBeenCalled();
  expect(impossible.quit).not.toHaveBeenCalled();
});
