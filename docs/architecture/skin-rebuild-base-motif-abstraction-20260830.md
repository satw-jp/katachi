# SKIN REBUILD Base / Motif source abstraction plan — 2026-08-30

Status: architecture and staged migration plan only. No source/runtime code,
FKEI schema, package version, geometry threshold or generated output is changed
by this document. The pending physical print remains the migration gate.

Frozen reference:

- starting checkpoint: `dca3f6e71f414517c8e7d77f45cf4877e6312b2f` (TASK 10 docs on top of
  `6b5d61a0ceb57a967346dfecba12fff62d1aff19`);
- baseline: `public/samples/skin-rebuild-first-print.fkei`;
- baseline SHA-256:
  `4bacfcced0fe311eef704a792d61f4a68531051ff408e26d5ff2937b8bbfadcf`;
- required dependency direction:
  `UI -> GeometryEngine -> WebGeometryEngine / WindowsCudaGeometryEngine`.

## 1. Target separation

The target model separates authored source, runtime geometry capabilities,
Motif intent, placement and derived realization:

```text
portable BaseSource -------------------+
                                       | resolve inside GeometryEngine
                                       v
                                BaseGeometry capabilities
                                       |
                       +---------------+----------------+
                       v                                v
               BaseSurfaceGraph                 field / mesh jobs
                       |
                       v
portable MotifSource -> MotifDefinition -> MotifInstance
                                             |
                                             | realize inside GeometryEngine
                                             v
                                     derived MotifRealization
```

`BaseSource` and Motif records are serializable authorship. `BaseGeometry` is a
runtime adapter reconstructed by a backend; it is not saved in FKEI. A final
mesh, BVH, SDF texture, Worker object, CUDA pointer or native file path cannot
be the only copy of project intent.

The first compatibility adapters must delegate to the exact current
Metaball/SDF and realized-`PatchPoint` behavior. Abstraction is not permission
to regenerate old Motifs or change their sampling order.

## 2. Current implementation and coupling map

| concern | current files / functions | present coupling | migration seam |
| --- | --- | --- | --- |
| Base authorship | `cloud-sculpt/field.ts::{Ball,FieldParams}`; `skin/history.ts::SkinState`, `growHost`, `loadHostFromS1Recipe` | The source is directly a mutable `Ball[]` plus `hostParams.k`. History operations know this representation. | Adapt the same values into `MetaballSdfBaseSource`; retain old history replay as the compatibility authority. |
| REBUILD Base | `rebuild/model.ts::{SkinRebuildBase,createSkinRebuildBase}` | `kind` only accepts `metaball-capsule`; Base includes `host` and `hostK` directly. | A test-only/source adapter first; no union expansion in current v1. |
| Base field and projection | `cloud-sculpt/field.ts::fieldSdf`; `skin/field.ts::{hostBandSdf,shellSdf,projectToSurface}` | Callers require an SDF function and estimate normals with finite differences. | `BaseGeometry` batch query capabilities whose Web adapter delegates to these exact functions. |
| Sampling bounds and mesh | `cloud-sculpt/meshExport.ts::computeSamplingBounds`; `skin/meshExport.ts::{computeSkinSamplingBounds,prepareSkinMeshField,buildSkinMesh}` | Bounds, Base shell, Motif sphere union and Network capsules are assembled in one SDF pipeline. | Separate capability requests and composite realization while preserving the current Web path as reference. |
| Browser interaction | `renderer.ts::{updateBeads,updateFieldPreview,updatePrintPlatePlacement}`; `picking.ts::{raymarchComposite,raymarchHost}` | Renderer/picking receive `Ball[]`, `hostK` and realized `Patch[]`. Shader preview is Metaball-specific. | Keep UI behavior; add a portable mesh preview/picking fallback for non-SDF Base and retain current raymarch for Metaballs. |
| Worker boundary | `meshExportWorkerProtocol.ts`, `previewMeshWorkerProtocol.ts`, `internalPrintGateWorkerProtocol.ts`, `surfaceAngleWorkerProtocol.ts`, `dryWebPreviewWorkerProtocol.ts` and other protocols | At least thirteen protocols transmit `host`, `hostK` and/or `Patch[]` instead of a Base/Motif request contract. | Migrate one operation at a time to a versioned GeometryEngine request; do not flag-day every Worker. |
| Motif authorship and realization | `skin/field.ts::{PatchShape,MotifShapeParams,Patch,PatchPoint,generateShapePoints}` | `Patch` combines type/params, placement provenance and already realized sphere geometry. Some point fields also encode fusion, mesh join, contact repair and cross-Motif bridge roles. | Introduce `MotifDefinition`, `MotifInstance` and `MotifRealization`; old point arrays remain authoritative compatibility realizations. |
| Motif placement | `field.ts::{projectToSurface,packPatchesGreedy,generateShapePoints}`; `quadFlow.ts`, `voronoiFlow.ts`, `goldbergFlow.ts`, `laceFill.ts` | Strategies call Metaball projection/bounds directly and often build shape points during placement. | Strategies consume a backend-neutral `BaseSurfaceProvider` and return stable placement records before realization. |
| Surface graph | `surfaceGraph.ts::SurfacePatchNode` | The current `SurfaceGraph` is a graph of placed `Patch` instances and embeds the complete legacy Patch. | Keep it distinct. A future `BaseSurfaceGraph` describes the Base surface used by placement. |
| Persistence | `history.ts`, `fkei.ts`, `fkeiRuntimeSave.ts`, `fkeiRuntimeRestore.ts`, `rebuild/fkei.ts` | Shape history replays Ball/Patch values; REBUILD v1 strictly accepts only `metaball-capsule` and four Patch shapes with realized points. | Future reader migration only after compatibility tests; no unknown fields are inserted into v1. |

`src/studies/skin/main.ts` directly reads `state.host`, `state.hostParams`
and/or `state.patches` in many orchestration paths. That makes `main.ts` an
important migration coordinator, but it should not become the definition of
the new interfaces.

## 3. Portable BaseSource

`BaseSource` answers “what did the author provide or create?” It is a closed,
versioned portable union. Conceptually:

```ts
interface BaseSourceMetadata {
  id: string;
  contractVersion: number;
  sourceToProject: Matrix4Value;
  sourceUnits: UnitDefinition;
  contentFingerprint: string;
  provenance: PortableProvenance;
}

type BaseSource =
  | (BaseSourceMetadata & {
      kind: "metaball-sdf";
      balls: Ball[];
      blendK: number;
      algorithmVersion: "current-smooth-min-v1";
    })
  | (BaseSourceMetadata & {
      kind: "stl";
      asset: PortableBinaryAssetRef;
      importOptions: MeshImportOptions;
    })
  | (BaseSourceMetadata & {
      kind: "mesh";
      mesh: PortableIndexedMesh;
      importOptions: MeshImportOptions;
    })
  | (BaseSourceMetadata & {
      kind: "implicit";
      recipe: RegisteredPortableImplicitRecipe;
    });
```

STL is a source format; canonical indexed mesh is its parsed representation.
Both remain representable because an author may want the original asset and
import transform preserved while runtime queries use the canonical mesh.

`sourceToProject`, units, handedness and axis convention are explicit and
saved. Import normalization is never inferred again by another backend. A
custom implicit source must name a portable registered algorithm and version;
arbitrary native code or a local DLL is not a project format.

## 4. BaseGeometry capability interface

`BaseGeometry` answers “what geometric questions can this backend answer for
this source?” It is resolved inside GeometryEngine from `BaseSource` and is not
serializable.

The conceptual interface below names the capability vocabulary. Across a
native boundary, these are coarse batched GeometryEngine jobs rather than one
IPC call per point.

```ts
interface BaseGeometry {
  describe(): BaseGeometryDescriptor;
  querySurface(request: SurfaceQueryBatch): Promise<SurfaceQueryBatchResult>;
  sampleSurface(request: SurfaceSampleRequest): Promise<SurfaceSampleResult>;
  classifyPoints(request: PointClassificationBatch): Promise<PointClassificationResult>;
  evaluateSignedDistance(request: DistanceBatch): Promise<DistanceBatchResult>;
  realizeMesh(request: BaseMeshRequest): Promise<PortableMeshResult>;
  createSurfaceGraphSource(request: SurfaceGraphSourceRequest):
    Promise<PortableSurfaceGraphSource>;
}
```

Every descriptor advertises support separately as `exact`, `bounded-approx`,
`unsupported` or `invalid-source`, with algorithm version, numeric tolerance
and prerequisites. Callers never switch on `source.kind` to guess whether a
method works.

### 4.1 Common capabilities

| capability | contract | required behavior |
| --- | --- | --- |
| identity / coordinates | source fingerprint, project transform, units, handedness | Mandatory and immutable for one resolved snapshot. |
| bounds | project-space AABB and optional oriented bounds | Mandatory; includes declared error/padding. |
| nearest surface | closest position, unsigned distance, source location, ambiguity | Mandatory for an accepted production Base. Batched and deterministic. |
| normal | oriented normal plus normal policy and ambiguity | Mandatory for placement; sharp/non-manifold locations can report multiple candidates or uncertainty. |
| surface sampling | positions, normals, area weights, stable source locations and local frames | Mandatory; seed, strategy, count/spacing and algorithm version are request facts. |
| inside / outside | `inside`, `outside`, `boundary` or `unknown`, with margin | Capability-gated. `unknown` is a real result, never silently treated as outside. |
| signed distance | distance, gradient when available, accuracy class and error bound | Optional. Metaball is the current native form; a closed mesh may provide a bounded approximation. |
| mesh realization | portable vertices/indices or triangle soup, quality and provenance | Mandatory for viewport/export-capable Base; imported mesh may return a transformed canonical mesh. |
| surface graph source | stable source element references, adjacency hints, area and sampling facts | Mandatory only for graph-aware placement. It feeds a canonical `BaseSurfaceGraph`; it is not itself the structural Network. |

An operation declares capabilities rather than a source kind. Examples:

- interactive Base view: bounds plus mesh preview;
- random Motif placement: deterministic surface sample, nearest surface,
  normal and local frame;
- shell/offset realization: unsigned distance-to-surface may be sufficient,
  but side-dependent boolean operations declare an inside/signed requirement;
- Pattern inside/outside classification and full-radius Spider containment:
  reliable solid classification with a stated clearance margin;
- Base Surface Graph: surface graph source plus deterministic sampling.

If an imported open mesh cannot classify volume reliably, the UI may still
show it and allow limited surface inspection, but Stage 3 classification,
permanent Spider containment and print export fail closed with an explicit
missing-capability reason.

### 4.2 Result contract

Every result includes:

- source/input fingerprint and coordinate frame;
- operation and algorithm contract version;
- quality/tolerance and deterministic seed where applicable;
- backend provenance and fallback reason;
- warnings/ambiguities and an explicit supported/unsupported status.

This prevents Web and CUDA from silently answering different questions.

## 5. STL / Mesh Base adapter

The repository already has useful precedents, not a complete Base adapter:

- `src/studies/mpm/stlImport.ts::parseBinaryStl()` parses binary triangle
  soups and records an import transform for particle filling;
- `src/lib/geometry/pointInMesh.ts::buildInsideTester()` supplies repeated
  ray-parity classification and explicitly warns that it assumes a closed
  watertight surface.

A production `StlMeshBaseGeometry` should add the following bounded pipeline:

1. parse with byte/triangle budgets; retain original asset hash and explicit
   unit/axis/transform choices;
2. canonicalize indexed vertices/faces without repairing geometry silently;
3. diagnose finite/degenerate faces, boundary edges, non-manifold edges,
   winding consistency, connected components and self-intersection limits;
4. build a BVH or equivalent acceleration structure for nearest triangle,
   ray and candidate queries;
5. provide nearest surface and unsigned distance from BVH results;
6. provide oriented face/barycentric/vertex normals with a saved normal policy
   and sharp-edge ambiguity;
7. classify inside/outside by robust winding/parity only when preconditions
   are met; return `unknown` near boundaries or for open/non-manifold inputs;
8. derive bounded signed distance as `sign * nearestDistance` only when sign
   is reliable; otherwise advertise unsigned distance only;
9. sample deterministically by triangle area and return stable face/barycentric
   source locations;
10. expose mesh adjacency/decimation facts as a Base Surface Graph source.

The existing `buildInsideTester()` can remain a CPU reference fixture, but it
does not by itself establish watertightness, nearest surface, stable normals or
a signed-distance error bound. CUDA may batch BVH/winding/nearest queries later;
the same fail-closed capability facts and project transform apply.

## 6. Portable Motif model

Motif is split into four records:

1. `MotifSource`: primitive, curve or asset authorship;
2. `MotifDefinition`: normalized reusable definition, parameters, local frame
   and allowed deformation/attachment contract;
3. `MotifInstance`: stable placed identity, transform and Base binding;
4. `MotifRealization`: derived sphere/curve/field/mesh data with fingerprints.

### 6.1 MotifSource and MotifDefinition

```ts
type MotifSource =
  | { kind: "coin"; parameters: CoinParameters }
  | { kind: "ring"; parameters: RingParameters }
  | { kind: "flower"; parameters: FlowerParameters }
  | { kind: "one-stroke-flower"; parameters: OneStrokeFlowerParameters }
  | { kind: "curve"; curve: PortableCurveDefinition }
  | { kind: "polyline"; points: Vector2Value[] | Vector3Value[] }
  | { kind: "svg"; asset: PortableTextAssetRef; normalization: SvgNormalization }
  | { kind: "custom"; registeredType: string; contractVersion: number;
      parameters: PortableJson; assets: PortableAssetRef[] };

interface MotifDefinition {
  id: string;
  contractVersion: number;
  source: MotifSource;
  localCoordinates: LocalCoordinateContract;
  parameterSchemaVersion: number;
  attachmentSites: MotifAttachmentSite[];
  deformationPermissions: MotifDeformationPermissions;
  realizationPolicy: PortableMotifRealizationPolicy;
  contentFingerprint: string;
  provenance: PortableProvenance;
}
```

SVG path flattening tolerance, Curve basis/knots, Polyline closure, profile,
units and normalization are saved definition facts. A custom Motif cannot rely
on a Web-only callback; its registered type, version, portable parameters and
assets must be understood or explicitly unsupported by each backend.

`MotifDefinition` is not a final mesh and does not decide where instances are
placed. It can expose centre, boundary, stem and morph attachment sites for the
Junction model from TASK 10.

### 6.2 MotifInstance and surface binding

```ts
interface MotifInstance extends GraphRecordMetadata {
  kind: "motif-instance";
  definitionId: string;
  localToProject: Matrix4Value;
  parameterOverrides: PortableJson;
  surfaceBinding: {
    baseSourceId: string;
    sourceLocation: PortableSurfaceLocation;
    position: Vector3Value;
    frame: PortableFrame;
    placement: "surface" | "center" | "inside";
    baseSurfaceGraphNodeId?: string;
  };
  placementProvenance: PlacementProvenance;
}
```

The saved frame prevents each backend from choosing a different tangent axis.
The source location may be a mesh face/barycentric coordinate, an SDF sample
identity or another portable locator; position/frame remain the portable
project-space fact. If Base changes, binding currentness is checked by source
fingerprint and marked stale rather than silently reprojected.

### 6.3 Derived realization

`MotifRealization` may contain spheres compatible with current `PatchPoint`, a
sampled curve/profile field, or a portable mesh. It records definition,
instance, Base and algorithm fingerprints, quality and backend provenance. It
is invalidatable evidence, not the author identity.

Current `Patch` fields map carefully:

| legacy field | future fact |
| --- | --- |
| `patchSetRevision + patch.id` | stable Motif instance identity during migration |
| `shape`, `motifParams`, `ringDiameter` | partial Motif source/definition facts |
| `motifPlacement` | surface-binding placement policy |
| `surfaceCellId`, `surfaceCellKind`, `quadCellId` | placement/Base Surface Graph provenance |
| `points[]` coordinates/radii | exact compatibility realization; initially authoritative for old files |
| point `baseR`, `fusionR`, `meshJoinR`, `contactR`, `contactScale` | realization/edit provenance that must not be inferred again |
| point role `bridge` / `surfaceConnector` | cross-instance relation or Network migration candidate, retained in legacy realization until the Network migration is proven |

Old Patch arrays must not be regenerated from `shape` and parameters: comments
and replay code explicitly rely on saving the realized points. The first
adapter therefore uses a `legacy-realized-points` realization policy and
returns those points in the same order. Primitive/curve definitions become the
authority only for newly authored or explicitly migrated instances.

## 7. Source-independent placement

Placement consumes a narrow `BaseSurfaceProvider`, which GeometryEngine backs
from `BaseGeometry`:

```ts
interface SurfaceDistributionRequest {
  baseSourceId: string;
  baseFingerprint: string;
  baseSurfaceGraph?: BaseSurfaceGraph;
  motifDefinitionIds: string[];
  constraints: PortablePlacementConstraints;
  strategy: "current-random-pack" | "quad" | "voronoi" |
    "goldberg" | "graph-aware-random";
  seed: string;
  algorithmVersion: string;
}

interface SurfaceDistributionResult {
  placements: MotifInstance[];
  rejectedCandidates: PlacementRejectionFact[];
  inputFingerprint: string;
  provenance: BackendProvenance;
}
```

The strategy asks for samples, nearest locations, normals, frames, distances
and optional graph neighbourhoods. It does not contain `if base.kind ===
"stl"` or read `Ball[]`.

The future graph-aware path is:

```text
BaseSource
  -> BaseGeometry capability adapter
  -> canonical BaseSurfaceGraph
  -> graph-aware random placement
  -> MotifInstance records
```

`BaseSurfaceGraph` has stable surface Nodes, source locations, project-space
positions/normals/frames, area/curvature facts, adjacency and optional author
regions. An SDF implementation builds it from deterministic samples; a mesh
implementation adapts faces/vertices or a bounded simplification. Placement
sees the same graph contract. This graph is distinct from the current
`SurfaceGraph` of placed Patch relationships and from the structural Network
in TASK 10.

## 8. GeometryEngine operations

The shared UI/project layer submits immutable, versioned jobs such as:

- `describeBase` and `queryBaseSurface`;
- `buildBaseSurfaceGraph`;
- `distributeMotifs`;
- `realizeMotifInstances`;
- `buildCompositeFieldOrMesh`;
- downstream Network containment, diagnosis and export jobs from TASK 9/10.

The Web compatibility implementation initially delegates to
`computeSamplingBounds`, `fieldSdf`, `projectToSurface`,
`generateShapePoints`, `packPatchesGreedy`, `compositeSdf` and
`buildSkinMesh` without changing their loop order. A Windows-CUDA adapter may
later accelerate batched sampling, projection, distance, union and mesh jobs.

UI, Phase Navigator, viewport ownership, selection meaning, FKEI Open/Save and
Graph edit commands remain in the browser. Metaball raymarch may stay as the
fast current preview; imported Base can use a portable preview mesh. Missing
native acceleration never prevents project open, metadata edit or low-quality
Web realization within declared resource budgets.

## 9. Future FKEI relationship

No change is made to either current v1 schema. `rebuild/fkei.ts` strictly
rejects unknown Base kinds, Patch shapes and fields, so new records require a
new versioned reader/migration rather than optional keys inserted into v1.

A future schema can store:

```text
base
  source
  import transform / units / provenance
motifs
  definitions
  instances + surface bindings
  optional realization caches/evidence
baseSurfaceGraph?  // portable derived graph with source fingerprint
network?           // TASK 10 portable topology and Junction intent
```

Migration from current data is fail-safe:

- `Ball[] + hostK` becomes `metaball-sdf` with the current smooth-min algorithm
  version and exact project coordinates;
- each legacy Patch becomes one stable Motif instance whose exact point array
  is preserved as its compatibility realization;
- existing shape/parameter/placement/surface-cell fields are retained as
  definition and provenance facts without claiming that they can regenerate
  the same point array;
- no Curve, SVG, Custom source, STL Base, morph or re-projection is inferred;
- cached Base Surface Graph, mesh, BVH or CUDA data is optional and always
  invalidatable by fingerprint;
- the same saved source/definitions/instances open on Web and Windows.

Opening a v1 project keeps the v1 runtime path until shadow equivalence is
proved. A future format Save is explicit; merely opening an old file does not
rewrite it. Asset embedding versus content-addressed packaging remains an open
decision, but an unresolved external local path can never be the only source.

## 10. Small migration steps

No step starts before the physical-print gate is resolved.

1. **Freeze fixtures.** Record current Base bounds/projection samples, packing
   output, Patch point order, surface bindings, mesh facts, v1 round-trip and
   baseline hash.
2. **Add types and test-only adapters.** Define `MetaballSdfBaseSource`,
   capability descriptors and legacy Motif realization outside current saved
   schemas. Adapt to/from current inputs and prove canonical equality.
3. **Wrap one read-only Base operation.** Put bounds or nearest-surface query
   behind `WebGeometryEngine`; compare exact current output and keep the direct
   call as fallback.
4. **Migrate one Worker request.** Replace `host/hostK` only for that operation
   with a versioned source snapshot/request. Do not convert all thirteen
   protocols together.
5. **Shadow Base state.** Derive a BaseSource from current history state and
   show capability/provenance diagnostics without driving geometry.
6. **Build BaseSurfaceGraph in shadow.** Compare deterministic SDF samples and
   identities; current placement remains unchanged.
7. **Register current Motifs.** Add Coin/Ring/Flower definition adapters while
   preserving each old Patch's exact `legacy-realized-points` result.
8. **Separate instance/binding in shadow.** Adapt `patchSetRevision + patch.id`,
   placement and cell provenance; prove editor selection and history identity
   unchanged.
9. **Route current random packing through the provider.** Use the same seed,
   sampling order and Web algorithms; require exact Patch equality before the
   old direct path can be retired.
10. **Add STL/Mesh Base as opt-in.** Start with closed, consistently oriented
    fixtures; expose limited inspection for invalid/open meshes and fail closed
    for solid-only stages.
11. **Add one new Motif source at a time.** Polyline/Curve before SVG and
    Custom; each gets canonicalization, local-frame, realization and FKEI tests.
12. **Version FKEI last.** Prove v1 read/current realization, explicit migration,
    future Save/Restore, Web-without-CUDA and forced native failure recovery.

Every step is reversible, reviewable and small enough for one conformance
surface. No Electron migration is required and the Cloudflare Web version
remains a first-class editor.

## 11. Compatibility matrix for planned work

| planned work | boundary check |
| --- | --- |
| Metaball / SDF Base | Exact current adapter and normative compatibility fixture. |
| STL / Mesh Base | Implements the same capability results via canonical mesh, BVH/nearest, normals, sampling and guarded classification. |
| Coin / Ring / Flower | Current definitions plus exact legacy point realizations. |
| one-stroke Flower / Curve / SVG / Polyline / Custom | New portable MotifSource types with local coordinates and versioned realization; placement stays source-neutral. |
| Base -> Surface Graph -> graph-aware random placement | Placement consumes canonical `BaseSurfaceGraph`, not Ball arrays or mesh faces directly. |
| Spider Network / Curved Edge / Calyx Junction | Uses portable Base clearance/surface queries, Motif instance/attachment IDs and TASK 10 Network/Junction intent. |
| Web / Windows-CUDA | Both resolve the same sources and return the same portable result contracts; CUDA is an accelerator, not a format. |

## 12. Required conformance tests

- Metaball adapter preserves current `fieldSdf`, bounds, projection and normal
  samples at frozen points, including near-threshold cases;
- current packing preserves seed order, Patch IDs, point order/radii/roles and
  rejected counts;
- legacy Motif instances realize from saved points without regeneration;
- Base transforms and units round-trip and produce identical project/mm export
  coordinates;
- closed mesh fixtures return bounded nearest/normal/sign facts; open,
  non-manifold and ambiguous fixtures return explicit unknown/unsupported;
- SDF and mesh fixtures with the same reference surface produce bounded sample,
  normal and BaseSurfaceGraph agreement;
- placement code contains no Base source-kind dispatch;
- new Motif source canonicalization is deterministic and backend independent;
- v1 FKEI opens through the current path unchanged; future intent survives
  Save/Restore without native handles;
- Web fallback remains functional when CUDA is unavailable, cancelled or fails.

## 13. Hardest current coupling points

1. **`Ball[] + hostK` is an application-wide protocol, not just a model.** It
   is threaded through history, `main.ts`, renderer/picking, field/mesh code,
   diagnostics and many Worker protocols. This requires operation-by-operation
   adapters rather than a type rename.
2. **`Patch` merges Motif intent with realized and repaired geometry.** Shape
   parameters, placement, local/cell provenance, point spheres, fusion, contact
   repair and bridges all coexist, while replay intentionally trusts exact
   points. Separating them must preserve old points as authority.
3. **`compositeSdf` / `prepareSkinMeshField` jointly encode Base, Motif and
   Network realization.** They branch by Motif shape, assume host SDF shell
   semantics, expand bounds from Patch spheres and union straight Network
   capsules. The future engine boundary must first wrap this whole reference
   path before decomposing it.

## 14. Deliberately unresolved decisions

- portable embedded-asset packaging and size budgets for STL/SVG/Custom data;
- robust winding/sign implementation and error tiers for production mesh Base;
- canonical Curve/SVG flattening and local unit conventions;
- which Base capabilities are mandatory for preview versus final export;
- whether a Base Surface Graph is saved evidence or normally recomputed;
- when new definitions, rather than legacy point arrays, become authoritative
  for an explicitly migrated Motif.

These decisions need fixtures, performance data and physical evidence. None is
safe to infer during the current geometry freeze.
