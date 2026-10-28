# Issue #13 — bounded implementation plan

1. Read-only preflight of approved local AutoFace and FacialKeys inputs, Blender/MPFB versions, actual morph deltas and asset provenance.
2. Derive a reproducible runtime copy and self-contained GLB without modifying inputs; retain topology until morph integrity is proven. Generated binaries remain local and ignored.
3. Isolated Three.js viewer, explicit MPFB channel mapping, face-only rendering, deterministic reversible projection progress and reduced motion. Reuse the safety boundary of PR #7, never its fixture artwork.
4. Validate geometry in Blender and Three.js, transitions, desktop/narrow renders, report actual limitations, open a separate draft PR against main.

Baseline: main 92d4793; original checkout feat/desktop-mini-interface c965021 with untracked Mini/reference/asset work preserved. Specifications read from origin/feat/holo-design-system-v1 and origin/docs/holo-3d-prototype-plan; no branch merge. No desktop, auth, speech provider or Mini changes.
