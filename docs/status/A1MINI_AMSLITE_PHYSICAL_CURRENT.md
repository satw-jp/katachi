# A1 mini + AMS lite Physical Current Status

Last verified: 2026-09-21 (JST)

## Authority

- repo: `satw-jp/katachi`
- lane: bounded **A1 mini / PETG + PLA / authored lower-support physical validation**
- Author observation: [AUTHOR_OBSERVATION_A1MINI_AMSLITE_PHYSICAL_2026-09-21](../observations/AUTHOR_OBSERVATION_A1MINI_AMSLITE_PHYSICAL_2026-09-21.md)
- PHYSICAL_01 review: https://drive.google.com/drive/folders/1qllBgDW_Ndn6X206zBnLinkM6h1HCHva
- actual-sent payload binding: https://drive.google.com/drive/folders/11SzwOSHfntHBRI5EKLVohcEy5zNCsA5H
- PHYSICAL_02 dry-only execution package: https://drive.google.com/drive/folders/1hB66PbSCCad-wkUYUX0SVN9X_QpuWzlF

This lane is separate from the Large R4 / D22.1 A1 fabrication lane and separate from R5 Slice Runner infrastructure.

## PHYSICAL_01 — identity

**Execution identity: COMPLETE.**

Recovered from the Author-connected A1 mini SD card and bound to the Author-confirmed 2026-09-20 15:46 job.

Authority payload:
- 3MF: `MINI_AMS_LOWER_TEST_EDITABLE.3mf`
- 3MF SHA-256: `fc028564bf848ec34d490fe329f71edad924ddffb07c86a38b269ba105f7ccf3`
- G-code: `MINI_AMS_LOWER_TEST_EDITABLE_plate_1.gcode`
- G-code SHA-256: `be20858d03fd1d65866547c7419ee895c9fc299435b391fa2968dbb854ae5da7`

The SD payload matches the cached V1 candidate exactly.

**PHYSICAL_01 is a V1-derived physical result. It is not the Runner smoke V0 physical result.**

Known payload conditions:
- A1 mini / 0.4 mm;
- PETG + PLA;
- PETG deposition setting 255 C;
- PLA deposition setting 220 C;
- prime tower ON, width 35 mm;
- auto brim;
- raft 2 layers;
- flush matrix `0,172,652,0`;
- automatic Support OFF;
- authored lower-support geometry retained;
- V1 material changes excluding initial selection: 38.

Unknowns retained:
- printer-side override/telemetry;
- exact PHYSICAL_01 stop layer/Z;
- exact physical filament manufacturer/product/lot;
- measured moisture content;
- numeric cloud/printer job id.

## PHYSICAL_01 — physical result

Author result:
- intentional early stop because upper region was unnecessary for evaluation;
- intentional stop is **not** print failure;
- quality judgment: **LOW**.

Photo review:
- stringing: clearly present / high;
- surface roughness: clearly present / high;
- local unsupported/floating-region collapse: possible, not causally identified;
- lower-support effectiveness: partial structural survival observed, PASS not established;
- support-removal damage/residue: not established;
- bed adhesion: not established from the existing off-bed photos;
- overall gross structure survived partially.

Physical PASS: **NONE**.

Cause remains unresolved. Drying, thermal behavior, retraction/ooze, nozzle/material condition, and local supportability must not be collapsed into a single cause without evidence.

## PHYSICAL_02 — dry-only bounded test

Purpose:
test whether **PETG drying treatment only** reduces stringing/surface roughness in the common lower region.

Locked comparison payload:
- same authority G-code SHA-256: `be20858d03fd1d65866547c7419ee895c9fc299435b391fa2968dbb854ae5da7`
- no new slice;
- no G-code edit;
- no profile change;
- no Runner change.

Prepared stop target from read-only G-code analysis:
- layer 50 complete: **Z = 9.9 mm**
- layer 51 begins: **Z = 10.1 mm**
- manual target: stop after layer 50 deposition and before layer 51 deposition;
- actual stop deviation must be recorded rather than silently normalized.

Latest Author-reported drying:
- material label/context: Generic PETG;
- drying setpoint: **70 C**;
- duration: **12 h**;
- measured moisture content: UNKNOWN;
- exact product/manufacturer: UNKNOWN unless separately identified.

The preparation package itself intentionally retains `print_go=false` because it is a non-execution artifact. After review, the Author asked which locked G-code to print and bounded execution instructions were supplied. **No PHYSICAL_02 print outcome has been reported at the time of this GitHub update.**

Current operational state:

**READY FOR AUTHOR EXECUTION / PHYSICAL RESULT PENDING.**

This is a bounded test readiness state, not Production Print GO and not Physical PASS.

## Active implementation instruction

Owner: **Fabrication Astra / Author physical gate**.

No geometry or software implementation is active.

Next action when the Author executes:
1. use only the locked authority payload;
2. do not intentionally add printer-side overrides;
3. record observed printer-side settings;
4. manually stop near layer 50 / Z9.9 target and record the actual stop/deviation;
5. photograph in the defined sequence: bed-on / removed-before-support-removal / after-support-removal;
6. compare only the common lower region;
7. STOP for physical review.

## HOLD / do not change

- no new slice for PHYSICAL_02;
- no profile change;
- no geometry/support redesign in the dry-only test;
- no temperature tuning in the same test;
- no Runner modification;
- no automatic promotion from improved appearance to cause-confirmed;
- no Production/generalization claim.

## Next gate

**PHYSICAL_02 DRY-ONLY AUTHOR PHYSICAL REVIEW.**

A completed print must return with drying record, actual stop record, deviations, and photos before any further variable is changed.

## Required pointers

- `docs/TEAM_PROTOCOL_CORE.md`
- `docs/status/SKIN_ABC_CURRENT.md`
- `docs/status/R5_SLICE_RUNNER_CURRENT.md`
- Author observation linked above
- Drive PHYSICAL_01 review / binding / PHYSICAL_02 package linked above
