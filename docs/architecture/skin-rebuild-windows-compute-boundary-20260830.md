# SKIN REBUILD Windows compute backend boundary — 2026-08-30

Status: design and inventory only. No geometry function, saved schema,
dependency or generated output is changed by this document. The physical
print result for the current checkpoint remains the migration gate.

This document maps the current implementation to the future boundary already
outlined in `skin-rebuild-future-geometry-architecture.md`. That document
describes the target geometry concepts; this one names the current files and
functions that must remain in the browser, remain portable, stay on CPU, or
become candidates for a Windows-native CUDA backend.

## 1. Current production entry and frozen reference

The production route is not the small standalone prototype in
`src/studies/skin/rebuild/main.ts`.

```text
skin-rebuild.html
  -> src/studies/skin/main.ts        original editor shell and orchestration
     -> browser Workers             heavy CPU jobs
     -> src/studies/skin/rebuild/*   Stage 3–8 SKIN REBUILD additions
```

`src/studies/skin/rebuild/main.ts` remains useful as a comparison prototype
and test fixture, but it is not the architecture root for the public app.

Frozen reference:

- project commit before these docs: `2691c15e47c873e64f26f9496e94ef8ba0531d8c`;
- baseline file: `public/samples/skin-rebuild-first-print.fkei`;
- baseline SHA-256:
  `4bacfcced0fe311eef704a792d61f4a68531051ff408e26d5ff2937b8bbfadcf`;
- current Web/CPU output, thresholds, coordinates, topology repairs and
  FKEI behavior remain the reference until physical evidence is recorded.

## 2. Classification of the current code

### A. UI and browser-owned behavior

These responsibilities stay in the Web application on Windows, macOS, iPad
and other browsers. CUDA must not own them.

| responsibility | current files and functions | boundary decision |
| --- | --- | --- |
| Application orchestration | `src/studies/skin/main.ts`; event handlers, Worker lifecycle, `refresh*`, `set*`, `cancel*` and `renderFrame()` | Browser owns commands, current project selection, cancellation and presentation. It calls a geometry interface rather than CUDA directly. |
| UI construction | `src/studies/skin/ui.ts::buildUi()` and UI handles/callback types | Remains DOM/browser code. Backend capabilities may enable/disable controls but never generate the controls. |
| Viewport | `src/studies/skin/renderer.ts::SkinRenderer`, `shaders.ts`, `multiViewport.ts`, `viewportClipping.ts`, `cameraTrackball.ts` | Remains Three.js/WebGL presentation. Results arrive as portable mesh/graph buffers. |
| Picking and selection | `picking.ts::{pickPatchBySpheres,raymarchComposite,raymarchHost}`, `elementTransform.ts`, `rebuild/screenRectSelection.ts`, selection handlers in `main.ts` | Pointer ownership and selected IDs stay in the browser. Expensive ray queries may later call GeometryEngine, but selection semantics and hit presentation stay Web-owned. |
| Phase Navigator | `rebuild/workflowPhaseNavigator.ts::{SKIN_REBUILD_WORKFLOW_PHASES,moveSkinRebuildWorkflowPhase}` and `workflowInventory.ts` | Pure UI state; never a compute-backend concern. |
| FKEI Open/Save UI | `main.ts::{saveCurrentSkinRebuildFkei,saveCurrentFkeiProject,openFkeiProject,restoreSkinRebuildFkei}` | File chooser, download, status, atomic UI replacement and undo ownership stay in the browser. Parsing/model operations are category B. |
| Graph editing UI | Stage 3–8 `refresh*Presentation`, selected node/edge/region setters, Undo/Redo and display overlays in `main.ts`; the `*Presentation.ts` modules | Remains browser-owned. UI emits stable-ID graph commands; it does not edit GPU buffers. |
| Progress/status | `heavyComputationLifecycle.ts::{HeavyComputationLifecycle,HeavyComputationProgressState,isCurrentWorkerRun}` and Worker progress rendering in `main.ts` | Remains browser-owned and backend-neutral. |

The current `picking.ts` raymarch routines are small browser implementations.
They may remain as the interactive preview path even if final-quality queries
move native; CUDA latency or local-service availability must not block basic
selection.

### B. Platform-independent core

This layer is shared by Web and Windows native computation. It contains
authored intent, stable identities, contracts and validation facts, not DOM,
Workers, CUDA handles or renderer resources.

| responsibility | current files and functions | boundary decision |
| --- | --- | --- |
| Project/operation model | `history.ts::{SkinOp,SkinHistoryEntry,SkinRecipe,SkinState,record,replay,undoLastHistoryEntry}` | Portable reference data and deterministic command history. |
| Base and motif intent | `cloud-sculpt/field.ts::{Ball,FieldParams}`, `skin/field.ts::{Patch,PatchPoint,PatchShape,MotifShapeParams,SkinParams,captureMotifShapeParams}` | Types/parameters belong in core. `fieldSdf`, realization and projection functions in the same files belong in category C. The present files are mixed seams, not the desired package boundary. |
| SKIN REBUILD project facts | `rebuild/model.ts::{SkinRebuildSettings,SkinRebuildBase,SkinRebuildPatternSide,SkinRebuildLowestPoint,SkinRebuildProject,SkinRebuildAudit}` | Data types and assembly facts are portable. Heavy builders in the same file belong in C and should later be reached through an adapter without moving them during the freeze. |
| Node/edge graph data | `voronoi.ts::{Vector3Value,InternalStructureNode,InternalStructureEdge,InternalStructureGraph}` | Portable graph facts. Current edges are straight endpoint pairs; future curve realization must be additive. |
| Graph Core | `graphCore.ts` canonical serialization, provenance, revisions and strict validation | Portable core and CPU-reference behavior. |
| Surface/Artwork graph | `surfaceGraph.ts` and `artworkGraph.ts` data, validation, stable IDs, candidate lifecycle and serialization | Portable core. The current `SurfaceGraph` is a graph of Surface Pattern instances, not the proposed future Base Surface Graph; the two names/contracts must remain distinct. |
| FKEI | `fkei.ts`, `fkeiRuntimeSave.ts`, `fkeiRuntimeRestore.ts`, `fkeiRestoreIdentity.ts`, `rebuild/fkei.ts` | Backend-independent parsing, budgets, compatibility, atomic restore and authored facts. Optional computed evidence remains portable data and is always invalidatable/recomputable. |
| Physical/validation contracts | `printProfile.ts`, `overhangSupportPolicy.ts`, `bodyProvenance.ts`, request/result types in `*WorkerProtocol.ts` | Thresholds, coordinate policies, request identity and result facts live in core. The actual scans belong in C. |
| Coordinate contract | source/object coordinates, `targetLongestMm`, build-plate Z shift and saved-STL Float32-mm facts in `meshExportWorkerProtocol.ts`, `internalPrintGateWorkerProtocol.ts` and mesh result types | Explicit shared contract; a backend cannot infer or silently renormalize it. |

The existing Worker protocol files are the best current evidence that the
boundary can be serialized. They already transfer `Ball[]`, `Patch[]`,
`InternalStructureGraph`, quality settings and `Float32Array` results without
renderer state. The future interface should normalize these per-operation
protocols rather than expose the Worker class itself.

### C. Heavy geometry computation — Windows CUDA candidates

These paths scale with voxel count, triangle count, field primitive count or
large repeated collision queries. They are candidates, not authorization to
rewrite or move them now.

| compute family | current files and functions | current execution | future boundary |
| --- | --- | --- | --- |
| SDF evaluation | `cloud-sculpt/field.ts::{ballSdf,fieldSdf}`, `skin/field.ts::{patchesSdf,createPatchesSdfEvaluator,compositeSdf,createCompositeSdfEvaluator,projectToSurface}` | Main thread and Workers depending on caller | Batch field samples, signed distances, gradients and surface projection are engine operations. Preserve current evaluator/order as Web reference. |
| Mesh generation | `cloud-sculpt/meshExport.ts::{buildMeshFromField,meshGridShape,buildMeshTrianglesFromFieldSlice,polygonizeTet}`, `skin/meshExport.ts::{computeSkinMeshSamplingGrid,buildSkinMeshTrianglesSlice,buildSkinMesh}` | Up to 16 browser Workers via preview/export/gate Workers | First CUDA candidate: resolution-cubed field sampling plus marching-tetrahedra assembly. |
| Surface distribution/sampling | `field.ts::{generateShapePoints,packPatchesGreedy,projectToSurface}`, `quadFlow.ts`, `voronoiFlow.ts`, `goldbergFlow.ts`, `laceFill.ts` | Browser CPU | Projection/candidate scoring may be accelerated later. Deterministic seed/version and returned placement records remain core. |
| Point-in-mesh and signed mesh queries | `src/lib/geometry/pointInMesh.ts::{rayTriangleIntersectX,buildInsideTester}`; mesh import precedent in `src/studies/mpm/stlImport.ts` | Browser CPU | Batch BVH/grid queries are CUDA candidates, especially for STL Base Import. Parser and transform facts remain core. |
| Overhang and lowest-point diagnosis | `surfaceAngleDiagnosis.ts::{compileInternalGraphReachability,internalGraphReachesPoint,diagnoseSurfaceAngles,diagnoseSurfaceAnglePositions}`, `rebuild/overhangRegions.ts::{detectSkinRebuildOverhangRegions,sampleSkinRebuildOverhangRegionSurface}`, `motifLowestPoint.ts`, `rebuild/lowestPoint.worker.ts`, `surfaceAngle.worker.ts` | Browser Workers | Second CUDA candidate: triangle normal screen, attribution, region grouping inputs and reachability rays. Region IDs/threshold decisions return as portable facts. |
| Support classification and paint raycasts | `surfaceSupportClassification.worker.ts`, `surfaceSupportClassificationParallel.ts`, `supportPaintRaycast.worker.ts`, `supportReachability.ts` | Nested/browser Workers | Batch rays and spatial queries can be native. Paint strokes, user intent and assignment ledger stay core/browser. |
| Spider containment/collision/routing | `rebuild/model.ts::{auditSkinRebuildLatticeBaseContainment,buildSkinRebuildLattice,reinforceSkinRebuildOverhangRegion,buildSkinRebuildPrintSupport,retainConnectedSkinRebuildLatticeConnections}` and `rebuild/stage5bReinforcement.worker.ts` | Browser Worker/CPU with repeated Base-SDF checks | Third CUDA candidate: batch radius-aware containment, candidate route collision and contact validation. Topology commands and stable IDs remain core. |
| Final print gate and export | `meshExport.worker.ts`, `internalPrintGate.worker.ts`, `bambu3mf.worker.ts`; `skin/meshExport.ts`, `bambu3mf.ts`, `internalPrintGate.ts` | Browser Workers | High-resolution mesh creation and batch validation can move. STL/OBJ/3MF byte packaging may remain CPU after canonical triangles are returned. |
| Mesh topology diagnosis/repair | `cloud-sculpt/meshExport.ts::{inspectWatertight,computeConnectedComponentsWithKey,inspectSavedStlTopology,orientMeshForSavedStl}`, `rebuild/model.ts::{repairSkinRebuildFinalMesh,skinRebuildTopologyPass}` | Worker CPU | Parallel counting/sorting is an accelerator candidate, but the exact fail-closed policy and bounded repair decision remain shared validation contracts. |

The first CUDA implementation should not start with a shape generator. It
should start with a read-only or equivalence-testable kernel so the current
geometry can be compared without changing authoring behavior.

### D. CPU is sufficient

These operations are control/data work. Moving them to CUDA would add transfer
and failure complexity without a useful speedup.

| responsibility | current files and functions |
| --- | --- |
| Canonical JSON, fingerprints, provenance and revision lineage | `graphCore.ts::{canonicalize,canonicalStringify,serializeGraphDocument,parseGraphDocument,fingerprintGraph,createGraphRevision,advanceGraphRevision}` |
| Duplicate-ID and graph-schema checks | `graphCore.ts::{validateGraphDocument,validateTypedEdgeDescriptors}`, `surfaceGraph.ts::validateSurfaceGraph`, `artworkGraph.ts::validateArtworkGraph` |
| Graph lifecycle/edit decisions | `surfaceGraph.ts::{addSurfaceRelation,confirmSurfaceRelation,rejectSurfaceRelation,confirmedSurfaceComponents}`, `artworkGraph.ts::{createIntegrationCandidate,acceptArtworkCandidate,rejectArtworkCandidate,replaceSurfaceDraft}` |
| Small graph cleanup/deduplication and component bookkeeping | Stable-ID maps/sets and adjacency traversal in `surfaceGraph.ts`, `artworkGraph.ts` and `rebuild/model.ts`; geometry-aware containment checks are delegated back to C |
| History, metadata and serialization | `history.ts`, `bodyProvenance.ts`, `fkei*.ts`, `printProfile.ts` |
| UI-independent state reducers | `workflowPhaseNavigator.ts`, `viewportClipping.ts`, `editorLayout.ts`, `heavyComputationLifecycle.ts` |
| Binary/text packaging after validated geometry | `encodeBinaryStl`, OBJ text encoding and 3MF ZIP/XML packaging, unless profiling later proves them dominant |

## 3. Target interface

The desired dependency direction is:

```text
UI / Browser
    |
    | backend-neutral command + immutable snapshot
    v
GeometryEngine
    |-------------------------------|
    v                               v
WebGeometryEngine                  WindowsCudaGeometryEngine
current CPU/Worker implementation  local native service/worker
```

The interface is deliberately job-oriented rather than a chatty per-point
API. A native boundary cannot afford one IPC call per SDF sample.

```ts
type GeometryRequest =
  | BuildMeshRequest
  | SampleSurfaceRequest
  | DiagnoseOverhangRequest
  | BuildSpiderRequest
  | ValidateTopologyRequest;

interface GeometryJobContext {
  signal: AbortSignal;
  onProgress(progress: GeometryProgress): void;
}

interface GeometryEngine {
  capabilities(): Promise<GeometryCapabilities>;
  run<R extends GeometryRequest>(
    request: R,
    context: GeometryJobContext,
  ): Promise<GeometryResultFor<R>>;
}
```

This is a conceptual contract, not TypeScript authorized for this checkpoint.

Every request contains:

- operation and contract version;
- immutable project/input snapshot or its explicitly included subset;
- input fingerprint and algorithm version;
- source/object/mm coordinate-frame declaration;
- deterministic seed where applicable;
- quality/resolution/tolerance policy;
- bounded progress/cancellation identity.

Every result contains:

- portable values: typed arrays, indexed/triangle mesh, graph records and
  validation facts;
- the input fingerprint it answers;
- warnings and fail-closed decisions;
- backend provenance: implementation/version, precision, fallback and
  elapsed time;
- no CUDA pointer, GPU buffer handle, native path or process identity as the
  only copy of authored or computed data.

### Web implementation

`WebGeometryEngine` initially delegates to the current functions and Workers
without changing arguments, ordering or numeric behavior. The present
`*WorkerProtocol.ts` messages become adapter internals. Interactive preview
can keep lower-cost browser algorithms while high-resolution jobs use Workers.

### Windows CUDA implementation

`WindowsCudaGeometryEngine` is a browser-side adapter to a narrow local
native process/service. This does not require Electron and does not replace
the Cloudflare Web app. Transport, authentication and sandboxing are a later
security decision; the service receives only bounded geometry requests, not
Cloudflare credentials, browser storage or arbitrary filesystem access.

The adapter must advertise operation, memory and precision support before a
job. Failure, cancellation, version mismatch or unavailable CUDA falls back
to Web/CPU without corrupting the project.

## 4. FKEI and cross-platform project data

FKEI remains the shared project boundary.

- Authored Base/Motif/Graph intent, stable IDs, operation history, coordinate
  transforms, seeds and algorithm versions are canonical project data.
- Existing computed artifacts in `FkeiSurfaceArtifact`,
  `FkeiDryWebArtifact` and SKIN REBUILD snapshots are portable evidence with
  explicit currentness bindings. They must remain optional/recomputable.
- A project may remember a preferred backend as UI convenience only. Opening,
  graph editing and FKEI Save/Restore never require that backend.
- Backend provenance may be added only as additive evidence. It cannot enter
  a fingerprint that would make the authored shape backend-specific.
- Windows and Web read the same schema and coordinate contract. A CUDA cache
  may be discarded; the project may not.

## 5. Compatibility with planned features

| planned feature | boundary check |
| --- | --- |
| STL Base Import | Add a portable `BaseSource` record containing asset hash/bytes reference, units and explicit transform. `BaseGeometry` capabilities provide sign, closest surface, normal, sampling and mesh. `mpm/stlImport.ts` is parsing precedent, while BVH/sign queries live in GeometryEngine. No UI or FKEI branch on CUDA. |
| Custom Curve Motif | Add a versioned `MotifDefinition`/registry with canonical curve asset, local frame, parameters and attachment sites. Current hard-coded `PatchShape` remains the v1 compatibility adapter. Distribution consumes realized placements, not concrete motif code. |
| Base Surface Graph | Create a distinct `BaseSurfaceGraph`; do not reuse current `SurfaceGraph`, which represents Pattern instances. Heavy surface sampling/curvature runs in GeometryEngine; nodes, adjacency, frames and constraints are portable core data. |
| Spider Graph Cleanup | Stable-ID dedupe, isolated-node removal and topology edits stay CPU/core. Radius-aware containment, collision, curvature and contact revalidation are GeometryEngine jobs. Cleanup commands are replayable and backend-neutral. |
| Curved Network Edge | Extend topology with an edge-realization recipe (straight/curve/spline) and canonical control data. Graph connectivity stays core; tube realization, collision and angle/clearance sampling run in GeometryEngine. Existing straight edges remain the default v1 adapter. |
| Calyx-like Junction / Motif Morph | Store junction/morph intent, attachment identities, limits and version in core. UI edits the intent; GeometryEngine realizes and validates the transition. A `no-morph` policy exactly preserves current motifs and old FKEI. |

All six features fit the proposed boundary. The main incompatibility today is
not conceptual: current `PatchShape`, `SkinRebuildBase` and
`InternalStructureEdge` are closed concrete unions. They must later gain
additive adapters/recipes, never be replaced in-place or inferred from the
selected backend.

## 6. First three CUDA candidates

1. **SDF grid sampling plus high-resolution mesh generation.** Current cost
   is resolution-cubed and already split into as many as 16 Workers. It has a
   clear request/result boundary and exact Web reference triangles.
2. **Surface/mesh batch diagnosis.** Signed-distance/point-in-mesh queries,
   overhang face screening, reachability rays and motif attribution operate on
   large independent batches and return compact facts.
3. **Spider full-radius containment and candidate-route collision.** Stage 5A
   and 5B repeatedly sample Base SDF clearance for many candidate members.
   Topology stays CPU/core while batch geometric acceptance can accelerate.

These are candidates in performance order, not implementation authorization.
Profiling and backend-conformance fixtures are required before selecting one.

## 7. Migration gates after the physical result

1. Freeze current Web outputs as reference fixtures: FKEI bytes, project
   fingerprints, discrete graph, mesh/topology facts and export coordinates.
2. Define request/result/provenance types only. Do not move algorithms.
3. Wrap one read-only diagnosis operation in `WebGeometryEngine` and prove it
   delegates to the current code with unchanged results and cancellation.
4. Add a forced-failure fallback test and cross-platform FKEI round-trip.
5. Implement one native CPU/CUDA kernel behind an opt-in developer flag; keep
   Web CPU as the default and reference.
6. Compare exact discrete decisions and operation-specific numeric tolerances,
   especially near fail-closed thresholds. A mismatch cannot silently pass.
7. Only after conformance may the author select CUDA for production jobs.
   Existing projects are never migrated implicitly.

## 8. What must remain Web-owned

UI, viewport, camera, selection, Phase Navigator, graph editing, command
history, FKEI file operations, backend selection, progress, cancellation,
result comparison and all author-facing warnings remain in the Web app.
Cloudflare continues to host the same browser application. Windows CUDA is an
optional compute provider, not a new product shell or project format.
