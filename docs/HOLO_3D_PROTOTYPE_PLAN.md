# NEYDRA HOLO — 3D prototype pipeline and go/no-go plan (v1, 2026-10-28)

**Decision:** Build a genuine, softly feminine-neutral **3D face**, then render it as a hologram. **Do not** use the Mini robot reconstruction pipeline, a generated flat portrait, a static video, or a face made from scratch by a procedural Blender script. The emphasis is on a **convincing, controllable entrance/exit projection**, with basic facial deformation as a prerequisite for later speech.

**Status:** evaluated pipeline, NOT a produced/validated GLB or shader. No paid services, automatic deployment, real webcam activation or claim of working TTS. Read [Holo visual specification](HOLO_VISUAL_SPEC.md), [tokens](../design/holo.tokens.json) and [parallel tracks](HOLO_PARALLEL_WORK.md).

## Recommended toolchain / rationale

1. **Blender + MakeHuman Plugin for Blender (MPFB)**, preferably verified **MPFB 2.0.18 (released 2026-10-10)** on compatible Blender. MPFB can create a parametrically editable human base inside Blender; its face-operations/export-copy workflows can load **faceunits01** (54 ARKit-style facial shapes) and **visemes02** (15 Meta/VR-style visemes). These provide a real starting topology for blinking and speech instead of attempting to sculpt these functions from the reference image.
2. **Rights:** MPFB core geometry and the *functional* visemes02 and faceunits01 packs are documented **CC0**. MPFB program code uses GPL; do not bundle its program into the Electron app. Record the precise pack versions, origin and licenses used; avoid optional third-party assets unless separately reviewed.
3. **Blender is an authoring tool only.** Export a compact standalone glTF 2.0 `.glb` with actual morph targets / neutral pose and no baked projector beam. Maintain an editable source `.blend` and export recipe.
4. **Three.js in a dedicated Holo renderer** owns the holographic appearance, beam, particles, head pose, state transitions, timing and materialization. This keeps entry/exit reversible, resizable, interruptible and compatible with the desktop theme. Do not assume Blender shaders/particles export faithfully to GLB. Prefer a known morph-capable material base in the WebGL stage, adding transparency/emission/edge/mask effects in small, testable increments. Avoid expensive glass/transmission as the default: looking like *light* is more important than physically accurate glass.
5. Reuse and adapt the existing [technical 3D lab in DRAFT PR #7](https://github.com/francescocella-dev/neydra/pull/7), **not** its procedural Holo placeholder artwork. Its typed six-state engine, GLB loader, playback samples, morph and cancel tests are valuable, but the PR currently targets `main` and is **not yet integrated** with the Holo design branch. Coordinate integration separately; do not cherry-pick unrelated files or merge automatically.

Official references checked 2026-10-28:
- MPFB release: https://www.makehumancommunity.org/mpfb/releases/release_2018.html
- MPFB initial setup: https://www.makehumancommunity.org/mpfb/docs/getting_started.html
- MPFB export-copy and facial keys: https://www.makehumancommunity.org/mpfb/docs/exporting/export_copy.html
- MPFB shape-key / lip-sync: https://www.makehumancommunity.org/mpfb/docs/lipsync/index.html
- CC0 functional asset packs: https://static.makehumancommunity.org/assets/assetpacks.html
- Three.js glTF loader: https://threejs.org/docs/pages/GLTFLoader.html
- Three.js material/alpha details: https://threejs.org/docs/pages/Material.html

## System separation

**A. Geometry asset (Blender):** original NEYDRA Holo face silhouette only; smooth bald cranium, soft cheek/jaw, expressive palpebral loops, neutral softly feminine facial structure, **no separate eyebrows, hair, painted lips, bust or clothes**. Geometry must remain recognizable without shader. Keep eyes and a modest internal mouth cavity/inner-mouth darkening only if needed for speaking. The mouth is a subtle slit in neutral, not a lipstick outline. The head's lower silhouette can later disappear via a material fade; do not sculpt a visibly chopped neck.

**B. Facial animation (morphs):** eyelid blinks, jaw open, lip closure/pucker/rounded vowel, subtle smile and optional eye tracking. MPFB faceunits/visemes are a candidate **source of keys**; export and inspect before asserting compatibility. The Holo runtime adapter maps source morph names to the canonical event model and **ignores brow controls** even if source data contains them. Whole-head yaw/pitch can be applied to a pivot group in Three.js; no leg/body rig or character animation clips are needed for Holo.

**C. Shader (Three.js):** ice/cyan face tint, central soft emission, subtle Fresnel rim, alpha starting point from `design/holo.tokens.json` (0.62), subtle particles and low-frequency scanline noise. Prioritize visibility of eyelids/face over maximum transparency. Test sorting of eyeballs vs face, z-fighting and backfaces. Keep an opaque/low-alpha fallback in case transparent rendering ruins facial readability.

**D. Projection VFX (Three.js, independent of GLB):** virtual circular light aperture at bottom center of stage, thin diverging volumetric cone / layered soft translucent geometry, sparse upward light motes, and a height-dependent noisy reveal mask on the **actual face mesh**. No access to a real computer camera. The beam adapts to stage bounds; controls, captions and transcript always remain on top.

## Important asset pipeline pitfall

MPFB starts with a human **body**. Holo must ultimately show and ship **just the necessary head geometry**. Do **not** delete body vertices from the parametric base *before* applying generated facial targets: target packs can depend on the original vertex layout.

- Keep an untouched editable base human file.
- Produce MPFB **Export Copy** with modeling shapes baked but **facial morph keys retained/added**, and test that the exported GLB really has working `eyeBlinkLeft/Right`, mouth and jaw channels.
- Only on a **duplicate export mesh**, experiment with removing/excluding geometry below the head in Blender while preserving all shape-key index correspondence. Run a morph integrity test *after* any deletion. If this breaks targets, keep original topology for the first POC and use renderer visibility/mask, then optimize cut-down geometry later.
- Do not accept a body merely set to invisible in Blender when the shipped GLB still renders it. Confirm exact runtime geometry, bounding box and material masks.

## Animation priority #1 — materialization / dematerialization

Canonical timing remains in [design/holo.tokens.json](../design/holo.tokens.json): **entrance 1350 ms, exit 650 ms**; both are design targets, not measured latency. Define one continuous `projectionProgress` parameter **0..1** (0 = invisible, 1 = fully present). The inverse animation uses the **same** mask; avoid separate mismatched 'appear' and 'disappear' files.

| Entrance phase | Elapsed time (target) | Visual |
| --- | --- | --- |
| Waking aperture | 0–180 ms | optical origin brightens; head invisible |
| Beam formation | 180–450 ms | blue light cone expands from the aperture toward head footprint |
| Face reconstruction | 450–1080 ms | fine points and edge highlight coalesce; vertical noisy mask reveals true 3D face, generally from lower to upper features |
| Stabilization | 1080–1350 ms | face settles to normal translucent opacity; excess particles disperse; eyes focus |

**Exit:** reduce `projectionProgress` from the current value to 0 over the configured 650 ms equivalent, with contour fragmenting subtly into light; beam narrows and aperture dims. A rapid toggled reversal must start from its *current rendered progress*, not reset to endpoints. State change / Stop does not automatically dismiss the face unless an explicit dismissal action asks for it. Re-selecting Holo must not create duplicate meshes or lose conversation/audio.

**Shader design:** progressive threshold from object-local vertical coordinate plus seeded low-amplitude procedural noise; slight glowing boundary traveling with threshold; independently animated cone/emitter. Reveal mask must apply to all visible components consistently (face, eye shells, inner mouth) or they will appear before the face. Keep the mask's implementation compatible with morph targets and normal rendering. Make shader time/parameters deterministic and resettable for tests. Avoid fixed image textures or baked video loops.

**Reduced motion:** static prompt face + subtle fade (target <=180 ms), no sweeping reveal, endless particles, flicker or continuous cone; preserve blink and intentional mouth articulation. No strobing or rapid scanlines.

## Phased proof, stopping at failure

### Gate 0 — candidate works, before any art polish
- Install compatible Blender + MPFB and CC0 `faceunits01` / `visemes02` packs.
- Create original neutral bald face; test only **two independent eyelid keys and three mouth shapes** inside Blender.
- Produce an Export Copy and test a self-contained GLB in an external viewer / existing stage: the **actual exported** morphs deform eyelids and mouth. Check rights/provenance; no paid tools.
- **STOP / reconsider** if pack dependency or export destroys shape keys, face anatomy cannot deform cleanly, or license/source cannot be established.

### Gate 1 — first visual approval
- Three grayscale snapshots from **one** GLB: front, 3/4, profile; neutral and eye shut/mouth open detail crops. The owner judges face shape **before** all holographic post-effects.
- Iterate only on face proportions and mouth/eyes if incorrect. Do not invest in costly shader work until the silhouette is acceptable.

### Gate 2 — central hologram experiment
- In isolated Three.js preview, render that GLB with actual translucency and bottom emitter. Test `appear`, `disappear`, `reverse mid-animation` and `reduced motion`.
- Capture identical-camera **0%, 25%, 50%, 75%, 100%** progress frames for visual review plus one short actual runtime recording. There must be no popping of eyes, hard mesh cuts, layer-order defects or excessive bloom.
- Main visual milestone: user accepts a convincing 'light becomes a face' effect.

### Gate 3 — minimal living face
- Connect blink, small yaw/pitch, attentive gaze where supported, a restrained smile, plus mouth channels driven by **clearly simulated** timestamped visemes. Verify rapid interruption and restoring neutral mouth.
- Target compatibility with the six existing shared states without implementing duplicate conversation/voice state ownership.
- Simulated event playback does **not** prove accurate Italian lip sync.

### Gate 4 — desktop integration (later)
- Import asset+VFX into the isolated Holo stage/theme, preserve all consent, text/chat state, auth/security boundaries and Mini features.
- Test desktop viewport 720×480 to 1920×1080, Windows scaling 100/125/150%, no controls obscured, reduced motion, screenshot evidence, GPU measurements. Do not claim Windows PASS from Linux software rendering.
- Real TTS/audio-clock sync is a separate workstream and needs instrumented proof; no paid audio API fallback.

## Proposed file/artifact boundaries

- `assets/holo/source/holo-base.blend` editable authoring (if size/rights appropriate for version control).
- `assets/holo/holo-head.glb` **genuine** compact model (only after validating size/rights).
- `assets/holo/rig-map.json`, `assets/holo/ASSET_PROVENANCE.md` (exact source release, license, SHA256, export flags, channel names; no fictitious artifact links).
- `experiments/holo-projection/` (or a **Holo-only** subfolder in the existing avatar-stage after PR #7 coordination): scene, shader/VFX, deterministic progress driver, screenshots/tests.
- **No edits** to `apps/desktop/src/renderer/style.css`, the Mini companion or auth IPC in the 3D POC. The separate UI workstream owns those files.

## Go/no-go checklist for initial prototype

- [ ] Owner approves original hairless head in neutral **without** hologram effects
- [ ] Exported real GLB facial channels demonstrably work in Three.js (not only Blender)
- [ ] Visible only face/head and optical aperture — no body/neck
- [ ] In/out/reversal genuinely affect the 3D head, not a screenshot
- [ ] Face remains readable in front, 3/4 and blink/speech views at translucency target
- [ ] Reduced motion, Stop/interrupt and toggling cannot leave an orphan beam or stale face
- [ ] Rights, versioning and zero additional spend documented
- [ ] Screenshots/recording and tested runtime marked **actual** vs **simulated**
- [ ] Windows performance, voice alignment and final cosmetic approval explicitly remain open if not measured

**Fallback:** If MPFB cannot meet the visible-face target, test a separately sourced open-license **facial-animation-ready** head mesh with verified morph targets and an original redesign. Do not return directly to image-to-3D generators that provide a static, difficult-to-rig sculpt; do not pretend a 2D effect fulfills the 3D requirement.
