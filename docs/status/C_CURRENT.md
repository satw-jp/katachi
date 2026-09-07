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

## Local/runtime authority
- C J workspace authority: `J:\dev\worktrees\skin-field-vnext-interaction-v0`
- J canonical clone: `J:\dev\katachi`
- shared user-managed samples: `J:\dev\samples`
- `C:\dev\samples` is not authority
- live compute/helper: `J:\dev\katachi-compute-helper-tray`
- verified capability endpoint: `127.0.0.1:47658/v1/capabilities`
- Compute indicator author check: PASS (`Compute ● CUDA` acceptable)

## Current phase
Runtime Status + Progressive FIELD v0 is NOT closed.

Fix 2 at `3219f093...` passed C SOL source/scope review, but author visual testing exposed a more fundamental problem that invalidates FIELD-only interaction evaluation:

- BEADS view itself cannot be reliably view-rotated;
- zoom is extremely slow / appears to freeze even in BEADS;
- 1 View -> 4 Views behavior is incorrect/unstable;
- therefore basic viewport camera/navigation behavior is not currently a trusted baseline.

The current renderer intentionally disables normal Trackball LEFT/RIGHT drag mappings and relies on custom Rhino-style pointer routing. Camera input ownership, orbit enable/restore state, pointer capture, selected viewport synchronization, zoom render path, and 1/4-view control/projection setup must be diagnosed before any more FIELD-specific optimization is accepted.

Progressive FIELD Fix 2 remains preserved at `3219f093...` with STRUCTURAL PASS, but its author visual gate is suspended until the BEADS/navigation baseline passes.

## Active implementation instruction
- owner: C SOL -> C LUNA
- task: `Viewport Interaction Baseline Diagnostic v0`
- spec: `docs/tasks/C_VIEWPORT_INTERACTION_BASELINE_DIAGNOSTIC_V0.md`
- continue from: `agent/skin-runtime-status-progressive-field-v0` / `3219f093a8c9ed9165b5c66dea0bd2f4e87d8fdf`
- execution: J-side only
- diagnostic-first: do not modify code until the BEADS-only failure is reproduced and the cause is named
- mandatory baseline:
  - BEADS only, FIELD fully inactive;
  - verify intended/observed rotate, pan, zoom gestures;
  - inspect `TrackballControls`, custom Rhino pointer routing, Axome gating, `setOrbitEnabled()` callers, pointer capture cleanup;
  - verify zoom does not trigger unexpected heavy FIELD/geometry/Production work;
  - verify 1 -> 4 -> 1 viewport rects, selected viewport, controls.enabled, camera projection/control screen bounds, splitters;
  - compare against `dad764ce...` if needed to determine whether the defect predates Progressive FIELD work.
- bounded viewport-core fix is allowed only after reproduction if cause is inside camera input/presentation infrastructure.
- after BEADS baseline passes, return to C SOL; do not automatically close or continue Progressive FIELD.

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

## Current blockers / follow-up
- ACTIVE: BEADS/basic viewport interaction baseline: rotate, zoom, 1/4-view behavior.
- Progressive FIELD author visual gate is SUSPENDED until viewport baseline passes.
- `npm run test:skin-rebuild` previously hit environment-level `uv_os_get_passwd ENOMEM`; do not misreport as code PASS/FAIL.
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
- active viewport diagnostic: `docs/tasks/C_VIEWPORT_INTERACTION_BASELINE_DIAGNOSTIC_V0.md`
- Fix 2: `docs/tasks/C_RUNTIME_STATUS_PROGRESSIVE_FIELD_V0_FIX2_INTERACTIVE_FIELD_AND_LAYER_RETURN.md`
- Fix 1 dense gate: `docs/tasks/C_RUNTIME_STATUS_PROGRESSIVE_FIELD_V0_FIX1_DENSE_GATE.md`
- progressive FIELD task: `docs/tasks/C_RUNTIME_STATUS_PROGRESSIVE_FIELD_V0.md`
- queued durability audit: `docs/tasks/C_SINGLE_ATTACHMENT_DURABILITY_AUDIT_V0.md`

## Next gate
1. C LUNA diagnoses BEADS/basic viewport interaction from `3219f093...` on J.
2. Restore/verify rotate, pan, zoom, and 1/4-view baseline if a bounded viewport-core defect is confirmed.
3. C SOL reviews the viewport diagnosis/fix.
4. Only then re-run Progressive FIELD author visual gate.
5. Do not automatically continue to any other C task.
