import { expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reductionPreference } from '../src/main/reduction-preference';

it('persists only version/mode atomically and restores it with a new store after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'neydra-reduction-'));
  try {
    const first = reductionPreference(directory);
    expect(await first.get()).toEqual({ mode: 'circle', status: 'default' });
    expect(await first.set('island')).toEqual({ mode: 'island', status: 'saved' });
    expect(JSON.parse(await readFile(join(directory, 'reduction-preference.json'), 'utf8'))).toEqual({ version: 1, mode: 'island' });
    const restarted = reductionPreference(directory);
    expect(await restarted.get()).toEqual({ mode: 'island', status: 'saved' });
    await restarted.set('circle'); expect((await reductionPreference(directory).get()).mode).toBe('circle');
    expect(await readdir(directory)).toEqual(['reduction-preference.json']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
it('falls back on corrupt, oversized, unknown or extra-field files without overwriting owner data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'neydra-reduction-invalid-'));
  try {
    for (const content of ['{', '{}', '{"version":1}', JSON.stringify({ version: 1, mode: 'unknown' }), JSON.stringify({ version: 2, mode: 'island' }),
      JSON.stringify({ version: 1, mode: 'island', x: 1, token: 'synthetic' }), ' '.repeat(1100)]) {
      await writeFile(join(directory, 'reduction-preference.json'), content);
      expect(await reductionPreference(directory).get()).toEqual({ mode: 'circle', status: 'read-failed' });
      expect(await readFile(join(directory, 'reduction-preference.json'), 'utf8')).toBe(content);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
it('reports read/write errors, uses circle for the next reduction and never retries automatically', async () => {
  const read = vi.fn(async () => { throw new Error('synthetic read failure'); });
  const write = vi.fn(async () => { throw new Error('synthetic write failure'); });
  const store = reductionPreference('/unused', { read, write });
  expect(await store.get()).toEqual({ mode: 'circle', status: 'read-failed' });
  expect(await store.set('island')).toEqual({ mode: 'circle', status: 'save-failed' });
  expect((await store.get()).mode).toBe('circle');
  await expect(store.set({ mode: 'island', path: '/arbitrary' })).rejects.toThrow();
  expect(write).toHaveBeenCalledTimes(1); expect(read).toHaveBeenCalledTimes(1);
});
it('serializes preference writes and does not expose a choice before its write completes', async () => {
  const order: string[] = [];
  let finish!: () => void;
  const store = reductionPreference('/unused', { read: async () => '{"version":1,"mode":"circle"}',
    write: async value => { order.push(value); if (order.length === 1) await new Promise<void>(resolve => { finish = resolve; }); },
  });
  const first = store.set('island');
  await vi.waitFor(() => expect(order).toHaveLength(1));
  const second = store.set('circle');
  expect(order).toHaveLength(1); finish();
  expect(await first).toMatchObject({ mode: 'island' }); expect(await second).toMatchObject({ mode: 'circle' });
  expect(await store.get()).toEqual({ mode: 'circle', status: 'saved' });
  expect(order.map(value => JSON.parse(value).mode)).toEqual(['island', 'circle']);
});

it('cleans only its own temporary write after a real filesystem failure, preserving the obstructing path', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'neydra-reduction-write-'));
  try {
    const obstruction = join(directory, 'reduction-preference.json'); await mkdir(obstruction);
    await writeFile(join(obstruction, 'marker'), 'owned test fixture');
    const store = reductionPreference(directory);
    expect(await store.set('island')).toEqual({ mode: 'circle', status: 'save-failed' });
    expect(await readdir(directory)).toEqual(['reduction-preference.json']);
    expect(await readFile(join(obstruction, 'marker'), 'utf8')).toBe('owned test fixture');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
