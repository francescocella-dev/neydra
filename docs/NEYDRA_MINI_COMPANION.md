# NEYDRA Mini — prima modalità companion

Branch `feat/desktop-mini-interface`, PR #10 **DRAFT**. Baseline
`9b8fc610274f98b24f88f1e4312646ed2d30d950`: il proprietario riferisce **93/93 unit,
Electron E2E 1/1 e design visivo approvati su Windows** per l'interfaccia immersiva.
Questa convalida precede il companion; il nuovo candidato richiede una nuova prova.

## Interazione

Dal menu laterale, **Riduci a Mini** apre una finestra da 120×120 DIP, senza
titolo/frame, trasparente fuori dal cerchio, sempre in primo piano e esclusa
dalla taskbar. Il segno tipografico **N** grafite/arancio è temporaneo: non è un
avatar sostitutivo, né un modello 3D. Nessun nuovo asset o permesso vocale.

- Trascinare il cerchio lo sposta. Un movimento inferiore a 4 DIP è un clic;
  dopo una vera trascinata il rilascio non apre l'app, anche tornando all'origine.
- Un clic, Invio o Spazio ripristina NEYDRA. Clic destro o Maiusc+F10 apre il menu
  nativo con soltanto **Apri NEYDRA** ed **Esci**.
- La finestra immersiva resta montata, semplicemente nascosta. Il ritorno usa
  `show()/focus()`, senza reload, nuova ChatPanel o nuovo servizio. Bozza,
  cronologia in memoria, modello e connessione rimangono nello stesso stato.
- Una risposta già avviata può proseguire: ridurre non la annulla, rinnova,
  reinvia o autorizza nuovi consumi. Nessuna richiesta parte dal cambio modalità;
  consenso per singolo invio e avviso costi rimangono nell'interfaccia immersiva.
- La posizione del companion dura per il processo corrente. Si riusa la stessa
  finestra finché è valida; una finestra chiusa o guasta viene ricreata soltanto
  su un nuovo comando esplicito. Nessun salvataggio di sessione su disco aggiunto.

## Finestre, recupero e monitor

Il processo principale attende caricamento e conferma `ready` del renderer prima
di mostrare il companion e nascondere NEYDRA. Il comando rimane bloccato durante
la transizione; riduzioni ripetute non creano duplicati. Se la conferma non arriva
entro 5 secondi, la finestra incompleta viene distrutta e NEYDRA resta aperta,
con errore generico visibile. Nessun retry automatico.

Posizione e soglia del trascinamento sono calcolate nel main usando il cursore OS
in DIP, senza coordinate fornite dal renderer. La posizione è limitata a una
vera `Display.workArea`, non all'unione rettangolare dei monitor: il cerchio non
finisce nei vuoti tra schermi o sotto la taskbar. Sono gestiti origini negative,
cambi di scala/risoluzione e aggiunta/rimozione di monitor. Se nessuna area può
contenere il cerchio, si ripristina NEYDRA. Al ritorno si recupera anche una
finestra principale fuori schermo; fullscreen e massimizzazione non sono
deliberatamente azzerati.

Chiusura nativa/Alt+F4 del companion, errore del preload, crash o mancata risposta
del suo renderer ripristinano la finestra principale. La scomparsa inattesa del
companion mentre NEYDRA è nascosta la ripristina. Avviare nuovamente l'app
recupera la sessione esistente mediante single-instance lock. `Esci` o la chiusura
della finestra principale terminano entrambe le finestre e rimuovono handler e
listener. Se il main non è recuperabile, l'app termina anziché restare invisibile.
Non viene aggiunto un processo in tray.

## Confine di sicurezza

Il companion ha origine `app://companion/index.html`, asset generati propri e
partizione **in memoria distinta** `neydra-companion`. Usa gli stessi sandbox,
context isolation, Node disabilitato, CSP e divieti di rete, navigazione, download,
finestre secondarie e dispositivi del desktop. La politica precedente delle
sessioni è soltanto estratta in `renderer-session.ts`, senza cambiare la CSP.

Il suo preload espone esclusivamente `ready`, `restore`, `beginDrag`, `moveDrag`,
`endDrag`, `cancelDrag`, `openMenu`. Nessuna sottoscrizione a eventi chat, accesso
account, token, contenuti, URL, header, posizione arbitraria o IPC generico. Il
main verifica ID webContents, origine esatta e frame principale; schemi strict
rifiutano campi aggiunti. Dal main renderer è consentito soltanto `reduce`; dal
companion non è consentito invocarlo. Le autorizzazioni dei canali chat e F11
rimangono ristrette alla finestra immersiva.

OAuth, Responses, logica del consenso, provider, asset/font originali, Mini 3D,
Blender, voce e Holo sono invariati. Nessuna dipendenza, login o inferenza reale,
merge, release o deployment.

## Verifica Windows senza richieste AI

Da checkout pulito; chiudere prima altre istanze NEYDRA per l'E2E (il lock deve
impedire al processo di test di duplicare una sessione già aperta).

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
npm.cmd start
```

Fermarsi al primo exit code non zero. Dipendenze invariate; per un checkout non
installato usare prima `npm.cmd ci` e `npm.cmd run setup:electron`. Non disattivare
il sandbox. Nessun login o invio ChatGPT durante queste verifiche.

L'E2E completo contiene ora **due test**: quello immersivo/F11/viewport precedente
e quello companion. Per isolare soltanto la nuova prova dopo un eventuale errore:

```powershell
npm.cmd run test:desktop -- --grep "companion lifecycle"
```

Il nuovo E2E attraversa il comando del menu, la finestra nativa, il bridge
minimo, il ripristino con stesso nodo input e senza reload, il trascinamento, il
menu contestuale, la chiusura nativa, la ricreazione, Invio e l'uscita. Per il
trascinamento sostituisce **solo nel test** la lettura del cursore OS: gli eventi
CDP non muovono il cursore fisico. Non sostituisce IPC, controller o `setPosition`.
Per scegliere azioni del menu nativo intercetta solo `Menu.popup` e invoca le sue
vere callback. Queste prove non certificano il mouse fisico o la resa della
taskbar. Se eseguito produce `apps/desktop/evidence/mini-companion.png`.

Checklist manuale locale:

1. Scrivere una bozza senza inviarla. Ridurre/ripristinare più volte, con chat e
   Stato aperti/chiusi. Verificare testo, cronologia demo offline e stato
   «Non collegato» conservati, nessun login o richiesta automatica.
2. Controllare cerchio grafite/arancio senza rettangolo opaco, titolo o voce
   normale nella taskbar. Aprire un'altra app: il cerchio resta in primo piano
   senza sottrarle continuamente il focus. Clic su N ripristina NEYDRA in primo
   piano; provare anche Tab/Invio/Spazio e menu con tastiera.
3. Trascinare davvero con il mouse, poi rilasciare: il cerchio rimane nella nuova
   posizione e non apre NEYDRA. Provare bordi, taskbar e ritorno vicino all'origine.
4. Con più monitor, provare origini negative, spazi tra monitor e scale Windows
   **100%, 125%, 150%**. Spostare tra schermi, cambiare scala/risoluzione e scollegare
   lo schermo che ospita il cerchio. Deve restare raggiungibile su uno schermo.
5. Provare il passaggio da fullscreen nativo e ritorno; ripetere F11 e uscita col
   pulsante. Ripetere anche da finestra massimizzata. Verificare il layout
   immersivo approvato e i quattro viewport dell'E2E senza scrolling globale.
6. Clic destro: **Apri NEYDRA** ripristina; Alt+F4 sul cerchio recupera la finestra
   principale. Ridurre ancora, poi lanciare `npm.cmd start` da un secondo
   PowerShell: deve tornare la stessa sessione, senza nuove finestre duplicate.
7. **Esci** deve chiudere tutte le finestre/processi di questa istanza; verificare
   anche la chiusura ordinaria della finestra principale. Per recuperare una
   sessione nascosta avviare nuovamente NEYDRA, senza terminare altri Electron.

Registrare SHA, build di Windows, scala/monitor, risultati osservati ed eventuale
screenshot del solo segno temporaneo. La continuità di modello/conversazione e
stream è testata offline con fixture sintetiche; non occorre un login per questa
validazione. [Report delle prove eseguite](../apps/desktop/evidence/COMPANION_REPORT.md).
