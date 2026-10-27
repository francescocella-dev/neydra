# NEYDRA · genuine 3D avatar stage

Internal React + TypeScript + React Three Fiber / Three.js experiment for
[Issue #3](https://github.com/francescocella-dev/neydra/issues/3). No auth files,
Electron shell, service, API key, account or paid asset required.

**ENGINE PROTOTYPE / NOT FINAL CHARACTER.** Both original procedural fixtures are
actual loadable, articulated GLB geometry. Final Holo/Mini artwork and production
lip-sync remain **BLOCKED ON 3D ASSET**. See [rig/event contract](RIG_CONTRACT.md)
and [asset provenance](../../assets/README.md).

## Run locally

Node **22.12+ or 24 LTS**, npm; WebGL2-capable browser with graphics acceleration.
From `experiments/avatar-stage`:

```sh
npm ci
npm run dev
```

Open the Vite URL (default `http://localhost:5173`). This is a renderer-only lab;
run only on a trusted local machine/network. Nothing is persisted or uploaded.
Auth experiments and root package/CI configuration remain untouched.

## Explore

- Drag to orbit and scroll/pinch to zoom; camera buttons support keyboard use.
  `Volto` moves to a face inspection view; `Reset` restores the overview.
- Switch Holo/Mini while previewing a state or speech. The engine and caption stay
  alive; the independently loaded GLB receives the current pose and state.
- Preview all six states and all four expressions. Head yaw/pitch and expression
  intensity sliders drive shared rig channels. Blinking and head motion are modeled.
- `Simula parlato` schedules synthetic Italian visemes and caption for 4.8 seconds.
  It is explicitly **silent, simulated, not a real lip-sync demo**. Restart replaces
  the utterance; Stop/Esc cancels it. There is no active microphone.
- `Movimento ridotto` respects OS preference and disables ambient movement and
  camera damping. Explicit expressions and timed mouth movements remain meaningful.
- Import a self-contained local `.glb` <=20 MiB. No file upload. Assets with no
  compatible rig still display/orbit; missing channels are visible in the rig report.
  External resources and required decoder extensions are refused before parsing.
  Invalid input leaves the current scene intact; parser errors display a recovery
  message. Return to either built-in avatar to recover.
- Rendering diagnostics measure a short 90-frame window (first 15 discarded).
  They describe this browser session, not hardware certification or steady-state FPS.

## Reproducible checks

```sh
npm run lint
npm run typecheck
npm test
npm run assets:check
npm run licenses:check
npm run build
npm run preview -- --port 4174
# In a separate terminal, while preview is running:
npm run test:preview
npm run test:browser
```

Browser tests require Chromium. In this cloud image it is `/usr/bin/chromium`;
else set `CHROMIUM_PATH` to your installed browser binary (PowerShell:
`$env:CHROMIUM_PATH = 'C:\path\to\chrome.exe'`). Tests use SwiftShader for
repeatable software-rendered captures, one worker, and longer timeouts for cloud
rendering. They do not run a paid CI service. `npm run assets:generate` regenerates
the two committed GLBs from original geometry, using the same installed Three.js.

[Verification report](evidence/REPORT.md) documents actual commands, browser/GPU
context, captures, measured limits and unresolved production gates. Browser tests
refresh evidence PNGs and JSON measurements, so compare regenerated files before
committing. Trace files for failures remain ignored in `test-results/`.

## Implementation map

- `src/engine/`: typed, renderer-independent state machine and timestamped visemes.
- `src/stage/`: embedded GLB validation, loading/disposal, AnimationMixer crossfades,
  facial target mapping, head motion, camera, lights and real frame sampler.
- `src/App.tsx`, `src/style.css`: Design Bible layout, controls, caption and diagnostics.
- `scripts/`: deterministic fixture generator and checks of both GLBs and rights.
- `tests/`: protocol/asset tests plus actual browser interaction and screenshots.

Imported geometry/materials/textures are disposed on replacement; pending loads
abort or dispose when obsolete. Animation mixers stop/uncache on unmount. Three's
imperative object mutations are scoped to the renderer; React props/state remain
immutable. ESLint disables only the React compiler immutability heuristic in the
stage file, where it misclassifies the required Three.js frame updates.

The renderer is intentionally separate from Electron. A future desktop integration
must keep contextIsolation, renderer sandbox and narrow validated preload IPC from
the architecture document; no Node/FS/provider credential access belongs here.

Runtime dependency notices and CC-BY build-data attribution are retained in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). `npm run licenses:check` checks
installed declarations against the reviewed free-license set and verifies notices.
