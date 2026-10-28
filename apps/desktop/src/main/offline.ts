import { setTimeout as delay } from 'node:timers/promises';
import type { ProviderPort } from './ports';

export const offlineProvider: ProviderPort = {
  mode: 'offline-demo',
  async *stream(_input, signal) {
    for (const text of ['Demo offline. ', 'Questo testo è predefinito: ', 'nessuna autenticazione, inferenza o voce è collegata.']) {
      await delay(350, undefined, { signal });
      yield { type: 'delta', text };
    }
    yield { type: 'completed' };
  },
};
