# SKIN Authoring Restoration R1 Inventory

Date: 2026-09-03  
Branch: `agent/skin-authoring-restoration-v0`  
Baseline: `f542f84d384fcdda30a815ddfb7b8162af1cf4f1`

This inventory is a pre-R2 audit of the current branch. The R2 change is
limited to reconnecting retained Surface Pattern authoring controls to the
Current workflow. No print geometry, Stage 8 support generation, export
assembly, or renderer support source is part of the restoration.

Classification:

- **A** — usable and reachable now.
- **B** — code/callback remains, but the capability is collapsed, auxiliary,
  Future/partial, or otherwise outside the main authoring path.
- **C** — the requested behavior is absent or explicitly unimplemented and
  would require a new restoration implementation.
- **D** — intentionally kept out of production authoring in this R1/R2 task.

## Base / Pattern

| Capability | Current classification | Current code location | Current UI location | Current test coverage | Historical reference | Restore? | Restoration method | Risk to Print baseline |
|---|---|---|---|---|---|---|---|---|
| Base Shape editing | A | `src/studies/skin/main.ts` host-param callbacks; `src/studies/skin/history.ts` `setHostParam` / `growHost` | Stage 1 `Base Shape` | `historyUndo.test.ts`, `authoringPreview.test.ts` | `9b69688` current author workflow checkpoint | no | Leave current controls and history path unchanged | None |
| Surface Pattern generation | A | `main.ts` `onPackPatches`; `field.ts`; `quadFlow.ts`; `voronoiFlow.ts`; `goldbergFlow.ts` | Stage 2 `Surface Pattern` generation cards and generate button | `quadFlow.test.ts`, `voronoiFlow.test.ts`, `goldbergFlow.test.ts`, `motifPatch.test.ts` | `9b69688` | no | Existing generation callbacks remain authoritative | None |
| Surface Pattern regenerate | A | `main.ts` `onPackPatches`, `onRepackFlowers`, `onFillLaceGaps` | Stage 2 generation and lace/contact controls | `historyUndo.test.ts`, `laceFill.test.ts`, `denseFlowerPreset.test.ts` | `9b69688` | no | Existing `packPatches` history entries | None |
| Pattern manual add | B | `main.ts` `onToggleAddPatchMode`, `handleClick`, `record(..., "addPatch")` | Existing `manualRow`, currently moved into collapsed Stage 5 `resultTools` | `historyUndo.test.ts`; pointer path is browser-only | `9b69688`; `c41d161` shell preservation | yes | Move the existing controls into a visible Stage 2 authoring panel; do not rewrite add behavior | None; authoring state only |
| Pattern selection | A/B | `main.ts` `onElementSelect`, `handleClick`; `ui.ts` `setElementRegistry` | 3D viewport click is active; registry is in auxiliary shelf | `elementTransform.test.ts`, `editorLayout.test.ts`; browser smoke required | `5acd5eb` viewport/overlay separation | yes, presentation only | Make the selection instruction/status part of the Stage 2 panel; keep selection state in `main.ts` | None |
| Pattern move / refine | B | `main.ts` `onElementEdit`, pointer drag, `applyElementEdit`; `elementTransform.ts` | Selected-element dock over viewport; registry/editor in auxiliary shelf | `elementTransform.test.ts`, `historyUndo.test.ts` | `5acd5eb` | yes, presentation only | Expose the existing selection-to-dock route through the Stage 2 authoring instructions | None |
| Pattern delete | B | `main.ts` `deleteSelectedPatch`, `record(..., "removePatch")` | Existing Delete button is inside collapsed Stage 5 `resultTools` | `historyUndo.test.ts`; browser smoke required | `9b69688` | yes, presentation only | Move the existing button beside manual add and selection status | None |
| Motif controls | A | `ui.ts` shape/motif controls; `main.ts` `onReshapePatch` | Stage 2 motif/shape controls; selected motif dock after selection | `motifPatch.test.ts`, `motifReshape.test.ts`, `denseFlowerPreset.test.ts` | `9b69688` | no | Keep existing production controls | None |
| Distribution controls | A | `quadFlow.ts`, `voronoiFlow.ts`, `goldbergFlow.ts`; `ui.ts` generation panels | Stage 2 distribution panels | `quadFlow.test.ts`, `voronoiFlow.test.ts`, `goldbergFlow.test.ts`, `voronoi.test.ts` | `9b69688` | no | Keep current Stage 2 controls | None |
| Manual placement | A | `field.ts` placement values; `main.ts` `setSkinParam`; selected motif placement edit | Stage 2 placement toggle and selected-element motif editor | `motifPatch.test.ts`, `motifReshape.test.ts` | `9b69688` | no | Keep placement as authoring data and history entries | None |
| Related viewport overlay | B | `ui.ts` overlay selector; `main.ts` overlay state and renderer calls | View/overlay dock; diagnostics are presentation-only | `viewportMode.test.ts`, `viewportClipping.test.ts`, `supportOverlayPresentation.test.ts` | `5acd5eb` | no for R2 | Keep overlays separate from authoring truth; only add a Stage 2 usage hint | None |

## Network

| Capability | Current classification | Current code location | Current UI location | Current test coverage | Historical reference | Restore? | Restoration method | Risk to Print baseline |
|---|---|---|---|---|---|---|---|---|
| Artwork Graph | B | `artworkGraph.ts`; `ui.ts` Stage 3 panel; `main.ts` graph snapshot callbacks | Stage 3 partial panel | `artworkGraph.test.ts`, `artworkGraphOverlayPresentation.test.ts` | `d2aca92` workflow guide | no in R2 | Leave partial stage boundary intact | None |
| Dry Web | B | `dryWebRouting.ts`, `dryWebLifecycle.ts`, `main.ts` Stage 4 callbacks | Stage 4 partial / diagnostic sections | `dryWebRouting.test.ts`, `dryWebLifecycle.test.ts`, `dryWebAuthorPresentation.test.ts` | `9b69688` / later research observations | no in R2 | Do not promote during Surface Pattern work | None |
| Spider Network | B | `src/studies/skin/rebuild/spiderGraph*.ts`; `main.ts` Stage 5/7 paths | Stage 5 and frozen/diagnostic material | `spiderGraph*Lab.test.ts`, `supportReachability.test.ts` | `9b69688` | no in R2 | Keep as a later R3 candidate | None |
| Graph generation | B | `main.ts` Stage 3/4/5 generation callbacks and workers | Stage 3/4/5 partial workflow | `artworkGraph.test.ts`, `dryWebRouting.test.ts`, `supportReachability.test.ts` | `d2aca92` | no in R2 | No changes | None |
| Graph regeneration | B | `main.ts` invalidation/recompute callbacks | Partial stage controls and diagnostics | `dryWebLifecycle.test.ts`, `heavyComputationLifecycle.test.ts` | later current workflow commits | no in R2 | No changes | None |
| Node visibility | B | `ui.ts` graph view panels; renderer overlay state in `main.ts` | Stage 3/4/5 graph view controls | `artworkGraphOverlayPresentation.test.ts`, `dryWebGraphViewPresentation.test.ts` | `5acd5eb` | no in R2 | Keep presentation-only | None |
| Edge visibility | B | `ui.ts` Dry Web graph view and support overlays | Stage 4/5 diagnostic panels | `dryWebGraphViewPresentation.test.ts`, `supportOverlayPresentation.test.ts` | `5acd5eb` | no in R2 | Keep presentation-only | None |
| Edge selection | C | Stage 5 placeholder explicitly says Graph editing is not implemented | No production edge editor; diagnostic highlighting only | Graph presentation tests cover display, not authoring edit | `d2aca92` | no in R2 | Defer to R3 editing model | None |
| Edge deletion | C | No production `onDeleteGraphEdge` callback; Stage 5 placeholder | Not available as production authoring | No behavior test exists | `d2aca92` | no in R2 | Defer; do not add a parallel graph editor in R2 | None |
| Pattern ↔ Network connection | C/B | `dryWebRouting.ts` and graph facts exist, but `ui.ts` labels Artwork Connections/Candidate management as not implemented | Stage 4 partial candidate path | `dryWebRouting.test.ts`, `surfaceGraph.test.ts` | `9b69688` | no in R2 | Preserve existing graph boundary; defer authoring connection commands | None |
| Local reinforcement | B | `ui.ts` contact panel; `main.ts` `onReinforceContacts` | Stage 2 contact panel, with later diagnostics | `contactStrength.test.ts`, `motifReshape.test.ts` | `9b69688` | no in R2 | Keep existing motif/contact operation; do not couple to removable Support | None |
| Red-face / region selection | B | `main.ts` Stage 4/7 surface diagnosis and region presentation | Stage 4/7 diagnostic panels | `surfaceAngleDiagnosis.test.ts`, `stage7RedFace*Presentation.test.ts`, `overhangRegions.test.ts` | `9b69688` and later Stage 7 checkpoints | no in R2 | Keep as diagnostics, not authoring truth | None |
| Network drag selection | C | Surface pointer selection/drag exists; no equivalent production graph-edge drag editor | No production network drag editor | `screenRectSelection.test.ts` covers selection math only | `5acd5eb` | no in R2 | Defer to R3 | None |

## Editing / Project

| Capability | Current classification | Current code location | Current UI location | Current test coverage | Historical reference | Restore? | Restoration method | Risk to Print baseline |
|---|---|---|---|---|---|---|---|---|
| Undo | A | `history.ts` and `main.ts` `requestShapeUndo` | Project bar / history dock | `historyUndo.test.ts`, `fkeiRuntimeSave.test.ts` | `9b69688` | no | Use the existing shape history | None |
| Redo | C | `main.ts` workflow snapshot/history routing; normal shape future stack; `history.ts` replay helper | Project bar / workflow history controls; normal Shape Redo was disabled | `historyUndo.test.ts`, rebuild workflow tests | `9b69688` and current recovery baseline | yes | Add a dedicated in-memory authoring future stack using replayable history entries; keep workflow and Support Paint redo paths separate | None |
| `.fkei Save` | A | `main.ts` `saveFkei`; `fkeiRuntimeSave.ts`; rebuild FKEI serializers | Project bar `.fkei Save` | `fkeiRuntimeSave.test.ts`, `rebuild/fkei.test.ts` | current printable baseline | no | Keep authoring and print snapshots separated | None |
| `.fkei Open` | A | `main.ts` `openFkei`; `fkeiRuntimeRestore.ts` | Project bar `.fkei Open` | `fkeiRuntimeRestore.test.ts`, `rebuild/fkei.test.ts` | current printable baseline | no | Keep Open atomic and editable | None |
| Round-trip editing | B | FKEI capture/restore plus shape history replay | Project bar; current path is test-covered but not obvious in author rail | `fkeiRuntimeSave.test.ts`, `fkeiRuntimeRestore.test.ts`, `rebuild/fkei.test.ts` | current printable baseline | yes, verification only | Browser-gate Save → Reload → editability; no format change | None |
| 1 view / 4 view | A | `main.ts` view mode; renderer viewport controls | View dock | `viewportMode.test.ts`, `multiViewport.test.ts` | `5acd5eb` | no | Keep current camera/view state | None |
| Camera | A | `renderer.ts`, `cameraTrackball.ts`, `main.ts` | Main viewport and view dock | `cameraTrackball.test.ts`, `viewportMode.test.ts` | `5acd5eb` | no | No changes | None |
| Viewport overlays | B | `main.ts`/`ui.ts` presentation state and overlay selectors | View dock and stage diagnostics | `viewportMode.test.ts`, `viewportClipping.test.ts`, `supportOverlayPresentation.test.ts` | `5acd5eb` | no in R2 | Preserve presentation-only overlays | None |
| Selection state | A/B | `main.ts` `selectedPatchId`; `ui.ts` registry and selected dock | Viewport selection; registry currently auxiliary | `elementTransform.test.ts`, `editorLayout.test.ts` | `5acd5eb` | yes, presentation only | Add clear Stage 2 selection status and instructions | None |

## Other / intentionally separated

| Capability | Current classification | Current code location | Current UI location | Current test coverage | Historical reference | Restore? | Restoration method | Risk to Print baseline |
|---|---|---|---|---|---|---|---|---|
| Legacy JSON transfer UI | D | `main.ts` retains legacy recipe parsing; rebuild removes `ui.historyIoRoot` from the production shell | Not shown in SKIN REBUILD Project bar | `historyUndo.test.ts`, `rebuild/fkei.test.ts` cover compatibility parsing | current rebuild shell | no | Keep compatibility parsing without reintroducing a competing UI | None |
| Advanced / Frozen / Research shelf | B | `ui.ts` `frozenExperiments` and `skin-auxiliary-frozen` | Collapsed/separate auxiliary shelf | `originalEditorShell.test.ts`, `workflowInventory.test.ts` | `f7abe36`, `d2aca92` | no in R2 | Keep separated and labeled | None |
| Old experimental diagnostics | D | Stage 4–7 diagnostic/presentation modules and frozen controls | Partial/auxiliary/diagnostic panels | Corresponding presentation and lifecycle tests | historical research observations in `src/studies/skin/README.md` | no | Do not promote to Current authoring | None |
| Production-excluded UI | D | Stage 5 placeholder and support/print diagnostics boundaries | Partial, auxiliary, or frozen sections | `workflowGuide.test.ts`, `workflowInventory.test.ts`, print gate tests | `d2aca92`, current recovery baseline | no | Keep Permanent Network and Stage 8 removable Support distinct | None |

## R1 conclusion

The required R2 Surface Pattern behavior is not a missing geometry feature.
The add/delete controls are created by `ui.ts`, the selection and edit paths
are wired in `main.ts`, the operations are recorded in `history.ts`, and the
FKEI path already preserves the authoring history. The concrete regression is
that the manual authoring nodes are appended to the collapsed Stage 5
`Graph screening / connection gauges` details after first being placed in
Stage 2, so they are no longer on the Current production path.

R2 will therefore move those existing DOM nodes into a labeled Stage 2
`Surface Pattern authoring` panel, keep the graph gauges in their existing
auxiliary location, and add a focused browser gate. No Stage 8 or export code
is required for the UI restoration.
