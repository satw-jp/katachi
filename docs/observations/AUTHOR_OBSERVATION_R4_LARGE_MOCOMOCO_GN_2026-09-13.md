# Author Observation — R4 Large Mocomoco + Geometry Nodes

Date: 2026-09-13
Owner: Author / Research SOL
Status: AUTHOR DIRECTION — ACTIVE RESEARCH AUTHORITY

## Current direction

The active Research focus is now **R4 Large Mocomoco + Geometry Nodes**.

Current Author direction:

- BaseShape reference: **R4 Mocomoco**;
- flower reference: **R3 D flower is the first candidate**;
- preserve the R3 D flower's three-dimensional character rather than flattening it into a 2D silhouette;
- during Large scaling, do **not** enlarge the flower automatically with the Host;
- keep the flower's physical unit scale broadly fixed and increase quantity / composition density as the Host becomes larger;
- in Geometry Nodes, petal count must be directly comparable at **3 / 4 / 5 / 6**;
- evaluate the composition so **SHAPE reads at distance and FLOWER reads at close range**.

This observation supersedes old R4 / Large Mocomoco handoff assumptions that used B1 flower geometry as the active flower authority. It does **not** discard the R4 BaseShape source / freeze.

## R3 D flower reference freeze

For R4 restart, the first flower reference is fixed to the latest R3 D geometry family:

**Version / identity**
- study: `R3_Astra — HOST B flower actual geometry`
- revision: `D_BACK_ARC_REVISION`
- reference identity: representative **B motif 63 / D BACKARC / 6 petals**
- intended character: rounded outer petal ends, narrowing toward the center, visible front petal relief, and a continuous rounded back arc rather than a flat plate or uniform extruded wall.

**Primary geometry authority**
- Drive folder: `r3-astra-b-flower-geometry/outputs/D_BACK_ARC_REVISION/data/meshes`
- file: `motif_63_D_BACKARC.npz`
- Drive file id: `1PFsI4DFFbHq4d3UUVGpjEidCv9pspJV4`
- SHA-256: `ddb793d271fda8bd649676381b2deed48580f6192d84169a5032f99a81ca8c8f`
- `representative_D_BACKARC.npz` is byte-identical to the motif-63 NPZ at this checkpoint.

**Blender review authority**
- file: `representative_BACKARC_D.blend`
- Drive file id: `1lPB15FH_6r7tqJw5TCYpX4I9U3U54SFF`
- SHA-256: `30897e2c0bbae7919f388ba9a61010a30933a52dfdcce960bd8d44f9112d18de`

**Reproduction / geometry rule**
- file: `D_BACK_ARC_REVISION/data/geometry_rule.json`
- Drive file id: `1S9yRRP6qw8fH46WmCD0RISZ1kcXWyM1b`
- SHA-256: `b352cc890f5aaa225d108ca85f19409e1ec16398c35bc2218b4234f780d0a72f`
- verification confirms saved blend geometry is identical to generated geometry and uses millimetre units.

**Unit / scale**
- geometry unit: **mm**;
- reference flower scale for R4: **1.0 physical scale** relative to this R3 D reference;
- do not multiply the flower scale by the Large Mocomoco Host scale;
- the R3 D file contains world placement from the B study. R4 must treat position / orientation as placement context, not as part of the reusable flower unit;
- R4 should derive a local canonical flower frame and place the flower on the Mocomoco surface by rigid transform while preserving physical dimensions and the D front/back relief.

The representative motif-63 mesh has a world-axis bounding extent of approximately `9.703 x 6.320 x 10.668 mm`; this is a placement-dependent bbox, not a new scalar diameter rule. Do not use it to redefine the flower size system.

## Geometry Nodes interpretation

R3 D with **6 petals** is the reference geometry.

R4 GN may derive **3 / 4 / 5** petal variants for comparison, but these are derived study variants, not independent accepted flower authorities.

For petal-count comparison:

- keep the same physical flower scale at the default comparison setting;
- preserve the rounded outer ends and narrowing toward the center;
- preserve front petal relief and the continuous rounded backside / depth relation;
- do not flatten the flower merely to make the petal-count parameter easier;
- do not vary petal count and global flower size simultaneously in the first comparison;
- keep petal count, flower physical scale, placement density, orientation logic, and Host scale as separable parameters.

## Large composition principle

The current direction is not `scale Host + scale flower together`.

Preferred composition study:

`larger R4 BaseShape -> broadly fixed flower physical scale -> more flowers / revised distribution`

The purpose is to test a two-distance reading:

- **far view:** the Mocomoco SHAPE remains legible;
- **near view:** individual FLOWER form, relief, gaps, and surface rhythm become legible.

Do not fill the larger Host by simply increasing flower size.

## R4 stopping gate

The active stop is:

**Intermediate Author Artwork Geometry Gate**

Before this gate, R4 may study only Artwork Geometry / composition needed to review:

- Large Mocomoco BaseShape;
- R3 D-derived flower unit;
- GN petal-count comparison `3 / 4 / 5 / 6`;
- physical flower scale vs quantity;
- surface distribution / orientation;
- far-view SHAPE and near-view FLOWER relation;
- internal visual reference only where necessary to understand the artwork composition.

Do **not** proceed without Author GO to:

- fabrication adaptation;
- removable Support;
- toolpath / G-code;
- print package preparation;
- Production / SKIN translation.

## R3 boundary

If R3 is used during this phase, its role is limited to establishing / verifying the R3 D reference used by R4.

Do not reopen an independent R3 flower round, generate new flower families, or expand the Flower Study scope unless the Author explicitly requests it.

## Supersession rule

Old R4 handoff documents and saved code may still contain B1 flower / fixed-unit assumptions.

For R4 restart:

1. retain valid R4 BaseShape source / transform evidence;
2. supersede B1 flower geometry as the active flower authority with the R3 D BACKARC reference above;
3. do not run old generation code unchanged if it embeds B1 flower geometry / scaling assumptions;
4. record exactly which old parameters were retained, replaced, or ignored before new geometry is generated.

This observation authorizes bounded R4 Artwork Geometry research only. It is not a Fabrication, Support, print, or Production authorization.
