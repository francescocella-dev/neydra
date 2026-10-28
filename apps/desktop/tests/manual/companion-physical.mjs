// Opt-in, owner-run Windows diagnostic. No cursor simulation, prompts or AI calls.
import { _electron as electron } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const phases = new Set(['idle', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture', 'focus', 'blur', 'resize', 'menu-open', 'menu-close']);
const samples = [];
let desktop, core, timer, closed = false, chain = Promise.resolve();
async function record(phase) {
  if (!phases.has(phase) || samples.length >= 512 || !core || core.isClosed()) return;
  try {
    const native = await desktop.evaluate(({ BrowserWindow, screen }) => {
      const core = BrowserWindow.getAllWindows().find(window => window.webContents.getURL() === 'app://companion/index.html');
      if (!core) return;
      const bounds = core.getBounds();
      return { bounds, content: core.getContentBounds(), scale: screen.getDisplayMatching(bounds).scaleFactor,
        areas: screen.getAllDisplays().map(display => display.workArea),
        satellites: BrowserWindow.getAllWindows().filter(window => window.webContents.getURL() === 'app://orbit/index.html')
          .map(window => ({ bounds: window.getBounds(), content: window.getContentBounds(),
            scale: screen.getDisplayMatching(window.getBounds()).scaleFactor, visible: window.isVisible() })) };
    });
    if (!native) return;
    const renderer = await core.evaluate(() => {
      const button = document.getElementById('companion'), box = button.getBoundingClientRect(), style = getComputedStyle(button);
      return { width: box.width, height: box.height, x: box.x, y: box.y, transform: style.transform, appearance: style.appearance,
        dpr: devicePixelRatio, viewport: { width: innerWidth, height: innerHeight }, captured: button.hasPointerCapture(1) };
    });
    const satellites = await Promise.all(desktop.windows().filter(page => page.url() === 'app://orbit/index.html').map(page => page.evaluate(() => {
      const button = document.getElementById('action'), box = button.getBoundingClientRect();
      return { width: box.width, height: box.height, x: box.x, y: box.y, dpr: devicePixelRatio,
        viewport: { width: innerWidth, height: innerHeight }, transform: getComputedStyle(button).transform };
    }).catch(() => undefined)));
    samples.push({ phase, native, renderer, satellites });
  } catch { /* A window may close during a measurement. Never collect raw errors. */ }
}
try {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined));
  desktop = await electron.launch({ args: [resolve('.')], env, chromiumSandbox: true });
  await desktop.firstWindow();
  const floating = desktop.waitForEvent('window');
  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
  core = await floating;
  await core.getByRole('button', { name: 'Apri NEYDRA' }).waitFor();
  await core.exposeFunction('recordCompanionGeometry', phase => { chain = chain.then(() => record(phase)); });
  await core.evaluate(() => {
    let lastMove = 0;
    for (const phase of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture', 'focus', 'blur', 'resize']) {
      window.addEventListener(phase, () => {
        if (phase === 'pointermove' && performance.now() - lastMove < 100) return;
        if (phase === 'pointermove') lastMove = performance.now();
        void window.recordCompanionGeometry(phase);
      }, true);
    }
    window.neydraCompanion.onMenuState(({ open }) => { void window.recordCompanionGeometry(open ? 'menu-open' : 'menu-close'); });
  });
  await record('idle');
  console.log('Diagnostica per 45 secondi: usa il mouse fisico, trascina, apri/chiudi il menu e cambia monitor. Nessun login o invio AI.');
  await Promise.race([new Promise(resolve => { timer = setTimeout(resolve, 45000); }), desktop.waitForEvent('close', { timeout: 0 }).then(() => { closed = true; })]);
  clearTimeout(timer); await chain;
  await mkdir('evidence', { recursive: true });
  const path = `evidence/companion-v2-physical-${Date.now()}.json`;
  await writeFile(path, JSON.stringify({ measurementOnly: true, samples }, null, 2), { flag: 'wx' });
  console.log(`Geometria salvata: ${path}. Non costituisce un PASS visivo o Windows.`);
} catch {
  console.error('Diagnostica non completata: verificare avvio Electron e assenza di altre istanze NEYDRA. Nessun PASS GUI.');
  process.exitCode = 1;
} finally { clearTimeout(timer); if (desktop && !closed) await desktop.close().catch(() => {}); }
