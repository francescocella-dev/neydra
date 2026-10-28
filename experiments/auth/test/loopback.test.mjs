import test from 'node:test';
import assert from 'node:assert/strict';
import { listen } from '../loopback.mjs';

// Local socket tests are opt-in: cloud execution may prohibit bind(127.0.0.1).
// Synthetic callback transport only; no browser, OpenAI or consent simulation.
const options = { skip: process.env.NEYDRA_TEST_LOOPBACK !== '1' };
test('loopback rejects foreign origins and accepts one state-bound callback', options, async () => {
  const listener = await listen('fixture-host', null, 1000);
  try {
    const url = new URL(listener.tx.redirectUri);
    url.search = new URLSearchParams({ state: listener.tx.state, code: 'fixture', client_id: 'fixture-client' });
    const foreign = await fetch(url, { headers: { origin: 'https://evil.invalid' } });
    assert.equal(foreign.status, 400);
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal((await listener.result).callback.clientId, 'fixture-client');
  } finally { listener.close(); }
});

test('loopback timeout closes the attempt without a code', options, async () => {
  const listener = await listen('fixture-host', null, 20);
  assert.equal((await listener.result).error.code, 'consent_timeout');
});
