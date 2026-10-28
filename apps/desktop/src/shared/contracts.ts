import { z } from 'zod';

export const PROTOCOL_VERSION = 1 as const;
export const CHANNELS = { invoke: 'neydra:v1:invoke', event: 'neydra:v1:event' } as const;
export const requestIdSchema = z.uuid();
export const avatarIdSchema = z.enum(['holo', 'mini']);
export const avatarStateSchema = z.enum(['idle', 'listening', 'processing', 'speaking', 'interrupted', 'error']);
export const startSchema = z.strictObject({
  requestId: requestIdSchema,
  prompt: z.string().trim().min(1).max(2000),
});
export const cancelSchema = z.strictObject({ requestId: requestIdSchema });
export const commandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('status') }),
  z.strictObject({ type: z.literal('startOfflineDemo'), input: startSchema }),
  z.strictObject({ type: z.literal('cancel'), input: cancelSchema }),
]);
export const statusSchema = z.strictObject({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  mode: z.literal('offline'),
  auth: z.literal('not-integrated'),
  provider: z.literal('offline-demo'),
  avatar: z.literal('not-integrated'),
  voice: z.literal('not-integrated'),
});
export const errorCodeSchema = z.enum(['invalid-request', 'untrusted-sender', 'busy', 'not-active', 'unavailable', 'internal']);
export const resultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true) }),
  z.strictObject({ ok: z.literal(false), code: errorCodeSchema }),
]);
export const responseSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), status: statusSchema.optional() }),
  z.strictObject({ ok: z.literal(false), code: errorCodeSchema }),
]);
export const streamEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('responseStarted'), requestId: requestIdSchema, source: z.literal('offline-demo') }),
  z.strictObject({ type: z.literal('textDelta'), requestId: requestIdSchema, text: z.string().min(1).max(4096) }),
  z.strictObject({ type: z.literal('responseCompleted'), requestId: requestIdSchema }),
  z.strictObject({ type: z.literal('responseCancelled'), requestId: requestIdSchema }),
  z.strictObject({ type: z.literal('responseFailed'), requestId: requestIdSchema, code: z.literal('unavailable') }),
]);
export type StartRequest = z.infer<typeof startSchema>;
export type StreamEvent = z.infer<typeof streamEventSchema>;
export type DesktopStatus = z.infer<typeof statusSchema>;
export type Result = z.infer<typeof resultSchema>;
export type AvatarId = z.infer<typeof avatarIdSchema>;
export type AvatarState = z.infer<typeof avatarStateSchema>;

// Renderer-local port for PR #7. Timings use the renderer monotonic playback clock.
export type AvatarEvent =
  | { type: 'stateChanged'; state: AvatarState }
  | { type: 'speechStarted'; speechId: string; startedAt: number }
  | { type: 'speechEnded' | 'speechCancelled'; speechId: string }
  | { type: 'viseme'; speechId: string; cue: { timestamp: number; duration: number; viseme: 'sil' | 'aa' | 'ee' | 'ih' | 'oh' | 'ou' | 'ff' | 'mm'; weight: number } }
  | { type: 'reducedMotionChanged'; enabled: boolean }
  | { type: 'expressionChanged'; expression: 'neutral' | 'warm' | 'focused' | 'concerned'; weight: number }
  | { type: 'headPoseChanged'; yaw: number; pitch: number };
export interface AvatarPort {
  readonly mode: 'not-integrated' | 'connected';
  select(avatar: AvatarId): void;
  dispatch(event: AvatarEvent): void;
  dispose(): void;
}

// Future local voice adapter: no device/path/command selected by the renderer.
export type VoiceEvent =
  | { type: 'transcript'; text: string; final: boolean }
  | { type: 'playbackStarted'; speechId: string; startedAt: number }
  | { type: 'playbackEnded' | 'playbackCancelled'; speechId: string }
  | { type: 'unavailable' };
export interface VoicePort {
  readonly mode: 'not-integrated' | 'local';
  listen(signal: AbortSignal): AsyncIterable<VoiceEvent>;
  speak(text: string, speechId: string, signal: AbortSignal): AsyncIterable<VoiceEvent>;
  stop(): void;
}

export interface DesktopBridge {
  getStatus(): Promise<DesktopStatus>;
  startOfflineDemo(input: StartRequest): Promise<Result>;
  cancel(input: z.infer<typeof cancelSchema>): Promise<Result>;
  onEvent(listener: (event: StreamEvent) => void): () => void;
}
