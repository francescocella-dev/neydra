# Holo — Blender → animatable GLB → projection lab

Issue [#13](https://github.com/francescocella-dev/neydra/issues/13). This isolated lab uses the owner's approved MPFB face, never PR #7's procedural fixture. No desktop/Mini/auth/IPC/voice changes. No hosted services or paid APIs.

## One action on this Windows workspace

Double-click **Launch-Holo.cmd**. It installs locked npm dependencies only if absent, runs/caches/verifies Blender export and opens the local viewer. Keep the console open; Ctrl+C stops the local server. Click **Demo completa** for appearance → simulated mouth animation → disappearance. Appari/Scompari/Inverti work mid-transition; Stop clears mouth weights immediately. Use the preset selector for independent eyelids and mouth closure, and mouse drag/wheel for genuine 3D inspection. No sliders in Blender are needed.

Prerequisites already verified here: Node 24, Blender 4.5.14 LTS, MPFB 2.0.18 and local approved `.blend` inputs. The reusable input resolver checks `holo_asset_work/` in the repository, then alongside the isolated checkout as in this workspace; other locations use explicit flags:

```powershell
npm ci --ignore-scripts --no-fund
npm run pipeline -- --source D:/path/NEYDRA_Holo_FacialKeys_v01.blend --approved D:/path/NEYDRA_Holo_AutoFace_v01.blend --blender "C:/Program Files/Blender Foundation/Blender 4.5/blender.exe" --serve --open
```

`NEYDRA_BLENDER` also selects the executable. Blender runs background/factory startup with auto-execution disabled; baked FacialKeys export does not require enabling MPFB. Installed addon/pack provenance can be recorded with `node scripts/provenance.mjs` on this author's Windows setup. Missing inputs are a real blocker; the pipeline never manufactures a substitute.

## Artifacts and repeatability

- `local/runs/<input-and-recipe-hash>/holo-head.glb`: self-contained glTF 2.0, no required extension or external resource, <20 MiB.
- Same directory: `holo-runtime.blend`, `export-report.json`, `asset-check.json`.
- `local/public/`: validated active GLB/report served by Vite; `local/active.json` identifies its immutable run. `local/last-export.log` records the Blender process.
- `evidence/`: committed **text** measurements; ignored screenshots and `demonstration.webm` are local real runtime captures.

The run key includes both source file bytes and `export_blend.py`. A completed cache is decoded and checked again before publishing locally. An incomplete directory is never silently overwritten; inspect the logged failure and use a distinct copy/recipe after fixing it. A lock prevents concurrent exports; a stale `local/pipeline.lock` requires checking that the previous process has ended. Files in `holo_asset_work` are never written. Failed runs do not replace the active GLB.

Binary assets and captures remain ignored: issue #13 explicitly requires owner confirmation before committing them. The draft PR can be reviewed from scripts, text evidence and locally opened captures. A fresh cloud checkout has no owner `.blend` and is **BLOCKED ON LOCAL BLEND INPUT** for real export/render evidence; unit tests/build remain runnable, but a built viewer without the local GLB is not a completed asset demo.

## Export / rig contract

The approved neutral shape is reconstructed from MPFB's saved active shape weights and compared against FacialKeys Basis (measured maximum error **0**). Required morphs are checked on the untouched 19,158-vertex source before deriving a head. Only skin polygons in MPFB's `body` group, all vertices above **1.36 m** in this exact authored input, are copied. Helpers, joint cubes and lower body are excluded. Every facial key is rebuilt via an explicit original→runtime index map; all retained position deltas are compared within 1e-6 m. No remeshing, decimation, body rig, newly modeled face or automatic sculpting.

4,254 runtime vertices, 8,456 skin triangles, 67 exported keys (including zero-delta silence and tongueOut after head extraction). Actual source anatomy has **no separate eyeballs, teeth or tongue**; these have not been invented or imported. Eye-look morphs deform existing eyelid areas; they do not prove animated eyeballs. Future anatomy needs a separate art decision. Normals are exported for the neutral surface; morph normals/tangents are omitted. Extreme shape lighting and lip/eyelid collisions remain visual review items.

Meters, glTF +Y up, face toward +Z, centered head pivot; hierarchy `Body > Head`. This head is intentionally not positioned at a character's feet: PR #7's bounding-box fitting can normalize it, while its floor/face camera needs adjustment. The new shader removes the remaining lower rim via a shared height mask on the actual deformed mesh. A depth prepass hides inner surfaces through the translucent head; it shares the same geometry/weights/reveal as the color pass. Triangle counts during rendering include that extra pass and beam geometry.

`src/rig.ts` maps PR #7 canonical events to MPFB:

| Canonical | MPFB source |
|---|---|
| eyeBlinkLeft / eyeBlinkRight | same |
| jawOpen / mouthClose / mouthPucker / mouthFunnel | same (inspection presets) |
| mouthSmile | mouthSmileLeft + mouthSmileRight at restrained weight |
| viseme_aa / ee / ih / oh / ou / ff / mm | viseme_aa / E / I / O / U / FF / PP |
| silence | zero all speech channels; ignore zero-delta viseme_sil |

MPFB visemes already incorporate jaw motion, so the adapter does not add PR #7's generic jaw contribution. Brow controls are deliberately ignored. AvatarEngine's six-state/event protocol and synthetic Italian cue sample are reused as project-owned code. The engine itself owns no audio or model connection. Cancelled utterance IDs cannot revive speech through late cues.

## Projection / accessibility

One `Projection` value 0..1 drives emitter, beam and morph-capable material. Linear progress takes 1350 ms in / 650 ms out over full travel; reversal samples its current value and scales remaining duration by distance. Spatial shader reveal adds a deterministic height/noise boundary and low-intensity rim. The source is a virtual aperture; there is no webcam/device access. The current POC uses no separate particle system or bloom, keeping deformations inspectable.

Reduced motion is initialized from the OS preference and remains user-selectable: continuous reveal switches to a nondirectional fade within 180 ms, beam and automatic head drift/blink stop, explicit blink/mouth tests remain. All six states have text labels. The lab's own scoped CSS handles desktop, 720×480 and a 390 px stacked layout; global desktop CSS is untouched. System fonts are used for this independent engineering viewer (desktop font assets are not copied).

## Reproduce checks

```powershell
npm run pipeline
npm run assets:check
npm run typecheck
npm run lint
npm test
npm run build
npm run test:browser
```

Browser tests use installed Windows Edge and its WebGL renderer. They inspect finite delta data, opposite eyelid sides, independent weights and `Mesh.getVertexPosition()` changes on the loaded GLB; capture frontal/3/4/profile, eye/mouth poses, projection progress 0/25/50/75/100, neutral/light material, reduced motion and narrow/mobile windows; exercise full demo, reversal and cancellation. The WebGL canvas is recorded by MediaRecorder, requiring no extra ffmpeg installation. These tests require local inputs/export and are not wired into paid or automatic CI.

TypeScript/lint/unit/build success does not prove aesthetic acceptance, realistic Italian lip sync, real speech, foreground Windows GPU performance, or desktop integration. See [evidence/REPORT.md](evidence/REPORT.md).

## Specification snapshots / reuse

No merge/cherry-pick of other PR branches. Source references read 2026-10-28:

- Visual spec/tokens PR #11: `ae99f6c86bbea98c26395c9b980b4387aba4f6f0`. Unmodified `spec/holo.tokens.json` is a local snapshot of its canonical tokens.
- Prototype plan/parallel boundaries PR #12: `7018a1807dcaa508d2d32ed9bfea85172fdfb3d0`.
- Lab/rig contract PR #7: `2d7068b3966d314b2544445e0fa56fcc8ad1fcc0`. Project-owned `assets.ts`, `engine/AvatarEngine.ts`, `engine/protocol.ts` and `engine/demo.ts` are copied unchanged; their fixtures, dependencies and other workstreams are not merged.

## Rights

The MPFB program is GPL-3.0-or-later and is **not bundled**. Its core mesh/targets are CC0-1.0; the installed faceunits01 and visemes02 metadata declares CC0, author Mika Suominen. Exact installed metadata SHA256 values and source asset hashes are in [provenance.json](evidence/provenance.json) and [export-report.json](evidence/export-report.json). Original pack ZIP/release hashes are unavailable and are not invented. No external texture/model/voice or paid asset is added. Owner confirmation remains required before committing these derived binaries.

Primary references checked: [MPFB license and output rights](https://github.com/makehumancommunity/mpfb2/blob/master/LICENSE.md), [functional packs](https://static.makehumancommunity.org/assets/assetpacks.html), [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html). Three.js is MIT; npm tooling is development-only, locked in this directory. The project MIT license applies to new project-authored code.
