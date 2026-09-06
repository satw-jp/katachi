# Team AB — A2 Sparse Support Performance v0

Date: 2026-09-07
Owner: Team AB / SKIN SOL -> Temporary AB Implementation SOL / LUNA

## Purpose

Reduce the runtime of the **current, already-accepted A2 Sparse Removable Support pipeline** without changing any geometry, Support semantics, acceptance decisions, physical parameters, Rabbit policy, export semantics, or A/G/H/J comparison conditions.

This is a pure performance task.

Do **not** implement the future `Outside-only body-anchored removable Support` hypothesis in this task. Do not change Bambu slicer-generated Support behavior. Those are separate architecture / physical topics.

## Authorized implementation base

Use the accepted AB implementation checkpoint as the code-lineage base:

- repo: `satw-jp/katachi`
- base commit: `0d6f176969c5e612f11623efb5423d21b6b3875b`
- accepted reporting task at this base: `AB_SUPPORT_INDEXING_REPORTING_PARITY_V0` CLOSED / PASS

Suggested task branch:

`agent/skin-a2-sparse-support-performance-v0`

Do not merge / rebase production lineage merely to obtain documentation files. Read reporting authority from `main`.

## Fixed benchmark authority

Performance comparisons must use the same actual A2 / Rabbit inputs and locked settings.

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
- contact policy: `single-body`
- Outside-only removable Support

### Canonical semantic result

The optimized run must reproduce the current A2 Support result exactly:

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

Known full Support reference runtime is approximately `43m36s`. Treat this as the current observed reference, not as an immutable benchmark number; capture exact machine/browser/runtime facts for any new before/after claim.

## Work sequence

### P0 — Freeze benchmark / evidence

Before semantic implementation changes:

1. Confirm exact A2 / Rabbit identity and locked settings above.
2. Preserve / record current geometry fingerprint, diagnostics fingerprint and Support fingerprint.
3. Use the existing Support performance telemetry to capture at least:
   - totalMs
   - targetExtractionMs
   - targetCoverageMs
   - routeGenerationMs
   - routeAuditMs
   - verticalAuditMs
   - leaningAuditMs
   - spacingMs
   - audit/post-audit spacing comparisons and time
   - BODY query call / BVH telemetry
   - Rabbit signed / unsigned query telemetry
   - tail windows / slow targets / slow routes where available
4. If current telemetry is insufficient to identify the dominant cost, add instrumentation only first. Instrumentation must not alter route decisions or ordering.

A bounded prefix/profile may be used to iterate quickly, but the final performance claim must be checked against the full A2 workload.

### P1 — Profile before optimizing

Identify the largest measured hotspot(s).

Choose **at most one or two** dominant hotspots for this v0 task. Do not opportunistically rewrite unrelated code.

Candidate areas may include exact query cost, repeated route-audit work, spacing work, allocation / conversion overhead, or another hotspot proven by telemetry. The profile decides; do not assume in advance.

### P2 — Optimize without semantic change

Allowed changes are execution-only improvements such as:

- exact caching / memoization where key identity is complete;
- exact broad-phase pruning that cannot change the set/order of accepted semantic candidates;
- removal of redundant exact calculations;
- allocation / data-layout / typed-array improvements;
- reuse of already-proven exact query structures;
- safe batching / loop-level improvements that preserve deterministic ordering and exact decisions.

If a proposed optimization can change numeric results, route ordering, sample positions/counts, candidate order, tie-breaking, graph topology, or accepted/rejected decisions, it is out of scope unless exact equivalence is proven before adoption.

## Explicitly out of scope

Do not change:

- Candidate geometry authority
- source-space Float32 execution
- exact-zero canonicalization
- deferred common placement
- target extraction semantics
- Outside / Inside classification semantics
- Support target set
- coverage semantics
- route candidate generation semantics
- vertical / leaning / offset-bend route semantics
- route ordering / tie-breaking
- BODY collision semantics
- Rabbit forbidden-volume semantics
- spacing semantics / selection policy
- contactPolicy = `single-body`
- no internal removable-support rescue
- no remesh / decimation
- no hidden candidate-specific tuning
- Support physical settings
- 3MF exporter / validator semantics
- FKEI / authoring semantics
- A/G/H/J equal-condition contract
- winner selection

Also out of scope for v0:

- body-anchored removable Support
- Permanent Structure / Support convergence changes
- CUDA / WebGPU / native compute migration
- new approximate SDF / collision methods
- Bambu slicer Support optimization or replacement
- G/H/J execution
- merge / deploy

Bambu automatic Tree Support at 45 deg may remain a **separate physical timing / slicer observation**, but do not modify AB code to address it in this task.

## Exact parity gate

Before SOL review, the optimized full A2 run must preserve:

- source SHA
- geometry fingerprint
- diagnostics fingerprint
- Support fingerprint
- all canonical Support counts listed above
- exact graph node / edge result and deterministic graph serialization/fingerprint
- accepted BODY collision `0`
- accepted Rabbit collision `0`

If any canonical result changes, stop and return `REJECT / semantic drift`; do not reinterpret the change as a performance win.

Run focused regressions and build. Add performance-specific regression coverage only where it meaningfully prevents the optimized path from silently changing semantics.

## Performance evidence / success

Report before vs after on the same benchmark authority:

- total Full Sparse Support wall time
- hotspot-specific before/after timings
- relevant call / comparison counts
- machine / browser / runtime context
- exact parity result

This v0 should deliver a clearly measured improvement in the selected hotspot(s) and a corresponding full-A2 wall-time reduction. Do not chase an arbitrary target by expanding scope. If profiling shows no safe material improvement within one or two hotspots, stop with evidence rather than changing semantics.

Longer-term performance targets such as `<10 min`, multi-core parallelism, or CUDA/native acceleration belong to later tasks after this exact-parity CPU/browser baseline is understood.

## Done when

Return to Team AB / SKIN SOL only when:

- fixed A2 benchmark identity: PASS
- profiling identifies dominant hotspot(s)
- no more than 1–2 hotspot areas changed
- optimized full A2 Support completes
- exact semantic/fingerprint parity: PASS
- accepted BODY / Rabbit collision: `0 / 0`
- before/after timing evidence is recorded
- focused tests: PASS
- build: PASS
- Candidate / Support semantics / Rabbit / FKEI / exporter changed: NO
- G/H/J run: NO
- body-anchored Support implemented: NO
- merge / deploy: NO

Return the standard compact SOL review handoff.
