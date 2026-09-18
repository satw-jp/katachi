# R4 A1 Fabrication — Current

Last verified: 2026-09-19 (JST). This is a source-inspection checkpoint, not a live process monitor.

## Authority

- Repository: `satw-jp/katachi`; canonical scope/task authority: `main`.
- Source main inspected: `9f6c607100c25cdfc780377002839726fde044b8` (not the HEAD of this documentation change).
- Research/artwork authority remains [ASTRA_CURRENT](ASTRA_CURRENT.md); author-facing coordination remains [SKIN_ABC_CURRENT](SKIN_ABC_CURRENT.md).
- This lane owns only **existing R4 candidate -> A1 fabrication package**. It does not reopen Artwork Research, the Reader, Production, or generalization.
- Author direction: [retained 2026-09-18 instruction](../observations/AUTHOR_OBSERVATION_R4_A1_FABRICATION_2026-09-18.md).
- Geometry, profiles, slice execution and physical evidence: the explicit Drive pointers below, resolved by file identity and hash, not by folder name or chat recollection.
- External worker branch/HEAD/working tree and live process state: **UNVERIFIED by this documentation review**. A stored `RUNNING` manifest is not a process-liveness check.

## NOW / Current phase

| State | Current evidence boundary |
|---|---|
| Baseline geometry | **D22**, frozen reference; internal branch authority diameter 2.2 mm with the root exceptions below. |
| Latest successful full native slice | **D22 Native Slice Recovery: technical PASS, one successful run**. Full-file integrity/ZIP/payload hash evidence exists; repeatability and physical success are separate. |
| Working candidate | **D22.1: four contact repairs already applied**. Other 22,369 Support blocks unchanged; four intersections recovered in saved software evidence. **Do not apply the repairs again.** |
| Latest inspected D22.1 slice record | `d221_final_manifest.json`: **RUNNING**, started `2026-09-18T22:06:07Z` / `2026-09-19 07:06:07 JST`, PID 34088. This supersedes the earlier observed non-successful attempt as the latest attempt record, not as a successful result. |
| D22.1 final slice / final all-layer audit | **Successful completion NOT VERIFIED**. Do not copy D22's PASS, layer count or hashes to D22.1. |
| Print / approved printable release | **HOLD / NONE**. No machine-send or printing authorization is granted here. |

The inspected D22.1 input lock was updated at `2026-09-18T22:05:34.373Z`. Its current Support SHA-256 is `043caf7876cee047fc0fa8d37182c883e51fe23b5def502c7b3443e8759a2158`, not the earlier `31fa2c1e...` snapshot. Local coplanar face subdivision confines endpoint deformation to the 1.2 mm taper; outside the four tips, the record now claims **surface preservation within float32 rounding**, not blanket triangle-byte identity. See [checkpoint evidence](../evidence/R4_A1_FAB_CHECKPOINT_2026-09-19.md).

## Protected geometry and fabrication conditions

- Freeze SHAPE / BaseShape / FLOWER geometry, position, physical scale and orientation / Void / composition / flower-back and root relationships / internal centerlines.
- Keep 4,238 modified internal members at the D22 2.2 mm diameter authority: SHARED_CORE 95; SHARED_TWIG 703; FLOWER_BACK_ATTACHMENT 3,395; INTERNAL_SPATIAL_LINK 9; ASCENDING_BYPASS 36. Preserve existing finer tapered ends. **Two bed-contact ROOT_ADDITION members remain 3.0 mm**; do not normalize them to 2.2 mm.
- Retain authored bottom Support. D22.1 has exactly four changed Support IDs: N00192, N01130, N03091, Y01214; the other 22,369 remain unchanged. No blanket Support addition, global densification/thickening, generic truss, or Artwork redesign.
- A1 / 0.4 mm nozzle / 0.2 mm layer / PLA 240 C / Bambu automatic Support OFF. Authored Support remains geometry in the assembly; OFF does not mean no Support exists.
- Candidate initial layer and normal layers are both 240 C. The earlier recovered GUI print used an initial 220 C; do not claim full equality to that print. Temperature is bounded to this case, not a universal PLA recommendation.
- Retain locked 15% grid, raft 0, auto brim, infill-wall overlap 100%, retraction 0. Do not restore original-3MF 100% infill / raft 2 merely because an older project contains them.
- Bambu Studio 02.08.02.61 and its recorded single-filament native route. CLI X/Y/travel 6000 is an **explained, version-pinned safe-limit difference**, not unresolved profile corruption. GUI X/Y 12000 / travel 9000 remain comparison evidence, not a target to force back.

## Active implementation instruction

Owner: **R4 A1 Fabrication Astra**, bounded under SOL/Author review.

Task: [R4_A1_D221_FINAL_SLICE_AUDIT_GATE](../tasks/R4_A1_D221_FINAL_SLICE_AUDIT_GATE.md).

**Resume at existing D22.1 locks and the recorded slice attempt, not at contact repair.** Read the latest manifest, inspect actual worker liveness/output and preserve existing work before deciding whether any new execution is needed. Do not launch a duplicate slice, kill an unknown process, regenerate D22/D22.1, or rerun a repair script from an old handoff.

After the current execution is resolved: verify D22.1 full native output -> archive and hash -> audit every layer including the Z39-43 mm investigation band -> package evidence -> STOP at the Author gate. Additional geometry repair is not authorized by this continuation; return a bounded proposal if evidence requires it.

This documentation checkpoint itself starts no slicer, auditor, implementation or hardware operation.

## Blockers / unresolved evidence

- D22.1 full native completion, integrity and full chronological/supportability audit are not verified.
- D22 native `Assembly has floating regions` warning is unresolved evidence. It is not permission to reorient the artwork or enable automatic Support.
- D22 source triangle count 49,989,679 vs native 49,989,676: **3-face discrepancy, cause unresolved in the inspected completed recovery evidence**. Input hashes unchanged and exact-zero-area count 0 do not establish complete native facet retention. D22.1 has local subdivision; compute its own input/native counts rather than copying D22 counts.
- D22.1 removal/collision consequences and final toolpath supportability are not established by four positive intersections.
- Physical failure root cause is not established. Z39-43 mm is an investigation band, not an exact failure layer. Do not infer Z from wall-clock, predicted duration or M73.
- Textured PEI / recorded bed setting vs plate identification in physical photos remains unresolved. No speculative profile correction.
- Mapping-only crash causality, engine-wide reliability and physical/production/generalizable PASS remain unproven.

## Next gate / STOP

**AUTHOR A1 PRINT PACKAGE GATE — HOLD until explicit Author review.**

Technical slice/integrity/audit results must be reported independently. The worker cannot convert them into artistic ACCEPT, physical PASS, printing permission, Production translation or SKIN generalization.

## Required pointers / normal read set

Read [TEAM_PROTOCOL_CORE](../TEAM_PROTOCOL_CORE.md), this front, the active task, and the applicable named sections of:

- [A1_BAMBU_CLI_RUNBOOK](../fabrication/A1_BAMBU_CLI_RUNBOOK.md): versioned execution and archive route.
- [TOOLPATH_AUDIT_RULES](../fabrication/TOOLPATH_AUDIT_RULES.md): audit scope, coverage and limits.
- [FABRICATION_PRINCIPLES](../fabrication/FABRICATION_PRINCIPLES.md): constraints, evidence separation and promotion policy.

| Role | Exact Drive package | Read first inside it |
|---|---|---|
| `baseline_package` | [R4_A1_PRINT_CANDIDATE_20260919_D22](https://drive.google.com/drive/folders/18OFPljQSyPZCROmhuZB99M1IzTl_ggP1) | `source/AUTHOR_TASK_20260918.txt`, `source/SOURCE_LOCKS.json`, `NATIVE_RECOVERY_UPDATE.md` |
| `latest_successful_slice_package` | [R4_A1_NATIVE_SLICE_RECOVERY_20260919](https://drive.google.com/drive/folders/1Auh3vlDGU5uhyt7WPWBDAPHJPhkEH4C8) | `README.md`, `PACKAGE_MANIFEST.json`, `audit/RECOVERY_GATE.json`, `audit/RECOVERY_VERIFICATION.json`, `slice/d22_mapping_manifest.json` |
| `working_candidate_package` | [R4_A1_D221_CLOSURE_20260919](https://drive.google.com/drive/folders/1ATc_bEjepNdq_t8ut4hw7CnVmAv795RT) | `source/INPUT_LOCKS.json`, `audit/PRESERVATION.json`, `audit/CONTACT_REPAIR_INTERSECTIONS.json`, `slice/d221_final_manifest.json` |

`CLOSURE` in a folder name is not a gate result. Never collapse these three roles into a single unqualified `latest_package`.

---

## Retained evidence / supersession

D22 Recovery saved 1,222,030,422-byte G-code, 53,354,176 lines and 1,058 layers, with ZIP 320,235,122 bytes and matching expanded payload SHA-256. These are **D22 integrity facts**, not final D22.1 printability facts. Exact hashes and source dates are retained in the checkpoint evidence, avoiding duplication across top-level CURRENT files.

- 2026-09-13 Artwork-only restrictions are superseded **only for the separately authorized bounded A1 fabrication lane**. They do not reopen research or imply all previous artwork gates passed.
- D22's old `no complete G-code` and `6000 unexplained` statements were superseded by its `NATIVE_RECOVERY_UPDATE.md`. Keep failed attempts as history.
- D22's unapplied four-contact proposal is historical input; D22.1 applied evidence supersedes it as the working-candidate state.
- Earlier D22.1 Support hash `31fa2c1e...` is not the current input lock. Never overwrite or relabel the older attempt as successful; retain the distinction between the earlier non-success exit and the later stored RUNNING record.

At every safe checkpoint, update this stable front with exact candidate/input identity, attempt outcome, separate gate states, remaining blockers and next entry action. Update a Playbook only when a reusable procedure/rule or its evidence boundary changes. A new agent must verify current artifacts before acting; the timestamp is not a promise that the worker stopped changing files.
