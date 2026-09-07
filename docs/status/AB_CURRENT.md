# Team AB Current Status

Last verified: 2026-09-07

## Current authority
- repo: `satw-jp/katachi`
- accepted pre-performance checkpoint: `0d6f176969c5e612f11623efb5423d21b6b3875b`
- performance branch: `agent/skin-a2-sparse-support-performance-v0`
- performance commit under SOL review: `4929cc8e402f59faa7af5b6dfe86282fdb09d244`
- A2 source SHA-256: `2030a945eb44fb3a263c667305f10ce8a773af5d8914cfca82d7c3f68680b04c`
- Rabbit source SHA-256: `c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8`
- retained A2 physical artifact SHA-256: `C6D46BF59CF06BF14520C91A1327DDC752A864AF78DA05C72AD0D0D7A086E491`
- shared author observation / Support hypothesis: `docs/notes/AB_A2_PHYSICAL_PREVIEW_AUTHOR_OBSERVATION_2026-09-06.md`

## Current phase
Two bounded activities are independent:

1. Author/manual A2 physical feasibility print using the retained A2 artifact plus Bambu Studio automatic Tree Support at `45 deg`.
2. A2 Sparse Support Performance v0 SOL review.

G/H/J remain HOLD. No new Support architecture is active.

## Active implementation / review instruction
Task: `docs/tasks/AB_A2_SPARSE_SUPPORT_PERFORMANCE_V0.md`

Implementation commit `4929cc8...` is **code-review ACCEPTED / task closure HOLD pending exact-parity evidence completion**.

Reviewed diff from base `0d6f176...` is one commit / three files only:
- `src/studies/skin/astraPackedCandidateQuery.ts`
- `src/studies/skin/rebuild/sparseRemovableSupport.ts`
- `src/studies/skin/rebuild/sparseRemovableSupport.test.ts`

The changes are execution-only:
- reuse one fixed `Int32Array` stack for synchronous Packed BVH traversals while preserving traversal order;
- under implicit `single-body` contact policy, reuse the already-computed exact BODY SDF value for the terminal target field and the existing constant-clear non-owner field instead of recomputing them;
- add semantic parity regression coverage.

No Candidate / Support / Rabbit / FKEI / exporter semantic change is accepted from this task.

### Reported performance result
- reference Full Sparse Support: approximately `43m36s`
- optimized Full Sparse Support: `2,232,690.1 ms` (~`37m13s`)
- reduction: approximately `6m23s` / `14.7%`
- route audits: `90,921` unchanged
- targets: `4,561 / 4,561`
- supported / unsupported: `654 / 3,907`
- BODY / Rabbit rejects: `3,257 / 1,502`
- accepted BODY / Rabbit collision: `0 / 0`
- 3MF validator / download / release: PASS
- console errors / warnings: `0 / 0`
- focused tests: PASS
- `npm run test:skin-rebuild`: PASS (existing large synthetic test SKIP)
- both TypeScript checks: PASS
- build: PASS
- `git diff --check`: PASS

A bounded prefix profile reported `256 / 4,561`, route audits `236`, `PROFILE_INCOMPLETE`; this is not itself the final parity authority.

### Remaining evidence required before task CLOSED / PASS
Do **not** rerun A2 merely to restate facts if the completed browser run / logs still retain them. Return the exact values from that completed run for:
- route candidates: expected `102,193`
- vertical: expected `466`
- leaning / offset-bend: expected `188`
- graph nodes / edges: expected `2,150 / 1,496`
- geometry fingerprint: exact match to pre-performance benchmark
- diagnostics fingerprint: exact match to pre-performance benchmark
- Support fingerprint / deterministic graph identity: exact match to pre-performance benchmark

If the completed-run evidence is unavailable, report `UNAVAILABLE`; do not infer parity from counts alone. A rerun requires SOL decision because it costs ~37 minutes.

## PASS / CLOSED
- Candidate geometry / source-space Float32 execution
- exact-zero canonicalization
- A2 diagnostics / reachability baseline
- prior Candidate packed BVH correctness/performance work
- Rabbit forbidden-audit performance
- A2 Full Sparse Support baseline correctness
- large 3MF streaming serialization / validation / placement
- Support indexing reporting parity at `0d6f176...`
- performance commit `4929cc8...`: code scope / implementation approach ACCEPTED pending final exact-parity evidence

## Canonical A2 Support facts
Performance work must reproduce exactly:
- targets: `4,561 / 4,561`
- route candidates: `102,193`
- route audits: `90,921`
- accepted / unsupported: `654 / 3,907`
- vertical / leaning-offset-bend: `466 / 188`
- BODY / Rabbit rejects: `3,257 / 1,502`
- graph nodes / edges: `2,150 / 1,496`
- accepted BODY / Rabbit collisions: `0 / 0`

## Physical A2 gate — manual / parallel
Current print classification:
`A2 BODY + authored SKIN removable Support + Bambu automatic Tree Support 45 deg`.

This is physical-feasibility evidence, not proof that authored SKIN Support alone is sufficient.

## Queued before G/H/J
- `docs/tasks/AB_CANDIDATE_ARTIFACT_RETENTION_CHECKPOINT_V0.md`
  - durable archive identity / SHA before release
  - preferred persisted Support checkpoint for exact re-export without repeating Full Sparse Support

## Future Support architecture hypothesis — HOLD / not active
`Outside-only body-anchored removable Support` remains a future design/research hypothesis only. It is not part of the active performance task.

## Next gates
1. LUNA: return the missing exact-parity facts/fingerprints from the already-completed optimized A2 run if retained; no code change required.
2. Team AB / SKIN SOL: close or reject `AB_A2_SPARSE_SUPPORT_PERFORMANCE_V0.md` from that evidence.
3. Author: continue A2 physical print observation independently.
4. G/H/J remain HOLD until explicitly resumed and pre-comparison retention gate is closed.

## HOLD / DO NOT CHANGE
- G/H/J execution
- Candidate geometry authority
- source-space Float32 execution
- exact-zero canonicalization
- deferred common placement
- Outside-only removable Support baseline
- Support settings: overhang `45 deg`, shaft `1.6 mm`, neck `0.6 mm`, removal gap `0.35 mm`, Rabbit clearance `0 mm`
- Rabbit forbidden-volume policy
- route generation / ordering / tie-breaking / spacing / coverage semantics
- FKEI / authoring semantics
- no remesh / decimation
- no hidden candidate-specific tuning
- no internal removable-support rescue
- no body-anchored Support implementation in this task
- no CUDA / WebGPU / native migration in this task
- no merge / deploy

## Evidence boundary
### PASS / PROVEN
- performance diff scope is bounded to the authorized CPU/browser execution path
- optimized actual A2 run completed materially faster with the reported major Support counts unchanged
- tests/build/validator evidence reported PASS

### HOLD / NOT YET PROVEN
- complete exact fingerprint/canonical-count parity required to close Performance v0
- A2 physical print completion
- artifact-retention checkpoint before G/H/J
- body-anchored removable Support hypothesis
- G/H/J execution / physical comparison / winner
