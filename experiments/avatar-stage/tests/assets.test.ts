import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { inspectGlb, validateScene } from "../src/stage/assets";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
function glb(json: object): ArrayBuffer {
  const text = JSON.stringify(json),
    padded = text.padEnd(Math.ceil(text.length / 4) * 4, " ");
  const data = new ArrayBuffer(20 + padded.length),
    view = new DataView(data);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, data.byteLength, true);
  view.setUint32(12, padded.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(data, 20).set(new TextEncoder().encode(padded));
  return data;
}
describe("local asset boundary", () => {
  it("accepts both original binary fixtures", () => {
    for (const id of ["holo", "mini"]) {
      const b = readFileSync(
        new URL(`../public/models/${id}-prototype.glb`, import.meta.url),
      );
      expect(() =>
        inspectGlb(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)),
      ).not.toThrow();
    }
  });
  it("rejects a parseable GLB whose scene has no geometry", async () => {
    const data = glb({
      asset: { version: "2.0" },
      scenes: [{ nodes: [] }],
      scene: 0,
    });
    inspectGlb(data);
    const parsed = await new GLTFLoader().parseAsync(data, "");
    expect(() => validateScene(parsed)).toThrow("geometria visualizzabile");
  });
  it("rejects external resources, required decoders, invalid headers and oversized files", () => {
    for (const json of [
      { buffers: [{ uri: "https://example.com/model.bin" }] },
      { images: [{ uri: "https://example.com/texture.png" }] },
      { buffers: [{ uri: "data:application/octet-stream;base64,AQ==" }] },
      { extensionsRequired: ["KHR_draco_mesh_compression"] },
    ])
      expect(() => inspectGlb(glb(json))).toThrow();
    expect(() => inspectGlb(new ArrayBuffer(1))).toThrow();
    expect(() => inspectGlb(new ArrayBuffer(21 * 1024 * 1024))).toThrow();
    const invalid = glb({});
    new DataView(invalid).setUint32(8, 1, true);
    expect(() => inspectGlb(invalid)).toThrow();
  });
});
