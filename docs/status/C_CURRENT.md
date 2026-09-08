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

View Representation Continuity v0 is PASS / CLOSED at `77f121cda5d60a2e443a994c00a05c7630417c15`.

Accepted representation model:
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

C SOL direct review of Fix 1:
- `a7b92822... -> 77f121cd...` is one commit, one file (`src/studies/skin/main.ts`), +5 lines;
- shared `departFromAuthoringPreviewMesh(nextLayer)` cancels the active preview worker only when leaving MESH;
- `cancelPreviewMeshBuild()` terminates the worker / clears progress state without clearing `previewMeshCache`;
- stale/late worker callbacks fail current-run checks after cancellation and cannot install MESH over a newer view selection;
- remote branch HEAD matches `77f121cd...`.

## Active implementation instruction
- NONE.
- Do not start another C implementation task automatically from this closure.
- UI work remains observation-driven; handle only concrete defects reported by the author.
- `docs/tasks/C_SINGLE_ATTACHMENT_DURABILITY_AUDIT_V0.md` remains QUEUED and should start after the currently active Astra work, when explicitly requested.
- Usagi / strong-overhang validation remains later explicit scope.

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
- View Representation Continuity v0 PASS / CLOSED at `77f121cd...`

## Remaining follow-up / evidence boundaries
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
- View Representation Continuity Fix 1: `docs/tasks/C_VIEW_REPRESENTATION_CONTINUITY_V0_FIX1_SECONDARY_SWITCH.md`
- queued durability audit: `docs/tasks/C_SINGLE_ATTACHMENT_DURABILITY_AUDIT_V0.md`
- shared physical observation note: `docs/evidence/SKIN_FIRST_PHYSICAL_PRINT_AUTHOR_OBSERVATIONS_2026-09-06.md`

## Next gate
No C implementation gate is active.

Priority order:
1. Finish the currently active Astra work.
2. Then, when the author explicitly starts it, run `docs/tasks/C_SINGLE_ATTACHMENT_DURABILITY_AUDIT_V0.md`.
3. In the meantime, keep UI work observation-driven and scope concrete issues individually.

Do not auto-start durability, Usagi, Outside->Outside Support, External STL Host, or another UI task.