import { z } from 'zod';

export const PROTOCOL_VERSION = 2 as const;
export const CHANNELS = { invoke: 'neydra:v2:invoke', event: 'neydra:v2:event' } as const;
export const requestIdSchema = z.uuid();
export const avatarIdSchema = z.enum(['holo', 'mini']);
export const avatarStateSchema = z.enum(['idle', 'listening', 'processing', 'speaking', 'interrupted', 'error']);
export const startSchema = z.strictObject({
  requestId: requestIdSchema,
  prompt: z.string().trim().min(1).max(2000),
});
export const modelSchema = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/);
export const realSchema = startSchema.extend({ model: modelSchema, consent: z.literal('included-plan-checked') });
export const connectSchema = z.strictObject({ consent: z.literal('system-browser') });
// Fixed diagnostic vocabulary only: never forward raw OAuth errors or secrets to the renderer.
export const connectDiagnosticSchema = z.strictObject({
  phase: z.enum(['registration-load', 'listener', 'browser', 'callback',
    'client-save', 'token-exchange', 'account-save', 'model-catalog']),
  code: z.enum(['invalid_grant', 'invalid_client', 'identity_verification_failed',
    'plan_permission_missing', 'account_changed', 'invalid_token_response',
    'invalid_issued_client', 'invalid_state', 'consent_denied', 'consent_timeout',
    'cancelled', 'transport_or_timeout', 'http_rejected', 'unexpected_model_catalog',
    'missing_json_body', 'oversized_json', 'invalid_host_identifier',
    'loopback_unavailable', 'no_authorized_models', 'local_error']),
  httpStatus: z.number().int().min(100).max(599).optional(),
});
export const connectionSchema = z.strictObject({
  state: z.enum(['disconnected', 'connecting', 'connected']),
  models: z.array(z.strictObject({ slug: modelSchema, name: z.string().min(1).max(128) })).max(512),
  diagnostic: connectDiagnosticSchema.optional(),
});
export type ConnectDiagnostic = z.infer<typeof connectDiagnosticSchema>;
export type Connection = z.infer<typeof connectionSchema>;
export type RealRequest = z.infer<typeof realSchema>;
export const cancelSchema = z.strictObject({ requestId: requestIdSchema });
export const commandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('status') }),
  z.strictObject({ type: z.literal('connection') }),
  z.strictObject({ type: z.literal('connectChatGPT'), input: connectSchema }),
  z.strictObject({ type: z.literal('disconnectChatGPT') }),
  z.strictObject({ type: z.literal('cancelConnect') }),
  z.strictObject({ type: z.literal('resetChat') }),
  z.strictObject({ type: z.literal('startChatGPT'), input: realSchema }),
  z.strictObject({ type: z.literal('startOfflineDemo'), input: startSchema }),
  z.strictObject({ type: z.literal('cancel'), input: cancelSchema }),
]);
export const statusSchema = z.strictObject({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  mode: z.literal('offline'),
  auth: z.literal('available-in-main'),
  provider: z.literal('offline-demo'),
  avatar: z.literal('not-integrated'),
  voice: z.literal('not-integrated'),
});
export const errorCodeSchema = z.enum(['invalid-request', 'untrusted-sender', 'busy', 'not-active', 'unavailable', 'internal', 'auth-required', 'quota', 'replayed']);
export const resultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true) }),
  z.strictObject({ ok: z.literal(false), code: errorCodeSchema }),
]);
export const responseSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), status: statusSchema.optional(), connection: connectionSchema.optional() }),
  z.strictObject({ ok: z.literal(false), code: errorCodeSchema }),
]);
export const streamEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('responseStarted'), requestId: requestIdSchema, source: z.enum(['offline-demo', 'chatgpt-plan']) }),
  z.strictObject({ type: z.literal('textDelta'), requestId: requestIdSchema, text: z.string().min(1).max(4096) }),
  z.strictObject({ type: z.literal('responseCompleted'), requestId: requestIdSchema, missingMimeStreamValidated: z.boolean().optional() }),
  z.strictObject({ type: z.literal('responseCancelled'), requestId: requestIdSchema }),
  z.strictObject({ type: z.literal('responseFailed'), requestId: requestIdSchema, code: z.enum(['unavailable', 'auth-required', 'quota']) }),
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
  getConnection(): Promise<Connection>;
  connectChatGPT(input: z.infer<typeof connectSchema>): Promise<Result>;
  disconnectChatGPT(): Promise<Result>;
  cancelConnect(): Promise<Result>;
  resetChat(): Promise<Result>;
  startChatGPT(input: RealRequest): Promise<Result>;
  startOfflineDemo(input: StartRequest): Promise<Result>;
  cancel(input: z.infer<typeof cancelSchema>): Promise<Result>;
  onEvent(listener: (event: StreamEvent) => void): () => void;
}
