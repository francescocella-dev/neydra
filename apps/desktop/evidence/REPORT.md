# Issue #4 — verifica del 28 ottobre 2026

**Risultato:** struttura offline compilata e test automatici senza GUI passati.
Avvio Electron/GUI **BLOCKED nel container Linux**; Windows **UNVERIFIED**.
Nessuna autenticazione, inferenza, voce o scena 3D è stata attivata.

## Ambiente e comandi

Debian 13 x64 (cloud), Node `24.19.0`, npm `11.9.0`. Versioni esatte e integrità
in `package-lock.json`: Electron 45.1.0, React 19.3.1, TypeScript 5.9.3,
Vite 8.3.5, esbuild 0.28.2, ESLint 10.13.0, Vitest 5.0.5, Playwright 1.64.1.

Comandi dalla root, salvo indicazione diversa:

| Controllo | Risultato osservato |
| --- | --- |
| `npm ci --offline` con cache npm temporanea | PASS: 196 pacchetti installati da lockfile |
| `npm run setup:electron` con cache Electron temporanea | PASS: runtime installato esplicitamente |
| `npm run check` | PASS: sintassi degli script MJS |
| `npm run lint` | PASS: zero warning |
| `npm run typecheck` | PASS: TypeScript strict |
| `npm test` | PASS: 17 test, 3 file, nessuno saltato |
| `npm run build` | PASS: main CJS, preload CJS, renderer Vite |
| `npm run check:preload` | PASS: artefatto preload eseguito in VM con Electron mock |
| `node --check apps/desktop/dist/main/index.cjs` | PASS |
| `node --check apps/desktop/dist/preload/index.cjs` | PASS |
| `npm audit --json` | PASS: zero vulnerabilità (anche dipendenze di sviluppo) |
| `git diff --check` | PASS |
| Diff dei tre percorsi vietati rispetto a `origin/main` | Vuoto; nessun esperimento/asset modificato |
| `npm run test:desktop` | BLOCKED prima di creare la finestra; dettagli sotto |
| Workflow Windows manuale | Non lanciato; nessun consumo runner attivato |

La cache è stata spostata in `/tmp` per rispettare i permessi del workspace.
L'installazione sotto sandbox shell senza accesso di rete aggiuntivo ha inizialmente
fallito il controllo subprocess esbuild (`spawnSync ... EPERM`); la stessa
installazione pulita è poi riuscita con i normali permessi di rete del task,
senza privilegi amministrativi o modifiche al sistema.
L'audit iniziale aveva segnalato advisory degli strumenti di test più vecchi:
sono stati aggiornati prima della verifica finale; il lockfile consegnato ha audit 0.

## Copertura reale dei test

- Validazione strict, campi extra/ID/input non validi, limiti e comandi sconosciuti.
- Fixture offline a frammenti, una richiesta alla volta, terminale esplicito.
- Abort, richieste successive, eventi tardivi, stream incompleto/errore/oversize.
- Reducer che ignora ID obsoleti ed eventi dopo il terminale.
- Allowlist locale, identità finestra/main frame, CSP e preferenze di sicurezza.
- Preload mock: API stretta, validazione in entrambe le direzioni, eventi senza
  oggetto IPC privato e unsubscribe del proprio listener.
- Artefatto CJS in VM senza Node globale: unica dipendenza runtime `electron`.
  Questa VM non è una prova del sandbox Chromium o di contextBridge reale.

Review React: cleanup degli abbonamenti e key handler, reducer con aggiornamenti
puri, lock ref per doppio invio, testo renderizzato con escaping React, form con
label, navigazione tastiera, stato accessibile, nessun movimento o autoplay.
La review statica non sostituisce l'ispezione visuale o l'accessibilità su Windows.

## Blocco Electron e catture

È stato avviato un display Xvfb temporaneo in `/tmp` senza installazione di sistema.
Il primo lancio diagnostico ha riportato:

```text
FATAL:content/browser/sandbox_host_linux.cc:41
Check failed: . shutdown: Operation not permitted (1)
```

Il test è stato configurato con `chromiumSandbox: true`: il default di Playwright
aggiungeva `--no-sandbox`, in conflitto con il requisito del progetto. Con sandbox
esplicitamente attivo e normali permessi di rete, il lancio ha confermato:

```text
FATAL:sandbox/linux/suid/client/setuid_sandbox_host.cc:172
The SUID sandbox helper binary was found, but is not configured correctly.
Rather than run without sandboxing I'm aborting now.
```

Riproduzione cloud: `DISPLAY=:99 DEBUG=pw:browser npm run test:desktop` con Xvfb
e binario Electron installati. Non sono stati usati sudo, modifiche SUID, privilegi
o disattivazione del sandbox. Il blocco è ambientale, prima delle asserzioni della
suite: **nessun PASS E2E o screenshot Electron viene dichiarato**.
Il test finale pronto per Windows verifica isolamento Node/API, comandi invalidi,
stream/annullamento/Esc, cambio preferenza, rete/permessi/popup/navigazione bloccati,
ricaricamento e generazione di catture. Tutto questo resta **non eseguito**.

## File consegnati

Creati:

- Root: `.gitignore`, `package.json`, `package-lock.json`.
- `.github/workflows/desktop-windows.yml` (solo manuale).
- `docs/DESKTOP_PLAN.md`, `docs/DESKTOP.md`.
- `apps/desktop/package.json`, `tsconfig.json`, `eslint.config.mjs`,
  `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`.
- `apps/desktop/scripts/build.mjs`, `scripts/check-preload.mjs`.
- `apps/desktop/src/main/index.ts`, `security.ts`, `ports.ts`, `offline.ts`, `service.ts`.
- `apps/desktop/src/preload/index.ts`, `src/shared/contracts.ts`.
- `apps/desktop/src/renderer/index.html`, `main.tsx`, `App.tsx`, `model.ts`,
  `global.d.ts`, `style.css`.
- `apps/desktop/tests/service.test.ts`, `security.test.ts`, `preload.test.ts`, `desktop.e2e.ts`.
- Questo report.

Aggiornato: `README.md` (stato effettivo e link). Bundle, eseguibili, cache e
risultati temporanei non sono committati. Nessun installer/release o merge.

## Costi, diritti, prossima verifica

Nessun servizio, key, credito o modello vocale acquistato/configurato. Nessun nuovo
asset. Tutte le 270 voci con versione del lockfile hanno una dichiarazione di
licenza: MIT, ISC, Apache-2.0, BSD-2/3-Clause, MPL-2.0, BlueOak-1.0.0, CC-BY-4.0
(tooling/dati build). Questo controllo delle dichiarazioni non è una certificazione
legale né un inventario di distribuzione Windows. I notices di Electron/Chromium
andranno mantenuti se in futuro si distribuirà il runtime.

Main remoto è rimasto `92d4793`; le teste delle PR #6/#7 lette sono rimaste
`4cd91e9` / `2d7068b`. Nessun loro branch modificato o unito.
Rischi e hand-off completi: [DESKTOP.md](../../../docs/DESKTOP.md).
Prossimo gate: seguire il runbook PowerShell, eseguire smoke e prova manuale sul
PC Windows; solo successivamente procedere con integrazioni separate e review.


## Primo smoke su Windows, riportato dal proprietario (28 ottobre 2026)

Il proprietario ha eseguito dalla root del branch `issue-4/windows-desktop-shell`:

- `npm.cmd ci`: 195 pacchetti installati, audit **0 vulnerabilità**.
  L'avviso npm `allow-scripts` relativo a `esbuild@0.28.2` non ha
  impedito i successivi controlli, compilazione e test. Non è stata
  approvata indiscriminatamente l'esecuzione degli script.
- `npm.cmd run setup:electron`: eseguito senza errori.
- `npm.cmd run check`, `lint`, `typecheck`: **PASS**.
- `npm.cmd test`: **17/17 PASS** (3 file).
- `npm.cmd run build`: **PASS** (main/preload/renderer).
- `npm.cmd run check:preload`: **PASS** (VM mock).
- `npm.cmd run test:desktop`: **1 FAIL** dopo circa 15 secondi, durante
  l'asserzione di blocco della navigazione esterna. La verifica precedente
  di bridge, isolamento, demo offline, annullamento/Esc, popup, permessi e
  rete è stata superata fino al punto di errore.

Dettaglio: la prova imposta nel renderer
`location.href = 'https://example.org'`; subito dopo,
`expect(page).toHaveURL('app://desktop/index.html')` ha osservato
`Received: ""` fino al timeout di 5 secondi. Non è provato dai dati
disponibili se questo sia uno stato transitorio del frame Playwright o
una navigazione che ha lasciato il renderer inutilizzabile.

### Correzione del test, NON del sandbox

Al commit `59192c2` è stata modificata **soltanto** la verifica E2E:
dopo il tentativo di navigazione, controlla il valore
`BrowserWindow.webContents.getURL()` dal processo principale Electron
e richiede inoltre che il renderer originale mantenga sia il pulsante
offline funzionante sia la preferenza Mini precedentemente selezionata.
Non si considera un URL vuoto prova di sicurezza: se il renderer viene
sostituito, gli ultimi controlli devono fallire. Sandbox, CSP, blocklist
di navigazione, IPC, dipendenze e app runtime sono invariati.

**La suite E2E non è stata ancora rieseguita sul PC Windows dopo il
commit**. Lo smoke completo e la prova manuale restano da convalidare.
Nessun test OAuth, modello AI, asset 3D o microfono viene attivato.
