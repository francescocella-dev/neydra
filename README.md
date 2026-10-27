# NEYDRA

**An open-source, voice-first 3D AI companion for your desktop.**

NEYDRA is a Windows-first personal AI interface planned around two original, switchable, fully 3D personalities: **Holo**, a luminous sci-fi holographic assistant, and **Mini**, a warm and expressive robot companion.

> **Project status: PLANNING / PRE-ALPHA.** No functioning application, working ChatGPT-plan connection, or downloadable installer is claimed yet. This repository currently contains the product blueprint and engineering instructions.

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
