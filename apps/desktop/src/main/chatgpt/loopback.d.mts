import type { Transaction, Callback } from './protocol.mjs';
export type Listener = { tx: Transaction; result: Promise<{ callback: Callback; error?: never } | { error: Error; callback?: never }>; close(): void };
export function listen(hostId: string, clientId: string | null, timeoutMs?: number): Promise<Listener>;
