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
- View Representation Continuity v0 implementation review checkpoint: `a7b92822a8690a93b6e4d6c7ed954a59a1d2b592`

## Local/runtime authority
- C J workspace authority: `J:\dev\worktrees\skin-field-vnext-interaction-v0`
- J canonical clone: `J:\dev\katachi`
- shared user-managed samples: `J:\dev\samples`
- `C:\dev\samples` is not authority
- live compute/helper: `J:\dev\katachi-compute-helper-tray`
- verified capability endpoint: `127.0.0.1:47658/v1/capabilities`

## Current phase
Runtime Status + Progressive FIELD v0 remains PASS / CLOSED.

View Representation Continuity v0 is in C SOL REVIEW HOLD after implementation `a7b92822a8690a93b6e4d6c7ed954a59a1d2b592`.

C SOL direct review:
- branch is exactly one commit ahead of `7006e0d...`;
- remote branch HEAD matches `a7b92822...`;
- changed files are presentation/runtime only: `main.ts`, `style.css`, `ui.ts`, `viewportMode.ts`, `viewportMode.test.ts`;
- primary IA is correctly split to `BEADS · Fast -> MESH · Surface -> FIELD · Exact` and secondary `GRAPH / DIAGNOSTICS / PRINT PREVIEW`;
- primary MESH now uses the authoring preview path instead of Stage 6 / Opening Map as its conceptual source;
- existing coarse -> refined preview worker/cache/generation path is reused;
- authoring mutation invalidates preview generation; camera-only changes do not;
- Production / Support / FIELD semantic / FKEI / Export / 3MF / Stage 6 authority boundaries remain unchanged in the reviewed diff.

One bounded defect remains before closure:
- if MESH preview generation is still running and the author switches to GRAPH / DIAGNOSTICS / PRINT PREVIEW, the secondary branch does not cancel the preview worker;
- a late worker completion calls `installPreviewMesh(...)`, which sets the renderer/UI layer back to MESH;
- therefore a late MESH result can steal a newer secondary-view selection.

## Active implementation instruction
- owner: C SOL -> C LUNA
- task: `docs/tasks/C_VIEW_REPRESENTATION_CONTINUITY_V0_FIX1_SECONDARY_SWITCH.md`
- continue from branch `agent/skin-view-representation-continuity-v0` / `a7b92822a8690a93b6e4d6c7ed954a59a1d2b592`
- J-side only
- fix only the MESH-worker / secondary-view switch race
- prefer one shared cancellation/departure rule
- preserve any valid current preview cache
- do not change Production / Support / FIELD semantics / Export / Stage 6 authority
- push minimal fix and STOP for C SOL review

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

## Remaining follow-up / evidence boundaries
- View Representation Continuity v0: STRUCTURAL PASS / FIX1 ACTIVE, not yet CLOSED.
- Permanent Structure durability remains `FAIL / LOCALIZED`; audit is QUEUED and still scheduled after current Astra work.
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
- External STL Host / triangle-mesh Host architecture
- Usagi
- durability implementation until explicitly started after current Astra work
- Outside->Outside Support
- new C research unless separately scoped
- retained C-side migration originals
- user-managed `J:\dev\samples`: do not commit, rename, reorganize, or delete without explicit instruction

## Relevant artifacts
- View Representation Continuity design: `docs/tasks/C_VIEW_REPRESENTATION_CONTINUITY_V0.md`
- active Fix 1: `docs/tasks/C_VIEW_REPRESENTATION_CONTINUITY_V0_FIX1_SECONDARY_SWITCH.md`
- queued durability audit: `docs/tasks/C_SINGLE_ATTACHMENT_DURABILITY_AUDIT_V0.md`
- shared physical observation note: `docs/evidence/SKIN_FIRST_PHYSICAL_PRINT_AUTHOR_OBSERVATIONS_2026-09-06.md`

## Next gate
1. C LUNA applies Fix 1 only.
2. Verify MESH-building -> GRAPH / DIAGNOSTICS / PRINT PREVIEW cannot be stolen back by late worker completion.
3. Return to C SOL and STOP.
4. If clean, C SOL can close View Representation Continuity v0.
5. Do not auto-start durability, Usagi, or another UI task afterward.
