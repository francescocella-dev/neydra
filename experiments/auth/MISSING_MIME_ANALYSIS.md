# HTTP 200 senza Content-Type — analisi e proposta solo offline

Stato: **inferenza reale BLOCKED; integrazione complessiva UNVERIFIED**.
Le due prove live autorizzate sono concluse. Nessun nuovo tentativo, OAuth o
richiesta a modelli viene proposto o eseguito in questo lavoro.

## Evidenza e ciò che non dimostra

Il [secondo resoconto del proprietario](https://github.com/francescocella-dev/neydra/pull/6#issuecomment-6451092174)
riporta HTTP `200`, `contentTypeCategory:missing`, `hasBodyStream:true` e
`requestId:null`. OAuth e catalogo funzionano secondo il resoconto; non sono
stati ripetuti dall'agente.

Il controllo del client ha bloccato la lettura del corpo. Un ReadableStream Fetch
è un oggetto che permette di tentare letture: può essere vuoto, interrompersi o
contenere JSON, HTML, testo, binario oppure SSE. Non prova che sia arrivato testo
generato, né esclude lavoro lato server o consumo di quota prima del blocco.
Il corpo originale non è stato acquisito e non è ricostruibile dalle fixture.

La categoria `missing` accorpa header assente, valore vuoto/spazi e una prima
porzione MIME vuota, ad esempio `; charset=utf-8`. Quindi il log non prova
l'assenza fisica dell'header sulla rete. `requestId:null` significa assente oppure
scartato dal filtro, non assenza certa di un identificativo upstream.

## Perché HTTP può avere un corpo senza quel campo

[RFC 9110, §8.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-8.3)
raccomanda Content-Type quando il tipo è noto, senza renderlo necessario per
delimitare il corpo HTTP. In assenza del campo permette di trattare i dati come
octet-stream o esaminarne il formato; avverte dei rischi del riconoscimento MIME.
Status, delimitazione/trasporto del corpo e tipo del contenuto sono informazioni
distinte. La presenza dell'oggetto Fetch non dipende dal riconoscimento di SSE.

Possibilità non accertate:

- Il server o un gateway ha omesso, svuotato o generato male l'header.
- Un intermediario locale, proxy o wrapper del trasporto ha modificato la risposta.
- È arrivata una risposta diversa da quella di inferenza prevista, anche vuota,
  senza che lo status esprimesse l'anomalia.
- Un problema dell'implementazione del trasporto può aver alterato la vista degli
  header. Non ci sono prove per attribuirlo a Node, al server o alla rete locale.

Nel codice esaminato `request()` restituisce il Response Fetch ricevuto, senza
ricostruirne gli header. Non esiste un passaggio che rimuova Content-Type. Il
normale fetch di Node non è la fetch di un renderer browser sottoposta a CORS:
un header nascosto da CORS non è una spiegazione dimostrata per questo programma.
Non sono stati ispezionati traffico reale, credenziali o impostazioni del PC.

## Vincoli ufficiali e scelta tecnica

La [guida SIWC](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
continua a prescrivere `store:false`, `stream:true` e il completamento terminale.
Il [riferimento eventi Responses](https://developers.openai.com/api/reference/resources/responses/streaming-events)
descrive gli eventi strutturati, tra cui apertura, delta, completamento ed errori.
Queste fonti non certificano che la risposta osservata fosse SSE.

[WHATWG SSE](https://html.spec.whatwg.org/multipage/server-sent-events.html#parsing-an-event-stream)
definisce UTF-8, campi per riga, delimitazione dei frame e terminatori LF/CRLF/CR.
Il processamento browser EventSource richiede il MIME SSE: leggere una struttura
simile senza header è una tolleranza applicativa esplicita, non la dimostrazione
che la risposta sia conforme al contratto. Non va abilitata silenziosamente.

**Proposta:** mantenere il blocco reale; valutare una modalità esplicita e
disattivata per default solo dopo review. Un eventuale riconoscimento dovrebbe
operare sui byte della stessa risposta già ricevuta, senza seconda richiesta,
senza sostituzione di endpoint o credenziali. Non deve interpretare HTML,
eseguire strumenti, mostrare frammenti privati o considerare un prefisso prova
di successo. Riconoscere la struttura non autentica la sorgente né la fatturazione.

## Limiti del parser attuale

Il parser in `auth.mjs` non viene modificato da questa proposta. È protetto dal
guard MIME nel percorso reale; non è adeguato a un riconoscimento cieco:

- Ignora righe diverse da `data:`; un preambolo estraneo potrebbe essere ignorato.
  Non confronta `event:` con il tipo JSON e non valida una sequenza coerente di ID.
- Supporta LF/CRLF, ma non CR isolato. Usa decodifica UTF-8 permissiva e non
  finalizza il decoder a EOF, quindi non rileva ogni sequenza terminale troncata.
- Limita il buffer a 2 milioni di caratteri, non i byte cumulativi. Il timeout di
  120 secondi è nel livello Fetch, non nel generatore riutilizzabile isolatamente.
- Verifica già completamento, errori tardivi e limite del testo: tali protezioni
  non devono essere tolte o sostituite dal solo riconoscimento di `data:`.

## Prototipo isolato e verificabile

`sse-proposal.mjs` esporta soltanto `inspectMissingMimeFixture(response)`: non
chiama fetch, non accetta token, non è importato da `run.mjs` o dal client reale.
Accetta per studio solo Response `200` con header **veramente assente** e corpo
ReadableStream. Un MIME esplicito, vuoto o malformato viene rifiutato senza lettura.

Il prototipo:

1. Usa parsing incrementale UTF-8 rigoroso, BOM iniziale opzionale, LF/CRLF/CR
   anche spezzati tra chunk. Gestisce commenti e `data:` multilinea.
2. Richiede un primo `response.created` valido entro il budget iniziale. Confronta
   eventuale `event:` con il tipo JSON. Rifiuta spazzatura, campi/eventi non previsti,
   campi evento duplicati e corpi JSON/HTML generici.
3. Richiede `response.completed` con stato `completed` e ID della risposta coerente,
   poi EOF pulito. `[DONE]` non è completamento e può comparire solo dopo di esso.
   Errori, incomplete, completamenti duplicati e dati successivi anomali bloccano.
4. Impone i limiti sotto; annulla la lettura al fallimento senza attendere una
   cancellazione del producer che potrebbe non terminare.
5. Restituisce solo metadati filtrati, `mode:offline-fixture`, struttura riconosciuta
   e completamento osservato. Lo stato rimane `UNVERIFIED`; nessun corpo viene loggato.

| Budget del prototipo | Massimo |
|---|---:|
| Byte prima del primo evento valido | 8.192 |
| Byte per frame, con conteggio conservativo dei terminatori | 65.536 |
| Byte cumulativi ispezionati | 262.144 |
| Frame dati/marker | 512 |
| Operazioni di lettura, anche per chunk vuoti | 4.096 |
| Caratteri UTF-16 dei delta testuali | 16.384 |
| Attesa complessiva, senza reset ai keepalive | 10 secondi |

Le fixture possono solo abbassare questi limiti. Un chunk già allocato dal
trasporto resta fuori dal controllo del parser; il prototipo limita quanto ne
elabora e accumula. Il budget letture copre anche chunk vuoti che possono ritardare
i timer. Timeout e cancellazione non dimostrano che il server non abbia lavorato.

La grammatica degli eventi è **intenzionalmente parziale**: ammette created,
in_progress, output_text.delta, completed e rifiuta failed/incomplete/error. Eventi
legittimi aggiuntivi, inclusi output item e content part, sono rifiutati. Pertanto
non è un sostituto pronto per l'SDK o per l'intero protocollo Responses. Integrare
in futuro richiederebbe review dei tipi documentati, non un allargamento indiscriminato.

## Prove e limiti delle conclusioni

`npm run check`: superato, sintassi soltanto. `npm test`: **57 superati, 2 test
socket opt-in saltati**. `git diff --check`: superato. Aggiunti 30 casi, tutti
simulati, con parsing frammentato, corpi ambigui, completamento obbligatorio,
errori tardivi, UTF-8 invalido, ogni budget e producer bloccato/ostile.

Un test conferma che anche una fixture SSE valida senza header continua a essere
respinta da `textRequest()`, con una sola chiamata simulata e corpo non letto.
Restano invariati `store:false`, `stream:true`, niente retry e niente fallback.
Non sono stati eseguiti OAuth, cataloghi live, inferenza, probe Codex o test di rete.

È dimostrata soltanto la fattibilità di un riconoscimento strutturale ristretto
su dati controllati. Non sono dimostrati formato, origine, modello, completamento
o costi della seconda risposta reale. La PR resta in bozza, senza merge; la
proposta non autorizza un terzo tentativo.
