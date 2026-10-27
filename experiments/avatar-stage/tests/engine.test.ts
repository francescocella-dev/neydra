import { describe, expect, it } from "vitest";
import { AvatarEngine } from "../src/engine/AvatarEngine";
import { AVATAR_STATES } from "../src/engine/protocol";
import { DEMO_CUES, DEMO_DURATION } from "../src/engine/demo";
function start(engine: AvatarEngine, id = "a", at = 1000) {
  engine.dispatch({ type: "speechStarted", speechId: id, startedAt: at });
  engine.dispatch({
    type: "viseme",
    speechId: id,
    cue: { viseme: "aa", timestamp: 100, duration: 300, weight: 1 },
  });
}
describe("shared interruptible avatar protocol", () => {
  it("permits every directed state transition including rapid reversals", () => {
    const e = new AvatarEngine();
    for (let round = 0; round < 20; round++)
      for (const from of AVATAR_STATES)
        for (const to of AVATAR_STATES) {
          e.dispatch({ type: "stateChanged", state: from });
          e.dispatch({ type: "stateChanged", state: to });
          expect(e.getSnapshot().state).toBe(to);
          expect(e.sample(1500).face.jawOpen).toBe(0);
        }
  });
  it("evaluates cue timestamps against the speech clock, not wall time or volume", () => {
    const e = new AvatarEngine();
    start(e);
    expect(e.sample(1099).face.viseme_aa).toBe(0);
    expect(e.sample(1200).face.viseme_aa).toBe(1);
    expect(e.sample(1200).face.jawOpen).toBeGreaterThan(0);
    expect(e.sample(1401).face.jawOpen).toBe(0);
  });
  it("cancels immediately and rejects late events from the previous utterance", () => {
    const e = new AvatarEngine();
    start(e);
    e.dispatch({ type: "speechCancelled", speechId: "a" });
    expect(e.sample(1200).face.jawOpen).toBe(0);
    expect(e.getSnapshot().state).toBe("interrupted");
    start(e, "b", 2000);
    const snapshot = e.getSnapshot();
    e.dispatch({ type: "speechEnded", speechId: "a" });
    e.dispatch({ type: "viseme", speechId: "a", cue: DEMO_CUES[0] });
    expect(e.getSnapshot()).toBe(snapshot);
    expect(e.sample(2200).face.jawOpen).toBeGreaterThan(0);
  });
  it("drops speech on manual state changes and cannot resurrect its queue", () => {
    const e = new AvatarEngine();
    start(e);
    e.dispatch({ type: "stateChanged", state: "error" });
    e.dispatch({ type: "speechEnded", speechId: "a" });
    expect(e.getSnapshot().state).toBe("error");
    e.dispatch({ type: "stateChanged", state: "speaking" });
    expect(e.sample(1200).face.jawOpen).toBe(0);
  });
  it("supports out-of-order timings, bounded weights and overlapping visemes", () => {
    const e = new AvatarEngine();
    start(e);
    e.dispatch({
      type: "viseme",
      speechId: "a",
      cue: { viseme: "oh", timestamp: 90, duration: 400, weight: 9 },
    });
    expect(e.getSnapshot().speech!.cues[0].viseme).toBe("oh");
    const f = e.sample(1200).face;
    expect(f.viseme_oh + f.viseme_aa).toBeCloseTo(1);
    const before = e.getSnapshot();
    e.dispatch({
      type: "viseme",
      speechId: "a",
      cue: { viseme: "aa", timestamp: NaN, duration: 30, weight: 1 },
    });
    expect(e.getSnapshot()).toBe(before);
    for (let i = 0; i < 600; i++)
      e.dispatch({
        type: "viseme",
        speechId: "a",
        cue: { viseme: "aa", timestamp: i, duration: 10, weight: 1 },
      });
    expect(e.getSnapshot().speech!.cues.length).toBe(512);
  });
  it("honors reduced motion without suppressing semantic mouth/expression controls", () => {
    const e = new AvatarEngine();
    start(e);
    e.dispatch({ type: "reducedMotionChanged", enabled: true });
    e.dispatch({ type: "headPoseChanged", yaw: 20, pitch: -20 });
    e.dispatch({ type: "expressionChanged", expression: "warm", weight: 0.8 });
    expect(e.sample(1200).yaw).toBe(0.6);
    expect(e.sample(2200).pitch).toBe(-0.35);
    expect(e.sample(1200).roll).toBe(0);
    expect(e.sample(1200).face.eyeBlinkLeft).toBe(0);
    expect(e.sample(1200).face.jawOpen).toBeGreaterThan(0);
    expect(e.sample(1200).face.mouthSmile).toBe(0.8);
  });
  it("simulates a complete Italian preview and ends with closed mouth", () => {
    const e = new AvatarEngine();
    e.dispatch({ type: "speechStarted", speechId: "it", startedAt: 0 });
    DEMO_CUES.forEach((cue) =>
      e.dispatch({ type: "viseme", speechId: "it", cue }),
    );
    const samples = Array.from(
      { length: 97 },
      (_, i) => e.sample(i * 50).face.jawOpen,
    );
    expect(samples.some((n) => n > 0.5)).toBe(true);
    expect(e.sample(DEMO_DURATION).face.jawOpen).toBe(0);
    e.dispatch({ type: "speechEnded", speechId: "it" });
    expect(e.getSnapshot().state).toBe("idle");
  });
  it("notifies subscribers only for accepted events and unsubscribes", () => {
    const e = new AvatarEngine();
    let calls = 0;
    const remove = e.subscribe(() => calls++);
    e.dispatch({ type: "stateChanged", state: "listening" });
    e.dispatch({ type: "speechEnded", speechId: "missing" });
    remove();
    e.dispatch({ type: "stateChanged", state: "idle" });
    expect(calls).toBe(1);
  });
});
