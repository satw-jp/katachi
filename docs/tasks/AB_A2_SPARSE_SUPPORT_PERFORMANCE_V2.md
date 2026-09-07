# Team AB — A2 Sparse Support Performance v2

Date: 2026-09-08
Owner: Team AB / SKIN SOL -> LUNA
Status: ACTIVE

## Required reading
1. this task
2. `docs/status/AB_CURRENT.md` front section
3. `src/studies/skin/astraPackedCandidateQuery.ts`
4. `src/studies/skin/astraLargeCandidate.worker.ts`
5. `src/studies/skin/rebuild/sparseRemovableSupport.ts`
6. retained A2 evidence sidecar named below

## Do not preload
- `STATEMENT.md`
- `RESEARCH.md`
- other lane CURRENTs
- old AB tasks beyond the named accepted baseline facts
- broad architecture / research docs

If a concrete dependency arises, load only the needed source and report why.

## Purpose

Continue reducing the already-accepted A2 Sparse Support runtime **without changing Candidate / Support / Rabbit / FKEI / export / comparison semantics**.

Performance v1 reduced the accepted Full A2 Support runtime to:

`528,025.4 ms` (~`8m48s`)

at accepted runtime commit:

`a3c3dbdb76dc609cabded13e21ad9fbbd2c0bd29`

Retention v0 is also CLOSED / PASS and must remain intact.

Performance v2 is a new bounded single-thread CPU/browser task. It is not an extension of Retention v0 and it does not authorize parallel/native/GPU work.

## Authorized base / J workspace

- repo: `satw-jp/katachi`
- accepted branch HEAD / v2 base: `2f0eb180fbe1ed0e9034ea2420628f4421f66d95`
- suggested branch: `agent/skin-a2-sparse-support-performance-v2`
- suggested worktree: `J:\dev\worktrees\skin-a2-sparse-support-performance-v2`
- canonical samples: `J:\dev\samples`

Create the v2 branch/worktree from the exact accepted base above. Do not resume work from C-side paths. Do not modify user-managed samples.

## Fixed benchmark authority

### A2
- source SHA-256: `2030a945eb44fb3a263c667305f10ce8a773af5d8914cfca82d7c3f68680b04c`

### Rabbit
- source SHA-256: `c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8`
- repair fingerprint: `90258ce379e3b11aef7e6710ff98ff9f17678a53ae1c7905c3c967bd1e9437d6`
- Signed Volume authority remains unchanged

### Locked Support result / settings
Final accepted v2 must preserve exactly:
- targets: `4,561 / 4,561`
- route candidates / audits: `102,193 / 90,921`
- accepted / unsupported: `654 / 3,907`
- vertical / offset-bend: `466 / 188`
- BODY / Rabbit rejects: `3,257 / 1,502`
- graph nodes / edges: `2,150 / 1,496`
- accepted BODY / Rabbit collision: `0 / 0`
- overhang `45 deg`
- shaft `1.6 mm`
- neck `0.6 mm`
- removal gap `0.35 mm`
- Rabbit clearance `0 mm`
- `contactPolicy = single-body`
- Outside-only removable Support

Complete geometry / diagnostics / Support / export fingerprints and bounded semantic digest must remain exact.

## P0 — Use retained evidence before any new Full A2 run

Do **not** begin with another Full A2 run.

Read the retained canonical A2 sidecar from the accepted Retention v0 gate:

`J:\My Drive\codex\2026-09-05\files-pasted-by-the-user-katachi\browser-retention-gate-20260907\ASTRA_A_candidate-print-lane.evidence.json`

Extract and preserve, when present:
- Support total / route-audit time
- `candidateBodyAuditMs`
- `rabbitAuditMs`
- Candidate signed-distance / closest-surface / ray-intersection calls
- Candidate BVH nodes visited / triangles tested
- Rabbit capped-query facts
- tail windows / slow routes / slow targets
- runtime/browser context

If a needed field is absent, report it as `UNAVAILABLE`; do not fabricate it.

Working hypothesis only: after Rabbit v1, Candidate BODY signed-distance work is the remaining dominant cost. **The retained evidence or bounded profile must prove this before implementation.**

If BODY is not the dominant remaining hotspot, STOP and return evidence to SOL for rescope.

## P1 — Split the BODY hotspot before choosing an optimization

If retained evidence proves BODY is dominant but does not distinguish its internal cost, add only bounded/profile instrumentation needed to distinguish:
- closest-surface distance magnitude work
- ray-parity sign work
- other BODY-query overhead

Prefer a deterministic representative prefix rather than Full A2. Use existing prefix/profile controls where practical.

The prefix comparison must preserve:
- same A2/Rabbit identities
- same processed target prefix
- same route options / audits for that prefix
- same accept/reject decisions
- same bounded semantic digest

Select **one** BODY sub-hotspot only.

## P2 — One exact single-thread BODY optimization only

Allowed classes:
- exact capped distance / signed-distance execution
- exact BVH pruning / broad-phase proof
- exact ray-parity acceleration
- allocation / typed-array / data-layout reductions
- exact caching with complete identity
- loop/query reuse that preserves numeric and traversal semantics relevant to decisions

### Preferred design if closest-surface magnitude dominates

Investigate a separate optional **exact capped signed-distance path for non-terminal BODY keep-out samples only**.

A valid capped query must preserve the authoritative ray-parity sign and return a mathematically bounded form equivalent to:

`sign(trueSignedDistance) * min(abs(trueSignedDistance), cap)`

with the existing near-surface zero behavior preserved.

Do not simply copy the Rabbit implementation. BODY sign semantics are different and must remain exact.

A candidate cap may be derived from the existing non-terminal BODY threshold and base interval length, but only if proved. The intended proof target is:
- values at or below the collision threshold remain exact;
- a positive clipped value remains far enough that the existing one-Lipschitz lower-bound decision for that base interval cannot change;
- any unresolved/refined interval receives exact values where required;
- negative/inside sign remains authoritative and cannot be converted into clearance;
- terminal contact/target-attribution continues to use the legacy exact path unless a separate exact proof is explicitly reviewed.

Preferred first scope: **non-terminal shafts only; terminal/contact segments remain legacy exact signed-distance.**

Required regression coverage includes:
- capped query vs legacy exact sign and magnitude below cap
- outside far points
- inside points
- near-surface/zero behavior
- threshold-adjacent samples
- non-terminal BODY audit decision parity
- deterministic randomized parity fixtures

If this proof is not clean, do not force it. STOP and return evidence.

### If ray parity dominates instead

Do not implement the capped-magnitude design merely because it is pre-described. Choose one exact ray-parity acceleration supported by measurements. It must use the same parity semantics and exact triangle intersection predicate. Approximate occupancy, voxel sign fields, changed ray direction, majority voting, or relaxed parity are forbidden.

## Prefix performance gate

Before any final Full A2 run, show a bounded/prefix comparison against the accepted v2 base.

Required:
- exact semantic/digest parity
- same prefix route decisions
- selected BODY sub-hotspot before/after cost
- Candidate closest/ray calls and BVH nodes/triangles where relevant
- total prefix Support / route-audit time

Only proceed to Full A2 if the selected optimization shows a **clear material improvement**. Do not chase a small/noisy win by broadening scope.

If the prefix result is neutral, regressive, or difficult to prove exact, STOP. Do not run Full A2 merely to satisfy the task.

## Final Full A2 gate

At most one final Full A2 run after the prefix gate passes.

Success requires:
- Full Support materially faster than accepted v1 `528,025.4 ms`
- exact canonical Support counts above
- accepted BODY / Rabbit collision `0 / 0`
- complete geometry / diagnostics / Support / export fingerprint parity
- bounded semantic digest parity
- validator PASS
- Retention v0 durable write/reopen/byte/SHA/sidecar gate remains PASS before release

Archive ZIP bytes/SHA need not match a prior run; generated-vs-persisted identity for the current validated archive must match exactly.

If an OS directory picker is required, follow the team picker protocol: show task context and requested selection before opening it, require explicit author action, and treat cancellation as user-action wait rather than implementation failure.

## Validation

At minimum:
- focused regression for the optimized BODY path
- existing relevant packed Candidate query tests
- sparse Support semantic regressions
- TypeScript checks
- production build
- `git diff --check`
- bounded/prefix performance + parity gate
- at most one final Full A2 run if prefix PASS

Report any intentionally skipped expensive synthetic tests explicitly.

## Explicitly out of scope

Do not implement/change:
- G/H/J execution
- winner selection
- new Support routing semantics
- body-anchored removable Support
- Permanent Structure / Support convergence
- Candidate geometry
- Rabbit policy
- Support target/route/order/tie-breaking/sample/spacing/coverage semantics
- FKEI / authoring semantics
- Retention v0 contract except continuity validation
- multi-worker / multi-core parallel route-audit architecture
- CUDA / WebGPU / native compute
- approximate SDF / collision / sign methods
- remesh / decimation
- deploy

## Escalation / stop rule

If no safe exact single-thread BODY optimization produces a material bounded win, STOP and preserve evidence. Do not broaden v2 into parallel/native/GPU work.

That result is the decision point for a separate later task (parallel/native/GPU) and, if useful, Research Astra review using the existing performance handoff note.

## Done when

Return to Team AB / SKIN SOL with either:

### PASS candidate
- v2 branch/worktree created from exact base `2f0eb180...`
- retained evidence reviewed
- dominant BODY sub-hotspot measured
- one exact optimization implemented
- prefix parity/performance PASS
- final Full A2 materially faster than `528,025.4 ms`
- complete parity / validator / durable retention PASS
- tests/build/diff-check PASS
- G/H/J not run
- no parallel/native/GPU/new Support architecture

### STOP evidence
- BODY is not dominant, or
- no clean exact optimization is available, or
- prefix improvement is not material / is regressive

In STOP case, do not run a final Full A2 and do not expand scope.