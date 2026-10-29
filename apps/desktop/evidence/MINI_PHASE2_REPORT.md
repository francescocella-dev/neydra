> Stato corrente: [redesign minimale immersivo e limiti delle prove GUI](MINI_MINIMAL_REPORT.md). Questo report conserva le verifiche storiche della fase 2.

> Follow-up corrente: [F11 Windows: evidenza del proprietario, correzione del driver E2E e nuova diagnostica](F11_WINDOWS_REPORT.md). Le tabelle seguenti conservano gli esiti del commit iniziale della fase 2.

# Mini Premium Tech — report fase 2

**28 ottobre 2026 — candidato per review, Windows e approvazione visiva pendenti.**
PR #10 mantenuta DRAFT, branch `feat/desktop-mini-interface`, partenza `d950e9a`.
La base della PR resta #9 (`f3105da`). Nessun merge, release o deployment.

## Risultato consegnato

- Nuovo sistema visivo nero/grafite/arancio: superfici più calme, spaziatura e
  testi leggibili, venature curve più evidenti e lente, reduced-motion reale.
- Stage vuoto con didascalia discreta; nessuna immagine, avatar fittizio o scena
  spaziale. Modello definitivo, Blender, `mini-asset-work/`, `references/` e #7
  non modificati.
- Conversazione centrale con messaggi utente/NEYDRA distinti, cronologia,
  compositore, Stop e modello. Informazioni estese riposte in dettagli apribili;
  avviso costo e consenso completo restano accanto all'invio.
- Pannelli richiudibili senza smontare la ChatPanel. Stato destro derivato dal
  medesimo stato di presentazione: ultimo stato noto, modello selezionato,
  sessione in memoria. Nessuna quota/token/percentuale inventata.
- Impostazioni modali native in cinque sezioni, percorso ai controlli account,
  preferenza movimento temporanea, voce dichiarata non implementata e demo
  offline in sezione tecnica separata.
- Font locali Oxanium/Manrope, 38.9 kB WOFF2 complessivi, SIL OFL 1.1 con copyright,
  provenienza, hash e licenze consultabili anche nell'app. Nessun CDN.
- Fullscreen **nativo Electron** nel main, F11, pulsante evidente di uscita ed
  eventi di stato validati; non semplice massimizzazione o HTML fullscreen.

## File e confini

UI: `App.tsx`, `ChatPanel.tsx`, `SettingsPanel.tsx`, `chat-view.ts`, `style.css`,
`fonts/`. Finestra: `window-controls.ts`, `window-contracts.ts` e wiring limitato
main/preload; `contracts.ts` estende solo il tipo bridge per il controllo finestra.
Sicurezza locale: allowlist estesa ai soli asset generati `.woff2`, con tutti i
vincoli su origine, percorsi e query conservati. CSP immutata.

Test: renderer jsdom, window controls, preload, E2E Electron e configurazione
Vitest per TSX. Aggiunte **solo devDependencies** per test UI (Testing Library,
user-event, jsdom), nessun framework UI o dipendenza runtime aggiuntiva.
Build preload sempre autosufficiente tranne `electron`.

Il diff rispetto a `d950e9a` è vuoto per `src/main/chatgpt/`, `service.ts`,
`offline.ts`, esperimenti, asset, workstream Mini/3D, references e CI. Confrontati
anche i sorgenti degli handler ChatPanel da `refresh()` a `reset()`: **identici**.
Nessuna modifica OAuth/token/endpoint/scope/limiti/consenso del backend #9.
Le sue prove Windows precedenti rimangono evidenza separata, non vengono ripetute.

## Verifiche osservate

Linux cloud, Node 24.19.0 / npm 11.9.0.

| Verifica | Esito |
| --- | --- |
| `npm run check` | PASS, sintassi script e moduli MJS |
| `npm run lint` | PASS, zero warning |
| `npm run typecheck` | PASS, TypeScript strict |
| `npm test` | **86/86 PASS, 7 file, zero skip** |
| `npm run build` | PASS, main/preload/renderer e WOFF2 locali |
| `npm run check:preload` | PASS, artefatto CJS in VM con mock Electron |
| `node --check` sui bundle main/preload | PASS |
| `git diff --check` | PASS |
| Font: licenze, hash e output build | PASS, avvisi inclusi nell'app |
| Backend auth e percorsi protetti | Diff vuoto rispetto alla partenza |
| Electron E2E | **BLOCKED prima della finestra**, dettagli sotto |
| GUI, font e layout realmente visualizzati nel cloud | NON VERIFICATI |
| Fullscreen/taskbar/DPI Windows 100/125/150% | NON ESEGUITI |

La suite include i test socket 127.0.0.1 con i normali permessi di rete del task,
senza privilegi amministrativi. Browser OAuth, fetch ai modelli e bridge dei
nuovi test UI sono simulati: **nessun login OAuth o inferenza reale effettuati**.
Nessuna richiesta di acquisizione microfono/videocamera.

Copertura nuova: input conservato dopo chiusura/riapertura, impostazioni e
annullamento del dialogo, preferenza movimento, stato disconnesso/connesso
sintetico, modello/consenso, messaggi progressivi e Stop, fullscreen renderer
simulato, DTO finestra strict/trust/F11/autorepeat, notifiche senza oggetto IPC,
font locali e restrizioni percorso. Questi test non provano layout, caricamento
font, focus trap nativo o DPI. Un'asserzione iniziale del test UI selezionava il
modello prima della risoluzione del mock asincrono: corretta attendendo il catalogo,
senza cambiare il runtime o indebolire il consenso.

Review React: handler ChatGPT preservati, listener con cleanup, dialogo nativo,
label e stato accessibili, messaggi come testo con escaping React, stato di
presentazione separato, nessun polling di rete o effetto che invia AI.

## E2E e catture: cosa è accaduto davvero

Comando effettivo: `DEBUG=pw:browser npm run test:desktop`.

```text
FATAL:content/browser/sandbox_host_linux.cc:41
Check failed: . shutdown: Operation not permitted (1)
Process failed to launch! (SIGTRAP)
```

Il processo Electron è stato lanciato con `chromiumSandbox:true`, ma si è
arrestato **prima della prima finestra e delle asserzioni UI**. Nessun workaround
`--no-sandbox`, privilegio SUID, sudo, modifica CSP o protezione ridotta. Non si
attribuisce il fallimento al codice UI né si dichiara un PASS GUI.
**Nessuno screenshot della fase 2 è stato prodotto o inventato.**

La suite E2E aggiornata è pronta per Windows: pannelli, impostazioni, input,
account senza login, demo/Stop/Esc, font, fullscreen con pulsante/F11 e
`isFullScreen()`, rete/permessi/popup/navigazione negati. I viewport CSS per
125%/150% sono controlli di reflow, **non prove del DPI Windows reale**.
Taskbar e title bar nascoste vanno osservate sul PC. Tutte queste asserzioni
restano non eseguite finché non si avvia Electron in un ambiente compatibile.

## Prossimo gate

[Runbook e comandi PowerShell](../../../docs/NEYDRA_MINI_PREMIUM_PHASE2.md):
prima controlli offline, poi verifica visiva Windows, fullscreen/taskbar,
font e ridimensionamento OS 125%/150%, senza nuove richieste AI. Nessuna garanzia
sulla resa grafica finale senza screenshot e feedback del proprietario.
La PR #10 deve restare in bozza fino alla convalida; voce, companion e Holo
rimangono fuori perimetro.
