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

## Local/runtime authority
- C J workspace authority: `J:\dev\worktrees\skin-field-vnext-interaction-v0`
- J canonical clone: `J:\dev\katachi`
- shared user-managed samples: `J:\dev\samples`
- `C:\dev\samples` is not authority
- live compute/helper: `J:\dev\katachi-compute-helper-tray`
- verified capability endpoint: `127.0.0.1:47658/v1/capabilities`
- Compute indicator author check: PASS (`Compute ● CUDA` acceptable)

## Current phase
First Physical Gate, UI IA v0A, FIELD vNext capability retention, and the earlier FIELD vNext interaction task remain PASS / CLOSED.

Runtime Status + Progressive FIELD v0 is NOT closed.

### What passed
- `a1596883...` implements a bounded runtime-only Compute indicator and progressive FIELD state.
- `1d473146...` is evidence-only on top of `a1596883...` and records the C-compatible dense gate using `skin-rebuild-pattern5-regression.fkei` (39 patches / 273 primitives).
- dense gate evidence: recognizable coarse immediately after interaction, medium about 0.37 s, fine about 0.75 s, no multi-second stall during ~5.9 s observation; camera interruption restarted coarse -> medium about 0.26 s -> fine about 0.66 s.
- Compute author visual check: PASS.
- Production source paths / BODY / Graph / Support / FKEI / Export were not changed by the evidence commit.

### Author visual gate failure after dense gate
The author then tested the actual interaction and found two unresolved usability/correctness problems:

1. FIELD vNext becomes visible sooner, but the author still cannot comfortably rotate/pan/zoom while staying in a FIELD-like presentation. The settled/final presentation is still too heavy and interaction does not feel Blender-like.
2. After entering FIELD, switching back to BEADS does not reliably restore BEADS presentation.

This means timing-to-settle alone was insufficient evidence. The product requirement is now explicit: **while the camera is moving, FIELD should remain a very rough but recognizable FIELD surface and stay interactive**. BEADS is not the desired normal interaction proxy.

Current implementation mainly reduces raymarch march-step ceiling (proxy/coarse/medium/fine) while keeping viewport pixel workload. Fix 2 must reduce FIELD-only internal pixel/render resolution during interaction, not merely reduce march steps.

## Active implementation instruction
- owner: C SOL -> C LUNA
- task: `Progressive FIELD v0 Fix 2 · Interactive FIELD + Layer Return`
- spec: `docs/tasks/C_RUNTIME_STATUS_PROGRESSIVE_FIELD_V0_FIX2_INTERACTIVE_FIELD_AND_LAYER_RETURN.md`
- continue from: `agent/skin-runtime-status-progressive-field-v0` / `1d473146d6c9364f84d2435a64efb4175bc057f1`
- execution: J-side only

### Required Fix 2 behavior
- FIELD vNext remains a recognizable FIELD-like surface during rotate/pan/zoom, even if aggressively coarse/blocky.
- Prefer FIELD-only low-resolution offscreen/render-target presentation during interaction and upscale to viewport size.
- Interaction start from settled/fine FIELD must immediately enter low-cost interactive FIELD before another expensive fine frame.
- No medium/fine refinement while camera movement is active.
- Interaction end restarts idle refinement at the final camera pose.
- Do not subset/decimate primitives or redefine FIELD SDF semantics.
- `FIELD -> BEADS` must immediately cancel FIELD progression, hide all FIELD fullscreen/render-target output, and show current beads in one action.
- `BEADS -> FIELD` preserves the vNext backend preference.
- Repeat FIELD <-> BEADS browser gate at least 5 times with no stale FIELD output.
- Compute indicator already passed; preserve it without redesign.

## PASS / CLOSED
- C Research closed enough for v0
- Production architecture PASS / LOCKED
- Geometry Fidelity PASS / CLOSED
- Research M/M-R -> SKIN-native replay PASS
- Author Visual Gate for locked Production PASS
- Removable Support wiring PASS / CLOSED
- offset-bend support restored
- 3MF PASS
- FIELD vNext capability retention PASS at `349e1a...`
- Output Scale contract present
- legacy v088: `COMPATIBILITY_ONLY`
- First Physical Gate PASS / CLOSED for the accepted near-vertical print regime
- UI IA v0A PASS / CLOSED at `c64cf091...`
- FIELD vNext Interaction Correctness PASS / CLOSED at `dad764ce...`
- C J workspace/runtime bootstrap PASS
- compute/helper J cutover + connection PASS
- Compute tiny indicator author visual check PASS

## Current blockers / follow-up
- ACTIVE: FIELD interactive rendering from settled/fine state.
- ACTIVE: FIELD -> BEADS layer-return regression.
- Progressive FIELD v0 remains HOLD until Fix 2 + author visual PASS.
- `npm run test:skin-rebuild` previously hit environment-level `uv_os_get_passwd ENOMEM`; do not misreport this as code PASS/FAIL.
- 10,450 primitive historical v2-FKEI scalability remains UNVERIFIED and is not required for current C-compatible parser closure.
- Permanent Structure durability remains `FAIL / LOCALIZED`; audit is QUEUED, not active.
- strong-overhang/cantilever generalization remains UNVERIFIED.
- SKIN-support-alone full printability remains UNVERIFIED.
- Workflow Guide-derived console `NotFoundError` remains separate non-blocking follow-up.
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
- durability implementation
- Outside->Outside Support
- new C research unless separately scoped
- retained C-side migration originals
- user-managed `J:\dev\samples`: do not commit, rename, reorganize, or delete without explicit instruction

## Relevant artifacts
- active Fix 2: `docs/tasks/C_RUNTIME_STATUS_PROGRESSIVE_FIELD_V0_FIX2_INTERACTIVE_FIELD_AND_LAYER_RETURN.md`
- Fix 1 dense gate: `docs/tasks/C_RUNTIME_STATUS_PROGRESSIVE_FIELD_V0_FIX1_DENSE_GATE.md`
- progressive FIELD task: `docs/tasks/C_RUNTIME_STATUS_PROGRESSIVE_FIELD_V0.md`
- superseded visibility-only task: `docs/tasks/C_RUNTIME_STATUS_FIELD_VISIBILITY_V0.md`
- prior interaction task: `docs/tasks/C_FIELD_VNEXT_INTERACTION_CORRECTNESS_V0.md`
- queued durability audit: `docs/tasks/C_SINGLE_ATTACHMENT_DURABILITY_AUDIT_V0.md`

## Next gate
1. C LUNA implements Fix 2 from `1d473146...` on J.
2. C SOL reviews source/diff and Production boundary.
3. Author visual gate must confirm: FIELD rotates interactively as a coarse FIELD, and FIELD -> BEADS works reliably.
4. Do not automatically continue to any other C task after Fix 2 review.
