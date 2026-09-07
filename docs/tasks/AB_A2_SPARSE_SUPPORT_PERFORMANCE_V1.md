# Team AB — A2 Sparse Support Performance v1

Date: 2026-09-07
Owner: Team AB / SKIN SOL -> LUNA

## Purpose

Continue reducing runtime of the already-accepted A2 Sparse Removable Support pipeline **without changing its meaning**.

Performance v0 reduced the observed Full Sparse Support runtime from approximately `43m36s` to `2,232,690.1 ms` (~`37m13s`) at accepted commit:

`4929cc8e402f59faa7af5b6dfe86282fdb09d244`

v1 is a second bounded CPU/browser optimization pass. It must begin from measurement, select at most one dominant hotspot, and preserve exact Support semantics / deterministic decisions.

Do not implement new Support architecture in this task.

## Authorized implementation base

- repo: `satw-jp/katachi`
- base commit: `4929cc8e402f59faa7af5b6dfe86282fdb09d244`
- suggested branch: `agent/skin-a2-sparse-support-performance-v1`

Read reporting authority / task state from `main`; do not merge or rebase production lineage merely to obtain docs.

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
The final v1 run must preserve:
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

Accepted v0 wall-time authority: `2,232,690.1 ms` (~`37m13s`). Treat this as an observed reference, not a guaranteed machine-independent number.

## P0 — Fix evidence retention before another full run

The v0 full run did not retain complete geometry / diagnostics / Support fingerprints. Do not repeat that evidence loss.

Before the next full A2 run, ensure the run can persist or emit a copyable compact evidence block containing at least:
- full geometry / execution fingerprint
- full diagnostics fingerprint
- full Support fingerprint / deterministic graph identity or semantic digest
- source / Rabbit identities
- all canonical Support counts
- full `SparseSupportPerformance` summary
- machine / browser / runtime context available to the lab

This is evidence/reporting instrumentation only. It must not alter geometry, route order, sampling, decisions, graph output, export, or physical semantics.

Do **not** perform a 37-minute run merely to populate this block before profiling. Implement the retention path first, then use it for the final full run.

## P1 — Profile before selecting a hotspot

Use current telemetry and, if needed, add bounded execution-only instrumentation to distinguish costs such as:
- BODY route-audit / SDF evaluation
- Rabbit forbidden-volume audit
- adaptive certification / sample-cache work
- spacing comparisons
- BVH traversal / triangle tests
- route generation or other measured cost

A prefix/profile run is allowed to avoid wasting a full 37-minute cycle. Prefer a deterministic representative prefix large enough to expose the dominant cost (for example 512–1024 targets if practical), but do not assume a fixed size if telemetry shows it is unrepresentative.

The profile must identify **one dominant hotspot** before semantic implementation changes. If no hotspot is clearly dominant or no safe exact optimization is evident, stop and report evidence rather than broadening scope.

## P2 — Optimize one hotspot only

Choose at most **one** dominant hotspot for v1.

Allowed classes of change include:
- eliminate redundant exact calculations;
- exact caching / memoization with complete identity;
- allocation / object / data-layout reductions;
- exact broad-phase rejection or acceptance proofs that cannot change semantic results;
- loop / typed-array / query reuse improvements;
- safe batching inside the same synchronous deterministic algorithm, provided decision order and numeric semantics are unchanged.

Do not change:
- route candidate set;
- route order or tie-breaking;
- sample positions / adaptive-certification semantics;
- coverage / spacing policy;
- BODY or Rabbit thresholds;
- target / Outside classification;
- accepted/rejected decisions;
- graph construction / serialization semantics.

If an optimization would require changing any of those, stop and leave it for a separate architecture task.

## Exact parity gate

The final optimized full A2 run must retain and compare complete evidence before release.

Required exact parity:
- A2 source SHA
- Rabbit SHA / repair fingerprint / transform
- complete geometry / execution fingerprint
- complete diagnostics fingerprint
- complete Support fingerprint / graph identity / semantic digest available from the current implementation
- all canonical Support counts above
- accepted BODY / Rabbit collision `0 / 0`
- deterministic graph nodes / edges / serialization identity
- placement parity / validator continuity if export is run

Any semantic or fingerprint drift = `REJECT / semantic drift`; do not reinterpret it as a performance win.

## Performance evidence

Report:
- v0 reference: `2,232,690.1 ms`
- v1 optimized Full Sparse Support wall time
- percent / absolute reduction
- selected hotspot and why it was selected
- hotspot before/after evidence from representative profiling
- BODY / Rabbit calls, BVH visits/tests, spacing comparisons, sample counts or other relevant counters for that hotspot
- machine / browser / runtime context
- complete parity evidence block

A material improvement is required, but do not chase an arbitrary target by changing semantics or expanding scope.

## Explicitly out of scope

Do not implement or change:
- Outside-only body-anchored removable Support
- Permanent Structure / Support convergence
- any new Support routing semantics
- CUDA / WebGPU / native compute
- multi-worker / multi-core route-audit parallelism
- approximate SDF / collision methods
- Bambu slicer Support behavior or performance
- Candidate geometry
- Rabbit policy
- FKEI / authoring semantics
- 3MF exporter / validator semantics except evidence-only continuity checks
- A/G/H/J execution
- winner selection
- merge / deploy

Multi-core / CUDA / native acceleration belongs to a later performance phase after this single-thread CPU/browser baseline is exhausted enough to justify architecture expansion.

## Validation

At minimum:
- focused regression for the optimized path
- existing sparse Support semantic regressions
- relevant packed-query / Rabbit regressions if touched
- `npm run test:skin-rebuild`
- TypeScript checks
- build
- `git diff --check`
- one optimized full A2 run with retained complete parity evidence

Existing intentionally skipped large synthetic tests may remain skipped if unchanged; report that explicitly.

## Done when

Return to Team AB / SKIN SOL only when:
- branch starts from `4929cc8...`
- evidence-retention path is present before final full run
- representative profiling identifies one dominant hotspot
- only that hotspot is optimized
- optimized full A2 completes
- complete fingerprints / graph identity are retained
- all canonical Support facts remain exact
- accepted BODY / Rabbit collision `0 / 0`
- measured wall-time improvement is reported
- focused tests / relevant suite / build PASS
- new Support architecture: NO
- multi-core / CUDA / native: NO
- G/H/J: NOT RUN
- merge / deploy: NO

Return the standard compact SOL review handoff with branch / commit / test / performance / parity evidence.