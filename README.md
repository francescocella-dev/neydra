# NEYDRA

**An open-source, voice-first 3D AI companion for your desktop.**

NEYDRA is a Windows-first personal AI interface planned around two original, switchable, fully 3D personalities: **Holo**, a luminous sci-fi holographic assistant, and **Mini**, a warm and expressive robot companion.

> **Project status: PRE-ALPHA.** This branch prepares an optional Sign in with ChatGPT/text adapter in the Electron main process alongside the existing offline demo. The new Windows integration is UNVERIFIED until the owner tests it in the app; no installer is provided. PR #6 proved a separate Plus probe. The 3D engine in PR #7 remains separate.

Mini UI: [minimal immersive layout and Windows runbook](docs/NEYDRA_MINI_MINIMAL.md) · [offline report and pending GUI checks](apps/desktop/evidence/MINI_MINIMAL_REPORT.md).

ChatGPT candidate: [PowerShell and Windows validation gate](docs/DESKTOP_CHATGPT.md) · [offline verification report](apps/desktop/evidence/CHATGPT_REPORT.md).

Desktop shell: [PowerShell setup, contracts and limits](docs/DESKTOP.md) · [verification](apps/desktop/evidence/REPORT.md).

## Core commitments

- **Zero incremental paid services:** no pay-as-you-go API keys, hosted backend, paid voice service, paid assets, or mandatory paid tool beyond a user's existing eligible ChatGPT subscription.
- **Official integration only:** investigate and test Sign in with ChatGPT and Codex's documented interfaces. Do not scrape sessions or automate the consumer website.
- **Voice first:** local Italian speech recognition and synthesis, interruption, live captions, and a safe text fallback.
- **3D from the beginning:** both Holo and Mini are real, animated 3D characters; concept artwork is not an implementation.
- **Windows first, mobile-aware:** Android is a future target, not a validated feature.
- **Privacy and safety:** local user data, minimal permissions, explicit approval for code-changing operations.

## Where to start

- [Product charter](docs/PRODUCT_CHARTER.md)
- [Visual / animation design bible](docs/DESIGN_BIBLE.md)
- [Holo visual identity, palette and animation specification](docs/HOLO_VISUAL_SPEC.md)
- [Holo parallel theme / 3D implementation handoff](docs/HOLO_PARALLEL_WORK.md)
- [Holo machine-readable design tokens](design/holo.tokens.json)
- [Architecture and integration boundaries](docs/ARCHITECTURE.md)
- [Codex operating rules](AGENTS.md)
- [Workstreams and acceptance criteria](docs/WORKSTREAMS.md)
- [Execution and cloud-development protocol](docs/EXECUTION.md)
- [Decision log](docs/DECISIONS.md)

## Critical feasibility checks

1. An actual eligible user signs in through an official, supported flow and completes a model request without configuring separately billed OpenAI API usage.
2. An actual local voice path transcribes and speaks Italian, with measured latency.
3. Real, legal-to-distribute 3D assets can animate eye/head/mouth states and meet visual review criteria.

Mock credentials, prerecorded demos, sample 2D art, and successful CI builds **do not** count as completing those checks.

## Status and contribution

The project is being bootstrapped. Working code, installation instructions, demos, and a contribution guide will be added once their claims can be validated. This is an independent community project, **not affiliated with or endorsed by OpenAI, DC, or any entertainment franchise**.

Copyright (c) 2026 NEYDRA contributors. Code is released under the [MIT license](LICENSE) unless a file states otherwise. Future models, voices, images, and 3D assets may have distinct licenses that must be documented before redistribution.
