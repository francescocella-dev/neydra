import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline';
import { APP_NAME, RESOURCE, Stop } from './auth.mjs';

export function providerArgs() {
  return ['app-server', '--listen', 'stdio://', ...[
    'model_provider="openai_chatgpt_plan"',
    'model_providers.openai_chatgpt_plan.name="ChatGPT plan"',
    `model_providers.openai_chatgpt_plan.base_url="${RESOURCE}"`,
    'model_providers.openai_chatgpt_plan.env_key="ACCESS_TOKEN"',
    'model_providers.openai_chatgpt_plan.wire_api="responses"',
    'model_providers.openai_chatgpt_plan.requires_openai_auth=false',
    'model_providers.openai_chatgpt_plan.supports_websockets=false',
    'analytics.enabled=false',
  ].flatMap(value => ['-c', value])];
}

export function initializeMessage() {
  return { id: 1, method: 'initialize', params: {
    clientInfo: { name: APP_NAME, title: 'NEYDRA', version: '0.1.0' },
  } };
}

// This probe deliberately has no token argument and sends no inference request.
export async function probe(executable = 'codex', timeoutMs = 15_000) {
  const directory = await mkdtemp(join(tmpdir(), 'neydra-codex-handshake-'));
  let child;
  let lines;
  let timer;
  try {
    const env = {};
    for (const name of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'HOME', 'USERPROFILE',
      'TEMP', 'TMP', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'SSL_CERT_FILE', 'NODE_EXTRA_CA_CERTS']) {
      if (process.env[name]) env[name] = process.env[name];
    }
    env.CODEX_HOME = directory;
    child = spawn(executable, providerArgs(), {
      cwd: directory, env, shell: false, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    });
    // Never relay child diagnostics, which may contain local paths or credentials.
    child.stderr.resume();
    lines = createInterface({ input: child.stdout });
    await new Promise((resolveProbe, reject) => {
      timer = setTimeout(() => reject(new Stop('codex_handshake_timeout')), timeoutMs);
      child.once('error', () => reject(new Stop('codex_launch_failed')));
      child.stdin.on('error', () => reject(new Stop('codex_pipe_closed')));
      child.once('exit', () => reject(new Stop('codex_exited_before_handshake')));
      lines.on('line', line => {
        try {
          if (line.length > 1_000_000) throw new Stop('codex_protocol_error');
          const message = JSON.parse(line);
          if (message.method && message.id !== undefined) throw new Stop('unexpected_server_request');
          if (message.id !== 1) return;
          if (message.error || !message.result) throw new Stop('codex_initialize_rejected');
          child.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`, error => {
            if (error) reject(new Stop('codex_pipe_closed')); else resolveProbe();
          });
        } catch (error) { reject(error instanceof Stop ? error : new Stop('codex_protocol_error')); }
      });
      child.stdin.write(`${JSON.stringify(initializeMessage())}\n`);
    });
    return { status: 'UNVERIFIED', handshakeVerified: true, inferenceAttempted: false,
      authenticationAttempted: false, codexTurnVerified: false };
  } finally {
    clearTimeout(timer);
    lines?.close();
    if (child?.pid && child.exitCode === null) {
      const closed = new Promise(done => child.once('close', done));
      child.stdin.end();
      child.kill();
      const force = setTimeout(() => child.kill('SIGKILL'), 2000);
      await closed;
      clearTimeout(force);
    }
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  probe(process.argv[2] ?? 'codex').then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => {
      console.error(JSON.stringify({ status: 'BLOCKED',
        reason: error instanceof Stop ? error.code : 'codex_local_error' }));
      process.exitCode = 1;
    });
}
