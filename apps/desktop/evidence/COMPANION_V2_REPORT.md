# Companion V2 — report di verifica

> Follow-up corrente: [geometria DPI e JSON persistente](#follow-up-windows-dpi-e-json-persistente).
> La precedente sezione 72 DIP conserva il report storico e le asserzioni poi corrette.
> Gli esiti delle sezioni iniziali descrivono il candidato V2 originale.

28 ottobre 2026. Branch `feat/desktop-mini-interface`, PR #10 **DRAFT**.
Baseline `4d5911111098007c0b358b0cdeb0f8b891ca9f4a` verificata dal proprietario su
Windows: check/lint/typecheck/build, **113/113 unit, 2/2 E2E, due preload** e mouse
fisico. Il menu nativo Apri/Esci funzionava, ma l'esperienza non era approvata.
Questi esiti precedono V2 e non ne provano la resa.

## Implementazione

Evento nativo `minimize`, icona in fullscreen e comando laterale convergono sullo
stesso controller. Gestiti main già minimizzato, errore di creazione, ripristino
durante creazione pendente e ulteriore minimize prima del suo termine. Main,
servizio e ChatPanel rimangono vivi. F11 non cambia; il ritorno recupera anche
l'intento fullscreen se l'OS lo ha lasciato mentre il main era nascosto.

Menu Windows rimosso. Due finestre satellite isolate da 64×64 DIP circondano il
core da 120×120 DIP, senza ridimensionarlo. Il main sceglie posizioni contenute
nella work area reale; niente superfici trasparenti estese. Overlay riusati,
creazioni serializzate e cancellazioni tardive senza duplicati; blur esterno,
Escape, drag, restore e cambi display chiudono il menu. Le azioni dei satelliti
sono assegnate dal main e accettate solo a menu aperto. Animazione di 190/225 ms e
fade di chiusura 150 ms; motion ridotto rispettato.

Nuovi file principali: `main/companion-host.ts`, `main/orbit-controller.ts`,
`shared/orbit-contracts.ts`, `preload/orbit.ts`, `src/orbit/*`. Aggiornati controller,
preload/controlli/CSS companion, icona App, build e test. Nessuna libreria aggiunta.
Main/companion/orbit hanno tre preload e partizioni separate; ai satelliti arriva
solo un enum ruolo e la visibilità. CSP e preferenze di sicurezza riutilizzate
immutate; permessi e IPC validati per finestra/frame/origine.

## Diagnosi della deformazione riferita

Nel sorgente V1 non c'erano scale CSS o resize nel drag, ma il pulsante dipendeva
dalle percentuali del viewport, conservava l'aspetto nativo di un button e aveva
un indicatore di focus esterno al bordo. Senza misura del mouse fisico Windows
**non è possibile attribuire con certezza la deformazione a una di queste cause
o al cambio DPI/rendering trasparente**.

V2 elimina queste variabili: min/max native 120×120, corpo CSS 112×112 a (4,4),
`appearance:none`, focus interno, nessun transform/scale sul core e nessun resize
per aprire il menu. Drag soltanto posizionale. L'E2E registra native bounds,
content bounds, scala display, work area, DPR, viewport, capture e rettangolo/stile
del core nelle fasi idle/hover/pressione/drag/rilascio/menu. In errore allega
`companion-v2-geometry`, senza dati chat.

Un test manuale opt-in di 45 secondi in `tests/manual/companion-physical.mjs`
permette di raccogliere gli stessi dati con **cursore fisico**, senza sostituzioni,
richieste AI o screenshot del desktop. Qui ne è verificata solo la sintassi/lint;
non è stato eseguito su Windows. La stabilità fisica e la qualità visiva rimangono
un gate del proprietario, anche se l'E2E geometrico dovesse passare.

## Esiti effettivi cloud Linux

| Controllo | Esito |
| --- | --- |
| check, lint, typecheck | PASS, zero warning lint |
| unit/renderer | **125/125 PASS, 13 file, zero skip** |
| build main, 3 preload, 3 renderer | PASS |
| check preload | PASS per tutti i bundle, VM con mock Electron |
| sintassi CJS e diagnostica manuale | PASS |
| discovery Playwright | 2 test |
| Electron E2E | **BLOCKED prima della prima finestra**, entrambi i test |
| V2 GUI, mouse fisico, animazione, DPI e Windows | **NON ESEGUITI** |

Comando tentato: `DEBUG=pw:browser npm run test:desktop`, exit 1:

```text
FATAL:sandbox/linux/suid/client/setuid_sandbox_host.cc:172
The SUID sandbox helper binary was found, but is not configured correctly.
Rather than run without sandboxing I'm aborting now.
Process failed to launch! (SIGTRAP)
```

Nessun --no-sandbox, SUID alterato o elevazione. Nessun PASS Windows, cattura GUI
o conferma della resa animata inventati.

Test aggiunti/estesi: native minimize e main già minimizzato, creazione annullata
seguita da altro minimize, icona fullscreen, ripristino fullscreen dopo intervento
OS, stessa sessione, serializzazione e cleanup anche con satelliti, blur tra
controlli e verso desktop, Escape/drag senza quit, 36 combinazioni di bordi/angoli
e dimensioni logiche, gap fra monitor, permessi/DTO/origini/ruoli, navigazione,
assenza di azioni al solo hover e doppia attivazione bloccata.

L'E2E immersivo e `assertSingleViewport` sono **identici alla baseline**. Quello
companion usa ora i veri controlli orbitanti, senza simulare menu o callback
native. Soltanto il cursore OS è sostituito per il drag CDP: non attesta il mouse
fisico. La prova di minimizzazione usa `BrowserWindow.minimize()` e il suo evento,
non il controller direttamente; il clic sul vero `_` resta verifica locale.

Diff vuoto per OAuth/Responses, backend chat, consenso/ChatPanel, CSP/security.ts,
politica sessioni, handler F11 runtime, CSS immersivo, font, dipendenze/lockfile e
asset Mini/Blender/Holo/voce. Nessuna cancellazione di file del proprietario,
richiesta AI reale, login, merge o release.

[Architettura, comandi PowerShell e checklist Windows](../../../docs/NEYDRA_MINI_COMPANION_V2.md).
La PR #10 resta **DRAFT**, con approvazione visiva V2 e mouse fisico aperti.

## Follow-up Windows: dimensioni native dei satelliti

Partenza `5dfc375a03bbe69e04e089070c8604b7643648f5`, stesso branch e PR DRAFT.
Il proprietario ha verificato su Windows check/lint/typecheck, **125/125 unit**,
build e tre preload PASS; **E2E immersivo PASS**, companion FAIL su bounds nativi
**65×65 anziché 64×64** all'apertura dei satelliti. Non è un PASS E2E completo.

### Evidenza e causa delimitata

È stata letta la [issue Electron #23200](https://github.com/electron/electron/issues/23200)
e i suoi commenti: riguarda Electron **8.2.3 / Windows 10**, con un minimo riferito
di 65 px per finestre trasparenti. Il commento finale la chiude per versione non
più supportata, **non per una correzione dimostrata**. Un commento cita monitor
scalati. Non si applica il workaround di mascherare/tagliare la finestra.

Il repository usa Electron **45.1.0**. L'osservazione Windows del proprietario è
compatibile con quel precedente, ma senza content bounds, scala e DPR non prova
la stessa causa interna nella versione corrente. Il difetto verificabile nel
sorgente era usare **64 richiesti** per posizioni e bordi, ignorando la misura
nativa effettiva di 65 riportata dal test. Il CSS con inset fisso 8 non centrava
esattamente il cerchio se il viewport differiva dalla richiesta.

### Correzione reale

- Contenitori satellite richiesti da **72×72 DIP**, con min/max 72 in entrambe le
  direzioni. Il core e il suo renderer restano **120×120 / 112×112**, invariati.
- Cerchi satellite ancora **48×48**, centrati tramite `calc(50% - 24px)`; inset
  esatto 12 a viewport 72. Animazione, icone e controlli non cambiano.
- Ogni porta satellite espone al solo controller main `getBounds()`. Il layout
  usa le dimensioni reali separate dei due satelliti dopo caricamento e dopo il
  posizionamento; se il DPI le cambia, massimo una ricalcolazione, mentre nascosti.
- Work area e collisioni usano i rettangoli nativi effettivi: entrambi devono
  stare nella stessa area del core, senza sovrapporsi fra loro **o al core**.
  Restano 4 DIP di separazione fra superfici native; nessuna tolleranza di misura.
  Anche i candidati diagonali che intercetterebbero il core vengono esclusi;
  raggio 106 e posizione/dimensione del core restano invariati.
- Controllo finale dopo comparsa e su eventi nativi move/resize. Se una modifica
  tardiva rende la geometria non sicura, il menu si chiude; nessun clipping,
  ciclo di retry, resize forzato del core o azione AI.

### Test e diagnostica

Aggiornati i casi ai bordi/angoli per 72 DIP e per la collisione con il core.
Nuove regressioni con dimensioni native sintetiche diverse e non quadrate,
cambio di dimensione dopo lo spostamento, ricalcolo limitato, misura impossibile
e chiusura su un successivo evento OS fuori work area. Non si assume che la misura
effettiva sia sempre uguale a quella richiesta.

L'E2E richiede **esattamente 72×72** sia nativi sia di contenuto, **48×48 a (12,12)**
per i cerchi e **120×120** per il core. Nessun epsilon o timeout aumentato.
Per misurare il centro a riposo attende la conclusione delle effettive animazioni
finite, senza un ritardo fisso. Bordi e collisioni vengono verificati con i bounds
misurati, non sommando una costante 72.

Il nuovo helper solo test `helpers/companion-geometry.ts` conserva le precedenti
misure e aggiunge content bounds e scala display per ciascun satellite, DPR e
viewport dei renderer satellite, rettangolo del controllo e versione runtime.
Un'ultima raccolta viene tentata anche quando l'asserzione fallisce, includendo
satelliti nascosti se il layout è stato rifiutato. L'allegato resta
`companion-v2-geometry`. Anche il test manuale con cursore fisico raccoglie ora
content bounds/scala/DPR dei satelliti. Nessun testo, account, token, URL o
screenshot desktop viene raccolto. Se Windows misurasse ancora una dimensione
diversa, l'asserzione deve fallire e i dati permetteranno di indagare il DPI.

### Verifiche effettive del follow-up

| Controllo | Esito cloud |
| --- | --- |
| check, lint, typecheck | PASS, zero warning |
| unit/renderer | **128/128 PASS, 13 file, zero skip** |
| build e tre preload in VM | PASS |
| sintassi quattro bundle CJS e diagnostica manuale | PASS |
| diff check e percorsi protetti | PASS |
| discovery Playwright | 2 test |
| Electron E2E | **BLOCKED prima della prima finestra**, entrambi |
| Nuovi bounds/centratura/mouse/DPI GUI Windows | **NON ESEGUITI** |

`DEBUG=pw:browser npm run test:desktop` eseguito dopo la build, exit 1:
`setuid_sandbox_host.cc:172`, helper SUID non configurato / SIGTRAP. Nessuna
modifica alle protezioni, --no-sandbox o elevazione. Non è stata acquisita nuova
geometria Windows o una cattura GUI nel cloud.

Diff vuoto per interfaccia immersiva, minimizzazione/controller companion,
fullscreen/F11, OAuth/ChatGPT/backend/consenso, core CSS, preload/IPC/CSP, font,
dipendenze e asset Mini/Blender/Holo/voce. L'host cambia soltanto per leggere i
bounds dei satelliti e reagire ai loro eventi geometrici. E2E immersivo e
`assertSingleViewport` invariati. Nessun file personale o screenshot cancellato;
nessuna richiesta AI, login, merge o release.

### Ripetizione Windows

Chiudere altre istanze NEYDRA, poi da checkout pulito, fermandosi al primo errore:

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

Per isolare il companion: `npm.cmd run test:desktop -- --grep "companion lifecycle V2"`.
Verificare a 100/125/150%, angoli/bordi/taskbar e monitor negativi che contenitori
72, cerchi 48 centrati e core 120 siano completi, separati e nella work area.
Conservare l'allegato geometrico se nativo/contenuto/DPR divergono, senza cambiare
l'atteso. Per il mouse fisico è disponibile la [diagnostica opt-in](../../../docs/NEYDRA_MINI_COMPANION_V2.md#diagnostica-facoltativa-con-mouse-fisico).
**Nuovo E2E Windows da eseguire dal proprietario; PR #10 sempre DRAFT.**


## Follow-up Windows: DPI e JSON persistente

Baseline richiesta `c965021b6cd0bb87c3debcb21ca6ab6c47bfbca6`.
Il proprietario ha verificato **128/128 unit, check/lint/typecheck/build, tre
preload ed E2E immersivo PASS**; companion FAIL, satellite **72×73 nativi** con
richiesta 72×72. Non erano disponibili JSON autonomi sotto test-results.

### Diagnosi e confini della correzione

La premessa errata era richiedere nell'E2E identità fra richiesta, `getBounds`,
`getContentBounds` e viewport renderer. La misura Windows dimostra la divergenza
nativa; non dimostra se provenga da arrotondamento frameless, conversione DPI o
altro. La issue storica Electron non certifica la causa nella versione 45.1.0.
Mancano ancora le misure Windows di contenuto, scala e DPR: nuova diagnosi
interna OS sospesa fino al JSON del proprietario.

**Nessuna modifica al codice applicativo.** Constructor/min/max restano 72×72,
core 120, controlli 48, CSS con centratura percentuale e controller che misura
separatamente ogni satellite. Questi ultimi già gestiscono rettangoli non
quadrati, work area e collisioni reali. Aggiunta regressione per l'esatto caso
72×73 ai bordi/angoli su area con coordinate negative.

L'E2E non sostituisce l'atteso con 73 o una tolleranza. Le proprietà garantite
sono verificate così:

| Proprietà | Verifica |
| --- | --- |
| Richiesta satellite 72×72 e vincoli fissi | test host esistente esatto; costante invariata |
| Core nativo/contenuto 120×120, corpo 112×112 | asserzioni esatte conservate |
| Satellite visibile | 48×48 CSS, raggio 50%, centro esatto nel viewport misurato |
| Animazione a riposo | conclusione effettiva; transform none o matrice identità esatta |
| Contenuto e bordi | contenuto dentro i bounds, bounds reali dentro work area, nessuna collisione fra finestre/core |
| Click/focus | abilitato, opacity 1, hit test centro, outline non tagliato; attivazioni e tastiera preesistenti |
| Stabilità | uguaglianza esatta di native/content bounds, scala, viewport/DPR e rect CSS durante hover/Tab |

Min/max nativi sono diagnostica e non equivalgono a constructor options garantite:
anche i getter possono subire la conversione dell'OS. Bounds/content DIP e
viewport CSS sono misure distinte: non si impone un'identità fra spazi di misura.
Nessun aumento delle dimensioni, epsilon, timeout, clipping o resize forzato.

### Persistenza diagnostica verificata

Il precedente attachment con body in memoria non garantiva un file autonomo con
reporter list. Il nuovo helper scrive esplicitamente
`testInfo.outputPath('companion-v2-geometry.json')` con mkdir/writeFile e allega
poi il path. Nel tentativo cloud il fallimento del launch ha mostrato che anche
un `catch` esterno può essere bypassato dal runner: il salvataggio è quindi nel
**teardown di una fixture**, attiva prima del launch, per ogni esito inatteso.
Il catch conserva soltanto il tentativo di campionamento finale.

Un vero subprocess Playwright senza Electron, reporter list, fallisce con
un'asserzione sintetica 73≠72 usando la **stessa fixture**. Il test unitario verifica
exit 1, file rimasto sul disco e JSON esatto. Una seconda regressione verifica
scrittura prima dell'attach e conservazione del file se l'attach fallisce.
Le directory temporanee appartengono a questi test e vengono ripulite; nessun
file del proprietario viene toccato.

**Verifica osservata anche nell'E2E cloud bloccato**: dopo FAIL esistono davvero
`apps/desktop/test-results/companion.e2e.ts-companion-6323a-menu-and-session-continuity/companion-v2-geometry.json`
e la copia sotto `attachments/`. Contenuto `[]`, coerente con nessuna finestra
aperta. Il JSON non dimostra geometria Windows: dimostra persistenza post-FAIL.

La raccolta associa native e renderer tramite ID numerici e aggiunge richiesta,
vincoli effettivi, zoom/resizable e work area/scala per display. Su Windows la
conversione `screen.dipToScreenRect` è etichettata `physicalBounds`: non è una
misura indipendente HWND. Restano bounds/content, viewport/DPR, rettangoli/stili
e runtime. Nessun testo chat, input, dato account, token, URL, errore grezzo o
screenshot desktop nel JSON.

### Risultati effettivi

- check, lint (zero warning), typecheck: **PASS**.
- unit/renderer/diagnostica: **135/135 PASS**, 15 file, zero skip.
- build main/tre renderer e verifica strutturale **tre preload PASS** (VM mock,
  non prova runtime sandbox Windows).
- Electron E2E: **entrambi BLOCKED prima della prima finestra**, exit 1,
  `setuid_sandbox_host.cc:172`, SUID Linux non configurato / SIGTRAP.
  Nessun --no-sandbox, chmod, elevazione o protezione ridotta.
- JSON persistente post-FAIL: **PASS** con reporter list, test sintetico e
  percorso reale del companion bloccato; nessuna misura GUI inventata.
- Nuovo E2E Windows, resa fisica, DPI e multi-monitor: **NON ESEGUITI qui**.

Minimizzazione, F11, menu/tastiera/drag/Escape/recupero/continuità restano testati
nei percorsi precedenti, non sostituiti. Diff applicativo/preload/IPC/CSP/renderer,
E2E immersivo e assertSingleViewport vuoto. Nessun OAuth/Responses/consenso, asset
Mini/Blender/Holo/voce, dipendenza, login o richiesta AI modificati; niente merge
o release. PR #10 sempre **DRAFT**.

### Procedura Windows e recupero JSON

Chiudere altre istanze NEYDRA. Conservare i risultati precedenti prima di un nuovo
run (Playwright pulisce il suo output), senza usare git clean/reset sui file locali.
Fermarsi al primo errore nei controlli, poi raccogliere la diagnostica se E2E fallisce:

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
Get-ChildItem .\apps\desktop\test-results -Recurse -File -Filter companion-v2-geometry.json |
  Select-Object FullName, Length
Get-ChildItem .\apps\desktop\test-results -Recurse -File -Filter companion-v2-geometry.json |
  ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw }
```

Per isolare companion: `npm.cmd run test:desktop -- --grep "companion lifecycle V2"`.
Ripetere a Windows 100%, 125%, 150%, bordi/taskbar e monitor diversi/negativi;
confrontare richiesta, bounds/content, viewport, scala/DPR, stabilità e controlli
cliccabili. Se fallisce conservare il JSON prima di ripetere, insieme a SHA ed
esiti osservati. La causa OS resta da stabilire dalle misure. Nessun login o invio AI.
