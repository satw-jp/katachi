# Team C Current Status

Last verified: 2026-09-07

## Current authority
- repo: `satw-jp/katachi`
- Production Algorithm / Support authority: `2b64cebc09f8e11e5d9f78993d82f7239deb6823`
- Production Capability Baseline: `349e1a854d7e3699ac29afd167fc22e8131406d7`
- Geometry Fidelity checkpoint: `73bba117c1d09bf14735b1ad71938b086b165cf8`
- Permanent BODY: `c9ed4d69512aa20cb994083239afc5d26ce0402abbdb5a79e2165ca521cdb501`
- Permanent Graph: 253 nodes / 272 edges / `5cb659849d694beaae6443a4828031b5b6471b836bbe5e78aede5aece1c34435`
- Removable Support: 577 nodes / 395 edges / `ef1d3eaec4146e171316a81e441797526fef6c8921d88a7689b68ac9c5892121`
- support source: `current-stage8:sparseResult.graph`
- Production 3MF SHA-256: `bbc0af54bb6f038e61f211666a7a4378785cf2b6b106f9771acbbe5c96587e1c`
- UI IA v0A evidence checkpoint: `c64cf091b1c66294ca885759e5a5a9069eb398af`
- FIELD vNext Interaction Correctness accepted checkpoint: `dad764ce7e410b0c1751a5d8ed52c2dcd13ba453`
- Progressive FIELD implementation checkpoint: `a1596883e9772da144f54ec29aa8dd0339e4bbf5`
- Progressive FIELD dense-gate evidence checkpoint: `1d473146d6c9364f84d2435a64efb4175bc057f1`
- Progressive FIELD Fix 2 structural review checkpoint: `3219f093a8c9ed9165b5c66dea0bd2f4e87d8fdf`
- Viewport baseline guard checkpoint: `f4baeca950204e0d80e5a5da01441b17764c489a`

## Local/runtime authority
- C J workspace authority: `J:\dev\worktrees\skin-field-vnext-interaction-v0`
- J canonical clone: `J:\dev\katachi`
- shared user-managed samples: `J:\dev\samples`
- `C:\dev\samples` is not authority
- live compute/helper: `J:\dev\katachi-compute-helper-tray`
- verified capability endpoint: `127.0.0.1:47658/v1/capabilities`
- Compute indicator author check: PASS (`Compute ● CUDA` acceptable)

## Current phase
Runtime Status + Progressive FIELD v0 remains OPEN.

Author visual testing after `f4baeca...` shows the BEADS/navigation baseline is still not correct:

- view rotate still does not work in actual author use;
- zoom still does not work / appears frozen;
- FIELD -> BEADS still does not visibly return to BEADS;
- crucial new clue: after FIELD -> BEADS, toggling Display Style to Ghost makes the expected BEADS appear, and toggling back to Solid leaves the BEADS correctly visible.

This means the prior FIELD-progression guard was real but not the whole root cause. The remaining defect may be input routing, camera-state mutation, render-frame scheduling, or stale view-layer/visibility synchronization. The Ghost/Solid action likely forces a render/update/material/visibility path that the ordinary layer switch or camera gesture is failing to trigger or complete.

Progressive FIELD author evaluation remains SUSPENDED. Do not continue FIELD optimization until the general viewport input/redraw baseline is trustworthy.

## Active implementation instruction
- owner: C SOL -> C LUNA
- task: `Viewport Input / Redraw Diagnostic v1`
- spec: `docs/tasks/C_VIEWPORT_INPUT_REDRAW_DIAGNOSTIC_V1.md`
- continue from: `agent/skin-runtime-status-progressive-field-v0` / `f4baeca950204e0d80e5a5da01441b17764c489a`
- execution: J-side only
- diagnostic-first: do not patch behavior until the failing boundary is named

Mandatory evidence must distinguish, for BEADS rotate/zoom and FIELD->BEADS:
1. input event arrival;
2. camera/control state mutation;
3. render request;
4. render-frame execution;
5. renderer view-layer/object visibility state;
6. actual pixels updating.

The Ghost/Solid clue must be reproduced and explained. Determine whether Ghost fixes the screen because it forces full `render()` / `skinRenderer.update(...)`, reapplies visibility/material state, changes mode, or merely schedules the missing frame.

If one shared stale-render/invalidation defect explains rotate/zoom/layer-return/1<->4 symptoms, prefer one bounded shared fix. Do not add separate feature-specific workarounds.

## PASS / CLOSED
- C Research closed enough for v0
- Production architecture PASS / LOCKED
- Geometry Fidelity PASS / CLOSED
- Removable Support wiring PASS / CLOSED
- 3MF PASS
- First Physical Gate PASS / CLOSED for accepted near-vertical print regime
- UI IA v0A PASS / CLOSED at `c64cf091...`
- FIELD vNext capability retention PASS
- earlier FIELD vNext Interaction Correctness PASS / CLOSED at `dad764ce...`
- C J workspace/runtime bootstrap PASS
- compute/helper J cutover + connection PASS
- Compute tiny indicator author visual PASS
- Progressive FIELD Fix 1 dense timing gate PASS for current C-compatible 273-primitive sample
- Progressive FIELD Fix 2 source/scope STRUCTURAL PASS at `3219f093...`
- viewport FIELD-progression guard source/scope STRUCTURAL PASS at `f4baeca...`, but author baseline did not pass

## Current blockers / follow-up
- ACTIVE: viewport input/redraw synchronization baseline — rotate, zoom, 1/4-view, FIELD->BEADS stale presentation.
- Progressive FIELD author visual gate is SUSPENDED until this passes.
- Build/tests remain partially constrained by environment-level J: generated-file `EPERM` and Node `ENOMEM`; do not misreport these environment failures as code PASS/FAIL.
- 10,450 primitive historical v2-FKEI scalability remains UNVERIFIED and is not required for current parser closure.
- Permanent Structure durability remains `FAIL / LOCALIZED`; audit is QUEUED, not active.
- strong-overhang/cantilever generalization remains UNVERIFIED.
- SKIN-support-alone full printability remains UNVERIFIED.
- Workflow Guide-derived console `NotFoundError` remains separate non-blocking follow-up.
- External STL Host + FKEI persistence remain separate-architecture HOLD.

## HOLD / DO NOT CHANGE
- Production BODY / Permanent Graph / Local Relay / Graph Repair
- current Stage8 Removable Support semantics and `current-stage8:sparseResult.graph`
- source-to-mm / Output Scale contract
- FIELD SDF math, sequential smooth-min order, primitive grouping/filter/store/payload semantics
- verified compute endpoint/configuration
- FKEI / Export / 3MF semantics
- External STL Host / triangle-mesh Host architecture
- Usagi
- durability implementation
- Outside->Outside Support
- new C research unless separately scoped
- retained C-side migration originals
- user-managed `J:\dev\samples`: do not commit, rename, reorganize, or delete without explicit instruction

## Relevant artifacts
- active diagnostic: `docs/tasks/C_VIEWPORT_INPUT_REDRAW_DIAGNOSTIC_V1.md`
- previous viewport diagnostic: `docs/tasks/C_VIEWPORT_INTERACTION_BASELINE_DIAGNOSTIC_V0.md`
- Fix 2: `docs/tasks/C_RUNTIME_STATUS_PROGRESSIVE_FIELD_V0_FIX2_INTERACTIVE_FIELD_AND_LAYER_RETURN.md`
- Fix 1 dense gate: `docs/tasks/C_RUNTIME_STATUS_PROGRESSIVE_FIELD_V0_FIX1_DENSE_GATE.md`
- progressive FIELD task: `docs/tasks/C_RUNTIME_STATUS_PROGRESSIVE_FIELD_V0.md`
- queued durability audit: `docs/tasks/C_SINGLE_ATTACHMENT_DURABILITY_AUDIT_V0.md`

## Next gate
1. C LUNA runs `docs/tasks/C_VIEWPORT_INPUT_REDRAW_DIAGNOSTIC_V1.md` from `f4baeca...` on J.
2. Name the exact failed boundary before making a fix.
3. If bounded, fix viewport input/redraw/view-layer synchronization only.
4. Verify BEADS rotate/pan/zoom, 1->4->1, and FIELD->BEADS in the same browser session without relying on Ghost/Solid toggles.
5. Return to C SOL and STOP.
6. Only after this baseline passes may Progressive FIELD Fix 2 author visual testing resume.
