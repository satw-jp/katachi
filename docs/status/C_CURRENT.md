# Team C Current Status

Last verified: 2026-09-08

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
- Progressive FIELD Fix 2 structural checkpoint: `3219f093a8c9ed9165b5c66dea0bd2f4e87d8fdf`
- viewport FIELD-progression guard checkpoint: `f4baeca950204e0d80e5a5da01441b17764c489a`
- viewport input/redraw baseline accepted checkpoint: `7006e0d359ad605ccaa84cc2be85fb29da3c27d9`

## Local/runtime authority
- C J workspace authority: `J:\dev\worktrees\skin-field-vnext-interaction-v0`
- J canonical clone: `J:\dev\katachi`
- shared user-managed samples: `J:\dev\samples`
- `C:\dev\samples` is not authority
- live compute/helper: `J:\dev\katachi-compute-helper-tray`
- verified capability endpoint: `127.0.0.1:47658/v1/capabilities`
- Compute indicator author check: PASS (`Compute ● CUDA` acceptable)

## Current phase
Runtime Status + Progressive FIELD v0 is PASS / CLOSED.

The final author visual gate on the current J runtime passed after the viewport redraw baseline was repaired. The author confirmed the display behavior is acceptable. This closes the presentation/runtime scope that began with the FIELD first-meaningful-image latency issue.

Accepted behavior/evidence:
- tiny Compute runtime indicator is acceptable and truthfully showed CUDA/offline/CUDA restore during prior gate work;
- FIELD vNext appears progressively instead of requiring a long blank wait;
- current C-compatible dense gate (`skin-rebuild-pattern5-regression.fkei`, 39 patches / 273 primitives) reached recognizable coarse immediately, medium about 0.37 s, fine about 0.75 s, with no multi-second automatic stall during the recorded observation;
- interaction can switch to an aggressively coarse low-resolution FIELD presentation using the same FIELD payload/material semantics;
- idle refinement resumes after interaction;
- FIELD -> BEADS return works after the viewport redraw fix;
- BEADS/viewport rotate, pan, zoom, 1<->4 layout, and Ghost/Solid presentation baseline are restored;
- vNext backend preference remains session-only and preserved across layer switching;
- Production BODY / Graph / Support / supportSource / FKEI / Export / 3MF semantics remain unchanged by this work;
- FIELD SDF math, sequential smooth-min order, primitive grouping/filter/store/payload semantics remain unchanged.

The viewport redraw blocker was separately diagnosed and closed at `7006e0d...`: `installSkinWorkflowGuide()` previously raised a DOM exception before viewport render callback registration. The corrected DOM insertion allows startup to continue to `skinRenderer.setRenderRequestCallback(requestRenderFrame)`, restoring normal camera/layer redraw behavior.

10,450-primitive historical v2-FKEI scalability remains UNVERIFIED and is not claimed by this closure; it is outside the current C-compatible parser gate.

## Active implementation instruction
- NONE.
- Do not start another C implementation task automatically from this closure.
- `docs/tasks/C_SINGLE_ATTACHMENT_DURABILITY_AUDIT_V0.md` remains QUEUED only and requires explicit start.
- Usagi / strong-overhang validation remains later explicit scope.

## PASS / CLOSED
- C Research closed enough for v0
- Production architecture PASS / LOCKED
- Geometry Fidelity PASS / CLOSED
- Removable Support wiring PASS / CLOSED
- offset-bend support restored
- 3MF PASS
- First Physical Gate PASS / CLOSED for accepted near-vertical print regime
- UI IA v0A PASS / CLOSED at `c64cf091...`
- FIELD vNext capability retention PASS
- FIELD vNext Interaction Correctness PASS / CLOSED at `dad764ce...`
- C J workspace/runtime bootstrap PASS
- compute/helper J cutover + connection PASS
- Compute tiny indicator author visual PASS
- Progressive FIELD Fix 1 dense timing gate PASS for current C-compatible 273-primitive sample
- Progressive FIELD Fix 2 source/scope STRUCTURAL PASS at `3219f093...`
- viewport FIELD-progression guard PASS at `f4baeca...`
- Viewport Input / Redraw Diagnostic v1 PASS / CLOSED at `7006e0d...`
- Workflow Guide DOM startup exception RESOLVED at `7006e0d...`
- Runtime Status + Progressive FIELD v0 PASS / CLOSED after final author visual confirmation on 2026-09-08

## Remaining follow-up / evidence boundaries
- Permanent Structure durability remains `FAIL / LOCALIZED` for one observed single-attachment appendage; audit is QUEUED, not active.
- strong-overhang / cantilever generalization remains UNVERIFIED; the first physical print does not prove Usagi-like geometry.
- SKIN-support-alone full printability remains UNVERIFIED because the accepted first print used limited manual supplemental slicer support.
- 10,450 primitive historical v2-FKEI scalability remains UNVERIFIED and is not required for current parser closure.
- External STL Host + FKEI persistence remain separate-architecture HOLD.

## HOLD / DO NOT CHANGE
- motif-conditioned default seed
- Local Relay Permanent Network
- bounded Graph-only first repair
- Permanent BODY / member sizing / BODY field unless separately approved after durability audit
- current Stage8 Removable Support semantics and `current-stage8:sparseResult.graph`
- source-to-mm / Output Scale contract
- FIELD SDF math, sequential smooth-min order, primitive grouping/filter/store/payload semantics
- verified compute endpoint/configuration
- FKEI / Export / 3MF semantics
- External STL Host / triangle-mesh Host architecture
- Usagi
- durability implementation until explicitly started
- Outside->Outside Support
- new C research unless separately scoped
- retained C-side migration originals
- user-managed `J:\dev\samples`: do not commit, rename, reorganize, or delete without explicit instruction

## Relevant artifacts
- Progressive FIELD task: `docs/tasks/C_RUNTIME_STATUS_PROGRESSIVE_FIELD_V0.md`
- Fix 1 dense gate: `docs/tasks/C_RUNTIME_STATUS_PROGRESSIVE_FIELD_V0_FIX1_DENSE_GATE.md`
- Fix 2: `docs/tasks/C_RUNTIME_STATUS_PROGRESSIVE_FIELD_V0_FIX2_INTERACTIVE_FIELD_AND_LAYER_RETURN.md`
- viewport redraw diagnostic: `docs/tasks/C_VIEWPORT_INPUT_REDRAW_DIAGNOSTIC_V1.md`
- previous viewport diagnostic: `docs/tasks/C_VIEWPORT_INTERACTION_BASELINE_DIAGNOSTIC_V0.md`
- queued durability audit: `docs/tasks/C_SINGLE_ATTACHMENT_DURABILITY_AUDIT_V0.md`
- shared physical observation note: `docs/evidence/SKIN_FIRST_PHYSICAL_PRINT_AUTHOR_OBSERVATIONS_2026-09-06.md`

## Next gate
No C implementation gate is active.

Wait for explicit author direction before starting durability audit, Usagi/strong-overhang work, Outside->Outside Support, External STL Host, or new research.
