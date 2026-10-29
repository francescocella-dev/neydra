# NEYDRA — Modalità di riduzione fisse

PR #10 DRAFT, branch `feat/desktop-mini-interface`. Questa specifica sostituisce
il trascinamento libero. Baseline Windows e492b39: 157/157 unit e 2/2 E2E PASS,
ma prova fisica del drag non approvata per drift e menu non utilizzabile.
Il successivo d5df904 ha ottenuto 170/170 offline e immersivo PASS su Windows,
ma i due E2E companion sono falliti sul selettore e la prova fisica Island ha
incontrato webContents null. Il nuovo candidato corregge quei due bug e richiede
una nuova verifica Windows e visiva. [Studio dei sorgenti Coucou](NEYDRA_ISLAND_COUCOU_STUDY.md).

## Due modalità

| Modalità | Finestra richiesta | Controllo visibile | Ancoraggio |
| --- | --- | --- | --- |
| Cerchio Mini (default) | 120×120 DIP | cerchio N 112×112, inset 4 | workArea in basso/destra, margine 24 DIP |
| NEYDRA Island | 240×64 DIP | notch largo quanto il viewport effettivo, alto 60 CSS px, angoli inferiori 20 px | centro orizzontale della workArea, aderente al bordo alto |

Margini ridotti solo se la workArea non contiene il margine intero. Una finestra
che non può entrare interamente lascia NEYDRA aperta. Le dimensioni native
restituite dall'OS vengono misurate: non si assume che Island misuri esattamente
64 DIP in altezza su ogni DPI Windows. Non viene eseguito un resize correttivo.
Il cerchio resta richiesto e verificato a 120×120.

Il notch dark/grafite parte da x/y 0 nel viewport, ha angoli superiori retti,
marchio NEYDRA, dettaglio arancio inferiore e freccia di apertura. Font locale
Oxanium; hover, focus, pressione e menu aperto sono percepibili con transizioni
reversibili, disabilitate da reduced motion. Dimensioni e ancoraggio non animati.
Lo studio reale Coucou ha guidato forma e separazione tra stati/geometria:
nessun codice o asset Coucou è incorporato, nessuna wake strip, espansione,
poll del cursore, suono o funzione agente. Nessun nuovo avatar o asset 3D.

Il main sceglie il monitor con `screen.getDisplayMatching` sui propri bounds,
o normal bounds se minimizzato. Posizione/dimensione del main servono soltanto
alla scelta del monitor: l'ancoraggio è calcolato dalla relativa workArea, che
include le esclusioni della taskbar. Non si usa l'unione dei display.

Il controller conserva la configurazione dell'ancoraggio (modalità, ID display,
scala, workArea). Senza cambi effettivi non reinvia la posizione misurata a
setPosition. Anche quando la configurazione cambia salta coordinate già uguali.
Nessuna reazione di riposizionamento agli eventi moved del core, nessun loop e
nessuna persistenza di coordinate. Cambi monitor, DPI, workArea e risoluzione
richiudono il menu quando necessario e applicano un nuovo ancoraggio.

## Interazioni e isolamento

Movable false, nessuna regione nativa draggable. Pointer capture, RAF di drag,
lettura del cursore OS, stato drag e comandi/metodi dragStart/Move/End/Cancel sono
rimossi da controller, schema IPC, preload e renderer. Gesti del mouse non
spostano la finestra. Il pulsante nativo gestisce click sinistro, Invio e Spazio
una sola volta; clic destro/Maiusc+F10 apre il menu, Escape chiude, Tab e frecce
navigano. Nessun permesso voce o dispositivo nuovo.

Entrambe le modalità usano lo stesso contesto companion isolato e il medesimo
preload ristretto. Il renderer riceve solo la modalità attiva allowlisted. I due
satelliti restano finestre native separate da 72 DIP richiesti, controlli 48 CSS px
e proprio contesto/preload orbit. Tre preload totali, massimo quattro finestre.
Non si espande una grande superficie trasparente per il menu.

Il posizionamento orbitale usa il rettangolo nativo effettivo del core. Per
Island seleziona posizioni sotto la capsula, dentro la workArea e senza
sovrapposizioni col core o tra i satelliti; è verificato anche su aree negative
alle scale sintetiche 100/125/150%. Animazioni orbitali e controlli geometrici
preesistenti sono conservati.

Main e conversazione rimangono vivi. Cambio modalità alla successiva riduzione
ricrea solo il companion e i suoi satelliti, mai il main. L'attesa della preferenza
fa parte della riduzione pendente: restore/quit ne annullano la creazione tardiva.
Il recupero e le protezioni e492b39 per close, webContents distrutti, rientranza,
timer e vera uscita restano attivi. Nessuna send a destinatari morenti o null:
webContents viene acquisito una sola volta e validato prima di ogni operazione.
hide/blur durante una transizione con contenuti scollegati recuperano il main
prima di differire la pulizia del guscio nativo alla microtask successiva.

## Preferenza locale

Impostazioni → **Modalità di riduzione** offre due radio native, scelta corrente,
stato salvataggio/fallback e indicazione «prossima riduzione». Il comando laterale
«Riduci a Mini», `_` nativo e icona in fullscreen usano tutti la scelta salvata.
La preferenza non modifica una finestra già ridotta. Il radio selezionato cambia
durante onChange, prima dell'attesa IPC/disco; lo stato «Scelta provvisoria»
distingue l'attesa dalla conferma. Su errore si torna visivamente a Cerchio Mini,
coerentemente col fallback main, senza invii ripetuti o aggiornamenti DOM forzati.

Unico nuovo file di configurazione, gestito dal main nella userData Electron:
`reduction-preference.json`:

```json
{"version":1,"mode":"circle"}
```

L'altro valore ammesso è `island`. Nessuna coordinata, conversazione, account,
modello, token o altra preferenza. Lettura limitata a 1024 byte, schema strict
versionato; file mancante → circle/default, corrotto/extra/campi mancanti/errore
lettura → circle/read-failed senza riscrivere il file. Le scritture sono
serializzate e atomiche tramite temporaneo proprio con nome UUID + rename.

Su errore di scrittura l'app usa circle per la sessione e segnala save-failed,
senza crash o retry automatici. L'ultimo file valido non viene cancellato: se
non è possibile scrivere, al riavvio viene riletta l'ultima scelta salvata, non
si promette di aver persistito il fallback. Si rimuove solo il temporaneo creato
da quella scrittura. La UI descrive questo limite.

Il nuovo canale get/set di preferenza accetta soltanto il renderer principale
con ID, origine e frame esatti. DTO strict e risultati validati anche nel preload;
nessun percorso di file o IPC generico esposto. Companion/orbit non possono
leggere o scrivere la preferenza e non ricevono lo stato account. Restano sandbox,
CSP, sessioni separate e divieti di rete/dispositivi invariati.

## Prova Windows

Salvare gli esiti precedenti e chiudere altre istanze. Non usare reset/clean.
Da root, fermarsi al primo errore nei controlli:

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
$fixedOutput = "test-results/fixed-modes-" + [guid]::NewGuid().ToString("N")
npm.cmd run test:desktop --workspace @neydra/desktop -- "--output=$fixedOutput" "--timeout=90000"
Get-ChildItem (Join-Path .\apps\desktop $fixedOutput) -Recurse -File -Filter companion-v2-geometry.json |
  Select-Object FullName, Length
```

Attesi **3 test**: immersivo, circle, island. Ogni companion esegue cinque cicli /
dieci aperture, gesti del mouse seguiti da menu, confronti esatti delle geometrie,
chiusura nativa, focus e stessa bozza/DOM, nuova creazione e vera uscita. Poi
riavvia il processo sullo stesso profilo isolato e verifica preferenza/controlli.
I profili E2E sotto output usano `--user-data-dir`; il test verifica il percorso
prima di salvare. Non sovrascrivono la preferenza personale del normale avvio.
JSON persistente per ciascun companion su FAIL; [] indica nessuna misura raccolta.

Dopo 3/3 PASS: `npm.cmd start`, senza login o invio AI. Per **entrambe** le scelte:

1. Scegliere la modalità in Impostazioni, attendere il messaggio di salvataggio;
   ridurre con `_`, menu e icona fullscreen. Controllare posizione fissa, margine
   dalla taskbar e accessibilità di Apri/Esci.
2. Provare più gesti fisici del mouse, poi clic destro, tastiera, Escape e altre
   dieci aperture: nessuno spostamento, crescita, menu inutilizzabile o furto focus.
3. Ripristinare la stessa bozza/transcript/modello/connessione, chiudere il Mini o
   Island con Alt+F4 e verificare main/focus. Exit deve terminare senza riaprire main.
4. Riavviare l'app normale: deve essere selezionata l'ultima preferenza salvata.
   Verificare 100/125/150%, monitor diversi/negativi, taskbar e cambio risoluzione;
   spostare/ridimensionare il main sullo stesso monitor non deve trascinare il companion.
5. Approvazione visiva separata per Island: proporzioni, bordo, contrasto, font,
   hover/focus/movimento ridotto, superficie trasparente e menu sotto la capsula.

Nessuna nuova cattura GUI o prova Windows eseguita nel cloud. Il PASS di e492b39
non certifica questi due nuovi layout. [Report del candidato attuale](../apps/desktop/evidence/ISLAND_WINDOWS_CORRECTION_REPORT.md).
