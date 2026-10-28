import { readFile, writeFile, mkdir, copyFile, stat, open, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { checkAsset } from './check-asset.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options: { source: { type: 'string' }, approved: { type: 'string' }, blender: { type: 'string' }, serve: { type: 'boolean' }, open: { type: 'boolean' } } });
const candidates = [resolve(root, '../../holo_asset_work'), resolve(root, '../../../holo_asset_work')];
let assets = candidates[0];
for (const candidate of candidates) {
  try { if ((await stat(candidate)).isDirectory()) { assets = candidate; break; } } catch { /* absent candidate */ }
}
const source = resolve(values.source ?? join(assets, 'NEYDRA_Holo_FacialKeys_v01.blend'));
const approved = resolve(values.approved ?? join(assets, 'NEYDRA_Holo_AutoFace_v01.blend'));
const blender = values.blender ?? process.env.NEYDRA_BLENDER ?? 'C:/Program Files/Blender Foundation/Blender 4.5/blender.exe';
const script = join(root, 'scripts/export_blend.py');
await mkdir(join(root, 'local'), { recursive: true });
const lockPath = join(root, 'local/pipeline.lock');
const lock = await open(lockPath, 'wx').catch(() => { throw new Error('Pipeline already running (or stale local/pipeline.lock). Inspect the lock before retrying.'); });
try {
  const hash = createHash('sha256');
  for (const path of [source, approved, script]) {
    const input = await readFile(path).catch(error => {
      if (error.code === 'ENOENT') throw new Error(`BLOCKED ON LOCAL BLEND INPUT: missing ${path}`);
      throw error;
    });
    hash.update(input);
  }
  const run = join(root, 'local/runs', hash.digest('hex').slice(0, 20));
  const reportFile = join(run, 'export-report.json');
  let cached = false;
  try { cached = (await stat(reportFile)).isFile(); } catch { /* absent run */ }
  if (!cached) {
    await mkdir(dirname(run), { recursive: true });
    const log = [];
    console.log('Blender: deriving a new runtime copy; original inputs remain read-only.');
    const child = spawn(blender, ['--background', '--factory-startup', '--disable-autoexec', '--python-exit-code', '1', '--python', script, '--', source, approved, run], { cwd: root, windowsHide: true });
    child.stdout.on('data', chunk => { log.push(chunk); process.stdout.write(chunk); });
    child.stderr.on('data', chunk => { log.push(chunk); process.stderr.write(chunk); });
    const code = await new Promise((res, rej) => { child.on('error', rej); child.on('close', res); });
    await writeFile(join(root, 'local/last-export.log'), Buffer.concat(log));
    if (code !== 0) throw new Error(`Blender exited ${code}; inspect local/last-export.log. No automatic retry.`);
  }
  const check = await checkAsset(join(run, 'holo-head.glb'), reportFile);
  await writeFile(join(run, 'asset-check.json'), JSON.stringify(check, null, 2) + '\n');
  await mkdir(join(root, 'local/public'), { recursive: true });
  for (const name of ['holo-head.glb', 'export-report.json']) await copyFile(join(run, name), join(root, 'local/public', name));
  await writeFile(join(root, 'local/active.json'), JSON.stringify({ run, cached, bytes: check.bytes, sha256: check.sha256 }, null, 2) + '\n');
  console.log(`PASS: ${check.bytes} bytes, ${Object.keys(check.morphs).length} morphs; ${cached ? 'verified cached run' : 'new export'}.`);
} finally {
  await lock.close();
  await unlink(lockPath);
}
if (values.serve) {
  const { createServer } = await import('vite');
  const server = await createServer({ root });
  await server.listen();
  server.printUrls();
  if (values.open) server.openBrowser();
}
