# Team AB — A2 Sparse Support Performance v2

Date: 2026-09-08
Owner: Team AB / SKIN SOL -> LUNA
Status: CLOSED / PASS / ACCEPTED

## Accepted authority

- repo: `satw-jp/katachi`
- base: `2f0eb180fbe1ed0e9034ea2420628f4421f66d95`
- branch: `agent/skin-a2-sparse-support-performance-v2`
- accepted implementation checkpoint: `87d5225a18dc7a1b8895cc44351db4c000be6261`
- remote HEAD: `87d5225a18dc7a1b8895cc44351db4c000be6261`
- exact compare from base: 1 commit / 9 changed files / behind 0
- J worktree used by implementation: `J:\dev\worktrees\skin-a2-sparse-support-performance-v2`

The original detailed execution spec is preserved in Git history; its pre-closure blob was:

`5a6409ff56a3369eef3e54d5ea2a6377351cdf3b`

This closure does not alter that original scope retroactively.

## Purpose — achieved

Reduce accepted Full A2 Sparse Support runtime below Performance v1 `528,025.4 ms` (~8m48s) without changing Candidate / Support / Rabbit / FKEI / export / retention semantics.

Performance v2 remained a bounded single-thread CPU/browser optimization. It did not authorize or introduce parallel/native/GPU work, new Support routing, AB/C integration architecture, or a shared kernel.

## Accepted implementation

The accepted v2 change adds an optional exact capped signed-distance execution path for Candidate BODY queries and uses it only for non-terminal removable-Support BODY keep-out samples.

Accepted behavior:
- packed Candidate triangle BVH remains geometry authority;
- closest-surface magnitude is clipped only to a finite cap;
- ray-parity remains the sign authority;
- existing near-surface zero behavior remains unchanged;
- terminal/contact BODY checks remain on the legacy exact signed-distance path;
- non-terminal cap is derived from `threshold + base interval length + finite guard`;
- existing one-Lipschitz fail-closed collision certification remains the decision framework;
- optional Candidate query timing telemetry was added for bounded profiling only.

The optimization changes execution cost, not Support placement semantics.

## Fixed benchmark identities

A2 source SHA-256:

`2030a945eb44fb3a263c667305f10ce8a773af5d8914cfca82d7c3f68680b04c`

Rabbit source SHA-256:

`c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8`

Rabbit repair fingerprint:

`90258ce379e3b11aef7e6710ff98ff9f17678a53ae1c7905c3c967bd1e9437d6`

Signed Volume: AVAILABLE.

## Prefix gate — PASS

256-target bounded prefix:
- semantic digest: `bc6b941b...` unchanged
- Support: `581.8 ms -> 472.3 ms`
- BODY audit: `117.2 ms -> 57.1 ms`
- console: errors 0 / warnings 0
- focused tests / TypeScript checks / production build / `git diff --check`: PASS

The bounded prefix established semantic digest parity before the single final Full A2 run.

## Final Full A2 gate — PASS

Exactly one final canonical Full A2 was executed.

Performance:
- targets: `4,561 / 4,561`
- route audits: `90,921`
- Support total: `201,166.9 ms` (~3m21s)
- BODY audit: `136,841.6 ms`
- Rabbit audit: `45,544.9 ms`
- Export: `24,891.1 ms`
- Performance v1 baseline: `528,025.4 ms`
- v1 -> v2 improvement: ~61.9% / ~2.62x faster

Canonical semantic result remained unchanged:
- route candidates / audits: `102,193 / 90,921`
- accepted / unsupported: `654 / 3,907`
- vertical / offset-bend: `466 / 188`
- BODY / Rabbit rejects: `3,257 / 1,502`
- graph nodes / edges: `2,150 / 1,496`
- accepted BODY / Rabbit collision: `0 / 0`

Fingerprints:
- Geometry: `ae244f2c...6520b9`
- Diagnostics: `8db3d239...9696ba0`
- Support: `83af4c78...027932`
- Export: `850177f1...515fc`

`boundedSemanticDigest` is intentionally generated only for bounded profile execution in the current implementation. Its absence from COMPLETE Full-A2 evidence is therefore not a new semantic gap; the prefix digest parity above is the bounded semantic-digest gate, while Full A2 is gated by canonical counts and complete geometry / diagnostics / Support / export fingerprints.

## Validator / retention — PASS

- Validator: PASS
- package placement parity: PASS
- expected / actual Z: `48.029293060302734`
- archive: `ASTRA_A_candidate-print-lane.3mf`
- archive size: `75,491,879` bytes
- generated / persisted SHA: `c72a8358...f3690a`
- exact persisted byte length match: PASS
- exact generated/persisted SHA match: PASS
- durable verification: PASS
- browser console during canonical run: errors 0 / warnings 0

The app display retained one earlier fail-closed telemetry error from an attempted action before Rabbit was loaded; the canonical Full A2 run itself added no browser-console error.

## SOL exact diff review — PASS

SOL reviewed exact GitHub compare:

`2f0eb180fbe1ed0e9034ea2420628f4421f66d95 -> 87d5225a18dc7a1b8895cc44351db4c000be6261`

Changed files only:
- `package.json`
- `src/studies/skin/astraCandidatePrintLaneLab.ts`
- `src/studies/skin/astraLargeCandidate.worker.ts`
- `src/studies/skin/astraLargeCandidateWorkerProtocol.ts`
- `src/studies/skin/astraPackedCandidateQuery.test.ts`
- `src/studies/skin/astraPackedCandidateQuery.ts`
- `src/studies/skin/rebuild/sparseRemovableSupport.test.ts`
- `src/studies/skin/rebuild/sparseRemovableSupport.ts`
- `tsconfig.test.json`

Review conclusion:
- diff matches the measured bounded exact BODY optimization;
- no Candidate geometry change;
- no Rabbit policy change;
- no Support target / route generation / ordering / tie-breaking / sample / spacing / coverage change;
- no terminal/contact relaxation;
- no FKEI / export / retention semantic change;
- no G/H/J execution;
- no parallel/native/GPU work;
- no new Support architecture.

## Out of scope / unresolved remains HOLD

- G/H/J execution / winner selection
- AB/C integration architecture
- common geometry kernel or code movement
- body-anchored removable Support
- Permanent Structure / Support convergence
- parallel / multi-core route-audit architecture
- CUDA / WebGPU / native migration
- approximate SDF / collision / sign methods
- remesh / decimation
- deploy

The author/manual A2 physical-feasibility gate remains independent.

## Transition / done

Performance v2 is formally PASS / ACCEPT / CLOSED.

Handoff:

`docs/notes/AB_PERFORMANCE_V2_SKIN_ABC_HANDOFF_2026-09-08.md`

After this closure Team AB must STOP and must not auto-start another AB task. Any reuse review or follow-up scope belongs to `SKIN_ABC_SOL` or another explicitly assigned lane.
