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
- View Representation Continuity v0 implementation checkpoint: `a7b92822a8690a93b6e4d6c7ed954a59a1d2b592`
- View Representation Continuity Fix 1 accepted checkpoint: `77f121cda5d60a2e443a994c00a05c7630417c15`
- View Representation Continuity Fix 2 structural checkpoint: `8884f12a8c9cedde205d8eed8a86c67fa4bdbfd2`

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
Candidate: `agent/skin-view-representation-continuity-v0` / `8884f12a8c9cedde205d8eed8a86c67fa4bdbfd2`

C SOL source/scope review remains STRUCTURAL PASS, and the MESH normal/Ghost correction is accepted structurally:
- legacy auto-promotion from normal MESH to `ghostSkin` was removed;
- primary MESH no longer becomes translucent merely because an internal graph exists;
- explicit Ghost remains available;
- broader internal-structure visibility remains DEFERRED.

However the FIELD author visual gate FAILED on the actual author browser after Fix 2:
- settled FIELD framing is correct;
- beginning view rotate still produces a dramatically enlarged / cropped coarse FIELD frame;
- the author screenshot shows the interaction presentation occupying only a partial logical field and being enlarged to the viewport;
- therefore adding DPR to low-resolution target sizing did not fix the underlying framing defect.

Fix 2 is NOT closed for FIELD framing.

## Active implementation instruction
- owner: C SOL -> C LUNA
- task: `View Representation Continuity v0 Fix 3 — FIELD Offscreen Viewport Framing`
- spec: `docs/tasks/C_VIEW_REPRESENTATION_CONTINUITY_V0_FIX3_FIELD_OFFSCREEN_VIEWPORT.md`
- branch: `agent/skin-view-representation-continuity-v0`
- start checkpoint: `8884f12a8c9cedde205d8eed8a86c67fa4bdbfd2`
- execution: J-side only
- diagnostic-first; do not guess another DPR factor

Mandatory Fix 3 diagnosis:
1. A/B current offscreen low-resolution FIELD vs same coarse FIELD rendered directly to the normal viewport;
2. if direct coarse is stable and offscreen is not, isolate offscreen target / viewport / scissor / upscale coordinates;
3. record actual GL `VIEWPORT` / `SCISSOR_BOX` after `setRenderTarget(target)` and after explicit `setViewport(...)`, plus renderer pixel ratio, drawing-buffer size, CSS viewport rect, target size, and first-frame camera projection;
4. determine whether render-target coordinates are being DPR-scaled twice or otherwise cover only a subregion;
5. make only the minimal FIELD presentation fix;
6. preserve low-resolution interaction and accepted refinement behavior.

Do not change camera/model scale, Output Scale, FIELD SDF/payload semantics, Production, Support, Export, Stage 6, MESH architecture, or structure visibility design.

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
1. C LUNA runs Fix 3 from `8884f12...`.
2. Name the exact offscreen/direct-render boundary before patching.
3. Verify on the actual browser scaling/DPR condition that interaction can become coarse without any magnification/crop/framing jump.
4. Push and STOP for C SOL review.
5. Do not auto-start durability, structure redesign, Usagi, Outside->Outside Support, External STL Host, or another UI task.
