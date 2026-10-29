import { z } from 'zod';

export const reductionModeSchema = z.enum(['circle', 'island']);
export type ReductionMode = z.infer<typeof reductionModeSchema>;
export const REDUCTION_CHANNEL = 'neydra:reduction:v1:invoke';
export const reductionCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('get') }),
  z.strictObject({ type: z.literal('set'), mode: reductionModeSchema }),
]);
export const reductionPreferenceSchema = z.strictObject({ mode: reductionModeSchema,
  status: z.enum(['default', 'saved', 'read-failed', 'save-failed']) });
export const reductionResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), preference: reductionPreferenceSchema }),
  z.strictObject({ ok: z.literal(false), code: z.enum(['invalid-request', 'untrusted-sender', 'unavailable']) }),
]);
export type ReductionPreference = z.infer<typeof reductionPreferenceSchema>;
export type ReductionResult = z.infer<typeof reductionResultSchema>;
export interface ReductionPreferenceBridge {
  getReductionPreference(): Promise<ReductionResult>;
  setReductionMode(input: { mode: ReductionMode }): Promise<ReductionResult>;
}
export const reductionInputSchema = z.strictObject({ mode: reductionModeSchema });
