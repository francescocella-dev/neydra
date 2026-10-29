# NEYDRA — correzioni Windows e Island aderente al bordo superiore

29 ottobre 2026. PR #10 DRAFT, branch feat/desktop-mini-interface.
Partenza verificata: `d5df904257e466fe55ed1ab22322b58f6c0a5fce`, working tree pulito.
Nessun altro branch, reset/clean, cancellazione di file personali o evidence.

## Evidenza Windows del proprietario

Sul baseline: 170/170 offline e immersivo PASS; entrambi i companion FAIL sul
radio controllato (`locator.check: Clicking the checkbox did not change its
state`). Nella prova fisica Island: `Cannot read properties of null (reading
'isDestroyed')`, stack alive → callback BrowserWindow → reduce → companionCommand.
Questi risultati non certificavano l'avvio Island né il suo design visivo.

## Studio Coucou prima dell'implementazione

Letti direttamente i sei sorgenti Windows richiesti, LICENSE e LICENSE-ASSETS
alla revisione **7b228f1e6529f16623dd859d9e7f33966816f19c**.
[Analisi tecnica, link fissati, scelte adattate e differenze](../../../docs/NEYDRA_ISLAND_COUCOU_STUDY.md).
Non ci siamo fermati al README. Nessuna porzione Rust/TS/CSS Coucou incorporata,
nessun marchio, personaggio, icona, suono o artwork riusato. Il codice MIT di
Coucou è © 2026 Louis Raillé; gli asset sono esclusi. Implementazione originale
Electron/CSS NEYDRA, nessuna migrazione o nuova dipendenza.

## Bug A — contenuti nativi scollegati

Il vecchio alive controllava solo BrowserWindow.isDestroyed prima di dereferenziare
window.webContents.isDestroyed: il getter può essere null mentre il flag della
finestra è ancora false. Inoltre varie operazioni rileggevano il getter dopo un
primo controllo, e le sonde E2E facevano la stessa assunzione.

companion-host ora usa liveContents: scarta host dismessi, finestre in chiusura,
BrowserWindow distrutte, contenuti null o distrutti. Ogni operazione invio/
autorizzazione acquisisce uno snapshot e lo usa senza rileggere il getter. Setup,
listener e handshake tengono un riferimento valido ai contenuti. Una creazione
senza contenuti viene pulita senza nascondere il main e senza timeout residui.

Quando hide/blur arrivano con contenuti scollegati, il recupero idempotente
stacca il core e ripristina prima il main. La pulizia del guscio viene accodata
in microtask, perché il callback può essere già sullo stack nativo destroy/close.
Il test di cambio modalità riproduce null e blur prima della distruzione del
vecchio core: una sola destroy, nessun ripristino improprio del main durante lo
switch. Restano i guard di quit, timer, figli nascosti e callback rientranti.

Invii difettosi a finestre realmente vive continuano a propagare errori autentici:
nessun catch vuoto aggiunto. Solo il precedente errore noto Object has been
destroyed viene filtrato quando accompagnato da una destinazione realmente morta
o scollegata. Le sonde native/geometriche sono state protette anche dal null;
la sonda lifecycle distingue ora contentsDetached da contentsDestroyed, senza
raccogliere testi, URL nei record, account, token o screenshot desktop.

Le regressioni dimostrano il difetto di dereferenziazione e la sicurezza della
correzione offline. **Non abbiamo osservato qui la sequenza C++ Windows esatta
che produce il getter null**, né attribuiamo questo crash al precedente drift DPI.
La conferma sul PC del proprietario resta obbligatoria.

## Bug B — radio e salvataggio asincrono

checked dipendeva dal valore restituito dalla Promise di scrittura: React
ripristinava la scelta vecchia alla fine dell'evento nativo, prima che il disco
rispondesse. Playwright osservava correttamente un radio non cambiato.

ReductionSettings separa selection provvisoria e preference confermata.
onChange aggiorna subito selection, poi attende IPC/disco. Nel frattempo lo stato
è «Scelta provvisoria. Salvataggio in corso…» e un lock impedisce invii duplicati.
La conferma applica la preferenza validata del main; errore o rifiuto IPC ripiega
su circle e mostra save-failed. Salvataggio atomico/serializzato, schema strict,
file e autorizzazioni main-only invariati. Nessun path o coordinate dal renderer.

Tre regressioni tengono la Promise realmente pendente: conferma, fallback,
eccezione. Verificano checked immediatamente dopo fireEvent.click, senza waitFor
o mutazioni DOM per quella verifica, prima di risolvere la Promise. Coprono stato
provvisorio, disabilitazione semantica del fieldset, assenza di doppio invio e
conferma/rollback. Gli E2E conservano locator.check normale, senza force.

## Nuova Island e geometria

- Mini circolare invariato: finestra 120×120 DIP, corpo 112×112, margine 24 DIP
  in basso a destra della workArea.
- Island: finestra richiesta ancora 240×64 DIP, controllo alto 60 CSS px e largo
  quanto il viewport effettivo, x/y 0, angoli superiori retti/inferiori 20 px.
  Ancoraggio alla y della workArea e al suo centro orizzontale; niente gap di 8
  DIP o vecchio inset di 4 px. Non assumiamo dimensioni native OS sempre esatte:
  la larghezza visiva riempie il viewport misurato e la stabilità resta esatta.
- Nero/grafite, Oxanium locale, N in piccolo riquadro, marchio leggibile e accento
  arancio inferiore. Colori/bordo/accento per hover, focus, pressione e menu aperto;
  transizioni CSS reversibili di 170 ms e reduced motion. Nessun movimento del
  core, resize, animazione nativa o timer nuovo.
- WorkArea del display scelto da screen.getDisplayMatching sui bounds/normal
  bounds main; stessa chiave ID/scala/area/modalità e controllo coordinate prima
  di setPosition. Nessun effetto da moved del core o loop correttivo. Menu sotto
  la Island: due satelliti piccoli separati, stessa geometria reale, hit target,
  collisioni, centratura a quantizzazione fisica e animazioni esistenti.
- Nessuna wake strip invisibile, espansione, polling cursore, drag o superficie
  trasparente grande. Movable false e tutti i vecchi comandi drag ancora assenti.

Gli E2E aggiornano le proprietà di sagoma secondo il nuovo design e aggiungono
aderenza visiva al bordo workArea, menu interamente sotto il core e reduced
motion. Non aumentano tolleranze: baseline esatta native/content/viewport/DPR,
cinque cicli e dieci aperture restano, così come no-drag, focus, tastiera/Escape,
core.close, stessa bozza/DOM, Exit e preferenza dopo riavvio del processo isolato.
Immersivo/F11 e assertSingleViewport non modificati.

## Verifiche realmente eseguite

| Controllo | Esito |
| --- | --- |
| check | PASS |
| lint, zero warning | PASS |
| typecheck | PASS |
| suite offline completa | **183/183 PASS, 19 file, zero skip** |
| build main + tre preload + tre renderer | PASS |
| check dei tre preload | PASS, VM strutturale/mock; non prova sandbox Windows |
| git diff --check | PASS |
| discovery Playwright | 3 test: immersivo, circle, island |
| Electron E2E dopo build | **3 FAIL al launch / BLOCKED prima della prima finestra**, sandbox Linux SUID/SIGTRAP |
| Screenshot/registrazione nuova Island | NON OTTENUTI: Chromium con sandbox attivo bloccato anch'esso dal runtime |
| Windows fisico/GUI/nuovo design | NON ESEGUITI |

Il primo comando senza permessi runtime per socket/processi aveva 179/182 PASS:
due loopback sintetici bloccati e spawnSync Playwright EPERM. Stesso codice e
asserzioni, con accesso runtime necessario ai test locali, hanno completato la
suite; dopo l'ultima regressione lifecycle il risultato finale è 183/183. Nessun
login, scambio token reale o chiamata di inferenza. Nessun test saltato o adattato
per eludere il blocco. CSP, sandbox Electron e flag di lancio restano invariati.

Tentativo E2E da apps/desktop:

```sh
DEBUG=pw:browser npm run test:desktop -- --output=test-results/island-correction-1793302075 --timeout=90000
```

Log locale: apps/desktop/test-results/island-correction-1793302075.log.
FATAL setuid_sandbox_host.cc:172: helper SUID non configurato; exit 1 del runner,
SIGTRAP dei processi Electron. Nessun chmod, sudo, --no-sandbox o altre deroghe.
Il tentativo Chromium per una cattura è anch'esso bloccato: sotto restrizioni
iniziali setsockopt EPERM/SIGTRAP, poi helper SUID/SIGABRT. Nessuna cattura fittizia.

Verificata la presenza di **due file JSON autonomi**, oltre agli attachment:

```text
apps/desktop/test-results/island-correction-1793302075/
  companion.e2e.ts-companion-ddc0d-ry-and-persisted-preference/companion-v2-geometry.json
  companion.e2e.ts-companion-8d203-ry-and-persisted-preference/companion-v2-geometry.json
```

Entrambi contengono [] perché non esisteva ancora una finestra da misurare. Il
test offline che esegue un vero Playwright FAIL sintetico verifica anche un JSON
non vuoto persistente con reporter list. Le prove precedenti restano presenti.

Checklist React applicata: scelta urgente nel gestore evento, conferma separata,
nessun fetch/salvataggio nel render, cleanup dell'effetto, guard unmount e lock,
radio/fieldset nativi e messaggio di stato accessibile. Nessuna libreria nuova.

## File e confini

Produzione: companion-host.ts, companion-placement.ts, companion/style.css,
ReductionSettings.tsx. Test: companion-host, mini-ui, companion-placement,
companion.e2e e tre helper diagnostici. Documenti: questo report, studio Coucou,
specifica riduzioni; il vecchio report resta storico.

Invariati: OAuth/Responses/ChatGPT, consenso, voce, Holo/Blender/asset Mini,
renderer immersivo, F11/fullscreen, tre preload e loro API, schema/file della
preferenza, CSP/sandbox/sessioni e autorizzazioni IPC. Nessuna richiesta AI,
merge o release. Nessun file non tracciato precedente cancellato.

## Gate Windows e visivo

[Comandi PowerShell e checklist](../../../docs/NEYDRA_REDUCTION_MODES.md#prova-windows).
Attesi **183/183 offline e 3/3 E2E**, da verificare sul nuovo SHA. Dopo questi:
prova fisica dei due layout a 100/125/150%, taskbar anche superiore/laterale,
monitor con coordinate negative/cambio risoluzione, menu ripetuto dopo gesti del
mouse, focus e tastiera, nessun dialogo Electron di eccezione, chiusura nativa,
stessa bozza/transcript/modello/connessione, uscita senza recupero indesiderato.
Verificare selettore immediato, stato provvisorio/conferma e persistenza riavvio.

Island richiede **approvazione visiva separata**: contatto col bordo superiore
della workArea, proporzioni/contrasto, angoli/bordo/arancio, hover/focus/pressione,
reduced motion e menu sotto senza clipping. Se si allega una cattura locale,
ritagliare soltanto Island/Apri/Esci senza contenuti personali del desktop/chat.
**Nessun nuovo E2E Windows o giudizio visivo PASS dichiarato da questo cloud.**
