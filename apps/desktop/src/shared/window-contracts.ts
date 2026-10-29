import { z } from 'zod';

export const WINDOW_CHANNELS = { invoke: 'neydra:window:v1:invoke', event: 'neydra:window:v1:state' } as const;
export const fullscreenInputSchema = z.strictObject({ enabled: z.boolean() });
export const windowStateSchema = z.strictObject({ fullscreen: z.boolean() });
export const windowCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('getState') }),
  z.strictObject({ type: z.literal('setFullscreen'), input: fullscreenInputSchema }),
]);
export const windowResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), state: windowStateSchema }),
  z.strictObject({ ok: z.literal(false), code: z.enum(['invalid-request', 'untrusted-sender', 'unavailable']) }),
]);
export type WindowState = z.infer<typeof windowStateSchema>;
export type WindowResult = z.infer<typeof windowResultSchema>;
export interface WindowBridge {
  getWindowState(): Promise<WindowResult>;
  setFullscreen(input: z.infer<typeof fullscreenInputSchema>): Promise<WindowResult>;
  onWindowState(listener: (state: WindowState) => void): () => void;
}
