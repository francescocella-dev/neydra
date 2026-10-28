> Follow-up corrente: [correzione della navigazione alla demo dopo Escape, 93 test offline](#follow-up-windows-sezione-tecnica-e-annullamento). Gli esiti iniziali sottostanti si riferiscono al redesign di partenza.

# Mini — redesign minimale immersivo

28 ottobre 2026. Branch esistente `feat/desktop-mini-interface`, PR #10 **DRAFT**.
Baseline `3d55fd4`. Nuove richieste di minimalismo prioritarie sul polishing
precedente. **Codice e test offline preparati; geometria e GUI Windows non ancora
convalidate per questo candidato.**

## Cambiamenti

- Eliminati fila di pulsanti, slogan, doppia identità, grande welcome, footer,
  card dashboard e testi tecnici persistenti. Brand unico **NEYDRA / MINI**.
- Menu modale laterale con navigazione a icone; fullscreen dedicato a icona,
  stato connessione compatto, sezioni modello/account, visualizzazione pannelli,
  temi, impostazioni e strumenti tecnici. Tooltip, nomi accessibili e tastiera.
- Layout interamente dimensionato sul viewport, con griglie a righe/colonne
  comprimibili e senza altezze minime che superino la finestra. Stato opzionale
  inizialmente chiuso; fascia interna nei viewport più stretti.
- Chat con messaggi compatti, cronologia scorrevole e barra inferiore separata
  con testo, microfono disabilitato e invio/Stop a icona. Consenso per singolo
  invio e avviso costi sempre accanto alla barra, font leggibili.
- Controlli ChatGPT nel menu mediante portal, mantenendo montata la ChatPanel.
  Conservati input, modello, transcript, stato e streaming anche a pannello
  nascosto. Dettagli estesi raggiungibili, nessun dato di quota inventato.
- Palette, WOFF2 locali e venature approvati conservati, con reduced-motion.

File UI: `App.tsx`, `ChatPanel.tsx`, `SettingsPanel.tsx`, `Icon.tsx`, `style.css`.
Test: renderer, E2E e helper geometrico `tests/helpers/viewport.ts`.
[Spec e runbook](../../../docs/NEYDRA_MINI_MINIMAL.md).

## Confini controllati

Diff vuoto rispetto a `3d55fd4` per main, auth/provider, preload, contratti IPC,
font, dipendenze/lockfile, CI, Mini/Blender, references, esperimenti e asset.
Confronto degli handler ChatPanel refresh/connect/disconnect/send/reset e listener
cancel: **identici**. Cambiano markup, presentazione e follow visuale dello stream;
nessun cambiamento di token, endpoint, scope, richieste, limiti o consenso logico.

Fullscreen nativo e F11 rimangono quelli della correzione precedente, incluso il
probe E2E. Nessuna modifica a sandbox, CSP, permessi o sicurezza. Nessun login,
inferenza reale, nuovo framework, Holo, voce, companion, merge o release.

## Esiti osservati nel cloud

Linux, Node 24.19.0 / npm 11.9.0:

| Controllo | Esito |
| --- | --- |
| `npm run check` | PASS |
| `npm run lint` | PASS, zero warning |
| `npm run typecheck` | PASS |
| `npm test` | **92/92 PASS, 8 file, zero skip** |
| `npm run build` | PASS, main/preload/renderer e font locali |
| `npm run check:preload` | PASS, VM con mock Electron |
| `node --check` bundle main/preload | PASS |
| `git diff --check` e confini protetti | PASS |
| Electron E2E | **BLOCKED prima della finestra** |
| Scroll/viewport/hit-testing/immagini GUI del candidato | NON ESEGUITI |
| Windows 100/125/150%, fullscreen e accettazione visiva | NON ESEGUITI |

I test includono i socket sintetici 127.0.0.1 con i normali permessi di rete del
task, senza elevazione. Nei test UI il bridge è simulato; il microfono disabilitato
non invoca `getUserMedia`. Nessuna chiamata OAuth o modello reale.

I sei test renderer coprono navigazione del menu, brand, input conservato,
portali account anche con chat nascosta, stato/modello, consenso rinnovato,
streaming e Stop, risposta da 16384 caratteri, microfono non operativo, fullscreen
simulato e cleanup. **jsdom non può attestare dimensioni/scroll/font reali**.
Un errore iniziale di typecheck nel test usava l'opzione Playwright `exact` con
Testing Library: rimosso, senza cambiare il runtime.

L'E2E è stato aggiornato per rendere fallimenti osservabili: dimensioni e offset
di scroll di tutti i root, rettangoli di barra/consenso/costi, input e comandi
completamente nel viewport, hit-testing, cronologia lunga sintetica con barra
immobile, pannello stato, menu, focus/tooltip, bozza conservata, font, protezioni
Electron e native fullscreen/F11. I casi CSS 1280×860, 1024×688, 853×573 e 720×480
sono predisposti; nessuna loro misurazione viene dichiarata effettuata qui.

## Blocco GUI reale

Comando eseguito: `DEBUG=pw:browser npm run test:desktop`.

```text
FATAL:content/browser/sandbox_host_linux.cc:41
Check failed: . shutdown: Operation not permitted (1)
Process failed to launch! (SIGTRAP)
```

Arresto prima della prima finestra e delle asserzioni. `chromiumSandbox:true`
conservato; nessun --no-sandbox, sudo/SUID o protezione ridotta. **Nessuna cattura
GUI del redesign prodotta o inventata.** Non viene rivendicato un PASS su assenza
di scrolling né un PASS Windows sulla sola base di CSS o unit test.

## Prossimo gate

Eseguire i [comandi PowerShell e la checklist](../../../docs/NEYDRA_MINI_MINIMAL.md)
sul PC Windows, senza nuove richieste AI. Provare realmente finestra/fullscreen,
resize, menu, tastiera, controlli visibili e scala OS 100/125/150%. Verificare sia
scroll globale assente sia contenuti completi/raggiungibili. La PR #10 resta DRAFT
in attesa di questa convalida e della review visiva del proprietario.

## Follow-up Windows: sezione tecnica e annullamento

Baseline del follow-up: `6961b1092b4ca471ad34cd1f5592c1c5f6a36593`.
Il proprietario riferisce su Windows check/lint/typecheck/build/preload e
**92/92 unit PASS**. L'E2E arriva alla ricerca di `Demo offline annullata` dopo
Escape e riapertura del menu, poi fallisce: non è un PASS E2E completo.

**Causa:** `openMenu()` seleziona correttamente `controls`. Il risultato della
demo è nella sezione `technical`, quindi la ricerca per ruolo non vede lo stato
mentre la sezione è nascosta. Il fallimento precedente non provava un difetto di
cancellazione. Questo comportamento del menu deve essere conservato.

**Correzione soltanto nei test:** helper E2E `openOfflineTools()` seleziona
«Informazioni e strumenti tecnici», ne verifica la visibilità ed espande il
`details` della demo solo se è chiuso. È usato al primo accesso e dopo la
riapertura; un `details` già aperto non viene accidentalmente richiuso. Il
locator dello stato è limitato alla demo. Dopo Escape rimangono i controlli di
chiusura menu e ritorno focus; dopo la navigazione si richiedono **stato visibile**
e testo esatto **«Demo offline annullata»**. Nessun includeHidden, skip, cambio
risultato o aumento timeout.

Nuovo test renderer con `DesktopService` e `offlineProvider` effettivi e bridge
locale: avvio demo, Escape/cancel, chiusura dialogo, riapertura in controls,
conferma dello stato non accessibile finché nascosto, ritorno alla sezione
tecnica e verifica del vero evento `responseCancelled` reso come stato atteso.
Non viene iniettato un finto risultato di cancellazione. Solo il comportamento
nativo del dialogo è simulato in jsdom; non è una prova GUI Windows.

Esiti effettivamente osservati nel cloud per questo follow-up:

| Controllo | Esito |
| --- | --- |
| check, lint, typecheck | PASS |
| `npm test` | **93/93 PASS, 8 file, zero skip** |
| build, check preload, sintassi bundle | PASS |
| diff check e diff runtime/percorsi protetti | PASS, nessuna modifica runtime |
| Electron E2E | BLOCKED prima della finestra, sandbox Linux |
| Nuovo E2E Windows | NON ESEGUITO |

Il tentativo `DEBUG=pw:browser npm run test:desktop` termina con lo stesso
`FATAL:content/browser/sandbox_host_linux.cc:41 … shutdown: Operation not
permitted (1)` / SIGTRAP. Non raggiunge l'asserzione corretta; nessun PASS GUI
attribuito al cloud. Sandbox e sicurezza immutati. Non occorre alterare la
cancellazione o il timing in assenza di un ulteriore fallimento osservato dopo
aver reso visibile la sezione.

Ripetizione sul PC Windows, senza login o invii AI:

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

Se lo stato visibile differisce da «Demo offline annullata», conservare il testo
osservato e la nuova asserzione per indagare cancellazione/timing, senza cambiare
l'atteso o saltare il controllo. PR #10 sempre DRAFT; niente merge/release.
