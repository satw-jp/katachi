# R4 A1 D22.2 Plus4 — Physical Experiment

Recorded: 2026-09-21 JST. Lane: R4 A1 Fabrication. Branch: `agent/r4-a1-d222-local-support` / draft PR #17.

## Author action

The Author reported that printing **started at 2026-09-20 23:35 JST**.

This record preserves the distinction between:
- Author physical experiment permission/action;
- software technical/integrity/audit state;
- live printer telemetry;
- physical PASS/FAIL;
- final artwork ACCEPT / print-ready / Production.

Only the first item is established by the Author report here. Live printer state and physical outcome remain **UNVERIFIED** until physical evidence is captured.

## Exact experiment artifact

- candidate: **D22.2 Plus4**
- attempt: `additional_four_20260920` / `d222_plus4`
- file: [`plate_1.gcode`](https://drive.google.com/file/d/1RVB2g31QBEh6ZjWPMAb_T8A50kmsUmqL/view)
- Drive ID: `1RVB2g31QBEh6ZjWPMAb_T8A50kmsUmqL`
- size: **1,227,347,428 bytes**
- recorded SHA-256: `778b02bf50766d3de1d586592cc3ef6db3400f5c7fe767ddc54d3b2060ec6305`
- layers: **1,058**
- pre-print software state: native PASS; G-code/ZIP integrity PASS; profile checks PASS; own full 1,058-layer audit COMPLETE
- **Additional10 / official38 Support parts are not present in this artifact**

The hash above is the retained verification-record value, not a new cloud re-hash in this update.

## Intended print conditions

Retained candidate conditions:
- Bambu Lab A1
- 0.4 mm nozzle
- 0.2 mm layer
- PLA
- 240 C initial / normal nozzle
- Textured PEI profile / 65 C bed
- Bambu automatic Support OFF
- authored Support geometry retained
- single filament / no material changes

Actual machine/plate/material state at launch was not independently captured by this GitHub update.

## Physical observation targets

Known unresolved/inherited witness bands to observe:
- F3891 — Z5.8 mm
- prior problem band — Z39–43 mm
- F0542 — Z58.2 mm
- F1261 — Z61.2 mm
- A4081 — Z71.4 mm
- F2297 / F0069 — Z83.4 mm
- F4207 — Z106.6 mm

These are observation targets, not proof that physical failure will occur.

Stop-worthy evidence includes:
- plate or Support detachment;
- unsupported extrusion collapse / hanging accumulation;
- growing filament blob;
- nozzle collision or repeated striking.

## Gate

**PHYSICAL EXPERIMENT STARTED — RESULT PENDING**

Still HOLD:
- physical PASS;
- print-ready/final release;
- final artwork ACCEPT;
- Production/generalization;
- Additional10 combined native/slice;
- unapproved seven-site geometry repair.

No new geometry, re-slice or audit is authorized by this documentation record.
