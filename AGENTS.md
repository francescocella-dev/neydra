# NEYDRA — Instructions for Codex and contributors

Read the following **before modifying code**: `docs/PRODUCT_CHARTER.md`, `docs/DESIGN_BIBLE.md`, `docs/ARCHITECTURE.md`, `docs/WORKSTREAMS.md`, `docs/EXECUTION.md`, and `docs/DECISIONS.md`.

> Holo-specific work: read [Holo visual spec](docs/HOLO_VISUAL_SPEC.md), [canonical design tokens](design/holo.tokens.json) and [parallel work boundaries](docs/HOLO_PARALLEL_WORK.md) before editing the Holo theme, shader or 3D asset. Do not conflate Holo with Mini's palette.

## Non-negotiable constraints
- Zero new paid services. **Do not** configure billable API keys, buy credits, require a credit card, activate paid CI, purchase assets, or create hosted infrastructure.
- Use **official documented** authentication and provider interfaces only. Do not scrape ChatGPT cookies, consumer endpoints, or internal browser traffic. Never commit tokens, secrets, conversations, or identifying user data.
- Holo and Mini must be **genuine 3D** from the first graphical implementation. Placeholder geometry is allowed for internal engine tests but **must be labeled as such** and must not be presented as finished avatar design.
- No externally sourced model, voice, or texture without checking redistribution license and attribution.
- No automatic merge to main, public release, destructive action, privilege escalation, or billing change.
- Electron: enable context isolation and renderer sandbox, expose narrow validated IPC, keep authentication secrets in the main process, and restrict file-system and subprocess access.

## Autonomous execution within the assigned scope
1. Inspect current repository state, relevant docs, and tests; write a short plan.
2. Work on a **task branch** and do not modify unrelated workstreams. Define/adhere to interfaces before parallelizing.
3. Implement the complete requested slice including tests and developer documentation.
4. Run and report lint, typecheck, test, build, and asset checks where applicable. Never pretend mock tests prove live OAuth, real user consent, microphone performance, or realistic lip sync.
5. Make at most **two focused repair cycles** for the same blocker. Then report the blocker precisely with reproducing commands and evidence.
6. End with: files changed; commands/tests and results; demo captures where appropriate; open risks; next step.
7. Put changes into a pull request. Leave merge and releases to explicit project-owner approval.

## Distinguish work environments
- **Codex Cloud for development** runs on hosted compute and may work while the user's PC is off, subject to the subscription and permissions.
- **Codex app-server inside NEYDRA** is a different runtime feature for end users.
- A cloud job cannot consent to OAuth for the end user or validate the user's real Windows microphone, speakers, and GPU.
- No claim of unlimited, always-on autonomous task chaining without a verified supported mechanism.

## First tasks
- [Feasibility: ChatGPT-plan auth and Codex](docs/WORKSTREAMS.md#p0a--official-authentication-feasibility)
- [3D interaction stage](docs/WORKSTREAMS.md#p0b--3d-avatar-stage)
