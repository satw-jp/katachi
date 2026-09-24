# FUKEI Runner Clean-Mesh Input Route — Issue #30 Evidence

Date: 2026-09-24 JST
Repository: `satw-jp/katachi`
Task authority: [Issue #30 — FUKEI Slice Runner — Clean-Mesh Input Route v1](https://github.com/satw-jp/katachi/issues/30)
Implementation branch: [`codex/issue-30-clean-mesh-input-route`](https://github.com/satw-jp/katachi/tree/codex/issue-30-clean-mesh-input-route)

## Result

**FUKEI RUNNER CLEAN-MESH INPUT ROUTE PASS**

Implementation and the required software checks passed. The gate is **STOP: AUTHOR / DECISION-OWNER REVIEW**. This branch is not merged. No printer send, physical print, or full Large slice was performed.

## Input contract

- `mesh_import`: exactly one ASCII or binary STL, `units: mm`, an exact SHA-256 lock for the STL, expected bounds in mm, and finite `translation_mm`, `rotation_deg`, and positive `scale` values. The declared transform is recorded but not applied by the Runner. Bounds comparison uses an absolute tolerance of 1e-6 mm.
- `native_bambu_project`: exactly one `.3mf` and explicit `native_saved: true`, `externally_reduced: false`, `manually_repacked: false` provenance. The Runner checks the declaration and does not invent an internal Bambu project validator.
- A job without `input_mode` remains a legacy job, including schema 0.1.

## Verification

| Check | Result |
|---|---|
| T1 existing Runner regression | PASS — `python -m unittest discover -s tests -v`; 35 tests, 0 failures, CPython 3.12.14. Includes a schema 0.1 job that loads and executes successfully. |
| T2 valid synthetic mesh | PASS — Bambu Studio 02.08.02.61, validation PASS, `--slice 0` exit 0, 81,099-byte `plate_1.gcode`, `SLICE_ACCEPTED`. |
| T3 empty mesh | PASS — empty and zero-face STL rejected before engine launch. |
| T4 corrupt/non-finite/hash mismatch | PASS — corrupt, NaN, Inf, missing units/bounds/transform and SHA mismatch rejected before engine launch; a second lock check immediately before launch is also covered. |
| T5 reduced Bambu project provenance | PASS — externally reduced and undeclared provenance are rejected before engine launch; no 3MF structure parser was added. |
| T6 terminal manifest | PASS — mode, provenance, mesh counts/bounds/units/expected bounds/declared transform, exact input SHA, and actual engine terminal status/exit code are recorded. |

### T2 evidence

- Job: `outputs/FUKEI_CLEAN_MESH_INPUT_ROUTE_FINAL_T2/SLICE_JOB.json`
- Run: `outputs/FUKEI_CLEAN_MESH_INPUT_ROUTE_FINAL_T2/runs-output/runs/synthetic_diagnostic_cube_recheck_01_20260924_114925/`
- Manifest: `RESULT_MANIFEST.json` in that run folder
- Mesh: 684-byte binary STL; SHA-256 `b8f2a582655ce4812f44d352a908070b45f66c203316504829d9bcd64e7ea7ed`; 36 vertex references, 12 triangles; bounds min `[120,120,0]`, max `[125,125,2]` mm.
- G-code: 81,099 bytes; SHA-256 `43ff00fd4457896aa5956b0a5c43d1c4a2f3067a2895cbb439df90a6fdc115e3`; engine elapsed time 0.544 s.
- The installed executable's `--help` returned exit 0 with empty stdout/stderr. The smoke reused the exact single-filament argv already accepted by the retained A1 diagnostic run; no new Bambu option was invented.
- The separate `review_artifact` field is `FAILED` for this G-code-only invocation because the CLI did not emit a native sliced 3MF. CLI execution and nonempty G-code are successful; the package-only/review-artifact implementation was not changed by this task.

## Source and compatibility

Source is versioned under `tools/fukei_slice_runner/` and was copied to the operational Runner directory named by Issue #30. Job schema and terminal manifest are 0.2. Legacy jobs without `input_mode` remain executable. Process supervision, progress, cancellation, run-directory behavior, and package-only code were not changed.

## Known limitations

- Only ASCII/binary STL with mm units was validated; OBJ and other formats are not accepted by this release.
- `intended_transform` is recorded for handoff but is not applied or translated into CLI arguments.
- Native 3MF provenance is declaration-based; internal project structure is deliberately not parsed.
- Real CLI execution was verified with Bambu Studio 02.08.02.61 and the existing A1 single-filament profile/argv. Other versions/configurations are unverified.
- `--help` provided no option text in this installed build.

## STOP and next handoff

STOP at Author / decision-owner review. Issue #31 remains a separate bounded task. Exact handoff:

`satw-jp/katachi Issue #31 をtask authorityとして読み、Issue #30のPASSを確認後、記載scope内で実行し、STOP条件まで進めてください。`

Do not automatically select the final resolution or full-slice Large.