# AB A2 Performance — Astra Handoff

Date: 2026-09-07
Status: research/escalation note; not an implementation authority by itself

Authoritative current state remains `docs/status/AB_CURRENT.md` and the active implementation task remains `docs/tasks/AB_A2_SPARSE_SUPPORT_PERFORMANCE_V1.md`.

## Why this note exists

Preserve the performance investigation in a compact form so Research Astra can later review the problem without reconstructing it from chat or old worker sessions.

The current goal is **only to accelerate the existing A2 Sparse Removable Support pipeline without changing its meaning**. New Support architecture, Permanent Structure / Support convergence, body-anchored Support, Bambu slicer Support, G/H/J, and winner selection are separate topics.

## Accepted performance baseline

Accepted v0 commit:

`4929cc8e402f59faa7af5b6dfe86282fdb09d244`

Observed wall time:

- pre-v0: approximately `43m36s`
- accepted v0: `2,232,690.1 ms` (~`37m13s`)
- improvement: approximately `14.7%`

Accepted v0 changes were intentionally small:

- reusable fixed `Int32Array` stack for synchronous Candidate Packed BVH traversal;
- reuse of the already-computed exact BODY SDF value under implicit `single-body` terminal audit;
- semantic parity regression coverage.

## Performance v1 checkpoint

Reviewed v1 checkpoint:

`2964e66002a2b8faed5234769b5f03606fcd3f3b`

Useful accepted infrastructure:

- complete compact A2 evidence retained before Worker release;
- full geometry / diagnostics / Support / export fingerprints;
- runtime context;
- copyable evidence and localStorage retention when available;
- COMPLETE evidence protected from later incomplete profile overwrite.

This evidence-retention mechanism should be preserved.

The same checkpoint also changed Rabbit closest-surface traversal to a reusable `Int32Array` stack. Semantic/fingerprint parity passed, but this was **not demonstrated as a performance win**.

Measured v1 wall time:

- `2,431,968.6 ms` (~`40m32s`)
- versus accepted v0 `2,232,690.1 ms`
- regression `+199,278.5 ms`, about `+8.9%`

Do not infer that the reusable Rabbit stack alone caused the regression; one full run cannot establish causality. It is simply not promoted as an accepted speed improvement.

## Full-run hotspot evidence

Retained COMPLETE v1 evidence:

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

Rabbit unsigned closed-surface distance work is therefore the dominant measured cost: roughly `77%` of route-audit time, and Rabbit audit overall roughly `78%`.

### Candidate query telemetry

- closest/signed-distance calls: `13,392,861`
- ray calls: `13,389,485`
- closest nodes visited: `2,190,202,663`
- closest triangles tested: `8,028,039,776`
- ray nodes visited: `1,650,185,543`
- ray triangles tested: `3,011,035,168`

### Rabbit query telemetry

- signed calls: `140,301`
- unsigned surface calls: `17,736,590`
- unsigned surface time: `1,872,601.8 ms`

### Runtime

- Chrome 152 / Windows 10
- hardware concurrency: `20`
- device memory: `32 GB`
- `crossOriginIsolated: false`
- `secureContext: true`
- browser errors / warnings: `0 / 0`

Tail windows / slowest targets / slowest routes were not retained and are `UNAVAILABLE`. Do not rerun solely to recover them.

## Current bounded implementation hypothesis

The active v1 continuation is limited to Rabbit unsigned closed-surface distance execution.

Preferred idea:

- optional exact capped nearest-distance query returning exactly `min(trueDistance, cap)`;
- BVH traversal may prune against `cap` and stop when no triangle can improve the capped value;
- `forbiddenSdf` remains the signed inside/outside authority;
- capped values may be used only where one-Lipschitz forbidden-volume certification produces exactly the same accept/reject decision as full distance;
- fallback remains the existing exact full-distance behavior.

Required gate order:

1. prove capped-vs-full distance behavior with deterministic tests;
2. prove forbidden-audit accept/reject parity including near-threshold cases;
3. run bounded/prefix performance comparison;
4. run a new Full A2 only if the bounded benchmark shows a clear material improvement;
5. final accepted result must beat v0 `2,232,690.1 ms` with full fingerprint and canonical-count parity.

## Protected semantics

Do not change for performance convenience:

- Candidate geometry authority;
- source-space Float32 execution;
- exact-zero canonicalization;
- Outside-only Support target semantics;
- route candidate set / ordering / tie-breaking;
- sample positions;
- adaptive certification recursion / thresholds;
- BODY collision semantics;
- Rabbit forbidden-volume semantics / sign authority;
- spacing / coverage policy;
- Support physical settings;
- graph semantics;
- FKEI / authoring semantics;
- A/G/H/J equal-condition comparison contract.

Approximate SDF/collision, new Support topology, and hidden candidate-specific tuning are forbidden in this performance lane.

## When to escalate to Astra

Escalate this note to Research Astra if any of the following occurs:

- exact capped-distance decision parity is difficult to prove cleanly;
- prefix benchmarking shows little or no material gain;
- another single-thread exact CPU optimization still leaves A2 unacceptably slow;
- the next meaningful improvement likely requires algorithm restructuring, multi-core workers, native compute, WebGPU/CUDA, or a different exact geometric query formulation;
- SOL wants an independent audit of whether the current one-Lipschitz / BVH formulation is doing avoidable exact work.

Astra should treat `4929cc8...` as the accepted performance baseline and `2964e660...` as useful evidence-retention infrastructure plus a non-promoted Rabbit stack experiment, not as a faster baseline.

## Questions worth giving Astra

If escalated, useful research questions are:

- Can the exact Rabbit forbidden-volume certificate be reformulated to require fewer exact nearest-distance queries without changing sample positions or thresholds?
- Can interval / capsule-to-BVH lower bounds certify whole route intervals before per-sample nearest queries?
- Can exact batched or coherent BVH traversal exploit the strong spatial coherence between samples along one route?
- Can route audits be parallelized while preserving deterministic final route ordering and graph output?
- What is the lowest-risk path from the current browser CPU implementation to multi-core/native/GPU execution while retaining bitwise or decision-level parity?

Do not ask Astra to redesign Support semantics unless Team AB explicitly opens a separate architecture task.