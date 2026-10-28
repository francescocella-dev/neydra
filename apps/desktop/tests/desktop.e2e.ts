import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

test('Mini UI, native fullscreen, offline stream and Electron security', async () => {
  const launchEnv = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined)) as Record<string, string>;
  const desktop = await electron.launch({ args: [resolve('.')], env: launchEnv, chromiumSandbox: true });
  try {
    const page = await desktop.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await expect(page.getByRole('heading', { name: 'Conversazione', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mini.' })).toBeVisible();
    const prompt = page.getByLabel('Messaggio per ChatGPT (massimo 2000 caratteri)');
    await prompt.fill('Test locale: il testo deve restare dopo la chiusura.');
    await page.getByRole('button', { name: 'Nascondi chat' }).click();
    await expect(page.locator('.conversation-zone')).toBeHidden();
    await page.getByRole('button', { name: 'Apri chat' }).click();
    await expect(prompt).toHaveValue('Test locale: il testo deve restare dopo la chiusura.');
    await page.getByRole('button', { name: 'Nascondi stato' }).click();
    await expect(page.locator('.telemetry-zone')).toBeHidden();
    await page.getByRole('button', { name: 'Mostra stato' }).click();
    await expect(page.getByText('Quota non disponibile')).toBeVisible();
    await expect(page.getByRole('button', { name: /Invia a ChatGPT/ })).toBeDisabled();
    await expect(page.getByLabel('Modello autorizzato selezionato')).toHaveValue('');
    expect(await page.evaluate(() => window.neydra.getConnection())).toEqual({ state: 'disconnected', models: [] });
    expect(await page.evaluate(() => window.neydra.startChatGPT({ requestId: crypto.randomUUID(), prompt: 'fixture', model: 'unauthorized', consent: 'included-plan-checked' }))).toEqual({ ok: false, code: 'auth-required' });
    await page.getByRole('button', { name: 'Impostazioni' }).click();
    const settings = page.getByRole('dialog', { name: 'Impostazioni' });
    await expect(settings).toBeVisible();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.getElementById('mini-settings')?.contains(document.activeElement))).toBe(true);
    await settings.getByRole('button', { name: 'Tema e aspetto' }).click();
    await settings.getByLabel('Riduci le animazioni di sfondo').check();
    expect(await page.locator('.energy-one').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
    await settings.getByRole('button', { name: 'Voce e ascolto' }).click();
    await expect(settings.getByText('Non implementata')).toBeVisible();
    await settings.getByRole('button', { name: 'ChatGPT e modelli' }).click();
    await settings.getByRole('button', { name: 'Apri accesso ChatGPT' }).click();
    await expect(settings).toBeHidden();
    await expect(page.getByRole('button', { name: 'Continue with ChatGPT' })).toBeVisible();
    // Do not click sign-in or send a real model request.
    await page.locator('#chat-account > summary').click();
    await page.getByRole('button', { name: 'Impostazioni' }).click();
    await settings.getByRole('button', { name: 'Informazioni e strumenti tecnici' }).click();
    await settings.getByText('Banco di prova offline', { exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Avvia demo offline' })).toBeEnabled();
    expect(await desktop.evaluate(({ app }) => app.commandLine.hasSwitch('no-sandbox'))).toBe(false);
    expect(await page.evaluate(() => ({ require: typeof Reflect.get(window, 'require'), process: typeof Reflect.get(window, 'process'), keys: Object.keys(window.neydra).sort() })))
      .toEqual({ require: 'undefined', process: 'undefined', keys: ['cancel', 'cancelConnect', 'connectChatGPT', 'disconnectChatGPT', 'getConnection', 'getStatus', 'getWindowState', 'onEvent', 'onWindowState', 'resetChat', 'setFullscreen', 'startChatGPT', 'startOfflineDemo'] });
    expect(await page.evaluate(() => window.neydra.startOfflineDemo({ requestId: 'invalid', prompt: 'test' }))).toEqual({ ok: false, code: 'invalid-request' });
    expect(await page.evaluate(() => window.neydra.setFullscreen({ enabled: 'true' } as never))).toEqual({ ok: false, code: 'invalid-request' });
    const status = await page.evaluate(() => window.neydra.getStatus());
    expect(status.mode).toBe('offline'); expect(status.auth).toBe('available-in-main');
    await page.getByRole('button', { name: 'Avvia demo offline' }).click();
    await expect(page.getByRole('status')).toHaveText('Demo offline completata');
    await expect(page.getByLabel('Testo demo')).toContainText('testo è predefinito');
    await page.getByRole('button', { name: 'Avvia demo offline' }).click();
    await page.keyboard.press('Escape');
    await expect(settings).toBeHidden();
    await expect(page.getByRole('button', { name: 'Impostazioni' })).toBeFocused();
    await page.getByRole('button', { name: 'Impostazioni' }).click();
    await expect(page.getByRole('status')).toHaveText('Demo offline annullata');
    await settings.getByRole('button', { name: 'Chiudi impostazioni' }).click();
    expect(await page.evaluate(async () => {
      try { await fetch('https://example.org'); return 'allowed'; } catch { return 'blocked'; }
    })).toBe('blocked');
    expect(await page.evaluate(async () => (await navigator.permissions.query({ name: 'microphone' as PermissionName })).state)).toBe('denied');
    expect(await page.evaluate(async () => (await navigator.permissions.query({ name: 'camera' as PermissionName })).state)).toBe('denied');
    await page.evaluate(() => { window.open('https://example.org'); });
    expect(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);

    await page.getByRole('button', { name: /^Schermo intero/ }).click();
    await expect.poll(() => desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFullScreen())).toBe(true);
    await expect(page.getByRole('button', { name: /^Esci da schermo intero/ })).toBeVisible();
    expect(await page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await page.keyboard.press('F11');
    await expect.poll(() => desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFullScreen())).toBe(false);
    await page.keyboard.press('F11');
    await expect.poll(() => desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFullScreen())).toBe(true);
    await page.getByRole('button', { name: /^Esci da schermo intero/ }).click();
    await expect.poll(() => desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFullScreen())).toBe(false);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Conversazione', exact: true })).toBeVisible();
    expect(await page.evaluate(async () => {
      const fonts = await Promise.all([document.fonts.load('16px Manrope'), document.fonts.load('24px Oxanium')]);
      return fonts.map(faces => faces.length > 0 && faces.every(face => face.status === 'loaded'));
    })).toEqual([true, true]);
    await mkdir('evidence', { recursive: true });
    await page.screenshot({ path: 'evidence/mini-premium-desktop.png' });
    // Effective CSS viewport coverage only; this does not prove Windows OS DPI behavior.
    for (const [label, width, height] of [['125', 1024, 688], ['150', 853, 573], ['narrow', 760, 800]] as const) {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      expect(await page.locator('.energy-one').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
      await expect(prompt).toBeEnabled();
      await page.screenshot({ path: `evidence/mini-premium-viewport-${label}.png`, fullPage: true });
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
