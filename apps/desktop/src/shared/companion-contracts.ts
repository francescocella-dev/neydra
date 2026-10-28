import { z } from 'zod';

export const COMPANION_MENU_EVENT = 'neydra:companion:v2:menu';
export const companionMenuSchema = z.strictObject({ open: z.boolean() });
export const menuInputSchema = z.strictObject({ keyboard: z.boolean() });
export const menuDirectionSchema = z.enum(['next', 'previous', 'first', 'last']);

export const COMPANION_CHANNEL = 'neydra:companion:v1:invoke';
export const companionCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('reduce') }),
  z.strictObject({ type: z.literal('ready') }),
  z.strictObject({ type: z.literal('restore') }),
  z.strictObject({ type: z.literal('dragStart') }),
  z.strictObject({ type: z.literal('dragMove') }),
  z.strictObject({ type: z.literal('dragEnd') }),
  z.strictObject({ type: z.literal('dragCancel') }),
  z.strictObject({ type: z.literal('menu'), input: menuInputSchema }),
  z.strictObject({ type: z.literal('dismissMenu') }),
  z.strictObject({ type: z.literal('navigateMenu'), direction: menuDirectionSchema }),
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
  openMenu(input?: z.infer<typeof menuInputSchema>): Promise<CompanionResult>;
  closeMenu(): Promise<CompanionResult>;
  navigateMenu(direction: z.infer<typeof menuDirectionSchema>): Promise<CompanionResult>;
  onMenuState(listener: (state: z.infer<typeof companionMenuSchema>) => void): () => void;
}
