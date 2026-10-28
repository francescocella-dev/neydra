# HOLO — parallel implementation contract (UI theme and 3D model)

This handoff supplements [Holo visual specification](HOLO_VISUAL_SPEC.md), [canonical tokens](../design/holo.tokens.json) and the [shared animation contract](DESIGN_BIBLE.md). It **does not authorize a release or merge**. As of 2026-10-28 the design is specified but **Holo UI, rig, shader and lip sync are not implemented or hardware-validated**.

## Dependency graph

1. **Shared input, now:** `design/holo.tokens.json` is the canonical color/timing/numeric reference. `design/holo.tokens.css` is derived by `node design/generate-holo-css.mjs`; verify with `--check`. Keep the CSS scoped to `.theme-holo` / `[data-neydra-theme="holo"]`. Do not hand-edit the generated file.
2. **UI/theme track:** can begin immediately, without a finalized GLB. Build an opt-in Holo theme and a stage with an explicitly **temporary optical aperture** / projection VFX. Use actual Holo stage only once a real mesh is available; a temporary visual must say `prototype / Holo model pending`.
3. **3D/animation track:** independently produces a legally distributable GLB, rig/morph map, and renderer material preset, then tests the same six-state events. The mesh must render without assuming the UI track has shipped.
4. **Integration track:** bind GLB to Holo theme stage, real timed visemes and cancellation. Validate hardware and the exact viewport sizes before visual approval.

## File ownership and boundaries

| Track | Owns | Must not modify without coordination |
| --- | --- | --- |
| UI | `apps/desktop/src/renderer/` Holo theme components/styles/tests, optionally new Holo-specific files | Mini's approved visuals, companion preload/IPC, account/auth, playback protocols, `design/holo.tokens.json` without joint review |
| 3D | `assets/holo/` (proposed destination), `experiments/avatar-stage/` if used, mesh/export/rig documents, asset provenance | desktop renderer style/layout, authentication, existing shared animation event definitions |
| Integration | narrow Holo stage loader/adapter and cross-track automated tests after both outputs exist | global state/voice semantics, unrelated active PRs |

**Branching:** this specification lives on `feat/holo-design-system-v1` based on `feat/desktop-mini-interface`, with a separate PR targeted to the Mini feature branch. New working branches should start from `feat/holo-design-system-v1` (or from the later merged target containing these documents). Keep PRs separate by track; no automatic merge. Avoid editing files currently under review for Mini unless needed and explicitly coordinated.

## Contract exposed to the 3D track

Required **asset**: one named, genuine 3D head `.glb`, facing forward with reproducible neutral pose, calibrated scale/pivot at head center, eye closure controls and mouth articulation, license/source metadata, and a list of GLB morph/rig channel names. Suggested canonical channels: `eyeBlinkLeft/Right`, `jawOpen`, `mouthClose`, `mouthSmileLeft/Right`, `mouthPucker`, `mouthFunnel`. The adapter owns channel mapping; the underlying mesh need not use these exact names. No body or hair. Fade jaw via material mask/shader instead of cutting the mesh.

Required **runtime behavior**: consuming shared event names and state values; interruptible transitions; head yaw/pitch and eye gaze within spec limits; eye blink; viseme timestamps/weights or a clearly marked simulated viseme source for test. Do not infer actual microphone permissions or working speech from offline samples.

Prove: exported GLB reimport in renderer, face deformation closeups without clipping, frontal + 3/4 + profile, rapid cancellation, normal/reduced motion, provenance/license. Do not substitute the concept render for a shippable GLB.

## Contract exposed to the UI track

Required **theme**: isolated `data-neydra-theme="holo"` opt-in, background/panels/typography/button states from tokens, focus and legible captions, beam/emitter behind controls, fixed viewport layout (no global scroll), no changes to Mini colors in Mini mode. Use CSS vars from the generated CSS, importing the file explicitly **only in the theme implementation**. Material/beam are visual layers, *not* a simulated face and *not* access to a hardware camera.

Prove: screenshots on Windows at typical large and narrow viewport sizes, accessible contrast/focus, `prefers-reduced-motion`, no control obstruction, both theme switch directions without losing chat state, opt-in flag persistence only when implemented/approved.

## Merge and acceptance gates

- **Design-only PR**: inspect token JSON and CSS generation `--check`; no runtime/UI claim.
- **Theme PR**: repeat current check/lint/typecheck/unit/build/preload and Windows UI/E2E; no functional regressions to consent, stream, fullscreen, Mini companion, security boundaries.
- **3D PR**: export validation, genuine render, state/morph test, screenshot/video, asset source rights and license.
- **Integrated PR**: Holo facial speech with measured synchronization, cancellation, first real Windows GPU performance report and explicit owner visual approval.
- The pre-existing Mini companion PR remains **DRAFT until the owner's separate Windows gate passes**. A green Holo documentation check does not pass that gate.

**Stop conditions:** visual resemblance to a copyrighted character, non-distributable asset, broken lip/jaw mesh, shader that prevents expression reading, unwanted camera/device permission, audio reset when switching avatar, or regression to Mini security/UI. Record issues and do not claim a finished avatar.
