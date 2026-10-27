# Shared avatar / asset contract v0.1

This is the renderer boundary for Issue #3, independent of auth, inference, Electron
and voice implementations. Both built-in assets are engineering fixtures, not final
Holo/Mini characters. Production visual acceptance: **BLOCKED ON 3D ASSET**.

## Coordinate and export conventions

- Author in Blender or another free glTF-compatible tool, meters, +Y up, face toward
  +Z, origin at floor midpoint. Target character height 2.8 m in the stage's normalized
  space; production asset physical scale should be documented. Camera targets Y=1.45.
- Deliver glTF 2.0 **binary GLB**, all buffers/textures embedded; no external/data URI,
  Draco, KTX or required extensions in this first loader. Maximum file size 20 MiB.
  Preview fits the bounding box to 2.8 units, preserving proportions. Face inspection
  camera assumes a head near Y=2; custom proportions can require manual orbit/zoom.
- Apply transforms; export normals and UVs, linear morph deltas, standard PBR materials.
  Suggested budget: <80k visible triangles, <8 materials, <=2k textures; measure on
  actual Windows GPU. No claim this budget alone guarantees performance.
- Keep `Body` transform node, parent of `Head`. Head pivot is the neck articulation
  point; front-facing head rest rotation is identity. Node hierarchy can contain
  skinned meshes/bones. Head articulation may target a named bone `Head`.
- Optional looping clips named exactly `idle`, `listening`, `processing`, `speaking`,
  `interrupted`, `error`. The AnimationMixer blends body clips over 160 ms, instantly
  under reduced motion; clips must not key the procedural `Head` rotation or facial
  morphs. Use body/limb tracks instead. Clips may be absent: facial/head engine still
  runs. Missing rig channels are reported and ignored, never fabricated.

## Holo production specification

Original sophisticated human-like holographic head/bust, coherent jaw, cheeks,
eyelids, brows and lips. No imitation of an existing entertainment character.
Technical fixture topology is deliberately insufficient for realistic articulation.
Final mesh needs continuous lip loops, eyelid coverage without eyeball clipping and
art-directed translucent material, controlled fresnel/rim and restrained vapor.
Avoid luminous flat eyes as a substitute for finished human eye anatomy.

Required morph channels (weights 0..1, neutral base): `eyeBlinkLeft`,
`eyeBlinkRight`, `browInnerUp`, `mouthSmile`, `jawOpen`, `viseme_aa`, `viseme_ee`,
`viseme_ih`, `viseme_oh`, `viseme_ou`, `viseme_ff`, `viseme_mm`.
Provide independent eye-look bones/channels for the next gaze adapter; current
engine drives head pose and blinking, not eye tracking. Add brow-down/frown/squint
channels as the expression vocabulary grows. Each viseme must be a meaningful
mouth deformation, with jawOpen additive to the authored mouth shape; `mm` closes
lips, `ff` models lip/teeth contact. Silence is neutral, with no `viseme_sil` morph.
Inspect neutral, extremes and combined jaw/smile/viseme deformations at close range.

## Mini production specification

Original premium rounded robot: modeled shell, curved modeled visor, visible
neck/head pivot and articulated body/limbs. Expressive emissive eye and mouth
geometry may sit on the visor; shell depth and volume must survive full orbit.
Required `Body`, `Head`, `EyeLeft`, `EyeRight`, `Mouth` nodes. Current fixture
shares blink/smile/jaw and seven viseme morph names; browInnerUp is optional for
Mini. A later visor shader adapter may map the same FacialFrame onto material
parameters without changing voice events. Future limb bones may extend the rig.
The current small robot is a test fixture, not an approved character design.

## Event boundary and clocks

Types live in `src/engine/protocol.ts`; `AvatarEngine` owns state/speech independently
of which avatar is mounted. `useFrame` samples it and updates Three objects without
React state writes each frame. Keep the same engine instance on avatar switch.

| Event | Meaning |
| --- | --- |
| `stateChanged { state }` | Any of six states, reversible from any other; clears current speech |
| `speechStarted { speechId, startedAt }` | Replaces active utterance and enters speaking; nonempty ID must be unique per utterance |
| `viseme { speechId, cue }` | Cue timestamp relative to speech start, duration and weight, accepted for current ID only |
| `speechEnded { speechId }` | Clears current utterance and returns idle |
| `speechCancelled { speechId }` | Clears current utterance immediately and enters interrupted |
| `reducedMotionChanged { enabled }` | Disables idle float, head oscillation, blinking, camera damping and clip movement; explicit expression/head/visemes remain available |
| `expressionChanged { expression, weight }` | neutral/warm/focused/concerned and clamped strength |
| `headPoseChanged { yaw, pitch }` | Explicit radians, clamped to ±0.6 yaw / ±0.35 pitch |

`startedAt` and `sample(now)` must use the same monotonic clock. The demo uses
`performance.now()`. A future audio adapter must project **audio playback time**
onto that clock and handle pause, buffering and resume; do not anchor it to network
arrival time. No timers in the engine. Call sample every rendered frame; the UI demo
has one 50 ms interval for captions/completion, cleaned up on cancellation/restart.

Timings may arrive out of order; queue sorts and caps at 512. For streaming, send
near-term cues; preloading more than 512 retains the latest 512, so chunk long text.
Weights clamp to 0..1, overlaps normalize. Each cue has a 35 ms attack / 65 ms release.
Expired cues contribute zero. Late events with an old ID cannot resurrect speech.
Manual `speaking` with no utterance leaves the mouth neutral; it is a state preview.
A caller must send speechEnded/cancelled: the pure engine does not guess completion.

## Honest speech scope

`src/engine/demo.ts` provides 16 synthetic cues for an Italian caption over 4.8 s.
**No audio is generated or played; these are not measured phoneme timings.** This
exercises animation timing and interruption only. No real TTS, STT, alignment,
microphone, conversation or ChatGPT/Codex connection is claimed. Production speech
sync and the Design Bible's voiced Italian demo remain **BLOCKED ON VOICE ADAPTER
AND 3D ASSET**. A volume-only jaw flap is not the production implementation.

## Asset delivery gate

For each final GLB: record author/source/export settings/license/attribution and
redistribution restrictions in `assets/avatar-stage.manifest.json`; include original
editable source and production version ID. Verify rights separately from technical
loading. Run asset checks, view every expression/viseme and clip, rapid transitions,
head extremes and reduced motion on both avatars, then obtain owner visual review.
