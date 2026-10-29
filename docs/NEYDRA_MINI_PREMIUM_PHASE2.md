> Direzione corrente: [redesign minimale immersivo](NEYDRA_MINI_MINIMAL.md), prioritario rispetto a questa versione storica.

# NEYDRA Mini — Premium Tech, fase 2

Candidato della **PR #10, ancora DRAFT**, branch `feat/desktop-mini-interface`.
Punto di partenza: `d950e9ac85b5c80479a9398de94e755f7c7b9748`. La PR resta
impilata su `feat/desktop-chatgpt-plan` (#9). Nessun merge o release.

## Comportamento e perimetro

- Interfaccia nero/grafite con accenti arancioni e venature SVG curve, più visibili
  rispetto al primo slice e con scorrimento lento. Nessuna immagine generata,
  scena spaziale, avatar provvisorio o modifica al vero Mini.
- Palco sinistro vuoto e pronto al modello definitivo: illuminazione e guide
  discrete, didascalia piccola. Nessun personaggio fittizio e niente headline
  gigante al posto del modello.
- Conversazione centrale con messaggi utente/NEYDRA distinti, area cronologia
  scorrevole e compositore separato. Il pannello resta **montato quando nascosto**:
  input, testo progressivo e riferimenti della richiesta non vengono azzerati.
- Spiegazioni estese di piano, limiti e sessione in un dettaglio apribile; avviso
  costi e checkbox obbligatoria restano prima di ogni invio. **Gli handler della
  ChatPanel per auth/invio/consenso/Stop/reset sono identici al punto di partenza**:
  cambiano il markup e un callback di solo stato di presentazione.
- Card destre senza contatori stimati: ultimo stato noto della connessione,
  modello selezionato per nome/slug, catalogo quando disponibile, conversazione
  visibile in memoria e avviso quota non disponibile. Nessuna percentuale,
  settimana residua, token o credito inventato. Rimosso il polling periodico IPC
  duplicato della shell; il pannello segue lo stato presentato dalla ChatPanel.
- Impostazioni in un `<dialog>` nativo, con cinque sezioni: ChatGPT/modelli,
  tema/aspetto, voce/ascolto, finestra/visualizzazione, informazioni/strumenti.
  Il dialogo gestisce focus modale; Escape chiude, senza rimuovere i listener
  di Stop. Accesso/disconnessione restano nei controlli ChatGPT raggiungibili
  dalle impostazioni. Banco offline e licenze in una sezione tecnica distinta.
- Oxanium (titoli) e Manrope (lettura), file WOFF2 locali OFL 1.1 e avvisi completi
  inclusi nell'app. Testo ordinario e controlli 16 px, 17 px su schermi grandi;
  metadati almeno 14 px; titoli pannelli 22–26 px. Nessun CDN. Provenienza e hash:
  [NOTICE](../apps/desktop/src/renderer/fonts/NOTICE.md).
- Animazioni disattivate con `prefers-reduced-motion: reduce`, senza brevi loop
  residui. Un controllo aggiuntivo riduce il movimento per la finestra corrente;
  non viene simulata persistenza delle impostazioni.

> Follow-up F11 su Windows: [analisi del percorso tastiera, nuovo test e comandi di ripetizione](../apps/desktop/evidence/F11_WINDOWS_REPORT.md).

## Fullscreen e confini Electron

Il precedente HTML `requestFullscreen()` è sostituito da
[`BrowserWindow.setFullScreen`](https://www.electronjs.org/docs/latest/api/browser-window#winsetfullscreenflag).
Il main gestisce F11 tramite
[`before-input-event`](https://www.electronjs.org/docs/latest/api/web-contents#event-before-input-event),
ignora autorepeat, key-up e modificatori Ctrl/Alt/Meta. La UI mostra sempre un
comando **Esci da schermo intero** quando il main segnala lo stato nativo.
Non si usa massimizzazione, finestra frameless simulata o always-on-top.

Canale finestra separato dall'IPC ChatGPT: solo lettura dello stato e
`setFullscreen({enabled:boolean})`, schemi strict in main/preload, identità
finestra/main frame/URL verificata e notifiche booleane validate. Nessun metodo
generico di finestra, shell, filesystem o URL. Il preload continua a funzionare
con sandbox e senza dipendenze Node esterne.

CSP, sandbox, contextIsolation, blocchi navigazione/popup/download e permessi
restano attivi. L'allowlist locale aggiunge soltanto i file generati `.woff2`,
soggetti alle stesse restrizioni di origine/percorso/query. **Nessuna modifica**
a OAuth, token, endpoint, scope, provider, limiti o conferme del backend #9.
Nessun accesso a microfono/videocamera, companion circolare, Holo o voce.

Lo stato nativo è testabile con `isFullScreen()` e con gli eventi enter/leave;
**l'effettiva scomparsa di title bar/taskbar e il comportamento dei monitor
Windows restano una verifica visiva locale**. Un mock non può provarli.

## Test offline e significato delle prove

- Suite esistente auth/provider/IPC/security conservata.
- Unit aggiunti per DTO finestra/trust, F11, eventi preload e font allowlist.
- Renderer con React Testing Library + user-event + jsdom, **solo devDependencies**:
  chiusura/riapertura pannelli con input e stream conservati, impostazioni,
  riduzione movimento, stato noto, modello e consenso per ogni invio, Stop e
  separazione messaggi. Bridge, dialogo e stato finestra simulati; nessun login o
  modello reale. Non è una prova di layout/font/DPI/focus trap nativo.
- E2E Electron aggiornato: UI reale, dialogo, demo/Stop/Esc, fullscreen tramite
  pulsante/F11 e stato main, caricamento font, rete/permessi/popup/navigazione
  negati, assenza di Node nel renderer. Non preme OAuth e non invia AI reale.
- L'E2E include viewport CSS 1024×688, 853×573 e 760×800 e reduced-motion.
  **Non equivalgono** alla verifica del ridimensionamento OS Windows 125%/150%.

[Esiti cloud e blocchi osservati](../apps/desktop/evidence/MINI_PHASE2_REPORT.md).

## PowerShell — prova locale Windows senza richieste AI

Dalla root già utilizzata, controllare prima i file locali: non eseguire clean,
reset forzati o modifiche a `mini-asset-work/`, `references/` o Blender.

```powershell
cd D:\WORK\NEYDRA
git status --short
git fetch origin
git switch feat/desktop-mini-interface
git pull --ff-only origin feat/desktop-mini-interface
npm.cmd ci
npm.cmd run setup:electron
npm.cmd run check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run check:preload
npm.cmd run test:desktop
npm.cmd start
```

Se il branch non esiste ancora localmente:
`git switch --track origin/feat/desktop-mini-interface`, poi i controlli sopra.
Fermarsi al primo exit code non zero e conservare solo la diagnostica priva di
segreti. La suite usa socket sintetici soltanto su 127.0.0.1; non aprire login o
richieste AI per fare passare un test. Non disattivare il sandbox se l'avvio fallisce.

Verifica manuale, **senza nuovo OAuth/inferenza**:

1. Palette, venature visibili ma lente, font leggibili e nessun modello fittizio.
   Aprire/chiudere chat e stato dopo aver digitato un testo locale: l'input resta.
2. Aprire tutte le sezioni impostazioni. Provare Tab/Shift+Tab, Escape, ritorno
   del focus, scrolling, accesso ai controlli ChatGPT **senza premere login**,
   descrizione voce non implementata e banco offline con Stop/Esc.
3. Premere Schermo intero: verificare realmente che **barra del titolo e taskbar
   Windows siano nascoste**. Verificare pulsante di uscita sempre raggiungibile,
   F11 per uscire/rientrare, ripristino della finestra e monitor corretto. Inviare
   la descrizione di eventuali differenze, senza considerare `isFullScreen:true`
   da solo prova della taskbar nascosta.
4. Ripetere la lettura e l'uso dei controlli con scala Windows **100%, 125%, 150%**
   (Impostazioni → Sistema → Schermo), annotando risoluzione/scala. Controllare
   testo tagliato, scroll, selettore, consenso, Stop/Invia e dialogo. Per confronti
   usare testo non personale e acquisire screenshot prima di eventuali login.
5. Attivare movimento ridotto in Windows e il controllo locale: venature ferme,
   nessuna animazione residua. Provare una finestra più stretta e più bassa.
6. Registrare SHA, esiti comandi, fullscreen/taskbar/DPI effettivamente osservati,
   eventuale errore preciso e screenshot UI sanitizzati. Non condividere email,
   token, callback OAuth, account o conversazioni personali.

Le precedenti prove reali ChatGPT della #9 restano valide come evidenza separata.
Questo restyling non le ripete né ne amplia le conclusioni. La PR #10 resta in
bozza, con accettazione visiva e Windows **pendenti** fino al resoconto dell'utente.
