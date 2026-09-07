# Team AB Current Status

Last verified: 2026-09-07

## Current authority
- repo: `satw-jp/katachi`
- accepted performance baseline branch: `agent/skin-a2-sparse-support-performance-v0`
- accepted performance baseline commit: `4929cc8e402f59faa7af5b6dfe86282fdb09d244`
- Performance v1 branch: `agent/skin-a2-sparse-support-performance-v1`
- Performance v1 reviewed HEAD: `2964e66002a2b8faed5234769b5f03606fcd3f3b`
- A2 source SHA-256: `2030a945eb44fb3a263c667305f10ce8a773af5d8914cfca82d7c3f68680b04c`
- Rabbit source SHA-256: `c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8`
- Rabbit repair fingerprint: `90258ce379e3b11aef7e6710ff98ff9f17678a53ae1c7905c3c967bd1e9437d6`
- retained A2 physical artifact SHA-256: `C6D46BF59CF06BF14520C91A1327DDC752A864AF78DA05C72AD0D0D7A086E491`

## Current phase
Two activities remain independent:

1. Author/manual A2 physical feasibility print using the retained artifact plus Bambu Studio automatic Tree Support at `45 deg`.
2. Performance v1 review / continuation from the accepted v0 CPU/browser baseline.

G/H/J remain HOLD. No new Support architecture is active.

## Performance v1 review — HOLD / continue from retained evidence
Task: `docs/tasks/AB_A2_SPARSE_SUPPORT_PERFORMANCE_V1.md`

Reviewed remote commit:
`2964e66002a2b8faed5234769b5f03606fcd3f3b`

Exact diff from v0 base `4929cc8...` is one commit / three files:
- `skin-astra-candidate-print-lane.html`
- `src/studies/skin/astraCandidatePrintLaneLab.ts`
- `src/studies/skin/externalStlHost.ts`

### Accepted part
P0 evidence retention is ACCEPTED as useful infrastructure:
- complete compact A2 evidence is captured before Worker release;
- geometry / diagnostics / Support / export fingerprints and runtime facts are copyable;
- retained evidence is persisted to localStorage when available;
- complete evidence is not overwritten by a later incomplete profile.

This directly fixes the v0 evidence-loss problem and should be preserved unless a later review finds a concrete defect.

### Performance optimization decision
The Rabbit closest-surface reusable `Int32Array` traversal stack is semantic-parity safe by the reviewed diff and full-A2 evidence, but it is **NOT PROMOTED as a performance win** from this run.

Measured wall times:
- accepted v0: `2,232,690.1 ms` (~37m13s)
- v1 run: `2,431,968.6 ms` (~40m32s)
- difference: about `+199,278.5 ms` (~+3m19s / +8.9%)

Therefore Performance v1 does not satisfy its full-run speed-success condition yet. Do not claim this commit is faster than v0. The slower wall time is evidence, but not sufficient by itself to prove the Rabbit stack change caused the regression; runtime variance / another tail cost remains possible.

### Semantic / validation evidence
Reported full run:
- Full Support `4,561 / 4,561`
- supported / unsupported `654 / 3,907`
- accepted BODY / Rabbit collision `0 / 0`
- geometry / diagnostics / Support / export fingerprints: exact match to prior gate
- 3MF validation / release: PASS
- console errors / warnings: `0 / 0`
- focused tests `36 / 36 PASS`
- both TypeScript checks: PASS
- build: PASS
- `git diff --check`: PASS

Thus semantic parity is PASS for the retained evidence available from this v1 run.

## Active implementation / evidence instruction
Owner: Team AB / SKIN SOL -> LUNA

Do **not** rerun A2 now.

From the retained COMPLETE v1 evidence only, return the performance section / tail facts needed to choose the next hotspot, including when present:
- `totalMs`
- `targetExtractionMs`
- `targetCoverageMs`
- `routeGenerationMs`
- `routeAuditMs`
- `verticalAuditMs`
- `leaningAuditMs`
- `spacingMs`
- `auditRouteSpacingMs`
- `postAuditSpacingMs`
- route audits / route options
- BODY / Rabbit query call telemetry
- Candidate BVH visited / tested telemetry
- tail windows
- slowest targets / slowest routes
- runtime/browser context

Return retained values only. If a field is not present, report `UNAVAILABLE`. No code change and no new full run for this evidence step.

After SOL reviews this retained profile, choose one next CPU/browser hotspot or stop v1. Do not expand to parallel/native/GPU inside v1.

## Performance v0 — PASS / CLOSED
Accepted commit: `4929cc8e402f59faa7af5b6dfe86282fdb09d244`

Measured improvement:
- pre-v0 reference: ~`43m36s`
- v0 Full Sparse Support: `2,232,690.1 ms` (~`37m13s`)
- improvement: ~`6m23s` / `14.7%`

v0 remains the accepted performance baseline until a later full run proves a faster exact-parity result.

## Physical A2 gate — manual / parallel
Current print classification:
`A2 BODY + authored SKIN removable Support + Bambu automatic Tree Support 45 deg`.

This is physical-feasibility evidence, not proof that authored SKIN Support alone is sufficient.

## Queued before G/H/J
- `docs/tasks/AB_CANDIDATE_ARTIFACT_RETENTION_CHECKPOINT_V0.md`
  - durable archive identity / SHA before release
  - preferred persisted Support checkpoint for exact re-export without repeating Full Sparse Support

## Future Support architecture hypothesis — HOLD / not active
`Outside-only body-anchored removable Support` remains a future research/design hypothesis only and is excluded from the current performance task.

## HOLD / DO NOT CHANGE
- G/H/J execution
- Candidate geometry authority
- source-space Float32 execution
- exact-zero canonicalization
- deferred common placement
- Outside-only removable Support baseline
- Support settings: overhang `45 deg`, shaft `1.6 mm`, neck `0.6 mm`, removal gap `0.35 mm`, Rabbit clearance `0 mm`
- Rabbit forbidden-volume semantics
- route generation / ordering / tie-breaking / spacing / coverage semantics
- FKEI / authoring semantics
- no remesh / decimation
- no hidden candidate-specific tuning
- no internal removable-support rescue
- no body-anchored Support in this task
- no multi-core / CUDA / WebGPU / native migration in v1
- no merge / deploy

## Evidence boundary
### PASS / PROVEN
- v1 full-A2 semantic/fingerprint parity for the retained run
- v1 tests/build/validator evidence
- P0 evidence-retention mechanism reached COMPLETE retained evidence in the actual run

### ACCEPTED BASELINE
- v0 performance commit `4929cc8...` at `2,232,690.1 ms`

### HOLD / NOT PROMOTED
- v1 Rabbit reusable traversal stack as a performance improvement
- Performance v1 overall speed-success claim

### NOT YET PROVEN / HOLD
- next measured CPU hotspot improvement
- A2 physical print completion
- artifact-retention checkpoint before G/H/J
- body-anchored removable Support hypothesis
- G/H/J execution / physical comparison / winner
