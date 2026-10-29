import { expect, it } from 'vitest';
import { satelliteGeometryProblems, satelliteShape, physicallyCentered, type CompanionGeometry } from './helpers/companion-geometry';

function fixture(height = 73, scale = 1.25) {
  const native = (id: number, x: number) => ({ id, bounds: { x, y: 0, width: 72, height }, content: { x, y: 0, width: 72, height },
    minimum: [72, 72], maximum: [72, 72], resizable: false, zoom: 1, physicalBounds: undefined, scale, visible: true });
  const renderer = (id: number) => ({ id, present: true as const, width: 48, height: 48, x: 12, y: (height - 48) / 2, radius: '50%',
    layout: { x: 0, y: 0, width: 72, height, display: 'grid', align: 'center', justify: 'center' },
    transform: 'none', opacity: '1', disabled: false, hit: true, outlineWidth: 2, outlineOffset: 2, dpr: scale, viewport: { width: 72, height } });
  return { native: { bounds: { x: 100, y: 100, width: 120, height: 120 }, content: { x: 100, y: 100, width: 120, height: 120 }, scale,
    runtime: { electron: '45.1.0', chrome: 'test', platform: 'win32' }, requestedSatellite: { width: 72, height: 72 },
    displays: [{ workArea: { x: 0, y: 0, width: 400, height: 400 }, scale }], areas: [{ x: 0, y: 0, width: 400, height: 400 }],
    satellites: [native(2, 0), native(3, 250)] }, renderer: undefined, satellites: [renderer(2), renderer(3)] } satisfies CompanionGeometry;
}
it('checks exact 48 CSS circles centered in each actual viewport, including 72x73 native bounds at different DPI', () => {
  for (const scale of [1, 1.25, 1.5]) for (const height of [72, 73]) {
    const snapshot = fixture(height, scale);
    expect(satelliteGeometryProblems(snapshot)).toEqual([]);
    snapshot.satellites[0]!.transform = 'matrix(1, 0, 0, 1, 0, 0)'; // Final translate(0, 0) animation frame.
    expect(satelliteGeometryProblems(snapshot)).toEqual([]);
    // Viewport and native content are distinct measurements, not inferred equal.
    const renderer = snapshot.satellites[0]!;
    if (renderer.present) { renderer.viewport.height = 72; renderer.layout.height = 72; renderer.y = 12; }
    expect(satelliteGeometryProblems(snapshot)).toEqual([]);
  }
});
it('rejects deformation, displacement beyond physical quantization, clipping and unreachable controls', () => {
  const mutations = [
    (s: ReturnType<typeof fixture>) => { s.satellites[0]!.width = 49; },
    (s: ReturnType<typeof fixture>) => { s.satellites[0]!.y = 11.5; }, // More than half a physical pixel from the center.
    (s: ReturnType<typeof fixture>) => { s.satellites[0]!.outlineWidth = 20; },
    (s: ReturnType<typeof fixture>) => { s.satellites[0]!.disabled = true; },
    (s: ReturnType<typeof fixture>) => { s.satellites[0]!.hit = false; },
    (s: ReturnType<typeof fixture>) => { s.satellites[0]!.transform = 'matrix(1.1, 0, 0, 1.1, 0, 0)'; },
    (s: ReturnType<typeof fixture>) => { s.satellites[0]!.opacity = '0'; },
    (s: ReturnType<typeof fixture>) => { s.satellites[0]!.dpr = NaN; },
  ];
  for (const mutate of mutations) { const snapshot = fixture(); mutate(snapshot); expect(satelliteGeometryProblems(snapshot).length).toBeGreaterThan(0); }
});
it('uses the measured extra DIP at the work-area edge and rejects native collisions and missing renderers', () => {
  const snapshot = fixture();
  snapshot.native.areas[0]!.height = 72;
  expect(satelliteGeometryProblems(snapshot)).toContain('satellite-2: work-area');
  snapshot.native.areas[0]!.height = 73;
  expect(satelliteGeometryProblems(snapshot)).toEqual([]);
  snapshot.native.satellites[1]!.bounds.x = 70;
  expect(satelliteGeometryProblems(snapshot)).toContain('satellite-collision');
  snapshot.native.satellites[1]!.bounds = { x: 100, y: 100, width: 72, height: 73 };
  expect(satelliteGeometryProblems(snapshot)).toContain('satellite-3: core-collision');
  snapshot.satellites = [];
  expect(satelliteGeometryProblems(snapshot)).toContain('satellite-2: missing-renderer');
});
it('detects native, content, viewport and visual instability while ignoring focus outline changes', () => {
  const snapshot = fixture(), baseline = satelliteShape(snapshot);
  snapshot.satellites[0]!.outlineWidth = 0;
  expect(satelliteShape(snapshot)).toEqual(baseline);
  snapshot.native.satellites[0]!.bounds.height = 74;
  expect(satelliteShape(snapshot)).not.toEqual(baseline);
  const moved = fixture(); moved.satellites[0]!.y = 13;
  expect(satelliteShape(moved)).not.toEqual(baseline);
});

it('bounds centering by half a physical pixel at DPR 1, 1.25 and 1.5, including rectangular viewports', () => {
  for (const dpr of [1, 1.25, 1.5]) for (const [width, height] of [[72, 72], [74, 72], [72, 74], [73, 72]]) {
    for (const extent of [width!, height!]) {
      const ideal = (extent - 48) / 2;
      const snapped = Math.round(ideal * dpr) / dpr;
      expect(physicallyCentered(snapped, 48, extent, dpr)).toBe(true);
      expect(physicallyCentered(ideal + 1 / dpr, 48, extent, dpr)).toBe(false);
    }
  }
  expect(physicallyCentered(13.1999998093, 48, 74, 1.25)).toBe(true);
  expect(physicallyCentered(13.4, 48, 74, 1.25)).toBe(true);
  expect(physicallyCentered(13.400001, 48, 74, 1.25)).toBe(false);
  expect(physicallyCentered(NaN, 48, 74, 1.25)).toBe(false);
});
it('requires CSS centering intent and detects native growth independently of raster centering', () => {
  const snapshot = fixture(72);
  snapshot.satellites[0]!.layout.justify = 'start';
  expect(satelliteGeometryProblems(snapshot)).toContain('satellite-2: layout-intent');
  snapshot.satellites[0]!.layout.justify = 'center';
  const baseline = satelliteShape(snapshot);
  snapshot.native.satellites[0]!.bounds.width = 74;
  snapshot.native.satellites[0]!.content.width = 74;
  const renderer = snapshot.satellites[0]!;
  renderer.viewport.width = 74; renderer.layout.width = 74.4; renderer.x = 13.1999998093;
  expect(satelliteGeometryProblems(snapshot)).toEqual([]);
  expect(satelliteShape(snapshot)).not.toEqual(baseline);
});
