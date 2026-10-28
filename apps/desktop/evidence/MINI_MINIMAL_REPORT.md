> Follow-up corrente: [overflow del tooltip Stato nelle finestre basse](#follow-up-windows-tooltip-del-pannello-stato). Gli esiti delle sezioni precedenti si riferiscono ai rispettivi candidati.

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

## Follow-up Windows: tooltip del pannello Stato

Baseline: `49da83d1e8326e19e1228f07e15acc85271df411`, sullo stesso branch e PR #10
DRAFT. Il proprietario riferisce check/lint/typecheck/build/preload e **93/93 unit
PASS** su Windows. Nel suo E2E a 720×480, dopo aver aperto Stato, la shell ha
`clientHeight:480`, `scrollHeight:485`; documento/body/root e controlli restano
entro il viewport. È una misura del candidato precedente, non di questa patch.

### Elemento e correzione

L'elemento individuato nel sorgente è **`.status-heading .control-tooltip`**, il
tooltip del pulsante «Chiudi pannello stato», non il compositore. Sotto 1180 px
la griglia assegna a Stato una riga inferiore di 78 px. Il suo pulsante resta alto
44 px e il tooltip ereditava `top:calc(100% + 8px)`: veniva quindi disposto sotto
il pulsante. Nelle finestre alte fino a 520 px il margine interno inferiore del
layout è 10 px. Con linea da 21 px, padding e bordi del tooltip, il suo bordo
inferiore supera la shell di circa 5–6 px (arrotondamenti dipendenti dalla scala).
`visibility:hidden` conserva il riquadro e il suo contributo allo scroll: questo
spiega perché il controllo fosse raggiungibile ma la shell risultasse più alta.
La misura del singolo tooltip su Windows resta da confermare con la diagnostica
aggiunta; il cloud non ha raggiunto la finestra per acquisirla.

La patch cambia soltanto l'ancoraggio del tooltip nella disposizione con Stato in
basso: **sopra il pulsante**, con allineamento al suo bordo sinistro. Il riquadro
può così restare interamente nel viewport anche quando viene mostrato. Nessun
nuovo `overflow:hidden`, font ridotto, contenuto rimosso, altezza o tolleranza
alterata. Griglia, riga Stato, compositore, consenso e avviso costi restano
invariati. Alla larghezza con Stato laterale l'ancoraggio esistente resta valido.

### Regressione e diagnostica solo nei test

- `assertSingleViewport` e il suo file **immutati rispetto alla baseline**.
  Le chiamate E2E sono avvolte soltanto per allegare geometria in caso di errore,
  poi rilanciano lo stesso errore.
- Nei quattro viewport **720×480, 853×573, 1024×688, 1280×860** restano i controlli
  rigorosi con Stato chiuso, Stato aperto, menu e cronologia lunga interna. Si
  ricontrolla il layout anche dopo la chiusura di Stato.
- Nuova regressione sul tooltip: riquadro completo entro il viewport prima
  dell'hover, poi visibile e completo su hover e su focus indipendente dalla
  posizione del puntatore. A ogni fase resta la verifica globale e dei controlli.
- Gli allegati `layout-diagnostic` / `status-tooltip-diagnostic` riportano solo
  selettori fissi, rettangoli, scroll e proprietà CSS della griglia, dello Stato
  e del compositore. Nessuna lettura di testi, valori input, attributi, URL,
  conversazioni o dati account. Utili per confrontare il bordo del tooltip con
  quello della shell se Windows segnala ancora overflow.
- Annullamento offline, menu iniziale, consenso, streaming e probe fullscreen/F11
  sono conservati. Nessuna modifica a OAuth/Responses/main/preload/sicurezza,
  Mini 3D, asset, font, Blender, Holo o voce. Nessuna richiesta AI reale.

### Esiti effettivi di questa patch

| Controllo | Esito |
| --- | --- |
| check, lint, typecheck | PASS |
| `npm test` | **93/93 PASS, 8 file, zero skip** |
| build, check preload | PASS (preload verificato in VM con mock Electron) |
| sintassi bundle main/preload, diff check e confini | PASS |
| Electron E2E Linux | **BLOCKED prima della prima finestra** |
| Geometria dei quattro viewport e nuovo E2E Windows | **NON ESEGUITI** |

Tentativo effettivo: `DEBUG=pw:browser npm run test:desktop`, exit 1. Electron:

```text
FATAL:sandbox/linux/suid/client/setuid_sandbox_host.cc:172
The SUID sandbox helper binary was found, but is not configured correctly.
Rather than run without sandboxing I'm aborting now.
Process failed to launch! (SIGTRAP)
```

Nessuna modifica a sandbox/permessi SUID per aggirare il blocco. Nessuno
screenshot o PASS geometrico del candidato inventato; i test jsdom non provano
l'assenza di overflow reale. La verifica locale rimane necessaria.

### Ripetizione Windows

Da checkout pulito, senza login o richieste AI:

```powershell
cd D:\WORK\NEYDRA
git status --short
git switch feat/desktop-mini-interface
git pull --ff-only origin feat/desktop-mini-interface
git rev-parse HEAD
npm.cmd run check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run check:preload
npm.cmd run test:desktop
```

Fermarsi al primo exit code non zero. L'E2E esegue automaticamente le quattro
dimensioni CSS con Stato aperto/chiuso, tooltip hover/focus, menu e controlli
fullscreen/F11. In caso di errore conservare l'allegato geometrico JSON in
`apps/desktop/test-results`, senza sostituire le asserzioni. Dopo l'E2E, verificare
con `npm.cmd start` finestra/fullscreen e scale Windows 100%, 125%, 150%, tooltip
intero, compositore/consenso/costi leggibili e F11 fisico. Il reflow CSS non
certifica il DPI del sistema operativo. **PR #10 sempre DRAFT**, in attesa di
convalida Windows del proprietario; niente merge o release.
