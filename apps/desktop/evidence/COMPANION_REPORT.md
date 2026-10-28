# Companion circolare — report di implementazione e verifiche

28 ottobre 2026, branch `feat/desktop-mini-interface`, PR #10 **DRAFT**.
Partenza `9b8fc610274f98b24f88f1e4312646ed2d30d950`. Il proprietario riferisce su
questa baseline Windows **93/93 unit, Electron E2E 1/1 PASS e design approvato**.
Non sono risultati del nuovo companion.

## Risultato preparato

Menu **Riduci a Mini** → companion circolare 120 DIP, trasparente fuori dal
cerchio, frameless, topmost, senza taskbar. Segno N temporaneo originale, nessun
avatar fittizio o asset 3D. Clic/Invio/Spazio ripristinano il main vivo; menu
nativo Apri/Esci. Trascinamento col cursore OS, distinzione clic/drag, limiti sulle
work area reali e recupero dopo cambi monitor. Un solo controller e single-instance
lock impediscono duplicazioni. Startup confermato dal renderer prima di nascondere
il main; fallimenti, chiusura e crash recuperano NEYDRA o terminano un'istanza
irrecuperabile. Nessun retry automatico.

Le modifiche sono concentrate in main/controller/sessioni, contratti e preload
companion, renderer `src/companion`, comando del menu, build e test. Il main
renderer riceve soltanto `reduceToMini` in più. Il companion ha un preload e una
partizione separati, senza bridge o dati chat. Schemi strict e autorizzazione per
origine/frame/ID sono verificati. La CSP e le preferenze di sicurezza esistenti
sono riutilizzate immutate; nessuna protezione disabilitata.

## Test osservati nel cloud Linux

| Verifica | Esito |
| --- | --- |
| check, lint, typecheck | PASS, zero warning lint |
| unit/renderer | **113/113 PASS, 11 file, zero skip** |
| build main, due preload, renderer immersivo e companion | PASS |
| check preload | PASS per entrambi i bundle, VM con mock Electron |
| sintassi dei tre bundle CJS | PASS |
| discovery Playwright | 2 test trovati |
| Electron E2E | **BLOCKED prima della prima finestra**, entrambi i test |
| GUI, screenshot e trascinamento fisico del nuovo companion | **NON ESEGUITI** |
| Nuovo E2E Windows, taskbar, trasparenza, DPI e monitor reali | **NON ESEGUITI** |

Tentativo: `DEBUG=pw:browser npm run test:desktop`, exit 1, due errori di lancio:

```text
FATAL:sandbox/linux/suid/client/setuid_sandbox_host.cc:172
The SUID sandbox helper binary was found, but is not configured correctly.
Rather than run without sandboxing I'm aborting now.
Process failed to launch! (SIGTRAP)
```

Nessun tentativo con --no-sandbox, privilegi elevati o SUID modificato. Nessun
PASS GUI o screenshot inventato. Le piccole correzioni durante i controlli
riguardavano tipi/lint delle nuove fixture E2E, senza indebolire le asserzioni.

## Copertura e limiti

- Controller: visibilità prima di nascondere il main; riuso, richieste concorrenti,
  annullamento della creazione tardiva, errori/finestra invisibile, recupero,
  main non disponibile e quit; clic/jitter, drag che torna all'origine, ultimo
  punto e cancel; work area negative, vuoti, monitor rimosso, DPI/taskbar cambiati,
  area insufficiente; main minimizzato/fuori schermo, fullscreen e massimizzazione conservati.
- Host Electron simulato: opzioni finestra, sessioni distinte, CSP, permessi,
  download/rete/navigazione negati, rifiuto dei canali chat e fullscreen dal
  companion e dei subframe; menu Apri/Esci, crash/chiusura/hide, seconda istanza,
  attivazione, cleanup; handshake mancante con timeout e nessun retry.
  Una regressione aggiuntiva chiude il main con companion esistente e verifica
  il rientro degli eventi di uscita senza richiamare finestre native già distrutte.
- Preload e controlli: bridge minimo congelato, DTO/reply validati, assenza di
  eventi chat, coalescing pointer, capture/cancel/blur, tastiera/menu, errore IPC.
- Renderer React: riduzione durante uno stream **sintetico**, completamento dopo
  la riduzione, bozza, risposta, modello e connessione sintetici conservati,
  stessi nodi/listener e nessuna riconnessione/inferenza automatica; lock ed errore
  visibile senza bloccare il menu. jsdom non certifica geometria nativa.
- E2E predisposto: ciclo vero tra BrowserWindow, input conservato senza reload,
  bridge isolato e assenza Node, proprietà native, stato sandbox OS su Windows/
  macOS, drag deterministico con cursore simulato **solo nel test**, callback
  native Apri/Esci, Alt+F4 equivalente `close()`, ricreazione e Invio. Il popup
  nativo è intercettato solo per selezionare le callback. Non certifica il menu
  OS visibile o il trascinamento fisico. L'E2E immersivo/F11 rimane; il suo elenco
  bridge è aggiornato per l'unico nuovo metodo. `assertSingleViewport` è identico.

Diff vuoto rispetto alla baseline per OAuth/Responses/registrazione, servizio,
provider offline, ChatPanel/consenso, fullscreen/F11 runtime, CSP/security.ts,
CSS immersivo, font, dipendenze e lockfile. Nessun asset Mini/Blender, Holo o voce
modificato. Nessuna richiesta AI, login reale, merge, release o deployment.

Checklist React applicata: stato chat non spostato né rimontato, transizioni
esplicite negli handler, lock contro doppi clic, cleanup dei listener, comandi
nominati e operabili da tastiera. Nessun nuovo framework o libreria UI.

## Prossimo gate Windows

[Procedura PowerShell, E2E isolato e checklist completa](../../../docs/NEYDRA_MINI_COMPANION.md#verifica-windows-senza-richieste-ai).
Provare realmente cerchio/trasparenza/taskbar, mouse, focus, full screen/F11,
monitor e DPI, seconda istanza, chiusura e uscita. Confermare anche l'interfaccia
immersiva approvata, con bozza conservata e nessun overflow. **Il nuovo companion
non è dichiarato convalidato su Windows; la PR #10 resta DRAFT.**

Riferimenti Electron per le API di finestra/sessione utilizzate:
[BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window),
[finestre trasparenti](https://www.electronjs.org/docs/latest/tutorial/custom-window-styles#transparent-windows),
[screen e DIP](https://www.electronjs.org/docs/latest/api/screen),
[single-instance lock](https://www.electronjs.org/docs/latest/api/app#apprequestsingleinstancelockadditionaldata),
[sandbox](https://www.electronjs.org/docs/latest/tutorial/sandbox).
