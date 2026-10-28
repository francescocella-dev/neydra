/** Renderer-independent boundary for future voice/Electron adapters. Times are ms. */
export const AVATAR_STATES = [
  "idle",
  "listening",
  "processing",
  "speaking",
  "interrupted",
  "error",
] as const;
export type AvatarState = (typeof AVATAR_STATES)[number];
export type AvatarId = "holo" | "mini";
export const VISEMES = [
  "sil",
  "aa",
  "ee",
  "ih",
  "oh",
  "ou",
  "ff",
  "mm",
] as const;
export type Viseme = (typeof VISEMES)[number];
export type Expression = "neutral" | "warm" | "focused" | "concerned";
export interface VisemeCue {
  viseme: Viseme;
  timestamp: number;
  duration: number;
  weight: number;
}
export type AvatarEvent =
  | { type: "stateChanged"; state: AvatarState }
  | { type: "speechStarted"; speechId: string; startedAt: number }
  | { type: "speechEnded" | "speechCancelled"; speechId: string }
  | { type: "viseme"; speechId: string; cue: VisemeCue }
  | { type: "reducedMotionChanged"; enabled: boolean }
  | { type: "expressionChanged"; expression: Expression; weight: number }
  | { type: "headPoseChanged"; yaw: number; pitch: number };
export interface EngineSnapshot {
  state: AvatarState;
  speech: { id: string; startedAt: number; cues: readonly VisemeCue[] } | null;
  reducedMotion: boolean;
  expression: Expression;
  expressionWeight: number;
  head: { yaw: number; pitch: number };
  revision: number;
}
export interface FacialFrame {
  eyeBlinkLeft: number;
  eyeBlinkRight: number;
  browInnerUp: number;
  mouthSmile: number;
  jawOpen: number;
  viseme_aa: number;
  viseme_ee: number;
  viseme_ih: number;
  viseme_oh: number;
  viseme_ou: number;
  viseme_ff: number;
  viseme_mm: number;
}
export interface RigFrame {
  face: FacialFrame;
  yaw: number;
  pitch: number;
  roll: number;
}
