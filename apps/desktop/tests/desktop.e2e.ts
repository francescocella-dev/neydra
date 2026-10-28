import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { collectLayoutDiagnostic } from './helpers/layout-diagnostic';
import { assertSingleViewport } from './helpers/viewport';
import { observeFullscreen, type FullscreenPhase } from './helpers/fullscreen-probe';

test('Mini UI, native fullscreen, offline stream and Electron security', async () => {
  const launchEnv = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined)) as Record<string, string>;
  const desktop = await electron.launch({ args: [resolve('.')], env: launchEnv, chromiumSandbox: true });
  try {
    const page = await desktop.firstWindow();
    const assertLayout = async (menuOpen = false) => {
      try { await assertSingleViewport(page, menuOpen); }
      catch (error) {
        await test.info().attach('layout-diagnostic', { body: JSON.stringify(await collectLayoutDiagnostic(page), null, 2), contentType: 'application/json' });
        throw error;
      }
    };
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const menuButton = page.getByRole('button', { name: 'Apri menu', exact: true });
    const settings = page.getByRole('dialog', { name: 'Pannello di controllo' });
    const openMenu = async () => { await menuButton.click(); await expect(settings).toBeVisible(); };
    const closeMenu = async () => { await settings.getByRole('button', { name: 'Chiudi menu' }).click(); await expect(settings).toBeHidden(); };
    const openOfflineTools = async () => {
      await settings.getByRole('button', { name: 'Informazioni e strumenti tecnici', exact: true }).click();
      const technical = settings.getByRole('region', { name: 'Informazioni e strumenti tecnici', exact: true });
      await expect(technical).toBeVisible();
      const tools = technical.locator('.developer-tools');
      // The section resets on menu open, while the native details may stay expanded.
      if (!await tools.evaluate(element => (element as HTMLDetailsElement).open)) await tools.locator('summary').click();
      await expect(tools.getByRole('heading', { name: 'Banco di prova offline', exact: true })).toBeVisible();
      return tools;
    };
    const togglePanel = async (name: string) => { await openMenu(); await settings.getByRole('button', { name, exact: true }).click(); await closeMenu(); };
    await expect(page.getByRole('heading', { name: 'NEYDRA', exact: true })).toBeVisible();
    await expect(page.locator('.brand')).toHaveText('NEYDRAMINI');
    await expect(page.locator('.mini-topbar button')).toHaveCount(3);
    const prompt = page.getByLabel('Messaggio per ChatGPT (massimo 2000 caratteri)');
    await prompt.fill('Test locale: il testo deve restare dopo la chiusura.');
    await assertLayout();
    const originalPrompt = await prompt.elementHandle();
    if (!originalPrompt) throw new Error('Prompt missing');
    await togglePanel('Nascondi chat');
    await expect(page.locator('.conversation-zone')).toBeHidden();
    await togglePanel('Mostra chat');
    await expect(prompt).toHaveValue('Test locale: il testo deve restare dopo la chiusura.');
    expect(await originalPrompt.evaluate(element => document.getElementById('chat-prompt') === element)).toBe(true);
    await originalPrompt.dispose();
    await togglePanel('Mostra stato');
    await expect(page.locator('.telemetry-zone')).toBeVisible();
    await expect(page.locator('.telemetry-zone').getByText('Non disponibile', { exact: true })).toBeVisible();
    await assertLayout();
    await togglePanel('Nascondi stato');
    await expect(page.getByRole('button', { name: 'Invia a ChatGPT', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Voce non ancora disponibile', exact: true })).toBeDisabled();
    expect(await page.evaluate(() => window.neydra.getConnection())).toEqual({ state: 'disconnected', models: [] });
    expect(await page.evaluate(() => window.neydra.startChatGPT({ requestId: crypto.randomUUID(), prompt: 'fixture', model: 'unauthorized', consent: 'included-plan-checked' }))).toEqual({ ok: false, code: 'auth-required' });
    await menuButton.focus();
    await expect(page.getByRole('tooltip', { name: 'Apri menu', exact: true })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(settings).toBeVisible();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.getElementById('mini-settings')?.contains(document.activeElement))).toBe(true);
    await settings.getByRole('button', { name: 'ChatGPT e modelli', exact: true }).click();
    await expect(settings.getByRole('button', { name: 'Continue with ChatGPT' })).toBeVisible();
    await expect(settings.getByLabel('Modello autorizzato selezionato')).toHaveValue('');
    await expect(settings.getByLabel('Modello autorizzato selezionato')).toBeDisabled();
    await settings.getByRole('button', { name: 'Tema e aspetto', exact: true }).click();
    await settings.getByLabel('Riduci le animazioni di sfondo').check();
    expect(await page.locator('.energy-one').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
    await settings.getByRole('button', { name: 'Impostazioni', exact: true }).click();
    await expect(settings.getByText(/Voce non ancora disponibile/)).toBeVisible();
    const offlineTools = await openOfflineTools();
    const demoStatus = offlineTools.getByRole('status');
    await expect(page.getByRole('button', { name: 'Avvia demo offline' })).toBeEnabled();
    expect(await desktop.evaluate(({ app }) => app.commandLine.hasSwitch('no-sandbox'))).toBe(false);
    expect(await page.evaluate(() => ({ require: typeof Reflect.get(window, 'require'), process: typeof Reflect.get(window, 'process'), keys: Object.keys(window.neydra).sort() })))
      .toEqual({ require: 'undefined', process: 'undefined', keys: ['cancel', 'cancelConnect', 'connectChatGPT', 'disconnectChatGPT', 'getConnection', 'getStatus', 'getWindowState', 'onEvent', 'onWindowState', 'reduceToMini', 'resetChat', 'setFullscreen', 'startChatGPT', 'startOfflineDemo'] });
    expect(await page.evaluate(() => window.neydra.startOfflineDemo({ requestId: 'invalid', prompt: 'test' }))).toEqual({ ok: false, code: 'invalid-request' });
    expect(await page.evaluate(() => window.neydra.setFullscreen({ enabled: 'true' } as never))).toEqual({ ok: false, code: 'invalid-request' });
    const status = await page.evaluate(() => window.neydra.getStatus());
    expect(status.mode).toBe('offline'); expect(status.auth).toBe('available-in-main');
    await page.getByRole('button', { name: 'Avvia demo offline' }).click();
    await expect(demoStatus).toHaveText('Demo offline completata');
    await expect(page.getByLabel('Testo demo')).toContainText('testo è predefinito');
    await page.getByRole('button', { name: 'Avvia demo offline' }).click();
    await page.keyboard.press('Escape');
    await expect(settings).toBeHidden();
    await expect(menuButton).toBeFocused();
    await openMenu();
    await openOfflineTools();
    await expect(demoStatus).toBeVisible();
    await expect(demoStatus).toHaveText('Demo offline annullata');
    await closeMenu();
    expect(await page.evaluate(async () => {
      try { await fetch('https://example.org'); return 'allowed'; } catch { return 'blocked'; }
    })).toBe('blocked');
    expect(await page.evaluate(async () => (await navigator.permissions.query({ name: 'microphone' as PermissionName })).state)).toBe('denied');
    expect(await page.evaluate(async () => (await navigator.permissions.query({ name: 'camera' as PermissionName })).state)).toBe('denied');
    await page.evaluate(() => { window.open('https://example.org'); });
    expect(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);

    const fullscreenProbe = await desktop.evaluateHandle(observeFullscreen);
    const assertTransition = async (phase: FullscreenPhase, expected: boolean, keyboard: boolean) => {
      await expect.poll(async () => {
        const snapshot = await fullscreenProbe.evaluate(probe => probe.snapshot());
        return {
          fullscreen: snapshot.fullscreen,
          nativeEvent: snapshot.transitions.some(event => event.phase === phase && event.fullscreen === expected),
          calls: snapshot.calls.filter(call => call.phase === phase).map(call => ({ enabled: call.enabled, threw: call.threw })),
          handledF11: !keyboard || snapshot.inputs.some(input => input.phase === phase && input.down && !input.repeat && !input.modified && input.prevented && input.focused),
        };
      }, { message: `Native fullscreen path: ${phase}` }).toEqual({
        fullscreen: expected, nativeEvent: true, calls: [{ enabled: expected, threw: false }], handledF11: true,
      });
    };
    const pressNativeF11 = async (phase: 'f11-exit' | 'f11-enter', expected: boolean) => {
      await fullscreenProbe.evaluate((probe, next) => { probe.begin(next); probe.focus(); }, phase);
      await expect.poll(async () => {
        const snapshot = await fullscreenProbe.evaluate(probe => probe.snapshot());
        return snapshot.focused && snapshot.contentsFocused && !snapshot.minimized;
      }, { message: `Native window and WebContents focus before ${phase}` }).toBe(true);
      // CDP keyboard.press omits the native key code and skips Electron's pre-handler.
      // Inject keyDown/keyUp through Electron; never invoke the shortcut or setter directly.
      await fullscreenProbe.evaluate(probe => probe.pressF11());
      await assertTransition(phase, expected, true);
    };
    try {
      await page.getByRole('button', { name: /^Schermo intero/ }).click();
      await assertTransition('button-enter', true, false);
      await assertLayout();
      await expect(page.getByRole('button', { name: /^Esci da schermo intero/ })).toBeVisible();
      expect(await page.evaluate(() => document.fullscreenElement === null)).toBe(true);
      await pressNativeF11('f11-exit', false);
      await expect(page.getByRole('button', { name: /^Schermo intero/ })).toBeVisible();
      await pressNativeF11('f11-enter', true);
      await expect(page.getByRole('button', { name: /^Esci da schermo intero/ })).toBeVisible();
      await fullscreenProbe.evaluate(probe => probe.begin('button-exit'));
      await page.getByRole('button', { name: /^Esci da schermo intero/ }).click();
      await assertTransition('button-exit', false, false);
      await assertLayout();
      expect(await page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    } finally {
      try {
        const snapshot = await fullscreenProbe.evaluate(probe => probe.snapshot());
        await test.info().attach('fullscreen-diagnostic', { body: JSON.stringify(snapshot, null, 2), contentType: 'application/json' });
      } finally {
        await fullscreenProbe.evaluate(probe => probe.dispose());
        await fullscreenProbe.dispose();
      }
    }

    await page.reload();
    await expect(page.getByRole('region', { name: 'Conversazione ChatGPT' })).toBeVisible();
    expect(await page.evaluate(async () => {
      const fonts = await Promise.all([document.fonts.load('16px Manrope'), document.fonts.load('24px Oxanium')]);
      return fonts.map(faces => faces.length > 0 && faces.every(face => face.status === 'loaded'));
    })).toEqual([true, true]);
    await mkdir('evidence', { recursive: true });
    // CSS viewport stress only; Windows OS DPI and physical fullscreen still need local checks.
    for (const [label, width, height] of [['100', 1280, 860], ['125', 1024, 688], ['150', 853, 573], ['small', 720, 480]] as const) {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await prompt.fill('x'.repeat(2000));
      await assertLayout();
      const before = await page.locator('.composer-bar').boundingBox();
      await page.locator('.chat-history').evaluate(element => {
        // Layout fixture only: no real AI. Same plain-message structure, 22 long messages.
        element.replaceChildren();
        for (let i = 0; i < 22; i++) {
          const message = document.createElement('article');
          message.className = `message ${i % 2 ? 'message-user' : 'message-assistant'}`;
          message.textContent = 'Test locale di cronologia lunga. '.repeat(16);
          element.append(message);
        }
        element.scrollTop = element.scrollHeight;
      });
      await assertLayout();
      expect(await page.locator('.composer-bar').boundingBox()).toEqual(before);
      expect(await page.locator('.chat-history').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
      await togglePanel('Mostra stato');
      await test.step(`Status tooltip remains inside ${width}x${height}`, async () => {
        // A visibility:hidden tooltip also has a layout box. Check before hover first.
        await assertLayout();
        const closeStatus = page.getByRole('button', { name: 'Chiudi pannello stato', exact: true });
        const tooltip = page.locator('.status-heading .control-tooltip');
        const assertTooltipInside = async () => {
          const inside = await tooltip.evaluate(element => {
            const box = element.getBoundingClientRect();
            return box.width > 0 && box.height > 0 && box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight;
          });
          if (!inside) await test.info().attach('status-tooltip-diagnostic', { body: JSON.stringify(await collectLayoutDiagnostic(page), null, 2), contentType: 'application/json' });
          expect(inside, 'Complete status tooltip must fit, without clipping').toBe(true);
        };
        await assertTooltipInside();
        await closeStatus.hover();
        await expect(tooltip).toBeVisible();
        await assertTooltipInside(); await assertLayout();
        await page.locator('.brand').hover();
        await expect(tooltip).toBeHidden();
        await closeStatus.focus();
        await expect(tooltip).toBeVisible();
        await assertTooltipInside(); await assertLayout();
      });
      await openMenu(); await assertLayout(true); await closeMenu();
      await togglePanel('Nascondi stato');
      await assertLayout();
      expect(await page.locator('.energy-one').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
      await page.screenshot({ path: `evidence/mini-minimal-viewport-${label}.png` });
    }
    expect(errors).toEqual([]);

    // Test a real renderer-initiated navigation LAST: Chromium can keep
    // Playwright's Page lifecycle in a provisional-navigation state after
    // Electron cancels it. Page locators beyond this point would wait for
    // navigation to finish even when Electron has retained the trusted URL.
    // Do not fake the navigation event or relax any production security rule.
    const navigation = await desktop.evaluate(({ BrowserWindow }) => {
      const browserWindow = BrowserWindow.getAllWindows()[0];
      if (!browserWindow) throw new Error('Electron window missing during navigation verification');
      const contents = browserWindow.webContents;
      return new Promise<{ url: string; prevented: boolean } | null>(resolve => {
        const timer = setTimeout(() => resolve(null), 3_000);
        contents.once('will-frame-navigate', details => {
          clearTimeout(timer);
          resolve({ url: details.url, prevented: details.defaultPrevented });
        });
        // Runs as renderer JavaScript; no webContents.loadURL() shortcut.
        // The main-process handler installed by the app must prevent it.
        void contents.executeJavaScript("location.href = 'https://example.org'").catch(() => {});
      });
    });
    expect(navigation).toEqual({ url: 'https://example.org/', prevented: true });
    await expect.poll(() => desktop.evaluate(({ BrowserWindow }) => ({
      windows: BrowserWindow.getAllWindows().length,
      url: BrowserWindow.getAllWindows()[0]?.webContents.getURL() ?? '',
      destroyed: BrowserWindow.getAllWindows()[0]?.webContents.isDestroyed() ?? true,
    })), { message: 'Blocked navigation must not replace or destroy NEYDRA' })
      .toEqual({ windows: 1, url: 'app://desktop/index.html', destroyed: false });
  } finally { await desktop.close(); }
});
