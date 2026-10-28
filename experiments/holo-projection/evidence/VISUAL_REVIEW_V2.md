# Holo visual review v2 — 2026-10-29

Response to [review comment 6483271288](https://github.com/francescocella-dev/neydra/pull/14#issuecomment-6483271288), one focused renderer pass on PR #14. **Technical checks PASS; cosmetic approval PENDING OWNER.** No Mini/desktop, auth, IPC, voice, export recipe, rig mapping, state engine or projection controller changes. No dependency additions.

## Changes

| Review concern | Renderer change | Evidence / limit |
|---|---|---|
| Solid uniform cyan | Lower emission (0.045 vs 0.22), ice/cyan shading gradient, restrained Fresnel, view-dependent alpha approximately 0.43–0.60 | Existing depth prepass prevents inner-surface leakage. Reference markers visible through actual face; opaque control hides them. Alpha alone is not a physical transmission measurement. |
| Horizontal reveal blade | Smooth 3D noise delays and fine surface cells, broad transition envelope, small height bias | Real deformed mesh and shared depth/color field; no displaced vertices, cut planes or detached particles. Pixel continuity and spatial coverage measured below. |
| Compact triangular beam | Three intersecting light sheets with Gaussian radial falloff and gradual end fade; smaller, dimmer aperture | Original cone removed from renderer only. No triangular opaque silhouette or pointed neck geometry added. This is a layered volumetric approximation, not ray marching. |
| Empty eyes | Optional original shader iris treatment on existing surfaces, using approved MPFB landmarks; follows local coordinates and blink weights | On/off captures and framebuffer difference; fully closed blink extinguishes it. No added eyeballs/textures or changed silhouette. This proposal is not final eye/anatomy approval. |
| Strong speech forms | Renderer-only smoothstep weight envelope, caps aa .58 / E .50 / I .45 / O .42 / U .38 / FF .52 / PP .55 | Mapping and cue clocks untouched; no doubled jaw. Full-range manual presets and source deltas still available. No real audio or lip-sync claim. |
| Black recording | Actual WebGL backdrop from the midnight-blue palette with blue glow; optional light reference and markers | Background is inside the canvas and therefore encoded in the new video. Markers are an opt-in inspection aid, not product decoration. |

## Preservation

GLB SHA256 remains `deb8e7c964797939be132cfff74facae1e963b45f1b6c08a17b5b92edf592005` (1,185,220 bytes, 4,254 vertices, 67 morph channels). Both original Blender hashes are unchanged from [v1 export report](export-report.json): AutoFace `57ae308b9c300034d0407e821589307cd04304ac03bc0b2a488969ab38a81612`; FacialKeys `e8c0094592f9d437e3e29256ef65f4bcdea749b63b679ebedc1b00290ff568bc`.

No Blender/export rerun was needed: the same GLB was decoded and checked again. `src/rig.ts`, `src/engine/`, `src/projection.ts`, `scripts/`, `spec/` and package/lock files have no changes in this revision. Shader position varyings read the morph result without changing it. The only new animation shaping is a renderer speech envelope before the existing rig adapter.

## Before / after artifacts, all local and ignored

The previous `evidence/demonstration.webm` and screenshots remain untouched; an additional copy is in `local/visual-review-before/`.

New **actual** canvas recording: `evidence/demonstration-v2.webm` (1,394,180 bytes, decoder duration 7.56 s for a 7.5 s capture window). Same 1920×1080 viewport, perspective camera (32°), target and distance as v1; the encoded canvas is 1630×946, with 24 fps requested by MediaRecorder (variable encoder timestamps, not a measured constant output frame rate). Compare it with the retained v1 recording (1,526,991 bytes). The initial canvas is explicitly rendered at progress 0 before recording, preventing a full-face flash before entry. The decoded first frame (`v2-video-first.png`) was inspected. A decoded frame at 0.65 s from the preceding validation capture (`v2-video-frame.png`) confirmed that the blue backdrop and diffuse reveal are inside the encoded WebGL video. Decoding used the already installed local ffmpeg, without downloading/installing another binary. No source/review/remote image is substituted.

Still comparisons use the same 1440×960 viewport and camera:

- v1 `progress-0/25/50/75/100.png` ↔ v2 `v2-progress-0/25/50/75/100.png`.
- v1 `front.png`, `blink-closed.png`, `mouth-open.png`, `mouth-close.png`, `speaking-simulated.png` ↔ same names with `v2-` prefix.
- `v2-exit-50.png` samples the same shared 0.5 field used during exit: no separate asymmetric exit effect. Actual full exit/reversal is also exercised and exit appears in the recording.
- `v2-translucency-dark.png`, `v2-translucency-light.png`, `v2-translucency-neutral.png`: marker backdrop, translucent/opaque controls.
- `v2-iris-on.png`, `v2-iris-off.png`; independent left/right/closed blink captures; front, 3/4, profile, gaze/smile, narrow/mobile and reduced-motion captures with `v2-` prefix.

## Measured framebuffer / performance evidence

Full machine-readable measurements: [browser-review-v2.json](browser-review-v2.json). Probes are RGB samples from a fixed 24×24 grid inside the frontal facial rectangle, read from the actual WebGL framebuffer, not shader-uniform values or screenshot metadata.

| Measurement | Result | Interpretation |
|---|---|---|
| Marker RGB RMS contrast with face / without face | 0.44699 | Approximately 45% of this reference-marker contrast survives the rendered face; proves visible translucency for this setup, not physical transmission. |
| Opaque neutral control | PASS, contrast ratio <0.10 | Same geometry obscures markers when rendered opaque. |
| Partially materialized rows at progress .50 | 24 / 24 sampled rows | Distributed partial coverage rather than a narrow horizontal transition band in this facial sample. |
| Largest normalized RGB RMS step, progress .44→.54 in .02 steps | 0.01304 or less | Smooth measured changes (assert <0.04). Finite sample, not proof against every possible view/weight artifact. |
| Iris on/off RGB RMS difference | 2.15381 / 255 channel scale | Minimal shading is actually present. Closed blink on/off difference is exactly zero in sampled pixels. |
| Animation-loop timing during new recording | 460 frames; median 16.70 ms, p95 17.10 ms | Windows **headless Edge** sample only; neither GPU render time nor a certified foreground Windows hardware/DPI benchmark. |

No visible horizontal clipping of eyes/mouth is introduced by the reveal in inspected front/3/4 captures. Extreme morph lighting and final material/eye/beam quality remain an owner visual gate. Background/alpha contrast is intentionally moderate to keep facial features legible.

## Commands rerun

From `experiments/holo-projection/`:

- `npm run assets:check` — PASS, same real GLB and all source-report delta checks.
- `npm run typecheck` — PASS.
- `npm run lint` — PASS.
- `npm test` — PASS, 3 suites / 7 tests, including the new speech-envelope test; previous mapping/cancellation/projection tests unchanged and passing.
- `npm run build` — PASS, Vite production build.
- `npm run test:browser` — PASS, final scenario 21.5 seconds total; morph deformation, independent blink, iris gating, marker translucency/opaque control, reveal continuity, reversal, cancellation, reduced motion, six states and responsive captures. No page/console errors; requests remain local.
- `git diff --check` — PASS.

Only `experiments/holo-projection/` changes. Desktop/Mini checks are outside this revision and were not run. Generated GLB/Blender/capture binaries remain ignored and uncommitted. PR remains **DRAFT**, with no merge or release. Next step: owner comparison of `demonstration-v2.webm` against v1 and aesthetic feedback.
