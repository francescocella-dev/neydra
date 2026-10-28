# NEYDRA / HOLO — Visual identity & motion specification v1.0

**Status (2026-10-28):** design direction defined for implementation; **not** a validated 3D model, finalized shader, installed UI theme, or tested voice integration. Holo is an **original** creation. Gideon in *The Flash* / *Legends of Tomorrow* is a *style-level* reference for a disembodied AI face, not a likeness, texture, frame, or mesh to copy.

**Canonical tokens:** [`design/holo.tokens.json`](../design/holo.tokens.json) (single source of values). [Generated CSS](../design/holo.tokens.css) is scoped and opt-in. [Parallel work contract](HOLO_PARALLEL_WORK.md). Shared six-state protocol: [Design Bible](DESIGN_BIBLE.md).

## 1. Character silhouette (approved direction)

Holo is **a face made of light**, not a bald person, a robot mask, a 2D portrait, or an upper-body bust.

- Only one continuous human-like **head/face**: no hair, eyebrows, beard, eyelashes rendered as makeup, clothing, torso, shoulders or visible neck. Avoid prominent ears or modeled ear jewelry.
- Neutral, gently feminine balance through smooth cheekbones, soft jaw, subtly almond-shaped eyes and restrained proportions; avoid looking like a specific actor/character.
- The lips are **not outlined or colored**. At rest, the mouth is a delicate thin discontinuity in the holographic surface; during speech it opens and shapes clearly enough to read, but never appears lipstick-like.
- Eyes remain readable and animatable; monochromatic cool luminous irises, soft palpebral contours, no high-contrast photorealistic eye whites or neon pupil dots.
- Entire forehead and cranium can be present. Jaw/lower perimeter **fades into radiance** instead of terminating at an obvious mesh cut. No hard seam, glass plate, face mask or wireframe skull.
- At rest: calm, alert, reassuring; no fixed smile, beauty filter, recognizable facial identity or anthropomorphic exaggerated features.
- The normal view is front-to-slight-three-quarter; rotations are limited so transparency does not break silhouette.

## 2. Palette — only Holo

| Role | Token | HEX | Intended use |
| --- | --- | --- | --- |
| Deep space | `backgroundDeep` | `#04101F` | app background base |
| Midnight blue | `backgroundMid` | `#0A1F36` | main gradient |
| Blue bloom | `backgroundGlow` | `#12365C` | quiet radial glow behind face |
| Panel | `surface` | `#10263D` | menus and transcript surfaces |
| Raised panel | `surfaceRaised` | `#163550` | hover/secondary panels |
| Soft outline | `stroke` | `#3C7192` | thin borders; not body copy |
| Main text | `text` | `#EAF8FF` | readable text |
| Secondary text | `textMuted` | `#A8CBDF` | helper text/metadata |
| Hologram core | `primary` | `#75DCFF` | head, projector energy, accent |
| Inner light | `ice` | `#D5F6FF` | central lighting, speaking |
| Electric blue | `electric` | `#348DFF` | secondary atmospheric particles, not small text |
| Edge/rim | `rim` | `#B8EDFF` | restrained Fresnel glow |
| State feedback | `listening`, `processing`, `interrupted`, `error` | JSON canonical | distinct state accents |

Suggested background: `linear-gradient(135deg, #04101F 0%, #0A1F36 62%, #12365C 100%)`, plus an extremely soft radial bloom **behind** the projected face. No Mini orange in Holo mode. Color should feel like **ice-cyan light in a midnight-blue room**, not bright saturated cobalt everywhere.

Typography inherited from the existing desktop: **Manrope** body and **Oxanium** technical headers; do not add web-hosted fonts. Body copy minimum 16 px, supporting metadata minimum 14 px. Normal text must meet WCAG AA contrast at its actual composited background; light beams and translucency must never reduce readability. Status feedback cannot rely on hue alone.

## 3. Material & lighting (starting points, not fixed shader truth)

- A **real 3D face mesh** with deformation-ready eyes/mouth under the hologram pass. Mesh should retain form in front and 3/4 views. Do not replace it with a flat image, video, a transparent plane or texture-only blinking.
- Base: blue/cyan translucent emission, subtle brighter central planes and luminous edges (Fresnel). **Starting alpha 0.62**, evaluate between **0.45–0.72** according to renderer and backdrop. These are tuning targets, **not guaranteed physically comparable** across Blender and Three.js.
- Fine low-density dots/pixels can drift inside the silhouette; opacity starting envelope **0.015–0.06**. They should be invisible at small scale rather than looking like freckles or skin pores. Scanline overlay at most **0.045** opacity, and optional.
- Edge light/fresnel emphasis should reveal jaw, cheek, nose and forehead without turning every contour into a thick neon line. Avoid glass reflections, hard plastic, metallic highlights, dense wireframes or sharp mesh triangle outlines.
- The eye/mouth silhouettes stay visible over bright backgrounds. Bloom is a **separate** adjustable post-effect; excessive bloom makes facial expression impossible to inspect.
- Implement as one facial rig with material/shader layers in renderer. Transparency sorting, depthWrite and z-fighting need visual testing; do not assume Blender viewport materials reproduce glTF results.

## 4. Projection effect inside the desktop application

The source is a **small virtual optical aperture** located at the **bottom center of the Holo stage**: a glowing circular camera-like emitter in UI art, *not* a physical cylindrical gadget, and **never permission to turn on the user's actual webcam**. A narrow bright origin expands into a restrained upward triangular/volumetric ray. Holo forms out of this projected light, jaw fading into it.

**Entrance: 1350 ms**, staged as: 0–20% emitter wakes; 20–80% beam grows and head gains opacity from coarse luminous point field; 80–100% surface stabilizes and eyes focus. **Exit: 650 ms**, reverse dissolve, without hard jump cuts. Interrupt/reselect must not create duplicate heads or restart audio.

At idle, the source glows gently and the beam is low contrast. It may not overlap the transcript, buttons, mic indicator or consent notices. Adapt the beam to available viewport height; when height is small, **shrink ray before shrinking controls**. Do not require camera device access, GPU compute, hosted assets or external effects services.

## 5. Motion language and expressive vocabulary

All timing constants and angular envelopes are in the [token JSON](../design/holo.tokens.json). Consider them starting targets pending recorded playback review, not frame-perfect acceptance.

| State | Face / eyes | Beam / UI response |
| --- | --- | --- |
| `idle` | almost motionless, subtle gaze, occasional natural independent eyelid blinks; head yaw within ±1.5° and pitch ±1° | steady soft cyan |
| `listening` | eye contact, very small curious tilt (≤3°), attentive gaze; no exaggerated smile | slow localized aura pulse, mint-cyan tint and explicit listening label |
| `processing` | relaxed neutral face, short glance, no fake speech | faint moving light through beam, processing label; no rapid strobe |
| `speaking` | measured mouth visemes, minimal cheek changes and natural blink; no jaw-flapping loop | pale-ice highlights; restrained rhythm, captions remain readable |
| `interrupted` | cancel viseme immediately, settle mouth and gaze within ~180 ms | beam calms; no pending speech animation |
| `error` | mild puzzled/concerned change from eyes and mouth only; avoid red horror face | brief rose-tinted status signal, readable explicit error message |

**Micro-actions:** Blink closes over ~105 ms, reopens ~145 ms, with a 3–7 s irregular *seedable* interval; eye shift ~210 ms, gaze generally ≤5°; idle drift period 5–8 s. Head turn on intentional attention can reach yaw ±22° / pitch ±12°; smoothly return to frontal pose. No 360° spins or arbitrary motions unrelated to the conversation.

**Speech:** Rig must support eyelid closure and articulated mouth morphs or bones. At minimum export or map `eyeBlinkLeft`, `eyeBlinkRight`, `jawOpen`, `mouthClose`, `mouthSmileLeft`, `mouthSmileRight`, `mouthPucker` / `mouthFunnel` and a documented neutral shape. These are **proposed interoperability names**, not existing implemented API. If using ARKit-like names, supply an explicit `sourceName -> canonicalName` map. Time-based visemes/phonemes should drive the mouth when available; a volume-only jaw flap is not finished synchronization. Avoid obvious eyebrow animation because eyebrows are intentionally absent.

**Transitions:** Use the shared protocol `idle`, `listening`, `processing`, `speaking`, `interrupted`, `error`; events `stateChanged`, `speechStarted`, `speechEnded`, `speechCancelled`, `viseme`, `reducedMotionChanged`. One state owner, cancellable animation tracks, no audio ownership in the avatar, and no conversation reset on Mini/Holo switch.

**Reduced motion:** no perpetual particle drift, idle oscillation or sweeping beam; materialize via static appearance or a fast ≤180 ms non-directional fade. Preserve intentional blinks, useful mouth articulation, captions, focus indicators and non-color status labels.

## 6. Holo UI rules

- Preserve the current immersive-app layout constraints: header, settings, transcript and composer remain reachable at 720×480 through 1920×1080 and during native fullscreen. Use the existing Mini layout as a **functional** reference, not a color scheme to overwrite.
- The Holo stage is visually dominant. Only the projected head and aperture should be central. No floating grids, fake telemetry, decorative strings or neon dashboard around the character.
- Use **separate theme scope** (`.theme-holo` or `data-neydra-theme="holo"`) and CSS variables beginning `--holo-`; do not mutate global Mini tokens or ship a global `:root` palette change.
- Glow and ray belong behind the real controls. Respect keyboard focus, pointer-hit testing, subtitle legibility, user-specified transparency and renderer performance.
- A theme preview can use a **static placeholder only if explicitly labeled**; it is not proof that Holo's model, blink or voice work.

## 7. Explicitly excluded

No hair, detailed lips, drawn eyebrows, physical body, cyan-lit human photograph, actor likeness, copied Gideon assets, 2D face pretending to be production 3D, real camera activation, paid SaaS or model hosting. The AI's spoken voice and actual 3D face asset are separate workstreams. Do not claim they exist from concept art.

## 8. Visual sign-off checklist

- Front, 3/4 and profile renders from **the same exported GLB**, plus a transparency comparison on both dark and light test backdrops.
- Neutral, speaking, blink closed, subtle smile, attentive gaze, intentional head turn, interrupted, error; mouth not visibly painted, no eyebrows/hair.
- Real six-state rapid transition playback and a timed Italian voiced example **clearly identified as synthetic/aligned/unverified**, with timestamps and cancellation.
- Stable projection origin at the bottom and no clipping/overlap of compositor, captions or menus on different window sizes; normal and reduced motion.
- Measured performance/opacity on actual Windows/GPU before final approval. Screenshot/video evidence in the implementation PR, source/asset provenance and license manifest.
