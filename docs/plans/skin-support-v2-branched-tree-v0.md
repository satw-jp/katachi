# SKIN Support v2 Experimental — Shared Trunk / Branched Tree v0

2026-09-04 · branch `agent/skin-support-v2-branched-tree` (base:
`agent/skin-support-v2-bootstrap-footing` @ 0055612, reusing bootstrap /
junction / low-brace / safety analysis).
Output Scale branch @ 4c27f90 NOT mixed in. Print #2 FROZEN, untouched.
Merge: NO. Deploy: NO. Production adoption: NO.

## Idea

From "1 target = 1 trunk" toward temporary networks: where several targets
can safely share one lower path, build `targets -> branches -> shared
trunk -> plate`. Shared Trunk != Crown (contacts just below BODY) and !=
Mutual Brace (side connection of independent trunks). Shared-only mode
keeps true TREEs (no cycles); cycles only possible with composed braces.

## Built (all EXPERIMENTAL, session-only, pure + deterministic)

- NEW `supportBranchedTree.ts`: individual-route baseline (existing
  offset-bend routing kept, never mutated), shared-corridor scoring (lower
  proximity, overlap, root spread, divergence, saved material — target
  proximity alone never shares), shared trunk + finite deterministic branch
  junctions reusing upper route portions, failure-domain records with
  critical caps (defaults max 4 targets / 2 critical — comparison params,
  not production rules), trunk diameter = current support diameter
  (multiplier contract default 1.0, unconnected), branch-angle metrics (60°
  guideline, not absolute), interference accounting (indep conflicts /
  resolved / rejected / new), footing bootstrap metrics reused per tree,
  provenance records (no FKEI writes), A/B/C comparison. Root thickening
  excluded from comparison (isolated fallback only).
- NEW viewer `skin-support-v2-branched-tree.html` (+vite input):
  Independent / Shared / Shared+LowDiagonal modes; toggles for Roots,
  Shared Trunks, Junctions, Child Branches, Targets, Rejected Shares,
  Collision Rejects, Provenance. Diagnostic colors; print preview untouched
  (main.ts, renderer.ts, model.ts, fkei.ts unchanged).
- NEW `supportBranchedTree.test.ts`: focused checks 1–14, in the
  `test:skin-rebuild` chain.

## A/B/C results (synthetic fixture, 5 targets, 1 critical)

INDEPENDENT: targets 5/5/0/1 · trunks 5 · bootstrap max 36.8 / mean 27.8 ·
long 4 · length 143.8 / vol 281.6 · conflicts 1 · failure domain 1/1.
SHARED: 1 tree {a+b} + 3 solos · junctions 1 · branches 2 (max 10.6°) ·
bootstrap max/mean 11.6 (trunk-level) · resolved 1 / new 0 · rejected 1
(angle 72° for the divergent pair) · length −8.0% · safety all 0 ·
failure domain 2/0 · provenance complete.
SHARED + LOW DIAGONAL: same trees (single tree ⇒ no brace pair available);
braces compose as evidence, bootstrap never worsens; Print #2 untouched.
Safety: BODY 0 / plate 0 / fusion 0 (rejects recorded, never forced) /
NaN 0 / zero 0 / dup 0. Removal: complexity 3, loops 0, risk adjacency 0.

## Verification

- Focused 1–14: PASS (incl. no-cycle, diameter==current, provenance
  completeness, determinism, baseline identity).
- Existing: supportPhysicalFeedback, bootstrapFooting, sparse, Permanent
  Reinforcement, parity, 3MF, View Layers: PASS. Golden offset-bend: ENV
  BLOCKED on macOS (pre-existing Windows fixture path).
- `tsc -b`, `typecheck:partition-test`, `build`, `diff --check`: PASS.
- Browser gate: preview serves viewer + rebuild (200 each); interactive
  real-coordinate gate A–I on the author's machine: WAITING (no browser
  in this environment).

## Deliberately NOT done

Print #2 / BODY / Permanent Graph / Reinforcement / DryWeb / FKEI schema /
Rebuild migration / Graph→Shape / FAB / Output Scale merge / main merge /
deploy. Author Organic Fixture geometry is NOT generated here — a later
stage applies the same analysis to author-made organic shapes. Permanent
Web receives principles only, no algorithm copy.

## FOLLOW-UP

- Author browser gate A–I + console 0 on the viewer.
- Feed the Print #2 physical result back; decide caps/thresholds and
  whether any candidate graduates.
- Removable = temporary aid vs Permanent Web = artwork: separation kept.
