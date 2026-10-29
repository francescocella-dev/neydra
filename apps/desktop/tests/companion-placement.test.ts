import { expect, it } from 'vitest';
import { anchoredPosition, companionSize, anchorKey } from '../src/main/companion-placement';
import { orbitPlacement, orbitFits } from '../src/main/orbit-controller';

it('anchors both native shapes on matched work areas at 100/125/150%, including negative origins and taskbars', () => {
  for (const scaleFactor of [1, 1.25, 1.5]) for (const area of [
    { x: 0, y: 0, width: 1920, height: 1040 }, { x: -1536, y: -200, width: 1536, height: 816 },
    { x: 1400, y: 90, width: 853, height: 573 }, { x: -1280, y: 500, width: 1280, height: 688 },
  ]) for (const mode of ['circle', 'island'] as const) {
    const size = companionSize(mode), point = anchoredPosition({ x: 900, y: -400, ...size }, area, mode)!;
    const core = { ...point, ...size };
    if (mode === 'circle') expect(point).toEqual({ x: area.x + area.width - 144, y: area.y + area.height - 144 });
    else expect(point).toEqual({ x: Math.round(area.x + (area.width - 240) / 2), y: area.y });
    const menu = orbitPlacement(core, [area])!;
    expect(menu).toBeDefined(); expect(orbitFits(core, [area], menu)).toBe(true);
    if (mode === 'island') for (const box of Object.values(menu)) expect(box.y).toBeGreaterThanOrEqual(core.y + core.height + 4);
    expect(anchorKey({ id: 2, scaleFactor, workArea: area }, mode)).toBe(anchorKey({ id: 2, scaleFactor, workArea: { height: area.height, width: area.width, y: area.y, x: area.x } }, mode));
  }
});
it('uses measured native extents, rejects impossible work areas and never uses the union of displays', () => {
  expect(anchoredPosition({ x: 0, y: 0, width: 120, height: 120 }, { x: -100, y: -100, width: 120, height: 120 }, 'circle')).toEqual({ x: -100, y: -100 });
  expect(anchoredPosition({ x: 0, y: 0, width: 240, height: 64 }, { x: 0, y: 0, width: 239, height: 800 }, 'island')).toBeUndefined();
  expect(anchoredPosition({ x: 0, y: 0, width: 241, height: 65 }, { x: 0, y: 0, width: 1024, height: 688 }, 'island')).toEqual({ x: 392, y: 0 });
  expect(anchoredPosition({ x: 0, y: 0, width: NaN, height: 64 }, { x: 0, y: 0, width: 1024, height: 688 }, 'island')).toBeUndefined();
});
