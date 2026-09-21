# SKIN / FUKEI Execution — Current

Verified: 2026-09-21 JST.

This is the short **cross-lane entry point** for current execution state. It does not replace lane authority.

Read order:
1. this file;
2. the lane CURRENT that owns the work;
3. its active task/evidence;
4. Drive artifacts only when referenced.

## One-page state

| Lane | Owner | Current state | Next gate |
|---|---|---|---|
| R4 A1 Fabrication | R4 Fabrication Astra + Author | **D22.2 Plus4 physical experiment STARTED by Author**. Plus4 native/integrity/profile PASS + own 1,058-layer audit COMPLETE. Physical result not yet recorded. | capture physical evidence; do not promote to physical PASS/final release without result |
| Additional10 Support | R4 Fabrication Astra | **38 parts locally adopted/frozen**, conditional local checks PASS; no combined ten-site native/G-code | HOLD; remain unsliced while physical experiment and seven-site scope are unresolved |
| Seven inherited witnesses | R4 Fabrication Astra / Author gate | A4081, F3891, F0542, F1261, F2297, F0069, F4207 remain unmodified | no automatic repair/slice; separate Author scope decision |
| R5 Slice Runner | R5 Astra | Runner execution integration PASS; **REPRO_AUDIT_01 = C**; Runner unchanged; byte determinism unproven | production expansion HOLD; optional SLICER_SELF_REPRO_01 not authorized |
| MOCOMOCO internal network research | Research lane | V0 retained: shared demand + fusion produced actual network; equal-material closed network not proven | no active implementation in this sync; next comparison remains A0 FLOWER-FIRST / B0 HOST-FIRST / C0 HYBRID if reopened |

## R4 physical experiment

Author reported print start: **2026-09-20 23:35 JST**.

Exact artifact:
- candidate: D22.2 Plus4
- attempt: `additional_four_20260920` / `d222_plus4`
- [`plate_1.gcode`](https://drive.google.com/file/d/1RVB2g31QBEh6ZjWPMAb_T8A50kmsUmqL/view)
- size: 1,227,347,428 bytes
- recorded SHA-256: `778b02bf50766d3de1d586592cc3ef6db3400f5c7fe767ddc54d3b2060ec6305`
- layers: 1,058
- Additional10 / 38-part derivative is **not included**

GitHub records only the Author report of experiment start. Current printer liveness, actual machine/plate/material state and physical outcome are not independently verified here.

Observation targets:
- F3891 Z5.8
- prior problem band Z39–43
- F0542 Z58.2
- F1261 Z61.2
- A4081 Z71.4
- F2297 / F0069 Z83.4
- F4207 Z106.6

Author experiment start does **not** equal:
physical PASS, print-ready release, final artwork ACCEPT, Production or generalization.

R4 authority:
[R4_A1_FAB_CURRENT](R4_A1_FAB_CURRENT.md)

Physical experiment record:
[R4_A1_D222_PLUS4_PHYSICAL_EXPERIMENT_2026-09-20](../evidence/R4_A1_D222_PLUS4_PHYSICAL_EXPERIMENT_2026-09-20.md)

Draft fabrication PR:
[PR #17](https://github.com/satw-jp/katachi/pull/17)

## R5 Slice Runner

R5 owns Bambu Studio CLI execution infrastructure. R4 is a client.

Current result:
- Runner `0.1.0`
- real A1 single-material smoke PASS
- real A1 mini two-material smoke PASS
- `SLICE_JOB -> Runner -> Bambu CLI -> outputs -> RESULT_MANIFEST` PASS
- `REPRO_AUDIT_01`: **C — minor toolpath nondeterminism / fabrication semantics equivalent**
- `resolved_settings.json` byte-identical across reference console and Runner runs
- no Runner change from the audit
- no new slice from the audit
- byte-level determinism remains unproven

Important: the retained Runner implementation is still in Drive/LUNA output; GitHub source migration is not yet complete. Do not infer that adding this CURRENT migrated the code.

R5 authority:
[R5_SLICE_RUNNER_CURRENT](R5_SLICE_RUNNER_CURRENT.md)

Audit evidence:
[R5_SLICE_RUNNER_REPRO_AUDIT_01_2026-09-20](../evidence/R5_SLICE_RUNNER_REPRO_AUDIT_01_2026-09-20.md)

## MOCOMOCO internal network research

Retained research document:
[R4 MOCOMOCO｜絡まり合う内部構造 生成原理リサーチ｜2026-09-18](https://docs.google.com/document/d/1xlK5AcUGNVAdZU-AlCpm41AaLAgqyFqUy-vG9qYnCLk/edit)

Retained V0 result:
- T: 18 independent trees, cycle0, fusion0
- S: encounters increased but no actual joining
- F: fusion permission alone produced no joining
- SF: C2, cycle rank7, fusion23, 17 root lineages in one component
- material increase means equal-material closed network remains unproven
- first loop around 676 mm / roughly 1.38x T is evidence for that test, not a universal material threshold

No MOCOMOCO implementation or new experiment was run in this status sync.

If reopened, the next bounded comparison remains:
- A0 FLOWER-FIRST
- B0 HOST-FIRST
- C0 HYBRID

FLOWER visual protagonism and FLOWER generation origin remain separate questions.

## Protected boundaries

- technical PASS != fabrication PASS != physical PASS != Author ACCEPT != Print GO
- R5 execution PASS does not authorize R4 print
- R4 physical experiment does not validate R5 byte determinism
- Additional10 local PASS does not mean combined native PASS
- physical experiment start does not mean physical success
- main remains unchanged by this coordination update
- do not rerun completed long slices/audits merely to resume

## Current next actions

1. **R4:** capture actual physical result/evidence from Plus4 experiment when available.
2. **R4:** keep Additional10 unsliced and seven witnesses unchanged unless Author explicitly reopens them.
3. **R5:** STOP after REPRO_AUDIT_01; no new slice/modification without Author/SOL gate.
4. **Research:** MOCOMOCO remains separate and inactive unless explicitly reopened.
