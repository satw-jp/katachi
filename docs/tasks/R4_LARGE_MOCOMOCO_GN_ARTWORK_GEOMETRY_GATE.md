# R4 Large Mocomoco + Geometry Nodes — Artwork Geometry Gate

Date: 2026-09-13
Owner: Research SOL
Implementation owner: R4 Astra
Status: READY TO START AFTER SOURCE FREEZE CHECK

## Goal

Restart R4 as a bounded **Large Mocomoco + Geometry Nodes Artwork Geometry study**.

The task is to establish a reviewable Large Mocomoco composition in which:

- the R4 BaseShape remains the SHAPE authority;
- the R3 D BACKARC flower is the first FLOWER authority;
- flower physical size is decoupled from Host enlargement;
- Geometry Nodes can compare 3 / 4 / 5 / 6 petals;
- the composition supports `SHAPE at distance / FLOWER at close range`;
- the task stops at **Intermediate Author Artwork Geometry Gate**.

No fabrication or print work is authorized by this task.

## Read first

- `docs/TEAM_PROTOCOL_CORE.md`
- `docs/status/ASTRA_CURRENT.md`
- `docs/observations/AUTHOR_OBSERVATION_R4_LARGE_MOCOMOCO_GN_2026-09-13.md`
- latest R4 BaseShape source / freeze evidence in Drive
- R3 `D_BACK_ARC_REVISION` README / rule / verification

Old Large Mocomoco handoff files are historical inputs only where they do not conflict with the current Author observation.

## Mandatory source freeze before generation

Before modifying or generating R4 Artwork Geometry, write a local Research reference manifest that records:

### BaseShape

Use the accepted R4 Mocomoco BaseShape source / transform evidence.

Do not inherit R4's old flower, internal members, Support, or old placement counts merely because they coexist in an older package.

### Flower

Current first authority:

- revision: `R3 D_BACK_ARC_REVISION`
- identity: `motif 63 / D BACKARC / 6 petals`
- geometry file: `motif_63_D_BACKARC.npz`
- Drive file id: `1PFsI4DFFbHq4d3UUVGpjEidCv9pspJV4`
- SHA-256: `ddb793d271fda8bd649676381b2deed48580f6192d84169a5032f99a81ca8c8f`
- review blend: `representative_BACKARC_D.blend`
- Drive file id: `1lPB15FH_6r7tqJw5TCYpX4I9U3U54SFF`
- SHA-256: `30897e2c0bbae7919f388ba9a61010a30933a52dfdcce960bd8d44f9112d18de`
- geometry rule SHA-256: `b352cc890f5aaa225d108ca85f19409e1ec16398c35bc2218b4234f780d0a72f`
- units: mm
- initial R4 flower physical scale: `1.0`

Record the exact resolved Drive/local paths used at execution time and re-hash them.

If these hashes do not match, STOP and report rather than silently using a newer or older D variant.

## Reference interpretation

The reusable flower is the **shape language and physical geometry**, not its old B-world placement.

Create or document a canonical local flower frame from the R3 D reference so R4 can place the unit by rigid transform on Mocomoco.

Preserve:

- rounded petal ends;
- narrowing toward the flower center;
- front-side petal relief;
- the continuous rounded backside / back-arc;
- the physical front/back depth relation.

Do not reduce D to a flat 2D outline or uniform extrusion.

## Geometry Nodes scope

Implement a bounded GN authoring/research setup sufficient for Author comparison.

Minimum controls:

- `Petal Count`: **3 / 4 / 5 / 6**;
- flower physical scale;
- placement density / count;
- orientation / rotation variation only where it does not destroy comparison;
- Host / composition controls needed for Large Mocomoco placement.

The first comparison must isolate petal count:

- same default physical envelope / scale;
- same material / lighting / camera;
- no simultaneous automatic flower enlargement;
- 6-petal result should remain visibly faithful to R3 D BACKARC;
- 3/4/5 are clearly labeled `DERIVED` study variants.

If the GN implementation cannot preserve D's three-dimensional character for a petal count, show the limitation rather than compensating by flattening or arbitrary smoothing.

## Large scale / quantity rule

Do not couple flower scale to Host scale.

The first Large direction is:

`R4 BaseShape enlarged -> flower physical scale broadly held -> flower quantity / distribution increased`

Keep Host scale, flower scale, flower count, and petal count separable.

Do not automatically reuse old R4 counts such as 432 or old B1 placement counts as current authority.

## Composition review

Produce evidence for two reading distances.

### Far / SHAPE

Show whether the Large Mocomoco silhouette / mass remains primary.

### Near / FLOWER

Show whether individual D-derived flowers, petal relief, gaps, orientation, and local surface rhythm become worth approaching.

At minimum save:

- far front / oblique / reverse;
- near flower detail views;
- side / grazing views that reveal D's front/back relief;
- petal-count `3 / 4 / 5 / 6` comparison under identical conditions;
- surface distribution overview;
- one orbit or equivalent multi-view evidence;
- a clean `.blend` containing the GN setup and frozen reference pointers;
- parameter / reference manifest with hashes and units.

Do not treat a visually dense close-up as success if the far SHAPE disappears.

## Artwork boundary

This task is Artwork Geometry only.

Allowed:

- R4 BaseShape use / Large composition;
- R3 D reference reconstruction for GN;
- petal-count study;
- flower count / density / orientation composition;
- bounded display / render setup for Author review;
- reference manifest / reproducibility records.

Not allowed:

- Fabrication D1;
- removable Support / D2;
- slicer work;
- toolpath / G-code;
- print-ready 3MF;
- printing;
- Production / SKIN translation;
- generic flower-system expansion beyond this bounded R4 study;
- independent R3 next-round expansion.

## Old handoff / code audit

Before running saved R4 scripts or GN assets, inspect them for old assumptions.

At minimum report:

- old B1 flower geometry references;
- flower scale coupled to Host scale;
- old fixed counts / placement rules;
- old R4 surface/internal geometry assumptions not authorized now.

Classify each as:

- `RETAIN` — still valid BaseShape / neutral infrastructure;
- `REPLACE` — superseded by R3 D / current scale rule;
- `IGNORE` — historical or out of scope.

Do not execute a saved generator unchanged until this audit is written.

## R3 boundary

R3 may be consulted only to verify / export the chosen D BACKARC reference for R4.

Do not start a new R3 flower-family study, new physical round, or unrelated variant generation under this task.

## Acceptance / STOP

R4 returns for Author review when:

1. BaseShape and R3 D source identities / hashes are fixed;
2. old B1 flower assumptions have been audited and replaced where necessary;
3. GN can compare 3 / 4 / 5 / 6 petals;
4. 6 petals visibly preserves the R3 D BACKARC three-dimensional character;
5. Large composition keeps flower physical scale decoupled from Host scale;
6. far SHAPE / near FLOWER evidence is prepared;
7. `.blend`, parameter manifest, reference manifest, and review renders are saved;
8. no fabrication / Support / toolpath / print data has been created.

Then STOP at:

**Intermediate Author Artwork Geometry Gate**

Do not proceed further without explicit Author GO.
