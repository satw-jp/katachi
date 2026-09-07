# Team AB — A2 Sparse Support Performance v1

Date: 2026-09-07
Status: **CLOSED / PASS**
Owner: Team AB / SKIN SOL -> LUNA

## Accepted result

Performance v1 is accepted at:

- branch: `agent/skin-a2-sparse-support-performance-v1`
- commit: `a3c3dbdb76dc609cabded13e21ad9fbbd2c0bd29`
- parent reviewed checkpoint: `2964e66002a2b8faed5234769b5f03606fcd3f3b`
- accepted v0 baseline: `4929cc8e402f59faa7af5b6dfe86282fdb09d244`

The accepted optimization is an exact Rabbit closed-surface capped-distance query returning:

`min(exactUnsignedSurfaceDistance, cap)`

The capped query is used only inside the existing fail-closed Rabbit forbidden-volume certification. Rabbit signed SDF remains the inside/outside authority. No approximate distance, Support setting, route-order, sample-position, recursion-depth, threshold, FKEI, Candidate geometry, or Rabbit-policy change is accepted.

## Full A2 performance gate

Fixed A2 / Rabbit authority and current Support settings were preserved.

Accepted full-run evidence:

- Full Support: `4,561 / 4,561`
- accepted / unsupported: `654 / 3,907`
- accepted BODY / Rabbit collision: `0 / 0`
- Support total: `528,025.4 ms` (~`8m48s`)
- accepted v0 baseline: `2,232,690.1 ms` (~`37m13s`)
- improvement vs v0: `-76.35%`
- first v1 run: `2,431,968.6 ms`
- improvement vs first v1 run: `-78.29%`
- Rabbit audit: `40,846.3 ms`
- capped Rabbit unsigned: `8,492.8 ms / 17,736,590 calls`
- capped returns: `17,612,211`
- Signed Volume: AVAILABLE
- 3MF validator: PASS
- release / placement parity: PASS
- console errors / warnings: `0 / 0`

The requested A2 file path did not exist; the run used the SHA-256-identical canonical A2 body at `.../outputs/round-2/A2_BODY.stl`. Benchmark identity is therefore preserved by content hash; only the filesystem path differed.

## Exact parity gate

Retained COMPLETE evidence matched the prior accepted gate for:

- A2 source SHA-256
- Rabbit source SHA-256 / repair fingerprint / transform
- geometry fingerprint
- diagnostics fingerprint
- Support fingerprint
- export fingerprint
- bounded semantic digest
- canonical Support counts / graph result
- accepted BODY / Rabbit collision `0 / 0`
- placement / validator continuity

Reported retained fingerprint displays:

- geometry: `ae244f2c…520b9`
- diagnostics: `8db3d239…96ba0`
- Support: `83af4c78…7932`
- export: `850177f1…515fc`
- bounded semantic digest: `f97ac5f3…05bf5`

## Code review

Exact GitHub diff from `2964e660...` to `a3c3dbdb...` is one commit / seven files.

Accepted implementation properties:

- legacy Rabbit `closestSurface()` traversal restored, preventing attribution to the earlier non-winning reusable-stack experiment;
- new `closestSurfaceDistanceCapped()` is a separate exact API;
- deterministic tests verify `capped == min(full exact distance, cap)` across varied points/caps;
- Rabbit forbidden-volume continuity tests compare legacy / uncapped accelerated / capped decisions;
- deterministic randomized 512-segment suite preserves the legacy oracle;
- cap is derived from the existing forbidden threshold plus base interval length and numerical guard;
- invalid/non-finite capped results fail closed;
- telemetry records capped query calls / BVH work / cap returns.

## Validation

- focused tests: `37 / 37 PASS`
- both TypeScript checks: PASS
- production build: PASS
- `git diff --check`: PASS
- Full A2 parity/performance gate: PASS
- G/H/J: NOT RUN
- FKEI / Support settings / Candidate geometry / Rabbit policy: unchanged
- main / deploy: not modified by implementation worker

## P0 evidence retention

The copyable/localStorage COMPLETE-evidence retention introduced earlier in v1 remains **ACCEPTED** and should be preserved. It prevents future full-run fingerprint/evidence loss before Worker release.

## Superseded v1 experiment

Checkpoint `2964e660...` included a Rabbit reusable traversal-stack experiment. It preserved semantics but did not demonstrate a performance win and is not separately promoted. The accepted capped-distance commit restores the legacy full-distance traversal and isolates the new capped query.

## Closure

Performance v1 is **CLOSED / PASS** at `a3c3dbdb76dc609cabded13e21ad9fbbd2c0bd29`.

Any further performance work is a new bounded task. Multi-core / CUDA / WebGPU / native acceleration and any Support-architecture change remain outside this closed task.