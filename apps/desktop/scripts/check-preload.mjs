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
assert.deepEqual(Object.keys(exposed).sort(), ['cancel', 'cancelConnect', 'connectChatGPT', 'disconnectChatGPT', 'getConnection', 'getStatus', 'onEvent', 'resetChat', 'startChatGPT', 'startOfflineDemo']);
assert.equal((await exposed.getStatus()).mode, 'offline');
assert.equal((await exposed.startOfflineDemo({ requestId: 'invalid', prompt: 'test' })).ok, false);
console.log('Bundled preload structure: PASS (VM with mocked Electron; not a runtime sandbox test)');
