# NEYDRA Mini — Companion V2

> Specifica corrente: [due modalità fisse, drag abolito](NEYDRA_REDUCTION_MODES.md). Il testo seguente è storico e non autorizza più il trascinamento.

PR #10 **DRAFT**, branch `feat/desktop-mini-interface`. Baseline Windows
`c36b29bf2de023beb39a130fd30d37df546f0b32`: check/lint/typecheck/build, **142/142
unit**, tre preload ed E2E immersivo PASS. Il JSON del proprietario dimostra
**cinque cicli e dieci aperture senza crescita** a DPR 1,25: native 73×72/72×73,
contenuto/viewport 72×72, pulsanti 48×48 a (12,12), vincoli invariati.
Il primo +1 nativo è registrato dentro il setPosition iniziale; hide/show/focus
successivi non cambiano la geometria. La conversione interna OS non è provata.

Il companion completo fallisce ancora, con budget test 90 secondi, dopo
`BrowserWindow.close()` del Mini: main non ripristinato ed eccezione main-process
`Object has been destroyed`. Il candidato corrente corregge lifecycle, invii IPC
e recupero; dimensioni e geometria restano invariate.
[Report corrente della chiusura](../apps/desktop/evidence/COMPANION_CLOSE_REPORT.md).
**Nuovo E2E Windows NON ESEGUITO nel cloud**, nessun PASS Windows anticipato.

## Riduzione e continuità

Il normale pulsante Windows `_` passa attraverso l'evento nativo `minimize` e
lo stesso `CompanionController.reduce()` usato dal comando del menu. In fullscreen
la barra superiore aggiunge l'icona **Riduci a Mini**. Il comando laterale resta
come percorso esplicito e di riserva. Nessuna nuova sessione o ricreazione del main.

La finestra principale può essere già minimizzata: per posizionare il companion
si usano allora i bounds normali, e al ritorno si chiama il ripristino nativo.
Il main resta vivo, con bozza, cronologia, modello, connessione e stream; il cambio
modalità non avvia né annulla richieste. Massimizzazione e fullscreen sono
conservati; se l'OS lascia il fullscreen durante l'occultamento, il ritorno lo
richiede nuovamente. F11 usa ancora il percorso nativo precedente.

La transizione attende caricamento e `ready` del companion, prima di nascondere
il main. Doppi comandi non creano finestre. Il ripristino durante una creazione
pendente la annulla; una successiva minimizzazione non resta bloccata quando la
creazione annullata termina. In caso di errore il main torna visibile. Single
instance, chiusura ordinaria, Alt+F4 sul cerchio e uscita controllata restano attivi.

### Chiusura nativa e recupero

Il Mini entra in chiusura già su `close`, senza attendere `closed`. La finestra
viene staccata dal controller prima del recupero; il main originale torna visibile
e con focus prima della distruzione dei figli. I webContents possono essere già
morti mentre BrowserWindow.isDestroyed è ancora false: entrambi gli stati e la
chiusura in corso sono verificati prima di inviare IPC o usare i satelliti.

Una sola transizione ritira ogni core. Timer fade/blur e handshake vengono
cancellati; i callback dei figli conoscono il proprio genitore e non notificano
un core ritirato. La sola shell con contenuto morto viene finalizzata in una
microtask per evitare un destroy rientrante nello stack nativo. Close/dispose
rientranti non ripetono le notifiche e l'uscita vera mantiene disabled il recupero.

Il ripristino del main è eseguito anche se una notifica overlay genera un errore:
l'errore autentico viene poi ripropagato. Non viene ignorato genericamente.
L'unica eccezione send filtrata è TypeError "Object has been destroyed" **quando
il destinatario risulta effettivamente morto/in chiusura dopo la chiamata**.
Nessun catch vuoto di errori applicativi nuovi; i contratti IPC esistenti restano.

Il main non viene ricaricato o ricreato. Stessi webContents/sessione e bozza
restano verificati; la chiusura del Mini non provoca login o invii automatici.

## Geometria e architettura orbitale

| Finestra | Bounds in DIP | Contenuto visibile | Accesso |
| --- | --- | --- | --- |
| Immersiva | dimensioni native esistenti | interfaccia approvata | bridge desktop precedente |
| Cerchio Mini | sempre 120×120 | cerchio 112×112, inset 4 | ripristino, drag e menu |
| Satellite Apri | richiesti 72×72, min/max 72 | pulsante circolare 48×48 centrato | solo il proprio comando |
| Satellite Esci | richiesti 72×72, min/max 72 | pulsante circolare 48×48 centrato | solo il proprio comando |

Il menu usa **due piccoli overlay nativi separati**, figli del companion. Nessuna
espansione o riposizionamento del cerchio per fare spazio al menu. Nessun grande
rettangolo trasparente intercetta i clic tra i controlli. Si arriva al massimo a
quattro BrowserWindow vive; i satelliti vengono creati soltanto al primo uso e
riusati. Creazioni pendenti e riaperture sono serializzate, anche dopo cancel.

Il main valuta coppie di posizioni su un'orbita di raggio 106 DIP, leggendo i bounds
effettivi di ciascun satellite dopo caricamento e spostamento. Entrambi devono
stare nella work area del cerchio e restare separati fra loro **e dal rettangolo
nativo del core**, con 4 DIP di spazio (non una tolleranza sulle misure). Il core
non si sposta per creare spazio. Non usa l'unione dei monitor, che includerebbe vuoti. Gestisce
angoli, bordi, taskbar, coordinate negative e diverse dimensioni logiche. Cambi di
monitor/DPI/risoluzione chiudono il menu e ricollocano il cerchio se necessario.
Se manca spazio per due comandi, il menu non viene aperto: il cerchio resta
cliccabile per recuperare NEYDRA, senza tagliare controlli.

I satelliti restano nascosti durante il calcolo. Se il passaggio a un altro DPI
ne cambia la misura, è consentita una sola ricalcolazione. Bounds reali non validi
dopo il posizionamento, alla comparsa o su successivi eventi move/resize chiudono
il menu senza ritentare automaticamente. Il CSS usa un contenitore grid a pieno
viewport con `place-items:center`, pulsanti invariati da 48 CSS px e le stesse
animazioni. A viewport 72×72 l'inset ideale è 12 px; nessun clipping o maschera.

Il corpo del companion ha `appearance:none`, dimensioni CSS fisse, nessun
transform o scale e indicatore di focus **interno**. Anche min/max dei bounds
nativi sono fissati. Il drag chiama soltanto `setPosition`, senza resize. Il segno
N resta temporaneo: nessun avatar fittizio, GLB o asset 3D aggiunto.

### Contratto geometrico e misure DPI

L'app garantisce **richiesta e min/max 72×72**, non l'identità fra dimensione
richiesta e bounds restituiti dall'OS. I test host conservano queste opzioni esatte.
I getter nativi di min/max sono raccolti come misure, anch'essi potenzialmente
convertiti dall'OS. Non si forza il resize e non si assume che native, contenuto
e viewport siano quadrati o identici fra loro.

Quando core e work area consentono ancora la precedente coppia, il controller
ne conserva le posizioni native misurate: non ricalcola l'orbita dai bounds già
arrotondati e non invoca `setPosition`. Un core realmente spostato o una finestra
ricreata richiedono un nuovo layout. Anche allora non viene invocato il setter
se x/y coincidono. `hide()` non viene ripetuto su finestre già nascoste. Nessun
resize forzato, modifica dei 72 richiesti o ciclo di correzione indefinito.

L'E2E conserva esattamente core/contenuto **120×120**, corpo **112×112**, pulsanti
**48×48 CSS px** e raggio 50%. Verifica intento CSS grid/center, centro rispetto
sia al viewport intero sia al rettangolo del contenitore, outline dentro il
viewport, opacity 1, controllo abilitato e hit test. Attende le animazioni finite;
transform ammessi a riposo: none o matrice identità esatta. Keyframe e tempi
190/225/150 ms sono invariati.

La sola centratura visiva è verificata in pixel fisici: per ciascun asse,
`abs(posizione * DPR - (estensione - 48) * DPR / 2) <= 0,5`.
Mezzo pixel è l'errore massimo dell'arrotondamento al pixel più vicino: il limite
in CSS varia con DPR (0,5 / DPR), non è un epsilon DIP scelto per il test fallito.
Con DPR 1,25 il dato del proprietario 13,199999809 anziché 13 differisce di circa
0,25 pixel fisici. Questo criterio non attribuisce la causa del dato al raster:
impone un limite visivo e conserva la verifica separata dell'intento del layout.
Dimensione, forma, clipping e collisioni non ricevono tolleranze.

**Cinque cicli consecutivi**: clic destro → hover → chiusura → Maiusc+F10 →
Tab/Home/End e cambio focus → Escape. Tutte le dieci aperture devono avere gli
stessi ID e bounds, content bounds, min/max effettivi, zoom, viewport/DPR e
rettangoli CSS della prima. Qualunque crescita nativa continua a fallire anche
se il centro rientra nel mezzo pixel fisico. Restano controlli su work area,
collisioni, bridge isolati, sessione/bozza, minimizzazione, drag e recupero.

Sono registrati separatamente richiesta, bounds/content, min/max, resizable,
zoom, scala display, DPR/viewport e contenitore CSS. `physicalBounds` è la
conversione Electron `screen.dipToScreenRect`, non una misura indipendente HWND.
Il probe solo test registra sequenza, fase before/after/event, operazione e ID
per hide, setPosition, setBounds, showInactive, focus e move/moved/resize/show/
hide/focus/blur. Delega sempre agli originali e ripristina wrapper/listener al
termine. Non espone nuove API ai renderer o modifica IPC/preload.

I campioni `operations` permettono di confrontare la prima variazione di bounds,
contenuto o vincoli: una modifica dopo setPosition e prima di showInactive è un
riscontro diverso da una variazione al solo show o focus. La nuova traccia Windows c36b29 ha localizzato il primo +1 dentro setPosition
iniziale; le riaperture non lo ripetono. Questo non certifica la conversione
interna OS. I successivi problemi di chiusura hanno un probe lifecycle separato.

## Menu e tastiera

- Clic destro sul cerchio alterna apertura e chiusura. Non viene costruito alcun
  menu Windows. I satelliti mostrano icone vettoriali, nomi accessibili e tooltip.
- Comparsa di 190 ms, secondo comando ritardato di 35 ms, breve traiettoria curva
  e dissolvenza; chiusura in 150 ms. Solo i satelliti traslano. Il cerchio non si
  ingrandisce. `prefers-reduced-motion` elimina le animazioni.
- Il puntatore non attiva comandi al passaggio. **Apri NEYDRA** ripristina; **Esci**
  termina l'app soltanto dopo click/Invio/Spazio esplicito. Il renderer non sceglie
  il ruolo: è assegnato nel main tramite l'ID della propria finestra.
- Maiusc+F10 o tasto Menu apre da tastiera e seleziona Apri. Tab/frecce, Home/End
  navigano tra i satelliti; Escape chiude e restituisce il focus al cerchio.
- I satelliti appaiono con `showInactive()`. Il clic esterno che trasferisce il
  focus fuori dal gruppo chiude il menu senza riportarlo in primo piano. Il
  passaggio del focus tra i satelliti non lo chiude. Durante la dissolvenza i
  satelliti ignorano il mouse e le azioni sono rifiutate.
- Inizio drag, ripristino e cambi display chiudono subito il menu. Un rilascio
  dopo drag non attiva il cerchio o i satelliti.

## Sicurezza e recupero

Il main renderer conserva il bridge precedente. Il cerchio usa origine/partizione
`companion` e preload proprio; i satelliti hanno origine/partizione **orbit** e un
terzo preload, ancora più ristretto. Ricevono soltanto il proprio ruolo e notifiche
di visibilità. Nessun messaggio, account, token, modello o contenuto ChatGPT entra
nei satelliti. Ogni comando verifica ID, origine esatta e frame principale; i DTO
strict rifiutano dati aggiunti, azioni generiche o ruoli scelti dal renderer.

Sandbox, isolamento, CSP, divieti di rete/dispositivi/download/navigazione sono
immutati. La chiusura/crash del cerchio distrugge i satelliti e recupera il main;
gli errori di un satellite chiudono il menu. Quit distrugge anche finestre ancora
in caricamento. Nessuna richiesta AI, login, voce, merge o release.

## PowerShell e verifica Windows

Chiudere prima altre istanze NEYDRA per non contendere il single-instance lock.
Preservare prima i JSON precedenti. Fermarsi al primo exit code non zero nei controlli:

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
# Output nuovo: non cancella i risultati delle prove precedenti.
$closeOutput = "test-results/close-recovery-" + [guid]::NewGuid().ToString("N")
npm.cmd run test:desktop --workspace @neydra/desktop -- "--output=$closeOutput" "--timeout=90000"
# Solo dopo 2/2 PASS: npm.cmd start per la prova fisica.
```

Nessun login o invio AI. I tre preload sono controllati da `check:preload`. L'E2E
immersivo è conservato; quello companion ora verifica V2. Il suo drag simula solo
la lettura del cursore OS per gli eventi CDP, mantenendo veri IPC/controller e
spostamento nativo. Non simula più menu o callback Windows: usa i veri controlli
orbitali. Non certifica il mouse fisico né la qualità dell'animazione.

Checklist manuale:

1. Scrivere una bozza senza inviarla. Usare davvero `_`: deve apparire Mini, senza
   main minimizzato nella taskbar. Clic sul cerchio ripristina la stessa bozza e
   stato. Ripetere da finestra normale, massimizzata e dall'icona in fullscreen;
   verificare F11 e la chiusura ordinaria.
2. Tenere premuto il cerchio, trascinarlo lentamente/velocemente e rilasciare.
   Verificare diametro, forma, N, bordi e focus stabili; nessun ingrandimento,
   deformazione o ripristino accidentale. Aprire/chiudere il menu durante le prove.
3. Provare tutti gli angoli, bordi e taskbar. I due satelliti devono stare nello
   schermo e il cerchio non deve saltare. Passare fra monitor, origini negative,
   scale **100%, 125%, 150%**, cambiare risoluzione e scollegare un monitor.
4. Clic destro: solo comandi orbitanti. Verificare animazione e movimento ridotto,
   hover senza uscita, apertura/chiusura ripetuta, Escape, clic su desktop/altra
   app, tastiera e passaggio fra satelliti. Nessuna cattura dei clic negli spazi
   fra le piccole finestre; nessun furto ripetuto di focus.
5. Apri deve recuperare NEYDRA, Esci chiudere tutti i processi di questa istanza.
   Provare Alt+F4 sul cerchio, seconda istanza, main ripristinato durante una
   riduzione lenta e ripetizione della minimizzazione. Nessuna finestra duplicata
   o processo invisibile irrecuperabile.

## JSON E2E persistente dopo un FAIL

Una fixture Playwright scrive sul filesystem nel teardown di un test fallito,
anche se il launch fallisce prima di attraversare il `catch`. Usa
`testInfo.outputPath('companion-v2-geometry.json')`, crea la directory, scrive
il JSON UTF-8 e solo dopo allega **il path** al test. Reporter `list` invariato.

Percorso dal repository:
`apps/desktop/test-results/<output-facoltativo>/<directory-test-companion>/companion-v2-geometry.json`.
Senza `--output` manca il livello facoltativo.
Playwright può creare anche una copia sotto `attachments/`. Recuperare il file
**prima di rieseguire Playwright**, che pulisce il proprio output a inizio run.
Nessun codice aggiunto cancella screenshot o altri file del proprietario.

```powershell
Get-ChildItem .\apps\desktop\test-results -Recurse -File -Filter companion-v2-geometry.json |
  Select-Object FullName, Length
Get-ChildItem .\apps\desktop\test-results -Recurse -File -Filter companion-v2-geometry.json |
  ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw }
```

Un file `[]` significa che il processo non ha consentito alcuna misura, ad
esempio per un errore di launch; non è un PASS geometrico. I fallimenti dopo
l'apertura conservano i campioni delle fasi, le operazioni native e l'ultima raccolta disponibile.
Il JSON include ora `lifecycle`: sequenza close/closed/contents-destroyed/show/
hide/focus/blur/restore/minimize, ID e stato native/webContents di main/core.
Sono campionati prima/dopo il vero core.close; un monitor delle eccezioni non
cattura né sopprime gli errori reali. Se il processo smette di rispondere, la
raccolta finale può non essere disponibile: restano i campioni già salvabili.
Si raccolgono solo geometria e dati tecnici fissi: nessun testo chat, input,
credenziale, token, URL, errore grezzo o screenshot del desktop.

Regressione ripetibile del salvataggio, senza Electron, browser, login o rete
esterna: `npm.cmd test` esegue anche un subprocess Playwright sintetico,
con reporter list e un'asserzione volutamente fallita. Il test unitario passa
solo se il subprocess fallisce e lascia il JSON corretto in una directory
temporanea dedicata (ripulita dal test), senza alterare i risultati E2E locali.

## Diagnostica facoltativa con mouse fisico

Con altre istanze chiuse e build già eseguita:

```powershell
Push-Location apps\desktop
node tests/manual/companion-physical.mjs
Pop-Location
```

Il test manuale apre Mini per **45 secondi**, senza simulare il cursore. Trascinare
fisicamente, aprire/chiudere il menu e passare fra schermi. Al termine chiude
l'istanza di prova e crea un nuovo `evidence/companion-v2-physical-*.json` senza
sovrascrivere file. Non fare login, digitare o inviare richieste. Registra solo
fasi fisse, bounds/content bounds, DPR/scala/work area, capture e rettangolo/stile
del cerchio; nessun testo, input, account, token o screenshot desktop. Sono
campioni asincroni, non una traccia hardware sincronizzata. Exit 0 significa
soltanto diagnostica salvata, **non PASS Windows o visivo**.

Condividere SHA, scala/monitor, esiti osservati e, se il cerchio cambia aspetto,
la diagnostica geometrica. La causa fisica non va dedotta da un test CDP passato.
[Report effettivo del cloud](../apps/desktop/evidence/COMPANION_V2_REPORT.md).
