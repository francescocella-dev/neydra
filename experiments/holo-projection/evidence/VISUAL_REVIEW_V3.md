# Holo V3 — digital light / aura review (2026-10-29)

Consolidated brief [6483816797](https://github.com/francescocella-dev/neydra/pull/14#issuecomment-6483816797) read in full, including the V2 observations it supersedes. One focused renderer pass in PR #14. **Technical checks PASS; final cosmetic acceptance PENDING OWNER.** No new dependencies, paid services, merge or release.

## Preserved model and fallback

The exact approved GLB is still used: **1,185,220 bytes; SHA256 `deb8e7c964797939be132cfff74facae1e963b45f1b6c08a17b5b92edf592005`**. All 67 exported channels, position/normal buffers, rig/viseme mapping, state engine and projection controller remain unchanged. As documented in V2, silence and retained tongueOut have zero deltas; no claim that all channel names are meaningful deformations. No facial geometry, eye anatomy or external asset is added.

Source `.blend` hashes are unchanged: AutoFace `57ae308b9c300034d0407e821589307cd04304ac03bc0b2a488969ab38a81612`; FacialKeys `e8c0094592f9d437e3e29256ef65f4bcdea749b63b679ebedc1b00290ff568bc`. The pipeline validated its existing cached run; no Blender authoring/export changes were needed.

**Resa → V2 · riferimento / fallback** or `/?version=v2` selects the V2 material/reveal/beam paths and hides V3 aura/particles. Switching reuses the same loaded head, controller and pool. V2's prior text evidence, PNGs and `demonstration-v2.webm` were not replaced. Its regression scenario now writes to `local/v2-regression/`.

## Visible changes / behavior

- **Face made of light:** official ice/cyan palette, brighter central ice light, spatial alpha emphasizing readable central features and softening the rim. The fine cell mask affects the contour more than eyes/mouth; no fullscreen grid or image is used. The source mesh/morphs still provide every facial feature.
- **Feathered contour and aura:** 320 tiny square samples and 96 low-alpha Gaussian halo samples use copied neutral head surface anchors/normals. They are parented to `Head` and follow its orientation in 3D. Central eye/nose/mouth anchor regions are excluded. Most movement is extremely slow sinusoidal drift (angular rates .13–.23 rad/s); approximately 18% of seeds also detach outward and smoothly fade over a 40-second cycle. No fast flashing or abrupt respawn: cycle boundaries have zero alpha.
- **Causal reconstruction:** 160 micro-fragments travel from the fixed lower emitter to surface anchors. The mesh's normalized local height has the main reveal delay, softened by low-frequency noise, fine cells and a broad transition envelope. The maximum delay plus envelope end is .98, so reaching progress 1 does not force an unfinished region to pop. No flat slicing plane or head-scale animation.
- **Atmospheric beam / exit:** the retained layered beam has wider, softer divergence and fewer visible narrow filaments. Source, beam, face, halo arrival and fragment travel all use the same reversible progress. Flow retraces toward the emitter on exit; it is disabled above progress .9 and all VFX disappear at 0. No independent timer restarts on reversal or duplicate pools.
- **Expression:** V2's subdued iris, independent blink and capped synthetic speech remain. Aura intensity is reduced during speaking. Original full-range mouth inspection presets remain available; no audio or real phoneme synchronization is claimed.
- **Reduced Motion:** automatic sweep is replaced by the existing <=180 ms fade, VFX clock is fixed at zero, fine floating/flow nodes are hidden, and only a faint static halo remains. Explicit eyelid/mouth tests, captions and controls still work.

The normal-blue captures visibly show softened outlines, sparse luminous pixels and a diffuse projector field without diagnostic markers. Marker shots quantify transmission separately. The central face is intentionally retained for readability; whether the balance is sufficiently luminous/ethereal, especially at the lower contour and in speech, remains an owner art decision. V2 is available immediately if the new pass is too soft. No further aesthetic iteration is undertaken before owner feedback.

## Budget and implementation

| Mode | Halo / fine / flow budget | Extra VFX draw calls | Total observed draw calls |
|---|---|---:|---:|
| V2 reference | V3 pool hidden | 0 | 7 |
| V3 stable, wide viewport | 96 / 320 / 0 active | 2 | 9 |
| V3 reconstructing | 96 / 320 / 160 | 3 | 10 |
| Narrow canvas (<800 px) | 48 / 160 / 80 maximum | 3 maximum | bounded by the same node count |
| Reduced Motion | static halo only | 1 | no floating/flow node drawn |
| Progress 0 / page exit | none visible; disposed at page exit | 0 | no residual point primitives |

Three pooled Points/BufferGeometry/ShaderMaterial objects are created once. The copied anchor, normal and seed arrays use 8,960 CPU bytes; separate GPU attributes for the three geometries are approximately 26,880 bytes, excluding Three objects/driver overhead. Rendering uses no per-frame VFX array allocation, CPU particle spawning or geometry rebuild. Only scalar/vector uniforms and reused matrices change; diagnostic snapshots/readPixels allocate **only when tests request them**, outside the normal VFX update. Existing engine/UI sampling allocations are not claimed to have been eliminated. DPR remains capped at 1.75; narrow viewports halve sample counts. Point size stays roughly 1–3 CSS pixels depending on seed/distance; halo points are larger but very low-alpha and soft.

The backdrop follows the camera to cover the 3/4 view without a visible plane edge. It is a background layer only; the face and aura remain actual 3D scene objects. No bloom, ray-marched volume, textures, device access or new renderer dependency.

## Real evidence

[browser-review-v3.json](browser-review-v3.json) contains actual framebuffer checks, draw counts and paired timings. V2 baseline remains in [VISUAL_REVIEW_V2.md](VISUAL_REVIEW_V2.md).

| Check | Result / limit |
|---|---|
| Reference-marker contrast through the stable face | V3 **0.61360**; V2 baseline approximately 0.447. A measured marker RGB contrast ratio, not physical transmission or automatic cosmetic acceptance. |
| Reconstruction direction at progress .42 | Normalized face signal lower rows **0.82973**, upper rows **0.27495**; lower portion forms first. |
| Continuity, progress .40→.50 by .02 | Maximum normalized RGB RMS step **0.01463 or less** (assert <.05). |
| Endpoint continuity .94/.96/.98/1 | Zero change in the central sample; field completes before the final endpoint. Finite samples do not prove every view/combination artifact-free. |
| Aura | Actual outside-face pixels change when VFX is hidden, drift with time, and replay exactly at fixed time/seed. Head-yaw changes its world transform; parent is the real head. |
| Reduced Motion | Framebuffer exactly unchanged between requested VFX times 1 and 100; time 0 and static-only node count confirmed. |
| Cleanup / cancellation / reversal | No rendered points at 0; immediate neutral speech weights on Stop; reversible mid-flight progress, repeated identical half-progress field, no new pool; idempotent resource disposal unit test. |
| Viewports | 1920×1080, 1440×960 comparison, 720×480 and 390×844 screenshots; narrow particle budget verified and no horizontal page overflow. |

### Paired headless frame sample

Same 1920×1080 viewport, frontal camera and stable pose; 250 ms warmup + 2-second sample per selected profile. Actual animation-loop frame intervals, **not GPU render time**:

| Profile | Frames | Median | p95 | Calls / points |
|---|---:|---:|---:|---|
| V2 fallback path | 121 | 16.70 ms | 16.90 ms | 7 / 0 |
| V3 | 121 | 16.70 ms | 16.90 ms | 9 / 416 |

New demo sample: 461 frames, median 16.70 ms, p95 16.90 ms. This short Windows **headless Edge** comparison shows no meaningful pacing regression in this run; it is not a foreground GPU/DPI benchmark, guarantee for other hardware, or a percentile stability study. V2 selection uses the retained paths in the same current renderer; older V2 source and recordings remain in Git/local evidence for reference.

## Captures / video (local, ignored)

- **`evidence/demonstration-v3.webm`**: 1,485,608 bytes; decoded duration 7.56 s, actual canvas 1630×946 inside the same 1920×1080 viewport as V2. Same perspective 32°, target, distance and entry 1350 ms → synthetic speech 4800 ms → 200 ms pause → exit 650 ms timeline. MediaRecorder requests 24 fps; variable encoded timestamps are not claimed to be constant measured fps.
- `v3-video-first.png`, `v3-video-entry.png` (.65 s), `v3-video-stable.png` (2.5 s), `v3-video-exit.png` (6.9 s): decoded real video frames inspected for initial empty field, causal reveal, stable face and exit. Existing installed local ffmpeg was used; no new executable downloaded.
- `v3-progress-0/25/50/75/100.png`, `v3-stable.png`, `v3-speaking.png`, `v3-exit-50.png` (the shared exact half-progress field), `v3-three-quarter.png`.
- `v3-face-detail.png`, `v3-edge-detail.png`, `v3-blink-left/right/closed.png`, `v3-mouth-open/close.png`, `v3-reduced-motion.png`, `v3-720.png`, `v3-390.png`.
- Matched-camera normal/marker comparison: `v3-compare-v2-normal/markers.png` and `v3-compare-v3-normal/markers.png`. Original `demonstration-v2.webm` stays untouched; V2 rerun outputs live in `local/v2-regression/`.

## Commands / delivery

All executed in `experiments/holo-projection/`:

- `npm run pipeline` — PASS, existing input/recipe hash validated and cached GLB decoded again.
- `npm run assets:check` — PASS; unchanged embedded GLB, real GLTFLoader parse, all finite morph data compared to the original export report.
- `npm run typecheck` and `npm run lint` — PASS.
- `npm test` — PASS, **4 suites / 10 tests**; adds deterministic anchors, budgets, unchanged source geometry, head parenting, reversal reuse, reduced mode and idempotent disposal.
- `npm run build` — PASS.
- `npm run test:browser` — PASS, **2 scenarios**, 43.4 s total: retained V2 regression and new actual V3 flow, with screenshots/video, shader/framebuffer/particle/cleanup/state checks. Zero page/console errors.
- `git diff --check` — PASS.

Only the Holo laboratory is changed. No Mini/desktop/auth/audio/IPC, source asset/export, rig/event map, token or dependency changes. No desktop tests were run. GLB, Blender, PNG and WebM files remain ignored and uncommitted. PR #14 remains **DRAFT**, with no merge/release. Next step is the owner's visual comparison of V3 against V2; technical checks do not pre-approve the aesthetic result.
