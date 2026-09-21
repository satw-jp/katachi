# R4 A1 Fabrication — Current routing on main

Updated: 2026-09-21 JST. Author-authorized documentation correction after the overall audit. This is a lane router, not a new fabrication result or a branch merge.

## READ FIRST — Large R4 exception

**Do not resume Large R4 from the old main D22.1 RUNNING / completion-unverified checkpoint.** Its execution-state and NEXT wording are historical.

The current Large R4 record is on draft [PR #17](https://github.com/satw-jp/katachi/pull/17):

- branch: `agent/r4-a1-d222-local-support`;
- verified documentation checkpoint: `f025b28559848b1d61ac43860d349138cb730e81`;
- [exact lane CURRENT](https://github.com/satw-jp/katachi/blob/f025b28559848b1d61ac43860d349138cb730e81/docs/status/R4_A1_FAB_CURRENT.md);
- [exact resume task](https://github.com/satw-jp/katachi/blob/f025b28559848b1d61ac43860d349138cb730e81/docs/tasks/R4_A1_D222_LOCAL_SUPPORT_CLOSURE.md);
- [Plus4 physical experiment record](https://github.com/satw-jp/katachi/blob/f025b28559848b1d61ac43860d349138cb730e81/docs/evidence/R4_A1_D222_PLUS4_PHYSICAL_EXPERIMENT_2026-09-20.md).

This exception applies **only to Large R4 fabrication**. Overall scope, Research, R5 and mini AMS routing stay on main. Do not use the older PR branch's relative Research/overall CURRENT copies as authority for other lanes. Before a later action, check whether PR #17 has a newer reviewed checkpoint; a newer timestamp alone does not grant scope.

## NOW / next action

**WAITING PLUS4 PHYSICAL RESULT / NO ACTIVE REPAIR OR SLICE.**

- D22.2 Plus4: retained native/integrity/profile PASS and own1,058-layer audit COMPLETE. Author reported physical experiment start at **2026-09-20 23:35 JST**. Live printer state and physical outcome remain UNVERIFIED in the available record.
- Additional10:38 locally adopted parts, frozen separately; **not in Plus4; no combined native/G-code**. Do not slice merely because local closure is complete.
- Additional7 witnesses: unmodified; no repair scope opened. Use the retained locations as physical observation targets, not automatic repair orders.
- Next: receive/bind Plus4 physical result and actual conditions, review artwork usability, then propose only the necessary bounded next action. Unknowns remain UNKNOWN.
- General print-ready release, physical PASS, final artwork ACCEPT and Production are not established. The specific Author experiment already reported is distinct from general release HOLD.

The complete artifact hashes, protected geometry, unresolved risks and evidence pointers live in the pinned lane CURRENT above. This router does not recompute hashes or repeat completed audits.

## Lane locks — do not mix

Large R4 retains A1 /0.4mm /0.2mm /PLA240°C / Textured PEI profile65°C / **15% grid /raft0 /auto brim** /retraction0 /automatic Support OFF, with authored Support geometry retained. All4,238 internal branches remain2.2mm with the two3mm ROOT_ADDITION exceptions; frozen Artwork and D221 contacts remain protected.

F2's100% aligned-rectilinear/raft2 settings, old PLA mini transforms and the mini AMS PETG+PLA payload are not this lane's profile or physical evidence. Actual machine/plate/material/overrides are recorded per physical run, not inferred from saved settings.

## Branch stack — unchanged, integration not performed

PR #17 is based on `agent/r4-a1-fab-checkpoint-20260920`, head `40b4bed89903750ee182e12cb46519aa36fe48f2`, which is [PR #16](https://github.com/satw-jp/katachi/pull/16) targeting main. Neither PR was merged or retargeted by this correction.

A future separately authorized integration must review the checkpoint-to-current-main diff, preserve main's R5/mini/overall updates, integrate the checkpoint, then review PR #17 against the resulting main. Mergeability against the checkpoint is not proof of mergeability against main. Do not replace main with the whole R4 branch or force-push. Integration is not a prerequisite for reviewing the existing physical experiment.

## Retained history — not a resume instruction

The [pre-correction main R4 checkpoint at33e39167](https://github.com/satw-jp/katachi/blob/33e39167f8331fc55459e2e95a686b250d5d0291/docs/status/R4_A1_FAB_CURRENT.md) retains the September19 D22/D221 source-inspection record, protected conditions, Drive pointers and earlier task. Its RUNNING/unverified state is superseded by the saved completion evidence on the lane branch; do not restart that execution or repeat its repairs.

Normal entry: [TEAM_PROTOCOL_CORE](../TEAM_PROTOCOL_CORE.md) -> [SKIN_ABC_CURRENT](SKIN_ABC_CURRENT.md) -> this router -> exact lane CURRENT/task. No implementation, slice, hardware action, branch integration or release is authorized by this documentation update.
