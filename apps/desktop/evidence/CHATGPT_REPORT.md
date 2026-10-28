# Candidato ChatGPT desktop — 28 ottobre 2026

Stato: **IMPLEMENTATO PER REVIEW / WINDOWS UNVERIFIED**. Nessun OAuth o invio AI
reale effettuato dal cloud. Le prove reali delle PR #6/#8 sono evidenze precedenti,
non una convalida di questo candidato. PR separata draft, base #8 `c0d879c`.

Piano eseguito: esame contratti e fonti ufficiali; copia revisionata del nucleo
PR #6 `4cd91e9`; adapter main, IPC v2 e UI separata; test esclusivamente sintetici
e loopback locale; build; tentativo GUI sandboxed; runbook PowerShell e draft PR.

## File e controlli

- `src/main/chatgpt/`: protocollo OAuth/SSE MJS con dichiarazioni TypeScript,
  callback locale, registrazione senza token, adapter TypeScript con sessione e
  contesto in memoria. I moduli MJS hanno lint, controllo sintassi e test, mentre
  adapter, contratti e dichiarazioni sono sottoposti al typecheck strict.
- Main service/index/ports, preload e contratti: wiring e IPC limitato e validato,
  abort, esclusione richieste concorrenti e replay; nessun segreto nel renderer.
- Renderer App/ChatPanel/model: pannelli distinti, consenso per invio, avvisi quota,
  scelta modello, contesto/reset e testo progressivo. Review React applicata:
  eventi con cleanup, ref per lock transitori, stato per valori mostrati,
  aggiornamenti funzionali, label, stato annunciato, escaping del testo.
- Test OAuth/Responses/adapter/loopback/registrazione/preload, estensione E2E
  offline. Nessun test esegue una richiesta di autenticazione o AI esterna.
- [Runbook completo](../../../docs/DESKTOP_CHATGPT.md): architettura, fonti esatte,
  limiti, PowerShell e gate utente Windows.

Ambiente cloud Linux, Node 24.19.0 / npm 11.9.0.

| Comando / controllo | Esito osservato |
| --- | --- |
| `npm ci --cache /tmp/neydra-npm-cache` | PASS, 198 pacchetti da lockfile |
| `npm run setup:electron` con proxy Node (dettagli sotto) | PASS |
| `npm run check` | PASS, incluse sintassi OAuth/SSE/loopback |
| `npm run lint` | PASS, zero warning |
| `npm run typecheck` | PASS, strict |
| `npm test` | **65/65 PASS, 5 file, nessuno saltato**, inclusi socket locali |
| `npm run build` | PASS, main/preload/renderer |
| `npm run check:preload` | PASS, bundle CJS in VM con Electron mock |
| `node --check` sui due bundle CJS | PASS |
| `git diff --check` | PASS |
| Diff `experiments/`, `assets/`, `.github/` rispetto alla #8 | Vuoto |
| GUI Electron / screenshot del candidato | BLOCKED prima della finestra, vedi sotto |
| Windows / account reale nell'app | NON ESEGUITO |

La suite ordinaria senza permessi socket del container aveva due errori di bind
`loopback_unavailable`; con i normali permessi di rete del task (senza elevazione
amministrativa) i socket 127.0.0.1 hanno funzionato. Un'asserzione iniziale pretendeva
la chiusura immediata al replay; è stata corretta per richiedere HTTP 409 oppure
rifiuto/reset della connessione durante la chiusura, conservando un unico risultato.
Nessun errore è stato nascosto con skip o protezioni ridotte. I fetch verso endpoint
OpenAI e l'apertura del browser sono **sempre mock** nei test.

Copertura aggiunta: JWT firmati sintetici/claim/PKCE/state/replay, scope e chiavi
API rifiutati, allowlist endpoint, limiti JSON/SSE/UTF-8/eventi/output, MIME
esplicito rifiutato, EOF e completion con ID corrispondente, errori/quota, abort
reader/scambio OAuth, catalogo reale simulato/vuoto/negato, consenso e UUID,
contesto dei soli turni completi/reset/scadenza, cleanup listener e registrazione.
Le prove MJS e VM non certificano il comportamento Chromium o l'account reale.

Le teste remote controllate prima della consegna sono rimaste: `main 92d4793`,
PR #8 `c0d879c`, PR #6 `4cd91e9`, PR #7 `2d7068b`.

## GUI: prova effettiva e blocco

Installato Electron dal lockfile usando il proxy dell'ambiente:
`NODE_USE_ENV_PROXY=1 electron_config_cache=/tmp/neydra-electron-cache npm run setup:electron`.
Il primo tentativo senza supporto proxy in Node ha dato `TypeError: fetch failed`;
nessun cambio di endpoint o disabilitazione TLS.

`npm run test:desktop` ha fallito **prima della prima finestra**.
Un successivo avvio diagnostico `DEBUG=pw:browser npm run test:desktop` ha mostrato:

```text
FATAL:content/browser/sandbox_host_linux.cc:41
Check failed: . shutdown: Operation not permitted (1)
Process failed to launch! (SIGTRAP)
```

Il comando Playwright usa `chromiumSandbox:true`; nessun `--no-sandbox`, sudo,
SUID, modifica CSP o protezione ridotta. Nessuna asserzione GUI della nuova
versione viene considerata superata. **Nessuna cattura, avvio manuale della nuova
GUI o prova Windows effettuata qui.** I precedenti PASS Windows della #8 sono
conservati nel suo report storico. La nuova suite E2E è pronta da rieseguire sul
PC Windows dopo la build; non preme OAuth e non effettua inferenza.

## Rischi e prossimi passi

- Questo slice non certifica costi zero: quota/crediti/ricarica e addebiti devono
  essere controllati manualmente, prima e dopo le prove locali.
- Sessioni senza refresh, singolo account, niente persistenza token/DPAPI, voce,
  3D, Codex o installer. Registrazione opaca persistente privata con ACL Windows
  da verificare; disconnessione locale distinta da revoca ChatGPT.
- RS256 ristretto e fail-closed; modifiche a formato token/preview o eventi SSE
  possono richiedere review, mai bypass o retry automatici.
- Limiti conservativi di trasporto/output/contesto; una risposta parziale può
  essere visualizzata prima di un errore e non viene reinviata come contesto.
- Nessuna dipendenza o asset aggiunto; riuso codice del repository MIT. Nessuna
  modifica a esperimenti auth/avatar, asset Mini o workflow CI. Nessun merge,
  release, deployment, login o inferenza nel cloud.

Prossimo gate: proprietario esegue PowerShell offline e verifica la GUI Windows;
solo poi decide se autorizzare una prova reale nell'app. **Integrazione non
conclusa fino a tale prova.**
