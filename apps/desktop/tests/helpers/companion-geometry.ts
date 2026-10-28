import type { ElectronApplication } from '@playwright/test';
import { SATELLITE_SIZE } from '../../src/main/orbit-controller';

// Test-only: no messages, input, account data, URLs or raw errors are returned.
export async function companionGeometry(desktop: ElectronApplication) {
  const native = await desktop.evaluate(({ BrowserWindow, screen }, SATELLITE_SIZE) => {
    const core = BrowserWindow.getAllWindows().find(window => window.webContents.getURL() === 'app://companion/index.html');
    const bounds = core?.getBounds();
    return { bounds, content: core?.getContentBounds(), scale: bounds ? screen.getDisplayMatching(bounds).scaleFactor : undefined,
      runtime: { electron: process.versions.electron, chrome: process.versions.chrome, platform: process.platform },
      requestedSatellite: { width: SATELLITE_SIZE, height: SATELLITE_SIZE },
      displays: screen.getAllDisplays().map(display => ({ workArea: display.workArea, scale: display.scaleFactor })),
      areas: screen.getAllDisplays().map(display => display.workArea),
      satellites: BrowserWindow.getAllWindows().filter(window => window.webContents.getURL() === 'app://orbit/index.html')
        .map(window => ({ id: window.webContents.id, bounds: window.getBounds(), content: window.getContentBounds(),
          minimum: window.getMinimumSize(), maximum: window.getMaximumSize(), resizable: window.isResizable(), zoom: window.webContents.getZoomFactor(),
          physicalBounds: process.platform === 'win32' ? screen.dipToScreenRect(window, window.getBounds()) : undefined,
          scale: screen.getDisplayMatching(window.getBounds()).scaleFactor, visible: window.isVisible() })) };
  }, SATELLITE_SIZE);
  const core = desktop.windows().find(page => page.url() === 'app://companion/index.html');
  const renderer = await core?.evaluate(() => {
    const button = document.getElementById('companion')!, box = button.getBoundingClientRect(), style = getComputedStyle(button);
    return { width: box.width, height: box.height, x: box.x, y: box.y, radius: style.borderRadius, transform: style.transform,
      appearance: style.appearance, dpr: devicePixelRatio, viewport: { width: innerWidth, height: innerHeight }, captured: button.hasPointerCapture(1) };
  }).catch(() => undefined);
  const satellites = await Promise.all(desktop.windows().filter(page => page.url() === 'app://orbit/index.html').map(async page => {
    try {
      const window = await desktop.browserWindow(page);
      const id: number = await window.evaluate(window => window.webContents.id);
      const renderer = await page.evaluate(() => {
        const button = document.getElementById('action') as HTMLButtonElement | null;
        if (!button) return { present: false as const };
        const box = button.getBoundingClientRect(), style = getComputedStyle(button);
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return { present: true as const, width: box.width, height: box.height, x: box.x, y: box.y, radius: style.borderRadius,
          transform: style.transform, opacity: style.opacity, disabled: button.disabled, hit: hit === button || button.contains(hit),
          outlineWidth: parseFloat(style.outlineWidth), outlineOffset: parseFloat(style.outlineOffset),
          dpr: devicePixelRatio, viewport: { width: innerWidth, height: innerHeight } };
      });
      return { id, ...renderer };
    } catch { return { id: undefined, present: false as const }; }
  }));
  return { native, renderer, satellites };
}

export type CompanionGeometry = Awaited<ReturnType<typeof companionGeometry>>;

// Native bounds/content use OS-rounded DIP, viewport/controls use CSS pixels.
// Never infer an exact native size or viewport from the requested 72 DIP.
export function satelliteGeometryProblems(snapshot: CompanionGeometry): string[] {
  const problems: string[] = [];
  const contains = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
    b.x >= a.x && b.y >= a.y && b.x + b.width <= a.x + a.width && b.y + b.height <= a.y + a.height;
  const disjoint = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
    a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
  const visible = snapshot.native.satellites.filter(window => window.visible);
  for (const window of visible) {
    const prefix = `satellite-${window.id}`;
    const renderer = snapshot.satellites.find(renderer => renderer.id === window.id);
    if (![...Object.values(window.bounds), ...Object.values(window.content), window.scale, window.zoom].every(Number.isFinite)
      || window.bounds.width <= 0 || window.bounds.height <= 0 || window.content.width <= 0 || window.content.height <= 0 || window.scale <= 0) problems.push(`${prefix}: invalid-native`);
    // min/max getters may also be rounded by the OS; the host unit test checks
    // exact constructor options. Here assert the effective interaction policy.
    if (window.resizable || window.zoom !== 1) problems.push(`${prefix}: interaction-policy`);
    if (!contains(window.bounds, window.content)) problems.push(`${prefix}: content-outside-native`);
    if (!snapshot.native.areas.some(area => contains(area, window.bounds))) problems.push(`${prefix}: work-area`);
    if (!snapshot.native.bounds || !disjoint(window.bounds, snapshot.native.bounds)) problems.push(`${prefix}: core-collision`);
    if (!renderer?.present) { problems.push(`${prefix}: missing-renderer`); continue; }
    const { viewport, x, y, width, height } = renderer;
    if (![viewport.width, viewport.height, x, y, width, height, renderer.dpr, renderer.outlineWidth, renderer.outlineOffset].every(Number.isFinite)
      || viewport.width <= 0 || viewport.height <= 0 || renderer.dpr <= 0) problems.push(`${prefix}: invalid-renderer`);
    if (width !== 48 || height !== 48 || renderer.radius !== '50%' || !['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(renderer.transform)) problems.push(`${prefix}: circle`);
    if (x !== (viewport.width - 48) / 2 || y !== (viewport.height - 48) / 2) problems.push(`${prefix}: center`);
    const outline = Math.max(0, renderer.outlineWidth + renderer.outlineOffset);
    if (x - outline < 0 || y - outline < 0 || x + width + outline > viewport.width || y + height + outline > viewport.height) problems.push(`${prefix}: clipping`);
    if (renderer.disabled || !renderer.hit || renderer.opacity !== '1') problems.push(`${prefix}: unreachable`);
  }
  for (let i = 0; i < visible.length; ++i) for (let j = i + 1; j < visible.length; ++j) {
    if (!disjoint(visible[i]!.bounds, visible[j]!.bounds)) problems.push('satellite-collision');
  }
  return problems;
}

// Only fields that must remain identical during hover/focus in one open menu.
export function satelliteShape(snapshot: CompanionGeometry) {
  return snapshot.native.satellites.filter(window => window.visible).map(window => {
    const renderer = snapshot.satellites.find(renderer => renderer.id === window.id);
    return { id: window.id, bounds: { ...window.bounds }, content: { ...window.content }, scale: window.scale,
      renderer: renderer?.present ? { x: renderer.x, y: renderer.y, width: renderer.width, height: renderer.height,
        viewport: { ...renderer.viewport }, dpr: renderer.dpr } : undefined };
  }).sort((a, b) => a.id - b.id);
}
