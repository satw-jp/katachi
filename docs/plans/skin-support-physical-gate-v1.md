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

Status: **WAITING / IN PROGRESS**

No physical printer result, photograph, measured adhesion, collapse, tip-fusion, or removal observation was supplied or available during this run. The following fields remain unknown:

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

Open the three same-BODY artifacts in the same slicer profile, record layer-preview findings for A/B/C, then print one selected variant as Physical Print #1. Return with the slicer version/profile and photographs or measured observations before deciding whether any contact or gap policy should change.

## Repository state

- Code changes for this gate: **NO**
- New code branch: **NO**
- Candidate source commit: `6032b4708fd2d674702d27bead126663861727ff`
- Golden merge: **NO**
- Deploy: **NO**
