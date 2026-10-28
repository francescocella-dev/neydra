import { _electron as electron, expect, test } from '@playwright/test';
import { resolve } from 'node:path';

test('companion lifecycle, narrow renderer, deterministic drag, native recovery and session continuity', async () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined)) as Record<string, string>;
  const desktop = await electron.launch({ args: [resolve('.')], env, chromiumSandbox: true });
  let exited = false;
  try {
    const main = await desktop.firstWindow();
    const prompt = main.getByLabel('Messaggio per ChatGPT (massimo 2000 caratteri)');
    await prompt.fill('Bozza sintetica locale, nessun invio');
    const original = await prompt.elementHandle();
    let reloads = 0; main.on('load', () => { ++reloads; });
    const mainId = await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.id);
    const state = () => desktop.evaluate(({ BrowserWindow }, id) => {
      const mainWindow = BrowserWindow.fromId(id)!;
      const floating = BrowserWindow.getAllWindows().find(window => window.id !== id);
      return { count: BrowserWindow.getAllWindows().length, mainVisible: mainWindow.isVisible(), mainFocused: mainWindow.isFocused(),
        floatingVisible: floating?.isVisible() ?? false, floatingId: floating?.id };
    }, mainId);
    const reduce = async () => {
      await main.getByRole('button', { name: 'Apri menu', exact: true }).click();
      await main.getByRole('button', { name: 'Riduci a Mini', exact: true }).click();
      await expect.poll(state).toMatchObject({ count: 2, mainVisible: false, floatingVisible: true });
    };
    const restored = async () => {
      await expect.poll(state).toMatchObject({ mainVisible: true, mainFocused: true, floatingVisible: false });
      await expect(prompt).toHaveValue('Bozza sintetica locale, nessun invio');
      await expect(main.getByRole('dialog', { name: 'Pannello di controllo' })).toBeHidden();
      expect(await original!.evaluate(element => element.isConnected)).toBe(true);
      expect(reloads).toBe(0);
    };
    const firstFloating = desktop.waitForEvent('window');
    await reduce(); const floating = await firstFloating;
    const id = (await state()).floatingId!;
    await expect(floating.getByRole('button', { name: 'Apri NEYDRA', exact: true })).toBeVisible();
    expect(await floating.evaluate(() => ({ mainBridge: typeof window.neydra,
      require: typeof Reflect.get(window, 'require'), process: typeof Reflect.get(window, 'process'),
      methods: Object.keys(window.neydraCompanion).sort(), background: getComputedStyle(document.body).backgroundColor,
      round: getComputedStyle(document.getElementById('companion')!).borderRadius }))).toEqual({
      mainBridge: 'undefined', require: 'undefined', process: 'undefined', methods: ['beginDrag', 'cancelDrag', 'endDrag', 'moveDrag', 'openMenu', 'ready', 'restore'],
      background: 'rgba(0, 0, 0, 0)', round: '50%',
    });
    expect(await desktop.evaluate(({ BrowserWindow }, windowId) => {
      const window = BrowserWindow.fromId(windowId)!;
      return { top: window.isAlwaysOnTop(), resize: window.isResizable(), fullscreen: window.isFullScreenable() };
    }, id)).toEqual({ top: true, resize: false, fullscreen: false });
    expect(await desktop.evaluate(({ app }) => app.commandLine.hasSwitch('no-sandbox'))).toBe(false);
    if (process.platform === 'win32' || process.platform === 'darwin') {
      await expect.poll(() => desktop.evaluate(({ app, BrowserWindow }, windowId) => {
        const pid = BrowserWindow.fromId(windowId)!.webContents.getOSProcessId();
        return app.getAppMetrics().find(metric => metric.pid === pid)?.sandboxed;
      }, id)).toBe(true);
    }
    await floating.screenshot({ path: 'evidence/mini-companion.png' });

    // Test-only probe: CDP pointer events do not move the real OS cursor. Override
    // only cursor readings for deterministic drag, never setPosition or the IPC/controller.
    // Replace native popup only to invoke its actual Open/Exit items without OS menu automation.
    const probe = await desktop.evaluateHandle(({ screen, Menu, BrowserWindow }) => {
      const cursor = screen.getCursorScreenPoint, popup = Menu.prototype.popup;
      let point: { x: number; y: number } | undefined;
      const menus: Electron.Menu[] = [];
      screen.getCursorScreenPoint = () => point ?? cursor.call(screen);
      Menu.prototype.popup = function () { menus.push(this); };
      return {
        point(x: number, y: number) { point = { x, y }; },
        resetCursor() { point = undefined; },
        labels() { return menus.at(-1)?.items.map(item => item.label) ?? []; },
        choose(label: string) {
          const item = menus.at(-1)?.items.find(item => item.label === label);
          if (!item) throw new Error('Missing native menu action');
          const click = () => item.click(item, BrowserWindow.getFocusedWindow() ?? undefined, {} as Electron.KeyboardEvent);
          if (label === 'Esci') setTimeout(click, 50); else click();
        },
        dispose() { screen.getCursorScreenPoint = cursor; Menu.prototype.popup = popup; },
      };
    });
    try {
      const { before, area } = await desktop.evaluate(({ BrowserWindow, screen }, windowId) => {
        const before = BrowserWindow.fromId(windowId)!.getBounds();
        return { before, area: screen.getDisplayMatching(before).workArea };
      }, id);
      const target = { x: area.x + Math.min(24, area.width - before.width), y: area.y + Math.min(24, area.height - before.height) };
      await probe.evaluate(p => p.point(500, 500));
      await floating.mouse.move(60, 60); await floating.mouse.down();
      await floating.evaluate(() => window.neydraCompanion.ready()); // IPC barrier after pointerdown.
      await probe.evaluate((p, point) => p.point(point.x, point.y), { x: 500 + target.x - before.x, y: 500 + target.y - before.y });
      await floating.mouse.move(62, 62); await floating.mouse.up();
      await floating.evaluate(() => window.neydraCompanion.ready()); // IPC barrier after pointerup.
      await expect.poll(() => desktop.evaluate(({ BrowserWindow }, windowId) => {
        const window = BrowserWindow.fromId(windowId)!, { x, y, width, height } = window.getBounds();
        return { x, y, width, height, visible: window.isVisible() };
      }, id)).toMatchObject({ ...target, visible: true });
      await probe.evaluate(p => p.resetCursor());
      await floating.getByRole('button', { name: 'Apri NEYDRA', exact: true }).click(); await restored();
      await reduce(); expect((await state()).floatingId).toBe(id);
      await floating.getByRole('button', { name: 'Apri NEYDRA' }).click({ button: 'right' });
      await expect.poll(() => probe.evaluate(p => p.labels())).toEqual(['Apri NEYDRA', 'Esci']);
      await probe.evaluate(p => p.choose('Apri NEYDRA')); await restored();
      await reduce();
      // Native companion close must recover main instead of leaving a hidden process.
      await desktop.evaluate(({ BrowserWindow }, windowId) => BrowserWindow.fromId(windowId)!.close(), id);
      await restored(); expect((await state()).count).toBe(1);
      const nextWindow = desktop.waitForEvent('window'); await reduce(); const next = await nextWindow;
      await next.getByRole('button', { name: 'Apri NEYDRA' }).focus(); await next.keyboard.press('Enter'); await restored();
      await reduce();
      await next.getByRole('button', { name: 'Apri NEYDRA' }).click({ button: 'right' });
      const closed = desktop.waitForEvent('close');
      await probe.evaluate(p => p.choose('Esci')); await closed; exited = true;
    } finally { if (!exited) { await probe.evaluate(p => p.dispose()).catch(() => {}); await probe.dispose(); } }
  } finally { if (!exited) await desktop.close(); }
});
