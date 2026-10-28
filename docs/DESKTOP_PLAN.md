# Issue #4 — piano e proprietà

Base: `main` / `92d4793`; branch `issue-4/windows-desktop-shell`.
Proprietà: `apps/desktop/`, configurazione root, documentazione desktop e workflow
di verifica manuale. Nessuna modifica a esperimenti, asset o branch #6/#7.

1. Definire contratti versionati e validati per IPC, provider, voce e avatar.
2. Creare main Electron, preload CJS sandbox-compatible e renderer React/Vite.
3. Esercitare streaming/interruzione soltanto con un adapter offline esplicito.
4. Verificare confini, test, lint, typecheck, build e smoke; documentare Windows
   e aprire una PR draft. Nessun installer, release o infrastruttura automatica.

Scelte: Node 24 LTS, npm lockfile, Electron, React, TypeScript, Vite, esbuild per
i bundle main/preload, Zod per validazione runtime, ESLint, Vitest e Playwright
per smoke Electron locale. Dipendenze open source gratuite; nessun servizio.
Lo sviluppo ricompila prima dell'avvio: niente dev server o eccezioni CSP per HMR.
Auth/provider/voice risiedono nel main; motore avatar futuro nel renderer.
Il renderer non ottiene URL OAuth, token, file system, shell o IPC generico.
Gli schemi e `docs/DESKTOP.md` sono il contratto di hand-off; non equivalgono
all'integrazione degli esperimenti.
