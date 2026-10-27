# Issue #2 — risultati del 27 ottobre 2026

**Stato complessivo: `UNVERIFIED`.** Esiste un percorso ufficialmente documentato
per OSS locale compatibile con il progetto. Il proprietario ha segnalato OAuth e
catalogo riusciti, poi `BLOCKED/expected_event_stream` alla prima richiesta reale.
Il completamento dell'inferenza e i costi rimangono da verificare. L'agente non ha
eseguito OAuth o inferenza; il follow-up autorizza solo analisi e test simulati.

## Piano e perimetro

Letti `AGENTS.md` e tutti i documenti da esso richiesti, oltre all'issue #2.
Branch: `auth/issue-2-official-chatgpt-feasibility`, base main
`92d4793ad1333a5891e7b552307c0b8b280231a5`. Tutte le aggiunte risiedono in
`experiments/auth/`; nessun bootstrap, modifica al 3D, CI a pagamento o hosting.

Piano eseguito: verificare le fonti ufficiali → isolare un probe Node adatto al
main Electron → testare controlli OAuth e stream con fixture → provare il
protocollo locale Codex → consegnare runbook ed evidenza sanitizzata in draft PR.
Nessun agente ha effettuato consenso per conto dell'utente.

## Fonti ufficiali consultate

Le pagine seguenti sono state lette tramite il servizio web il 2026-10-27. Sono
URL correnti, non versioni immutabili: ricontrollarle prima della prova reale.

| Fonte esatta | Conclusione applicabile |
|---|---|
| [Overview OSS](https://developers.openai.com/siwc/token-sharing-open-source) | Il percorso comprende applicazioni open source e locali. La registrazione è legata a utente/workspace; ogni installazione conserva il proprio host ID opaco. Nessuna parità completa con l'interfaccia ChatGPT è implicita. |
| [Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) | Primo accesso con `dynamic_agent_client`, nome app e host ID; usare il client ID emesso nella callback per lo scambio, poi riusarlo. Browser reale, loopback `127.0.0.1` con percorso stabile, state/nonce e PKCE S256. Verificare firma/issuer/audience/scadenza/nonce dell'ID token e scope concessi. Nessun client secret. |
| [Website identity / JWKS](https://developers.openai.com/siwc/website) | Pubblica discovery e JWKS di produzione. Si usa soltanto quel riferimento per la firma: l'onboarding commerciale descritto dalla pagina non sostituisce la registrazione OSS. |
| [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) | Catalogo corrente da `GET https://api.openai.com/v1/models`, campo `models`, visibilità `list`, identificativo `slug`. Inferenza con bearer OAuth a `POST /v1/responses`, `input` array, `store:false`, `stream:true`; successo solo a completamento dello stream. |
| [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) | Questa autorizzazione non abilita tutte le API. L'esperimento omette tool, parametri di campionamento, upload, audio e riferimenti a conversazioni server. La futura voce resta locale. |
| [Errors and recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery) | Consenso senza permesso di piano non abilita inferenza. Idoneità, quota, policy e indisponibilità hanno errori distinti, anche dopo l'inizio dello stream. Il server non passa silenziosamente a un altro billing path; il nostro client interrompe sempre senza retry. |
| [Token reference](https://developers.openai.com/siwc/token-sharing-open-source/token-reference) | Access token e refresh token sono distinti; il refresh ruota. Il probe usa una singola sessione e scarta tutti i token alla chiusura, senza implementare rinnovo. |
| [Cookbook OSS](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt) (28 settembre 2026) | Conferma l'impiego in un'utility desktop OSS e l'eleggibilità Plus/Pro, senza API key. Non dimostra che questo account abbia consenso o accesso. Non è stato copiato o redistribuito codice del devkit. |
| [UI/UX](https://developers.openai.com/siwc/ui-ux-guidelines) | Il prodotto dovrà mostrare quando usa il piano e collegare la gestione Usage. Il probe è un terminale tecnico, senza implementazione dell'onboarding grafico. |
| [Crediti personali](https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-personal-plans) | I crediti acquistati possono estendere la quota inclusa. Il runbook impone saldo acquistato zero, ricarica disattivata e controlli prima/dopo. Un token OAuth non prova da solo l'assenza di consumo a pagamento. |
| [Codex app-server con SIWC](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server) | Passare l'access token OAuth come `ACCESS_TOKEN` al figlio e configurare il provider Responses pubblico. Nessun secondo login Codex è necessario. Il catalogo RPC può essere incorporato; un turno completato è una prova distinta. |
| [Protocollo app-server](https://learn.chatgpt.com/docs/app-server) | JSON per riga su stdio; `initialize`/risposta/`initialized`, poi thread e turni. Lo schema generato dalla CLI installata è necessario per verificare i campi di quella versione. |
| [Codex con il piano](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan) | Codex Cloud è un runtime separato soggetto a idoneità, rollout e limiti. Il probe locale non prova accesso Cloud né esecuzione continua. |

La presenza di `api.openai.com/v1` **non implica un'API key fatturata** in questo
flusso: la guida SIWC prescrive proprio quella route con OAuth autorizzato per il
piano. Il client non accetta credenziali esterne, endpoint alternativi o fallback.
Se il percorso ufficiale per questo account fosse indisponibile, il risultato
diventa `BLOCKED`, senza implementare percorsi privati o acquistare accesso.

## Prove iniziali eseguite nel cloud

Ambiente Linux, Node `v24.19.0`, npm `11.9.0`, Codex CLI `0.163.0`.

| Comando/prova | Risultato effettivo |
|---|---|
| `npm run check` | Sintassi dei moduli verificata. Nessun lint/typecheck configurato per questo slice JS. |
| `npm test` | 11 test superati; 2 test socket opt-in saltati. Firma reale di JWT di fixture, validazione claim/state/PKCE, scambio mock, scope, catalogo, SSE frammentato, errori tardivi e assenza di fallback. Nessun OAuth reale. |
| `npm run codex:probe` | Processo reale: provider configurato, `initialize` riuscito e `initialized` inviato; nessuna autenticazione, token o inferenza. HOME Codex temporanea, cwd vuota, telemetria disabilitata. |
| `codex app-server generate-json-schema --out /tmp/neydra-auth-protocol-schema` | Generato lo schema effettivo 0.163.0: `ThreadStartParams` accetta `sandbox:"read-only"`, `approvalPolicy:"untrusted"`. Differisce da esempi web con altri nomi: verificare sempre la versione. |
| `node run.mjs` | Exit 1, `BLOCKED/read_runbook_first`, prima di qualsiasi OAuth. |
| Bind sperimentale `127.0.0.1` | Negato dall'ambiente (`EPERM`); nessuna escalation. Callback HTTP reale e i due test socket richiedono il PC utente. |
| `git diff --check` | Nessun errore di whitespace. |

La CLI inizialmente rimaneva in attesa durante la chiusura: corretto il cleanup
del solo subprocess del probe con chiusura stdin e terminazione limitata nel
tempo; la successiva prova è riuscita. Il runner test usa isolamento `none` per
eseguire i singoli casi anche nel sandbox cloud; non modifica i controlli OAuth.

La rete shell del cloud non è disponibile verso il proxy configurato: `git
ls-remote` e `npm view jose` non sono riusciti. La ricerca ufficiale e la consegna
GitHub usano i connettori disponibili. Non si è modificata la policy di rete né
tentato un login nel cloud. Non sono state aggiunte dipendenze o artefatti esterni.

## Stato delle condizioni di accettazione

| Condizione | Stato |
|---|---|
| Percorso OSS ufficiale, endpoint e parametri individuati | Verificato documentalmente |
| Protezioni OAuth e richiesta testuale minima | Implementate; test sintetici superati |
| Handshake protocollo Codex reale, locale e senza token | Verificato su Linux/CLI 0.163.0 |
| Callback HTTP locale e ACL Windows | Suite iniziale Windows 13/13 segnalata dal proprietario, inclusi 2 test socket; ACL non verificate indipendentemente |
| Consenso browser e catalogo modelli di questo utente | Riusciti secondo il resoconto del proprietario, non ripetuti dall'agente |
| Risposta completata con autorizzazione reale e modello disponibile | `UNVERIFIED`; tentativo proprietario bloccato al guard SSE |
| Assenza di consumo crediti/spese aggiuntive | `UNVERIFIED`, controllo account prima/dopo |
| Turno Codex con token SIWC reale | `UNVERIFIED`, ponte del token non implementato |
| Integrazione Electron, storage sicuro persistente, refresh | Fuori dal probe; non verificati |

Nessun `PASS` complessivo. Il blocco corrente è la risposta HTTP non accettata dal
guard SSE nella prova del proprietario, con metadati originali non registrati.
Ulteriori rischi: cambiamenti della preview, quota condivisa limitata, modelli e
policy account variabili, algoritmo ID token diverso da RS256 rifiutato, revisione
OIDC/Electron necessaria prima della distribuzione. Il runbook non può certificare
la fatturazione tramite risposte mock o booleani emessi dal client.

## Follow-up diagnostico della PR #6 — 27 ottobre 2026

Letto il [commento di revisione](https://github.com/francescocella-dev/neydra/pull/6#issuecomment-6450517392).
Il resoconto del proprietario riporta `gpt-5.6-luna` e il solo errore
`expected_event_stream`, con `httpStatus:null` e `bodyShape:null`. Prima della
modifica, `request()` aveva già accettato `response.ok`; dunque lo stato era 2xx,
ma il numero esatto, il Content-Type e il corpo non sono ricostruibili dal log.
Il costruttore `Stop` usava il default nullo perché il guard non gli passava alcuna
informazione sulla risposta. Questo è il difetto diagnostico corretto.

La modifica raccoglie solo stato HTTP, categoria MIME, presenza del ReadableStream
e un `x-request-id` con formato strettamente filtrato. Nessun header arbitrario,
corpo completo, dato personale o credenziale entra nell'evidenza. Le risposte
2xx inattese non vengono lette né convertite in un successo JSON. Anche gli errori
SSE successivi conservano gli stessi metadati, senza modificare la richiesta.

Fonti ufficiali rilette in questo follow-up:

- [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference):
  conferma Responses HTTP con bearer OAuth, `input` array, `store:false`,
  `stream:true` e controllo dell'evento terminale. Nessuna indicazione che un 2xx
  non SSE sia un esito positivo atteso di questo flusso.
- [Errors and recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery):
  descrive errori di admission precedenti allo stream, anche con forma JSON
  `detail`, e stati 401/403/503. Richiede di conservare stato e request ID; non
  documenta i 2xx non SSE come comportamento normale. Il formato della risposta
  reale resta ignoto; l'evidenza omette intenzionalmente i contenuti sensibili.
- [API overview — Debugging requests](https://developers.openai.com/api/reference/overview#debugging-requests):
  identifica `x-request-id` per il troubleshooting. Il filtro `req_` + 32 cifre
  esadecimali è una policy prudenziale del client, non un vincolo dichiarato dal
  servizio; identificativi con altri formati vengono omessi.

Possibili cause, **non accertate**: risposta JSON/HTML o priva di Content-Type,
risposta senza corpo (per esempio 204), contenuto alterato da un intermediario,
oppure SSE con maiuscole nel MIME respinto dal vecchio confronto case-sensitive.
La nuova classificazione distingue questi casi a livello di metadati ma non può
attribuirli retroattivamente al server, al modello o a un proxy. Non c'è evidenza
di un errore OAuth, di un rifiuto del modello o di HTTP 520: 520 avrebbe fallito
il precedente controllo `response.ok`.

Verifiche di questo follow-up: `npm run check` superato; `npm test` con **27 pass,
2 test socket opt-in saltati**; `git diff --check` superato. I 16 nuovi casi coprono
2xx JSON inatteso/malformato, HTML/XHTML, header o corpo assenti, falso MIME SSE,
SSE valido/errato/incompleto, errori tardivi, sanitizzazione ID e serializzazione
dell'evidenza. Ogni richiesta simulata verifica una sola chiamata, endpoint e
parametri protetti. Nessun avvio di `run.mjs`, OAuth, probe Codex o inferenza reale.

**Prossimo passo consentito:** revisione del commit e test simulati sul PC.
Qualsiasi ulteriore prova reale richiede nuova autorizzazione esplicita del
proprietario, quota inclusa disponibile, saldo crediti acquistati ancora zero,
ricarica disattivata e controllo di assenza di addebiti. Nessun retry automatico.
PR in bozza e risultato complessivo `UNVERIFIED`.
