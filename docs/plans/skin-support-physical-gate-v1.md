# SKIN Golden LUNA — Support Physical / Slicer Gate v1

Date: 2026-09-04
Repository: `satw-jp/katachi`
Branch: `agent/skin-golden-support-physical-feedback-v1`
Candidate commit: `6032b4708fd2d674702d27bead126663861727ff`

## Scope and stop condition

This document records the physical/slicer gate preparation for the existing candidate. It does not redesign the Support route, change BODY geometry, change Stage 4 classification, change contact policy, adopt a new Golden threshold, or merge into Golden mainline.

The candidate was evaluated through the existing Stage 4 → Stage 6 → Stage 6.5 → Stage 7 → Stage 8 flow using the completed sample. No code change was made for this gate.

## Frozen historical baseline

The requested pre-physical Golden baseline is retained as a comparison target only:

| Metric | Frozen baseline |
| --- | ---: |
| Critical targets | 166 |
| Supported | 156 |
| Unsupported | 10 |
| Support nodes | 546 |
| Support edges | 390 |
| Accepted BODY collision | 0 |
| Inside-derived | 0 |
| Route | offset-bend |

These values were not reproduced by the current candidate run. They must not be presented as a physical or slicer PASS for this candidate.

## Candidate browser measurement

Observed after the current Stage 8 generation:

| Metric | Candidate observation |
| --- | ---: |
| Stage 4 mesh | 222,984 triangles; 3 components; dimensions 32.6 × 32.4 × 80.0 mm |
| Stage 6.5 | Inside 165,538; Outside 28,879; Boundary 28,567; 37 regions; unclassified 0 |
| Stage 7 support target | 7,294 faces / 112 regions |
| Stage 7 Inside danger | 7,095 faces / 801 regions |
| Critical targets | 151 |
| Supported | 132 |
| Unsupported | 19 |
| Generated support / trunks | 132 |
| Accepted BODY collision | 0 |
| Inside-derived | 0 |
| Support nodes | 537 |
| Support edges | 370 |
| Route | `OFFSET-BEND 6.5+7` |
| Candidate routes | 4,021 |
| Vertical / bent | 61 / 71 |
| Longest unbraced | 57.21 mm; 3 long-unbraced cases |
| Braces / braced supports | 35 / 70 |
| Contacts | point 61; crown 4; patch candidates 67; total 132 |
| Safety checks | BODY 0; plate 0; invalid 0; zero 0; duplicate 0; extreme 0 |

The browser rendered the Support with a lower vertical shaft and visible bent/angled segments. This is a visual observation only; it is not evidence of slicer success or physical adhesion.

The browser status and exported report identify the source as:

`supportSource = current-stage8:sparseResult.graph`

The browser also reported that 3MF/STL/report use the same graph. The current candidate run still has 19 unresolved targets, so artifact and print acceptance remain open.

Note: the browser displayed `critical without enhanced contact = 35`, while the observed report JSON contained `criticalRegionsWithoutEnhancedContact = 67`. This discrepancy is recorded, not resolved by parameter tuning, and is a follow-up diagnostic item.

## A/B/C comparison artifacts

All three variants were generated from the same completed sample and the same current Stage 6 BODY / Stage 6.5+7 target derivation. Only the Stage 8 interface parameters were varied. No FKEI, Surface Pattern, BODY placement, or support algorithm change was made.

| Artifact | Interface variation | Stage 8 result | Export observation |
| --- | --- | --- | --- |
| A — default contact | tip 0.60 mm; gap 0.00 mm | 151 / 132 / 19; 537 nodes / 370 edges; bent 71; BODY collision 0 | `Export Current Geometry` completed. A new local `yohaku-skin-plate-20260904 (2).3mf` was observed, 3,878,439 bytes. |
| B — thin contact | tip 0.40 mm; gap 0.00 mm | Same target/topology counts; bent 71; BODY collision 0 | Browser export completion was observed, but no new local file was materialized during this run. |
| C — thin contact + gap | tip 0.40 mm; gap 0.20 mm | Same target/topology counts; bent 71; BODY collision 0 | Browser export completion was observed, but no new local file was materialized during this run. |

Existing local files observed for reference:

- `yohaku-skin-plate-20260904 (2).3mf` — 3,878,439 bytes, timestamp 15:12:03; attributed to A by the browser run.
- `yohaku-skin-plate-20260904 (1).3mf` — 3,877,549 bytes, timestamp 14:24:17; retained as an existing comparison candidate, but its exact A/B/C provenance is not established here.
- `yohaku-skin-plate-20260904-export-report.json` — existing report artifact; its timestamp predates A and it is not relabeled as a fresh A/B/C artifact.

Therefore A/B/C are valid browser-side comparison states, while filesystem-level 3MF/STL/report parity for each variant remains pending. No artifact is promoted to the Golden default.

## Slicer gate

Status: **READY / WAITING**

No Bambu Studio, PrusaSlicer, or equivalent slicer session was available in the current environment. This gate is prepared but not passed.

For each A/B/C artifact, inspect at the actual printer profile and record:

1. layer preview at the first contact, lower shaft, bend, angled approach, neck, crown, and patch-contact regions;
2. whether the tip fuses, floats, or becomes a free island;
3. whether the lower shaft remains plate-attached through the early layers;
4. bridge/overhang behavior around the bend and crown;
5. brace and isolated-component behavior;
6. Support removal direction and whether the contact neck leaves unacceptable surface damage;
7. the slicer’s generated support settings, layer height, nozzle, material, cooling, and export timestamp.

No micro-gap value is adopted as Golden policy. The current application default remains tip 0.60 mm and gap 0.00 mm.

## Physical Print #1

Status: **DONE — observation supplied by author on 2026-09-04**

The earlier WAITING status is superseded by the author's later physical observation. Print #1 completed, all Removable Support was removed, and the upper Permanent/Internal structure mostly held its shape. Failures were concentrated in the lower and middle-lower area.

The observed failure pattern was waviness and local collapse in long thin independent Removable Supports, with nearby floating extrusion, sag, and stringing. The working hypothesis is a long-independent-support instability that makes the intended BODY contact unstable and causes a lower/bootstrap delivery failure with local BODY/Internal disturbance. This is not evidence that Internal Structure broadly failed.

Print #1 candidate facts retained for comparison:

| Metric | Print #1 candidate |
| --- | ---: |
| Critical targets | 151 |
| Supported / unresolved | 132 / 19 |
| Support graph | 537 nodes / 370 edges |
| Accepted BODY collision / Inside-derived | 0 / 0 |
| Route | `OFFSET-BEND 6.5+7` |
| Longest unbraced / long-unbraced | 57.21 mm / 3 |
| Braces / braced supports | 35 / 70 |

The frozen 166 / 156 / 10 and 546 / 390 values remain historical baseline only. BODY geometry, Permanent/Internal graph, Surface Pattern, and permanent diameters are not to be changed for Print #2.

The following physical details remain unmeasured by the browser and require slicer/print observation:

| Observation | State |
| --- | --- |
| Lower shaft plate adhesion | Unknown |
| First-layer collapse | Unknown |
| Bend stability | Unknown |
| Angled approach collapse | Unknown |
| Short-neck fusion / floating | Unknown |
| Crown or patch contact | Unknown |
| Brace collapse | Unknown |
| Support removal damage | Unknown |
| Printed part count / failed parts | Unknown |

No collapse threshold, tip threshold, gap threshold, or removal threshold is adopted from the browser geometry.

The Print #2 production candidate keeps `maxUnbracedLengthMm = 18`, `contactGapMm = 0`, the existing tip/neck interface, and patch candidates OFF. It uses the existing Stage 8 routes and adds only sparse, BODY-audited mutual braces. The 16 mm nearest-shaft eligibility distance was chosen from the current candidate's 57.21 mm longest run and the post-feedback 34.18 mm residual run: it gives a short reach to a viable neighboring trunk while the brace itself remains capped at 18 mm. This is a code candidate, not a physical threshold inferred from photographs.

## Print #2 bootstrap stability candidate

The implementation measures each accepted Stage 8 trunk by centerline path rather than absolute Z: shaft length, bootstrap length until the first accepted mutual connection, first-brace height, subsequent-brace spacing, residual longest unbraced run, nearest eligible support distance, local approach inclination, BODY contact height, and contact tier. Brace endpoints are split into the existing shaft graph topology, so the graph and the exported support cylinders describe the same network.

The browser candidate was generated from the same completed sample and current 6.5 + 7 evidence:

| Metric | Print #2 candidate |
| --- | ---: |
| Critical / supported / unresolved | 151 / 132 / 19 |
| Support graph | 685 nodes / 714 edges |
| Vertical / bent routes | 61 / 71 |
| Braces / braced supports | 161 / 86 |
| Longest residual unbraced / long-unbraced trunks | 34.18 mm / 2 |
| Isolated trunks / isolated long trunks | 46 / 0 |
| Bootstrap maximum / first-brace height maximum | 17.86 / 17.86 mm |
| Brace maximum / mean | 17.87 / 7.51 mm |
| Connected components | 58 |
| BODY collision / plate / invalid / zero / duplicate / extreme | 0 / 0 / 0 / 0 / 0 / 0 |
| Inside-derived / patch candidates / contact gap | 0 / 0 / 0 mm |

The browser result is an improvement candidate, not a slicer or physical PASS. The production path remains current Stage 6.5 Outside/Boundary ∩ Stage 7 danger → Stage 8 offset-bend. No legacy or stale Support is used, and the current project/renderer/export source identity remains the existing Stage 8 contract.

Print #2 acceptance is therefore: preserve the same BODY and Permanent Structure fingerprints, keep BODY collision and Inside-derived at zero, keep invalid/NaN/zero-length at zero, keep the long-run and isolated-long counts below Print #1, and pass slicer inspection of the lower network, junctions, crowns, and floating extrusion before printing.

## Measured versus inference

Measured in this gate:

- browser Stage 4/6/6.5/7/8 counts and status text;
- browser Support route and physical graph counts;
- browser A/B/C parameter states;
- local file names, sizes, and timestamps listed above;
- browser export completion status for A/B/C.

Inference or not yet measured:

- slicer first-layer adhesion;
- thermal collapse, warping, stringing, or bridge success;
- actual contact fusion and removal force;
- mechanical strength and printability;
- filesystem parity for every A/B/C 3MF/STL/report set;
- reproduction of the frozen 166 / 156 / 10 and 546 / 390 Golden baseline.

## Rejected alternatives and policy decisions

- Do not adopt a parameter change merely because the browser graph remains bent or because export completes.
- Do not use a stale or legacy Support preview as a physical candidate.
- Do not add a micro-gap to the Golden without slicer and physical evidence.
- Do not change BODY, permanent internal graphs, Stage 4 responsibility, target derivation, Support diameter, or contact bounds in this gate.
- Do not merge this candidate into Golden mainline.

## Next physical test

Open the Print #2 candidate artifact in Bambu Studio with the same printer profile used for Print #1. Record first-layer plate attachment, lower bootstrap network, brace junctions, bend/angled approach, short neck, crown size, floating extrusion, and Support removal direction. Do not start the physical Print #2 until that human slicer gate is acceptable.

## Repository state

- Code changes for this gate: **Print #2 support-only candidate**
- New code branch: `agent/skin-golden-support-print2-v1`
- Source checkpoint: `f4f3114f9fa21c9a5d70803aafcb91bf23f2437e`
- Golden merge: **NO**
- Deploy: **NO**
