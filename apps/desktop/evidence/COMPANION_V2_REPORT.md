# Companion V2 — report di verifica

> Follow-up corrente: [riuso senza drift e probe nativo](#follow-up-windows-riuso-senza-drift).
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


## Follow-up Windows: riuso senza drift

29 ottobre 2026. Baseline pubblicata `b7385921ad1a10d8a252cbb949f016ec1ab430df`,
PR #10 DRAFT. Dopo la disconnessione dell'exec-server l'ambiente è tornato
operativo: HEAD e diff controllati prima di modificare. Recuperati quattro file
modificati e l'helper nativo non tracciato; nessun reset/clean o sovrascrittura di
altri lavori. I test non applicati nella sessione interrotta sono stati completati.

### Evidenza e limite della diagnosi

Il proprietario ha verificato **135/135 unit, check/lint/typecheck/build, tre
preload ed E2E immersivo PASS** su b738592; companion FAIL alla riapertura da
tastiera. Il [commento con le misure reali](https://github.com/francescocella-dev/neydra/pull/10#issuecomment-6483045003)
registra Electron 45.1.0, DPR/scala 1,25, work area 1536×816:

| Fase | Satellite 3 | Satellite 4 | Pulsanti CSS |
| --- | --- | --- | --- |
| Prima apertura/hover | native 73×72; contenuto/viewport 72×72; min/max 72×72 | native 72×73; contenuto/viewport 72×72; min/max 72×72 | 48×48 a (12,12), hit e forma corretti |
| Chiusura | invariato e nascosto | invariato e nascosto | disabilitati/opacity 0 |
| Riapertura tastiera | native/contenuto/viewport 74×72; min/max 73×72 | native/contenuto/viewport 72×74; min/max 72×73 | 48×48, asse lungo a 13,199999809 anziché 13 |

La crescita nativa è reale; lo scostamento CSS è circa 0,25 pixel fisici ed è un
problema distinto. Il core resta esattamente 120×120, corpo 112×112.

Riscontro nel sorgente **v45.1.0**, non soltanto nella issue storica:

- [NativeWindow::SetPosition](https://github.com/electron/electron/blob/v45.1.0/shell/browser/native_window.cc)
  chiama `SetBounds(gfx::Rect(position, GetSize()), animate)`, usando la dimensione
  misurata e senza una guardia per coordinate identiche.
- [NativeWindowViews::SetBounds](https://github.com/electron/electron/blob/v45.1.0/shell/browser/native_window_views.cc)
  aggiorna `SetMaximumSize(bounds.size())` e `SetMinimumSize(bounds.size())` su
  Windows/Linux se `!CanResize()`, poi applica i bounds al widget.

L'app richiamava setPosition a ogni apertura. Rimandare il 73 misurato al setter
spiega perché i getter dei vincoli possano diventare 73 al giro successivo: è un
percorso di feedback concreto nel codice. **Manca però ancora la misura Windows
before/after della singola operazione** per attribuire definitivamente il 74 a
setPosition e non a show/focus o a un evento differito. Nessun mock o prova Linux
può certificare quell'attribuzione su Windows.

### Correzione del runtime

- Core invariato e richiesta satelliti ancora **72×72**, min/max constructor 72.
- Se il core è invariato e i bounds reali precedenti rispettano work area e
  separazione, la coppia viene riutilizzata senza ricalcolare/reinviare posizioni.
  Una dimensione arrotondata non innesca un nuovo centramento orbitale ad ogni apertura.
- Nuovo layout per core spostato, finestra ricreata o geometria non valida. Anche
  allora il setter viene saltato per x/y già uguali al target. Cache invalidata
  sulla ricreazione, work area rivalidata sempre, massimo un ricalcolo come prima.
- `hide()` non ripetuto sui satelliti già nascosti. Show/focus e controlli nativi
  di sicurezza restano attivi; nessun setSize/setBounds correttivo o retry infinito.
- CSS del solo orbit passa a grid pieno viewport con place-items:center. Cerchi
  48, icone, target, outline, keyframe e tempi premium restano invariati.

### Contratto CSS e anti-drift

Il layout deve dichiarare grid/center e il controllo deve restare 48×48 con
raggio 50%, senza scale/traslazioni residue. Il centro è confrontato sia col
viewport integer sia col rettangolo CSS del contenitore raccolto separatamente.
L'errore per asse è espresso in pixel fisici:
`abs(posizione * DPR - (estensione - 48) * DPR / 2) <= 0,5`.
È il limite dell'arrotondamento al pixel più vicino, non ±1 DIP o un epsilon
scelto sul campione. Il calcolo è fatto direttamente nello spazio fisico per
non introdurre cancellazioni numeriche aggiungendo prima metà del diametro.
Il dato reale +0,199999809 CSS a DPR 1,25 rientra in circa 0,25 pixel fisici.
Questo non dimostra la causa raster del dato: è una proprietà di centratura
visiva, insieme al controllo separato dell'intento CSS. Nessuna tolleranza a
forma/dimensione, clipping, bounds, collisioni, work area o crescita nel tempo.

L'E2E esegue **cinque cicli** clic destro/chiusura/Maiusc+F10/Tab/Home/End/Escape:
dieci aperture sulle stesse finestre. Native/content bounds, min/max, zoom,
viewport/DPR e rect CSS sono confrontati **esattamente con la prima apertura**.
La crescita di un solo DIP continua a fallire anche se il centro è visivamente
accettabile. Focus e ritorno al core, hit, hover senza azioni, animazioni finite,
bridge isolati, sessione/bozza, minimizzazione/F11 e recupero sono conservati.

### Probe esclusivamente nei test

`tests/helpers/orbit-native-probe.ts` osserva prima/dopo hide, setPosition,
setBounds, showInactive e focus; eventi move/moved/resize/show/hide/focus/blur.
Per ID registra sequenza, target numerico del move, bounds/content, min/max,
scala, conversione DIP→pixel, visibilità e focus. I metodi originali vengono
chiamati con lo stesso this/argomenti/ritorno. Wrapper/listener sono rimossi alla
fine. Nessun IPC o hook diagnostico nel prodotto, nessun URL/testo/account/token/
header/errore grezzo/screenshot desktop nel JSON.

Le operazioni vengono drenate nei campioni di fase e nel finally, prima del
teardown che salva il JSON persistente. Il test unitario del probe verifica
prima/dopo, eventi, delega, filtro dei dati e ripristino dei descrittori originali.
Se Windows fallisce ancora, la prima variazione nei record before/after/event
consentirà di distinguere setPosition, hide/show e focus. L'assenza di un ulteriore
move nel percorso corretto non è da sola prova retroattiva della causa OS.

### Verifiche effettive

| Controllo | Esito osservato |
| --- | --- |
| check, lint zero warning, typecheck | PASS |
| suite offline | **142/142 PASS, 16 file, zero skip** |
| regressioni mirate controller/host/geometria/probe | **28/28 PASS** |
| build e tre preload strutturali | PASS (VM mock, non prova sandbox Windows) |
| persistenza JSON con reporter list | PASS nel subprocess sintetico e nel FAIL Electron reale |
| Electron E2E dopo build | **2 BLOCKED prima della prima finestra**, SUID Linux / SIGTRAP |
| Nuova GUI Windows, cinque cicli reali e causa OS esatta | **NON ESEGUITI qui** |

La suite sintetica verifica DPR 1/1,25/1,5 e viewport 72×72, 74×72, 72×74, 73×72,
limite esatto mezzo pixel e rifiuto oltre il limite; verifica separatamente che
la crescita nativa continui a fallire. Il controller è provato con un modello
che aggiunge un DIP a ogni move: cinque cicli misti conservano bounds e una sola
chiamata per il posizionamento iniziale. **È un modello di regressione, non una
riproduzione Windows né una misura reale del raster CSS.** Provati anche setter
identici saltati, ricollocazione dopo cambio core, work area e finestre ricreate.

E2E tentato da apps/desktop con
`DEBUG=pw:browser npm run test:desktop -- --output=test-results/cloud-orbit-drift-1793229973338`.
Sandbox sempre attivo. Entrambi falliscono prima delle finestre con
`setuid_sandbox_host.cc:172`. Il JSON autonomo realmente verificato è
`apps/desktop/test-results/cloud-orbit-drift-1793229973338/companion.e2e.ts-companion-6323a-menu-and-session-continuity/companion-v2-geometry.json`,
contenuto `[]` e copia attachments. Nessuna protezione aggirata, nessuna nuova
misura GUI. La cartella di output dedicata evita di riutilizzare l'output standard.

Diff applicativo limitato a orbit-controller, una guardia hide in companion-host
e CSS orbit. Interfaccia immersiva, core, F11, ChatGPT/OAuth/Responses/consenso,
preload/IPC/CSP/sandbox, asset Mini/Blender/Holo/voce e dipendenze invariati.
Nessun git clean/reset, cancellazione di asset/file personali, login, invio AI,
merge o release. PR #10 resta DRAFT, nuovo commit solo dopo i controlli disponibili.

### Windows: nuovo candidato e raccolta

Preservare la diagnostica già fornita. Chiudere NEYDRA, aggiornare il branch senza
reset/clean, verificare SHA e fermarsi al primo errore nei controlli:

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
$orbitOutput = "test-results/orbit-drift-" + [guid]::NewGuid().ToString("N")
npm.cmd run test:desktop --workspace @neydra/desktop -- "--output=$orbitOutput"
Get-ChildItem .\apps\desktop\test-results -Recurse -File -Filter companion-v2-geometry.json |
  Select-Object FullName, Length
```

Il comando workspace inoltra le opzioni direttamente a Playwright; l'output UUID
conserva gli altri risultati. Per isolare companion usare lo stesso comando con
`--grep "companion lifecycle V2"`. Su FAIL condividere il nuovo JSON e SHA: cercare
per ID la prima variazione fra before/after/event di bounds/content/min/max.
Non cambiare asserzioni o dimensioni e non ripetere prima di conservare il file.
Su 2/2 PASS verificare manualmente a 100/125/150%, bordi/taskbar/monitor negativi:
minimize/fullscreen/F11, cinque aperture ripetute, drag fisico, focus, Escape e
Apri/Esci, stessa bozza/sessione. Nessun login o invio AI. **Il PASS Windows e la
causa OS esatta restano gate del proprietario, non risultati del cloud.**
