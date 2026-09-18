# Toolpath Audit Rules

Version: 0.1 — required review contract; not a claim of a validated universal auditor.
Recorded: 2026-09-19. Owner: Fabrication SOL.

## Evidence and applicability

Basis: the [retained Author fabrication instruction](../observations/AUTHOR_OBSERVATION_R4_A1_FABRICATION_2026-09-18.md), the [D22 candidate package](https://drive.google.com/drive/folders/18OFPljQSyPZCROmhuZB99M1IzTl_ggP1) and the [D22 recovery verification](https://drive.google.com/file/d/1p5mZA-qyWS5wjYqUAdShSgMD9Vxs5G_2/view).

The retained work contains a recovered-print problem-band screen and full D22 **integrity** verification. It does not establish a completed D22.1 all-layer chronological/supportability audit. The rules below specify what must be recorded and reviewed; implementation or fixture PASS must never be promoted into full-candidate or physical PASS without matching evidence.

## AUD-01 — Bind the audit to its exact subject

Record candidate ID, complete G-code SHA-256, source geometry/profile/engine identity, units/plate frame, auditor version or code hash, rule version and all tolerances. Check [runbook integrity requirements](A1_BAMBU_CLI_RUNBOOK.md#run-06--stream-archive-and-verify) first.

An audit of a recovered prior print, D22, a small diagnostic cube or a partial Z band cannot be labeled an audit of final D22.1. Identical filenames do not establish identical subjects.

Declare which G-code semantics the parser handles. Positioning/extrusion modes, resets, retractions, layer changes and curved moves must not silently become invented straight extrusion or new material. Unsupported executable semantics that affect a finding make that coverage **UNVERIFIED**, not PASS. This is an implementation requirement, not an assertion that the retained scripts already implement every case.

## AUD-02 — State coverage before conclusions

For a claimed all-layer audit, record total input layers, layers actually processed, first/last layer and Z, parse errors, skipped/truncated ranges and completion status. Show partial work explicitly; a loop starting at layer 1 is not completion evidence.

Each required check must return a result and its scope: supported finding, risk/flag, unverified, or not applicable with reason. Any missing required check keeps the package gate HOLD. A successful process exit, nonempty report, fixture suite or three preview images is not proof of full coverage.

## AUD-03 — Chronological birth and previous support

Distinguish **static final connectivity** from the support available **when material is deposited**. Later paths cannot retrospectively support an earlier birth. A union of all paths on the same layer alone is not proof of deposition-order supportability.

For each new island/start candidate, retain layer, Z, path/line interval, XY location, extrusion order, geometry-role correspondence where supported, and the earlier receiving material/bed/bridge-anchor evidence used by the classification. Report unknown correspondence instead of guessing a source member ID.

Check previous-layer overlap using the stated deposited-path footprint, width assumptions, tolerances and relevant frame. Separate no receiving surface, partial overlap, a potential bridge with anchors, and parser/geometry uncertainty. Positive geometric intersection elsewhere in the final model is not a substitute for an earlier receiving surface.

A band-only analysis that marks its first layer rooted for context cannot prove a bed-rooted history. For full chronological claims, trace from the actual start/bed or establish and document the missing predecessor state.

## AUD-04 — Unsupported spans and slicer classes

Review contiguous unsupported extrusion/span length, local anchors, path endpoints, prior-layer receiving area, thin isolated members and extrusion continuity. Preserve exact coordinates/line ranges for review rather than reporting only totals.

Keep slicer labels and audit conclusions separate. `Gap infill`, `Overhang wall`, `Bridge` and `Sparse infill` are recorded engine classifications, not physical certificates. A long Gap infill path may deserve review; a Bridge label alone does not prove supported endpoints or successful physical bridging.

For flagged paths, record commanded speed, acceleration and extrusion information with the layer/order context. Commanded settings are not measurements of actual machine behavior, especially after manual speed-mode changes.

## AUD-05 — Local growth, collision and failure-band review

Review local layer-to-layer growth, unsupported starts, long wall/gap/bridge paths and thin isolated features. Whole-layer area changes alone can conceal a local receiving-surface problem.

Separate a path-level nozzle-collision risk screen from a validated machine-envelope/collision model and from an observed collision. Declare what was modeled, and leave unmodeled mechanical effects unverified.

A case-specific physical investigation band is a priority within the full audit, not a replacement for it. Failure-Z authority is ruler/calibrated physical evidence + actual geometry height + G-code layer/Z correspondence. **Do not infer physical failure Z from wall-clock, predicted duration or M73** when actual execution timing is not established. For the retained R4 print, the Author changed speed mode overnight.

## AUD-06 — Retain screening limits and warnings

The historical recovered-print band screen used a 0.2 mm grid and width/tolerance assumptions, with an artificial rooted start at the analyzed band boundary. These can miss small gaps. Historical thresholds such as a 2 mm screening run are not universal safe/unsafe print limits. Retain the original `audit/recovered_band/` records and scripts for exact assumptions; do not reuse thresholds without declaring their case scope.

Native floating-region warnings must remain visible until localized and assessed against the final candidate. Warning text suggesting reorientation or automatic Support is not authorization to alter frozen artwork or Support policy.

Record source vs native triangle counts, any import/repair/transformation evidence and its limitations separately from source-file hash preservation. An unexplained discrepancy cannot be dismissed as harmless merely because it is numerically small. After an authorized mesh subdivision, establish the new source count; do not copy the old candidate's expected count.

## AUD-07 — Findings, gate and minimal response

An auditable report must include its input identity, coverage, method/tolerances, per-check state, localized findings, representative evidence, false-positive/false-negative limits and unresolved risks. Compare prior and current candidates only with separately identified inputs and methods.

Do not label counts of flags as counts of physical failures. Do not claim a unique physical cause from photographs or software geometry alone. Positive four-contact intersections do not establish removal strength, absence of unintended fusion, extrusion-order support, or whole-print viability.

For a risk requiring change, identify the earliest supported failing start/path and propose the smallest cause-matched correction. Do not automatically thicken/densify/reorient/add global Support, alter FLOWER, or lower all speeds. Changes outside the active task require a new bounded Author/SOL decision.

Return to **AUTHOR A1 PRINT PACKAGE GATE** with independent integrity, audit, physical and Author states. An unresolved required check is HOLD. A completed software audit still does not grant printing, artistic ACCEPT or Production/generalization.

## Durable use

CURRENT links to this file rather than copying its rules. Each actual audit records this rule revision and the executed auditor identity. Changes to parser assumptions, tolerances or coverage claims require their own evidence; retain failures as well as passes. Rules may be documented before they are implemented, but implementation/proof status must remain explicit.
