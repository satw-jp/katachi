# SKIN REBUILD right-pane inventory

This inventory separates production authoring from future architecture and retained research material. It changes presentation only; no control, callback, saved field, geometry path or validation contract is deleted.

## A. Current production UI

| Capability | Surface | Retention contract |
| --- | --- | --- |
| Base Shape | Stage 1 | Original controls, history and recipe replay remain mounted. |
| Surface Pattern | Stage 2 | Original placement, motif, generation and manual editing remain mounted. |
| FKEI project lifecycle | Top PROJECT bar | `.fkei Open`, `.fkei Save`, atomic restore and `shapeRecipe` remain mounted. |
| Geometry / Mesh | Stage 6 | Existing mesh realization and exact cached export remain mounted. |
| Final validation | Stage 7 | Existing artwork diagnosis and fail-closed checks remain mounted. |
| Print / Export | Stage 8 | Separate support, final validation status and 3MF / STL / OBJ export remain mounted. |

## B. Future extension UI

| Capability | Surface | Retention contract |
| --- | --- | --- |
| Artwork Graph | Stage 3 | Graph snapshot and its existing callbacks stay directly visible. |
| Dry Web / structural integration | Stage 4 | Candidate network and Dry Web controls stay directly visible. |
| Spider / integrated network editing | Stage 5 and REBUILD pipeline controls | Spider routes, red-face reinforcement and Graph editing stay directly visible. |

`FUTURE` means the architecture can evolve after the physical-print checkpoint. It does not disable or hide the existing working controls.

## C. Advanced · Legacy / Research

The existing `.skin-auxiliary-frozen` shelf is retained as one collapsed `details` element in SKIN REBUILD. It contains auxiliary diagnostics, development status, historical print assembly/profile evidence and frozen experiments. Opening the shelf exposes the same DOM nodes and handlers. The original `/skin.html` label and open state remain unchanged.

The old raw JSON history transfer controls are not placed in this shelf for SKIN REBUILD; they were removed from that entry point's presentation in Task 3. The internal journal and FKEI lifecycle remain Current.

## Test classification

| Class | Contracts |
| --- | --- |
| Permanent | `model.test.ts`, `fkei.test.ts`, `originalSurfacePipeline.test.ts`, `cachedMeshExport.test.ts` |
| Migration | `originalEditorShell.test.ts`, `workflowPhaseNavigator.test.ts`, `workflowInventory.test.ts` |
| Legacy | original `/skin.html` JSON UI retention and `.skin-auxiliary-frozen` DOM/handler retention, asserted by the shell and inventory tests plus browser QA |

The three lists are also encoded in `workflowInventory.ts`; `workflowInventory.test.ts` requires them to be disjoint and requires FKEI, phase navigation and old-SKIN compatibility to remain classified.
