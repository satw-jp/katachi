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
Viewport Input / Redraw Diagnostic v1 is PASS / CLOSED at `7006e0d359ad605ccaa84cc2be85fb29da3c27d9`.

C SOL reviewed the pushed diff directly. The fix is bounded to `src/studies/skin/main.ts`: `installSkinWorkflowGuide()` previously called `rightPaneUpperStack.insertBefore(panel, ui.viewLayerRoot.nextSibling)` even though `ui.viewLayerRoot` lives under a different DOM parent. The resulting DOM exception interrupted startup before the later viewport render callback wiring was registered. The fix inserts the guide relative to `rightPaneUpperStack.firstChild`, preserving the intended parent and allowing startup to continue to `skinRenderer.setRenderRequestCallback(requestRenderFrame)`.

Observed diagnostic boundary:
- input event arrival: PASS;
- camera/control mutation: PASS;
- render request: previously stopped because render callback registration was never reached;
- render frame / pixels: previously not reached from viewport requests;
- renderer visibility state: correct;
- Ghost/Solid appeared to repair BEADS because that path forced a full `render()` after the otherwise missing viewport redraw wiring.

Post-fix browser/author evidence:
- rotate: PASS;
- pan: PASS;
- zoom: PASS;
- FIELD -> BEADS: PASS without Ghost workaround;
- 1 View <-> 4 Views: PASS for 5 cycles;
- Ghost/Solid no longer determines whether BEADS is visible;
- console errors attributable to this defect: none;
- focused tests/typecheck/build: PASS as reported;
- Production / FIELD semantic math / geometry / compute endpoint unchanged.

Therefore:
- Viewport Interaction Baseline Diagnostic v0: CLOSED by the v1 diagnosis/fix.
- Viewport Input / Redraw Diagnostic v1: PASS / CLOSED.
- prior Workflow Guide-derived DOM `NotFoundError` follow-up: RESOLVED by `7006e0d...`.

Runtime Status + Progressive FIELD v0 remains OPEN only for the final author visual confirmation of Fix 2 now that the viewport baseline is trustworthy again.

## Active implementation instruction
- NONE.
- Do not modify code before the final Progressive FIELD author visual gate.
- Candidate runtime checkpoint for author verification: `agent/skin-runtime-status-progressive-field-v0` / `7006e0d359ad605ccaa84cc2be85fb29da3c27d9`.
- Verify FIELD vNext specifically:
  1. enter FIELD and let it settle;
  2. rotate/pan/zoom while a very coarse FIELD-like surface remains visible and follows the camera;
  3. interaction starts without waiting for another fine frame;
  4. releasing interaction restarts idle refinement at the final camera pose;
  5. FIELD -> BEADS returns immediately;
  6. BEADS -> FIELD retains vNext preference.
- If this author gate passes, C SOL may close Runtime Status + Progressive FIELD v0 without further implementation.
- If it fails, scope only the observed remaining FIELD interaction defect. Do not reopen general viewport baseline unless a non-FIELD failure reappears.

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
- viewport FIELD-progression guard source/scope PASS at `f4baeca...`
- Viewport Input / Redraw Diagnostic v1 PASS / CLOSED at `7006e0d...`
- Workflow Guide DOM startup exception RESOLVED at `7006e0d...`

## Current blockers / follow-up
- ACTIVE GATE ONLY: final Progressive FIELD Fix 2 author visual confirmation on `7006e0d...`.
- 10,450 primitive historical v2-FKEI scalability remains UNVERIFIED and is not required for current parser closure.
- Permanent Structure durability remains `FAIL / LOCALIZED`; audit is QUEUED, not active.
- strong-overhang/cantilever generalization remains UNVERIFIED.
- SKIN-support-alone full printability remains UNVERIFIED.
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
- viewport redraw diagnostic: `docs/tasks/C_VIEWPORT_INPUT_REDRAW_DIAGNOSTIC_V1.md`
- previous viewport diagnostic: `docs/tasks/C_VIEWPORT_INTERACTION_BASELINE_DIAGNOSTIC_V0.md`
- Progressive FIELD Fix 2: `docs/tasks/C_RUNTIME_STATUS_PROGRESSIVE_FIELD_V0_FIX2_INTERACTIVE_FIELD_AND_LAYER_RETURN.md`
- Fix 1 dense gate: `docs/tasks/C_RUNTIME_STATUS_PROGRESSIVE_FIELD_V0_FIX1_DENSE_GATE.md`
- progressive FIELD task: `docs/tasks/C_RUNTIME_STATUS_PROGRESSIVE_FIELD_V0.md`
- queued durability audit: `docs/tasks/C_SINGLE_ATTACHMENT_DURABILITY_AUDIT_V0.md`

## Next gate
1. Author visually verifies Progressive FIELD Fix 2 behavior on `7006e0d...` now that general viewport redraw works.
2. C SOL closes Runtime Status + Progressive FIELD v0 only if coarse interactive FIELD + idle refinement + FIELD/BEADS return all pass in actual author use.
3. Do not automatically continue to another C task after this gate.
