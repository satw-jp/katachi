# Team AB Current Status

Last verified: 2026-09-07

## Current authority
- repo: `satw-jp/katachi`
- accepted implementation checkpoint: `agent/skin-astra-large-3mf-validator-v0`
- accepted HEAD: `0d6f176969c5e612f11623efb5423d21b6b3875b`
- A2 source SHA-256: `2030a945eb44fb3a263c667305f10ce8a773af5d8914cfca82d7c3f68680b04c`
- Rabbit source SHA-256: `c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8`
- retained A2 artifact: `ASTRA_A_candidate-print-lane.3mf`
- archive SHA-256: `C6D46BF59CF06BF14520C91A1327DDC752A864AF78DA05C72AD0D0D7A086E491`
- archive bytes: `75,491,879`
- retained path reported by implementation: `J:/My Drive/codex/2026-09-06/files-pasted-by-the-user-team/outputs/ASTRA_A_candidate-print-lane.3mf`
- shared author observation / Support hypothesis: `docs/notes/AB_A2_PHYSICAL_PREVIEW_AUTHOR_OBSERVATION_2026-09-06.md`

## Current phase
Two bounded activities may proceed without changing each other:

1. **Author/manual physical gate:** first A2 physical feasibility print using the exact retained artifact plus Bambu Studio automatic Tree Support at `45 deg`.
2. **Implementation performance gate:** optimize the existing A2 Full Sparse Support pipeline with exact semantic parity. No new Support architecture is allowed in this performance task.

G/H/J remain HOLD until the author explicitly resumes the equal-condition comparison lane and the required pre-comparison infrastructure gates are closed.

## Active implementation instruction
- owner: Team AB / SKIN SOL -> Temporary AB Implementation SOL / LUNA
- task: `A2 Sparse Support Performance v0`
- purpose: reduce the current approximately `43m36s` Full Sparse Support runtime without changing Candidate, Support, Rabbit, export, FKEI, or comparison semantics.
- allowed scope: fixed A2 benchmark, profiling/instrumentation, then at most one or two measured hotspots; exact caching/pruning/data-layout/allocation/redundant-work improvements only when semantic equivalence is preserved.
- protected scope: all geometry authority, source-space Float32 execution, exact-zero canonicalization, Outside-only target semantics, route generation/order/tie-breaking, BODY/Rabbit collision semantics, spacing/coverage, physical settings, exporter/validator, FKEI, A/G/H/J comparison contract.
- done when: full A2 completes faster on the fixed benchmark and geometry/diagnostics/Support fingerprints plus all canonical Support results remain exactly equal; tests/build PASS; G/H/J not run.
- instruction source: `docs/tasks/AB_A2_SPARSE_SUPPORT_PERFORMANCE_V0.md`
- authorized code-lineage base: `0d6f176969c5e612f11623efb5423d21b6b3875b`

### Explicit performance-task exclusions
Do not implement in this task:
- Outside-only body-anchored removable Support
- Permanent Structure / Support convergence
- CUDA / WebGPU / native migration
- approximate SDF / collision semantics
- Bambu slicer Support changes
- G/H/J execution
- merge / deploy

Bambu Support timing may be recorded as a separate physical observation only.

## PASS / CLOSED
- Candidate geometry / source-space Float32 execution
- exact-zero canonicalization
- A2 diagnostics / reachability
- Candidate packed BVH performance
- Rabbit forbidden-audit performance
- A2 Full Sparse Support correctness: COMPLETE
- Support mesh generation
- large 3MF streaming serialization / compression / ZIP
- streaming validator scalability
- validator legacy/streaming XML parity: PASS at `1cf17eb7021a049269da76dc12f83524a52d2cf3`
- regenerated A2 archive retained with SHA-256 identity
- regenerated A2 validator PASS, errors/warnings `0/0`
- placement parity PASS; package Z `48.029293060302734`
- BODY indexing retention PASS (`0` removed)
- Support indexing reporting parity: PASS at `0d6f176969c5e612f11623efb5423d21b6b3875b`

## Canonical A2 Support / export facts
Performance work must reproduce these semantic facts exactly:
- Full Sparse Support targets: `4,561 / 4,561`
- route candidates: `102,193`
- route audits: `90,921`
- accepted / unsupported: `654 / 3,907`
- vertical / leaning-offset-bend: `466 / 188`
- BODY rejects: `3,257`
- Rabbit rejects: `1,502`
- graph nodes / edges: `2,150 / 1,496`
- accepted BODY / Rabbit collisions: `0 / 0`
- BODY serialized faces: `5,934,044`
- BODY removed during indexing: `0`
- generated Support pre-index triangles: `71,808`
- Support degenerate removed during indexing: `80`
- indexed / serialized Support faces: `71,728`
- validator total archive triangles: `6,005,772`
- archive bytes: `75,491,879`

Known observed Full Sparse Support runtime: approximately `43m36s`; this is a performance cost, not a correctness blocker.

## Physical A2 gate — manual / parallel
Current print classification:

`A2 BODY + authored SKIN removable Support + Bambu automatic Tree Support 45 deg`

This is valid physical-feasibility evidence, but not proof that authored SKIN Support alone is sufficient.

For the current print:
- no rescale / reposition
- authored SKIN Support unchanged and present
- Bambu automatic Tree Support at `45 deg`
- no candidate-specific hidden tuning

Record printer / nozzle / process / material profile, first layer, completion/failure, Bambu Tree removal, authored-Support removal, BODY damage and visible physical defects.

If slicer-generated Support is later used for A/G/H/J comparison, freeze the same slicer policy/profile across every candidate.

## Queued before G/H/J
- `docs/tasks/AB_CANDIDATE_ARTIFACT_RETENTION_CHECKPOINT_V0.md`
  - durable archive identity / SHA before release
  - preferred persisted Support checkpoint for exact re-export without repeating Full Sparse Support

G/H/J should not run unattended until this retention gate is closed.

## Future Support architecture hypothesis — HOLD / not active
Shared note: `docs/notes/AB_A2_PHYSICAL_PREVIEW_AUTHOR_OBSERVATION_2026-09-06.md`

Promising future direction: `Outside-only body-anchored removable Support` using a lower already-printable exterior BODY region as an explicit removable-Support anchor for a higher Outside target.

This is research/design input only. It is explicitly excluded from the active performance task and does not change the current A/G/H/J baseline.

## Next gates
1. Author: complete / observe the A2 physical feasibility print.
2. Implementation: complete `AB_A2_SPARSE_SUPPORT_PERFORMANCE_V0.md` and return exact before/after + parity evidence for SOL review.
3. Before G/H/J: close candidate artifact-retention checkpoint.
4. G/H/J remain HOLD until author explicitly resumes them.

## HOLD / DO NOT CHANGE
- G/H/J execution until author explicitly resumes
- Candidate geometry authority
- source-space Float32 execution
- exact-zero canonicalization
- deferred common placement
- current baseline: Outside-only Removable Support
- Support settings: overhang `45 deg`, shaft `1.6 mm`, neck `0.6 mm`, removal gap `0.35 mm`, Rabbit clearance `0 mm`
- Rabbit forbidden-volume policy
- A/G/H/J equal-condition physical comparison contract
- FKEI / authoring semantics
- no remesh / decimation
- no hidden candidate-specific tuning
- no internal removable-support rescue
- no winner before physical comparison
- no Astra production implementation
- no deploy from these gates

## Evidence boundary
### PASS / PROVEN
- A2 software geometry / diagnostics / Support / export / validation chain under locked semantics
- durable A2 archive identity
- Support indexing / reporting semantics
- Bambu Studio import / slice preview

### AUTHOR OBSERVATION
- A2 form is visually very attractive / promising; not winner selection.
- current SKIN removable Support appears easy to remove; body-anchored removable Support remains a future hypothesis.

### ACTIVE / NOT YET PROVEN
- A2 Sparse Support performance improvement with exact parity
- A2 physical print completion
- full physical profile frozen for A/G/H/J
- artifact-retention checkpoint before G/H/J
- body-anchored removable Support hypothesis
- G/H/J execution / physical comparison / winner
