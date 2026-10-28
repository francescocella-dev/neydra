import { test as base } from '@playwright/test';
import { saveCompanionDiagnostic } from './companion-diagnostic';

// Fixture teardown also runs for launch/runner failures that bypass the test's
// catch block. Persist before the reporter runs, including an empty launch log.
export const test = base.extend<{ geometry: unknown[] }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright requires destructured fixture dependencies.
  geometry: async ({}, use, info) => {
    const samples: unknown[] = [];
    try { await use(samples); }
    finally {
      if (info.status !== info.expectedStatus) await saveCompanionDiagnostic(info, samples);
    }
  },
});
