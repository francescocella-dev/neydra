import { _electron as electron, expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { companionGeometry } from './helpers/companion-geometry';

const ORBIT = 'app://orbit/index.html';

test('companion lifecycle V2: minimize, stable geometry, orbital menu and session continuity', async () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined)) as Record<string, string>;
  const desktop = await electron.launch({ args: [resolve('.')], env, chromiumSandbox: true });
  let exited = false;
  const geometry: unknown[] = [];
  try {
    const main = await desktop.firstWindow();
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
    const stable = async (phase: string) => {
      const snapshot = await companionGeometry(desktop);
      const { native, renderer } = snapshot;
      geometry.push({ phase, ...snapshot });
      expect(native.bounds).toMatchObject({ width: 120, height: 120 }); expect(native.content).toMatchObject({ width: 120, height: 120 });
      expect(renderer).toMatchObject({ width: 112, height: 112, x: 4, y: 4, radius: '50%', transform: 'none', appearance: 'none' });
      const visible = native.satellites.filter(window => window.visible);
      const disjoint = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
        a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
      for (const satellite of visible) {
        expect(satellite.bounds).toMatchObject({ width: 72, height: 72 });
        expect(satellite.content).toMatchObject({ width: 72, height: 72 });
        const box = satellite.bounds;
        expect(native.areas.some(area => box.x >= area.x && box.y >= area.y && box.x + box.width <= area.x + area.width && box.y + box.height <= area.y + area.height)).toBe(true);
        expect(disjoint(box, native.bounds!)).toBe(true);
      }
      if (visible.length === 2) expect(disjoint(visible[0]!.bounds, visible[1]!.bounds)).toBe(true);
      if (visible.length) for (const satellite of snapshot.satellites) {
        expect(satellite).toMatchObject({ present: true, width: 48, height: 48, x: 12, y: 12, radius: '50%', viewport: { width: 72, height: 72 } });
      }
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
      let menu = await orbital(); await stable('menu-open');
      await menu.exit.getByRole('menuitem', { name: 'Esci', exact: true }).hover();
      expect((await state()).mainVisible).toBe(false); // Hover never quits or opens.
      for (const page of [menu.open, menu.exit]) {
        expect(await page.evaluate(() => ({ chat: typeof window.neydra, core: typeof window.neydraCompanion, keys: Object.keys(window.neydraOrbit).sort() })))
          .toEqual({ chat: 'undefined', core: 'undefined', keys: ['activate', 'dismiss', 'getRole', 'navigate', 'onVisibility', 'ready'] });
      }
      await core.getByRole('button').click({ button: 'right' }); await expect.poll(state).toMatchObject({ orbitVisible: 0 }); await stable('menu-toggle-close');
      menu = await orbital(true); await expect(menu.open.getByRole('menuitem')).toBeFocused();
      await menu.open.keyboard.press('Tab'); await expect(menu.exit.getByRole('menuitem')).toBeFocused();
      await menu.exit.keyboard.press('Escape'); await expect.poll(state).toMatchObject({ orbitVisible: 0 }); await stable('escape-close');
      menu = await orbital(); await menu.open.getByRole('menuitem').click(); await restored();
      await reduce();
      // Genuine companion close must recover main; its child overlays must vanish.
      await desktop.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)!.close(), coreId);
      await restored(); expect((await state()).count).toBe(1);
      const next = desktop.waitForEvent('window'); await reduce(); core = await next;
      await core.getByRole('button').focus(); await core.keyboard.press('Enter'); await restored();
      await reduce(); menu = await orbital();
      await menu.open.emulateMedia({ reducedMotion: 'reduce' });
      expect(await menu.open.getByRole('menuitem').evaluate(button => getComputedStyle(button).animationName)).toBe('none');
      const closed = desktop.waitForEvent('close');
      // Schedule the DOM activation only to let the test transport return before app.quit.
      await menu.exit.getByRole('menuitem').evaluate(button => { setTimeout(() => (button as HTMLButtonElement).click(), 50); });
      await closed; exited = true;
    } finally { if (!exited) { await probe.evaluate(p => p.dispose()).catch(() => {}); await probe.dispose(); } }
  } catch (error) {
    const failure = await companionGeometry(desktop).catch(() => undefined);
    if (failure) geometry.push({ phase: 'failure', ...failure });
    await test.info().attach('companion-v2-geometry', { body: JSON.stringify(geometry, null, 2), contentType: 'application/json' });
    throw error;
  } finally { if (!exited) await desktop.close(); }
});
