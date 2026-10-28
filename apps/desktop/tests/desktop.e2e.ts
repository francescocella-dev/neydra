import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

test('real Electron bridge, security, offline stream, interruption and reload', async () => {
  const launchEnv = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined)) as Record<string, string>;
  const desktop = await electron.launch({ args: [resolve('.')], env: launchEnv, chromiumSandbox: true });
  try {
    const page = await desktop.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await expect(page.getByRole('button', { name: 'Avvia demo offline' })).toBeEnabled();
    expect(await desktop.evaluate(({ app }) => app.commandLine.hasSwitch('no-sandbox'))).toBe(false);
    expect(await page.evaluate(() => ({ require: typeof Reflect.get(window, 'require'), process: typeof Reflect.get(window, 'process'), keys: Object.keys(window.neydra).sort() })))
      .toEqual({ require: 'undefined', process: 'undefined', keys: ['cancel', 'getStatus', 'onEvent', 'startOfflineDemo'] });
    expect(await page.evaluate(() => window.neydra.startOfflineDemo({ requestId: 'invalid', prompt: 'test' }))).toEqual({ ok: false, code: 'invalid-request' });
    const status = await page.evaluate(() => window.neydra.getStatus());
    expect(status.mode).toBe('offline');
    expect(status.auth).toBe('not-integrated');
    await page.getByRole('button', { name: 'Avvia demo offline' }).click();
    await expect(page.getByRole('status')).toHaveText('Demo offline completata');
    await expect(page.getByLabel('Testo demo')).toContainText('testo è predefinito');
    await page.getByRole('button', { name: 'Avvia demo offline' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('status')).toHaveText('Demo offline annullata');
    await page.getByLabel('Preferenza avatar futura').selectOption('mini');
    await expect(page.getByLabel('Preferenza avatar futura')).toHaveValue('mini');
    expect(await page.evaluate(async () => {
      try { await fetch('https://example.org'); return 'allowed'; } catch { return 'blocked'; }
    })).toBe('blocked');
    expect(await page.evaluate(async () => (await navigator.permissions.query({ name: 'microphone' as PermissionName })).state)).toBe('denied');
    await page.evaluate(() => { window.open('https://example.org'); });
    expect(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    await page.evaluate(() => { location.href = 'https://example.org'; });
    await expect(page).toHaveURL('app://desktop/index.html');
    await page.getByRole('button', { name: 'Avvia demo offline' }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Avvia demo offline' })).toBeEnabled();
    await page.getByRole('button', { name: 'Avvia demo offline' }).click();
    await expect(page.getByRole('status')).toHaveText('Demo offline completata');
    await mkdir('evidence', { recursive: true });
    await page.screenshot({ path: 'evidence/desktop-offline.png' });
    await page.setViewportSize({ width: 760, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.screenshot({ path: 'evidence/desktop-narrow.png' });
    expect(errors).toEqual([]);
  } finally { await desktop.close(); }
});
