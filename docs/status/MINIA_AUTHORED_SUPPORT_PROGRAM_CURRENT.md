# MINI_A Authored Support Program — CURRENT

Updated: 2026-10-13 JST

## Authority and branch

- [Issue #62](https://github.com/satw-jp/katachi/issues/62) is the execution authority.
- [Direct LUNA execution design V1](../tasks/MINIA_AUTHORED_SUPPORT_LUNA_EXECUTION_V1.md) remains the implementation design.
- Branch: `agent/minia-authored-support-program-v0`; Draft PR #63 remains open and unmerged.
- The current bounded task follows the latest Issue #62 technical review. It does not require Astra redesign, delegation, or approval.

## Present state

**`PARTIAL_IMPLEMENTATION_HOLD` — limited V4 D2 stage passed for review; full MINI_A replay remains HOLD.**

The Python stage registry now binds `V4_D2_SUPPORT_GENERATION` to the fixed case, recipe, and pinned legacy source hashes. A fresh Python process rebuilt the V4 first-material mask from V2/V3 source geometry and generated 151 D2 candidates in an isolated output directory.

Checkpoint comparison passed for the ordered candidate IDs and full plan records, 157 D2 rejection records and reasons, rebuilt mask arrays, and exact vertex/face arrays for all 151 meshes. The saved 150-item removal sequence plus blocked ID `D2_112` was read only as a checkpoint; no removal builder or V7 stage ran. The 4,202 locked source-input files and saved V4 checkpoint files had identical before/after hashes.

The saved D2 records have no explicit `selection_reason` field. The comparison therefore checked each generated selection trace against the saved candidate order and its exact target, contact, height, approach, stability, and removal records; rejection reasons were compared directly.

Focused package tests: 17 passed, 1 optional geometry fixture skipped (18 total), including fresh-process registry dispatch and output-root protection. The fresh-process V4 D2 command exited 0 with `MINIA_AUTHORED_SUPPORT_V4_D2_REPLAY_READY_FOR_REVIEW`.

## Remaining before full READY

The limited V4 D2 result does not establish `MINIA_AUTHORED_SUPPORT_PROGRAM_REPLAY_READY`. V7 generation, A1 revision, A/F2 stage integration, native Support-part binding, and full MINI_A plan/mesh/native comparison remain unresolved. The general `build`, `verify`, and `replay` commands remain fail-closed.

**Follow-up before full READY:** reject empty or malformed expected SHA values in `check_asset()`, verify the GOLDEN file SHA before comparison, bind the `N00224` override to its upstream stage, and finish Permanent `mesh_source` content locks. These are outside the bounded V4 D2 gate.

## Protected scope

No MINIL application, later stage, slice, Send, or Print was run. No source input or saved V4 checkpoint was modified. The Draft PR remains unmerged. Physical behavior, toolpath chronology, removal success, Author acceptance, and Print GO are not claimed.

