# Companion V2 — chiusura nativa e recupero main

29 ottobre 2026. Branch `feat/desktop-mini-interface`, PR #10 **DRAFT**.
Baseline `c36b29bf2de023beb39a130fd30d37df546f0b32`. Nessuna nuova misura Windows
del candidato corrente; il report distingue fatti del proprietario e prove offline.

## Evidenza Windows precedente

Il proprietario ha verificato check/lint/typecheck/build, **142/142 unit**, tre
preload ed E2E immersivo PASS. Il JSON dei cinque cicli contiene dieci aperture
con geometria stabile a DPR 1,25: core 120×120, corpo 112×112, satelliti nativi
73×72/72×73, contenuto/viewport 72×72 e pulsanti 48×48 a (12,12). Solo i due
setPosition iniziali producono il primo +1; zero ulteriori move nelle riaperture,
nessuna crescita su hide/show/focus. Questi fatti riguardano c36b29, non un PASS
companion completo.

Con `--timeout=90000`, il companion fallisce dopo 24,1 secondi al recupero dopo
`BrowserWindow.fromId(coreId).close()`: main invisibile/non focalizzato, core
ancora visibile, zero satelliti visibili. Lo screenshot mostra TypeError
"Object has been destroyed" in `OrbitController.changed → close → callback
BrowserWindow`. Non è un errore di budget timeout.
[Commento del blocco](https://github.com/francescocella-dev/neydra/pull/10#issuecomment-6483923898).
Il JSON di quel run non è stato reso disponibile in questa task: non si deduce
l'esatto primo evento o l'ordine screenshot/asserzione dallo stack soltanto.

## Causa identificata e distinzione dei problemi

1. `changed` verificava soltanto BrowserWindow.isDestroyed prima di inviare al
   core. `reveal/conceal` avevano la stessa lacuna: i webContents possono essere
   già distrutti mentre il wrapper della finestra è ancora vivo. I callback
   closed dei figli invocavano close e false notifications anche ripetutamente.
2. Il recupero host chiudeva il menu e distruggeva i figli **prima** di chiamare
   controller.recover. Inoltre il controller eseguiva beforeChange prima di
   mostrare il main. Un errore in quei callback poteva impedire il ripristino.
   Aspettare soltanto il closed del core lasciava scoperta la fase asincrona
   durante close/distruzione dei contenuti e dei figli.

Entrambi i difetti sono riprodotti separatamente nei modelli offline. Un test
simula webContents morto con finestra ancora viva: la guardia evita IPC, ma il
main resta nascosto finché non arriva un evento di recupero. Un altro inietta
un errore reale di notifica e dimostra che il main viene mostrato/focalizzato
prima che l'errore venga ripropagato. Il riscontro è coerente con lo stack Windows;
**non si assume che elimini qualsiasi ulteriore problema nativo di focus/close**.

## Modifiche applicative

- Host marca le finestre in chiusura e controlla separatamente finestra e
  webContents. Nessun invio a destinatari in chiusura/distrutti. Se una send
  distrugge il destinatario rientrantemente, viene filtrato soltanto il noto
  TypeError "Object has been destroyed" con stato successivo effettivamente morto;
  errori di finestre vive sono ripropagati, non ignorati.
- Il core viene ritirato una sola volta su close, closed, perdita dei contenuti
  o errore. Core/reference floating vengono staccati prima di recuperare il main;
  i figli sono marcati in chiusura e i timer cancellati prima della cascata.
- Il main originale viene ripristinato già su close. La pulizia dei figli è
  successiva e garantita con finally; callback rientranti o tardivi di un vecchio
  genitore non possono notificare un core ritirato.
- Una shell senza contenuti viene finalizzata in microtask, dopo il ritorno
  dallo stack nativo. Un guard separato impedisce destroy rientranti.
- Orbit.close cambia stato prima dei callback, protegge la rientranza e notifica
  false soltanto per una transizione attiva; dispose è idempotente e non notifica
  il genitore. La mappa dei figli viene staccata prima dei destroy.
- CompanionController.restore protegge le chiamate rientranti. Una notifica che
  fallisce viene conservata, il main ripristinato e l'errore autentico ripropagato.
  Il riferimento al Mini chiuso viene eliminato prima di restore, senza hide
  sulla shell morente. Una creazione già recuperata non rifocalizza il main nel
  proprio catch tardivo.
- Fade/blur e timer handshake sono cancellati; la perdita dei webContents abortisce
  anche un ready pendente. Before-quit imposta disposed prima del teardown,
  impedendo recuperi durante la vera uscita. Nessun main ricaricato/ricreato.

Dimensioni, CSS e algoritmi di posizionamento/DPI non cambiano. Cinque cicli/dieci
aperture E2E, confronti geometrici esatti, centri, collisioni/work area e click
restano invariati. Core 120×120, corpo 112×112, pulsanti 48×48, contenitori
richiesti 72×72; nessuna nuova tolleranza o resize. Nessun cambiamento a F11,
interfaccia immersiva, sandbox/CSP/partizioni/preload, autorizzazioni DTO/origini,
OAuth/Responses/consenso, voce o asset Mini/Blender/Holo. I sender morenti vengono
rifiutati; nessun canale IPC nuovo.

## Regressioni e diagnostica

Il mock ora separa la distruzione webContents da BrowserWindow e modella close
asincrono, inclusa la cascata genitore/figli. Casi verificati:

- close del core con satelliti esistenti ma nascosti;
- webContents core morto mentre la finestra è viva, e successivo evento destroyed;
- figli chiusi durante la cascata, close/closed ripetuti e callback rientranti;
- fade/blur pendenti cancellati, nessun IPC/timer dopo distruzione;
- contenuti morti durante showInactive, senza reveal o invii al destinatario morto;
- handshake interrotto senza timer residuo o retry;
- stessa istanza main, webContents e sessione, zero reload, visibilità e focus;
- vero Exit/before-quit ripetuto senza show/focus indesiderati;
- errori autentici ancora riportati dopo recupero e dispose idempotenti.

Il probe orbitale solo test ora controlla isDestroyed dei webContents prima di
getURL: nemmeno l'osservatore deve provocare un crash nella fase intermedia.
Il nuovo probe lifecycle osserva close/closed/contents-destroyed/show/hide/focus/
blur/restore/minimize per main/core/figli, ID e stato window/contents separato.
Le osservazioni di close/destroyed precedono i callback di produzione; nessun
preventDefault e nessun handler che catturi eccezioni. uncaughtExceptionMonitor
conta gli errori senza sopprimere il comportamento Electron. Nessun payload di
errore, testo chat/input, token, account, URL o screenshot desktop raccolto.

E2E mantiene il **vero BrowserWindow.close**, aggiunge campioni prima/dopo e
verifica zero eccezioni main osservate dopo il recupero. I cinque cicli e tutte
le asserzioni geometriche sono preservati. Il JSON autonomo resta scritto dal
teardown prima dell'attach(path). Il finally tenta di aggiungere il lifecycle;
se il processo non risponde, la raccolta finale può mancare e i campioni precedenti
non vanno interpretati come prova dell'assenza di errori.

## Risultati effettivamente eseguiti

| Controllo | Esito cloud |
| --- | --- |
| check, lint zero warning, typecheck | PASS |
| suite offline | **157/157 PASS, 17 file, zero skip** |
| regressioni controller/host/orbit mirate | **44/44 PASS** |
| probe lifecycle | PASS; include errore reale non intercettato e rimozione listener |
| build e tre preload strutturali | PASS, VM mock, non prova sandbox Windows |
| persistenza JSON dopo FAIL | PASS, file autonomo e attachment |
| Electron E2E con budget 90 s | **entrambi BLOCKED prima della finestra**, SUID Linux / SIGTRAP |
| Nuovo recupero/focus nativo Windows | **NON ESEGUITO qui** |

Comando effettivo da apps/desktop:
`DEBUG=pw:browser npm run test:desktop -- --output=test-results/close-recovery-1793286307762 --timeout=90000`.
Entrambi i test rilevati falliscono al launch con `setuid_sandbox_host.cc:172`.
Nessun chmod, elevazione o --no-sandbox. JSON verificato su disco:
`apps/desktop/test-results/close-recovery-1793286307762/companion.e2e.ts-companion-6323a-menu-and-session-continuity/companion-v2-geometry.json`.
Contenuto `[]`, coerente con zero finestre disponibili. Nessuna nuova misura GUI
inventata, nessun allentamento delle asserzioni o timeout configurati. I 90 s sono
il budget CLI della verifica già usata dal proprietario, non la soluzione al crash.

Nessun git clean/reset, cancellazione di file non tracciati, asset o screenshot.
Nessun login, invio AI reale, merge o release. PR #10 sempre DRAFT.

## Verifica Windows del nuovo candidato

Chiudere NEYDRA, mantenere la diagnostica precedente. Fermarsi al primo errore
nei controlli; output nuovo per conservare gli altri run:

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
$closeOutput = "test-results/close-recovery-" + [guid]::NewGuid().ToString("N")
npm.cmd run test:desktop --workspace @neydra/desktop -- "--output=$closeOutput" "--timeout=90000"
Get-ChildItem (Join-Path .\apps\desktop $closeOutput) -Recurse -File -Filter companion-v2-geometry.json |
  Select-Object FullName, Length
```

Non ripetere il vecchio SHA. Sul nuovo run devono completarsi cinque cicli,
chiusura nativa con satelliti nascosti, recupero main con focus/bozza invariata,
ricreazione del Mini, recupero con Invio e vera uscita dall'app. Nessuna eccezione
main e nessun processo invisibile residuo. Un PASS unitario non certifica questo
percorso Windows: condividere SHA, esito e nuovo JSON su FAIL. Analizzare le fasi
before/after-native-core-close, gli eventi lifecycle e i flag window/contents;
non attribuire automaticamente ogni mancato focus a una send.

Dopo 2/2 E2E PASS: verifica fisica con X/Alt+F4 sul Mini, menu aperto/nascosto,
minimize/fullscreen/F11, focus e bozza/transcript/modello/connessione preservati;
Exit senza riapertura del main. Ripetere a DPI 100/125/150% e bordi/monitor come
prima, senza login o invio AI. **Nessun nuovo PASS Windows dichiarato dal cloud.**
