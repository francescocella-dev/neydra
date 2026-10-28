import type { StartRequest } from '../shared/contracts';

// Main-only: a real implementation owns tokens privately and exposes no session DTO.
export interface AuthPort {
  readonly mode: 'offline' | 'official';
  getState(): 'not-integrated' | 'disconnected' | 'connected';
  connect(signal: AbortSignal): Promise<void>;
  disconnect(): Promise<void>;
}

// Sanitized provider output; terminal completion requires the provider's real terminal event.
export type ProviderChunk = { type: 'delta'; text: string } | { type: 'completed'; missingMimeStreamValidated?: boolean };
export interface ProviderPort {
  readonly mode: 'offline-demo' | 'official';
  stream(input: StartRequest, signal: AbortSignal): AsyncIterable<ProviderChunk>;
}
