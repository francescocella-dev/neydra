import { z } from 'zod';
import { reductionModeSchema, type ReductionPreferenceBridge, type ReductionMode } from './reduction-contracts';

export const COMPANION_MENU_EVENT = 'neydra:companion:v2:menu';
export const companionMenuSchema = z.strictObject({ open: z.boolean() });
export const menuInputSchema = z.strictObject({ keyboard: z.boolean() });
export const menuDirectionSchema = z.enum(['next', 'previous', 'first', 'last']);

export const COMPANION_CHANNEL = 'neydra:companion:v1:invoke';
export const companionCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('reduce') }),
  z.strictObject({ type: z.literal('ready') }),
  z.strictObject({ type: z.literal('mode') }),
  z.strictObject({ type: z.literal('restore') }),
  z.strictObject({ type: z.literal('menu'), input: menuInputSchema }),
  z.strictObject({ type: z.literal('dismissMenu') }),
  z.strictObject({ type: z.literal('navigateMenu'), direction: menuDirectionSchema }),
]);
export const companionResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true) }),
  z.strictObject({ ok: z.literal(false), code: z.enum(['invalid-request', 'untrusted-sender', 'unavailable', 'busy']) }),
]);
export type CompanionResult = z.infer<typeof companionResultSchema>;
export interface CompanionLauncher extends ReductionPreferenceBridge { reduceToMini(): Promise<CompanionResult> }
export const companionModeResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), mode: reductionModeSchema }),
  z.strictObject({ ok: z.literal(false), code: z.literal('unavailable') }),
]);
export interface CompanionBridge {
  getMode(): Promise<{ ok: true; mode: ReductionMode } | { ok: false; code: 'unavailable' }>;
  ready(): Promise<CompanionResult>;
  restore(): Promise<CompanionResult>;
  openMenu(input?: z.infer<typeof menuInputSchema>): Promise<CompanionResult>;
  closeMenu(): Promise<CompanionResult>;
  navigateMenu(direction: z.infer<typeof menuDirectionSchema>): Promise<CompanionResult>;
  onMenuState(listener: (state: z.infer<typeof companionMenuSchema>) => void): () => void;
}
