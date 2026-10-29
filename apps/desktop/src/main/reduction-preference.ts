import { mkdir, open, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { reductionModeSchema, type ReductionPreference } from '../shared/reduction-contracts';

const fileSchema = z.strictObject({ version: z.literal(1), mode: reductionModeSchema });
async function removeTemporary(path: string) {
  try { await unlink(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}
export interface PreferenceIO { read(): Promise<string>; write(value: string): Promise<void> }
export function reductionPreference(directory: string, io: PreferenceIO = {
  async read() {
    const file = await open(join(directory, 'reduction-preference.json'), 'r');
    try {
      const buffer = Buffer.alloc(1025), { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      if (bytesRead > 1024) throw new Error('Preference too large');
      return buffer.subarray(0, bytesRead).toString('utf8');
    } finally { await file.close(); }
  },
  async write(value) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = join(directory, `reduction-preference.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, value, { flag: 'wx', mode: 0o600 });
      await rename(temporary, join(directory, 'reduction-preference.json'));
    } finally {
      await removeTemporary(temporary);
    }
  },
}) {
  let state: ReductionPreference = { mode: 'circle', status: 'default' };
  let loaded: Promise<void> | undefined;
  let queue = Promise.resolve();
  const load = () => loaded ??= (async () => {
    try { state = { mode: fileSchema.parse(JSON.parse(await io.read())).mode, status: 'saved' }; }
    catch (error) { state = { mode: 'circle', status: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'default' : 'read-failed' }; }
  })();
  return {
    async get(): Promise<ReductionPreference> { await load(); await queue; return { ...state }; },
    async set(raw: unknown): Promise<ReductionPreference> {
      const mode = reductionModeSchema.parse(raw);
      await load();
      const operation = queue.then(async () => {
        try { await io.write(JSON.stringify(fileSchema.parse({ version: 1, mode }))); state = { mode, status: 'saved' }; }
        catch { state = { mode: 'circle', status: 'save-failed' }; }
        return { ...state };
      });
      queue = operation.then(() => {});
      return operation;
    },
  };
}
