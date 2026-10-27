# Asset provenance

The two GLBs in the [avatar-stage experiment](../experiments/avatar-stage/) are
**ENGINE PROTOTYPE / NOT FINAL CHARACTER** fixtures. They exercise loading,
node articulation, morph targets and animation clips. They do not fulfill the
finished Holo/Mini artwork gate: **BLOCKED ON 3D ASSET**.

[Machine-readable manifest](avatar-stage.manifest.json) records source, authorship,
MIT redistribution rights and format. Both are original procedural meshes generated
by the committed script; no downloaded characters, textures, fonts, concept images,
paid service or Meshy account was used. The repository MIT notice applies.

Regenerate/check with `npm run assets:generate` and `npm run assets:check` in
`experiments/avatar-stage`. The final models must follow the experiment's
[RIG_CONTRACT.md](../experiments/avatar-stage/RIG_CONTRACT.md) and get their own
source/license/attribution entries before redistribution. The uncommitted concept
images mentioned in the Design Bible were not available or used as shipping assets.

Local GLB imports are temporary and never uploaded or committed. Loading is not a
license audit or a guarantee of rig compatibility. The operator must verify rights.
