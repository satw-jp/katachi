# TASK-E — SKIN sparse removable support v0.1

Date: 2026-08-31
Status: implemented as an experimental, fail-closed geometric screen

## Objective

Stage 8 Automatic generates only sparse external supports for Outside Overhang.
Stage 4 remains the sole Inside/Outside responsibility source; Stage 7 final-artwork
overhang triangles supply current target coordinates. Inside faces remain the
Permanent Web responsibility and never become removable-support targets.

## Design boundary

- Stage 4 class and region id are transferred, not recomputed. The nearest stored
  Stage 4 triangle is used only to attach those facts to a Stage 7 representative.
- Outside faces are grouped by the retained Stage 4 region id. The lowest printable
  start band is selected first, with at most three deterministic representatives per
  region. Greedy coverage is deliberately local; it is not global optimization.
- A vertical needle is attempted first. A bounded deterministic set of leaning plate
  roots is attempted only after vertical failure and only when explicit finite physical
  XY plate bounds are supplied. Every stored segment is <=45 degrees; there is no Y
  branching. The current workflow records the build-plate Z but no physical XY plate
  extents, so leaning routes are unavailable there; unknown bounds never grant proof.
- Accepted support is a separate graph/part. Its final contact neck is initially 0.6 mm
  diameter and its shaft uses the existing support diameter.
- BODY keep-out uses the authoritative finished smooth-min BODY SDF and radius-aware
  bounded adaptive subdivision. Non-finite values, non-1-Lipschitz fields, separated
  or wrong-terminal contacts, and proof-budget exhaustion fail closed. Target/remainder
  evaluators are attribution evidence only; they are not treated as an exact partition
  of the authoritative BODY field.
- Previously accepted support capsules are checked with exact segment-to-segment
  distance against `r1 + r2 + removalGap`. The initial 0.35 mm removal gap is a
  heuristic research setting, not a physical guarantee.

## Observations

The focused pure-module regression confirms Stage 4 Inside-derived support is zero,
489 dense faces collapse to a bounded target set, owner Patch ids transfer with the
responsibility facts, vertical routes win when clear, explicit bounds enable leaning
routes while absent bounds disable them, BODY and capsule-spacing collisions reject,
greedy coverage suppresses redundant routes, the neck is narrower than the shaft, and
identical input is deterministic. Sparse-path fixtures confirm non-terminal shaft
contact, wrong-owner terminal obstruction, two-ring3d smooth-min attribution,
non-Lipschitz target fields and plate-outside routes fail closed while legitimate owner
contact remains accepted. Existing model fixtures also confirm the adaptive collision
screen rejects a 0.09 to -0.4 jump over a 0.02 interval, hidden tangency and finite
subdivision-budget exhaustion.

The UI labels Automatic as `Sparse Automatic (experimental)`, reports Outside region
and critical-target counts, support/rejection counts and vertical/leaning counts, and
offers bounded yellow Critical Target / translucent-red Rejected Candidate markers.
Off continues to install BODY only with support nodes, edges and artifact count zero.

## Limitations / follow-up

The result proves only a finite route screen: continuity from the build plate, BODY/Web
clearance except an explicitly attributed contact, and support-to-support spacing. It
does not prove nipper or tool access, general enclosure/cavity removability, slicer
behavior, material strength, print success, or human removal. Stage 8 remains
experimental and `printApproval` remains false. Slicer, physical print, and Mac QA are
follow-up work. Print #001/#002 artifacts, FKEI schema/version, CUDA/shadow semantics,
and existing Stage 3/4/5B geometry remain out of scope.
