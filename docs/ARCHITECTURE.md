# NEYDRA — Architecture and feasibility assumptions

## Initial stack
- Electron (main/preload/renderer) + React + TypeScript + Vite; isolate renderer and validate IPC.
- Three.js + React Three Fiber; rigged Blender-authored/legally sourced GLB assets, event-driven animation engine.
- Interface adapters for voice (evaluate whisper.cpp or sherpa-onnx for Italian STT; sherpa-onnx / legally redistributable voice for offline Italian TTS) and for model providers.
- Local storage for settings and new conversations. No cloud backend, no analytics by default.
- GitHub Actions public-repo jobs for lint/test/build on hosted runners, with quotas/settings verified before use.

## AUTH FEASIBILITY IS NOT YET PROVEN
Investigate current official Sign in with ChatGPT / subscription-sharing documentation for open-source locally run applications, and Codex app-server docs. The existence of docs is NOT proof this account has eligible authorization, scopes, endpoint access, or desired model availability.

Proof must include:
1. The official app registration/client configuration permitted for this app type.
2. Consent through user's real browser (not performed by a cloud agent).
3. An authorized request that completes successfully, with sanitized logs.
4. Written evidence of zero separately billed API usage, no API key or credit purchase.
5. An explanation of usage limits and unsupported product features.

On failure: record BLOCKED and why; never scrape ChatGPT web sessions or substitute billable API.

## Voice flow
microphone -> local VAD/STT -> conversation text -> official inference stream -> chunked local TTS -> output/captions -> timed animation events. Implement cancellation and interruption throughout. No OpenAI paid audio/realtime API.

## Security
- OAuth credentials in Electron main process and OS secure storage where available; no secrets in renderer.
- Node integration off in renderer, context isolation on, sandbox on, narrow typed IPC, CSP.
- Local data privacy and erase/export controls; no accidental repo upload of conversations.
- Codex subprocess scope restricted to selected project directory with user approvals; reject unexpected external URLs and commands.
- Updaters and executable signing are NOT assumed free. First distribution may use unsigned zip/installer with honest Windows security caveats.

## Cross-platform direction
Android is deferred. Keep model/voice and animation interfaces platform-agnostic where viable. Electron-specific auth and file operations are not portable to Android; Android SIWC must be separately validated.

## Reference sources to revalidate at implementation time
- https://developers.openai.com/siwc/token-sharing-open-source
- https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt
- https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server
- https://help.openai.com/en/articles/20001545-using-codex-cloud

Implementation must link the **exact current** version of relevant official documentation in its PR; no guessed endpoint, scope or SDK API.
