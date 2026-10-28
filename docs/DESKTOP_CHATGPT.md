# ChatGPT nel desktop — candidato in revisione

**Preparato, non convalidato nell'app Windows.** La prova della PR #6 dimostra
il probe Node con Plus, non questa integrazione Electron. La PR #8 ha già ricevuto
la verifica Windows offline del proprietario; i suoi PASS non si trasferiscono
automaticamente alla GUI modificata qui. Nessun OAuth o invio AI è stato eseguito
nel cloud. Nessun merge, release, deployment o workflow hosted avviato.

## Branch, fonti e perimetro

Branch `feat/desktop-chatgpt-plan`, base revisionata PR #8
`c0d879c8370b031b20cb2dffddedd8e4ff17eec6`, PR draft impilata su
`issue-4/windows-desktop-shell`. Dopo il merge della #8, rivalutare il diff e
cambiare la base in `main`; non unire autonomamente i branch.

Riutilizzo **per copia revisionata**, non import dal branch sperimentale:
`experiments/auth/auth.mjs` e `loopback.mjs` della PR #6,
`4cd91e91360a830d53fc3fcc13eb07c9f935e20c` (MIT). Il probe `run.mjs`, il prompt
fisso, storage sperimentale, Codex e `sse-proposal.mjs` non vengono eseguiti o
importati. Nessuna modifica a PR #6/#7, motore 3D o asset Mini.

Documentazione ufficiale ricontrollata il **28 ottobre 2026**:

- [Registrazione e sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in): client dinamico, host persistente, browser di sistema, loopback, PKCE e verifica identità.
- [Modelli e inferenza](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference): catalogo dell'account, `display_name` / `slug`, endpoint Responses pubblico.
- [Token](https://developers.openai.com/siwc/token-sharing-open-source/token-reference): scadenza e rinnovo; questo candidato scarta refresh e ID token e richiede nuova autenticazione alla scadenza.
- [Limitazioni preview](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations): solo testo e contesto esplicito in questa implementazione.
- [Sicurezza Electron](https://www.electronjs.org/docs/latest/tutorial/security).

Questi URL sono documentazione corrente, non snapshot immutabili. Ricontrollare
condizioni e idoneità prima della prova locale. Il percorso pubblico
`https://api.openai.com/v1/responses` è quello documentato per SIWC con OAuth del
piano: non viene usata una API key né un percorso di fatturazione API separato.

## Correzione host ID di registrazione (28 ottobre 2026)

Durante il primo avvio Windows della PR #9 il proprietario ha premuto
`Continue with ChatGPT` e il browser ha restituito
`invalid_authorize_request` con parametro `ext_agent_host_id`,
**prima del consenso e prima di qualsiasi richiesta Responses**.

**Causa nel codice identificata:** PR #9 persisteva e inviava un UUID
senza lo schema URI (`randomUUID()`), mentre il probe funzionante
della PR #6 emetteva `urn:uuid:${randomUUID()}`. La
[documentazione SIWC ufficiale](https://developers.openai.com/siwc/token-sharing-open-source)
richiede per gli UUID host il formato `urn:uuid:<UUIDv4>`.

**Fix nel medesimo branch:** la nuova registrazione salva un UUID URN;
il caricamento aggiorna **soltanto** il vecchio host ID UUID semplice
quando non esistono né `clientId` emesso né `subject` validato,
mantenendo identiche le 36 cifre/caratteri dell'UUID già persistito.
Se esiste un'associazione OAuth precedente, la registrazione viene
rifiutata senza essere alterata; non si rigenerano identificatori e
non si cancellano file dell'utente. `transaction()` rifiuta host ID
non conformi **prima** di aprire il browser.

Test aggiunti: URL authorize con URI host conforme, rifiuto del formato
errato, nuovo file valido, migrazione del file legacy senza identità,
protezione dei dati già registrati e rifiuto file malformati. Nessun
OAuth/inferenza reale effettuato durante la correzione.

**Da verificare su Windows** dopo aver chiuso la finestra precedente:
`git pull --ff-only`, `npm.cmd run check`, `lint`, `typecheck`,
`npm.cmd test`, `npm.cmd run build`, `check:preload`,
`test:desktop` e un avvio offline dell'app. Il codice aggiornato non
è ancora stato eseguito sul PC utente. Non premere nuovamente Continue
with ChatGPT fino al superamento dei test e a una decisione esplicita
sul nuovo tentativo di autenticazione.


## Callback ricevuto, app tornata disconnected: diagnosi per fase (28 ottobre 2026)

Il proprietario, dopo la correzione URN e i **69/69 test Windows**, ha
effettuato il primo nuovo sign-in reale nell'app Electron: il browser ha
mostrato **«Autorizzazione ricevuta. Torna a NEYDRA per la verifica.»**,
ma la GUI è passata brevemente da `connecting` a `disconnected`,
senza catalogo di modelli. Nessuna richiesta Responses è stata inviata.

**Attenzione:** il messaggio nel browser significa **callback accettato**
dal listener locale. **Non** dimostra che il codice OAuth sia stato
scambiato in token, che la firma dell'ID token e gli scope siano stati
verificati o che il catalogo modelli sia stato caricato.

L'implementazione precedente nascondeva ogni eccezione successiva al
callback dietro `unavailable`, impedendo di capire il problema.
Questa revisione aggiunge **solo diagnostica locale sanitizzata**,
con campi chiusi e validati `phase`, `code`, e `httpStatus`
facoltativo: `registration-load`, `listener`, `browser`,
`callback`, `client-save`, `token-exchange`, `account-save`
o `model-catalog`. Il campo `code` appartiene a una breve allowlist
di codici statici; errori inattesi diventano `local_error`.
Il renderer non riceve token, URL, error body, messaggi raw, state,
nonce, client ID né subject. La diagnostica viene cancellata al
nuovo tentativo, alla disconnessione e dopo l'accesso riuscito.

**Test offline:** scenari sintetici per invalid grant, JWT errato,
rifiuto catalogo, catalogo vuoto, errore storage, segreti esclusi
e schema IPC. Non sono stati eseguiti nuovi OAuth o invii reali
durante lo sviluppo. Non è ancora verificato quale fase abbia fallito
nell'ultimo tentativo; i dati sensibili del callback precedente non
vengono recuperati o riprodotti.

**Procedura:** chiudere NEYDRA, aggiornare il branch della PR #9,
eseguire `npm.cmd run check`, `lint`, `typecheck`, `test`,
`build`, `check:preload`, `test:desktop`. Solo dopo review dei
test e consenso per un **nuovo solo accesso**, aprire NEYDRA
e premere `Continue with ChatGPT` una volta, senza fare alcun
invio al modello. Riportare esclusivamente la riga UI
`fase / codice / HTTP`, non screenshot di account, URL OAuth
o dettagli del token. Nessun retry automatico, merge o rilascio.

## Catalogo modelli troppo grande: `model-catalog / oversized_json` (28 ottobre 2026)

L'ultima prova reale del proprietario ha confermato che OAuth/callback,
token e identità sono stati superati; il pannello mostrava
`Connessione interrotta: fase model-catalog, codice oversized_json`.
Il codice prima limitava `/v1/models` allo stesso tetto dei token
(256 KiB). Si tratta di un limite **locale**, non di una negazione
dell'account o di un errore del browser.

Correzione: **solo il catalogo** usa un tetto in memoria di 8 MiB,
con rifiuto oltre tale soglia, massimo 512 voci, filtri
`visibility:list` e campi `slug/display_name` limitati.
I token, la verifica dell'identità, i permessi, gli error body
e gli stream SSE mantengono tutte le restrizioni precedenti.
La soglia di 8 MiB è una scelta cautelativa locale e **non**
un valore ufficialmente garantito dall'API. Se il catalogo supera
ancora questo limite, non aggirarlo e non continuare per tentativi.

Test sintetici: catalogo >256 KiB correttamente letto; body
>8 MiB respinto, >512 elementi respinti, body token >256 KiB respinto.
Nessun login o modello reale interrogato da Codex per la correzione.
**Verifica Windows nuova ancora pendente**: chiudere l'app,
`git pull --ff-only origin feat/desktop-chatgpt-plan`,
eseguire `check`, `lint`, `typecheck`, `test`, `build`,
`check:preload`, `test:desktop`. Solo dopo, il proprietario
deciderà se ripetere **un singolo login senza richiesta AI**.

## Confini implementati

- Main: registra host/client emesso e subject verificato; avvia il listener
  **solo** dopo il clic `Continue with ChatGPT`; apre il browser tramite
  `shell.openExternal` con URL generato internamente. Nessun URL viene accettato
  dal renderer o restituito a esso.
- Loopback `127.0.0.1`, porta effimera, percorso `/auth/callback`; verifica metodo,
  Host, assenza di Origin, dimensione URL, state a confronto costante, scadenza,
  duplicati e riuso del callback. Timeout consenso 180 s; chiusura su annullamento.
- PKCE S256 e nonce nuovi per tentativo. ID token RS256 verificato con JWKS fissi:
  firma, issuer, audience/azp, nonce, subject, exp/iat/nbf; altri algoritmi sono
  rifiutati. Richiesti `resource.invoke` e `chatgpt.tokens.use.direct`.
- Access token, sessione e contesto soltanto in memoria del main. Refresh/ID token
  scartati, nessun rinnovo o login automatico. Scadenza controllata prima di usare
  la sessione (margine 5 s); HTTP 401 elimina la sessione. Crash, reload o chiusura
  eliminano credenziali e contesto. Nessun accesso a cookie o credenziali Codex.
- Il solo file `chatgpt-registration.json` in `app.getPath('userData')` contiene
  host ID opaco, client ID emesso e subject opaco: **nessun token o messaggio**.
  Serve a riusare la registrazione ed evitare nuovi host a ogni avvio. Mantenerlo
  privato e fuori da Git. Scrittura con rename e permessi restrittivi su Unix;
  ACL Windows da verificare. File corrotto => blocco, senza rigenerazione silenziosa.
  Primo scambio fallito conserva il client emesso; cambio subject viene rifiutato.
  Supporto iniziale a un solo account, senza UI per aggiungerne altri.
- IPC v2: soli metodi nominati, schemi strict in main/preload e risposta/eventi
  validati. Nessun token, header, URL OAuth, FS o subprocess generico nel bridge.
  Rimangono verifica finestra/main frame/URL, sandbox, contextIsolation,
  nodeIntegration disabilitata, CSP `connect-src 'none'`, blocco navigazione,
  popup, download e permessi della #8. Solo il main usa il trasporto OAuth.
- Catalogo ottenuto dopo identità e scope; soltanto modelli `visibility:list`.
  Nome e slug mostrati, nessuna scelta predefinita o indice fisso. Il main
  ricontrolla l'appartenenza del modello al catalogo prima del POST.
- Invio manuale del testo scelto: `store:false`, `stream:true`, contesto dei soli
  turni completati reinviato in `input`. Nessun tool/audio/upload/Codex. Fino a
  20 messaggi / 32000 caratteri di contesto in entrata; oltre il limite usare
  `Nuova conversazione`. Input 2000, risposta 16384 caratteri (unità UTF-16).
- Un'operazione per volta, UUID non riutilizzabili (budget 1000 per finestra;
  riavviare dopo il limite). Nessun retry, fallback, polling di rete o invio
  automatico al login/avvio. La lettura dello stato locale è soltanto IPC.
- Abort dalla UI/Esc, disconnessione, reload o chiusura raggiunge fetch e reader;
  eventi tardivi ignorati. Turni falliti/parziali/annullati non entrano nel contesto.
  Timeout HTTP 120 s per richiesta, redirect negati, allowlist di quattro endpoint.
  JSON di controllo limitato a 262144 byte.
- SSE: una sola risposta HTTP, mai un secondo POST per MIME mancante. SSE
  dichiarato oppure HTTP 200 con MIME assente e stream leggibile. JSON/HTML/altri
  MIME espliciti rifiutati. UTF-8 rigoroso, frame/data/event coerenti, massimo
  262144 byte, buffer 65536 caratteri, 512 frame. Prima `response.created`, ID
  stabile, poi `response.completed` con stato `completed` e stesso ID, quindi EOF
  valido. Errori, eventi dopo completion, stream troncato o falso completion =>
  errore anche se era comparso testo. La UI distingue il testo parziale dal
  completamento; indica quando il percorso senza MIME è stato validato.
- Errori solo con codici fissi (`quota`, `auth-required`, `unavailable`, rifiuti
  IPC). Nessun body/header/URL/errore grezzo viene mostrato o registrato.

La demo offline resta distinta e utilizzabile senza collegarsi. La UI mostra
che il palco 3D e la voce non sono ancora collegati.

## Costi, consenso, disconnessione

Il client **non può verificare automaticamente quota, crediti o fatturazione**,
né imporre al server il solo consumo incluso con un parametro documentato.
Prima di ogni invio il proprietario deve verificare quota inclusa disponibile,
crediti acquistati **zero**, ricarica automatica disattivata e assenza di uso a
consumo nel workspace. Se non è possibile verificarli, **non inviare**.
La checkbox viene azzerata a ogni invio e al cambio testo/modello. L'utente
approva anche il reinvio del contesto precedente. Nessuna API key o credito
viene letto, configurato o acquistato dal programma.

Il precedente controllo senza addebiti era un'osservazione limitata nel tempo,
**non una garanzia per invii futuri**. Anche annullare può lasciare consumo già
avvenuto. Dopo una prova controllare privatamente Usage/limiti, saldo crediti e
addebiti, attendendo l'aggiornamento dei contatori; non ripetere per inseguire un
PASS. `Disconnetti` cancella sessione e contesto locali, ma **non revoca** il
consenso remoto: usare ChatGPT → Settings → Security and login → Sign in with
ChatGPT → NEYDRA → Disconnect. La registrazione locale resta per la stessa identità.

## Verifica PowerShell: prima solo offline

In un checkout pulito (Node 24; nessuna modifica locale da perdere):

```powershell
cd D:\WORK\NEYDRA
git status --short
git fetch origin
git switch feat/desktop-chatgpt-plan
git pull --ff-only origin feat/desktop-chatgpt-plan
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

Controllare l'exit code dopo ogni comando e fermarsi al primo errore.
`npm test` usa trasporti sintetici più due test HTTP **solo su 127.0.0.1**;
non apre OpenAI o browser reali. Se firewall/policy impedisce il bind,
registrare il blocco senza privilegi amministrativi. L'E2E non preme il pulsante
OAuth: verifica la demo, assenza di sessione iniziale, invio reale disabilitato,
IPC, cancellazione, reload e protezioni Electron. Non usare `--no-sandbox`.

Nella GUI avviata manualmente verificare dimensioni, scroll, tastiera, leggibilità,
mode distinte, nessun modello selezionato, avviso quota e invio disabilitato.
Provare demo/Stop/Esc; chiudere. Questa fase non autorizza inferenza.

## Gate successivo: prova nell'app Windows, solo del proprietario

**Non eseguita da questo task e non automatizzata.** Dopo aver esaminato diff e
risultati offline, il proprietario può decidere autonomamente se autorizzarla.

1. Aprire un terminale dedicato e l'app con `npm.cmd start`. Non importare token
   o file del probe #6. La registrazione Electron è separata da quella del probe;
   al primo utilizzo può comparire una nuova connessione NEYDRA.
2. Controllare account, workspace, quota inclusa, crediti zero e ricarica off;
   se qualcosa è incerto, fermarsi. Premere `Continue with ChatGPT` e controllare
   app/permesse nel browser di sistema. Provare anche diniego o annullamento in
   un tentativo separato **senza inviare testo**. Non pubblicare URL o callback.
3. Dopo il consenso verificare stato connesso e catalogo reale. Selezionare
   esplicitamente un modello per **nome/slug**, senza usare un indice presunto.
   L'accesso e il catalogo non devono causare nessun invio Responses.
4. Se si autorizza una prova reale: scrivere un testo breve, non personale, ad
   esempio `Rispondi esattamente: NEYDRA_DESKTOP_OK`. Ricontrollare i limiti,
   selezionare la checkbox e premere **una sola volta** `Invia a ChatGPT`.
   Osservare testo progressivo, completion e l'eventuale nota SSE senza MIME.
   HTTP 200 o testo parziale non sono sufficienti. Non fare retry automatici o
   ripetizioni per ottenere il risultato desiderato.
5. Controllare privatamente quota/crediti/addebiti dopo il test. Segnalare solo
   riepilogo sanitizzato: commit, comandi offline, browser aperto, connessione,
   modello scelto, completion sì/no, MIME mancante validato sì/no, controlli quota
   eseguiti sì/no ed eventuale codice fisso. Niente token, subject, email, URL,
   body/risposte integrali, screenshot dell'account o conversazioni personali.
6. Cancellazione di un vero stream e secondo turno sono verifiche ulteriori:
   richiedono una distinta decisione e gli stessi controlli prima di **ogni**
   richiesta. Sono già coperte con fixture; non inviare richieste aggiuntive solo
   per ripetere test offline. Disconnessione/riavvio devono perdere la sessione;
   il futuro accesso deve riusare la registrazione esistente.

L'integrazione resta **UNVERIFIED su Windows** finché il proprietario non avrà
provato questo percorso nell'app e riportato le osservazioni. Review sicurezza,
ACL, supporto account, quota e policy preview rimangono gate aperti.
