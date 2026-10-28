import type { ElectronApplication } from '@playwright/test';

// Test-only: no messages, input, account data, URLs or raw errors are returned.
export async function companionGeometry(desktop: ElectronApplication) {
  const native = await desktop.evaluate(({ BrowserWindow, screen }) => {
    const core = BrowserWindow.getAllWindows().find(window => window.webContents.getURL() === 'app://companion/index.html');
    const bounds = core?.getBounds();
    return { bounds, content: core?.getContentBounds(), scale: bounds ? screen.getDisplayMatching(bounds).scaleFactor : undefined,
      runtime: { electron: process.versions.electron, chrome: process.versions.chrome, platform: process.platform },
      areas: screen.getAllDisplays().map(display => display.workArea),
      satellites: BrowserWindow.getAllWindows().filter(window => window.webContents.getURL() === 'app://orbit/index.html')
        .map(window => ({ bounds: window.getBounds(), content: window.getContentBounds(),
          scale: screen.getDisplayMatching(window.getBounds()).scaleFactor, visible: window.isVisible() })) };
  });
  const core = desktop.windows().find(page => page.url() === 'app://companion/index.html');
  const renderer = await core?.evaluate(() => {
    const button = document.getElementById('companion')!, box = button.getBoundingClientRect(), style = getComputedStyle(button);
    return { width: box.width, height: box.height, x: box.x, y: box.y, radius: style.borderRadius, transform: style.transform,
      appearance: style.appearance, dpr: devicePixelRatio, viewport: { width: innerWidth, height: innerHeight }, captured: button.hasPointerCapture(1) };
  }).catch(() => undefined);
  const satellites = await Promise.all(desktop.windows().filter(page => page.url() === 'app://orbit/index.html').map(page => page.evaluate(() => {
    const button = document.getElementById('action');
    if (!button) return { present: false };
    const box = button.getBoundingClientRect(), style = getComputedStyle(button);
    return { present: true, width: box.width, height: box.height, x: box.x, y: box.y, radius: style.borderRadius,
      transform: style.transform, dpr: devicePixelRatio, viewport: { width: innerWidth, height: innerHeight } };
  }).catch(() => ({ present: false }))));
  return { native, renderer, satellites };
}
