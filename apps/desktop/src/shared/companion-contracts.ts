import { z } from 'zod';

export const COMPANION_CHANNEL = 'neydra:companion:v1:invoke';
export const companionCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('reduce') }),
  z.strictObject({ type: z.literal('ready') }),
  z.strictObject({ type: z.literal('restore') }),
  z.strictObject({ type: z.literal('dragStart') }),
  z.strictObject({ type: z.literal('dragMove') }),
  z.strictObject({ type: z.literal('dragEnd') }),
  z.strictObject({ type: z.literal('dragCancel') }),
  z.strictObject({ type: z.literal('menu') }),
]);
export const companionResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true) }),
  z.strictObject({ ok: z.literal(false), code: z.enum(['invalid-request', 'untrusted-sender', 'unavailable', 'busy']) }),
]);
export type CompanionResult = z.infer<typeof companionResultSchema>;
export interface CompanionLauncher { reduceToMini(): Promise<CompanionResult> }
export interface CompanionBridge {
  ready(): Promise<CompanionResult>;
  restore(): Promise<CompanionResult>;
  beginDrag(): Promise<CompanionResult>;
  moveDrag(): Promise<CompanionResult>;
  endDrag(): Promise<CompanionResult>;
  cancelDrag(): Promise<CompanionResult>;
  openMenu(): Promise<CompanionResult>;
}
