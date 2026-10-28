import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
const schema = z.strictObject({ hostId: z.uuid(), clientId: z.string().min(1).max(512).nullable(), subject: z.string().min(1).max(512).nullable() });
export type Registration = z.infer<typeof schema>;
export interface RegistrationStore { load(): Promise<Registration>; save(value: Registration): Promise<void> }
// Opaque registration metadata only (keep it private). Tokens and conversations never reach disk.
export function registrationStore(directory: string): RegistrationStore {
  const path = join(directory, 'chatgpt-registration.json');
  const save = async (value: Registration) => {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(schema.parse(value)), { mode: 0o600, flag: 'wx' });
    await rename(temporary, path);
  };
  return { save, async load() {
    try { return schema.parse(JSON.parse(await readFile(path, 'utf8'))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Registration unavailable', { cause: error });
      const value = { hostId: randomUUID(), clientId: null, subject: null };
      await save(value);
      return value;
    }
  } };
}
