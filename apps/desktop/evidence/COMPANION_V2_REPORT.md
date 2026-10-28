# Companion V2 — report di verifica

28 ottobre 2026. Branch `feat/desktop-mini-interface`, PR #10 **DRAFT**.
Baseline `4d5911111098007c0b358b0cdeb0f8b891ca9f4a` verificata dal proprietario su
Windows: check/lint/typecheck/build, **113/113 unit, 2/2 E2E, due preload** e mouse
fisico. Il menu nativo Apri/Esci funzionava, ma l'esperienza non era approvata.
Questi esiti precedono V2 e non ne provano la resa.

## Implementazione

Evento nativo `minimize`, icona in fullscreen e comando laterale convergono sullo
stesso controller. Gestiti main già minimizzato, errore di creazione, ripristino
durante creazione pendente e ulteriore minimize prima del suo termine. Main,
servizio e ChatPanel rimangono vivi. F11 non cambia; il ritorno recupera anche
l'intento fullscreen se l'OS lo ha lasciato mentre il main era nascosto.

Menu Windows rimosso. Due finestre satellite isolate da 64×64 DIP circondano il
core da 120×120 DIP, senza ridimensionarlo. Il main sceglie posizioni contenute
nella work area reale; niente superfici trasparenti estese. Overlay riusati,
creazioni serializzate e cancellazioni tardive senza duplicati; blur esterno,
Escape, drag, restore e cambi display chiudono il menu. Le azioni dei satelliti
sono assegnate dal main e accettate solo a menu aperto. Animazione di 190/225 ms e
fade di chiusura 150 ms; motion ridotto rispettato.

Nuovi file principali: `main/companion-host.ts`, `main/orbit-controller.ts`,
`shared/orbit-contracts.ts`, `preload/orbit.ts`, `src/orbit/*`. Aggiornati controller,
preload/controlli/CSS companion, icona App, build e test. Nessuna libreria aggiunta.
Main/companion/orbit hanno tre preload e partizioni separate; ai satelliti arriva
solo un enum ruolo e la visibilità. CSP e preferenze di sicurezza riutilizzate
immutate; permessi e IPC validati per finestra/frame/origine.

## Diagnosi della deformazione riferita

Nel sorgente V1 non c'erano scale CSS o resize nel drag, ma il pulsante dipendeva
dalle percentuali del viewport, conservava l'aspetto nativo di un button e aveva
un indicatore di focus esterno al bordo. Senza misura del mouse fisico Windows
**non è possibile attribuire con certezza la deformazione a una di queste cause
o al cambio DPI/rendering trasparente**.

V2 elimina queste variabili: min/max native 120×120, corpo CSS 112×112 a (4,4),
`appearance:none`, focus interno, nessun transform/scale sul core e nessun resize
per aprire il menu. Drag soltanto posizionale. L'E2E registra native bounds,
content bounds, scala display, work area, DPR, viewport, capture e rettangolo/stile
del core nelle fasi idle/hover/pressione/drag/rilascio/menu. In errore allega
`companion-v2-geometry`, senza dati chat.

Un test manuale opt-in di 45 secondi in `tests/manual/companion-physical.mjs`
permette di raccogliere gli stessi dati con **cursore fisico**, senza sostituzioni,
richieste AI o screenshot del desktop. Qui ne è verificata solo la sintassi/lint;
non è stato eseguito su Windows. La stabilità fisica e la qualità visiva rimangono
un gate del proprietario, anche se l'E2E geometrico dovesse passare.

## Esiti effettivi cloud Linux

| Controllo | Esito |
| --- | --- |
| check, lint, typecheck | PASS, zero warning lint |
| unit/renderer | **125/125 PASS, 13 file, zero skip** |
| build main, 3 preload, 3 renderer | PASS |
| check preload | PASS per tutti i bundle, VM con mock Electron |
| sintassi CJS e diagnostica manuale | PASS |
| discovery Playwright | 2 test |
| Electron E2E | **BLOCKED prima della prima finestra**, entrambi i test |
| V2 GUI, mouse fisico, animazione, DPI e Windows | **NON ESEGUITI** |

Comando tentato: `DEBUG=pw:browser npm run test:desktop`, exit 1:

```text
FATAL:sandbox/linux/suid/client/setuid_sandbox_host.cc:172
The SUID sandbox helper binary was found, but is not configured correctly.
Rather than run without sandboxing I'm aborting now.
Process failed to launch! (SIGTRAP)
```

Nessun --no-sandbox, SUID alterato o elevazione. Nessun PASS Windows, cattura GUI
o conferma della resa animata inventati.

Test aggiunti/estesi: native minimize e main già minimizzato, creazione annullata
seguita da altro minimize, icona fullscreen, ripristino fullscreen dopo intervento
OS, stessa sessione, serializzazione e cleanup anche con satelliti, blur tra
controlli e verso desktop, Escape/drag senza quit, 36 combinazioni di bordi/angoli
e dimensioni logiche, gap fra monitor, permessi/DTO/origini/ruoli, navigazione,
assenza di azioni al solo hover e doppia attivazione bloccata.

L'E2E immersivo e `assertSingleViewport` sono **identici alla baseline**. Quello
companion usa ora i veri controlli orbitanti, senza simulare menu o callback
native. Soltanto il cursore OS è sostituito per il drag CDP: non attesta il mouse
fisico. La prova di minimizzazione usa `BrowserWindow.minimize()` e il suo evento,
non il controller direttamente; il clic sul vero `_` resta verifica locale.

Diff vuoto per OAuth/Responses, backend chat, consenso/ChatPanel, CSP/security.ts,
politica sessioni, handler F11 runtime, CSS immersivo, font, dipendenze/lockfile e
asset Mini/Blender/Holo/voce. Nessuna cancellazione di file del proprietario,
richiesta AI reale, login, merge o release.

[Architettura, comandi PowerShell e checklist Windows](../../../docs/NEYDRA_MINI_COMPANION_V2.md).
La PR #10 resta **DRAFT**, con approvazione visiva V2 e mouse fisico aperti.
