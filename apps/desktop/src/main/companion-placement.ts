import type { ReductionMode } from '../shared/reduction-contracts';
import type { Rect, Point } from './companion-controller';

export const companionSize = (mode: ReductionMode) => mode === 'circle' ? { width: 120, height: 120 } : { width: 240, height: 64 };
export interface AnchorDisplay { id: number; scaleFactor: number; workArea: Rect }
export const anchorKey = (display: AnchorDisplay, mode: ReductionMode) => JSON.stringify([mode, display.id, display.scaleFactor, display.workArea.x, display.workArea.y, display.workArea.width, display.workArea.height]);
export function anchoredPosition(bounds: Rect, area: Rect, mode: ReductionMode): Point | undefined {
  if (![...Object.values(bounds), ...Object.values(area)].every(Number.isFinite)
    || bounds.width <= 0 || bounds.height <= 0 || area.width < bounds.width || area.height < bounds.height) return;
  const marginX = Math.min(24, Math.floor((area.width - bounds.width) / 2));
  const marginY = Math.min(mode === 'circle' ? 24 : 8, Math.floor((area.height - bounds.height) / 2));
  return mode === 'circle' ? { x: Math.round(area.x + area.width - bounds.width - marginX), y: Math.round(area.y + area.height - bounds.height - marginY) }
    : { x: Math.round(area.x + (area.width - bounds.width) / 2), y: Math.round(area.y + marginY) };
}
