# Team AB Current Status

Last verified: 2026-09-07

## Current authority
- repo: `satw-jp/katachi`
- pre-performance checkpoint: `0d6f176969c5e612f11623efb5423d21b6b3875b`
- accepted performance branch: `agent/skin-a2-sparse-support-performance-v0`
- accepted performance commit: `4929cc8e402f59faa7af5b6dfe86282fdb09d244`
- A2 source SHA-256: `2030a945eb44fb3a263c667305f10ce8a773af5d8914cfca82d7c3f68680b04c`
- Rabbit source SHA-256: `c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8`
- Rabbit repair fingerprint: `90258ce379e3b11aef7e6710ff98ff9f17678a53ae1c7905c3c967bd1e9437d6`
- retained A2 physical artifact SHA-256: `C6D46BF59CF06BF14520C91A1327DDC752A864AF78DA05C72AD0D0D7A086E491`
- shared author observation / Support hypothesis: `docs/notes/AB_A2_PHYSICAL_PREVIEW_AUTHOR_OBSERVATION_2026-09-06.md`

## Current phase
A2 Sparse Support Performance v0 is accepted and closed with an explicit evidence limitation: the optimized actual A2 run materially reduced wall time and preserved all retained canonical semantic counts, but the completed run did not retain complete geometry / diagnostics / Support fingerprints. Those fingerprint equalities remain UNVERIFIED rather than inferred.

The author/manual A2 physical feasibility print remains independent and may continue using the retained A2 artifact plus Bambu Studio automatic Tree Support at `45 deg`.

G/H/J remain HOLD. No new Support architecture is active.

## Performance v0 — ACCEPT / CLOSED
Task: `docs/tasks/AB_A2_SPARSE_SUPPORT_PERFORMANCE_V0.md`

Accepted commit:
`4929cc8e402f59faa7af5b6dfe86282fdb09d244`

Reviewed diff from base `0d6f176...` is one commit / three files only:
- `src/studies/skin/astraPackedCandidateQuery.ts`
- `src/studies/skin/rebuild/sparseRemovableSupport.ts`
- `src/studies/skin/rebuild/sparseRemovableSupport.test.ts`

Accepted execution-only changes:
- reuse one fixed `Int32Array` stack for synchronous Packed BVH traversals while preserving traversal order;
- under implicit `single-body` contact policy, reuse the already-computed exact BODY SDF result for the terminal target field and the existing constant-clear non-owner field;
- semantic parity regression coverage.

No Candidate / Support / Rabbit / FKEI / exporter semantic change is accepted from this task.

### Measured performance
- reference Full Sparse Support: approximately `43m36s`
- optimized Full Sparse Support: `2,232,690.1 ms` (~`37m13s`)
- reduction: approximately `6m23s` / `14.7%`

### Retained optimized-run parity facts
- A2 source SHA-256: `2030a945eb44fb3a263c667305f10ce8a773af5d8914cfca82d7c3f68680b04c`
- Rabbit SHA-256: `c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8`
- Rabbit repair fingerprint: `90258ce379e3b11aef7e6710ff98ff9f17678a53ae1c7905c3c967bd1e9437d6`
- execution fingerprint UI prefix: `ae244f2cd8ec9046…`; complete value UNAVAILABLE
- diagnostics fingerprint: UNAVAILABLE
- Support fingerprint / semantic digest: UNAVAILABLE
- targets: `4,561 / 4,561`
- route candidates: `102,193`
- route audits: `90,921`
- accepted / unsupported: `654 / 3,907`
- BODY / Rabbit rejects: `3,257 / 1,502`
- graph nodes / edges: `2,150 / 1,496`
- accepted BODY / Rabbit collision: `0 / 0`
- placement parity: PASS
- transform: `1 mm/source-unit · +Y · right-handed · uniformScale 20`
- 3MF validator / download / release: PASS
- console errors / warnings: `0 / 0`
- focused tests: PASS
- `npm run test:skin-rebuild`: PASS (existing large synthetic test SKIP)
- both TypeScript checks: PASS
- build: PASS
- `git diff --check`: PASS

### Evidence decision
The retained canonical semantic facts and exact code review strongly support semantic parity. However, complete geometry / diagnostics / Support fingerprint equality was not retained by the completed browser run, so exact fingerprint parity is explicitly `UNVERIFIED`.

Team AB / SKIN SOL chooses **not to spend another ~37 minutes rerunning A2 solely to recover missing fingerprint display evidence**. Performance v0 is therefore accepted / closed with this evidence limitation rather than falsely upgrading unavailable fingerprints to PROVEN.

For every future full performance run, complete geometry / diagnostics / Support fingerprints and deterministic graph identity must be persisted before release so later SOL review does not depend on UI-retained prefixes.

## PASS / CLOSED
- Candidate geometry / source-space Float32 execution baseline
- exact-zero canonicalization
- A2 diagnostics / reachability baseline
- prior Candidate packed BVH correctness/performance work
- Rabbit forbidden-audit performance
- A2 Full Sparse Support baseline correctness
- large 3MF streaming serialization / validation / placement
- Support indexing reporting parity at `0d6f176...`
- A2 Sparse Support Performance v0 at `4929cc8...`: ACCEPT / CLOSED with fingerprint evidence limitation recorded above

## Physical A2 gate — manual / parallel
Current print classification:
`A2 BODY + authored SKIN removable Support + Bambu automatic Tree Support 45 deg`.

This is physical-feasibility evidence, not proof that authored SKIN Support alone is sufficient.

## Queued before G/H/J
- `docs/tasks/AB_CANDIDATE_ARTIFACT_RETENTION_CHECKPOINT_V0.md`
  - durable archive identity / SHA before release
  - preferred persisted Support checkpoint for exact re-export without repeating Full Sparse Support

## Future Support architecture hypothesis — HOLD / not active
`Outside-only body-anchored removable Support` remains a future design/research hypothesis only. It is not part of the current performance baseline.

## Performance continuation
Further performance work is allowed only as a separate bounded task. The next performance task should:
- use `4929cc8...` as the accepted CPU/browser execution baseline;
- persist full fingerprints before release;
- profile the full or sufficiently representative workload before selecting the next hotspot;
- preserve all current Support semantics / ordering / tie-breaking;
- keep new Support architecture, CUDA/WebGPU/native migration, Bambu Support changes and G/H/J out of scope unless separately authorized.

## Next gates
1. Author: continue / complete the A2 physical feasibility print.
2. If performance work continues now: define Performance v1 from `4929cc8...`, beginning with retained/full profiling evidence and complete fingerprint persistence.
3. Before G/H/J: close candidate artifact-retention checkpoint.
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
- no body-anchored Support implementation without a separate task
- no CUDA / WebGPU / native migration without a separate task
- no merge / deploy unless separately authorized

## Evidence boundary
### PASS / PROVEN
- performance diff scope is bounded to the authorized CPU/browser execution path
- optimized actual A2 run completed materially faster
- all retained canonical semantic counts listed above match the accepted baseline
- tests/build/validator evidence reported PASS

### SUPPORTED
- Performance v0 semantic parity as a whole, based on exact code review plus matching retained full-A2 semantic facts

### UNVERIFIED
- complete optimized-run geometry fingerprint equality
- complete optimized-run diagnostics fingerprint equality
- complete optimized-run Support fingerprint / semantic digest equality

### NOT YET PROVEN / HOLD
- A2 physical print completion
- artifact-retention checkpoint before G/H/J
- body-anchored removable Support hypothesis
- G/H/J execution / physical comparison / winner
