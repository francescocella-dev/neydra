import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const base = join(process.env.APPDATA ?? '', 'Blender Foundation/Blender/4.5/extensions');
const manifest = await readFile(join(base, 'blender_org/mpfb/blender_manifest.toml'), 'utf8');
const version = manifest.match(/^version = "([^"]+)"/m)?.[1];
if (!version) throw new Error('MPFB version unavailable');
const packs = [];
for (const pack of ['faceunits01', 'visemes02']) {
  const data = await readFile(join(base, '.user/blender_org/mpfb/data/packs', `${pack}.json`));
  const entries = Object.values(JSON.parse(data.toString()));
  const licenses = [...new Set(entries.map(item => item.license))];
  if (licenses.some(value => value !== 'CC0')) throw new Error('Pack requires license review: ' + pack);
  packs.push({ pack, entries: entries.length, licenses, authors: [...new Set(entries.map(item => item.author))],
    metadataSha256: createHash('sha256').update(data).digest('hex'),
    version: 'Installed metadata has no explicit semantic pack version; identified by SHA256' });
}
await writeFile('evidence/provenance.json', JSON.stringify({ mpfb: version, packs,
  baseMesh: { license: 'CC0-1.0', source: 'https://github.com/makehumancommunity/mpfb2/blob/master/LICENSE.md' },
  functionalPacksSource: 'https://static.makehumancommunity.org/assets/assetpacks.html',
  noExternalTexturesOrAnatomyAdded: true, binaryCommitAuthorized: false,
  note: 'Metadata proves installed pack declarations; original downloadable ZIP hashes unavailable. No MPFB/Blender program code bundled.' }, null, 2) + '\n');
console.log('PASS: installed MPFB and functional pack license metadata recorded.');
