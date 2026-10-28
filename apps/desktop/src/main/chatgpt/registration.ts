import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

// OpenAI OSS SIWC accepts a UUID *URN*, not a bare UUID. This host value
// persists across app launches; never regenerate it on a normal login.
const hostIdSchema = z.string().regex(
  /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
);
const fields = { clientId: z.string().min(1).max(512).nullable(), subject: z.string().min(1).max(512).nullable() };
const schema = z.strictObject({ hostId: hostIdSchema, ...fields });
const legacySchema = z.strictObject({ hostId: z.uuid(), ...fields });

export type Registration = z.infer<typeof schema>;
export interface RegistrationStore { load(): Promise<Registration>; save(value: Registration): Promise<void> }

// Opaque registration metadata only. Tokens and conversations never reach disk.
export function registrationStore(directory: string): RegistrationStore {
  const path = join(directory, 'chatgpt-registration.json');
  const save = async (value: Registration) => {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(schema.parse(value)), { mode: 0o600, flag: 'wx' });
    await rename(temporary, path);
  };
  return { save, async load() {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error('Registration unavailable', { cause: error });
      const value: Registration = { hostId: `urn:uuid:${randomUUID()}`, clientId: null, subject: null };
      await save(value);
      return value;
    }

    const current = schema.safeParse(raw);
    if (current.success) return current.data;

    // PR #9 originally persisted a bare UUID before reaching consent.
    // Recover ONLY an unregistered host, preserving the same UUID bytes.
    // Never silently rebind an existing issued OAuth client/identity to
    // a differently formatted host; leave such a record untouched.
    const legacy = legacySchema.safeParse(raw);
    if (legacy.success && legacy.data.clientId === null && legacy.data.subject === null) {
      const migrated: Registration = {
        hostId: `urn:uuid:${legacy.data.hostId}`, clientId: null, subject: null,
      };
      await save(migrated);
      return migrated;
    }
    throw new Error('Registration unavailable');
  } };
}
