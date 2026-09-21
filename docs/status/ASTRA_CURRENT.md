# Astra Research Current Status

Last verified: 2026-09-21

## Authority

- repo: `satw-jp/katachi`; canonical branch: `main`.
- source main inspected for this documentation checkpoint: `9f6c607100c25cdfc780377002839726fde044b8`.
- stable Research/current routing: this file. Research keeps artwork geometry, generating principles and source evidence authority.
- retained Large R4 / D22.1 A1 fabrication lane: [R4_A1_FAB_CURRENT](R4_A1_FAB_CURRENT.md).
- current A1 mini PETG+PLA physical lane: [A1MINI_AMSLITE_PHYSICAL_CURRENT](A1MINI_AMSLITE_PHYSICAL_CURRENT.md).
- R5 Slice Runner execution infrastructure: [R5_SLICE_RUNNER_CURRENT](R5_SLICE_RUNNER_CURRENT.md).
- author-facing coordination: [SKIN_ABC_CURRENT](SKIN_ABC_CURRENT.md).
- [SKIN_R_CURRENT](SKIN_R_CURRENT.md) remains Reader-only; it is not R4 artwork or A1 fabrication authority.

## NOW / Current phase

**Current author-directed execution focus is the bounded A1 mini PETG+PLA physical lane, not new Artwork Research.**

PHYSICAL_01 actual-sent payload identity is COMPLETE from SD-card recovery and matches the V1-derived cached candidate. The Author intentionally stopped the upper region; quality is LOW, with visible stringing and surface roughness. PHYSICAL_01 is not a Runner smoke V0 physical result.

PHYSICAL_02 is a dry-only comparison using the exact locked PHYSICAL_01 payload. The only planned changed factor is PETG drying treatment. The Author reports Generic PETG dried at 70 C for 12 h. The prepared manual stop target is after layer 50 at Z9.9 mm and before layer 51 at Z10.1 mm. No PHYSICAL_02 result has been reported at this checkpoint.

R5 Slice Runner infrastructure is PASS/stopped: A1 single and A1 mini two-material real execution PASS; REPRO_AUDIT_01 final classification C — minor toolpath nondeterminism / fabrication semantics equivalent for the two compared runs.

The Large R4 / D22.1 lane remains separately retained under R4_A1_FAB_CURRENT. This update does not claim new D22.1 completion, rerun its slicer, or change its exact HOLD/blockers.

## Active implementation instruction

Research expansion: **NONE**.

Current physical task is owned by [A1MINI_AMSLITE_PHYSICAL_CURRENT](A1MINI_AMSLITE_PHYSICAL_CURRENT.md): execute/review the bounded PHYSICAL_02 dry-only test without changing geometry, Support, profile, G-code, slicer, or Runner. No software implementation is active.

Large R4 / D22.1 work remains owned by its separate CURRENT and must not be resumed from stale handoff text. Do not regenerate R4 from old GN/B1 assumptions, modify frozen flower/shape/composition, begin an independent R3 round, or translate into Production merely because a physical test exists.

## Next gate / protected scope

Active current gate: **PHYSICAL_02 DRY-ONLY AUTHOR PHYSICAL REVIEW**.

Before any next variable is changed, return:
- actual drying record;
- actual printer-side observations / deviations;
- actual stop layer/Z or UNKNOWN where not known;
- bed-on, removed-before-support-removal, and after-support-removal photos;
- comparison limited to the common lower region.

This bounded physical test does not reopen Artwork Research, Production, or generalization.

The retained Large R4 / D22.1 lane keeps its own Author gate and blockers under R4_A1_FAB_CURRENT. Do not merge its state with the A1 mini experiment.

## Required pointers

- [TEAM_PROTOCOL_CORE](../TEAM_PROTOCOL_CORE.md)
- [A1MINI_AMSLITE_PHYSICAL_CURRENT](A1MINI_AMSLITE_PHYSICAL_CURRENT.md)
- [R5_SLICE_RUNNER_CURRENT](R5_SLICE_RUNNER_CURRENT.md)
- [R4_A1_FAB_CURRENT](R4_A1_FAB_CURRENT.md), retained D22.1 task and named Playbook read set
- [Retained Author fabrication direction](../observations/AUTHOR_OBSERVATION_R4_A1_FABRICATION_2026-09-18.md)
- [Fabrication checkpoint evidence](../evidence/R4_A1_FAB_CHECKPOINT_2026-09-19.md)
- [SKIN_ABC_CURRENT](SKIN_ABC_CURRENT.md)

---

## Retained September13 research checkpoint — historical instructions, not the active task

The following preserves the prior CURRENT's source/reference evidence and scope. Its old "current", "active" and "next gate" wording applies to that checkpoint only; it must not override the active routing above or launch old geometry work.

### Historical authority

- repo: `satw-jp/katachi`
- branch: `main`
- stable Research current: `docs/status/ASTRA_CURRENT.md`
- active Author observation: `docs/observations/AUTHOR_OBSERVATION_R4_LARGE_MOCOMOCO_GN_2026-09-13.md`
- active bounded task: `docs/tasks/R4_LARGE_MOCOMOCO_GN_ARTWORK_GEOMETRY_GATE.md`
- Research geometry / physical artifact authority may remain in Drive when too large for GitHub, but this CURRENT owns the active scope / gate / supersession pointers.

`docs/status/SKIN_R_CURRENT.md` remains the Astra Reader lane and must not be used as the current authority for R4 Large Mocomoco artwork research.

### Historical phase

**ACTIVE FOCUS: R4 Large Mocomoco + Geometry Nodes — Artwork Geometry only.**

The current stop is:

**Intermediate Author Artwork Geometry Gate**

No Fabrication D1, removable Support, toolpath, print package, printing, or Production / SKIN translation is authorized before Author GO.

### Historical Author direction

- BaseShape reference: **R4 Mocomoco**;
- FLOWER reference: **R3 D BACKARC flower is the first candidate**;
- preserve the R3 D flower's three-dimensional character;
- do not enlarge FLOWER automatically when the Host becomes Large;
- keep flower physical scale broadly fixed and increase quantity / revise composition instead;
- Geometry Nodes must support direct petal-count comparison at **3 / 4 / 5 / 6**;
- evaluate **SHAPE at distance / FLOWER at close range**.

Old R4 / Large Mocomoco handoff assumptions that use B1 flower geometry as active flower authority are superseded for this restart.

### R3 D reference — frozen for R4 restart

Current first flower authority:

- revision: `D_BACK_ARC_REVISION`
- identity: R3 D / B motif 63 / 6 petals
- primary mesh: `motif_63_D_BACKARC.npz`
- Drive file id: `1PFsI4DFFbHq4d3UUVGpjEidCv9pspJV4`
- SHA-256: `ddb793d271fda8bd649676381b2deed48580f6192d84169a5032f99a81ca8c8f`
- representative blend: `representative_BACKARC_D.blend`
- Drive file id: `1lPB15FH_6r7tqJw5TCYpX4I9U3U54SFF`
- SHA-256: `30897e2c0bbae7919f388ba9a61010a30933a52dfdcce960bd8d44f9112d18de`
- geometry rule SHA-256: `b352cc890f5aaa225d108ca85f19409e1ec16398c35bc2218b4234f780d0a72f`
- unit: mm
- initial R4 physical flower scale: `1.0`

The R3 verification record confirms saved blend geometry matches generated geometry and uses mm units.

The reusable authority is the D BACKARC flower geometry / shape language, **not** the old B-world position / normal.

R4 must convert the reference into a documented local flower frame and place it on Mocomoco by rigid transform while preserving physical scale and front/back relief.

### Meaning of D character to preserve

The current D reference is not a flat petal outline.

It retains:

- six rounded outer petal ends;
- narrowing toward the center;
- front petal relief / valleys;
- one continuous rounded backside / back arc;
- finite physical thickness without a separate center sphere.

The 6-petal GN result is the reference case. 3 / 4 / 5 are `DERIVED` variants for Author comparison.

### Historical implementation instruction — do not execute as current

Owner: **R4 Astra**

Task: `docs/tasks/R4_LARGE_MOCOMOCO_GN_ARTWORK_GEOMETRY_GATE.md`

Before generating new geometry:

1. read latest main and this CURRENT;
2. re-hash the R4 BaseShape inputs and R3 D reference files actually used;
3. audit old R4 saved code / handoff assumptions;
4. classify old B1 flower references and Host-coupled flower scaling as `REPLACE` where present;
5. record `RETAIN / REPLACE / IGNORE` before executing saved generation code.

Allowed implementation scope:

- Large R4 BaseShape composition;
- R3 D-derived GN flower;
- petal count 3 / 4 / 5 / 6;
- flower physical scale / quantity / density / orientation as separable Artwork parameters;
- far / near / side / orbit review evidence;
- clean `.blend` and reproducibility / reference manifests.

Protected scope:

- no Fabrication D1;
- no removable Support / D2;
- no slicer / toolpath / G-code;
- no print-ready package;
- no printing;
- no Production / SKIN translation;
- no independent R3 next round;
- no generic flower-system expansion beyond this bounded R4 study.

Done when the Intermediate Author Artwork Geometry Gate package is ready and R4 stops for Author review.

### Relevant retained evidence

#### R2 physical evidence

B_PARTICIPATING was physically printed and provided evidence that a less conservative configuration can still retain much of the artwork. Author review identified visible surface-horizontal connection material as undesirable and established the stronger cross-shape principle:

> avoid structural flower-to-flower surface bars; prefer flower-back / root -> internal branch connection.

This principle is relevant to future R4 structure work, but structure / fabrication is **not** part of the current Artwork Geometry task.

#### R3 Flower evidence

R3 produced actual geometry comparisons and later D revisions. `D_BACK_ARC_REVISION` is now explicitly promoted by the Author as R4's first flower reference.

R3 must not expand independently during the R4 phase unless explicitly re-opened by the Author.

#### R4 prior evidence

R4 BaseShape source / transform evidence remains valid input where re-hash confirms it. Old R4 flower / branch / Support / placement-count outputs are historical Research evidence, not current authority for the new GN composition.

### Historical next gate

R4 presents:

- frozen R4 BaseShape identity;
- frozen R3 D flower identity / hashes;
- GN petal-count 3/4/5/6 comparison;
- proof that 6 petals preserves D BACKARC three-dimensional character;
- Large composition with flower physical scale decoupled from Host scale;
- far-view SHAPE evidence;
- near-view FLOWER evidence;
- review `.blend` and manifests.

Then STOP for:

**Intermediate Author Artwork Geometry Gate**

Only explicit Author GO may open the later Fabrication / Support / toolpath sequence.

### Historical required pointers

- `docs/TEAM_PROTOCOL_CORE.md`
- `docs/status/SKIN_ABC_CURRENT.md`
- `docs/status/SKIN_R_CURRENT.md` — Reader lane only
- `docs/observations/AUTHOR_OBSERVATION_R4_LARGE_MOCOMOCO_GN_2026-09-13.md`
- `docs/tasks/R4_LARGE_MOCOMOCO_GN_ARTWORK_GEOMETRY_GATE.md`
- `docs/observations/AUTHOR_OBSERVATION_SKIN_ARTWORK_FABRICATION_TOOLPATH_ARCHITECTURE_2026-09-08.md`
