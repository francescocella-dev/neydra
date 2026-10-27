# Esperimento P0A: autenticazione ufficiale con piano ChatGPT

**Esito: `UNVERIFIED`.** La documentazione ammette il percorso OSS locale; l'account
Plus del proprietario, il consenso reale, l'inferenza e l'assenza di addebiti non
sono stati verificati. [Fonti e risultati](FINDINGS.md). Nessuna modifica al 3D.

Questo è un esperimento **Node per il futuro processo main di Electron**: non
include una finestra Electron, un renderer o un'applicazione pronta da distribuire.
Non richiede installazione npm, chiavi API, backend o servizi aggiuntivi.

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

Il primo test esegue 11 casi senza rete e salta 2 test socket. Il secondo deve
eseguire tutti i 13 casi. I callback sintetici dei test non aprono OpenAI e non
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
7. Il risultato mostra soltanto booleani e stato. `completed: true` richiede un
   evento terminale di successo; `expectedText: true` conferma la risposta attesa.
   Un HTTP 200, un frammento di testo o il catalogo non bastano. Il programma
   lascia comunque `status: UNVERIFIED`: nessun evento prova la fatturazione.
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
