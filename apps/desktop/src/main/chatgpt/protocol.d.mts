import type { JsonWebKey } from 'node:crypto';
export type Transaction = { redirectUri: string; hostId: string; clientId: string | null; state: string; nonce: string; verifier: string; expiresAt: number; consumed: boolean };
export type Callback = { clientId: string; code: string };
export type Session = { accessToken: string; identity: { issuer: string; subject: string }; expiresAt: number };
export type Message = { role: 'user' | 'assistant'; content: string };
export class Stop extends Error { code: string; httpStatus: number | null; constructor(code: string, status?: number | null); }
export const ISSUER: string;
export const RESOURCE: string;
export const TOKEN: string;
export const JWKS: string;
export function transaction(redirect: string, host: string, client?: string | null): Transaction;
export function authorizationUrl(tx: Transaction): string;
export function consumeCallback(tx: Transaction, url: URL): Callback;
export function verifyIdentity(jwt: string, keys: JsonWebKey[], client: string, nonce: string, now?: number): Session['identity'];
export function request(url: string, options?: RequestInit, fetchImpl?: typeof fetch): Promise<Response>;
export function exchange(tx: Transaction, callback: Callback, subject?: string | null, fetchImpl?: typeof fetch, signal?: AbortSignal): Promise<Session>;
export function models(token: string, fetchImpl?: typeof fetch, signal?: AbortSignal): Promise<{ slug: string; name: string }[]>;
export function textStream(token: string, input: { model: string; messages: Message[] }, signal: AbortSignal, fetchImpl?: typeof fetch): AsyncIterable<{ type: 'delta'; text: string } | { type: 'completed'; missingMimeStreamValidated: boolean }>;
