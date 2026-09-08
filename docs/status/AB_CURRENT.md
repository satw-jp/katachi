# Team AB Current Status

Last verified: 2026-09-08

## Authority
- repo: `satw-jp/katachi`
- canonical accepted checkpoint branch: `agent/skin-a2-sparse-support-performance-v1`
- canonical accepted checkpoint HEAD / Performance v2 base: `2f0eb180fbe1ed0e9034ea2420628f4421f66d95`
- accepted Performance v1 runtime commit: `a3c3dbdb76dc609cabded13e21ad9fbbd2c0bd29`
- accepted Retention v0 runtime commit: `d071a583c19fd811a534db1c8cbd039dbfdd99e3`
- accepted Retention v0 docs closure: `2f0eb180fbe1ed0e9034ea2420628f4421f66d95`
- canonical J-side accepted workspace: `J:\dev\worktrees\skin-a2-sparse-support-performance-v1`
- Performance v2 target branch: `agent/skin-a2-sparse-support-performance-v2`
- Performance v2 worktree: `J:\dev\worktrees\skin-a2-sparse-support-performance-v2`
- canonical user-managed samples: `J:\dev\samples`
- C-side repo/samples are rollback/evidence or non-authoritative only

## NOW / Current phase
**Performance v2 is ACTIVE — final Full A2 performance/parity gate is a PASS candidate; remote implementation checkpoint review remains.**

Purpose remains: reduce accepted Full A2 Sparse Support runtime below Performance v1 `528,025.4 ms` (~8m48s) while preserving exact Candidate / Support / Rabbit / FKEI / export / retention semantics.

The bounded 256-target prefix gate passed before the final run:
- prefix semantic digest unchanged: `bc6b941b...`
- Support: `581.8 ms -> 472.3 ms`
- BODY audit: `117.2 ms -> 57.1 ms`
- console: `0 / 0`
- focused tests / tsc / build / diff-check: PASS

One final canonical Full A2 run was then executed and released:
- A2 source SHA: `2030a945eb44fb3a263c667305f10ce8a773af5d8914cfca82d7c3f68680b04c`
- Rabbit SHA: `c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8`
- Rabbit repair fingerprint: `90258ce379e3b11aef7e6710ff98ff9f17678a53ae1c7905c3c967bd1e9437d6`
- Signed Volume: AVAILABLE
- transform: `1 mm/source-unit · +Y · right-handed · uniformScale 20`
- targets: `4,561 / 4,561`
- route audits: `90,921`
- Support total: `201,166.9 ms` (~3m21s)
- BODY audit: `136,841.6 ms`
- Rabbit audit: `45,544.9 ms`
- Export: `24,891.1 ms`
- Performance v1 -> v2 Support improvement: ~`61.9%` (`2.62x` faster)
- Geometry fingerprint: `ae244f2c...6520b9`
- Diagnostics fingerprint: `8db3d239...9696ba0`
- Support fingerprint: `83af4c78...027932`
- Export fingerprint: `850177f1...515fc`
- Validator: PASS
- package placement parity: PASS
- expected / actual Z: `48.029293060302734`
- archive: `ASTRA_A_candidate-print-lane.3mf`
- archive bytes: `75,491,879`
- generated / persisted SHA-256: `c72a8358...f3690a`
- exact persisted byte length / SHA match: PASS
- durable verification: PASS
- browser console: errors `0`, warnings `0`
- app telemetry retained one earlier fail-closed error caused by attempting before Rabbit was loaded; canonical Full A2 added no browser-console error.

`boundedSemanticDigest` is intentionally generated only for bounded profile execution in the current implementation. Therefore its absence from COMPLETE Full-A2 evidence is not a new semantic gap; the already-passed bounded prefix digest parity is the v2 bounded semantic-digest evidence, while the Full run is gated by canonical counts and complete geometry/diagnostics/Support/export fingerprints.

Independent author/manual A2 physical-feasibility gate remains open.

G/H/J remain HOLD. New Support architecture is not active.

## Active task
Owner: Team AB / SKIN SOL -> LUNA

Task:
`docs/tasks/AB_A2_SPARSE_SUPPORT_PERFORMANCE_V2.md`

## Current blocker to formal ACCEPT / CLOSED
The Full A2 gate itself is a PASS candidate, but the Performance v2 implementation has not yet been fixed as a reviewable GitHub remote checkpoint.

At last SOL check, remote ref:
`agent/skin-a2-sparse-support-performance-v2`
was absent.

Do **not** rerun Full A2.

Required next action only:
1. from the exact J-side v2 worktree used for the passing prefix and Full A2, inspect working tree and branch identity;
2. commit the exact v2 implementation/evidence-supporting code already exercised; do not broaden or clean up unrelated code;
3. normal-push `agent/skin-a2-sparse-support-performance-v2`;
4. return new commit SHA / remote HEAD / exact changed files / clean-or-dirty working-tree state;
5. do not run A2 again, do not run G/H/J, and do not begin another optimization.

SOL will then review the exact remote diff from base `2f0eb180...` to the v2 head. Formal ACCEPT requires that the diff matches the measured bounded exact BODY optimization and contains no protected semantic changes.

## Next gate
1. LUNA commits and normal-pushes the exact already-tested v2 implementation only.
2. SOL reviews the exact GitHub diff against base `2f0eb180...`.
3. If code scope and exact-parity proof match the measured evidence, record Performance v2 PASS / ACCEPT / CLOSED and the accepted v2 checkpoint.
4. Hand off the accepted results, reusable compute capability, and unresolved items to `SKIN_ABC_SOL`.
5. STOP. Do not auto-start another AB task.

## Protected
DO NOT CHANGE in Performance v2:
- G/H/J execution / winner selection
- Candidate geometry authority
- source-space Float32 execution
- exact-zero canonicalization
- deferred common placement
- Outside-only removable Support baseline
- Support target / route generation / ordering / tie-breaking / sample positions / adaptive recursion / thresholds / spacing / coverage semantics
- locked Support settings: overhang `45 deg`, shaft `1.6 mm`, neck `0.6 mm`, removal gap `0.35 mm`, Rabbit clearance `0 mm`
- Rabbit forbidden-volume policy / signed-volume authority
- `contactPolicy = single-body`
- FKEI / authoring semantics
- Retention v0 durable write/reopen/byte/SHA/sidecar/pre-release contract
- no remesh / decimation
- no hidden candidate-specific tuning
- no internal removable-support rescue
- no body-anchored Support
- no Permanent Structure / Support convergence
- no multi-worker / multi-core route-audit architecture
- no CUDA / WebGPU / native migration
- no approximate SDF / collision / sign methods
- no deploy
- do not use C-side repo/samples as current authority
- do not modify / rename / reorganize / delete user-managed `J:\dev\samples`

## Required pointers
- team core: `docs/TEAM_PROTOCOL_CORE.md`
- active task: `docs/tasks/AB_A2_SPARSE_SUPPORT_PERFORMANCE_V2.md`
- Candidate query: `src/studies/skin/astraPackedCandidateQuery.ts`
- large Candidate worker: `src/studies/skin/astraLargeCandidate.worker.ts`
- BODY/forbidden audit: `src/studies/skin/rebuild/sparseRemovableSupport.ts`
- retained canonical A2 sidecar:
  `J:\My Drive\codex\2026-09-05\files-pasted-by-the-user-katachi\browser-retention-gate-20260907\ASTRA_A_candidate-print-lane.evidence.json`
- future escalation reference only: `docs/notes/AB_A2_PERFORMANCE_ASTRA_HANDOFF_2026-09-07.md`

## Author transition notice — 2026-09-08

Author-facing consultation is moving toward `SKIN_ABC_SOL`, but **Performance v2 implementation authority remains Team AB until this active task is closed**.

During Performance v2:
- keep the current AB branch / CURRENT / gate authority;
- keep the current scope unchanged;
- do not move code or branch authority to ABC;
- do not create AB/C integration architecture or a common kernel;
- do not change Support placement or A2-specific locked semantics.

At Performance v2 closure:
- record the accepted checkpoint, performance, parity, fingerprints, and blockers/unresolved items normally;
- hand off the accepted result and unresolved items to `SKIN_ABC_SOL`;
- STOP; do not automatically start another AB task.

The earlier AB -> C compute-reuse investigation is provisional read-only evidence grounded only through accepted Performance v1. After Performance v2 is accepted, `SKIN_ABC_SOL` will reassess v2-added/changed compute capability, C/SKIN semantic correspondence, and actual reuse value. This transition does not pre-decide AB's current Support placement as the future SKIN standard.

---

## Retained accepted context

### Fixed benchmark identities
A2 source SHA-256:
`2030a945eb44fb3a263c667305f10ce8a773af5d8914cfca82d7c3f68680b04c`

Rabbit source SHA-256:
`c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8`

Rabbit repair fingerprint:
`90258ce379e3b11aef7e6710ff98ff9f17678a53ae1c7905c3c967bd1e9437d6`

Canonical Support facts that v2 must preserve exactly:
- targets: `4,561 / 4,561`
- route candidates / audits: `102,193 / 90,921`
- accepted / unsupported: `654 / 3,907`
- vertical / offset-bend: `466 / 188`
- BODY / Rabbit rejects: `3,257 / 1,502`
- graph nodes / edges: `2,150 / 1,496`
- accepted BODY / Rabbit collision: `0 / 0`
- geometry / diagnostics / Support / export fingerprints: exact parity
- bounded semantic digest: exact parity on bounded prefix gate

### Performance v1 — PASS / CLOSED
Accepted runtime commit:
`a3c3dbdb76dc609cabded13e21ad9fbbd2c0bd29`

Measured:
- v0: `2,232,690.1 ms` (~37m13s)
- v1: `528,025.4 ms` (~8m48s)
- v0 -> v1 improvement: `76.35%`
- Rabbit audit after v1: `40,846.3 ms`
- capped Rabbit unsigned: `8,492.8 ms / 17,736,590 calls`
- cap returns: `17,612,211`

Accepted v1 change: exact Rabbit capped unsigned-distance query `min(exactDistance, cap)` with signed Rabbit authority and fail-closed one-Lipschitz certification preserved.

### Candidate Artifact Retention / Checkpoint v0 — PASS / CLOSED
Accepted implementation:
`d071a583c19fd811a534db1c8cbd039dbfdd99e3`

Accepted docs closure:
`2f0eb180fbe1ed0e9034ea2420628f4421f66d95`

Before Candidate release, validated 3MF is written to an explicitly authorized directory, closed, reopened, checked for exact bytes and SHA-256, and accompanied by a reread-verified `.evidence.json` sidecar. Mismatch fails closed before release.

### Physical A2 gate — author/manual
Current print classification:
`A2 BODY + authored SKIN removable Support + Bambu automatic Tree Support 45 deg`.

This is physical-feasibility evidence, not proof authored SKIN Support alone is sufficient.

### G/H/J
HOLD until author explicitly resumes the equal-condition comparison lane.

### Future Support hypothesis
`Outside-only body-anchored removable Support` remains research/design input only and is not active in Performance v2.