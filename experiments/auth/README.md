# Esperimento P0A: autenticazione ufficiale con piano ChatGPT

**Esito del probe OAuth + inferenza testuale diretta: `PASS`**
(**28 ottobre 2026, prova reale eseguita e riferita dal proprietario**).
Identità e permessi del piano ChatGPT verificati, modello `gpt-5.6-luna`,
`completed:true`, `expectedText:true` e
`missingMimeStreamValidated:true`. Il proprietario ha segnalato **zero
crediti acquistati e nessun addebito o consumo visibile** dopo il test.
La fatturazione non è certificata dal programma (`billingVerified:false`);
integrazione Codex, Electron e prodotto completo **`UNVERIFIED`**.
[Fonti, prove e limiti](FINDINGS.md). Nessuna modifica al 3D.

**Follow-up corrente:** il test reale singolo è già riuscito; non richiedere
ulteriori ripetizioni per provarne il completamento. Per NEYDRA rimangono
in revisione sicurezza, OAuth/refresh nel processo main, confini IPC, UI,
voce e turno Codex (non verificato). La PR rimane in bozza; le istruzioni
d'esecuzione riportate sotto sono un runbook storico/manuale e **non**
autorizzano nuove chiamate.

Questo è un esperimento **Node per il futuro processo main di Electron**: non
include una finestra Electron, un renderer o un'applicazione pronta da distribuire.
Non richiede installazione npm, chiavi API, backend o servizi aggiuntivi.

## Experimental strict handling for HTTP 200 with missing Content-Type

This branch contains a narrowly scoped strict SSE compatibility fix in
`auth.mjs`, introduced after two owner-reported HTTP 200 / missing-MIME
responses. **The owner subsequently verified it on one real authenticated
response (2026-10-28): `completed:true`, `expectedText:true`,
`missingMimeStreamValidated:true`.** This is a probe result, not production
security approval or proof of billing behavior across future usage.

Unlike the previous strict MIME guard, a `200` with a missing/blank MIME and
an actual ReadableStream can now be inspected **in that same HTTP response**.
The client attempts to validate SSE framing, UTF-8, a `response.created`
envelope with a stable response ID, events in the `response.*` namespace and
a matching terminal `response.completed`. A successful result adds
`missingMimeStreamValidated:true` and still separately reports
`expectedText:true/false`. It never prints the generated text.

Safeguards: an explicit JSON/HTML/other MIME remains blocked; a missing body
or non-200 response without MIME remains blocked; 262144 bytes cumulative,
65536 buffered characters and at most 512 SSE frames/events, with the existing
request timeout and output length cap; no retries, endpoint changes, key-based
billing fallback, raw response logging or automatic second request.
Arbitrary JSON/HTML, malformed SSE, mismatched response IDs, failure events,
incomplete streams and absent completion fail closed.

The separate `sse-proposal.mjs` is still an isolated offline research artifact,
**not** imported into production. The test
`test/missing-mime-runtime.test.mjs` verifies this new runtime path exclusively
through mocked response bodies.

The owner ran **78/78 Windows offline tests** before explicitly authorizing
the successful 2026-10-28 real-account verification. No further real call is
needed to prove the one-turn result; the branch is still a research prototype
awaiting product/security review. Third-party OSS test tools are unnecessary.

## Verifiche locali riproducibili

Prerequisiti: Node.js 24 o successivo, terminale PowerShell interattivo sul computer
dell'utente e browser di sistema. Per il probe Codex occorre anche la CLI ufficiale
già installata: [istruzioni OpenAI](https://learn.chatgpt.com/docs/cli).
Non servono `codex login`, token preesistenti o abbonamenti aggiuntivi per l'handshake.

Nel checkout del branch `auth/issue-2-official-chatgpt-feasibility`:

```powershell
cd experiments/auth
npm run check
npm test
$env:NEYDRA_TEST_LOOPBACK = "1"
npm test
Remove-Item Env:\NEYDRA_TEST_LOOPBACK
```

Al commit `cfac788`, il proprietario ha verificato su Windows la suite
completa con i test socket attivati: **78 superati, 0 falliti, 0 saltati**.
La suite senza socket attivati ne salta 2. I callback sintetici dei test non aprono OpenAI e non
rappresentano un consenso OAuth. Se il bind locale è vietato, quei test non sono
verificati: non aggirare firewall o policy con privilegi amministrativi.

`check` controlla la sintassi di tutti i moduli. Non è un lint né un typecheck.
Questo slice JavaScript non ha transpiler, build, asset o dipendenze condivise.

## Verifica reale del piano Plus

1. Rileggi le fonti in `FINDINGS.md`: disponibilità e preview possono cambiare.
   In ChatGPT verifica il piano Plus personale idoneo e la quota inclusa residua.
   Registra privatamente i valori prima del test. **Il saldo di crediti acquistati
   deve essere zero e la ricarica automatica disattivata.** Non acquistare nulla
   per soddisfare il test. Se queste condizioni non sono verificabili, termina con
   `BLOCKED`; il client non può imporle al server con un parametro documentato.
   Disabilita anche l'uso di crediti della connessione NEYDRA se quel controllo è
   disponibile. Non usare un workspace con fatturazione a consumo.
2. Usa un terminale privo di `OPENAI_API_KEY`, `OPENAI_ADMIN_KEY`, `CODEX_API_KEY`
   e `ACCESS_TOKEN`. Il programma rifiuta queste variabili e non legge credenziali
   di Codex o del browser. Non cancellare credenziali da altri programmi: apri un
   terminale dedicato e rimuovi soltanto le variabili dalla sua sessione.
3. Avvia:

   ```powershell
   node run.mjs --included-usage-only
   ```

4. Dopo aver verificato le condizioni, digita `SOLO_PIANO`. Il programma avvia
   prima il listener locale e mostra un URL di autorizzazione. Aprilo manualmente
   **nel browser di sistema di questo stesso computer**. Non pubblicare l'URL,
   non inviarlo al cloud e non incollare il callback nel terminale.
5. **Intervento indispensabile del proprietario:** accedi al tuo account reale,
   seleziona il workspace previsto, controlla il nome NEYDRA e i permessi e scegli
   se autorizzare l'uso del piano. Non approvare acquisti, crediti o richieste
   inattese. Il cloud non può compiere questo passaggio per te. Il browser torna
   alla callback locale; entro tre minuti il terminale prosegue oppure interrompe
   il tentativo. Un diniego non causa alcuna inferenza.
6. Il client verifica identità e permessi e mostra i modelli visibili per quella
   connessione. Seleziona un numero. **Prima di `INVIA`**, ricontrolla nel browser
   quota inclusa, saldo crediti zero e ricarica disattivata, anche per la nuova
   connessione. Quindi autorizza una sola richiesta dal prompt fisso non personale
   `Rispondi esattamente: NEYDRA_AUTH_OK`. Non ci sono retry automatici.
7. Il risultato mostra stato, booleani e metadati sanitizzati descritti sotto.
   `completed: true` richiede un
   evento terminale di successo; `expectedText: true` conferma la risposta attesa.
   Un HTTP 200, un frammento di testo o il catalogo non bastano. Il programma
   lascia comunque `status: UNVERIFIED` per i controlli **automatici** di
   fatturazione e Codex, anche in caso di inferenza diretta riuscita.
8. Dopo il test controlla Usage/limiti dell'app, saldo crediti e assenza di nuove
   spese nelle impostazioni dell'account; attendi l'eventuale aggiornamento dei
   contatori. Non fare altri invii per inseguire un risultato. Copia
   `evidence.example.json` in `evidence.local.json` e compila soltanto ciò che hai
   osservato. Mai includere email, subject, host ID, client ID, token, URL OAuth,
   conversazioni, screenshot dell'account o estratti completi delle risposte.

`PASS` per l'autenticazione/richiesta diretta è una decisione manuale, soltanto
quando identità, permesso, completamento, testo atteso e tutti i controlli di costo
sono confermati. Il solo handshake Codex non prova l'inferenza Codex. Se manca
evidenza resta `UNVERIFIED`; se serve un percorso non supportato, pagamento o la
quota non è disponibile, indica `BLOCKED` con il codice sanitizzato e fermati.

## Diagnostica sicura della risposta HTTP

La causa del vecchio `httpStatus:null` era locale: il guard `expected_event_stream`
creava `Stop` senza passargli i metadati della risposta già ricevuta. Inoltre
accorpava tipo di contenuto e corpo assente in un solo errore. Non dimostrava
assenza di risposta HTTP né fallimento OAuth. I valori originali non sono
recuperabili dal vecchio log; non vanno inventati.

La CLI ora emette un insieme fisso di campi, anche per errori durante lo stream:

| Campo | Significato |
|---|---|
| `httpStatus` | Stato effettivo della risposta ricevuta, anche 2xx; `null` se non disponibile. |
| `contentTypeCategory` | Solo `sse`, `json`, `html`, `missing`, `other`; `null` senza metadati HTTP. Mai il Content-Type grezzo o i suoi parametri. |
| `hasBodyStream` | Presenza di un ReadableStream nel corpo Fetch. `true` non prova che contenga SSE o sia completo; `false` distingue il corpo assente, `null` significa non osservato. |
| `requestId` | Solo `x-request-id`, se corrisponde interamente a `req_` + 32 cifre esadecimali (36 caratteri, case-insensitive); conservato senza alterazioni. Altrimenti `null`. Nessun recupero da altri header, token o corpo. |
| `bodyShape` | Campo per la sola forma degli errori non-2xx. Rimane `null` per risposte 2xx; nel caso speciale HTTP 200 senza MIME, il corpo può essere letto e validato come SSE **senza** esporne il contenuto. |

Il filtro del request ID è una scelta prudenziale locale, non una garanzia sul
formato di ogni identificativo OpenAI. `null` può significare assente oppure
scartato. Valori troppo lunghi, email, URL, credenziali, ID multipli e caratteri
di controllo sono esclusi interamente, senza pubblicarne una porzione troncata.

Esempio **esclusivamente simulato**, non ricostruzione della risposta dell'utente:

```json
{"status":"BLOCKED","reason":"expected_event_stream","httpStatus":200,"bodyShape":null,"contentTypeCategory":"json","hasBodyStream":true,"requestId":null}
```

Il guard riconosce `text/event-stream` normalizzato, indipendentemente
da maiuscole e parametri; una semplice sottostringa non basta. JSON, HTML e
un corpo assente continuano a bloccare l'inferenza. **In presenza di HTTP 200,
un corpo disponibile e MIME mancante**, il parser può leggere **la stessa
risposta** e validarne rigorosamente gli eventi SSE, senza ripetere la richiesta.
La prova reale del 28 ottobre ha confermato `response.completed` e il testo
esatto atteso. Per dettagli di limiti, rischi e evidenza consulta
[FINDINGS.md](FINDINGS.md). Nessun retry o fallback.
Lo schema di `evidence.example.json` è versione 2.

Il prototipo `sse-proposal.mjs` rimane un'analisi isolata con fixture;
**non è importato dal percorso runtime**. Il percorso reale usa il proprio
parser `sse()` in `auth.mjs`, testato tramite fixture e poi osservato
in una singola richiesta reale autorizzata.

## Dati locali e interruzione

I token, incluso quello di refresh, non vengono salvati o stampati. A ogni avvio
si ripete OAuth; refresh, profili multipli e cambio account non sono implementati.
Il file `~/.neydra-auth-experiment/registration.json` conserva soltanto host ID,
client ID emesso e subject verificato. È fuori dal repository, scritto atomicamente
con permessi Unix restrittivi; su Windows dipende anche dalle ACL della directory
utente. Non condividerlo. Lo stesso host ID e client ID vengono riusati nei tentativi
successivi. Il subject già associato deve coincidere. Un errore di scambio conserva
il client ID emesso ma non riutilizza il codice.

Puoi interrompere con Ctrl+C. Per revocare l'accesso usa ChatGPT → Settings →
Security and login → Sign in with ChatGPT → NEYDRA → Disconnect. Chiudere il
programma o cancellare il file locale **non revoca** la connessione. Non cancellare
la registrazione solo per un errore transitorio: ricreerebbe inutilmente l'host.

## Codex: probe senza credenziali

```powershell
codex --version
npm run codex:probe
```

Se Windows espone soltanto uno shim `.cmd`/`.ps1`, passa il percorso assoluto del
binario nativo `codex.exe` della distribuzione ufficiale:

```powershell
node codex.mjs "C:\percorso\al\binario\codex.exe"
```

Il probe usa `spawn` senza shell, una directory temporanea vuota e un `CODEX_HOME`
separato; non eredita chiavi API, token o configurazioni personali di Codex. Invia
`initialize`, attende la risposta, invia `initialized` e termina. Il provider è
configurato come nella guida SIWC. **Non esegue `thread/start`, `turn/start`,
comandi o inferenza e non passa un token finto.** L'esito del solo protocollo
resta `UNVERIFIED` per l'integrazione completa.

## Collegamento Codex con autorizzazione reale: contratto da verificare

La funzione `providerArgs()` contiene gli argomenti documentati. Una futura
integrazione nel main deve passare il `session.accessToken` prodotto da `exchange`
esclusivamente come `ACCESS_TOKEN` nell'ambiente del figlio, mai sulla riga di
comando o tramite renderer/file/log. Non esportarlo manualmente dal programma.
Il probe non implementa questo ponte né un turno live: sono **da verificare**.

Con quel processo autorizzato, la sequenza ufficiale è:

1. `initialize` con `clientInfo.name = "neydra"`, titolo e versione; attendere il
   risultato prima della notifica `initialized`.
2. `model/list` può restituire un catalogo incorporato: confrontarlo con i modelli
   della connessione SIWC, senza considerarlo prova di accesso.
3. `thread/start` con modello scelto, directory di un progetto usa e getta,
   `sandbox: "read-only"` e `approvalPolicy: "untrusted"`; conservare `thread.id`.
   Verificare i valori nel JSON Schema della CLI installata prima di abilitarli:
   `codex app-server generate-json-schema --out <directory-temporanea>`.
   Questi valori sono confermati dallo schema della CLI 0.163.0; alcune pagine
   descrivono varianti diverse, quindi non sostituirli senza verifica di versione.
4. `turn/start` con `threadId` e `input: [{"type":"text","text":"Rispondi senza usare strumenti: NEYDRA_AUTH_OK"}]`.
   Gestire `item/agentMessage/delta`; solo `turn/completed` con
   `turn.status === "completed"` è successo. Rifiutare richieste inattese di tool,
   accesso esterno o approvazione. Un task con modifiche richiederà un ulteriore
   esperimento di sicurezza e permessi, fuori da P0A.
5. Per sessioni lunghe: implementare il refresh ufficiale, sostituire insieme i
   token ruotati, riavviare app-server e usare `thread/resume`. Questo esperimento
   non mantiene sessioni lunghe e non prova autonomia continua o Codex Cloud.

Non avviare questa sequenza live finché il ponte di token, i controlli costo e i
confini del progetto non sono implementati e verificati. Il prossimo passo pronto
per l'utente è il test diretto sopra e il probe senza credenziali.

## Errori: nessun ripiego a pagamento

| Risultato | Azione |
|---|---|
| `consent_denied`, `plan_permission_missing` | Stop; nessuna richiesta testuale. |
| `invalid_grant` | Codice scartato; eventuale nuovo tentativo manuale con client ID conservato. |
| `identity_verification_failed`, `account_changed` | Stop; controllare account/configurazione. Nessuna fiducia nel JWT solo decodificato. |
| `subscription_sharing_user_not_eligible`, HTTP 403 | `BLOCKED`; verificare idoneità/policy, non ripetere in ciclo. |
| `subscription_sharing_usage_limit_exceeded`, HTTP 429 | Stop; consultare Usage e attendere disponibilità inclusa. Nessun credito. |
| HTTP 401 / 503 o errore di trasporto | Stop; verificare autorizzazione/disponibilità prima di un nuovo tentativo manuale. |
| `inference_failed_or_incomplete`, `stream_without_completion`, `interrupted_stream` | Nessun PASS, anche se è arrivato testo. |
| `loopback_unavailable` | Eseguire su PC locale autorizzato; non elevare privilegi nel cloud. |
| Algoritmo ID token diverso da RS256 | Verifica rifiutata; adattamento con libreria OIDC mantenuta da valutare, mai saltare la firma. |

## Confine Electron e rischi residui

Nel prodotto futuro tutte queste operazioni vivranno nel main, con renderer
sandboxed, `contextIsolation: true`, `nodeIntegration: false`, CSP e IPC stretto.
Il renderer potrà chiedere connessione/annullamento e ricevere solo stato e testo
autorizzato, senza URL OAuth completi, token o accesso a subprocess generici.
Un'eventuale persistenza dei token richiederà storage sicuro del sistema operativo.
Qui non è stata testata alcuna UI Electron o integrazione Windows reale.

Il verificatore RS256 è volutamente ristretto e basato su `node:crypto`, con test
di firme autentiche di fixture; non sostituisce una libreria OIDC completa per la
distribuzione. JWKS ed endpoint sono fissati ai valori ufficialmente documentati;
rotazione chiavi è riletta a ogni tentativo. Restano verifica locale delle ACL,
review di sicurezza, idoneità, disponibilità modelli e controlli crediti dell'account.
