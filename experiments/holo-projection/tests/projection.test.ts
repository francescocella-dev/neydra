import { describe, it, expect } from 'vitest';
import { Projection } from '../src/projection';
import { AvatarEngine } from '../src/engine/AvatarEngine';
import { applyFace } from '../src/rig';
import { BufferGeometry, Mesh, MeshBasicMaterial } from 'three';

describe('continuous projection', () => {
  it('uses 1350/650 ms and reverses from the exact current value', () => {
    const p = new Projection(); p.to(true, 100);
    expect(p.sample(775)).toBeCloseTo(0.5);
    p.to(false, 775);
    expect(p.sample(775)).toBeCloseTo(0.5);
    expect(p.sample(937.5)).toBeCloseTo(0.25);
    p.to(true, 937.5);
    expect(p.sample(937.5)).toBeCloseTo(0.25);
    expect(p.sample(1950)).toBe(1);
    p.to(false, 1950);
    expect(p.sample(2600)).toBe(0);
  });
  it('handles rapid reversal and duplicate commands with no jump or overshoot', () => {
    const p = new Projection();
    for (let t = 0; t < 3000; t += 17) {
      const value = p.sample(t);
      p.to(t % 3 === 0, t);
      expect(p.sample(t)).toBe(value);
      expect(p.sample(t + 16)).toBeGreaterThanOrEqual(0);
      expect(p.sample(t + 16)).toBeLessThanOrEqual(1);
    }
  });
  it('adopts reduced motion mid-transition continuously and completes within 180 ms', () => {
    const p = new Projection(); p.to(true, 0);
    const before = p.sample(500); p.setReducedMotion(true, 500);
    expect(p.sample(500)).toBe(before);
    expect(p.sample(680)).toBe(1);
    p.to(false, 680); expect(p.sample(860)).toBe(0);
    expect(() => p.seek(NaN)).toThrow();
  });
});

describe('MPFB speech boundary', () => {
  it('cancellation clears morphs and late cues cannot revive old speech', () => {
    const engine = new AvatarEngine();
    engine.dispatch({ type: 'reducedMotionChanged', enabled: true });
    engine.dispatch({ type: 'speechStarted', speechId: 'one', startedAt: 0 });
    const cue = { viseme: 'aa' as const, timestamp: 0, duration: 1000, weight: 1 };
    engine.dispatch({ type: 'viseme', speechId: 'one', cue });
    expect(engine.sample(100).face.viseme_aa).toBe(1);
    engine.dispatch({ type: 'speechCancelled', speechId: 'one' });
    engine.dispatch({ type: 'viseme', speechId: 'one', cue });
    expect(engine.sample(110).face.viseme_aa).toBe(0);
    expect(engine.getSnapshot().state).toBe('interrupted');
  });
  it('maps real MPFB visemes without doubling the authored jaw', () => {
    const mesh = new Mesh(new BufferGeometry(), new MeshBasicMaterial());
    mesh.morphTargetDictionary = { jawOpen: 0, viseme_aa: 1, viseme_E: 2, viseme_I: 3,
      viseme_O: 4, viseme_U: 5, viseme_FF: 6, viseme_PP: 7, eyeBlinkLeft: 8,
      eyeBlinkRight: 9, mouthSmileLeft: 10, mouthSmileRight: 11 };
    mesh.morphTargetInfluences = new Array(12).fill(0);
    const frame = new AvatarEngine().sample(0).face;
    applyFace(mesh, { ...frame, jawOpen: 0.8, viseme_aa: 1 });
    expect(mesh.morphTargetInfluences[0]).toBe(0);
    expect(mesh.morphTargetInfluences[1]).toBe(1);
    applyFace(mesh, frame);
    expect(mesh.morphTargetInfluences.every(v => v === 0)).toBe(true);
  });
});
