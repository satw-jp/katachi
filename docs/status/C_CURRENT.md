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
- View Representation Continuity v0 implementation checkpoint: `a7b92822a8690a93b6e4d6c7ed954a59a1d2b592`
- View Representation Continuity v0 accepted checkpoint: `77f121cda5d60a2e443a994c00a05c7630417c15`

## Local/runtime authority
- C J workspace authority: `J:\dev\worktrees\skin-field-vnext-interaction-v0`
- J canonical clone: `J:\dev\katachi`
- shared user-managed samples: `J:\dev\samples`
- `C:\dev\samples` is not authority
- live compute/helper: `J:\dev\katachi-compute-helper-tray`
- verified capability endpoint: `127.0.0.1:47658/v1/capabilities`

## Current phase
Runtime Status + Progressive FIELD v0 remains PASS / CLOSED.

View Representation Continuity v0 remains accepted at `77f121cda5d60a2e443a994c00a05c7630417c15`, but author use immediately exposed two bounded presentation defects. Fix 2 is ACTIVE and does not reopen the accepted representation architecture.

Accepted representation model remains:
- primary author-facing continuum: `BEADS · Fast -> MESH · Surface -> FIELD · Exact`;
- secondary group: `GRAPH / DIAGNOSTICS / PRINT PREVIEW`;
- primary MESH means current authoring preview mesh from the current Host / Patch state, not Stage 6 / Opening Map / Export authority;
- existing progressive preview-mesh worker path is reused: coarse result first, then refined result;
- current preview cache is reusable on re-entry;
- camera-only interaction does not regenerate MESH;
- authoring mutation invalidates preview generation;
- MESH departure cancels only any active preview worker and preserves valid current cache;
- late worker completion cannot steal a newer GRAPH / DIAGNOSTICS / PRINT PREVIEW selection;
- Production / Support / FIELD semantic / FKEI / Export / 3MF / Stage 6 authority remain unchanged.

### New author evidence — 2026-09-08

1. FIELD interaction framing bug:
   - settled FIELD looks correct;
   - beginning view-rotate can show an enlarged / cropped / over-upscaled coarse FIELD frame;
   - continuing the rotation returns to expected framing;
   - coarse interaction may be low-resolution, but framing must never jump.

2. MESH normal-style bug:
   - selecting primary MESH while UI says normal/solid can show a translucent Ghost-like surface;
   - toggling Ghost and then normal restores opaque MESH.

3. Internal-structure observation:
   - MESH currently exposes internal structure while BEADS/FIELD do not;
   - broader structure visibility will change later and is DEFERRED.

C SOL root-cause finding for MESH style:
- `keepInternalGraphVisibleInMesh()` still uses the legacy inspection rule `observationModeKeepingInternalGraphVisible(...)`;
- when `viewMode === "mesh"`, observation mode is normal, and internal edges exist, that rule automatically promotes to `ghostSkin`;
- this explains both the unexpected translucent MESH and why internal structure appears specifically through MESH;
- that automatic promotion conflicts with the new primary authoring-MESH role and should be removed from the primary MESH path while explicit Ghost/internal inspection facilities remain available.

FIELD framing root cause is not yet proven. The current interactive FIELD path renders the same shader/material into a reusable low-resolution `WebGLRenderTarget` (`FIELD_INTERACTION_RENDER_SCALE = 0.25`) and upscales it. The browser diagnosis must distinguish CSS viewport coordinates, renderer pixel ratio/drawing-buffer coordinates, target dimensions, scissor/viewport restoration, and first-frame camera/projection timing before making a fix.

## Active implementation instruction
- owner: C SOL -> C LUNA
- task: `View Representation Continuity v0 Fix 2 — FIELD interaction scale + MESH normal style`
- spec: `docs/tasks/C_VIEW_REPRESENTATION_CONTINUITY_V0_FIX2_FIELD_SCALE_AND_MESH_STYLE.md`
- continue from branch: `agent/skin-view-representation-continuity-v0`
- continue from checkpoint: `77f121cda5d60a2e443a994c00a05c7630417c15`
- execution: J-side only
- diagnostic-first for FIELD framing; do not guess the scale/crop cause

Fix 2 required outcomes:
1. beginning FIELD rotate/pan/zoom may reduce resolution but must preserve exact settled framing;
2. no first-frame magnification/crop jump in 1-view or 4-view;
3. release still resumes accepted refinement;
4. primary MESH in normal/solid remains opaque and does not auto-promote to Ghost merely because internal Graph exists;
5. explicit Ghost remains functional;
6. broader internal-structure visibility redesign remains DEFERRED;
7. no Production / Support / FIELD semantic / Export / Stage 6 authority changes;
8. push and STOP for C SOL review.

## PASS / CLOSED
- C Research closed enough for v0
- Production architecture PASS / LOCKED
- Geometry Fidelity PASS / CLOSED
- Removable Support wiring PASS / CLOSED
- 3MF PASS
- First Physical Gate PASS / CLOSED for accepted near-vertical print regime
- UI IA v0A PASS / CLOSED at `c64cf091...`
- FIELD vNext Interaction Correctness PASS / CLOSED at `dad764ce...`
- C J workspace/runtime bootstrap PASS
- compute/helper J cutover + connection PASS
- Runtime Status + Progressive FIELD v0 PASS / CLOSED
- Viewport Input / Redraw Diagnostic v1 PASS / CLOSED at `7006e0d...`
- View Representation Continuity v0 architecture / Fix 1 PASS at `77f121cd...`; Fix 2 presentation correction is active

## Remaining follow-up / evidence boundaries
- Permanent Structure durability remains `FAIL / LOCALIZED`; audit is QUEUED and still scheduled after current Astra work.
- broader internal-structure visibility across BEADS / MESH / FIELD is DEFERRED; do not redesign it inside Fix 2.
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
- View Representation Continuity design: `docs/tasks/C_VIEW_REPRESENTATION_CONTINUITY_V0.md`
- View Representation Continuity Fix 1: `docs/tasks/C_VIEW_REPRESENTATION_CONTINUITY_V0_FIX1_SECONDARY_SWITCH.md`
- active Fix 2: `docs/tasks/C_VIEW_REPRESENTATION_CONTINUITY_V0_FIX2_FIELD_SCALE_AND_MESH_STYLE.md`
- queued durability audit: `docs/tasks/C_SINGLE_ATTACHMENT_DURABILITY_AUDIT_V0.md`
- shared physical observation note: `docs/evidence/SKIN_FIRST_PHYSICAL_PRINT_AUTHOR_OBSERVATIONS_2026-09-06.md`

## Next gate
1. C LUNA diagnoses and fixes only Fix 2 on `agent/skin-view-representation-continuity-v0` from `77f121cd...`.
2. Verify FIELD coarse interaction framing and MESH normal/ghost truthfulness in the browser.
3. Return commit / exact diff / browser evidence to C SOL and STOP.
4. Do not start durability, structure redesign, Usagi, Outside->Outside Support, External STL Host, or another UI task.
