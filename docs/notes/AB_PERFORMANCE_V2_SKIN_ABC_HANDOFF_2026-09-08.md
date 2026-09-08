# AB Performance v2 -> SKIN_ABC_SOL handoff — 2026-09-08

## Status

Team AB Performance v2 is accepted / closed.

Accepted implementation checkpoint:

`87d5225a18dc7a1b8895cc44351db4c000be6261`

Branch:

`agent/skin-a2-sparse-support-performance-v2`

Base:

`2f0eb180fbe1ed0e9034ea2420628f4421f66d95`

Exact compare: 1 commit / 9 changed files / behind 0.

## What v2 added

The accepted optimization adds an optional exact capped signed-distance path for Candidate BODY queries and uses it only for non-terminal removable-Support BODY keep-out samples.

Core behavior:
- packed Candidate BVH remains the geometry authority for the active Candidate;
- capped magnitude is computed as an exact closest-surface distance bounded by a finite cap;
- ray-parity remains the sign authority;
- existing near-surface zero behavior remains unchanged;
- terminal/contact BODY checks remain on the legacy exact signed-distance path;
- the Support audit derives the non-terminal cap from `threshold + base interval length + finite guard` and keeps the existing one-Lipschitz fail-closed certification;
- profiling-only timing telemetry was added for Candidate closest/ray/signed/capped query costs.

This is an execution optimization, not a Support-placement architecture change.

## Validation / parity evidence

256-target bounded prefix:
- semantic digest: `bc6b941b...` unchanged
- Support: `581.8 ms -> 472.3 ms`
- BODY audit: `117.2 ms -> 57.1 ms`
- console: `0 / 0`
- focused tests / TypeScript / production build / diff-check: PASS

Canonical Full A2, one final run:
- A2 source SHA: `2030a945eb44fb3a263c667305f10ce8a773af5d8914cfca82d7c3f68680b04c`
- Rabbit SHA: `c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8`
- Rabbit repair fingerprint: `90258ce379e3b11aef7e6710ff98ff9f17678a53ae1c7905c3c967bd1e9437d6`
- Signed Volume: AVAILABLE
- targets: `4,561 / 4,561`
- route audits: `90,921`
- Support total: `201,166.9 ms` (~3m21s)
- BODY audit: `136,841.6 ms`
- Rabbit audit: `45,544.9 ms`
- Export: `24,891.1 ms`
- v1 Support baseline: `528,025.4 ms`
- v1 -> v2 improvement: ~61.9% / ~2.62x faster
- Geometry fingerprint: `ae244f2c...6520b9`
- Diagnostics fingerprint: `8db3d239...9696ba0`
- Support fingerprint: `83af4c78...027932`
- Export fingerprint: `850177f1...515fc`
- Validator: PASS
- package placement parity: PASS
- expected / actual Z: `48.029293060302734`
- generated/persisted archive byte length and SHA: exact match
- durable retention verification: PASS
- browser console: errors 0 / warnings 0

The COMPLETE Full-A2 record does not contain `boundedSemanticDigest` by design; the implementation generates it only for bounded profile execution. The prefix digest parity above is therefore the semantic-digest gate, while the Full run is gated by canonical counts plus geometry/diagnostics/Support/export fingerprints.

## Reuse candidate for SKIN

Do not treat AB's current Support placement as the future SKIN standard.

The smallest reusable compute capability to review is the lower-level geometry-query path:
- packed triangle BVH;
- exact closest-surface distance;
- ray-parity signed distance;
- exact capped signed distance for bounded keep-out proof;
- fail-closed one-Lipschitz collision certification;
- query telemetry / performance evidence;
- retention + fingerprint + parity gates around the computation.

Whether any of this should become a shared SKIN kernel is intentionally undecided. First compare semantics and measured bottlenecks in C / SKIN.

## Unresolved / HOLD

- No common kernel or code move has been authorized.
- No AB/C integration architecture has been authorized.
- G/H/J were not run in v2 and remain HOLD.
- Support placement was not changed.
- Outside-only body-anchored removable Support remains a future hypothesis only.
- Parallel / multi-core / CUDA / WebGPU / native acceleration remains separate future scope.
- The author/manual A2 physical-feasibility gate remains independent.

## Transition

Author-facing consultation moves to `SKIN_ABC_SOL` after this handoff.

Team AB must not auto-start another task from this closure. Any follow-up is to be scoped by `SKIN_ABC_SOL` (or another explicitly assigned lane) after reviewing current GitHub authority.
