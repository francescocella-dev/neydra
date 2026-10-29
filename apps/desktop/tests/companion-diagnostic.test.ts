import { expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { saveCompanionDiagnostic } from './helpers/companion-diagnostic';

it('persists before attaching a path and keeps the JSON if attachment reporting fails', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'neydra-geometry-'));
  const path = join(directory, 'nested', 'companion-v2-geometry.json');
  const geometry = [{ phase: 'failure', native: { bounds: { width: 72, height: 73 }, scale: 1.25 } }];
  try {
    const attach = vi.fn(async (_name, options) => {
      expect(JSON.parse(await readFile(options.path, 'utf8'))).toEqual(geometry);
      throw new Error('synthetic reporter failure');
    });
    await expect(saveCompanionDiagnostic({ outputPath: () => path, attach }, geometry)).rejects.toThrow('synthetic reporter failure');
    expect(attach).toHaveBeenCalledWith('companion-v2-geometry', { path, contentType: 'application/json' });
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(geometry);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it('retains a real JSON after a failing Playwright test with list reporter, without Electron or network', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'neydra-geometry-fail-'));
  const require = createRequire(import.meta.url);
  const playwright = require.resolve('@playwright/test');
  const helper = resolve('tests/helpers/companion-test.ts');
  const output = join(directory, 'test-results');
  try {
    await writeFile(join(directory, 'playwright.config.ts'), `export default { testDir: '.', testMatch: 'diagnostic.spec.ts', reporter: 'list', outputDir: ${JSON.stringify(output)}, workers: 1, retries: 0 };`);
    await writeFile(join(directory, 'diagnostic.spec.ts'), `
      import { expect } from ${JSON.stringify(playwright)};
      import { test } from ${JSON.stringify(helper)};
      test('synthetic geometry failure', async ({ geometry }) => {
        geometry.push({ phase: 'failure', native: { bounds: { width: 72, height: 73 }, scale: 1.25 } });
        expect(73).toBe(72);
      });
    `);
    const child = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--config', join(directory, 'playwright.config.ts')], {
      encoding: 'utf8', timeout: 20_000, env: { ...process.env, FORCE_COLOR: '0' },
    });
    expect(child.error).toBeUndefined();
    expect(child.status, child.stdout + child.stderr).toBe(1);
    expect(child.stdout).toContain('1 failed');
    const files = await readdir(output, { recursive: true });
    const json = files.find(file => file.endsWith('companion-v2-geometry.json'));
    expect(json, files.join('\n')).toBeDefined();
    expect(JSON.parse(await readFile(join(output, json!), 'utf8'))).toEqual([{ phase: 'failure', native: { bounds: { width: 72, height: 73 }, scale: 1.25 } }]);
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 25_000);
