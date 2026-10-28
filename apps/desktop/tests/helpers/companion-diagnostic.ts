import type { TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// Persist first: list reporters need not materialize in-memory attachments.
// Callers supply only the geometry collector's fixed, non-personal fields.
export async function saveCompanionDiagnostic(info: Pick<TestInfo, 'outputPath' | 'attach'>, geometry: readonly unknown[]) {
  const path = info.outputPath('companion-v2-geometry.json');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(geometry, null, 2), 'utf8');
  await info.attach('companion-v2-geometry', { path, contentType: 'application/json' });
  return path;
}
