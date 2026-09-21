# R5 Runner Author-Reviewable Sliced 3MF — Phase A Evidence

Date: 2026-09-21 JST

## Result

**PHASE A FAIL — existing Runner native `.3mf` triggers Bambu Studio re-slicing when the Author opens Preview.**

Author evidence:
- file opened: `MINI_AMS_LOWER_TEST_NATIVE.3mf`
- initial Studio surface: Prepare
- Author switched to Preview without pressing the Slice button
- Bambu Studio displayed: `スライス中 プレート1: G-codeを生成...`
- progress reached at least 80%

Therefore the existing Runner `--export-3mf MINI_AMS_LOWER_TEST_NATIVE.3mf` output is **not** an acceptable final Author-review artifact for the intended workflow. The embedded G-code exists, but Studio does not simply reuse it when entering Preview through this file-open path.

This does **not** mean the stored embedded G-code is wrong. The stored Runner artifact still has byte-identical embedded/standalone G-code. The observed gap is specifically the Studio reopen/review behavior.

## Structural finding

The Runner native `.3mf` contains editable object resources:
- `3D/Objects/object_1.model`
- `3D/_rels/3dmodel.model.rels`
- object/part records and `model_instance` in `Metadata/model_settings.config`
- non-empty resources/build in `3D/3dmodel.model`

A previously created SKIN fabrication artifact demonstrates a separate **sliced-only `.gcode.3mf`** pattern:

- historical package:
  `R4_A1_MINI_RELEASE_CANDIDATE/delivery/R4_A1_MINI_READY.gcode.3mf`
- historical README explicitly calls it `sliced-only`
- prior packaging log:
  `package_sliced_only.py.log`
- that sliced-only archive uses:
  - no `3D/Objects/object_1.model`
  - no `3D/_rels/3dmodel.model.rels`
  - empty `<resources>` and `<build/>` in `3D/3dmodel.model`
  - plate-only `Metadata/model_settings.config`
  - preserved `Metadata/plate_1.gcode`

This is retained project evidence that the desired review artifact is likely a Bambu sliced-only `.gcode.3mf`, not the generic editable/native `.3mf`.

## Bounded Phase B proof artifact

A proof artifact was packaged from the existing Runner A1 mini smoke result **without running the slicer again**:

`MINI_AMS_LOWER_TEST_NATIVE.gcode.3mf`

Drive location:
`R5_SLICE_RUNNER_INTEGRATION_V0/A1MINI_AMSLITE_SMOKE_01/runs-output/runs/A1MINI_AMSLITE_SMOKE_01_20260920_174649/`

Proof artifact SHA-256:
`23a8c5ce1f7070adca1785767a0752abc897835644fdd2fe08db585d4f31763e`

Embedded G-code:
- entry: `Metadata/plate_1.gcode`
- bytes: `13,184,604`
- SHA-256: `dbb4e4987f085898b5a414b28922554a8a2bca1d1dcc15f8b67488933f771406`
- MD5: `65FCD91D47E123E7753DBDF7607A54DA`
- stored `plate_1.gcode.md5`: same value

Therefore the Phase B proof packaging changed **container/editable-resource structure only**; the Runner-produced G-code bytes were preserved exactly.

## Current gate

Author should open the new `.gcode.3mf` in Bambu Studio.

PASS if:
- Preview opens without generating new G-code;
- material/toolpath coloring is visible;
- layer slider/warnings are present;
- send-dialog AMS mapping is visible.

FAIL if:
- Studio re-slices again;
- toolpath/material identity is lost;
- the file cannot be opened/reviewed.

Do not send/print for this proof check.
