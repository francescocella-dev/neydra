# Issue #3 — Technical verification

Date: 2026-10-27. Scope: `experiments/avatar-stage/` and asset provenance only.
Branch: `feat/issue-3-genuine-3d-avatar-stage`. No auth experiment, root application
bootstrap, CI workflow, deployment, release or merge is part of this change.

## Result and remaining acceptance

The technical slice is implemented: React/TypeScript + R3F/Three.js scene, real
embedded GLBs, perspective camera, orbit/zoom, three-light setup, modeled platform,
six-state AnimationMixer preview, articulated head, blink/expression morphs and
timestamped viseme interface shared by Holo and Mini. Both characters are visibly
**ENGINE PROTOTYPE / NOT FINAL CHARACTER**. Geometry is original and licensed MIT.

Production artwork is **BLOCKED ON 3D ASSET**. The silent Italian-caption preview
uses 16 synthetic cues; no audio or exact lip-sync is claimed. The Design Bible's
voiced Italian demo requires the future voice adapter and final rigged assets.

## Evidence baseline and complete flow

Story: choose an avatar/state or start a timed preview → shared engine → local GLB
loader / rig adapter → actual WebGL geometry and facial/head updates → caption,
interrupt/restart and preserved state when switching avatars.

| Boundary | Evidence |
| --- | --- |
| UI → engine | Six-state browser interactions, expression/head controls, Stop/Esc; unit tests cover 720 ordered transition pairs |
| Asset → loader | Both GLB 2.0 files parse; node rig, morphs, six clips and <2 MB/file checked |
| Loader → renderer | Actual rendered screenshots; orbit/zoom changes captured pixels; pointer drag exercised |
| Events → facial pose | Pure clock-based tests exercise active/expired/overlapping cues, normalization and cancellation |
| Avatar change → state | Browser switches Holo to Mini during a synthetic utterance without losing speaking state/caption |
| Error → recovery | Invalid/URI-bearing GLBs rejected, missing built-in GLB shows error, avatar switch restores scene |
| Build → browser | Compiled Vite preview loads both GLBs; speech starts and Esc cancels, no console errors |
| External API / storage | Not applicable: no API, account, persistent storage, microphone or backend |

## Commands and results

Run from `experiments/avatar-stage`:

| Command | Actual result |
| --- | --- |
| `npm install --cache /tmp/neydra-npm-cache` | Installed free npm dependencies; lockfile committed |
| `npm run lint` | PASS, no warnings/errors |
| `npm run typecheck` | PASS, TypeScript strict |
| `npm test` | PASS, 11 tests in 2 files |
| `npm run assets:check` | PASS, Holo 16 meshes/12 channels, Mini 17 meshes/11 channels; six clips each |
| `npm run assets:generate` then SHA-256 comparison | PASS, regenerated fixture bytes match committed inputs |
| `npm run licenses:check` | PASS, 228 installed declarations checked; 19 runtime/CC-BY notices retained |
| `npm audit --audit-level=moderate --cache /tmp/neydra-npm-cache` | 0 vulnerabilities reported, including development dependencies |
| `npm run build` | PASS, no chunk warning after separating renderer and Three bundles |
| `npm run test:browser` and focused follow-ups below | All five scenarios observed passing |
| `npm run preview -- --port 4174 --strictPort`, then `npm run test:preview` | PASS, real compiled app smoke test |
| `git diff --cached --check` | PASS before commit |

Browser execution: the full run passed state/speech/switching, local imports,
missing-asset recovery and narrow/accessibility checks. Its desktop capture case
found a missing favicon (404); after adding the original SVG icon, that case passed
with `npm run test:browser -- --grep 'renders both real GLBs'`. After adding the
empty-scene guard, loader cases passed again with
`npm run test:browser -- --grep 'local import|failed built-in'`.
These are full plus focused runs, not a claim of a final single five-test run.
The first 60-second capture timeout was increased to 180 seconds for software
rendering. No failing test is hidden or marked skipped.

## Real screenshots

All PNGs below come from actual Chromium WebGL rendering, with no concept artwork,
image generator, retouching or compositing. Main views use reduced motion to keep
captures stable. They are engineering fixtures, not production character renders.

| Capture | Purpose |
| --- | --- |
| [Holo desktop](holo-desktop.png) | 1920×1080 actual GLB and full stage/captions |
| [Mini desktop](mini-desktop.png) | 1920×1080 actual modeled shell/visor/body |
| [Holo face](holo-face.png) | Close inspection of eyes/mouth; warm expression |
| [Mini face](mini-face.png) | Close inspection of emissive facial geometry |
| [Mini speaking](mini-speaking.png) | Actual runtime state/caption during silent synthetic cues |
| [Narrow window](mini-narrow.png) | 1100×800 with OS reduced-motion preference |
| [Compiled build](production-mini.png) | Mini rendered by `vite preview`, 1100×800 |

## Rendering measurement and limits

Environment: Linux cloud, Node 24.19.0, npm 11.9.0, Chromium 154.0.8037.57,
ANGLE/Vulkan **SwiftShader software renderer**, DPR 1. Actual JSON observations:
[browser desktop](browser-desktop.json), [browser narrow](browser-narrow.json),
[compiled smoke](production-smoke.json), [dependency declarations](dependency-licenses.json).

The frame sampler collects 90 requestAnimationFrame deltas and discards the first
15. It measures a short startup/interaction window including asset/shader loading,
screenshot activity and cloud CPU contention; it is not an isolated steady-state
benchmark. The diagnostic labels expose this limited sample size.

| Viewport | Retained frames | Median frame delta | p95 frame delta |
| --- | ---: | ---: | ---: |
| 1920×1080 | 75 | 500.8 ms | 1304.9 ms |
| 1100×800 | 75 | 179.5 ms | 305.7 ms |

**This cloud rendering is slow; smooth desktop performance is not verified.**
No 60-FPS or Windows GPU claim is made. Check a release build on the target PC,
measure steady-state frame pacing and optimize materials/morph budgets before
production. Basic 390 px viewport overflow/controls and keyboard activation also
passed; this does not certify mobile product support or a screen-reader audit.

## Rights, security and open work

- Original fixtures: MIT, 1,116,472 bytes (Holo) and 1,574,148 bytes (Mini).
  Source and redistribution terms: [asset manifest](../../../assets/avatar-stage.manifest.json).
- Runtime libraries are MIT/BSD; build-data CC-BY attribution and all required
  retained notices are in `../THIRD_PARTY_NOTICES.md`. Fiber's npm tarball omitted
  its license; the exact version tag's unmodified notice is preserved locally.
- No paid service, account, generated asset purchase, hosted infrastructure or CI
  activation. No downloaded model, external texture/HDRI/font or real audio.
- Local GLB imports stay in memory, limited to 20 MiB. URI resources and required
  decoder extensions are refused; empty/invalid geometry is rejected. This is a
  technical compatibility check, not a guarantee against every hostile asset.
- No auth experiment file modified. No provider credentials or Node/IPC exposed.
- Context-loss fallback asks for reload; automatic restoration is not implemented.
- Final head/eye/skin anatomy, realistic facial articulation, eye-look tracking,
  seven art-authored visemes and final Mini design need asset work and visual review.
  Current morphs are simple geometric probes. Face-camera height assumes standard
  rig proportions; arbitrary imported assets can require manual framing.
- Future audio adapter must supply playback-clock-aligned timings and cancellation;
  no STT/TTS, audio continuity, actual microphone, OAuth or inference is validated.
- Electron integration, Windows GPU/device checks and packaging remain separate
  workstreams. Do not infer a public-release acceptance from this internal prototype.

Next ready work: author/review original production GLBs against `../RIG_CONTRACT.md`,
connect the offline voice adapter, then test real Italian audio sync and rendering
on Windows hardware. Keep the PR draft until technical/visual review is complete.
