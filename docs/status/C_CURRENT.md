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

### Fix 2 direct SOL review
Candidate: `agent/skin-view-representation-continuity-v0` / `8884f12a8c9cedde205d8eed8a86c67fa4bdbfd2`
Parent: `77f121cda5d60a2e443a994c00a05c7630417c15`
Remote/local reported MATCH; GitHub remote branch HEAD confirmed at `8884f12...`.

Diff scope is one commit and presentation/runtime files/tests only:
- `src/studies/skin/fieldPreviewPresentation.ts` + focused test
- `src/studies/skin/renderer.ts`
- `src/studies/skin/main.ts`
- `src/studies/skin/previewMeshBuffers.ts`
- authoring/original-shell tests

FIELD framing fix:
- interactive FIELD render target now accounts for renderer device pixel ratio;
- target width/height are scaled by one common factor so viewport aspect ratio is preserved;
- the low-resolution target remains presentation-only; camera projection/FIELD SDF/payload semantics are unchanged.

MESH style fix:
- legacy `observationModeKeepingInternalGraphVisible()` auto-promotion was removed;
- primary MESH no longer switches normal/solid to `ghostSkin` merely because an internal graph exists;
- explicit Ghost / internal inspection modes remain available;
- permanent/internal graph data synchronization remains intact; only automatic presentation promotion was removed.

Reported worker evidence:
- FIELD 1-view / 4-view interaction framing browser QA PASS;
- MESH normal/Ghost switching PASS;
- console errors 0;
- focused tests / typecheck / build / diff check PASS;
- an existing `originalEditorShell.test.ts` baseline mismatch is reported separately; Fix 2 does update assertions that intentionally encoded the removed auto-Ghost behavior, but unrelated remaining baseline drift is not part of this visual gate.

C SOL verdict:
- source/scope: STRUCTURAL PASS;
- Production / Support / FIELD semantic / Export / Stage 6 boundary: PASS;
- final Fix 2 status: AUTHOR VISUAL HOLD.

## Active implementation instruction
- NONE.
- Do not modify code before author visual confirmation.
- Author verifies on `8884f12...`:
  1. settled FIELD -> begin rotate/pan/zoom: image may become coarse but must NOT magnify, crop, stretch, or jump framing;
  2. keep moving and release: camera follows correctly and idle refinement returns;
  3. repeat in 4-view if practical: no first-frame framing jump;
  4. select MESH while display style is normal/solid: MESH is opaque immediately;
  5. explicit Ghost -> normal works normally and is no longer required as a recovery workaround.
- If these pass, C SOL closes Fix 2 / View Representation Continuity v0 without further implementation.
- If any fail, scope only the exact observed presentation defect.

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

## Remaining follow-up / evidence boundaries
- Permanent Structure durability remains `FAIL / LOCALIZED`; audit is QUEUED and scheduled after current Astra work when explicitly started.
- broader internal-structure visibility across BEADS / MESH / FIELD is DEFERRED; structure representation will be revisited later.
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
- `docs/tasks/C_SINGLE_ATTACHMENT_DURABILITY_AUDIT_V0.md`
- `docs/evidence/SKIN_FIRST_PHYSICAL_PRINT_AUTHOR_OBSERVATIONS_2026-09-06.md`

## Next gate
Author visual confirmation only. No C implementation task is active.
Do not auto-start durability, structure redesign, Usagi, Outside->Outside Support, External STL Host, or another UI task.
