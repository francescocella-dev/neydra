# NEYDRA — Due riduzioni fisse, verifica del candidato

**Report storico di d5df904.** Le successive correzioni Windows e il notch
superiore sono descritti nel [report aggiornato](ISLAND_WINDOWS_CORRECTION_REPORT.md).
Le misure della capsula e gli esiti qui sotto si riferiscono a quel candidato.

29 ottobre 2026. PR #10 DRAFT, branch feat/desktop-mini-interface, baseline
`e492b39385d431d64a411f1dfb78d172590ef407` controllata prima delle modifiche;
working tree inizialmente pulito. Nessun file personale rimosso o sovrascritto.

## Evidenza del proprietario e nuova decisione

Il proprietario ha verificato e492b39 su Windows: check/lint/typecheck/build,
157/157 offline e 2/2 Electron E2E PASS, tre preload strutturali PASS. Nella prova
fisica il drag libero sposta progressivamente il Mini verso l'alto e rende poi
inutilizzabile il menu. L'approvazione automatica non era un'approvazione fisica.
[Decisione di prodotto](https://github.com/francescocella-dev/neydra/pull/10#issuecomment-6504630842):
rimuovere il drag end-to-end, offrire Mini fisso e NEYDRA Island.

## Implementazione

- Mini richiesto 120×120 e corpo 112×112 invariati; ancorato alla workArea in basso
  a destra, 24 DIP di margine. Island richiesto 240×64, corpo 232×56/raggio 28,
  centro orizzontale della workArea e 8 DIP dal bordo superiore. Margini adattati
  solo per aree piccole; niente clipping o resize forzato.
- Display scelto con screen.getDisplayMatching sui bounds del main (normal se
  minimizzato). Nessun posizionamento relativo al suo angolo o al cursore.
  Chiave mode/display/scala/workArea evita setter ripetuti; coordinate già uguali
  non vengono reinviate. Nessun handler moved che rincorra il proprio setPosition.
- Movable false, nessuna pointer capture/RAF/IPC o stato drag nel prodotto.
  Click/Invio/Spazio usano un solo click nativo; menu e navigazione rimangono.
- Island usa CSS proprio grafite/arancio e font locale, nessun asset o codice
  CouCou. Il menu è lo stesso gruppo di due satelliti isolati, disposto dal
  layout geometrico sotto il rettangolo superiore senza collisioni o clipping.
- Tre contesti/preload come prima: main, companion, orbit. Il companion riceve
  solo circle/island tramite getMode; quattro vecchi metodi di movimento rimossi.
  Nessuna credenziale, richiesta AI, permesso o API account nuova.
- Due radio accessibili in Impostazioni, valore corrente e stato salvato/fallback.
  Salvataggio main-only con DTO strict su canale dedicato, non accessibile ai figli.
  get/set validati anche nel preload principale; nessun path ricevuto dal renderer.
- reduction-preference.json contiene solo versione 1 e modalità. Lettura bounded,
  default sicuro, errori sanitizzati e scrittura atomica/serializzata. Su errore
  usa circle per la sessione senza retry; ultimo file valido preservato. Una scelta
  non salvata non viene promessa persistente al riavvio.
- Cambio selezione applicato alla prossima riduzione, ricreando solo companion/
  satelliti. L'attesa asincrona della preferenza è inclusa nell'epoch pendente:
  restore/quit annullano anche quella fase. Controller e492b39 e regressioni di
  close/webContents/teardown restano, inclusa chiusura nativa in entrambe le forme.

## Verifiche effettive

| Controllo | Esito |
| --- | --- |
| check, lint zero warning, typecheck | PASS |
| unit/renderer offline | **170/170 PASS, 19 file, zero skip** |
| build | PASS, main + tre preload + tre renderer |
| check tre preload | PASS, VM strutturale/mock, non prova sandbox Windows |
| sintassi script diagnostico manuale | PASS |
| diff check e audit assenza drag nei percorsi prodotto | PASS |
| discovery Playwright | **3 test** |
| Electron E2E dopo build | **3 BLOCKED prima della prima finestra**, sandbox Linux SUID / SIGTRAP |
| nuova GUI Windows/visuale Island/gesti fisici | **NON ESEGUITI** |

I test coprono file mancante/corrotto/campi extra/mancanti/versione o modalità
ignota/oversize, errore lettura/scrittura, scritture seriali, solo versione/modo
sul disco, riapertura con nuova istanza del reader e nessun temporaneo residuo.
Una reale scrittura ostacolata da una directory dimostra fallback senza rimuovere
l'ostacolo. I test rimuovono solo directory temporanee da loro create.

Test geometrico sintetico per entrambe le forme su workArea reali separate,
negative/taskbar e scale 1/1,25/1,5: ancoraggio e satelliti validi, Island con menu
sotto il core; nessuna prova reale del compositor/DPI Windows nel cloud. Test di
riposizionamento verificano configurazione identica senza setter, cambio area e
matched display/normal bounds. I vecchi comandi drag sono ora richieste invalide;
nessun metodo rimasto nel bridge o controller. Mouse, Enter/Space senza doppia
attivazione e rimozione listener sono coperti.

Le regressioni di crash, distruzione webContents prima della finestra, callback
rientranti, timer, errori autentici, focus e vera uscita sono conservate; il caso
core.close con figli nascosti viene eseguito sia circle sia island. UI di scelta,
salvataggio e fallback non invoca connectChatGPT/startChatGPT.

E2E parametrizzato circle/island: per ciascuno cinque cicli e dieci aperture dopo
gesti senza spostamento, uguaglianza esatta di native/content bounds, vincoli,
viewport/DPR e geometria visibile. Circle conserva 120/112 esatti; Island verifica
232×56 senza assumere una misura nativa OS sempre identica a 240×64. Entrambi
verificano ancoraggio, menu, collisioni, focus/bozza/DOM/sessione, core.close,
ricreazione, Exit senza main e preferenza dopo riavvio reale del processo.
Main immersivo/F11 e assertSingleViewport conservati; la sola allowlist del main
è aggiornata per i due metodi di preferenza.

I profili E2E sono isolati sotto l'output. La flag user-data-dir è supportata dal
[sorgente Electron v45.1.0](https://github.com/electron/electron/blob/v45.1.0/shell/app/electron_main_delegate.cc)
e il test verifica app.getPath(userData) prima delle selezioni. Questo impedisce
ai test di sovrascrivere la preferenza dell'app normale; non è un nuovo hook di
configurazione o una riduzione delle protezioni di produzione.

Tentativo reale cloud da apps/desktop:
`DEBUG=pw:browser npm run test:desktop -- --output=test-results/fixed-modes-1793298902195 --timeout=90000`.
Tre fallimenti al launch, `setuid_sandbox_host.cc:172`, exit 1. Nessun chmod,
elevazione o --no-sandbox. Due JSON autonomi companion-v2-geometry.json sono
presenti nei rispettivi output circle/island, più attachment; contenuto [] perché
nessuna finestra è stata disponibile. Non equivalgono a un PASS GUI.

Checklist React applicata a SettingsPanel/ReductionSettings: componente distinto,
fetch iniziale con cleanup per effetto, salvataggio solo su evento, lock anti-doppio
invio, risultati validati nel bridge, radio native e stato accessibile. Nessuna
libreria grafica, CSS-in-JS o dipendenza introdotta. La resa fisica non è certificata
con jsdom o con l'ispezione CSS.

## Confini e gate Windows

OAuth/Responses, consenso, ChatPanel, contratti account, voce, sandbox/CSP,
autorizzazioni/origini, renderer-session, geometria/CSS orbit e asset Mini/Blender/
Holo invariati. Tre preload isolati conservati, con API main ampliata solo per
la preferenza e API companion ridotta. Nessuna persistenza di coordinate o chat.
Nessun reset/clean, cancellazione di evidence o file personali, login, invio AI,
merge o release. PR #10 DRAFT, commit soltanto dopo i controlli disponibili.

[Procedura completa PowerShell e checklist visiva](../../../docs/NEYDRA_REDUCTION_MODES.md#prova-windows).
Attesi 170/170 unit e **3/3 E2E del nuovo candidato**, non i vecchi 2/2 e492b39.
Con output UUID mantenere tutti i risultati precedenti. Dopo gli E2E: avvio normale,
scelta/salvataggio e riavvio di entrambe le modalità; gesti fisici e menu ripetuto,
workArea/DPI/monitor, focus, bozza/transcript e uscita. Approvazione visiva Island
separata. **Nessun nuovo PASS Windows o visuale dichiarato qui.**
