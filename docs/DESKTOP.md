# Struttura desktop Windows — Issue #4

Scheletro tecnico offline, avviabile con Electron + React + TypeScript + Vite.
Non è un installer o una release. Non importa codice dalle PR #6/#7: i relativi
branch restano indipendenti. Nessuna autenticazione/inferenza, 3D o voce reale.

## Prova locale Windows (PowerShell)

Target di verifica: Windows 11 x64, Git, Node.js **24 LTS** x64 con npm.
Non occorrono account, chiavi API, Codex CLI, Python, Blender o servizi hosted.
Installazione dipendenze e download del runtime Electron richiedono Internet;
il funzionamento dell'app è offline. Non disabilitare TLS, sandbox o antivirus.

Da un nuovo checkout, oppure dal proprio checkout pulito:

```powershell
git clone https://github.com/francescocella-dev/neydra.git
Set-Location neydra
git fetch origin
git switch --track origin/issue-4/windows-desktop-shell
node --version # atteso v24.x
npm ci
npm run setup:electron
npm run check
npm run lint
npm run typecheck
npm test
npm run build
npm run check:preload
npm run test:desktop
npm start
```

Se il repository è già clonato, saltare `git clone` e posizionarsi nella sua
directory. Se il branch locale esiste già: `git switch issue-4/windows-desktop-shell`.
Con Electron 45 il download del binario è **esplicito** (`install-electron`, esposto
da `setup:electron`); `npm ci` installa solo i pacchetti. Il comando è idempotente.
Non serve installare browser Playwright: lo smoke usa il runtime Electron locale.

Per sviluppare: `npm run dev` ricompila e apre Electron. Dopo una modifica chiudere
la finestra e rieseguire il comando. `npm start` apre l'ultima build, senza ricompilare.
Nessun Vite dev server/HMR, porta locale o eccezione CSP. Chiudere con Alt+F4.

Prova manuale:

1. Verificare badge OFFLINE e quattro integrazioni non attive; il microfono è spento.
2. Avviare la demo: arriva un testo italiano **predefinito**, a tre frammenti.
   Cambiare input non produce una risposta AI. Nessun dato viene inviato o salvato.
3. Riavviare e premere Stop oppure Esc prima del completamento: compare annullata;
   non devono arrivare altri frammenti. Riavviare nuovamente e lasciar completare.
4. Cambiare preferenza Holo/Mini durante la demo: il testo prosegue, nessun avatar
   viene mostrato. La preferenza è solo memoria del renderer, si azzera al riavvio.
5. Usare Tab/Shift+Tab, ridimensionare la finestra. Non ci sono animazioni o audio.

Lo smoke salva `apps/desktop/evidence/desktop-offline.png` e `desktop-narrow.png`;
queste catture contengono solo la fixture pubblica, mai credenziali o conversazioni.
Un PASS cloud non verifica Windows, OAuth, GPU, microfono, speaker o lip sync reali.

## File e responsabilità

| Percorso | Responsabilità |
| --- | --- |
| `src/main/index.ts` | Finestra, sessione in memoria, protocollo locale, permessi, IPC |
| `src/main/security.ts` | CSP, allowlist dei file, identità del mittente |
| `src/main/ports.ts` | Auth/provider futuri, solo main |
| `src/main/service.ts` | Una richiesta alla volta, limiti, abort, terminali |
| `src/main/offline.ts` | Unico provider attivo: fixture esplicitamente offline |
| `src/preload/index.ts` | Bridge chiuso, validazione entrata/uscita, unsubscribe |
| `src/shared/contracts.ts` | Protocollo v1 e porte avatar/voce tipizzate |
| `src/renderer/` | Shell tecnica, testo, preferenza avatar in memoria |
| `tests/` | Contratti, annullamento, sicurezza e smoke Electron |
| `scripts/build.mjs` | Bundle CJS main/preload + build Vite renderer |

Tutti i percorsi della tabella sono relativi a `apps/desktop/`.
Il preload sandboxed è un unico bundle CJS: dipende a runtime soltanto da `electron`,
senza import Node o moduli ESM nel contesto sandboxed.

## IPC v1 e sicurezza

Il renderer riceve soltanto `window.neydra`:

| Metodo | Dati ammessi |
| --- | --- |
| `getStatus()` | Stato fisso offline; nessuna identità account |
| `startOfflineDemo({ requestId, prompt })` | UUID, testo trim 1–2000 caratteri |
| `cancel({ requestId })` | UUID della richiesta attiva |
| `onEvent(listener)` | Eventi validati; restituisce rimozione del singolo listener |

Gli schemi Zod strict rifiutano campi extra. Il preload valida chiamate, risposte
ed eventi. Il main valida di nuovo ogni comando e accetta solo il main frame della
propria WebContents all'URL esatto `app://desktop/index.html`.
Nessun canale, URL, percorso, nome processo o comando arbitrario dal renderer.
Errori pubblici sono codici fissi, senza stack, header o payload del provider.

Sequenza demo: `responseStarted` (source `offline-demo`), `textDelta`*, poi un solo
terminale `responseCompleted` / `responseCancelled` / `responseFailed`.
Il completamento richiede un terminale esplicito del provider; stream troncati
falliscono. Una richiesta attiva per finestra, max 4096 caratteri per delta e
16384 totali. L'annullamento invalida l'istanza prima dell'abort: eventi tardivi
non possono resuscitare lo stream. Anche il reducer verifica ID e terminale.
Ricaricamento/chiusura/crash del renderer annullano la richiesta.

`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`,
`webSecurity: true`, webview disabilitato e sandbox abilitata a livello app.
Protocollo custom sicuro; solo `index.html` e JS/CSS generati sotto `assets/` sono
serviti dalla directory build. Nessun filesystem generico. CSP in header:
default deny, script/style self, connect none, object/frame/base/form none.
WebRequest blocca altre destinazioni; navigazioni, popup, download e permessi
media/dispositivi sono negati. Nessuna shell, subprocess, telemetria, persistenza
applicativa o lettura delle credenziali del sistema.
Electron può creare la propria cache/configurazione ordinaria nel profilo utente;
questa PR non implementa un archivio conversazioni o credenziali.

## Hand-off PR #6: autenticazione e risposte

Riferimento letto: commit `4cd91e91360a830d53fc3fcc13eb07c9f935e20c`,
[runbook](https://github.com/francescocella-dev/neydra/blob/4cd91e91360a830d53fc3fcc13eb07c9f935e20c/experiments/auth/README.md).
Il singolo probe reale dell'utente è passato (`completed:true`, `expectedText:true`);
non ripeterlo per questa Issue. Billing automatico, Codex e integrazione completa
restano non verificati. Non importare il CLI sperimentale nel renderer.

1. Dopo review e autorizzazione separata dell'integrazione, estrarre un adapter
   main-only che implementi `AuthPort` e `ProviderPort`. `connect` apre solo URL
   ufficiali nel browser di sistema; URL/callback/PKCE/token non attraversano IPC.
2. L'adapter auth conserva la sessione privatamente. Gestire identità, refresh,
   rotazione, disconnessione/revoca e cambio account. Persistenza solo con storage
   Windows sicuro verificato (es. Electron safeStorage/DPAPI e ACL), altrimenti
   memoria volatile; nessun ripiego in chiaro o lettura delle sessioni del browser.
3. Normalizzare SSE in delta e terminale reale; mantenere limiti, abort e guard
   missing-MIME della PR #6. Non equiparare HTTP 200/EOF a completamento; nessun
   retry automatico, API key o fallback a crediti acquistati.
4. Estendere esplicitamente e versionare gli schemi: il canale attuale accetta
   **solo** `startOfflineDemo` e sorgente `offline-demo`. Non collegare un provider
   reale al metodo demo. Nuovi comandi login/logout/invio richiederanno UX di
   consenso, policy di costo/quota e stati sanitizzati (senza session DTO).
5. Test mock del ciclo e della redazione prima di un futuro consenso Windows;
   Codex app-server/subprocess e permessi progetto sono un'integrazione distinta.

Documentazione ufficiale da rivalidare nell'integrazione, non usata per chiamate qui:
[SIWC open source](https://developers.openai.com/siwc/token-sharing-open-source),
[cookbook SIWC](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt),
[Codex app-server](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server).
Non sono state inventate route, scope o SDK API.

## Hand-off PR #7 e Issue #5: motore e asset

Riferimento letto: commit `2d7068b3966d314b2544445e0fa56fcc8ad1fcc0`,
[protocollo/rig](https://github.com/francescocella-dev/neydra/blob/2d7068b3966d314b2544445e0fa56fcc8ad1fcc0/experiments/avatar-stage/RIG_CONTRACT.md)
e relativo `src/engine/protocol.ts`.

`AvatarPort` è renderer-local: `select`, `dispatch`, `dispose`. `AvatarEvent`
ricalca gli eventi dell'esperimento (sei stati, speech ID, visemi con `timestamp`,
expression/head pose e reduced motion). Il futuro wrapper usa la stessa istanza
`AvatarEngine` cambiando Holo/Mini; cambio avatar non resetta testo, audio o motore.
Montare lo stage R3F nella regione riservata, aggiungere dipendenze/asset dopo
review e ampliare l'allowlist locale **esplicitamente** per GLB approvati.
L'allowlist odierna non serve modelli o file utente. Conservare i controlli GLB
(20 MiB, embedded, niente URI esterni) della PR #7 e il manifest licenze.

Testo in arrivo significa `processing`, non `speaking`: parlare richiede playback
audio reale. `speechStarted.startedAt`, visemi e sample devono condividere il
clock monotono del renderer proiettato sul clock del playback. Non usare
l'orario del main o l'arrivo di rete come inizio audio. Il futuro adapter deve
gestire buffering/pausa/ripresa, ID utterance univoci e terminali/cancel coerenti.
Rispetto di reduced motion dell'OS nell'adapter; nessuna animazione in questo shell.
Gli asset Mini definitivi restano nella Issue #5; qui non ci sono sostituti 2D.

## Voce locale futura

`VoicePort` definisce listen/speak con `AbortSignal`, stop ed eventi di transcript
e playback, senza una implementazione simulata di microfono o speaker.
Estendere il protocollo con cue visemi misurati/clock di playback una volta scelto
il motore locale; validare ogni futuro payload IPC con limiti e schemi strict.
Decidere isolamento main/utility process, licenze dei modelli, installazione
manuale, consenso dispositivo e autorizzazioni ristrette prima di abilitarli.
Interruzione: annullare provider + STT/TTS/playback, svuotare cue, inviare
`speechCancelled`; ignorare tutti gli eventi dei vecchi ID. Nessuna paid audio API.
Whisper/sherpa e modelli non sono installati o scaricati qui.

## CI, costi e limiti

`desktop-windows.yml` è **workflow_dispatch soltanto**, standard `windows-latest`,
read-only, senza secret, artifact upload, installer, deploy o release. Il repository
è stato verificato pubblico; i runner standard pubblici sono previsti senza costo,
ma il proprietario deve verificare policy/eligibilità account prima di avviarlo.
Non è stato attivato o lanciato alcun runner hosted da questa attività.
Un workflow nuovo può non comparire nel menu Actions finché non raggiunge il branch
default: usare intanto i medesimi comandi PowerShell locali, senza merge automatico.
L'esecuzione della presente attività cloud non prova chaining o task sempre attivi.

Dipendenze di codice open source gratuite, nessuna dipendenza da asset/servizi a
pagamento. Electron include Chromium/Node e relativi avvisi: prima di distribuire
un pacchetto conservare LICENSE e LICENSES.chromium.html del runtime e inventariare
le dipendenze incluse. Questa PR non distribuisce eseguibili o modelli.

Rischi aperti: test Windows reale, review sicurezza degli adapter futuri, gestione
sessioni/quote e credenziali, code/limiti dello streaming reale, sincronizzazione
audio, diritti e performance dei GLB finali. Convalida hardware e UI dell'account
restano al proprietario. Prossimo passo: review del shell e prova Windows offline,
poi task separato per ciascuna integrazione, senza modificare i branch #6/#7.

Riferimenti Electron:
[sicurezza](https://www.electronjs.org/docs/latest/tutorial/security),
[sandbox](https://www.electronjs.org/docs/latest/tutorial/sandbox),
[contextBridge](https://www.electronjs.org/docs/latest/api/context-bridge),
[protocol](https://www.electronjs.org/docs/latest/api/protocol).
