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
- Progressive FIELD Fix 2 review checkpoint: `3219f093a8c9ed9165b5c66dea0bd2f4e87d8fdf`

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

Runtime Status + Progressive FIELD v0 remains OPEN only for the author visual gate after Fix 2.

### Fix 1 / dense gate
`1d473146...` recorded the C-compatible dense gate using `skin-rebuild-pattern5-regression.fkei` (39 patches / 273 primitives): recognizable coarse immediately after interaction, medium about 0.37 s, fine about 0.75 s, no multi-second stall during ~5.9 s observation; camera interruption restarted coarse -> medium about 0.26 s -> fine about 0.66 s. Compute CUDA -> offline -> CUDA restore was also observed.

### Fix 2 C SOL review
C SOL directly reviewed `agent/skin-runtime-status-progressive-field-v0` at `3219f093a8c9ed9165b5c66dea0bd2f4e87d8fdf`.

Review facts:
- parent is exactly `1d473146d6c9364f84d2435a64efb4175bc057f1`; branch is one commit ahead and remote HEAD matches;
- changed files are only `src/studies/skin/fieldPreviewPresentation.ts`, its focused test, and `src/studies/skin/renderer.ts`;
- no Production BODY / Graph / Support / FKEI / Export implementation file is changed;
- no FIELD shader/SDF math or primitive/payload semantic file is changed by Fix 2;
- interactive FIELD uses a reusable offscreen `WebGLRenderTarget` at 25% viewport linear resolution, minimum 96x64, then upscales to the normal viewport;
- the same active FIELD material/payload is rendered in the interactive target; no primitive subset/decimation is introduced;
- interaction policy prefers coarse interactive FIELD over BEADS when the interactive target is available;
- leaving FIELD hides legacy/vNext/interactive FIELD presentations, and layer switching now explicitly requests a render;
- focused tests include interactive FIELD and repeated FIELD -> BEADS transition coverage;
- worker-reported focused tests 7/7, typecheck, diff check, Vite build, Browser QA: PASS;
- `npm run test:skin-rebuild` remains blocked by environment-level `uv_os_get_passwd ENOMEM`;
- standard build output to J encountered environment/filesystem `EPERM`; do not misreport either environment failure as code PASS/FAIL;
- GitHub commit has no attached CI status checks.

C SOL verdict:
- Fix 2 source/scope: STRUCTURAL PASS.
- Production/FIELD semantic boundary: PASS.
- Runtime Status + Progressive FIELD v0 overall: AUTHOR VISUAL HOLD.

## Active implementation instruction
- NONE.
- Do not modify code before author visual gate.
- Author must verify from settled FIELD vNext:
  1. rotate/pan/zoom continuously while a coarse FIELD-like surface remains visible and follows the camera;
  2. interaction starts without waiting for another fine frame;
  3. releasing interaction restarts refinement at the final pose;
  4. FIELD -> BEADS returns immediately in one click with no stale FIELD;
  5. BEADS -> FIELD retains vNext preference;
  6. repeat FIELD <-> BEADS several times with no stale fullscreen FIELD.
- If author visual gate passes: C SOL may close Runtime Status + Progressive FIELD v0 without further implementation.
- If author visual gate fails: scope only the observed remaining interaction/layer-return defect; do not auto-start another C lane.

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
- Progressive FIELD Fix 1 dense timing gate PASS for current C-compatible 273-primitive sample
- Progressive FIELD Fix 2 structural/source review PASS at `3219f093...`

## Current blockers / follow-up
- ACTIVE GATE ONLY: author visual confirmation of Fix 2 interactive FIELD + FIELD -> BEADS return.
- Runtime Status + Progressive FIELD v0 remains HOLD until that author visual gate passes.
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
- Fix 2: `docs/tasks/C_RUNTIME_STATUS_PROGRESSIVE_FIELD_V0_FIX2_INTERACTIVE_FIELD_AND_LAYER_RETURN.md`
- Fix 1 dense gate: `docs/tasks/C_RUNTIME_STATUS_PROGRESSIVE_FIELD_V0_FIX1_DENSE_GATE.md`
- progressive FIELD task: `docs/tasks/C_RUNTIME_STATUS_PROGRESSIVE_FIELD_V0.md`
- superseded visibility-only task: `docs/tasks/C_RUNTIME_STATUS_FIELD_VISIBILITY_V0.md`
- prior interaction task: `docs/tasks/C_FIELD_VNEXT_INTERACTION_CORRECTNESS_V0.md`
- queued durability audit: `docs/tasks/C_SINGLE_ATTACHMENT_DURABILITY_AUDIT_V0.md`

## Next gate
1. Author visually tests `3219f093...` on J.
2. C SOL closes Progressive FIELD v0 only if interactive FIELD and FIELD -> BEADS both pass in actual author use.
3. Do not automatically continue to any other C task after this gate.
