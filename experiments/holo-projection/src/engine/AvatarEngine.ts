import type {
  AvatarEvent,
  EngineSnapshot,
  FacialFrame,
  RigFrame,
} from "./protocol";
const clamp = (n: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, Number.isFinite(n) ? n : 0));
export class AvatarEngine {
  private snapshot: EngineSnapshot = {
    state: "idle",
    speech: null,
    reducedMotion: false,
    expression: "neutral",
    expressionWeight: 0.7,
    head: { yaw: 0, pitch: 0 },
    revision: 0,
  };
  private listeners = new Set<() => void>();
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  dispatch = (event: AvatarEvent) => {
    const s = this.snapshot;
    let next: EngineSnapshot = s;
    switch (event.type) {
      case "stateChanged":
        next = { ...s, state: event.state, speech: null };
        break;
      case "speechStarted":
        if (!event.speechId || !Number.isFinite(event.startedAt)) return;
        next = {
          ...s,
          state: "speaking",
          speech: { id: event.speechId, startedAt: event.startedAt, cues: [] },
        };
        break;
      case "speechEnded":
      case "speechCancelled":
        if (s.speech?.id !== event.speechId) return;
        next = {
          ...s,
          speech: null,
          state: event.type === "speechEnded" ? "idle" : "interrupted",
        };
        break;
      case "viseme": {
        const cue = event.cue;
        if (
          s.speech?.id !== event.speechId ||
          !Number.isFinite(cue.timestamp) ||
          cue.timestamp < 0 ||
          !Number.isFinite(cue.duration) ||
          cue.duration <= 0 ||
          !Number.isFinite(cue.weight)
        )
          return;
        // Bounded queue; adapters may send timings in any order. No renderer timers.
        next = {
          ...s,
          speech: {
            ...s.speech,
            cues: [...s.speech.cues, { ...cue, weight: clamp(cue.weight) }]
              .sort((a, b) => a.timestamp - b.timestamp)
              .slice(-512),
          },
        };
        break;
      }
      case "reducedMotionChanged":
        next = { ...s, reducedMotion: event.enabled };
        break;
      case "expressionChanged":
        next = {
          ...s,
          expression: event.expression,
          expressionWeight: clamp(event.weight),
        };
        break;
      case "headPoseChanged":
        next = {
          ...s,
          head: {
            yaw: clamp(event.yaw, -0.6, 0.6),
            pitch: clamp(event.pitch, -0.35, 0.35),
          },
        };
        break;
    }
    this.snapshot = { ...next, revision: s.revision + 1 };
    this.listeners.forEach((listener) => listener());
  };
  sample(now: number): RigFrame {
    const s = this.snapshot;
    const t = now / 1000;
    const w = s.expressionWeight;
    const blinkPhase = t % 4.6;
    const blink = s.reducedMotion
      ? 0
      : Math.max(0, 1 - Math.abs(blinkPhase - 4.35) / 0.12);
    const face: FacialFrame = {
      eyeBlinkLeft: blink,
      eyeBlinkRight: blink,
      browInnerUp:
        s.expression === "concerned"
          ? w * 0.8
          : s.state === "listening"
            ? 0.35
            : 0,
      mouthSmile: s.expression === "warm" ? w : 0,
      jawOpen: 0,
      viseme_aa: 0,
      viseme_ee: 0,
      viseme_ih: 0,
      viseme_oh: 0,
      viseme_ou: 0,
      viseme_ff: 0,
      viseme_mm: 0,
    };
    if (s.expression === "focused")
      face.eyeBlinkLeft = face.eyeBlinkRight = Math.max(blink, w * 0.3);
    if (s.speech && s.state === "speaking") {
      const elapsed = now - s.speech.startedAt;
      for (const cue of s.speech.cues) {
        const age = elapsed - cue.timestamp;
        if (age < 0 || age > cue.duration || cue.viseme === "sil") continue;
        const envelope = Math.min(1, age / 35, (cue.duration - age) / 65);
        const value = clamp(envelope * cue.weight);
        const key = `viseme_${cue.viseme}` as keyof FacialFrame;
        face[key] = Math.max(face[key], value);
      }
      // Normalize overlaps: imported facial morphs remain within a convex blend.
      const keys = [
        "viseme_aa",
        "viseme_ee",
        "viseme_ih",
        "viseme_oh",
        "viseme_ou",
        "viseme_ff",
        "viseme_mm",
      ] as const;
      const total = keys.reduce((sum, key) => sum + face[key], 0);
      if (total > 1)
        keys.forEach((key) => {
          face[key] /= total;
        });
      face.jawOpen =
        face.viseme_aa * 0.8 + face.viseme_oh * 0.5 + face.viseme_ih * 0.25;
    }
    const motion = s.reducedMotion ? 0 : 1;
    return {
      face,
      yaw: s.head.yaw + motion * Math.sin(t * 0.55) * 0.065,
      pitch:
        s.head.pitch +
        motion *
          (Math.sin(t * 0.8) * 0.025 + (s.state === "listening" ? -0.06 : 0)),
      roll:
        motion *
        (s.state === "error"
          ? -0.12
          : s.state === "listening"
            ? 0.08
            : Math.sin(t * 0.4) * 0.025),
    };
  }
}
