import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Vector3, Box3 } from 'three';

export function inspect(data) {
  if (data.length < 20 || data.length > 20 * 1024 * 1024) throw new Error('GLB size outside 20 MiB contract');
  if (data.readUInt32LE(0) !== 0x46546c67 || data.readUInt32LE(4) !== 2 || data.readUInt32LE(8) !== data.length) throw new Error('Invalid GLB header');
  const size = data.readUInt32LE(12);
  if (data.readUInt32LE(16) !== 0x4e4f534a || 20 + size > data.length) throw new Error('Invalid JSON chunk');
  const json = JSON.parse(data.subarray(20, 20 + size).toString());
  if ([...(json.buffers ?? []), ...(json.images ?? [])].some(item => item.uri)) throw new Error('External/data URI forbidden');
  if (json.extensionsRequired?.length) throw new Error('Required extensions forbidden');
  return json;
}

export async function checkAsset(file, reportFile) {
  const data = await readFile(file);
  const json = inspect(data);
  const report = JSON.parse(await readFile(reportFile, 'utf8'));
  const sha256 = createHash('sha256').update(data).digest('hex');
  if (sha256 !== report.glb.sha256 || data.length !== report.glb.bytes) throw new Error('GLB/report hash mismatch');
  const gltf = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
  const meshes = [];
  gltf.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
  if (meshes.length !== 1 || !gltf.scene.getObjectByName('Head') || !gltf.scene.getObjectByName('Body')) throw new Error('Invalid hierarchy');
  const mesh = meshes[0];
  const bounds = new Box3().setFromObject(gltf.scene);
  if (bounds.isEmpty() || bounds.getSize(new Vector3()).y > 0.35) throw new Error('Not a compact head in meters');
  const checks = {};
  for (const [name, expected] of Object.entries(report.morphs)) {
    const index = mesh.morphTargetDictionary?.[name];
    if (index === undefined) throw new Error('Missing exported channel ' + name);
    const attr = mesh.geometry.morphAttributes.position[index];
    let changed = 0, maxDelta = 0;
    for (let i = 0; i < attr.count; i++) {
      const delta = new Vector3().fromBufferAttribute(attr, i);
      if (!mesh.geometry.morphTargetsRelative) delta.sub(new Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i));
      const length = delta.length();
      if (!Number.isFinite(length)) throw new Error('Non-finite delta ' + name);
      changed += Number(length > 1e-7);
      maxDelta = Math.max(maxDelta, length);
    }
    if (changed < expected.changed || Math.abs(maxDelta - expected.maxDelta) > 1e-6) throw new Error('Export damaged morph ' + name);
    checks[name] = { changed, maxDelta };
  }
  const triangles = json.meshes.reduce((sum, m) => sum + m.primitives.reduce((s, p) => s + json.accessors[p.indices].count / 3, 0), 0);
  return { status: 'PASS', bytes: data.length, sha256, triangles, morphs: checks, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    proof: 'Real GLTFLoader decode and finite exported position deltas; visual/anatomical acceptance separate' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await checkAsset(process.argv[2] ?? 'local/public/holo-head.glb', process.argv[3] ?? 'local/public/export-report.json');
  console.log(JSON.stringify(result, null, 2));
}
