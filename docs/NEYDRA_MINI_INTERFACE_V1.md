# NEYDRA Mini — Desktop interface v1, first UI slice

Status: **implementation started, Windows validation pending**.
Base: `feat/desktop-chatgpt-plan` (PR #9), where owner confirmed one successful
Windows OAuth sign-in, authorized model catalog, and a single Responses text
stream completed with the expected `NEYDRA_DESKTOP_OK`. Keep PR #9 DRAFT.

## Approved user-facing product direction

- **Mini first; Holo later**. Mini has a friendly puppy-like robot personality
  and approved graphite/black body, warm orange accent, near-white hands/feet.
  The actual Blender Mini character is authored separately and must not be
  replaced by a generated stand-in or modified by this interface branch.
- **Immersive view**, optional native fullscreen without desktop taskbar
  or OS title bar while fullscreen. Neutral dark graphite/black background;
  restrained, slowly animated thin orange energy veins **without** planets,
  space or scenic backdrops. Prefer reduced-motion.
- **Three areas**: left dominant avatar stage; middle expandable/collapsible
  text transcript and chat; right live service and session information.
  Collapsing the transcript must not clear current session context or
  unnecessarily unmount the ChatGPT chat component.
- **Settings** in a small drawer for ChatGPT access, Mini theme, voice, window
  and future preferences. No fake settings persistence.
- **Future companion bubble**: small movable round Mini face window that can
  restore immersive mode. This first slice prepares the layout but does not
  claim the second Electron window is implemented.
- **Voice is intended before 3D readiness.** Hybrid manual and opt-in
  local "Ehi Neydra" activation, local capture/transcription and TTS are
  a subsequent separately validated slice. Review the team's previously
  investigated voice additions before selecting components. In this first
  slice microphone remains **off** and no UI claims to listen or speak.
- **Memory v1**: current in-memory chat context and ordinary local UI
  preferences once a settings store is implemented; do not add personal
  long-term memory or archive now. Mini/Holo personality profiles are
  later separate from the core model and common conversation context.
- **Proactivity off** by default; user may opt into it later. Do not run
  background requests, record audio, or infer content without consent.
- **Account usage**: display only truthful known data (connection state,
  authorized model catalog count, temporary context status). Do not invent
  weekly remaining messages, billing, tokens, or consumption percentages.

## Implemented in this first source slice

1. New Mini-themed desktop React shell, animated background veins, three
   responsive areas and a clearly labelled empty **avatar integration stage**.
2. Interactive controls to show/hide chat and right panel; ChatPanel remains
   mounted, preserving its local in-memory transcript and auth controls.
3. Settings drawer with a functional route to ChatGPT controls, explicit
   disclaimer that 3D/voice are not connected, and the preserved offline test
   fixture in an expandable technical section.
4. Renderer-initiated fullscreen button and F11 shortcut using Electron's
   HTML fullscreen path; must be **visually checked on Windows** for a true
   fullscreen transition. Windowed mode retains the native OS frame.
5. Read-only ChatGPT connection/model count from the existing strict IPC
   bridge; no new network destinations, keys, permissions or dependencies.
6. Existing Electron E2E updated to reach technical demo within the drawer
   and verify hiding/reopening the transcript without invoking OAuth.

## Not in this first slice

- Actual Three.js Mini integration, or any modification to the Blender asset.
- Circular floating always-on-top companion BrowserWindow (requires a
  separate, limited-IPC window and independent Windows/sandbox tests).
- Speech capture, wake-word, transcription, TTS, voice interruption.
- Real ChatGPT quota/billing telemetry and user memory database.
- A production installer, merge to main, or live AI calls from tests.

## Validation gate on owner's Windows

Work only on `feat/desktop-mini-interface` after checking untracked
files and avoiding `git clean` / force resets. Do not touch
`mini-asset-work/`, `references/`, local screenshots or Blender work.

```powershell
cd D:\WORK\NEYDRA
git status --short
git fetch origin
git switch --track origin/feat/desktop-mini-interface
npm.cmd run check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run check:preload
npm.cmd run test:desktop
npm.cmd start
```

If the branch already exists locally, use `git switch
feat/desktop-mini-interface` then `git pull --ff-only origin
feat/desktop-mini-interface`. Never override uncommitted changes.

Check visually: graphic palette and motion, responsive layout, transcript
collapse/reopen, truthful status, settings, fullscreen and escape, access
to official ChatGPT controls; do **not** perform another real login/model
request as part of this UI review. Preserve the currently working auth
backend. E2E may still be environment-limited outside Windows.
Do not claim the UI slice is complete until owner shares Windows
screenshots and all checks pass.
