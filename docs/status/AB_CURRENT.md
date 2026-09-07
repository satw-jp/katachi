# Team AB Current Status

Last verified: 2026-09-07

## Current authority
- repo: `satw-jp/katachi`
- accepted performance baseline branch: `agent/skin-a2-sparse-support-performance-v0`
- accepted performance baseline commit: `4929cc8e402f59faa7af5b6dfe86282fdb09d244`
- Performance v1 branch: `agent/skin-a2-sparse-support-performance-v1`
- Performance v1 reviewed HEAD: `2964e66002a2b8faed5234769b5f03606fcd3f3b`
- active task: `docs/tasks/AB_A2_SPARSE_SUPPORT_PERFORMANCE_V1.md`
- A2 source SHA-256: `2030a945eb44fb3a263c667305f10ce8a773af5d8914cfca82d7c3f68680b04c`
- Rabbit source SHA-256: `c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8`
- Rabbit repair fingerprint: `90258ce379e3b11aef7e6710ff98ff9f17678a53ae1c7905c3c967bd1e9437d6`
- retained A2 physical artifact SHA-256: `C6D46BF59CF06BF14520C91A1327DDC752A864AF78DA05C72AD0D0D7A086E491`

## Current phase
Two activities remain independent:

1. Author/manual A2 physical feasibility print using the retained artifact plus Bambu Studio automatic Tree Support at `45 deg`.
2. Performance v1 continuation from measured COMPLETE evidence, now focused only on the Rabbit unsigned closed-surface distance hotspot.

G/H/J remain HOLD. No new Support architecture is active.

## Performance v1 status — HOLD / active Rabbit hotspot continuation

Reviewed remote checkpoint:
`2964e66002a2b8faed5234769b5f03606fcd3f3b`

### P0 evidence retention — ACCEPT
Preserve:
- copyable COMPLETE evidence before Worker release
- full geometry / diagnostics / Support / export fingerprints
- runtime facts
- localStorage retention when available
- COMPLETE evidence not overwritten by later incomplete profile

### First Rabbit stack attempt — NOT PROMOTED
Semantic/fingerprint parity: PASS.

Wall time:
- accepted v0: `2,232,690.1 ms` (~37m13s)
- v1 first run: `2,431,968.6 ms` (~40m32s)
- regression: `+199,278.5 ms` / about `+8.9%`

The reusable Rabbit `Int32Array` stack is therefore not accepted as a demonstrated speed win. The slower run does not prove that change alone caused the regression.

## Measured full-run hotspot authority
From retained COMPLETE v1 evidence:

### Overall
- total: `2,431,968.6 ms`
- route audit: `2,430,915.6 ms`
- target extraction: `177.5 ms`
- target coverage: `183 ms`
- route generation: `72.4 ms`
- spacing: `395.2 ms`
- processed targets: `4,561 / 4,561`
- route options: `102,193`
- route audits: `90,921`

### Audit split
- vertical audit: `96,263.0 ms`
- leaning audit: `2,334,652.6 ms`
- BODY audit: `499,995.8 ms`
- Rabbit audit: `1,906,507.6 ms`
- Rabbit unsigned surface time: `1,872,601.8 ms`

Rabbit unsigned surface work is therefore the selected v1 hotspot: roughly `77%` of route-audit time / about `78%` including Rabbit audit overhead.

### Query telemetry
Candidate:
- closest/signed-distance calls: `13,392,861`
- ray calls: `13,389,485`
- closest nodes visited: `2,190,202,663`
- closest triangles tested: `8,028,039,776`
- ray nodes visited: `1,650,185,543`
- ray triangles tested: `3,011,035,168`

Rabbit:
- signed calls: `140,301`
- unsigned surface calls: `17,736,590`
- unsigned surface time: `1,872,601.8 ms`

Tail windows / slowest target / slowest route were not retained in the COMPLETE v1 evidence and remain `UNAVAILABLE`; no rerun is required solely to recover them.

Runtime evidence:
- Chrome 152 / Windows 10
- hardware concurrency: `20`
- device memory: `32 GB`
- crossOriginIsolated: `false`
- secureContext: `true`
- browser errors/warnings: `0 / 0`

## Active implementation instruction
Owner: Team AB / SKIN SOL -> LUNA

Task spec:
`docs/tasks/AB_A2_SPARSE_SUPPORT_PERFORMANCE_V1.md`

Optimize **only** Rabbit closed-surface unsigned-distance execution.

Preferred bounded design target:
- optional capped exact unsigned-distance query returning exactly `min(trueDistance, cap)`;
- BVH may prune against `cap` and stop when no triangle can improve the capped result;
- `forbiddenSdf` remains signed inside/outside authority;
- use capped values in forbidden-volume certification only if exact one-Lipschitz decision parity is mathematically/regression proven;
- no approximate distance, threshold change, sample-position change, recursion-depth change, route-order change, or fail-closed relaxation.

For clean attribution, retain P0 evidence retention and do not treat the first Rabbit reusable-stack change as an accepted speed improvement. Restore baseline traversal behavior if appropriate before the capped-query implementation, or otherwise prove by bounded benchmark that it does not confound the result.

### Gate order
1. Implement deterministic capped-distance vs full-distance parity tests.
2. Implement forbidden-audit exact-decision parity tests including near-threshold/boundary cases.
3. Run bounded/prefix performance comparison first.
4. Only if prefix shows clear Rabbit/route-audit improvement with identical decisions/digest, run one final Full A2.
5. Final Full A2 must beat accepted v0 `2,232,690.1 ms` and preserve complete fingerprints + canonical Support facts.

Do **not** run a new Full A2 if the bounded Rabbit benchmark shows no material improvement.

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

## Performance v0 — PASS / ACCEPTED BASELINE
Accepted commit: `4929cc8e402f59faa7af5b6dfe86282fdb09d244`

Measured:
- pre-v0 reference: ~`43m36s`
- v0 Full Sparse Support: `2,232,690.1 ms` (~`37m13s`)
- improvement: ~`6m23s` / `14.7%`

This remains the accepted performance baseline until a later exact-parity full run proves a faster result.

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
- Candidate BODY query optimization in this v1 continuation
- FKEI / authoring semantics
- no remesh / decimation
- no hidden candidate-specific tuning
- no internal removable-support rescue
- no body-anchored Support in this task
- no multi-core / CUDA / WebGPU / native migration in v1
- no merge / deploy

## Evidence boundary
### PASS / PROVEN
- v1 first full-A2 semantic/fingerprint parity
- v1 tests/build/validator evidence
- P0 evidence retention works on actual COMPLETE run
- Rabbit unsigned surface work is the dominant measured v1 hotspot

### ACCEPTED BASELINE
- v0 performance commit `4929cc8...` at `2,232,690.1 ms`

### HOLD / NOT PROMOTED
- `2964e660...` as a full performance improvement
- first Rabbit reusable traversal stack as a speed win

### ACTIVE / NOT YET PROVEN
- capped exact Rabbit-distance prefix improvement
- capped exact Rabbit-distance final full-A2 improvement
- A2 physical print completion
- artifact-retention checkpoint before G/H/J
- body-anchored removable Support hypothesis
- G/H/J execution / physical comparison / winner
