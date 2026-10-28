import { describe, it, expect } from 'vitest';
import { inspectGlb } from '../src/assets';

function glb(json: object) {
  const content = new TextEncoder().encode(JSON.stringify(json));
  const data = new ArrayBuffer(content.length + 20);
  const v = new DataView(data);
  [0x46546c67, 2, data.byteLength, content.length, 0x4e4f534a].forEach((n, i) => v.setUint32(i * 4, n, true));
  new Uint8Array(data, 20).set(content);
  return data;
}
describe('PR #7 import boundary', () => {
  it('rejects external or embedded URI dependencies before GLTFLoader', () => {
    expect(() => inspectGlb(glb({ buffers: [{ uri: 'https://invalid.example/asset.bin' }] }))).toThrow();
    expect(() => inspectGlb(glb({ images: [{ uri: 'data:image/png;base64,AAAA' }] }))).toThrow();
    expect(() => inspectGlb(glb({ extensionsRequired: ['KHR_draco_mesh_compression'] }))).toThrow();
    expect(() => inspectGlb(new ArrayBuffer(21 * 1024 * 1024))).toThrow();
  });
});
