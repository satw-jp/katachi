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
- viewport input/redraw baseline accepted checkpoint: `7006e0d359ad605ccaa84cc2be85fb29da3c27d9`
- View Representation Continuity implementation checkpoint: `a7b92822a8690a93b6e4d6c7ed954a59a1d2b592`
- View Representation Continuity Fix 1 accepted checkpoint: `77f121cda5d60a2e443a994c00a05c7630417c15`
- View Representation Continuity Fix 2 structural checkpoint: `8884f12a8c9cedde205d8eed8a86c67fa4bdbfd2`
- View Representation Continuity Fix 3 structural checkpoint: `59ebb3cfb781442a1583509d5e8b5ea40120ff94`

## Local/runtime authority
- C J workspace authority: `J:\dev\worktrees\skin-field-vnext-interaction-v0`
- J canonical clone: `J:\dev\katachi`
- shared user-managed samples: `J:\dev\samples`
- `C:\dev\samples` is not authority
- live compute/helper: `J:\dev\katachi-compute-helper-tray`
- verified capability endpoint: `127.0.0.1:47658/v1/capabilities`

## Current phase
Runtime Status + Progressive FIELD v0 remains PASS / CLOSED.

View Representation Continuity architecture remains accepted:
- primary continuum: `BEADS · Fast -> MESH · Surface -> FIELD · Exact`;
- secondary group: `GRAPH / DIAGNOSTICS / PRINT PREVIEW`;
- primary MESH is current authoring preview mesh, not Stage 6 / Opening Map / Export authority;
- coarse -> refined preview mesh path reuses the existing worker;
- camera-only changes do not rebuild MESH;
- authoring mutations invalidate MESH;
- leaving MESH cancels only the active preview worker and preserves valid cache;
- Production / Support / FIELD semantic / FKEI / Export / 3MF / Stage 6 authority remain unchanged.

### Fix 2 status
MESH normal/Ghost correction is accepted structurally:
- legacy auto-promotion from normal MESH to `ghostSkin` was removed;
- primary MESH no longer becomes translucent merely because an internal graph exists;
- explicit Ghost remains available;
- broader internal-structure visibility remains DEFERRED.

FIELD framing portion of Fix 2 failed author visual confirmation and is superseded by Fix 3.

### Fix 3 direct SOL review
Candidate: `agent/skin-view-representation-continuity-v0` / `59ebb3cfb781442a1583509d5e8b5ea40120ff94`
Parent: `8884f12a8c9cedde205d8eed8a86c67fa4bdbfd2`
Remote branch HEAD confirmed at `59ebb3cf...`.

Exact diff scope:
- `src/studies/skin/renderer.ts`: one runtime deletion only;
- `src/studies/skin/README.md`: observation record;
- `src/studies/skin/manifest.json`: version / observation record.

Diagnosis:
- direct coarse FIELD kept correct framing;
- offscreen target was `407×230`;
- with renderer pixel ratio about `1.5`, the explicit `setViewport(0,0,target.width,target.height)` after `setRenderTarget(target)` produced an actual GL viewport about `611×345` while the offscreen target/scissor remained `407×230`;
- only a subregion of the target was therefore rendered and then enlarged during upscale;
- camera projection and FIELD payload were unchanged.

Fix 3 removes only the redundant explicit render-target viewport call and relies on Three.js `setRenderTarget(target)` to install the target-owned viewport. No camera/model scale, FIELD SDF/payload, Production, Support, Export, Stage 6, MESH architecture, or structure visibility semantics changed.

Reported worker evidence:
- 5 rotate starts: PASS;
- 4-view rotate: PASS;
- FIELD -> BEADS -> FIELD: PASS;
- no framing jump / magnification / crop;
- tests / typecheck / build / diff check / console: PASS;
- deploy intentionally not run.

C SOL verdict:
- Fix 3 source/scope: STRUCTURAL PASS;
- root-cause evidence: PASS;
- Production / Support / FIELD semantic / Export / Stage 6 boundary: PASS;
- final FIELD framing status: AUTHOR VISUAL HOLD because the previous worker browser gate did not reproduce the actual author-browser failure.

## Active implementation instruction
- NONE.
- Do not modify code before author visual confirmation.
- Author verifies on `59ebb3cf...` only:
  1. settled FIELD -> begin rotate: coarse FIELD may appear but framing must not magnify/crop/jump;
  2. keep rotating and release: camera follows and idle refinement returns;
  3. FIELD -> BEADS -> FIELD still behaves normally.
- 4-view is optional for author confirmation because worker already exercised it.
- If these pass, C SOL closes Fix 3 and View Representation Continuity v0 with no further implementation.
- If they fail, scope only the exact remaining FIELD presentation defect.

## PASS / CLOSED
- C Research closed enough for v0
- Production architecture PASS / LOCKED
- Geometry Fidelity PASS / CLOSED
- Removable Support wiring PASS / CLOSED
- 3MF PASS
- First Physical Gate PASS / CLOSED for accepted near-vertical print regime
- UI IA v0A PASS / CLOSED
- FIELD vNext Interaction Correctness PASS / CLOSED
- Runtime Status + Progressive FIELD v0 PASS / CLOSED
- Viewport Input / Redraw Diagnostic v1 PASS / CLOSED
- View Representation Continuity architecture + Fix 1 PASS
- MESH normal/Ghost portion of Fix 2: structural PASS
- Fix 3 source/root-cause review: STRUCTURAL PASS

## Remaining follow-up / evidence boundaries
- Permanent Structure durability remains `FAIL / LOCALIZED`; audit is QUEUED and scheduled after current Astra work when explicitly started.
- broader internal-structure visibility across BEADS / MESH / FIELD is DEFERRED.
- strong-overhang / cantilever generalization remains UNVERIFIED.
- SKIN-support-alone full printability remains UNVERIFIED.
- 10,450 primitive historical v2-FKEI scalability remains UNVERIFIED.
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
- Stage 6 authority
- External STL Host / triangle-mesh Host architecture
- Usagi
- durability implementation until explicitly started after current Astra work
- Outside->Outside Support
- new C research unless separately scoped
- retained C-side migration originals
- user-managed `J:\dev\samples`: do not commit, rename, reorganize, or delete without explicit instruction

## Relevant artifacts
- `docs/tasks/C_VIEW_REPRESENTATION_CONTINUITY_V0.md`
- `docs/tasks/C_VIEW_REPRESENTATION_CONTINUITY_V0_FIX1_SECONDARY_SWITCH.md`
- `docs/tasks/C_VIEW_REPRESENTATION_CONTINUITY_V0_FIX2_FIELD_SCALE_AND_MESH_STYLE.md`
- `docs/tasks/C_VIEW_REPRESENTATION_CONTINUITY_V0_FIX3_FIELD_OFFSCREEN_VIEWPORT.md`
- `docs/tasks/C_SINGLE_ATTACHMENT_DURABILITY_AUDIT_V0.md`
- `docs/evidence/SKIN_FIRST_PHYSICAL_PRINT_AUTHOR_OBSERVATIONS_2026-09-06.md`

## Next gate
Author visual confirmation only on `59ebb3cf...`. No C implementation task is active.
Do not auto-start durability, structure redesign, Usagi, Outside->Outside Support, External STL Host, or another UI task.
