# R5 Astra / FUKEI Slice Runner — Current

Verified: 2026-09-21 JST.

## Authority

- repo: `satw-jp/katachi`
- execution infrastructure owner: **R5 Astra / FUKEI Slice Runner**
- R4 A1 Fabrication is a **client** of Runner, not Runner owner
- Runner decides **HOW to execute a validated job**, never WHAT fabrication settings should be
- large run artifacts remain on Google Drive

Current implementation source still lives in the retained Drive/LUNA output:
[fukei_slice_runner](https://drive.google.com/drive/folders/1jDZUQy3YH_V59fih7xnU_0UN8LVv0u2u)

During this sync, no pre-existing R5 Runner implementation branch/current was found in GitHub. **GitHub source migration of the Runner implementation is still pending** and must be a separate bounded task; this CURRENT does not silently treat the Drive output folder as a permanent GitHub code SSOT.

## Current phase

**REPRO_AUDIT_01 COMPLETE — classification C.**

Evidence:
[R5_SLICE_RUNNER_REPRO_AUDIT_01_2026-09-20](../evidence/R5_SLICE_RUNNER_REPRO_AUDIT_01_2026-09-20.md)

No new slice was launched for the audit.

Current accepted state:
- Runner version `0.1.0`
- A1 single-filament smoke: execution PASS
- A1 mini + AMS lite two-material smoke: execution PASS
- Runner GUI -> Bambu CLI -> outputs -> RESULT_MANIFEST route: PASS
- input/profile lock validation: PASS
- exact argv/cwd/datadir/execution context retention: PASS
- cancel/partial-output isolation/startup/single-instance behavior: implemented in retained Runner source
- reproducibility classification: **C — minor toolpath nondeterminism / fabrication semantics equivalent**
- byte-identical determinism: **not proven**
- Runner code change after audit: **NONE**
- production expansion: **HOLD**

## Role boundary

Fabrication Astra owns:
- geometry / Support;
- slicer conditions;
- validated exact argv;
- job authorization;
- result/toolpath review;
- fabrication GO/HOLD.

Runner owns:
- validated `SLICE_JOB.json` execution;
- deterministic wrapper behavior;
- stdout/stderr;
- result files / `RESULT_MANIFEST.json`;
- execution context;
- progress/ETA/cancel/startup mechanics.

Author owns:
- required GUI/user-action gate;
- physical printing;
- final Author gates.

Runner must not become a second Fabrication Astra.

## Repro audit summary

Reference inherited-console run and Runner run used the same engine, input, profiles, cwd, datadir and substantive CLI argv.

`resolved_settings.json` is byte-identical, SHA-256:
`e6f38d9806fd3550e6523714c42728588f8f1ca7b81afb564a1773573fa447e8`

Observed output:
- console G-code: 13,196,903 bytes / prediction 14850.630859 s
- Runner G-code: 13,184,604 bytes / prediction 14848.634766 s
- 46 filament changes in both
- total PETG/PLA usage identical
- geometry bbox and triangle count identical
- minor path ordering/seam/segmentation/timing differences remain

This is sufficient for classification C, not A/B.

## Active task

**NONE authorized after REPRO_AUDIT_01.**

Retained optional next task only:
`SLICER_SELF_REPRO_01`

Purpose:
test Bambu Studio inherited-console run-to-run determinism before blaming the wrapper for path-order nondeterminism.

It requires new slicing and is **NOT STARTED / NOT AUTHORIZED**.

## Protected scope / STOP

Until a new Author/SOL gate:
- no new smoke;
- no cache experiment;
- no local scratch experiment;
- no Runner modification;
- no R4 integration expansion;
- no mesh simplification;
- no new production slice.

R4's current physical experiment is **not evidence that Runner is byte-deterministic** and does not change this R5 gate.

## Required pointers

- [Execution overview](SKIN_FUKEI_EXECUTION_CURRENT.md)
- [REPRO_AUDIT evidence](../evidence/R5_SLICE_RUNNER_REPRO_AUDIT_01_2026-09-20.md)
- [R4 A1 Fabrication CURRENT](R4_A1_FAB_CURRENT.md)
- [Team protocol](../TEAM_PROTOCOL_CORE.md)
