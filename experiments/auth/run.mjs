import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Stop, authorizationUrl, exchange, models, textRequest } from './auth.mjs';
import { listen } from './loopback.mjs';

// Only non-secret installation/registration metadata persists, outside the checkout.
const directory = join(homedir(), '.neydra-auth-experiment');
const statePath = join(directory, 'registration.json');
async function save(state) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify(state), { flag: 'wx', mode: 0o600 });
  await rename(temporary, statePath);
}

async function run() {
  if (process.argv.slice(2).join(' ') !== '--included-usage-only') throw new Stop('read_runbook_first');
  if (!stdin.isTTY || !stdout.isTTY) throw new Stop('interactive_local_terminal_required');
  if (['OPENAI_API_KEY', 'OPENAI_ADMIN_KEY', 'CODEX_API_KEY', 'ACCESS_TOKEN'].some(k => process.env[k]))
    throw new Stop('remove_external_credentials');
  let state;
  try { state = JSON.parse(await readFile(statePath, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw new Stop('invalid_local_registration');
    state = { hostId: `urn:uuid:${randomUUID()}` };
    await save(state);
  }
  if (!/^urn:uuid:[0-9a-f-]{36}$/.test(state.hostId)) throw new Stop('invalid_local_registration');
  const terminal = createInterface({ input: stdin, output: stdout });
  let listener;
  try {
    console.log('Verifica prima README.md: Plus idoneo, uso incluso disponibile, saldo crediti acquistati zero e ricarica disattivata.');
    console.log('Se queste condizioni non sono verificabili, interrompi. Nessun acquisto o ricarica.');
    if (await terminal.question('Hai verificato queste condizioni in ChatGPT? Digita SOLO_PIANO: ') !== 'SOLO_PIANO')
      throw new Stop('included_usage_not_confirmed');
    listener = await listen(state.hostId, state.clientId);
    console.log('Continue with ChatGPT — apri questo URL nel browser di sistema (non condividerlo):');
    console.log(authorizationUrl(listener.tx));
    const { callback, error } = await listener.result;
    if (error) throw error;
    state.clientId = callback.clientId;
    await save(state); // Retain issued ID even if code exchange fails; never reuse that code.
    const session = await exchange(listener.tx, callback, state.subject);
    state.subject = session.identity.subject;
    await save(state);
    console.log('Identità e permesso verificati. I token restano solo nella memoria di questo processo.');
    const catalog = await models(session.accessToken);
    if (!catalog.length) throw new Stop('no_visible_models');
    catalog.forEach((slug, index) => console.log(`${index + 1}. ${slug}`));
    const selection = await terminal.question('Numero del modello per una sola richiesta testuale: ');
    if (!/^[1-9][0-9]*$/.test(selection) || !catalog[Number(selection) - 1])
      throw new Stop('invalid_model_selection');
    // Consent may have created a new app connection: check its credit controls now.
    if (await terminal.question('Ricontrolla ORA saldo crediti zero, ricarica disattivata e uso incluso disponibile; disabilita uso crediti NEYDRA se presente. Digita INVIA: ') !== 'INVIA')
      throw new Stop('included_usage_not_confirmed');
    const result = await textRequest(session.accessToken, catalog[Number(selection) - 1]);
    console.log(JSON.stringify({ status: 'UNVERIFIED', mode: 'real-account',
      identityVerified: true, planScopeGranted: true, ...result,
      billingVerified: false, codexTurnVerified: false,
      next: 'Verifica manualmente consumo e assenza addebiti: README.md. Nessun PASS automatico.' }, null, 2));
  } finally {
    listener?.close();
    terminal.close();
  }
}

run().catch(error => {
  console.error(JSON.stringify({ status: 'BLOCKED',
    reason: error instanceof Stop ? error.code : 'local_or_protocol_error',
    httpStatus: error instanceof Stop ? error.httpStatus : null,
    bodyShape: error instanceof Stop ? error.bodyShape ?? null : null }));
  process.exitCode = 1;
});
