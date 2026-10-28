# F11 fullscreen — analisi e correzione E2E

28 ottobre 2026. Branch `feat/desktop-mini-interface`, PR #10 **DRAFT**.
Partenza: `654aa6ce9abf0ee6a9ae696215a1fb7ec437e39e`.
**Candidato corretto nel test; E2E Windows nuovo NON ESEGUITO.**

## Evidenza Windows riferita dal proprietario

Sul commit di partenza: check, lint, typecheck, build, preload e **86/86 unit
PASS**. L'E2E ha aperto Electron, completato i controlli precedenti e verificato
l'ingresso fullscreen dal pulsante (`isFullScreen() === true`). Dopo
`page.keyboard.press('F11')`, l'asserzione alla vecchia riga 78 ha osservato
ancora `true` per cinque secondi. Non è un PASS E2E completo.

Quel resoconto non conteneva eventi `before-input-event` o focus: da solo non
stabilisce se la tastiera fisica F11 fosse difettosa. Non viene inventata una
riproduzione Windows nel cloud.

## Causa nel percorso del test

Analizzati l'implementazione locale Playwright 1.64.1 e i sorgenti ufficiali
corrispondenti al runtime Electron 45.1.0:

1. [Playwright RawKeyboardImpl](https://github.com/microsoft/playwright/blob/v1.64.1/packages/playwright-core/src/server/chromium/crInput.ts)
   invia `Input.dispatchKeyEvent` tramite CDP. Imposta `windowsVirtualKeyCode`,
   ma **non `nativeVirtualKeyCode`**: non sono campi intercambiabili.
2. Il [DEPS Electron 45.1.0](https://github.com/electron/electron/blob/v45.1.0/DEPS)
   identifica Chromium 156.0.8078.49. Il suo
   [InputHandler::DispatchKeyEvent](https://github.com/chromium/chromium/blob/156.0.8078.49/content/browser/devtools/protocol/input_handler.cc)
   imposta `skip_if_unhandled` quando non può costruire l'evento nativo.
3. [RenderWidgetHostImpl](https://github.com/chromium/chromium/blob/156.0.8078.49/content/browser/renderer_host/render_widget_host_impl.cc)
   salta `PreHandleKeyboardEvent` con quel flag. Un evento DOM nel renderer può
   quindi arrivare senza attraversare l'handler main dell'app.
4. [Electron WebContents](https://github.com/electron/electron/blob/v45.1.0/shell/browser/api/electron_api_web_contents.cc)
   emette `before-input-event` nel pre-handler. L'app lo usa per chiamare
   `fullscreenShortcut()`, che accetta F11 keyDown senza autorepeat/Ctrl/Alt/Meta
   e invoca `setFullScreen(!isFullScreen())`. Il pulsante segue invece l'IPC
   finestra, perciò il suo successo non prova la consegna del tasto CDP.

Il difetto identificabile nei sorgenti è **il driver E2E che usa il percorso CDP
per verificare un'intercettazione main nativa**. Aumentare il timeout o spostare
il toggle nel renderer non correggerebbe quel percorso. L'eventuale ulteriore
problema di focus del singolo run originale resta ignoto; nessun difetto runtime
Windows della scorciatoia è dimostrato da quei dati.

## Correzione e diagnostica, soltanto nei test

- Il test focalizza BrowserWindow **e** WebContents e verifica entrambi, più
  l'assenza di minimizzazione. È una precondizione documentata di
  [sendInputEvent](https://www.electronjs.org/docs/latest/api/web-contents#contentssendinputeventinputevent).
- Invia una sola coppia `keyDown`/`keyUp`, `keyCode:'F11'`, con
  `webContents.sendInputEvent()`. Questo inoltra l'input nel percorso Electron;
  **non** invoca direttamente lo shortcut, il bridge fullscreen o il setter.
  Nessun `emit('before-input-event')` fittizio nell'E2E e nessun fallback.
- Richiede per F11: evento keyDown osservato nel main dopo il listener app,
  senza repeat/modificatori, focus presente e `defaultPrevented:true`; esattamente
  una chiamata production al setter con il booleano atteso; evento nativo
  enter/leave; stato finale corretto e comando UI coerente.
- Conserva quattro transizioni: pulsante entra, F11 esce, F11 entra, pulsante
  esce. Il DOM deve rimanere fuori dall'HTML fullscreen. Il timeout non è aumentato.
- Il probe è installato con `evaluateHandle` **solo durante il test**, mai nel
  main distribuito. Una spia trasparente sul setter registra le chiamate originate
  dall'app e le inoltra al metodo Electron originale, senza decidere il toggle,
  cambiare il risultato o nascondere eccezioni. Metodo e listener ripristinati
  nel `finally`, prima dei successivi controlli/reload/navigazione.
- Allegato Playwright `fullscreen-diagnostic`: fasi fisse, booleani di
  focus/stato/modificatori/prevenzione/eccezione e liste limitate. Sono osservati
  solo F11 e transizioni fullscreen. Niente altri tasti, testo digitato, URL,
  email, token, header, account, screenshot o messaggi di errore grezzi.

Interpretazione del prossimo allegato Windows:

| Evidenza | Punto da indagare |
| --- | --- |
| focus falso / minimizzata | Focus/invio del test prima della scorciatoia |
| focus vero, nessun input F11 | Consegna input o pre-handler Electron |
| F11 ricevuto, non prevenuto, nessuna chiamata | Listener app / filtri dello shortcut |
| chiamata con `threw:true` | Setter nativo ha sollevato un'eccezione |
| più chiamate o booleano inatteso | Toggle duplicato o stato iniziale errato |
| chiamata corretta, nessun evento/stato atteso | Transizione nativa/OS da diagnosticare |
| tutte le condizioni verificate | Percorso E2E F11 completo in quel run |

Gli eventi sintetici Electron non certificano il tasto fisico, i tasti Fn del
portatile o la taskbar Windows: resta utile una prova manuale separata senza AI.

## Esiti effettivamente eseguiti nel cloud

Linux, Node 24.19.0 / npm 11.9.0:

| Verifica | Esito |
| --- | --- |
| `npm run check` | PASS |
| `npm run lint` | PASS, zero warning |
| `npm run typecheck` | PASS |
| `npm test` | **90/90 PASS, 8 file, zero skip** |
| `npm run build` | PASS |
| `npm run check:preload` | PASS, VM con Electron mock |
| `git diff --check` | PASS |
| Diff runtime/sicurezza/asset/dipendenze | Vuoto rispetto a `654aa6c` |
| `DEBUG=pw:browser npm run test:desktop` | BLOCKED prima della finestra |
| Nuovo E2E Windows / tasto fisico | NON ESEGUITI |

I quattro nuovi unit test del probe usano EventEmitter e finestre simulate:
verificano inoltro allo shortcut production, mancanza di handler, focus negato,
eccezione del setter, filtraggio dati e cleanup. **Non sono una prova Electron
Windows.** Tutti i test auth/provider esistenti rimangono offline e invariati.

Il tentativo Electron cloud termina con:

```text
FATAL:content/browser/sandbox_host_linux.cc:41
Check failed: . shutdown: Operation not permitted (1)
Process failed to launch! (SIGTRAP)
```

Il nuovo probe non è stato raggiunto: nessun allegato F11 o PASS GUI viene
attribuito al cloud. Sandbox e `chromiumSandbox:true` invariati, nessun aggiramento.
Nessuna modifica al runtime, IPC/CSP, autenticazione, richieste AI, asset o PR #9/#7.
Nessun login, inferenza, merge o release.

## Ripetere su Windows

Da checkout pulito; non eliminare file locali e fermarsi al primo errore:

```powershell
cd D:\WORK\NEYDRA
git status --short
git switch feat/desktop-mini-interface
git pull --ff-only origin feat/desktop-mini-interface
npm.cmd run check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run check:preload
npm.cmd run test:desktop
```

Tenere la finestra Electron in primo piano durante le fasi F11. Se fallisce,
condividere l'asserzione e il solo allegato diagnostico sanitizzato:

```powershell
Get-ChildItem .\apps\desktop\test-results -Recurse -File |
  Where-Object { $_.Name -like '*fullscreen-diagnostic*' } |
  ForEach-Object { Get-Content -LiteralPath $_.FullName }
```

Se l'errore precede la fase fullscreen, l'allegato non sarà presente: riferire
l'asserzione senza cercare log OAuth o dell'account. Nessun retry automatico.

Dopo l'E2E, `npm.cmd start`: senza collegarsi o inviare AI, provare F11 fisico,
pulsante di uscita, taskbar/title bar e ritorno alla finestra. Inviare SHA e ciò
che è stato effettivamente osservato. PR #10 **ancora DRAFT**; nessun PASS Windows
per questo candidato fino al nuovo risultato del proprietario.
