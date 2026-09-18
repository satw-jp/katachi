# R4 A1 D22.1 — Final Slice and Audit Gate

Recorded: 2026-09-19. Scope owner: SOL / Author. Execution owner: R4 A1 Fabrication Astra.
Status: CONTINUATION FROM EXISTING D22.1; inspect the latest attempt before execution. This documentation change does not launch a job.

## Goal and restart boundary

Complete the native-output and review evidence for the existing D22.1 working candidate while preserving frozen R4 artwork and the four already-applied Support contact repairs.

**Do not start from the historical four-contact repair proposal. Do not run those repairs again.** The next entry point is current `source/INPUT_LOCKS.json` + preservation/intersection records + the current slice manifest. Read [R4_A1_FAB_CURRENT](../status/R4_A1_FAB_CURRENT.md) for exact pointers and up-to-date stage state.

The latest inspected manifest records a run starting 2026-09-19 07:06:07 JST as RUNNING. Verify actual process/output state on the worker. Do not duplicate, terminate or replace a live run because a new agent is resuming the task. A manifest alone does not establish liveness or success.

## Required read set

- [TEAM_PROTOCOL_CORE](../TEAM_PROTOCOL_CORE.md) and the active CURRENT.
- [Author fabrication direction](../observations/AUTHOR_OBSERVATION_R4_A1_FABRICATION_2026-09-18.md).
- [A1 Bambu CLI Runbook](../fabrication/A1_BAMBU_CLI_RUNBOOK.md), [Toolpath Audit Rules](../fabrication/TOOLPATH_AUDIT_RULES.md), [Fabrication Principles](../fabrication/FABRICATION_PRINCIPLES.md).
- Working package locks, preservation/contact audit, existing execution/result/output records; D22 successful native route as comparison, not a substitute final output.

## Allowed work

Read-only verification of existing D22.1 identity and localized differences; inspection of existing worker execution; bounded native execution recovery only if the prior run is resolved and a new attempt is needed; archive/integrity verification; all-layer toolpath audit and localized review; risk report/package/CURRENT updates.

No new geometry change is authorized by this continuation. If current identities contradict the recorded locks or a risk needs geometry/profile changes outside the fixed contract, preserve evidence, report the discrepancy and stop for a bounded decision. Do not silently substitute a prior D22.1 snapshot, regenerate it, or switch engine/material/support policy.

## Protected scope

Retain all protected parameters in CURRENT: artwork freeze, 4,238 internal 2.2 mm members with two 3.0 mm ROOT_ADDITION exceptions, existing centerlines/tapered ends, 4,283 flowers, authored bottom Support, four changed Support IDs and 22,369 unchanged others, automatic Support OFF, PLA240, A1/.4/.2 and locked profiles, documented CLI6000.

The latest saved D22.1 includes local coplanar subdivision to keep deformation in the 1.2 mm taper. Do not replace this current locked surface with the older unbounded-deformation snapshot. Source surface preservation and triangle-byte identity must be distinguished.

No Artwork Research, densification, whole-object thickening, generic truss, global Support, automatic reorientation, blanket speed reduction, custom slicer, Reader changes, Production/generalization, printer send or printing.

## Work sequence / completion evidence

1. **Resolve and verify existing work.** Confirm the candidate against current locks and saved preservation/intersection evidence. Record what is independently checked vs source-reported. Preserve current branch/HEAD/dirty state and existing attempts. Resolve the current run before any retry; retain non-success evidence.
2. **Complete final native output.** Use the pinned route and exact profiles from the runbook/current task. Preserve command, cwd, engine/resources, timestamps, outputs, exit code and result. If a retry is necessary, give it a distinct attempt record; do not overwrite the earlier failure or claim the D22 run proves D22.1 success.
3. **Verify integrity and archive.** Save full D22.1 G-code, ZIP, sizes/hashes, payload equality, terminal marker, actual layer counts/range and effective settings. Verify source preservation before/after. Derive D22.1 facts from its own output, never the D22 1,058-layer record.
4. **Audit all layers.** Apply the audit rules with exact G-code hash, method/tool revision, tolerances and coverage. Include the Z39-43 mm investigation band, earlier receiving surface, chronological births, unsupported spans, gap/overhang/bridge classification, local motion/extrusion, growth and collision-risk limits. Four positive contacts are not an all-layer audit.
5. **Resolve or explicitly retain required blockers.** Localize/evaluate floating-region warnings and the source/native facet discrepancy; compute D22.1's own counts after subdivision. Review unwanted fusion/removal consequences and the plate-setting uncertainty. Do not force a PASS where evidence is incomplete.
6. **Package and stop.** Return reviewable overall/bottom/internal/problem-band evidence, exact artifacts, integrity/audit reports, known risks and independent gate states. Update stable CURRENT to the actual result and next action. Update Playbook evidence level only where new evidence supports it.

## Done / STOP

The worker returns an evidence-bound GO recommendation or HOLD report; it does not self-approve printing. A successful technical completion requires final D22.1 native output + verified archive/integrity + complete required audit coverage + explicit risk disposition. Missing/unverified required evidence remains HOLD.

**STOP: AUTHOR A1 PRINT PACKAGE GATE.**

Neither this task, native Success, audit completion nor a future `skin fab slice` command grants machine-send/print, artistic ACCEPT, physical PASS or SKIN Production permission. Any selective translation into SKIN needs a separate bounded task after review.
