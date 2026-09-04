# SKIN Support v2 Experimental — Footing / Bootstrap Stability v0

2026-09-04 · branch `agent/skin-support-v2-bootstrap-footing` (base:
`agent/skin-golden-support-physical-feedback-v1` @ f4f3114).
Output Scale branch @ 4c27f90 is a separate lineage and is NOT mixed in.
Print #2 candidate FROZEN, untouched. Merge: NO. Deploy: NO.
Production promotion: NO — awaits the Print #2 physical result.

## Physical evidence

Print #2 looks better than Print #1 overall, but supports fold early near
the plate, and trunks with a long free section fail before any later brace
can help. Root-to-first-stable-junction is an independent critical phase.

## What was built (all EXPERIMENTAL, session-only)

- NEW `src/studies/skin/rebuild/supportBootstrapFooting.ts` (pure, no DOM):
  per-trunk bootstrap metrics (root position/diameter/reinforced height,
  first stable junction height, bootstrap unbraced length, longest later
  unbraced length with terminal-neck exclusion, nearest root neighbor, first
  BODY contact height, brace/low-brace counts), EARLY-STABLE / MID /
  LONG-BOOTSTRAP classification (thresholds parameterized, defaults 8/18 mm
  mirroring the physical-feedback 18 mm ceiling), selective root thickening
  (lower section only + taper to normal, deterministic shrink ladder on BODY
  pressure, neighbor-fusion / plate / BODY safety), low diagonal braces
  (plate-near band, 45° initial candidate ceiling — not a production rule),
  A/B/C/D comparison with the 10 required metrics, synthetic vertical stress
  fixture, presentation-only debug scene facts, fingerprint helper.
- NEW viewer `support-bootstrap-footing.html` +
  `supportBootstrapFootingViewer.ts` (vite input added): A/B/C/D mode
  buttons, orbit/zoom, per-mode metrics + comparison table. Mode switching
  only toggles precomputed meshes (geometry mutation 0). No export, no FKEI,
  no production wiring; print preview path untouched (main.ts, renderer.ts,
  model.ts, fkei.ts, printScalePolicy.ts unchanged).
- NEW `supportBootstrapFooting.test.ts`: focused checks 1–10, wired into
  `test:skin-rebuild`.

## A/B/C/D results (synthetic fixture, scale 1 unit = 1 mm)

| metric | A current | B root | C brace | D combined |
|---|---|---|---|---|
| max bootstrap | 29.0 | 29.0 | 29.0 | 29.0 |
| mean bootstrap | 21.0 | 21.0 | 10.6 | 10.6 |
| long-bootstrap # | 3 | 3 | 1 | 1 |
| mean 1st junction | 21.0 | 21.0 | 10.6 | 10.6 |
| roots reinforced | 0 | 4 | 0 | 4 |
| low braces | 0 | 0 | 1 (43.6°) | 1 (43.6°) |
| extra volume mm³ | 0 | 148.8 | 11.7 | 160.4 |
| BODY collision (accepted) | 0 | 0 | 0 | 0 |
| components | 5 | 5 | 4 | 4 |
| removal-risk adjacency | 0 | 0 | 0 | 0 |

Reading: thickening alone strengthens 4 roots without shortening spans;
one 43.6° low brace pairs the two long neighbors and resolves 2 of 3
long-bootstraps at ~12 mm³; combined costs ~160 mm³ with zero accepted
collisions and zero residual fusion risk.

## Verification

- Focused tests 1–10: PASS (short→none, isolated-long→thickening,
  paired-long→brace, wall→brace-reject, blob→shrink then reject,
  intentional junction allowed, close roots→fusion reject, taper
  finite/monotone/deterministic, determinism fingerprint, current mode
  byte-identical topology).
- Existing: supportPhysicalFeedback, sparseRemovableSupport, export parity,
  3MF validation, Permanent Reinforcement, artifactExport, printScalePolicy,
  model, fkei, View Layers: PASS.
- `tsc -b`, `typecheck:partition-test`, `build`, `diff --check`: PASS.
- Golden offset-bend: ENV BLOCKED on macOS (Windows-only fixture path —
  pre-existing, same ENOENT on base).
- Browser gate: `vite preview` serves the viewer (200); interactive
  real-coordinate click + console-0 on the author's machine: WAITING
  (no browser in this environment).

## Deliberately NOT done (STOP)

No Print #2 regeneration, no BODY / Permanent Graph / Reinforcement change,
no Output Scale mixing, no branched support, no DryWeb, no FKEI schema, no
FAB, no merge, no deploy. Classification thresholds are NOT goldenized
pending the Print #2 physical result.

## FOLLOW-UP

- Author browser gate on the viewer (footing only near plate, no upper
  brace growth, collision 0, no accidental fusion, console 0).
- Feed the real Print #2 result back as evidence; then decide thresholds
  and whether any candidate graduates toward production.
- Future shared-trunk / branched support can reuse the bootstrap metrics.
