import { z } from 'zod';
import { companionResultSchema } from './companion-contracts';

export const ORBIT_CHANNEL = 'neydra:orbit:v1:invoke';
export const ORBIT_EVENT = 'neydra:orbit:v1:visibility';
export const directionSchema = z.enum(['next', 'previous', 'first', 'last']);
export const orbitRoleSchema = z.enum(['open', 'exit']);
export const orbitCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('role') }), z.strictObject({ type: z.literal('ready') }),
  z.strictObject({ type: z.literal('activate') }), z.strictObject({ type: z.literal('dismiss') }),
  z.strictObject({ type: z.literal('navigate'), direction: directionSchema }),
]);
export const orbitRoleResultSchema = z.union([
  z.strictObject({ ok: z.literal(true), role: orbitRoleSchema }),
  z.strictObject({ ok: z.literal(false), code: z.enum(['untrusted-sender', 'unavailable', 'invalid-request']) }),
]);
export const orbitVisibilitySchema = z.enum(['reveal', 'conceal']);
export type OrbitRole = z.infer<typeof orbitRoleSchema>;
export type OrbitDirection = z.infer<typeof directionSchema>;
export interface OrbitBridge {
  getRole(): Promise<z.infer<typeof orbitRoleResultSchema>>;
  ready(): Promise<z.infer<typeof companionResultSchema>>;
  activate(): Promise<z.infer<typeof companionResultSchema>>;
  dismiss(): Promise<z.infer<typeof companionResultSchema>>;
  navigate(direction: OrbitDirection): Promise<z.infer<typeof companionResultSchema>>;
  onVisibility(listener: (phase: z.infer<typeof orbitVisibilitySchema>) => void): () => void;
}
