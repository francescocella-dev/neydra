import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/browser', workers: 1, timeout: 60_000,
  outputDir: 'local/test-results',
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1440, height: 960 },
    launchOptions: { channel: 'msedge' } },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:4173', reuseExistingServer: true, timeout: 30_000 },
});
