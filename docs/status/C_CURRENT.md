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
- Viewport baseline fix review checkpoint: `f4baeca950204e0d80e5a5da01441b17764c489a`

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

The author visual gate after Fix 2 exposed a more fundamental viewport problem: BEADS itself could not be reliably rotated, zoom became extremely slow / appeared frozen, and 1 View -> 4 Views behaved incorrectly. FIELD evaluation was therefore suspended until a BEADS/basic-navigation baseline could be restored.

C LUNA diagnosed the BEADS baseline on J and found that shared camera gestures were still calling FIELD progression state even when the active layer was BEADS/MESH/etc. That caused FIELD-only quality/timer work to run during non-FIELD navigation.

C SOL directly reviewed `f4baeca950204e0d80e5a5da01441b17764c489a`:
- parent is exactly `3219f093a8c9ed9165b5c66dea0bd2f4e87d8fdf`;
- remote branch HEAD matches `f4baeca...`;
- diff is one file only: `src/studies/skin/renderer.ts`, +5 lines;
- `setFieldPreviewInteractionActive()` now returns immediately when `activeViewLayer !== "field"`;
- no FIELD shader/SDF math, Production, geometry, FKEI, Export, or compute endpoint file changed;
- worker browser evidence reports Axome plain-left rotate responsive and 1<->4 stable for 5 cycles;
- zoom was part of the motivating failure but was not explicitly enumerated in the worker's completion summary, so author visual confirmation is still required before the viewport baseline is accepted.

C SOL verdict:
- viewport baseline fix source/scope: STRUCTURAL PASS;
- Production/FIELD semantic boundary: PASS;
- viewport baseline overall: AUTHOR VISUAL HOLD;
- Progressive FIELD author visual gate remains SUSPENDED until the BEADS baseline passes in author use.

## Active implementation instruction
- NONE.
- Do not modify code before author visual confirmation.
- Author must verify in BEADS with FIELD inactive:
  1. Axome rotate is responsive;
  2. pan is responsive;
  3. wheel/zoom is responsive and does not freeze;
  4. 1 View -> 4 Views -> 1 View is stable;
  5. selecting viewports in 4-view mode behaves normally.
- If this BEADS/navigation gate passes, resume the Progressive FIELD Fix 2 author visual gate at `f4baeca...` without new implementation.
- If it fails, scope only the exact remaining viewport-core defect; do not return to FIELD optimization until the baseline is trustworthy.

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
- Viewport baseline fix source/scope STRUCTURAL PASS at `f4baeca...`

## Current blockers / follow-up
- ACTIVE GATE ONLY: author visual BEADS/basic viewport baseline — rotate, pan, zoom, 1/4-view.
- Progressive FIELD author visual gate is SUSPENDED until that baseline passes.
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
- viewport diagnostic: `docs/tasks/C_VIEWPORT_INTERACTION_BASELINE_DIAGNOSTIC_V0.md`
- Fix 2: `docs/tasks/C_RUNTIME_STATUS_PROGRESSIVE_FIELD_V0_FIX2_INTERACTIVE_FIELD_AND_LAYER_RETURN.md`
- Fix 1 dense gate: `docs/tasks/C_RUNTIME_STATUS_PROGRESSIVE_FIELD_V0_FIX1_DENSE_GATE.md`
- progressive FIELD task: `docs/tasks/C_RUNTIME_STATUS_PROGRESSIVE_FIELD_V0.md`
- queued durability audit: `docs/tasks/C_SINGLE_ATTACHMENT_DURABILITY_AUDIT_V0.md`

## Next gate
1. Author visually tests BEADS navigation at `f4baeca...` on J: rotate, pan, zoom, 1<->4, viewport selection.
2. If BEADS baseline passes, re-run the Progressive FIELD Fix 2 author visual gate on the same checkpoint.
3. C SOL closes Progressive FIELD v0 only after both viewport baseline and FIELD interaction/layer-return pass in actual author use.
4. Do not automatically continue to any other C task.
