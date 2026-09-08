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
- View Representation Continuity Fix 3 accepted checkpoint: `59ebb3cfb781442a1583509d5e8b5ea40120ff94`

## Local/runtime authority
- C J workspace authority: `J:\dev\worktrees\skin-field-vnext-interaction-v0`
- J canonical clone: `J:\dev\katachi`
- shared user-managed samples: `J:\dev\samples`
- `C:\dev\samples` is not authority
- live compute/helper: `J:\dev\katachi-compute-helper-tray`
- verified capability endpoint: `127.0.0.1:47658/v1/capabilities`

## Current phase
Runtime Status + Progressive FIELD v0 remains PASS / CLOSED.

View Representation Continuity v0 is PASS / CLOSED at `59ebb3cfb781442a1583509d5e8b5ea40120ff94` after final author visual confirmation.

Accepted representation model:
- primary continuum: `BEADS · Fast -> MESH · Surface -> FIELD · Exact`;
- secondary group: `GRAPH / DIAGNOSTICS / PRINT PREVIEW`;
- primary MESH is current authoring preview mesh, not Stage 6 / Opening Map / Export authority;
- coarse -> refined preview mesh path reuses the existing worker;
- camera-only changes do not rebuild MESH;
- authoring mutations invalidate MESH;
- leaving MESH cancels only the active preview worker and preserves valid cache;
- late preview completion cannot steal a newer secondary view selection;
- primary MESH normal/solid remains opaque and does not auto-promote to `ghostSkin` merely because an internal graph exists;
- explicit Ghost remains available;
- FIELD interaction may drop to a coarse offscreen presentation, but framing stays stable and release resumes idle refinement;
- Production / Support / FIELD semantic / FKEI / Export / 3MF / Stage 6 authority remain unchanged.

### Fix 3 closure
Candidate: `agent/skin-view-representation-continuity-v0` / `59ebb3cfb781442a1583509d5e8b5ea40120ff94`
Parent: `8884f12a8c9cedde205d8eed8a86c67fa4bdbfd2`

Root cause:
- direct coarse FIELD kept correct framing;
- offscreen target was `407×230`;
- with renderer pixel ratio about `1.5`, the explicit `setViewport(0,0,target.width,target.height)` after `setRenderTarget(target)` produced an actual GL viewport about `611×345` while the offscreen target/scissor remained `407×230`;
- only a subregion of the target was rendered and then enlarged during upscale;
- camera projection and FIELD payload were unchanged.

Fix:
- removed only the redundant explicit render-target viewport call;
- Three.js `setRenderTarget(target)` now owns the target viewport;
- no camera/model scale, FIELD SDF/payload, Production, Support, Export, Stage 6, MESH architecture, or structure visibility semantics changed.

Evidence:
- worker: 5 rotate starts PASS, 4-view rotate PASS, FIELD -> BEADS -> FIELD PASS, tests/typecheck/build/diff/console PASS;
- author: final visual confirmation PASS on the actual author browser; rotate no longer magnifies/crops/jumps framing.

## Active implementation instruction
- NONE.
- Do not start another C implementation task automatically from this closure.
- broader internal-structure visibility across BEADS / MESH / FIELD remains DEFERRED.
- `docs/tasks/C_SINGLE_ATTACHMENT_DURABILITY_AUDIT_V0.md` remains QUEUED and should start after current Astra work when explicitly requested.
- Usagi / strong-overhang validation remains later explicit scope.

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
- MESH normal/Ghost correction PASS
- FIELD offscreen framing Fix 3 PASS
- View Representation Continuity v0 PASS / CLOSED at `59ebb3cf...`

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
No C implementation gate is active.

Priority order:
1. Finish the currently active Astra work.
2. Then, when explicitly started, run `docs/tasks/C_SINGLE_ATTACHMENT_DURABILITY_AUDIT_V0.md`.
3. Keep UI work observation-driven; scope only concrete defects reported by the author.

Do not auto-start durability, structure redesign, Usagi, Outside->Outside Support, External STL Host, or another UI task.
