# NEYDRA Mini — schermata minimale immersiva

Direzione corrente della PR #10 **DRAFT**, sul branch esistente
`feat/desktop-mini-interface`. Questa richiesta sostituisce la presentazione
Premium Tech a dashboard; palette, font e venature approvati restano invariati.
Partenza del redesign: `3d55fd42309a1cf742fbdc18e606a49a3d521ff1`.

## Schermata e interazioni

- Marchio superiore soltanto **NEYDRA / MINI**, su due righe. Nessun secondo
  marchio, slogan, welcome message grande o footer permanente.
- Stato ChatGPT compatto, icona fullscreen e icona menu. I pulsanti testuali di
  navigazione sono nel pannello di controllo, non nella barra superiore.
- Menu laterale modale: ChatGPT/modelli, visualizzazione chat, pannello stato,
  tema, impostazioni, fullscreen, informazioni/strumenti. Icone vettoriali
  coerenti, nomi accessibili, tooltip su hover/focus e navigazione tastiera.
- Connessione, selettore modello, nuova conversazione e spiegazioni estese sono
  nel menu. I controlli restano disponibili **anche con la chat nascosta**.
- Palco Mini vuoto e protagonista, senza avatar fittizio; unica indicazione
  discreta del modello non collegato. Stato aggiuntivo inizialmente nascosto,
  apribile dal menu, senza card/contatori stimati.
- Cronologia essenziale con autori distinti e scorrimento interno sottile;
  il compositore è separato dalla cronologia e rimane in basso. Il follow dello
  stream si arresta quando l'utente scorre verso messaggi precedenti.
- Barra orizzontale: microfono disabilitato con nome/descrizione **«Voce non ancora
  disponibile»**, testo a 16 px, invio a icona. Durante lo streaming il controllo
  invio diventa Stop; rimane valido Escape. Nessun permesso o registrazione audio.
- Consenso manuale per **ogni** invio, con quota inclusa verificata, crediti
  acquistati zero, ricarica disattivata e autorizzazione a quel singolo invio e
  contesto. Checkbox azzerata come prima; avviso visibile **«ChatGPT: costi zero
  non garantiti»**. Informazioni complete nel menu, nessuna quota inventata.

## Contratto di layout

La pagina è dimensionata sul viewport del renderer (`100dvh`), che in modalità
finestra esclude il frame nativo. `html`, `body`, root e shell hanno dimensioni
limitate; nessuna area ha le precedenti altezze minime 660/690/840 px che forzavano
la pagina a crescere. Header e contenuto usano una griglia con `minmax(0,1fr)`;
i figli scorrevoli hanno `min-height:0` e `min-width:0`.

L'overflow globale è bloccato **insieme al ridimensionamento della griglia**, non
come alternativa all'accessibilità dei contenuti. Cronologia, testo lungo nel
campo e dettagli lunghi del menu/stato hanno le proprie aree interne. Il
compositore non è un contenitore scorrevole o tagliato: consenso, costi e controlli
restano fuori dalla cronologia. Nessun ellipsis o troncamento del testo inviato.

A larghezze intermedie il pannello stato opzionale diventa una fascia interna
con altezza riservata; non viene aggiunto sotto la pagina. Nelle finestre più
basse si riducono spaziature, non indiscriminatamente i font. Testo 16 px,
metadati/consenso 14 px, font locali Oxanium/Manrope e licenze precedenti.

Questo è il contratto implementato; **la verifica geometrica GUI del candidato
rimane da eseguire su Windows**, essendo bloccata nel cloud.

## Stato e confini mantenuti

La ChatPanel rimane montata quando nascosta. I suoi controlli account sono
presentati nel dialogo con un portal React, senza duplicare stato, handler o
richieste. Bozza, modello, consenso, transcript e richiesta attiva appartengono
sempre allo stesso componente.

Gli handler refresh/connect/disconnect/send/reset e il listener di cancellazione
sono identici alla partenza. OAuth, scope/token/endpoint, limiti, backend, preload,
IPC e protezioni Electron non cambiano. Nessuna dipendenza aggiunta.
Fullscreen nativo e F11 conservano il driver/probe della correzione precedente;
il nuovo layout non usa HTML fullscreen o una finestra alternativa.

Nessuna modifica a Mini 3D/Blender, references, Holo, voce o companion. Nessun
login, invio AI reale, merge o release. Nessun nuovo branch o nuova PR.

## Test e limiti delle prove

- Unit/renderer: menu, brand, input conservato, controlli account con chat
  nascosta, stato reale simulato, modello/consenso, streaming, Stop, cleanup,
  voce disabilitata e risposta sintetica lunga. jsdom non misura il layout.
- E2E: mantiene font/protezioni/native fullscreen/F11; aggiunge controlli su
  `scrollWidth/Height`, `scrollTop/Left` di documento/body/root/shell e posizione
  completa di input, invio, consenso, costi e menu. Usa hit-testing per verificare
  che i controlli non siano coperti. Controlla anche menu aperto.
- Stress di layout: campo da 2000 caratteri e **22 messaggi DOM sintetici**, senza
  richieste AI, per verificare lo scroll interno e il compositore fermo.
- Viewport CSS predisposti: 1280×860, 1024×688, 853×573 e 720×480, con stato
  nascosto/visibile e menu. I casi 125%/150% sono reflow equivalenti, **non una
  certificazione del ridimensionamento OS Windows**.
- Verifiche di viewport anche all'ingresso e uscita dal fullscreen nativo.
  Gli screenshot, se l'E2E può eseguirsi, sono del viewport, non full-page:
  `evidence/mini-minimal-viewport-*.png`.

[Report osservato nel cloud](../apps/desktop/evidence/MINI_MINIMAL_REPORT.md).
La resa visiva, il vero DPI Windows e il tasto F11 fisico restano gate locali.

## PowerShell e verifica Windows

Da checkout pulito; non cancellare o sovrascrivere il lavoro su Mini:

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
npm.cmd start
```

Fermarsi al primo exit code non zero. Dipendenze invariate; se il checkout non è
installato, eseguire prima `npm.cmd ci` e `npm.cmd run setup:electron`.
Non effettuare login o invii AI per questa prova UI.

Verifica manuale:

1. In finestra e fullscreen, confermare **nessuno scroll globale su entrambi gli
   assi** e compositore completo nel viewport. Provare resize, chat/stato aperti
   o chiusi, campo lungo e cronologia interna. Nessun pulsante, consenso o costo
   deve essere tagliato o coperto; Tab deve raggiungere i controlli attivi.
2. Provare scala Windows **100%, 125%, 150%**, anche con finestra piccola
   compatibile con i limiti nativi esistenti. Annotare risoluzione/scala e
   screenshot UI non personali. I viewport CSS dell'E2E non sostituiscono ciò.
3. Menu: chat nascosta → accesso al modello ancora disponibile; bozza e testo
   conservati quando riaperta. Esaminare impostazioni, temi, dettagli tecnici e
   demo offline; Escape chiude il menu e il focus ritorna al comando di apertura.
4. F11 e pulsante: entrare/uscire, verificare taskbar/title bar, comando di uscita
   a icona sempre raggiungibile e geometria della schermata. Non disattivare il
   sandbox per superare errori. Conservare l'allegato F11 sanitizzato se prodotto.
5. Microfono disabilitato, nessuna richiesta di permessi; costi e consenso
   leggibili. Movimento ridotto di Windows e opzione locale fermano le venature.

Inviare SHA, risultati reali, eventuali dimensioni/scala problematiche e screenshot
sanitizzati. Il candidato e la PR #10 restano **DRAFT / GUI Windows da convalidare**.
