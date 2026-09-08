# C — View Representation Continuity v0 Fix 1 — Secondary View Switch

Date: 2026-09-08
Owner: C SOL
Implementation owner: C LUNA
Status: ACTIVE

## Trigger

C SOL review of `a7b92822a8690a93b6e4d6c7ed954a59a1d2b592` found one bounded race:

- primary `MESH` starts the progressive preview worker;
- switching from MESH to `GRAPH`, `DIAGNOSTICS`, or `PRINT PREVIEW` does not currently cancel that preview build;
- when the worker completes, `installPreviewMesh(...)` sets renderer/UI View Layer back to `mesh`;
- therefore a late preview result can steal the author's newer secondary-view selection.

This is the only active defect for View Representation Continuity v0 review.

## Start point

- branch: `agent/skin-view-representation-continuity-v0`
- base/head: `a7b92822a8690a93b6e4d6c7ed954a59a1d2b592`
- J-side only
- no merge/rebase/unrelated cleanup

## Required fix

Make departure from primary MESH to any secondary top-level view (`graph`, `diagnostics`, `print-preview`) safe against late preview completion.

Preferred bounded behavior:

- cancel the active authoring preview mesh worker when leaving MESH for a secondary view;
- preserve any already-current `previewMeshCache` for later reuse;
- do not invalidate authoring geometry merely because the author changed views;
- do not let a late/stale worker result call `installPreviewMesh(...)` and change the active layer after the author selected another view.

Do not add per-view workarounds if one shared departure/cancellation rule solves it.

## Browser gate

In one session:

1. choose MESH with no current cache so coarse/refine generation starts;
2. before completion switch to GRAPH; confirm GRAPH remains selected after enough time for the old worker to have completed;
3. repeat for DIAGNOSTICS;
4. repeat for PRINT PREVIEW;
5. return to MESH and confirm a valid current cache is reused when available, or a new preview starts normally if the prior build was cancelled before producing a current cache;
6. BEADS -> MESH -> FIELD behavior remains intact;
7. camera-only navigation still does not regenerate MESH;
8. no Production / Support / Export callback is triggered by these switches;
9. no console errors.

Run focused tests, typecheck, build, and `git diff --check`.

## Protected scope

Do not change Production BODY / Graph / Support / supportSource, FIELD semantics, FKEI, Export, 3MF, Stage 6 authority, Opening Map semantics, compute endpoint, or geometry algorithms.

## Done when

Push the minimal fix, report commit SHA / remote HEAD / changed files / browser evidence, then STOP for C SOL review.
