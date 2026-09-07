# Team AB — A2 Sparse Support Performance v1

Date: 2026-09-07
Owner: Team AB / SKIN SOL -> LUNA

## Purpose

Continue reducing runtime of the already-accepted A2 Sparse Removable Support pipeline **without changing its meaning**.

Performance v0 reduced the observed Full Sparse Support runtime from approximately `43m36s` to `2,232,690.1 ms` (~`37m13s`) at accepted commit:

`4929cc8e402f59faa7af5b6dfe86282fdb09d244`

v1 is a second bounded CPU/browser optimization pass. It must remain exact-parity and must not implement new Support architecture.

## Authorized implementation base / branch

- repo: `satw-jp/katachi`
- accepted performance baseline: `4929cc8e402f59faa7af5b6dfe86282fdb09d244`
- active branch: `agent/skin-a2-sparse-support-performance-v1`
- first reviewed v1 checkpoint: `2964e66002a2b8faed5234769b5f03606fcd3f3b`

Read reporting authority from `main`; do not merge/rebase production lineage merely to obtain docs.

## Fixed A2 benchmark authority

### A2
- source SHA-256: `2030a945eb44fb3a263c667305f10ce8a773af5d8914cfca82d7c3f68680b04c`
- source triangles: `5,934,046`
- execution triangles: `5,934,044`
- exact-zero removed source faces: `750206`, `750207`

### Rabbit
- source SHA-256: `c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8`
- repair fingerprint: `90258ce379e3b11aef7e6710ff98ff9f17678a53ae1c7905c3c967bd1e9437d6`
- uniformScale: `20`
- Signed Volume: AVAILABLE

### Locked Support settings
- overhang: `45 deg`
- shaft: `1.6 mm`
- neck: `0.6 mm`
- removal gap: `0.35 mm`
- Rabbit clearance: `0 mm`
- contactPolicy: `single-body`
- Outside-only removable Support

### Canonical Support result
The final accepted v1 run must preserve:
- targets: `4,561 / 4,561`
- route candidates: `102,193`
- route audits: `90,921`
- accepted: `654`
- unsupported: `3,907`
- vertical: `466`
- leaning / offset-bend: `188`
- BODY rejects: `3,257`
- Rabbit rejects: `1,502`
- graph nodes: `2,150`
- graph edges: `1,496`
- accepted BODY collision: `0`
- accepted Rabbit collision: `0`

Accepted v0 wall-time authority: `2,232,690.1 ms` (~`37m13s`).

## P0 — Evidence retention — ACCEPTED

Checkpoint `2964e660...` added copyable/localStorage COMPLETE evidence before Worker release. Team AB / SKIN SOL accepts and retains this capability.

It must preserve at least:
- full geometry / execution fingerprint
- full diagnostics fingerprint
- full Support fingerprint / deterministic identity available from the implementation
- source / Rabbit identities
- canonical Support counts
- full `SparseSupportPerformance`
- runtime/browser context

Do not remove this retention path unless a concrete defect is found.

## P1 measured profile — dominant hotspot PROVEN

The COMPLETE v1 evidence measured:

- total: `2,431,968.6 ms`
- route audit: `2,430,915.6 ms`
- vertical audit: `96,263.0 ms`
- leaning audit: `2,334,652.6 ms`
- spacing: `395.2 ms`
- BODY audit: `499,995.8 ms`
- Rabbit audit: `1,906,507.6 ms`
- Rabbit unsigned surface time: `1,872,601.8 ms`
- Rabbit unsigned surface calls: `17,736,590`
- Rabbit signed calls: `140,301`

Thus Rabbit unsigned surface distance is the dominant measured hotspot: roughly `77%` of route-audit wall time / `78%` including Rabbit audit overhead.

Candidate telemetry is also large but is not the selected v1 hotspot:
- Candidate closest/signed-distance calls: `13,392,861`
- Candidate ray calls: `13,389,485`
- closest BVH nodes visited: `2,190,202,663`
- closest triangles tested: `8,028,039,776`
- ray BVH nodes visited: `1,650,185,543`
- ray triangles tested: `3,011,035,168`

Do not optimize BODY/Candidate queries inside v1 unless this Rabbit attempt is explicitly closed and a new task is authorized.

## First Rabbit optimization checkpoint — NOT PROMOTED

`2964e660...` also replaced Rabbit closest-surface temporary Array traversal with a reusable `Int32Array` stack.

Semantic/fingerprint parity: PASS.

Performance result:
- v0 accepted baseline: `2,232,690.1 ms`
- v1 first full run: `2,431,968.6 ms`
- difference: `+199,278.5 ms` / approximately `+8.9%`

Therefore the reusable Rabbit stack is **not accepted as a demonstrated performance win**. The slower wall time does not by itself prove that stack caused the regression, but it cannot be promoted on performance evidence.

For the next checkpoint, prefer a clean attribution: retain P0 evidence retention, and either restore the v0 Rabbit traversal behavior before the new optimization or otherwise demonstrate by bounded benchmark that the stack does not confound the selected optimization. Do not spend another full A2 run merely to benchmark the stack alone.

## P2 active implementation — exact capped Rabbit unsigned distance

Optimize **only the Rabbit closed-surface unsigned-distance query**.

### Design target

Current forbidden-volume audit often computes the complete exact nearest-surface distance even when the point is already far enough from Rabbit that only a bounded clearance proof is needed.

Implement an optional execution-only capped query that can return:

`min(exactUnsignedSurfaceDistance, cap)`

**exactly**.

This is not an approximate SDF. When the true surface distance is below `cap`, the returned value must be the exact same distance as the existing query. When no Rabbit triangle can be closer than `cap`, returning exactly `cap` is allowed.

The BVH may initialize/prune against the cap and skip subtrees whose AABB lower bound cannot improve the capped result.

### Certification parity requirement

The capped value may be used by `auditCapsuleAgainstForbiddenVolume()` only with a mathematically and regression-tested cap that cannot alter the existing one-Lipschitz certification decision.

The current audit uses base intervals and recursive subintervals. A preferred bounded approach is to choose a common cap for a base interval/sample cache that is strictly sufficient relative to:
- forbidden threshold (`segment.radius + clearance + existing epsilon`), and
- the maximum interval length in which the cached sample can participate.

For example, a cap based on `threshold + baseIntervalLength` (plus only the existing/numerically justified tolerance) may be valid if the implementation proves that clipping an exact 1-Lipschitz unsigned-distance field at that cap preserves every accept/reject/refine decision. Do not adopt this formula merely because it is suggested here; prove the actual implementation.

Required proof-by-regression:
- capped query equals `min(fullExactDistance, cap)` across deterministic Rabbit/mesh fixtures and varied caps;
- full exact and capped forbidden-volume audits produce identical accept/reject reason and sample/certification semantics across deterministic segment fixtures, including boundary/near-threshold cases;
- no change to sign authority: `forbiddenSdf` remains the signed inside/outside authority;
- no threshold, sample position, recursion depth, route order, or fail-closed rule changes.

If exact decision parity cannot be demonstrated, STOP and report; do not weaken certification.

### Prefix performance gate before another full run

Do not immediately spend another ~40 minutes.

First use deterministic bounded/prefix evidence to show that the capped path materially reduces Rabbit unsigned query cost while preserving semantic digest for the profiled workload.

Report at least:
- same processed targets / route audits for the compared prefix
- same result digest / decisions
- Rabbit unsigned calls
- Rabbit BVH nodes/triangles or equivalent capped-query telemetry
- Rabbit unsigned time
- total prefix route-audit time

Only if the prefix shows a clear material improvement should LUNA perform one final full A2 run.

## Exact parity gate for final full run

Before SOL review, retain complete evidence before release and prove:
- source SHA
- Rabbit SHA / repair fingerprint / transform
- complete geometry / execution fingerprint
- complete diagnostics fingerprint
- complete Support fingerprint / graph identity / semantic digest available
- every canonical Support count above
- accepted BODY / Rabbit collision `0 / 0`
- placement / validator continuity when export is run

Any semantic/fingerprint drift = `REJECT / semantic drift`.

## Performance success

The final v1 candidate is accepted as a performance win only if:
- it is materially faster than accepted v0 baseline `2,232,690.1 ms` under the fixed A2 authority, or there is exceptionally strong repeated/normalized evidence that wall-time variance invalidates a single direct comparison and SOL explicitly accepts that evidence;
- Rabbit hotspot-specific evidence improves materially;
- exact parity passes.

Do not claim `2964e660...` itself is faster than v0.

## Explicitly out of scope

Do not implement/change:
- Outside-only body-anchored removable Support
- Permanent Structure / Support convergence
- new Support routing semantics
- route candidate order / tie-breaking
- sample positions / recursion depth / thresholds / fail-closed behavior
- coverage / spacing semantics
- Candidate BODY query optimization in this v1 continuation
- CUDA / WebGPU / native compute
- multi-worker / multi-core route-audit parallelism
- approximate SDF / collision methods
- Bambu slicer Support behavior/performance
- Candidate geometry
- Rabbit policy
- FKEI / authoring semantics
- A/G/H/J execution
- winner selection
- merge / deploy

## Validation

At minimum:
- deterministic capped-distance vs full-distance parity tests
- deterministic forbidden-audit exact-decision parity tests
- existing sparse Support semantic regressions
- relevant Rabbit / external-host tests
- TypeScript checks
- build
- `git diff --check`
- bounded/prefix performance gate first
- at most one final full A2 run after prefix improvement is proven

## Done when

Return to Team AB / SKIN SOL when either:

### PASS candidate
- P0 evidence retention preserved
- Rabbit capped exact-distance prefix parity/performance: PASS
- final full A2 completes faster than accepted baseline with complete exact parity
- tests/build PASS
- G/H/J not run; no architecture expansion

### STOP evidence
- capped exact-distance cannot preserve certification semantics, or
- bounded benchmark shows no material Rabbit improvement

In STOP case, do not run another full A2 merely to satisfy the task.