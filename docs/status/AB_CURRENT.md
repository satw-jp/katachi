# Team AB Current Status

Last verified: 2026-09-07

## Current authority
- repo: `satw-jp/katachi`
- accepted performance branch: `agent/skin-a2-sparse-support-performance-v1`
- accepted performance HEAD: `a3c3dbdb76dc609cabded13e21ad9fbbd2c0bd29`
- parent v1 checkpoint: `2964e66002a2b8faed5234769b5f03606fcd3f3b`
- prior accepted v0 baseline: `4929cc8e402f59faa7af5b6dfe86282fdb09d244`
- A2 source SHA-256: `2030a945eb44fb3a263c667305f10ce8a773af5d8914cfca82d7c3f68680b04c`
- Rabbit source SHA-256: `c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8`
- Rabbit repair fingerprint: `90258ce379e3b11aef7e6710ff98ff9f17678a53ae1c7905c3c967bd1e9437d6`
- retained A2 physical artifact SHA-256: `C6D46BF59CF06BF14520C91A1327DDC752A864AF78DA05C72AD0D0D7A086E491`
- performance task: `docs/tasks/AB_A2_SPARSE_SUPPORT_PERFORMANCE_V1.md` — CLOSED / PASS
- Astra research handoff: `docs/notes/AB_A2_PERFORMANCE_ASTRA_HANDOFF_2026-09-07.md`

## Current phase
Performance v1 is CLOSED / PASS. No performance implementation is active.

Two remaining AB concerns are independent:

1. **Author/manual A2 physical feasibility print** using the retained A2 artifact plus Bambu Studio automatic Tree Support at `45 deg`.
2. **Pre-G/H/J artifact-retention checkpoint** before the equal-condition comparison lane is resumed.

G/H/J remain HOLD until the author explicitly resumes them. No new Support architecture is active.

## Performance v1 — PASS / CLOSED
Accepted commit:
`a3c3dbdb76dc609cabded13e21ad9fbbd2c0bd29`

Accepted optimization:
- exact Rabbit capped unsigned-distance query: `min(exactDistance, cap)`;
- Rabbit signed SDF remains sign authority;
- existing fail-closed one-Lipschitz forbidden-volume certification preserved;
- legacy full-distance `closestSurface()` traversal restored so the winning result is cleanly attributed to the capped query;
- P0 copyable/localStorage COMPLETE-evidence retention preserved.

Exact GitHub diff from `2964e660...` is one commit / seven files. Tests include exact capped-vs-full distance parity, legacy/uncapped/capped forbidden-audit continuity, and deterministic randomized continuity coverage.

### Full A2 performance
- pre-performance reference: ~`43m36s`
- v0 accepted: `2,232,690.1 ms` (~`37m13s`)
- first v1 run: `2,431,968.6 ms` (~`40m32s`)
- accepted capped-distance v1: `528,025.4 ms` (~`8m48s`)
- improvement vs v0: `76.35%`
- improvement vs first v1 run: `78.29%`
- Rabbit audit: `40,846.3 ms`
- capped Rabbit unsigned: `8,492.8 ms / 17,736,590 calls`
- cap returns: `17,612,211`

The actual A2 path used for the accepted full run differed from the originally requested filesystem path, but the loaded `A2_BODY.stl` matched the canonical A2 SHA-256 exactly. Benchmark identity is preserved by content hash.

### Full A2 parity / validation
- Full Support: `4,561 / 4,561`
- route candidates: `102,193`
- route audits: `90,921`
- accepted / unsupported: `654 / 3,907`
- vertical / leaning-offset-bend: `466 / 188`
- BODY / Rabbit rejects: `3,257 / 1,502`
- graph nodes / edges: `2,150 / 1,496`
- accepted BODY / Rabbit collision: `0 / 0`
- geometry / diagnostics / Support / export fingerprints: exact match to prior accepted gate
- bounded semantic digest: exact match
- Signed Volume: AVAILABLE
- 3MF validator: PASS
- release / placement parity: PASS
- console errors / warnings: `0 / 0`
- focused tests: `37 / 37 PASS`
- both TypeScript checks: PASS
- production build: PASS
- `git diff --check`: PASS

Retained display forms:
- geometry: `ae244f2c…520b9`
- diagnostics: `8db3d239…96ba0`
- Support: `83af4c78…7932`
- export: `850177f1…515fc`
- bounded semantic digest: `f97ac5f3…05bf5`

## P0 evidence retention — ACCEPTED
Preserve the v1 evidence-retention capability:
- COMPLETE compact evidence before Worker release
- full geometry / diagnostics / Support / export fingerprint capture
- runtime/browser context
- localStorage persistence when available
- a later incomplete profile must not overwrite retained COMPLETE evidence.

This closes the evidence-loss problem that complicated v0 review.

## Prior v1 Rabbit stack experiment — NOT SEPARATELY PROMOTED
Checkpoint `2964e660...` preserved semantics but produced a slower full wall time and was not accepted as a demonstrated performance improvement. The final accepted commit restores legacy full closest-surface traversal and isolates the capped query.

## Physical A2 gate — manual / parallel
Current print classification:
`A2 BODY + authored SKIN removable Support + Bambu automatic Tree Support 45 deg`.

This is valid physical-feasibility evidence, but not proof that authored SKIN Support alone is sufficient.

For the current print:
- no rescale / reposition
- authored SKIN Support unchanged and present
- supplementary Bambu automatic Tree Support at `45 deg`
- no candidate-specific hidden tuning

Record printer/nozzle/process/material profile, first layer, completion/failure, Bambu Tree removal, authored-Support removal, BODY damage and visible defects.

If slicer-generated Support is later used for A/G/H/J comparison, freeze the same slicer policy/profile across every candidate.

## Queued before G/H/J
- `docs/tasks/AB_CANDIDATE_ARTIFACT_RETENTION_CHECKPOINT_V0.md`
  - durable archive identity / SHA before release
  - preferred persisted Support checkpoint for exact re-export without repeating Full Sparse Support

The now-faster Support runtime reduces regeneration cost, but does not remove the need for durable artifact/checkpoint retention.

## Future Support architecture hypothesis — HOLD / not active
`Outside-only body-anchored removable Support` remains a future research/design hypothesis only.

Shared observation note:
`docs/notes/AB_A2_PHYSICAL_PREVIEW_AUTHOR_OBSERVATION_2026-09-06.md`

It does not change the current A/G/H/J baseline.

## Astra escalation status
The performance research handoff remains preserved for future reference, but the current Rabbit bottleneck did **not** require Astra escalation: the exact single-thread capped-distance path succeeded materially.

Any future move to multi-core / CUDA / WebGPU / native acceleration must be a separate bounded task, not an extension of closed Performance v1.

## HOLD / DO NOT CHANGE
- G/H/J execution until author explicitly resumes
- Candidate geometry authority
- source-space Float32 execution
- exact-zero canonicalization
- deferred common placement
- Outside-only removable Support baseline
- Support settings: overhang `45 deg`, shaft `1.6 mm`, neck `0.6 mm`, removal gap `0.35 mm`, Rabbit clearance `0 mm`
- Rabbit forbidden-volume policy / signed-volume authority
- route generation / ordering / tie-breaking
- sample positions / adaptive recursion / thresholds / fail-closed semantics
- spacing / coverage semantics
- FKEI / authoring semantics
- no remesh / decimation
- no hidden candidate-specific tuning
- no internal removable-support rescue
- no body-anchored Support without a separate task
- no multi-core / CUDA / WebGPU / native migration without a separate task
- no winner before physical comparison
- no merge / deploy from this gate

## Evidence boundary
### PASS / PROVEN
- A2 software geometry / diagnostics / Support / export / validation chain under locked semantics
- Performance v1 exact capped-distance implementation at `a3c3dbdb...`
- full A2 exact retained parity at `528,025.4 ms`
- P0 evidence-retention capability on an actual COMPLETE run

### AUTHOR / PHYSICAL NOT YET PROVEN
- A2 physical print completion
- authored SKIN Support alone as sufficient physical support
- full physical profile frozen for A/G/H/J

### HOLD
- artifact-retention checkpoint before G/H/J
- body-anchored removable Support hypothesis
- G/H/J execution / physical comparison / winner
