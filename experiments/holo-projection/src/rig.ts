import { Mesh } from 'three';
import type { FacialFrame } from './engine/protocol';

/** PR #7 canonical name -> MPFB 2.0.18 / visemes02 source name. */
export const RIG_MAP = {
  viseme_aa: 'viseme_aa', viseme_ee: 'viseme_E', viseme_ih: 'viseme_I',
  viseme_oh: 'viseme_O', viseme_ou: 'viseme_U', viseme_ff: 'viseme_FF',
  viseme_mm: 'viseme_PP', eyeBlinkLeft: 'eyeBlinkLeft', eyeBlinkRight: 'eyeBlinkRight',
  jawOpen: 'jawOpen', mouthClose: 'mouthClose', mouthPucker: 'mouthPucker',
  mouthFunnel: 'mouthFunnel', mouthSmileLeft: 'mouthSmileLeft', mouthSmileRight: 'mouthSmileRight',
} as const;

export function setMorph(mesh: Mesh, name: string, weight: number): void {
  const index = mesh.morphTargetDictionary?.[name];
  if (index === undefined || !mesh.morphTargetInfluences) throw new Error(`Missing morph: ${name}`);
  mesh.morphTargetInfluences[index] = Math.max(0, Math.min(1, Number.isFinite(weight) ? weight : 0));
}

export function applyFace(mesh: Mesh, frame: FacialFrame): void {
  mesh.morphTargetInfluences?.fill(0);
  // MPFB visemes already contain authored jaw movement. Do not add the engine's
  // generic jaw on top: that would double the opening in this particular asset.
  for (const [canonical, source] of Object.entries(RIG_MAP)) {
    if (canonical === 'jawOpen') continue;
    const value = frame[canonical as keyof FacialFrame];
    if (typeof value === 'number') setMorph(mesh, source, value);
  }
  setMorph(mesh, 'mouthSmileLeft', frame.mouthSmile * 0.25);
  setMorph(mesh, 'mouthSmileRight', frame.mouthSmile * 0.25);
  // Brows intentionally ignored: Holo has no drawn eyebrows.
}
