# Issue #13 — local technical evidence (2026-10-29)

This is the preserved v1 baseline. For the subsequent renderer-only visual review, updated captures, test counts and measurements, see [VISUAL_REVIEW_V2.md](VISUAL_REVIEW_V2.md).

**Result:** real approved Blender input → compact morph GLB → real Three.js rendering **PASS for the measured technical checks**. Holographic cosmetic acceptance **PENDING OWNER REVIEW**. No merge, release, billed service or desktop integration.

## Preserved baseline and boundaries

Original checkout: `feat/desktop-mini-interface` at `c965021`, with untracked Mini asset/reference/task files. It remains on that branch with those files intact. Work is isolated on `codex/holo-blender-glb-pipeline`, based on `main` `92d4793`, in a nested local worktree. Only `experiments/holo-projection/` is added. Specifications from PRs #11/#12 and the PR #7 rig/loader were read without merging their branches. No Mini, chat, authentication, providers, IPC, global CSS or workflows changed.

Both original sources are still at the owner's `holo_asset_work/` location:

| Input | Bytes | SHA256 |
|---|---:|---|
| NEYDRA_Holo_AutoFace_v01.blend | 10,032,112 | `57ae308b9c300034d0407e821589307cd04304ac03bc0b2a488969ab38a81612` |
| NEYDRA_Holo_FacialKeys_v01.blend | 28,680,085 | `e8c0094592f9d437e3e29256ef65f4bcdea749b63b679ebedc1b00290ff568bc` |

Original report read: FacialKeys PASS, 68 names including Basis. This was **not** treated as proof of GLB deformability. Actual preflight detected Blender **4.5.14 LTS**, installed MPFB **2.0.18**, real skin group 13,380 vertices, helper geometry 4,778 and joint cubes 1,000. Export runs under factory startup with embedded script auto-execution disabled. MPFB need not be enabled to export its already baked data.

## Evidence across boundaries

| Boundary | Result | Evidence |
|---|---|---|
| Approved design → FacialKeys neutral | PASS | Reconstructed original active shape mix equals FacialKeys Basis, max error 0 m |
| Original morphs → derived head | PASS | Required blinks/jaw/closure/pucker/funnel/aa have nonzero deltas before extraction; all retained key deltas preserved within 1e-6 m by explicit index map |
| Export → embedded GLB | PASS | `export-report.json`: 1,185,220 bytes, 4,254 vertices, 8,456 triangles, 67 keys; no external/data URI or required compression extension |
| GLB → Three.js | PASS | `asset-check.json`: genuine GLTFLoader parse, hierarchy/bounds and all finite exported delta arrays checked against Blender report |
| Loaded geometry → controls | PASS | `browser-report.json`: opposite-side blink deltas, independent weights, `Mesh.getVertexPosition()` changes for eyelids/jaw/closure/pucker/funnel, seven nonzero mapped viseme targets |
| Progress → rendered mesh | PASS technically | Captures at 0/25/50/75/100; same height/noise mask and depth prepass on actual deformed mesh; front/3/4/profile and mouth/eye captures |
| Demo → cancellation/reversal | PASS | Browser full entry/synthetic mouth sequence/exit, Stop clears mouth immediately, midway inverse starts at current progress; unit checks 1350/650 ms and rapid reversal |
| Accessibility/resizing | PASS for test sizes | Reduced mode ≤180 ms math contract; no beam/automatic drift, explicit morphs still available; 1440×960, 1920×1080, 720×480 and 390×844 captures, no horizontal page overflow |

GLB SHA256: `deb8e7c964797939be132cfff74facae1e963b45f1b6c08a17b5b92edf592005`.
Active local GLB: `local/public/holo-head.glb`; immutable run and runtime `.blend`: `local/runs/caea966e031f49dad6cc/`. These generated binaries are intentionally ignored, pending the owner's explicit permission to commit them as required by issue #13.

## Commands and results

Commands run from `experiments/holo-projection` in the isolated checkout:

| Command | Result |
|---|---|
| Blender `--background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/inspect_blend.py -- <FacialKeys>` | PASS; original hashes stable, actual deltas and group inventory recorded |
| `npm ci --ignore-scripts --no-fund --no-audit` | PASS, isolated local dependencies |
| `node scripts/provenance.mjs` | PASS; installed functional metadata CC0, hashes recorded |
| `npm run pipeline` | PASS; fresh Blender export, then verified cached repeat without overwriting sources |
| `npm run assets:check` | PASS; real decoded GLB/data checks |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS, 2 suites / 6 tests |
| `npm run build` | PASS; Vite 8.3.5 production bundle |
| `npm run test:browser` | PASS, 1 complete browser scenario, final capture run 22.6 s total, zero console/page errors and only local requests |
| `git diff --check` | PASS |

Network access was used only for the requested GitHub context, official references and isolated npm packages, with required sandbox authorizations. No asset pack/model/voice download or paid service was used. Root desktop tests/build were not run: no desktop code or root package/config was changed.

Resolved setup/technical failures, recorded honestly:

- Initial sandbox npm download stalled; the interrupted install left incomplete Three type files. A clean locked `npm ci` repaired that local installation.
- Vitest 4.0.0 with Vite 7.2.0 failed before collecting tests (`Unknown method: getBuiltins`). Aligning only Vite/Vitest to existing desktop versions 8.3.5/5.0.5 resolved it. An attempted broad ESLint-tool update was rejected by npm's peer resolver and not applied; lint tooling remains the initial locked 9.x/8.x set.
- Browser execution needed permission outside the sandbox. Playwright's video path also required an absent ffmpeg revision; no new external executable was installed. The actual canvas is recorded using Edge MediaRecorder instead.
- First screenshot inspection exposed transparent inner-surface artifacts. Correcting the height coordinate and using a shared morph/reveal depth prepass removed them. Neutral bounds now exclude Three's conservative union of extreme morph bounds.
- Stop originally waited until the next render frame to clear mesh weights; it now clears them synchronously. Browser assertion passes. A favicon 404 was removed with a local inline icon.

## Real local captures (not source-controlled binaries)

`front.png`, `three-quarter.png`, `profile.png`, `blink-left.png`, `blink-right.png`, `blink-closed.png`, `mouth-open.png`, `mouth-close.png`, `mouth-pucker.png`, `smile.png`, `gaze.png`, `neutral-material.png`, `light-background.png`, `progress-0.png` / `25` / `50` / `75` / `100`, `speaking-simulated.png`, `reduced-motion.png`, `narrow.png`, `mobile.png`.

`demonstration.webm`: actual WebGL canvas recording, 7.5 s of browser time at requested 24 fps, no audio. All imagery comes from the same approved-source GLB. No concept image or synthesized portrait is used. The recording and JSON identify simulated mouth timing rather than measured speech alignment.

## Remaining limits / owner gate

- The owner has approved the Blender face, **not yet this GLB/holographic material/beam**. Review the local viewer and these captures before aesthetic sign-off. No proportion sliders were changed.
- The approved source has no separate eyeball/teeth/tongue objects. The POC keeps its existing eye surfaces; it adds no iris or new mouth anatomy. It preserves ear shape from the approved original. Mouth interiors, extreme morph combinations and final eye/lip quality need art review; no automatic replacement design is proposed.
- Two exported channels (`viseme_sil`, `tongueOut`) have zero deltas in the retained head. Silence uses neutral; tongue movement is unsupported. No claim that every exported name deforms geometry.
- Head-only skin is extracted **after source delta proof** and index-preserved. The authored coordinate cutoff is input-specific and fails rather than guessing for an incompatible model. The shader fades the remaining lower rim; source topology/files remain intact.
- No separate particles/bloom in this first POC. Beam/material are engineering starting points using the official tokens. Morph normals are omitted; challenging lighting/extreme expressions need review.
- Tests ran on Windows in **headless Edge/WebGL**, not a foreground user-GPU benchmark. Frame-time display is a local sample including the render loop, not certified performance. Real Windows 100/125/150% DPI/device interaction remains unverified.
- No TTS, STT, microphone, real speech alignment, audio stream or account request. Simulated cues do not prove Italian lip sync.
- The draft contains source/text evidence only. Binary commit, merge, release, desktop integration and final cosmetic approval remain owner-controlled.

**Next step:** open `Launch-Holo.cmd` (or the already running local viewer), click Demo completa, and review the holographic result. Only after that approval should binary inclusion or a narrow desktop integration be considered.
