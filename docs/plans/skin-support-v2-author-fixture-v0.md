# SKIN Support v2 Experimental — Multi-Fixture / Author Organic Fixture Intake v0

2026-09-04 · branch `agent/skin-support-v2-author-fixture-v0` (base:
`agent/skin-support-v2-branched-tree` @ 7adb9f2).
Output Scale @ 4c27f90 NOT mixed in. Print #2 FROZEN, untouched.
Merge: NO. Deploy: NO. Production adoption: NO.

## Why

The synthetic fixture is vertical-heavy by construction — a good stress
test for trunks, bootstrap, footing, braces and collisions — so it stays
as the regression fixture. Author work will be asymmetric, diagonal,
organic and cavity-rich, and Support v2 must prove it is not overfit to
synthetic verticals. Synthetic PASS + Author PASS is the future bar.

## Built (all EXPERIMENTAL, development-only)

- NEW `supportExperimentFixture.ts`: portable fixture contract
  (`katachi.support-experiment-fixture.v1`, distinct from FKEI which is
  unchanged), fail-closed validation (finite, ids, duplicates, segment
  refs, physical values, BODY evidence, schema version), serialize/parse
  round-trip, exact unsigned triangle-soup SDF (brute force within a 5000-
  triangle import cap; multi-component soup audited by proximity, never
  auto-invalidated), synthetic adapter, pure capture adapter (fresh
  validated copy; input never mutated; no production wiring), Synthetic +
  1-Author registry (invalid loads preserve state), one shared three-mode
  path for both kinds (no per-fixture branching), cross-fixture metrics +
  observation-only organic warnings (no auto-FAIL).
- Scale honesty: unknown stays null through every round-trip; imports never
  rescale (coordinates verbatim); analysis takes an explicit scale and the
  viewer records the assumption in provenance when physical is unknown.
- NEW viewer `skin-support-v2-fixture-lab.html` (+vite input): Synthetic /
  Author switch, [Load Author Fixture] local file input, NOT LOADED empty
  state (never an error, never a synthesized fallback), download-synthetic
  capture utility, modes × 10 view toggles, metrics / provenance /
  cross-fixture / warnings panels. Print preview, main.ts, renderer.ts,
  model.ts, fkei.ts untouched.
- NEW `supportExperimentFixture.test.ts`: focused checks 1–15, in the
  `test:skin-rebuild` chain. Unit irregular data is labeled TEST FIXTURE;
  no author geometry was generated anywhere (no procedural sample exists).

## Verification

- Synthetic parity: adapter output byte-identical to the direct 7adb9f2
  baseline (indep 5/5/0/1, boot max 36.8 mean 27.76, conflicts 1; shared
  1 tree, 1 junction, 2 branches, 10.62°, resolved 1, new 0, −8.0%).
- Focused 1–15: PASS. Existing (physicalFeedback, footing, branched,
  sparse, offset-bend→ENV, reinforcement, parity, 3MF, views, fkei,
  model, printScale): PASS. `tsc -b`, partition typecheck, build,
  diff check: PASS.
- Browser gate: preview serves the lab (200), strings in bundle;
  interactive A–J on the author's machine: WAITING (no browser here).
- Golden project mutation: 0 (additive files + test chain + vite input +
  docs only). FKEI schema: unchanged (pinned by test).

## Deliberately NOT done

Golden Stage 8 changes, Output Scale merge, production adoption of any
candidate, BODY/Permanent/DryWeb changes, FKEI schema, author geometry
generation, organic fixture synthesis of any kind, deploy, main merge.

## Waiting on

1. Print #2 physical result. 2. An actual Author Organic Fixture file
supplied by the author (the intake slot is ready and empty).
