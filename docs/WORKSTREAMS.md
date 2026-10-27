# NEYDRA — Workstreams and Definition of Done

## First parallel batch — once repository blueprint is approved

### P0A — Official authentication feasibility
**Owner:** Codex cloud for code; actual account owner for interactive consent.

Deliverables:
- Official-doc findings and applicability to an open-source Windows/Electron client.
- Minimal secure Electron/Node experiment isolated in `experiments/auth/`.
- Model discovery / request strategy using only plan-included authorization, plus Codex app-server handshake research.
- Mockable unit tests, reproducible instructions, failure classification.
- Explicit final result: `UNVERIFIED`, `PASS`, or `BLOCKED`. **Cloud mock/tests can never earn PASS for real OAuth.**

Stop if separately billed OpenAI API use, external credit card, unapproved credentials or unsupported auth flow would be necessary.

### P0B — 3D avatar stage
**Owner:** Codex cloud, visual review by owner.

Deliverables:
- Interactive Three.js/React Three Fiber stage in `experiments/avatar-stage/`, not a 2D mock UI.
- A *clearly marked procedural test mesh* may exercise camera, lighting, state transitions before a final licensed GLB is available.
- Loadable GLB, orbit/zoom, event-driven six-state transition demo, visible eye/head/mouth behavior.
- Asset import specifications for Holo and Mini, including rig, morph targets, dimensions and license provenance.
- Screenshot or recording and measured browser rendering test where feasible.
- If finished Holo/Mini meshes don't exist, mark artwork acceptance `BLOCKED ON 3D ASSET`; do not fabricate completion.

### P0C — Offline Italian voice feasibility
**Owner:** Codex cloud for file-based proof; actual Windows device test later.

Deliverables:
- Benchmark candidate free ASR/TTS licenses and redistributable model voices.
- File-based Italian speech in/out script, unit tests, latency/quality report with test environment.
- Hardware/microphone verification remains `UNVERIFIED` until real user-PC testing.

### P0D — Repository bootstrap and CI
**Owner:** Codex cloud.

Deliverables:
- Stack scaffold only after branch/contract ownership and exact package choices are documented.
- ESLint, typecheck, tests, Windows build workflow with free-runner requirements stated.
- No test claims without actual command output. No merge to main without approval.

## Later
P1: integrated ChatGPT dialogue + voice and animation events.
P2: Codex project assistance with strict permission boundaries.
P3: final avatar/voice refinement, security, accessibility, Windows packaging, licenses and public demonstration.

## PR acceptance template
- Goal and scope
- Files changed
- Commands/tests, with truthful results
- Screen capture when UI/3D altered
- Security/privacy/license impact
- Unsupported or unverified items
- Next blocker or follow-up issue

## Public 1.0 criterion
All gates in `PRODUCT_CHARTER.md` pass **on genuine runtime**, both avatars visually approved, zero incremental paid integration, repeatable build and legally distributable assets.
