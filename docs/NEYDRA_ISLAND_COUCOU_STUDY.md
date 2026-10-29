# NEYDRA Island — studio dei sorgenti Windows Coucou

29 ottobre 2026. Studio prima dell'intervento, baseline NEYDRA `d5df904`.
Repository consultato: [Louis-CFM/coucou](https://github.com/Louis-CFM/coucou),
revisione fissata **`7b228f1e6529f16623dd859d9e7f33966816f19c`**. Nessuna
migrazione a Tauri, nessuna dipendenza o asset esterno introdotto.

## File effettivamente consultati

I link fissano la revisione, non il futuro contenuto di main.

| File | Osservazioni dal sorgente |
| --- | --- |
| [windows/src-tauri/src/island.rs](https://github.com/Louis-CFM/coucou/blob/7b228f1e6529f16623dd859d9e7f33966816f19c/windows/src-tauri/src/island.rs) | `target_monitor` sceglie monitor preferito/cursore/primario; identità per origine/nome/dimensioni. `apply_geometry` converte dimensioni logiche in fisiche con scala e arrotondamento, centra sulla dimensione del monitor e usa la sua origine superiore. Ridimensiona, sposta e ribadisce la dimensione, con un ulteriore tentativo se inner_size differisce. `current_screen_key` confronta origine/dimensioni/scala. PollGate governa poll del cursore, click-through e wake strip. `calculate_zoom_correction` tratta mismatch WebView2 DPR/scala. |
| [windows/src/core/layout.ts](https://github.com/Louis-CFM/coucou/blob/7b228f1e6529f16623dd859d9e7f33966816f19c/windows/src/core/layout.ts) | Panel massimo 720×320; compatto 288×32, espanso 640, strip 240×6. Layout separato da stati, posizioni e contenuti. La sagoma interna aderisce in alto; hidden ha altezza zero. |
| [windows/src/island/fsm.ts](https://github.com/Louis-CFM/coucou/blob/7b228f1e6529f16623dd859d9e7f33966816f19c/windows/src/island/fsm.ts) | Stati hidden/petit/home/coucou, callback di transizione solo quando cambia stato. Hover, click, pin e chiusure esplicite hanno percorsi distinti. Ogni timer viene cancellato prima di sostituirlo; callback ricontrollano lo stato prima di agire. |
| [windows/src/island/island.ts](https://github.com/Louis-CFM/coucou/blob/7b228f1e6529f16623dd859d9e7f33966816f19c/windows/src/island/island.ts) | `setMode` e FSM coordinano geometria/contenuti. `applyGeometry` centra la sagoma nel viewport effettivo e arrotonda solo gli angoli inferiori; comunica l'hit rect solo se cambia. Spring/Tracked animano le dimensioni del contenuto; la strip viene applicata dopo il timer di retrazione, cancellato se cambia stato. La chat abilita il focus esplicitamente; canvas ricalibrati al DPR, loop parcheggiato quando non serve. Include drag del personaggio e molte funzioni fuori incarico. |
| [windows/src/style.css](https://github.com/Louis-CFM/coucou/blob/7b228f1e6529f16623dd859d9e7f33966816f19c/windows/src/style.css) | Sagoma nera `top: 0`, angoli superiori retti e inferiori curvi; shell di clipping distinta. Contrasto gerarchico, hover/pressione e transizioni dei contenuti. Non è una capsula flottante con gap superiore. |
| [windows/src-tauri/tauri.conf.json](https://github.com/Louis-CFM/coucou/blob/7b228f1e6529f16623dd859d9e7f33966816f19c/windows/src-tauri/tauri.conf.json) | Finestra senza decorazioni/ombra/taskbar, trasparente, sempre sopra, inizialmente 240×6 e non focalizzata. Flag WebView2, CSP e capability appartengono al suo runtime, non a Electron. |

## Adattamento a NEYDRA

Adottiamo il principio della sagoma collegata al bordo superiore e gli stati
interattivi separati dalla posizione. La nuova sagoma è originale NEYDRA: nero/
grafite, marchio N, Oxanium locale, bordo arancio trattenuto e sottile accento
inferiore. Il controllo riempie la larghezza effettiva del viewport, è alto 60
CSS px e ha angoli 0/0/20/20. La finestra resta richiesta a 240×64 DIP: non
scendiamo sotto le dimensioni native già problematiche su Windows. L'ancoraggio
è ora `workArea.y`, senza il vecchio gap di 8 DIP o inset superiore di 4 CSS px.

Hover, focus, pressione e menu aperto modificano colore, bordo e accento, senza
animare dimensioni o posizione del core. Una piccola pressione della freccia è
solo interna al pulsante. CSS gestisce inversione e cancellazione delle
transizioni senza nuovi timer; prefers-reduced-motion le rimuove. Click sinistro,
Invio/Spazio ripristinano il main; clic destro/Maiusc+F10 e tastiera usano il menu
esistente. Il Mini circolare 120/112 e il suo margine 24 restano invariati.

### Traduzioni necessarie, soluzioni non portate

- **Monitor:** NEYDRA usa screen.getDisplayMatching sui bounds/normal bounds del
  main, poi la workArea Electron già in DIP. Coucou usa anche monitor.size e
  preferenze del monitor/cursore: non trasferiamo queste scelte. La workArea
  tiene conto della taskbar, incluse origini negative.
- **DPI/geometria:** la chiave modalità/ID/scala/workArea evita setter identici;
  il controller legge bounds effettivi e non reagisce ai propri moved. Nessuna
  sequenza Tauri set_size/set_position, retry di resize o correzione zoom WebView2.
  Il menu continua a misurare satelliti reali, riusare una disposizione valida e
  verificare collisioni/workArea. DPR e geometrie restano nella diagnostica E2E.
- **Superficie/focus:** niente panel trasparente 720×320 né cursor poll a 60 Hz.
  Core e due satelliti sono piccole finestre isolate; i satelliti nascosti sono
  inattivi per il mouse. NEYDRA conserva il focus necessario alla sua tastiera
  e il recupero della finestra originale, senza imitare un'Island sempre non
  focalizzabile. Lo spazio trasparente è limitato ai pochi pixel del core e
  agli angoli inferiori, oltre alle piccole superfici satellite esistenti.
- **Lifecycle:** nessun codice Rust gestisce gli oggetti Electron. Gli accessi
  webContents passano da uno snapshot valido anche quando il getter nativo è
  null. Recupero idempotente prima della pulizia dei figli; da hide/blur con
  contenuti scollegati la pulizia del guscio nativo è differita di una microtask,
  così non rientra nella distruzione C++. Nessun recupero durante app quit.
- **Fuori ambito:** hidden/wake strip, espansione, upload/drop, agenti, approvazioni,
  suoni, personaggi, clock, drag, integrazioni e processi Coucou. Nessun nuovo
  monitoraggio del mouse o permesso. Restano CSP/sandbox e tre preload NEYDRA.

## Licenze e riuso

Letti [LICENSE MIT](https://github.com/Louis-CFM/coucou/blob/7b228f1e6529f16623dd859d9e7f33966816f19c/LICENSE)
e [LICENSE-ASSETS.md](https://github.com/Louis-CFM/coucou/blob/7b228f1e6529f16623dd859d9e7f33966816f19c/LICENSE-ASSETS.md).
Il codice MIT è © 2026 Louis Raillé; i marchi, Mochi, artwork, icone, suoni e
media sono esclusi. Questo intervento **non incorpora porzioni di codice Coucou**
o suoi asset: usa come riferimento i principi descritti sopra, con implementazione
Electron e CSS NEYDRA indipendenti. Non distribuiamo Rust/TypeScript/CSS Coucou;
non è necessario aggiungere una copia MIT a un file derivato inesistente.

[Report dei bug, test e limiti](../apps/desktop/evidence/ISLAND_WINDOWS_CORRECTION_REPORT.md).
