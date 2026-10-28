import { request as httpRequest } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { listen } from '../src/main/chatgpt/loopback.mjs';
import { registrationStore } from '../src/main/chatgpt/registration';

function get(url: string, headers: Record<string, string> = {}) {
  return new Promise<{ status?: number; text: string }>((resolve, reject) => {
    const req = httpRequest(url, { headers }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, text }));
    });
    req.once('error', reject); req.end();
  });
}
it('real loopback listener rejects origin/host and accepts one synthetic callback only', async () => {
  const server = await listen('synthetic-host', 'fixture-client');
  try {
    const url = `${server.tx.redirectUri}?state=${server.tx.state}&code=synthetic`;
    expect((await get(url, { origin: 'https://example.org' })).status).toBe(400);
    expect((await get(url, { host: 'example.org' })).status).toBe(400);
    const response = await get(url);
    expect(response.status).toBe(200);
    expect(response.text).not.toMatch(/synthetic|state=|code=/);
    expect(await server.result).toEqual({ callback: { clientId: 'fixture-client', code: 'synthetic' } });
    await get(url).then(response => expect(response.status).toBe(409), error => {
      expect(['ECONNREFUSED', 'ECONNRESET']).toContain((error as NodeJS.ErrnoException).code);
    });
    expect(await server.result).toEqual({ callback: { clientId: 'fixture-client', code: 'synthetic' } });
  } finally { server.close(); }
});
it('loopback cancellation, denial and timeout settle without a token exchange', async () => {
  const cancelled = await listen('synthetic-host', null);
  cancelled.close();
  expect(await cancelled.result).toMatchObject({ error: { code: 'cancelled' } });
  const denied = await listen('synthetic-host', null);
  await get(`${denied.tx.redirectUri}?state=${denied.tx.state}&error=access_denied`);
  expect(await denied.result).toMatchObject({ error: { code: 'consent_denied' } });
  const timedOut = await listen('synthetic-host', null, 20);
  expect(await timedOut.result).toMatchObject({ error: { code: 'consent_timeout' } });
});
it('persists only opaque registration metadata; corrupt files fail closed', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'neydra-registration-'));
  try {
    const store = registrationStore(directory);
    const first = await store.load();
    expect(await store.load()).toEqual(first);
    await store.save({ ...first, clientId: 'fixture-client', subject: 'synthetic-subject' });
    expect(await store.load()).toMatchObject({ hostId: first.hostId, clientId: 'fixture-client' });
    const path = join(directory, 'chatgpt-registration.json');
    const text = await readFile(path, 'utf8');
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(['clientId', 'hostId', 'subject']);
    expect(text).not.toMatch(/accessToken|id_token|refresh_token|code|verifier/);
    await writeFile(path, '{}');
    await expect(store.load()).rejects.toThrow('Registration unavailable');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
