import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
const manifest = JSON.parse(
  await readFile(
    new URL("../../../assets/avatar-stage.manifest.json", import.meta.url),
  ),
);
for (const id of ["holo", "mini"]) {
  const asset = manifest.assets.find((a) => a.id === id);
  assert.equal(asset.license, "MIT");
  assert.equal(asset.productionReady, false);
  const bytes = await readFile(
    new URL(`../public/models/${id}-prototype.glb`, import.meta.url),
  );
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.ok(bytes.byteLength < 2_000_000);
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  for (const name of ["Body", "Head", "Mouth", "EyeLeft", "EyeRight"])
    assert.ok(gltf.scene.getObjectByName(name), `${id} missing ${name}`);
  const morphs = new Set();
  let meshes = 0;
  gltf.scene.traverse((obj) => {
    if (obj.isMesh) {
      meshes++;
      Object.keys(obj.morphTargetDictionary ?? {}).forEach((n) =>
        morphs.add(n),
      );
    }
  });
  for (const name of [
    "eyeBlinkLeft",
    "eyeBlinkRight",
    "jawOpen",
    "mouthSmile",
    "viseme_aa",
    "viseme_ee",
    "viseme_ih",
    "viseme_oh",
    "viseme_ou",
    "viseme_ff",
    "viseme_mm",
  ])
    assert.ok(morphs.has(name), `${id} missing ${name}`);
  assert.deepEqual(
    gltf.animations.map((c) => c.name).sort(),
    [
      "idle",
      "listening",
      "processing",
      "speaking",
      "interrupted",
      "error",
    ].sort(),
  );
  console.log(
    `PASS ${id}: GLB v2, ${meshes} meshes, ${morphs.size} facial targets, six animation clips, MIT, ${bytes.length} bytes`,
  );
}
