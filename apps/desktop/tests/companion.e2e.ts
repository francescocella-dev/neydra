import { _electron as electron, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { companionGeometry, satelliteGeometryProblems, satelliteShape } from './helpers/companion-geometry';
import { test } from './helpers/companion-test';
import { installOrbitNativeProbe } from './helpers/orbit-native-probe';
import { installCompanionLifecycleProbe } from './helpers/companion-lifecycle-probe';
import type { ElectronApplication } from '@playwright/test';

const ORBIT = 'app://orbit/index.html';

test('companion lifecycle V2: minimize, stable geometry, orbital menu and session continuity', async ({ geometry }) => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined)) as Record<string, string>;
  let launched: ElectronApplication | undefined, exited = false;
  let nativeProbe: Awaited<ReturnType<typeof installOrbitNativeProbe>> | undefined;
  let lifecycleProbe: Awaited<ReturnType<typeof installCompanionLifecycleProbe>> | undefined;
  try {
    const desktop = launched = await electron.launch({ args: [resolve('.')], env, chromiumSandbox: true });
    const main = await desktop.firstWindow();
    nativeProbe = await installOrbitNativeProbe(desktop);
    const prompt = main.getByLabel('Messaggio per ChatGPT (massimo 2000 caratteri)');
    await prompt.fill('Bozza sintetica locale, nessun invio');
    const original = await prompt.elementHandle();
    let reloads = 0; main.on('load', () => { ++reloads; });
    const mainId = await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.id);
    const state = () => desktop.evaluate(({ BrowserWindow }, id) => {
      const main = BrowserWindow.fromId(id)!;
      const core = BrowserWindow.getAllWindows().find(window => window.webContents.getURL() === 'app://companion/index.html');
      const satellites = BrowserWindow.getAllWindows().filter(window => window.webContents.getURL() === 'app://orbit/index.html');
      return { count: BrowserWindow.getAllWindows().length, mainVisible: main.isVisible(), mainFocused: main.isFocused(), minimized: main.isMinimized(),
        coreVisible: core?.isVisible() ?? false, coreId: core?.id, orbitVisible: satellites.filter(window => window.isVisible()).length };
    }, mainId);
    const reduced = () => expect.poll(state).toMatchObject({ mainVisible: false, coreVisible: true });
    const restored = async () => {
      await expect.poll(state).toMatchObject({ mainVisible: true, mainFocused: true, minimized: false, coreVisible: false, orbitVisible: 0 });
      await expect(prompt).toHaveValue('Bozza sintetica locale, nessun invio');
      await expect(main.getByRole('dialog', { name: 'Pannello di controllo' })).toBeHidden();
      expect(await original!.evaluate(element => element.isConnected)).toBe(true); expect(reloads).toBe(0);
    };
    const reduce = async () => {
      await main.getByRole('button', { name: 'Apri menu', exact: true }).click();
      await main.getByRole('button', { name: 'Riduci a Mini', exact: true }).click(); await reduced();
    };
    const firstCore = desktop.waitForEvent('window');
    // Native BrowserWindow.minimize traverses the Windows minimize event, not a
    // direct call to the companion controller. The physical titlebar remains a local gate.
    await desktop.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)!.minimize(), mainId);
    await reduced(); let core = await firstCore;
    const coreId = (await state()).coreId!;
    lifecycleProbe = await installCompanionLifecycleProbe(desktop, { main: mainId, core: coreId });
    const stable = async (phase: string) => {
      const snapshot = await companionGeometry(desktop);
      const { native, renderer } = snapshot;
      geometry.push({ phase, ...snapshot, operations: await nativeProbe!.evaluate(probe => probe.drain()), lifecycle: await lifecycleProbe!.evaluate(probe => probe.drain()) });
      expect(native.bounds).toMatchObject({ width: 120, height: 120 }); expect(native.content).toMatchObject({ width: 120, height: 120 });
      expect(renderer).toMatchObject({ width: 112, height: 112, x: 4, y: 4, radius: '50%', transform: 'none', appearance: 'none' });
      const box = native.bounds!;
      expect(native.areas.some(area => box.x >= area.x && box.y >= area.y && box.x + box.width <= area.x + area.width && box.y + box.height <= area.y + area.height)).toBe(true);
      expect(satelliteGeometryProblems(snapshot)).toEqual([]);
      return satelliteShape(snapshot);
    };
    await expect(core.getByRole('button', { name: 'Apri NEYDRA', exact: true })).toBeVisible();
    expect(await core.evaluate(() => ({ mainBridge: typeof window.neydra, orbitBridge: typeof window.neydraOrbit,
      require: typeof Reflect.get(window, 'require'), process: typeof Reflect.get(window, 'process'), methods: Object.keys(window.neydraCompanion).sort() })))
      .toEqual({ mainBridge: 'undefined', orbitBridge: 'undefined', require: 'undefined', process: 'undefined',
        methods: ['beginDrag', 'cancelDrag', 'closeMenu', 'endDrag', 'moveDrag', 'navigateMenu', 'onMenuState', 'openMenu', 'ready', 'restore'] });
    expect(await desktop.evaluate(({ app }) => app.commandLine.hasSwitch('no-sandbox'))).toBe(false);
    if (process.platform === 'win32' || process.platform === 'darwin') {
      await expect.poll(() => desktop.evaluate(({ app, BrowserWindow }, id) => {
        const pid = BrowserWindow.fromId(id)!.webContents.getOSProcessId(); return app.getAppMetrics().find(metric => metric.pid === pid)?.sandboxed;
      }, coreId)).toBe(true);
    }
    // Only the OS cursor reading is simulated: CDP does not move the physical
    // cursor. Real renderer, IPC, controller and native setPosition are retained.
    const probe = await desktop.evaluateHandle(({ screen }) => {
      const original = screen.getCursorScreenPoint; let point: { x: number; y: number } | undefined;
      screen.getCursorScreenPoint = () => point ?? original.call(screen);
      return { point(x: number, y: number) { point = { x, y }; }, reset() { point = undefined; }, dispose() { screen.getCursorScreenPoint = original; } };
    });
    try {
      await stable('idle'); await core.getByRole('button').hover(); await stable('hover');
      const { before, area } = await desktop.evaluate(({ BrowserWindow, screen }, id) => {
        const before = BrowserWindow.fromId(id)!.getBounds(); return { before, area: screen.getDisplayMatching(before).workArea };
      }, coreId);
      const target = { x: area.x + Math.min(24, area.width - 120), y: area.y + Math.min(24, area.height - 120) };
      await probe.evaluate(p => p.point(500, 500)); await core.mouse.move(60, 60); await core.mouse.down();
      await core.evaluate(() => window.neydraCompanion.ready()); await stable('pressed');
      await probe.evaluate((p, point) => p.point(point.x, point.y), { x: 500 + target.x - before.x, y: 500 + target.y - before.y });
      await core.mouse.move(62, 62); await core.evaluate(() => window.neydraCompanion.ready()); await stable('drag');
      await core.mouse.up(); await core.evaluate(() => window.neydraCompanion.ready());
      await expect.poll(() => desktop.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)!.getPosition(), coreId)).toEqual([target.x, target.y]);
      await stable('released'); await probe.evaluate(p => p.reset());
      await core.getByRole('button').click(); await restored();
      await main.getByRole('button', { name: 'Schermo intero', exact: true }).click();
      await expect(main.locator('.mini-topbar').getByRole('button', { name: 'Riduci a Mini', exact: true })).toBeVisible();
      await main.locator('.mini-topbar').getByRole('button', { name: 'Riduci a Mini', exact: true }).click(); await reduced();
      expect((await state()).coreId).toBe(coreId);
      await core.getByRole('button').click(); await restored();
      await main.getByRole('button', { name: /^Esci da schermo intero/ }).click();
      await reduce();
      const orbital = async (keyboard = false) => {
        if (keyboard) { await core.getByRole('button').focus(); await core.keyboard.press('Shift+F10'); }
        else await core.getByRole('button').click({ button: 'right' });
        await expect.poll(state).toMatchObject({ orbitVisible: 2, count: 4 });
        const pages = desktop.windows().filter(page => page.url() === ORBIT);
        // Wait for the actual finite entry animations, not an arbitrary delay.
        await Promise.all(pages.map(page => page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))))));
        const named = await Promise.all(pages.map(async page => ({ page, role: await page.evaluate(() => window.neydraOrbit.getRole()) })));
        return { open: named.find(entry => entry.role.ok && entry.role.role === 'open')!.page,
          exit: named.find(entry => entry.role.ok && entry.role.role === 'exit')!.page };
      };
      let menu: Awaited<ReturnType<typeof orbital>>;
      let baseline: Awaited<ReturnType<typeof stable>> | undefined;
      for (let cycle = 1; cycle <= 5; ++cycle) {
        menu = await orbital();
        const shape = await stable(`cycle-${cycle}-menu-open`); expect(shape).toHaveLength(2);
        baseline ??= shape;
        // All ten openings reuse the same ids and exact measured geometry.
        // Raster centering never excuses growth of bounds/content/constraints.
        expect(shape).toEqual(baseline);
        await menu.exit.getByRole('menuitem', { name: 'Esci', exact: true }).hover();
        expect((await state()).mainVisible).toBe(false); // Hover never quits or opens.
        expect(await stable(`cycle-${cycle}-menu-hover`)).toEqual(baseline);
        if (cycle === 1) for (const page of [menu.open, menu.exit]) {
          expect(await page.evaluate(() => ({ chat: typeof window.neydra, core: typeof window.neydraCompanion, keys: Object.keys(window.neydraOrbit).sort() })))
            .toEqual({ chat: 'undefined', core: 'undefined', keys: ['activate', 'dismiss', 'getRole', 'navigate', 'onVisibility', 'ready'] });
        }
        await core.getByRole('button').click({ button: 'right' });
        await expect.poll(state).toMatchObject({ orbitVisible: 0 }); await stable(`cycle-${cycle}-menu-toggle-close`);
        menu = await orbital(true); await expect(menu.open.getByRole('menuitem')).toBeFocused();
        expect(await stable(`cycle-${cycle}-menu-keyboard-open`)).toEqual(baseline);
        await menu.open.keyboard.press('Tab'); await expect(menu.exit.getByRole('menuitem')).toBeFocused();
        expect(await stable(`cycle-${cycle}-menu-keyboard-next`)).toEqual(baseline);
        await menu.exit.keyboard.press('Home'); await expect(menu.open.getByRole('menuitem')).toBeFocused();
        await menu.open.keyboard.press('End'); await expect(menu.exit.getByRole('menuitem')).toBeFocused();
        expect(await stable(`cycle-${cycle}-menu-keyboard-end`)).toEqual(baseline);
        await menu.exit.keyboard.press('Escape'); await expect.poll(state).toMatchObject({ orbitVisible: 0 });
        await expect(core.getByRole('button')).toBeFocused(); await stable(`cycle-${cycle}-escape-close`);
      }
      menu = await orbital(); await menu.open.getByRole('menuitem').click(); await restored();
      await reduce();
      // Genuine companion close must recover main; its child overlays must vanish.
      geometry.push({ phase: 'before-native-core-close', state: await state(), lifecycle: await lifecycleProbe.evaluate(probe => probe.drain()) });
      await desktop.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)!.close(), coreId);
      await restored(); expect((await state()).count).toBe(1);
      geometry.push({ phase: 'after-native-core-close', state: await state(), lifecycle: await lifecycleProbe.evaluate(probe => probe.drain()) });
      expect(await lifecycleProbe.evaluate(probe => probe.uncaught())).toBe(0);
      const next = desktop.waitForEvent('window'); await reduce(); core = await next;
      await core.getByRole('button').focus(); await core.keyboard.press('Enter'); await restored();
      await reduce(); menu = await orbital();
      await menu.open.emulateMedia({ reducedMotion: 'reduce' });
      expect(await menu.open.getByRole('menuitem').evaluate(button => getComputedStyle(button).animationName)).toBe('none');
      await stable('menu-after-recovery');
      const closed = desktop.waitForEvent('close');
      // Schedule the DOM activation only to let the test transport return before app.quit.
      await menu.exit.getByRole('menuitem').evaluate(button => { setTimeout(() => (button as HTMLButtonElement).click(), 50); });
      await closed; exited = true;
    } finally { if (!exited) { await probe.evaluate(p => p.dispose()).catch(() => {}); await probe.dispose(); } }
  } catch (error) {
    const failure = launched && await companionGeometry(launched).catch(() => undefined);
    if (failure) geometry.push({ phase: 'failure', ...failure });
    throw error;
  } finally {
    const lifecycle = await lifecycleProbe?.evaluate(probe => { const records = probe.drain(); probe.dispose(); return records; }).catch(() => undefined);
    if (lifecycle?.length) geometry.push({ phase: 'final-lifecycle', lifecycle });
    await lifecycleProbe?.dispose().catch(() => {});
    const operations = await nativeProbe?.evaluate(probe => { const records = probe.drain(); probe.dispose(); return records; }).catch(() => undefined);
    if (operations?.length) geometry.push({ phase: 'final-operations', operations });
    await nativeProbe?.dispose().catch(() => {});
    if (!exited) await launched?.close();
  }
});
