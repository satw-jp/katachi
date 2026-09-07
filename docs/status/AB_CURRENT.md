# Team AB Current Status

Last verified: 2026-09-07

## Current authority
- repo: `satw-jp/katachi`
- accepted performance baseline branch: `agent/skin-a2-sparse-support-performance-v0`
- accepted performance baseline commit: `4929cc8e402f59faa7af5b6dfe86282fdb09d244`
- Performance v1 branch: `agent/skin-a2-sparse-support-performance-v1`
- Performance v1 remote reviewed HEAD: `2964e66002a2b8faed5234769b5f03606fcd3f3b`
- active task: `docs/tasks/AB_A2_SPARSE_SUPPORT_PERFORMANCE_V1.md`
- Astra escalation / research handoff: `docs/notes/AB_A2_PERFORMANCE_ASTRA_HANDOFF_2026-09-07.md`
- A2 source SHA-256: `2030a945eb44fb3a263c667305f10ce8a773af5d8914cfca82d7c3f68680b04c`
- Rabbit source SHA-256: `c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8`
- Rabbit repair fingerprint: `90258ce379e3b11aef7e6710ff98ff9f17678a53ae1c7905c3c967bd1e9437d6`
- retained A2 physical artifact SHA-256: `C6D46BF59CF06BF14520C91A1327DDC752A864AF78DA05C72AD0D0D7A086E491`

## Current phase
Two activities remain independent:

1. Author/manual A2 physical feasibility print using the retained artifact plus Bambu Studio automatic Tree Support at `45 deg`.
2. Performance v1 SOL review / checkpointing of the Rabbit capped-distance implementation.

G/H/J remain HOLD. No new Support architecture is active.

## Performance v1 status — LOCAL PASS CANDIDATE / awaiting commit + push

The remote reviewed checkpoint remains:
`2964e66002a2b8faed5234769b5f03606fcd3f3b`

LUNA reports a later **local dirty / unpushed** Rabbit capped-distance implementation that completed a full A2 gate with exact retained parity and major wall-time reduction. GitHub does not yet contain that implementation, so Team AB must not mark the code ACCEPTED/CLOSED until the exact commit is pushed and reviewed.

### Reported local full-A2 result
- actual A2 source: SHA-256 matched canonical `2030a945eb44fb3a263c667305f10ce8a773af5d8914cfca82d7c3f68680b04c`
- requested path did not exist; implementation used the SHA-matching `.../outputs/round-2/A2_BODY.stl`
- Full Support: `4,561 / 4,561`
- accepted: `654`
- supported / unsupported: `654 / 3,907`
- accepted BODY / Rabbit collision: `0 / 0`
- Support total: `528,025.4 ms`
- reported improvement: `-76.35%` vs accepted v0 and `-78.29%` vs first v1 run
- Rabbit audit: `40,846.3 ms`
- capped Rabbit unsigned: `8,492.8 ms / 17,736,590 calls`
- cap returns: `17,612,211`
- Signed Volume: AVAILABLE
- 3MF validator: PASS
- release / placement parity: PASS
- console errors / warnings: `0 / 0`

### Reported parity / validation
- geometry fingerprint: reported exact match; UI/evidence display `ae244f2c…520b9`
- diagnostics fingerprint: reported exact match; `8db3d239…96ba0`
- Support fingerprint: reported exact match; `83af4c78…7932`
- export fingerprint: reported exact match; `850177f1…515fc`
- bounded semantic digest: reported exact match; `f97ac5f3…05bf5`
- focused tests: `37 / 37 PASS`
- both TypeScript checks: PASS
- build: PASS
- `git diff --check`: PASS

### Reported implementation design
- exact Rabbit BVH query returns `min(fullDistance, cap)`; no approximation
- cap is derived/proven from interval length + threshold for the existing fail-closed one-Lipschitz forbidden-volume certification
- signed Rabbit SDF remains inside/outside authority
- no Support semantics/settings, route order, sample positions, recursion limits, Rabbit policy, Candidate geometry, FKEI, exporter semantics, G/H/J, main or deploy changes reported

### SOL checkpoint gate
Before final ACCEPT / CLOSED:
1. commit the local v1 changes on `agent/skin-a2-sparse-support-performance-v1`;
2. normal push only; no force / rebase / merge;
3. exclude unrelated `docs/infrastructure/`;
4. return exact commit SHA and remote HEAD;
5. SOL reviews exact GitHub diff against the authorized v1 lineage;
6. no additional full A2 rerun is required unless exact review finds an unresolved parity/performance issue.

## P0 evidence retention — ACCEPT
Preserve:
- copyable COMPLETE evidence before Worker release
- full geometry / diagnostics / Support / export fingerprints
- runtime facts
- localStorage retention when available
- COMPLETE evidence not overwritten by later incomplete profile

## First Rabbit stack attempt — NOT PROMOTED
Remote checkpoint `2964e660...` preserved semantic/fingerprint parity but did not demonstrate a speed win.

Wall time:
- accepted v0: `2,232,690.1 ms`
- first v1 run: `2,431,968.6 ms`
- regression: `+199,278.5 ms` / about `+8.9%`

Do not claim the first reusable Rabbit stack alone as a performance improvement.

## Measured pre-cap hotspot authority
From retained COMPLETE first-v1 evidence:
- route audit: `2,430,915.6 ms`
- BODY audit: `499,995.8 ms`
- Rabbit audit: `1,906,507.6 ms`
- Rabbit unsigned surface time: `1,872,601.8 ms`
- Rabbit unsigned calls: `17,736,590`

This is the measured basis for the capped-distance optimization.

## Performance v0 — PASS / ACCEPTED BASELINE
Accepted commit:
`4929cc8e402f59faa7af5b6dfe86282fdb09d244`

Measured:
- pre-v0 reference: ~`43m36s`
- v0 Full Sparse Support: `2,232,690.1 ms`
- improvement: ~`6m23s` / `14.7%`

This remains the accepted performance baseline until the capped-distance remote commit passes SOL exact review.

## Canonical A2 semantic gate
Final accepted performance result must preserve:
- targets: `4,561 / 4,561`
- route candidates: `102,193`
- route audits: `90,921`
- accepted / unsupported: `654 / 3,907`
- vertical / leaning-offset-bend: `466 / 188`
- BODY / Rabbit rejects: `3,257 / 1,502`
- graph nodes / edges: `2,150 / 1,496`
- accepted BODY / Rabbit collision: `0 / 0`
- complete geometry / diagnostics / Support fingerprints / available graph identity
- placement / validator continuity if exported

## Physical A2 gate — manual / parallel
Current print classification:
`A2 BODY + authored SKIN removable Support + Bambu automatic Tree Support 45 deg`.

This is physical-feasibility evidence, not proof that authored SKIN Support alone is sufficient.

## Queued before G/H/J
- `docs/tasks/AB_CANDIDATE_ARTIFACT_RETENTION_CHECKPOINT_V0.md`
  - durable archive identity / SHA before release
  - preferred persisted Support checkpoint for exact re-export without repeating Full Sparse Support

## Future Support architecture hypothesis — HOLD / not active
`Outside-only body-anchored removable Support` remains a future research/design hypothesis only and is excluded from Performance v1.

## HOLD / DO NOT CHANGE
- G/H/J execution
- Candidate geometry authority
- source-space Float32 execution
- exact-zero canonicalization
- deferred common placement
- Outside-only removable Support baseline
- Support settings: overhang `45 deg`, shaft `1.6 mm`, neck `0.6 mm`, removal gap `0.35 mm`, Rabbit clearance `0 mm`
- Rabbit forbidden-volume semantics / sign authority
- route generation / ordering / tie-breaking
- sample positions / adaptive recursion / thresholds / fail-closed semantics
- spacing / coverage semantics
- FKEI / authoring semantics
- no remesh / decimation
- no hidden candidate-specific tuning
- no internal removable-support rescue
- no body-anchored Support in this task
- no multi-core / CUDA / WebGPU / native migration in v1
- no merge / deploy

## Evidence boundary
### PASS / PROVEN
- first v1 full-A2 semantic/fingerprint parity
- P0 evidence retention works on actual COMPLETE run
- Rabbit unsigned surface work was the dominant measured hotspot

### LOCAL REPORTED PASS / NOT YET GITHUB-REVIEWED
- capped exact Rabbit-distance full-A2 performance + parity result at `528,025.4 ms`
- capped implementation code itself

### ACCEPTED BASELINE
- v0 performance commit `4929cc8...` at `2,232,690.1 ms`

### NOT YET PROVEN / HOLD
- remote exact-diff acceptance of the capped implementation
- A2 physical print completion
- artifact-retention checkpoint before G/H/J
- body-anchored removable Support hypothesis
- G/H/J execution / physical comparison / winner
