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
- suggested Performance v2 branch: `agent/skin-a2-sparse-support-performance-v2`
- suggested Performance v2 worktree: `J:\dev\worktrees\skin-a2-sparse-support-performance-v2`
- canonical user-managed samples: `J:\dev\samples`
- C-side repo/samples are rollback/evidence or non-authoritative only

## NOW / Current phase
**Performance v2 is ACTIVE.**

Purpose: reduce accepted Full A2 Sparse Support runtime below Performance v1 `528,025.4 ms` (~8m48s) while preserving exact Candidate / Support / Rabbit / FKEI / export / retention semantics.

Working hypothesis only: after Rabbit v1, Candidate BODY signed-distance work is the remaining dominant cost. This must be proven from retained evidence / bounded profiling before implementation.

Independent author/manual A2 physical-feasibility gate remains open.

G/H/J remain HOLD. New Support architecture is not active.

## Active task
Owner: Team AB / SKIN SOL -> LUNA

Task:
`docs/tasks/AB_A2_SPARSE_SUPPORT_PERFORMANCE_V2.md`

Required first actions:
1. create v2 branch/worktree from exact accepted base `2f0eb180...` on J;
2. read the retained canonical A2 evidence sidecar before any new Full A2 run;
3. prove whether Candidate BODY is the dominant remaining hotspot;
4. if BODY is dominant, split closest-surface vs ray-parity cost with retained/bounded evidence;
5. choose one exact single-thread BODY sub-hotspot only.

Do not begin by rerunning Full A2.

## Blocker
None at task start.

Fail closed / STOP and return evidence if:
- the retained sidecar cannot establish the current hotspot and bounded profiling cannot safely resolve it;
- BODY is not the dominant remaining cost;
- no clean exact single-thread optimization can be proved;
- bounded/prefix performance is neutral or regressive.

## Next gate
1. LUNA executes Performance v2 P0/P1 measurement from the exact J authority.
2. If BODY dominance is proven, implement one exact BODY sub-hotspot optimization only.
3. Run deterministic prefix parity/performance comparison.
4. Only if prefix shows a clear material win, run at most one final canonical Full A2.
5. Final candidate must beat `528,025.4 ms` with complete semantic/fingerprint parity, validator PASS, and Retention v0 durable persistence PASS.
6. Return compact SOL-review handoff with exact branch/commit/performance/parity evidence.

If single-thread v2 does not produce a material safe win, stop. Parallel/native/GPU work belongs to a separate later task.

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
- bounded semantic digest: exact parity

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

Earlier pre-cap evidence measured BODY audit at `499,995.8 ms`, but this is not by itself current v2 hotspot authority. v2 must read the retained accepted sidecar / bounded profile first.

### Candidate Artifact Retention / Checkpoint v0 — PASS / CLOSED
Accepted implementation:
`d071a583c19fd811a534db1c8cbd039dbfdd99e3`

Accepted docs closure:
`2f0eb180fbe1ed0e9034ea2420628f4421f66d95`

Before Candidate release, validated 3MF is written to an explicitly authorized directory, closed, reopened, checked for exact bytes and SHA-256, and accompanied by a reread-verified `.evidence.json` sidecar. Mismatch fails closed before release.

Real Windows Chrome canonical A2 retention gate:
- persisted archive: `75,491,874` bytes
- persisted SHA-256: `DE304365A3247487F7EC18DB1536D2234E9980A57576D6ACFFB0AA3C00460874`
- generated/persisted identity: PASS
- sidecar: persisted/reread PASS
- release after durable verification: PASS

Archive ZIP bytes may differ across separate export runs; current generated-vs-persisted identity and semantic fingerprints are the retention authority.

### Physical A2 gate — author/manual
Current print classification:
`A2 BODY + authored SKIN removable Support + Bambu automatic Tree Support 45 deg`.

This is physical-feasibility evidence, not proof authored SKIN Support alone is sufficient.

If slicer-generated Support is later used for A/G/H/J comparison, freeze the same slicer policy/profile across all candidates.

### G/H/J
HOLD until author explicitly resumes the equal-condition comparison lane.

### Future Support hypothesis
`Outside-only body-anchored removable Support` remains research/design input only and is not active in Performance v2.