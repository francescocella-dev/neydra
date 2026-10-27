import type { Group, Material, Mesh, Texture } from "three";
import { Box3, Vector3 } from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
export const MAX_GLB_BYTES = 20 * 1024 * 1024;
/** Embedded GLB only. Prevent imported files from initiating network fetches. */
export function inspectGlb(data: ArrayBuffer): void {
  if (data.byteLength < 20 || data.byteLength > MAX_GLB_BYTES)
    throw new Error("GLB non valido: limite 20 MiB.");
  const view = new DataView(data);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== data.byteLength
  )
    throw new Error("È richiesto un GLB 2.0 valido.");
  const length = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || length + 20 > data.byteLength)
    throw new Error("Chunk JSON GLB non valido.");
  const json = JSON.parse(
    new TextDecoder().decode(new Uint8Array(data, 20, length)),
  ) as {
    buffers?: { uri?: string }[];
    images?: { uri?: string }[];
    extensionsRequired?: string[];
  };
  if (
    [...(json.buffers ?? []), ...(json.images ?? [])].some((item) => item.uri)
  )
    throw new Error(
      "Usa un GLB autosufficiente: risorse URI esterne o incorporate non supportate.",
    );
  if (json.extensionsRequired?.length)
    throw new Error(
      "Estensioni GLB obbligatorie non supportate: esporta senza compressione Draco/KTX.",
    );
}
export function rigReport(gltf: GLTF): string {
  const names = new Set<string>();
  gltf.scene.traverse((obj) =>
    Object.keys((obj as Mesh).morphTargetDictionary ?? {}).forEach((n) =>
      names.add(n),
    ),
  );
  const head = Boolean(gltf.scene.getObjectByName("Head"));
  return `Head ${head ? "✓" : "assente"} · ${names.size} morph · ${gltf.animations.length} clip`;
}
export function validateScene(gltf: GLTF): void {
  const bounds = new Box3().setFromObject(gltf.scene);
  const size = bounds.getSize(new Vector3());
  if (
    bounds.isEmpty() ||
    ![...bounds.min.toArray(), ...bounds.max.toArray()].every(
      Number.isFinite,
    ) ||
    Math.max(size.x, size.y, size.z) < 0.0001
  )
    throw new Error("Il GLB non contiene geometria visualizzabile valida.");
}
export function disposeScene(scene: Group) {
  const geometries = new Set<Mesh["geometry"]>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  scene.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    for (const m of Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material]) {
      materials.add(m);
      Object.values(m).forEach((value) => {
        if (value?.isTexture) textures.add(value as Texture);
      });
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
}
