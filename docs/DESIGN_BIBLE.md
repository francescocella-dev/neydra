# NEYDRA — Design Bible v0.1

## Experience-first requirement
The avatar is the main stage, not a decoration beside a chatbot. **Use real 3D from the first interactive design slice.** The first public release must look and feel deliberately authored; the intermediate wireframes/procedural meshes are for engineering tests only.

Two desktop concept images were created in the NEYDRA project chat (Holo and Mini, 16:9). They are the **visual reference**; their binary files are not yet committed here. Do not present those concept renders as shipping 3D assets. A future asset-source manifest must record their origin and the origins of all 3D assets.

## Shared desktop layout
- Dominant central 3D character, always visible when chatting.
- Left: collapsible conversation list.
- Bottom/center: live captions, listening status, stop/mute, optional text input.
- Right: ChatGPT/Codex mode, avatar switch, context-specific controls.
- No fake telemetry, fake model capability indicators or unreadable decorative labels.
- Keyboard navigation, reduced motion, subtitles, visible mic status, clear escape/close actions.

## Proposed visual tokens
- Base `#050B14`; surface `#0C1828`; foreground `#E8F7FF`; muted `#9BB4C8`.
- Primary cyan `#6AD9FF`; accent violet `#A59BFF`; soft teal `#4FE0C4`.
- These are starting points to refine through visible screenshots and user review.

## Holo
An **original**, genuine 3D face made of translucent ice/cyan light: gently feminine-neutral, **no hair, eyebrows, drawn lips, neck or body**. The lower contour dissolves into a virtual light beam from a bottom-center optical aperture; **no webcam permission**. Real eyelid and mouth articulation, subtle gaze/head motion, viseme-driven speech and accessible reduced-motion mode are mandatory. No direct reproduction of Gideon or any actor. All exact Holo colors, material tuning envelopes, motion values and the parallel UI/3D interface are specified in:
- [HOLO_VISUAL_SPEC.md](HOLO_VISUAL_SPEC.md) — approved visual direction, acceptance;
- [design/holo.tokens.json](../design/holo.tokens.json) — canonical design values; [generated CSS](../design/holo.tokens.css);
- [HOLO_PARALLEL_WORK.md](HOLO_PARALLEL_WORK.md) — separated theme / 3D implementation handoff.

**Status:** design-only, not proof of an existing 3D asset or working UI theme.

## Mini
Premium warm robot in genuine 3D; rounded shell, gentle head/body animation, luminous curved face display with readable expression, eye blinks, attentive tilts, little idle motions. Eyes/mouth may be emissive geometry or material on a modeled visor; shell/body stays actually 3D. Cute without looking like a children's toy.

## Shared animation protocol
States: `idle`, `listening`, `processing`, `speaking`, `interrupted`, `error`.
Events: `stateChanged`, `speechStarted`, `speechEnded`, `speechCancelled`, `viseme` (timestamp + weight), `reducedMotionChanged`.
Switching avatar must not drop audio, reset the conversation, or leave a stuck animation state. Every animation must be interruptible and deterministic from state transitions.

## Speech synchronization
Prefer TTS-provided timings where offered. For a locally synthesized voice, investigate phoneme alignment or a reproducible audio-based viseme mapping. **A volume-only jaw flap is not accepted as finished lip sync.** Do not promise exact phoneme match without measured evidence.

## First visual demo acceptance
1. Load **actual** riggable GLB(s), rotate and zoom in a working Three.js viewer.
2. Preview all six states with transitions, including rapid interruptions.
3. Inspect eye and mouth closeups for clipping/deformations; test both normal and reduced-motion.
4. Record a short Italian voiced demo showing observable sync, stating whether timings are simulated.
5. Check frame pacing at 1920x1080 and a narrower app window (real hardware assessment later).
6. Publish screenshots/video **inside development PR** so visual review accompanies engineering review.

## Asset licensing
Meshy Free is optional for base geometry, never a guaranteed source. Only import legally downloadable assets and record source, plan, author, CC attribution, modifications, redistribution restrictions. Blender tooling is the free alternative.
