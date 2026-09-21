# R5 Slice Runner — REPRO_AUDIT_01 evidence

Recorded: 2026-09-21 JST. Owner: R5 Astra / FUKEI Slice Runner. This audit used **existing evidence only**; no new Bambu slice was launched.

## Compared runs

Known successful inherited-console reference:
- package root: [R4_MINI_AMS_LOWER_SUPPORT_V0](https://drive.google.com/drive/folders/1biqzujK_DS21IxA5UuXm0Lb91I9XqI15)
- slice folder: [slice](https://drive.google.com/drive/folders/1fxwokz5p7B4e7r2qEzjXHEQeQ2C6haPL)
- G-code size: **13,196,903 bytes**
- total prediction: **14850.630859375 s**

Runner run:
- run folder: [A1MINI_AMSLITE_SMOKE_01_20260920_174649](https://drive.google.com/drive/folders/1ZE0u8j-kn3R_qyur3-d1tEsUpYG98L_i)
- job folder: [A1MINI_AMSLITE_SMOKE_01](https://drive.google.com/drive/folders/1bNPiD-fl1ZTZw6ypttbULVO4nz2TTrw1)
- G-code size: **13,184,604 bytes**
- total prediction: **14848.634765625 s**
- Runner version: **0.1.0**
- execution status: SUCCESS / exit0

## Execution context

The compared runs use the same:
- Bambu Studio **02.08.02.61**;
- input `MINI_AMS_LOWER_TEST_EDITABLE.3mf`, SHA-256 `33d7a6032adbe2d0cfb380e8f104a2389f4f4a74898ef2c46dfb045c630dbedb`;
- project settings SHA-256 `e4c99badaa7e0452b51f1f8812146ca7930a7684dc9dd79fe3fc6684ef6277ea`;
- G-code template lock SHA-256 `db3ca1c9c068683f31d4c62a3b0547e6aa051c7021f9ec32ae72c228b6a2fa54`;
- cwd / TEMP / TMP: `.../work/native_console`;
- datadir: `.../work/mini_ams_sw_settings`;
- material mapping `1,1`, volume mapping `0,0`, nozzle mapping `0,0`, `Auto For Flush`;
- substantive CLI argv. Output paths differ by run as expected.

Runner verified the input/profile locks before execution.

## Settings comparison

`resolved_settings.json` is byte-identical across the two runs.

Recorded SHA-256:
`e6f38d9806fd3550e6523714c42728588f8f1ca7b81afb564a1773573fa447e8`

Therefore the observed output difference is **not attributed to a resolved profile/settings change**.

## Semantic comparison

Stable/equivalent evidence:
- object bbox identical;
- triangle count identical: **3,789,610**;
- filament changes identical: **46**;
- total material identical:
  - PETG: **30.490325927734375 g**
  - PLA: **25.926198959350586 g**
- material identity and temperature command sequence equivalent;
- native 3MF printable geometry compared as byte-identical for the model payload;
- overall extrusion geometry/path extent is effectively equivalent.

Observed nondeterminism:
- G-code is not byte-identical;
- differences concentrate in the earlier portion of the print and include island/path execution order, loop start/seam/segment ordering, travel/wipe/retraction sequencing and derived timing/feed details;
- prediction differs by about **1.996 s** across a roughly 4 h 7 min print;
- native 3MF container metadata/timestamps/UUID/G-code payload metadata differ correspondingly.

No meaningful fabrication-semantic difference was identified in this bounded comparison, but exact path ordering is not deterministic.

## Classification

**C — minor toolpath nondeterminism / fabrication semantics equivalent**

Not:
- A: files are not byte-identical;
- B: differences include actual path ordering/seam/segmentation rather than metadata-only noise;
- D: no meaningful fabrication difference identified;
- E: the semantic scope of the difference is sufficiently localized for this audit, although Bambu's internal code-level cause remains unknown.

## Runner disposition

- Runner integration: **PASS**
- A1 mini two-material execution: **PASS**
- byte-level determinism: **HOLD / not proven**
- Runner modification: **NONE from this audit**
- new slice: **NONE**
- R4 production/fabrication GO: **NOT implied**
- production expansion of Runner: **HOLD pending SOL/Author acceptance of classification C**

Only one optional follow-up is retained:
`SLICER_SELF_REPRO_01` — repeat the same inherited-console route to test Bambu Studio's own run-to-run determinism.

This follow-up requires a new slice and is **not authorized or started** by this record.
