import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';

// Structural smoke of the actual CJS artifact, not an Electron sandbox/GUI test.
let exposed;
const status = { protocolVersion: 2, mode: 'offline', auth: 'available-in-main', provider: 'offline-demo', avatar: 'not-integrated', voice: 'not-integrated' };
const source = await readFile('dist/preload/index.cjs', 'utf8');
runInNewContext(source, {
  require(name) {
    assert.equal(name, 'electron', 'Preload must not import Node or external modules');
    return {
      contextBridge: { exposeInMainWorld(name, bridge) { assert.equal(name, 'neydra'); exposed = bridge; } },
      ipcRenderer: { async invoke() { return { ok: true, status }; }, on() {}, removeListener() {} },
    };
  },
});
assert.deepEqual(Object.keys(exposed).sort(), ['cancel', 'cancelConnect', 'connectChatGPT', 'disconnectChatGPT', 'getConnection', 'getStatus', 'getWindowState', 'onEvent', 'onWindowState', 'reduceToMini', 'resetChat', 'setFullscreen', 'startChatGPT', 'startOfflineDemo']);
assert.equal((await exposed.getStatus()).mode, 'offline');
assert.equal((await exposed.startOfflineDemo({ requestId: 'invalid', prompt: 'test' })).ok, false);
console.log('Bundled preload structure: PASS (VM with mocked Electron; not a runtime sandbox test)');

let companion;
const companionCalls = [];
runInNewContext(await readFile('dist/preload/companion.cjs', 'utf8'), {
  require(name) {
    assert.equal(name, 'electron', 'Companion preload must not import Node or external modules');
    return {
      contextBridge: { exposeInMainWorld(name, bridge) { assert.equal(name, 'neydraCompanion'); companion = bridge; } },
      ipcRenderer: { async invoke(channel, payload) { companionCalls.push({ channel, payload }); return { ok: true }; } },
    };
  },
});
assert.deepEqual(Object.keys(companion).sort(), ['beginDrag', 'cancelDrag', 'closeMenu', 'endDrag', 'moveDrag', 'navigateMenu', 'onMenuState', 'openMenu', 'ready', 'restore']);
assert.equal(Object.isFrozen(companion), true);
await companion.restore();
assert.equal(JSON.stringify(companionCalls), JSON.stringify([{ channel: 'neydra:companion:v1:invoke', payload: { type: 'restore' } }]));
console.log('Bundled companion preload: PASS (minimal bridge; no account or chat API)');

let orbit;
const orbitCalls = [];
runInNewContext(await readFile('dist/preload/orbit.cjs', 'utf8'), {
  require(name) {
    assert.equal(name, 'electron', 'Orbit preload must import only Electron');
    return {
      contextBridge: { exposeInMainWorld(name, bridge) { assert.equal(name, 'neydraOrbit'); orbit = bridge; } },
      ipcRenderer: { async invoke(channel, payload) { orbitCalls.push({ channel, payload }); return payload.type === 'role' ? { ok: true, role: 'open' } : { ok: true }; }, on() {}, removeListener() {} },
    };
  },
});
assert.deepEqual(Object.keys(orbit).sort(), ['activate', 'dismiss', 'getRole', 'navigate', 'onVisibility', 'ready']);
assert.equal(Object.isFrozen(orbit), true);
assert.equal((await orbit.getRole()).role, 'open');
assert.equal(JSON.stringify(orbitCalls), JSON.stringify([{ channel: 'neydra:orbit:v1:invoke', payload: { type: 'role' } }]));
console.log('Bundled orbit preload: PASS (role only; no chat/account bridge)');
