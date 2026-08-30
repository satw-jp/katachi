# SKIN REBUILD Base Surface Graph / graph-aware distribution — 2026-08-30

Status: architecture only. This document adds no runtime type, FKEI field,
placement mode or generated geometry. The current pure-random placement and
the first-print result remain unchanged.

Frozen reference:

- starting commit: `64845ee9fa1234f43049466400245e4ae6dc6601`;
- baseline: `public/samples/skin-rebuild-first-print.fkei`;
- baseline SHA-256:
  `4bacfcced0fe311eef704a792d61f4a68531051ff408e26d5ff2937b8bbfadcf`;
- reference contract:
  `src/studies/skin/rebuild/migrationRegression.test.ts` and its
  `GeometryResultContract` / `compareGeometryResult()` helper.

## 1. Decision

Add an optional, portable `BaseSurfaceGraph` between `BaseGeometry` and Motif
placement:

```text
BaseSource
  -> BaseGeometry capability adapter
  -> deterministic Poisson surface samples
  -> source-neutral local adjacency
  -> BaseSurfaceGraph
  -> graph-aware placement strategy
  -> portable PlacementIntent
  -> existing or future Motif realization
```

The recommended first generator is **deterministic Poisson-disk-like surface
sampling plus mutual local k-nearest-neighbour adjacency, with surface
plausibility filters**. It is source-neutral, needs no global remesh and gives
placement a reasonably even set of surface sites. It is more stable than
using imported mesh vertices directly and materially less complex than an
adaptive remeshing or curvature-driven first implementation.

The first placement algorithm is **graph Poisson placement**: select eligible
graph locations using a seeded farthest/clearance score, then use seeded
random choice only within an explicitly controlled candidate band. At zero
randomness it is regular and deterministic; at high randomness it is more
accidental but still exactly replayable from the saved seed, graph fingerprint
and versioned strategy parameters.

The current `randomPack` path remains a separate strategy. It is not silently
rewritten to use the graph.

## 2. Current code and migration seams

| concern | current implementation | boundary decision |
| --- | --- | --- |
| Placement mode | `field.ts::SurfaceGenerationMode` is `randomPack`, `quadFlow`, `voronoi` or `goldberg`; `main.ts::packCurrentSurface()` dispatches them | A future `graphAware` mode is additive. Existing modes keep their current call paths and saved results. |
| Pure random placement | `field.ts::packPatchesGreedy()` samples the Metaball bounds, rejects exterior points, calls `projectToSurface()`, measures Euclidean clearance and immediately calls `generateShapePoints()` | Preserve as `legacy-random-pack-v1`. A new graph strategy returns placement intent before realization. |
| Metaball surface query | `field.ts::projectToSurface()` uses `fieldSdf()` finite-difference gradients and bounded Newton steps | First Web `BaseGeometry` adapter delegates to this exact behavior. Graph generation is shadow/opt-in until its own contract is frozen. |
| Structured surface prototypes | `quadFlow.ts`, `voronoiFlow.ts` and `goldbergFlow.ts` project source-specific cells/sites and attach `surfaceCellId` / `surfaceCellKind` to `Patch` | Useful provenance precedent, but not the canonical Base graph. Their topology and Motif realization remain separate experiments. |
| Motif realization | `field.ts::generateShapePoints()` dispatches Coin/Ring/Flower and places the resulting `PatchPoint[]` relative to the surface | Placement produces a `MotifInstance`/`PlacementIntent`; realization consumes it later. Old Patch points remain authoritative. |
| Existing `SurfaceGraph` | `surfaceGraph.ts::SurfaceGraph` contains placed `SurfacePatchNode` records and author relations | Keep unchanged and distinctly named. It is a graph **of Motifs after placement**, not a graph of the Base surface. |
| Mesh import precedent | `mpm/stlImport.ts::parseBinaryStl()` and `lib/geometry/pointInMesh.ts::buildInsideTester()` | These prove portable triangle input and guarded inside testing, but do not yet provide nearest surface, normals, area sampling, curvature or canonical graph generation. |
| Persistence | current `fkei.ts` v1 stores history and derived Surface/Artwork/DryWeb evidence; REBUILD v1 is strict | Add nothing to v1. Future fields require versioned migration after baseline and FKEI compatibility gates pass. |

`packPatchesGreedy()` deliberately folds the current Patch count into its RNG
seed and saves realized results. Its exact RNG calls, Patch IDs, point order,
radii and rejection behavior are part of the current reference; graph-aware
placement is not a refactor of that algorithm.

## 3. Portable BaseSurfaceGraph

`BaseSurfaceGraph` describes sampled surface locations and local surface
neighbourhoods. It is a derived, fingerprinted intermediate representation,
not a mesh and not the structural Spider/Network.

Conceptual contract:

```ts
interface BaseSurfaceGraph {
  kind: "base-surface-graph";
  schemaVersion: 1;
  id: string;
  baseSourceId: string;
  baseFingerprint: string;
  coordinateContract: PortableCoordinateContract;
  generation: BaseSurfaceGraphGenerationRecipe;
  nodes: BaseSurfaceGraphNode[];
  edges: BaseSurfaceGraphEdge[];
  components: BaseSurfaceGraphComponentFact[];
  quality: BaseSurfaceGraphQuality;
  contentFingerprint: string;
  provenance: PortableProvenance;
}
```

The graph fingerprint covers the Base fingerprint, coordinate contract,
generation recipe, canonical node order, edges and numeric encoding policy.
The same source, recipe, seed and algorithm version must reproduce it. A
changed Base or recipe makes dependent placement evidence stale; it never
silently relocates Motifs.

### 3.1 Node contract

```ts
interface BaseSurfaceGraphNode {
  id: string;
  binding: PortableBaseSurfaceBinding;
  position: Vector3Value;
  normal: Vector3Value;
  tangentFrame: {
    u: Vector3Value;
    v: Vector3Value;
    policy: string;
  };
  curvature: {
    mean?: number;
    gaussian?: number;
    principalDirection?: Vector3Value;
    neighbourhoodScale: number;
    confidence: number;
    method: string;
  };
  areaWeight: number;
  localSpacing: number;
  boundary: {
    distance?: number;
    status: "measured" | "not-applicable" | "unknown";
    confidence: number;
  };
  thickness?: MeasuredScalarFact;
  structuralImportance?: StructuralImportanceFact;
  quality: SurfaceSampleQuality;
}
```

Required behavior:

- `position`, `normal` and frame are in the declared project coordinate
  system, never backend-local or mesh-normalized coordinates;
- the tangent frame uses a deterministic sign policy. A least-aligned global
  reference axis is projected against the normal; noisy principal curvature
  cannot silently flip all Motif rotations;
- curvature is an approximation with neighbourhood scale, method and
  confidence. Missing curvature is not encoded as zero;
- `areaWeight` estimates represented surface area and supports density
  normalization; `localSpacing` records the realised sample separation;
- a closed implicit Base may report boundary as `not-applicable`; an open mesh
  can report distance to a true boundary, while ambiguous topology is
  `unknown`;
- thickness is optional and includes the ray/nearest method, ambiguity and
  error/confidence. It is not a strength guarantee;
- structural importance states its source (`author`, `heuristic`, or
  `analysis`), normalization, input fingerprint and confidence. A value is
  not presented as safety or load capacity.

`PortableBaseSurfaceBinding` always includes `baseSourceId`, Base fingerprint,
project-space position and frame. It may additionally contain an SDF sample
locator or mesh face/barycentric locator. Downstream placement reads the
common position/frame contract rather than branching on locator kind. The
locator supports reprojection/currentness checks and provenance only.

Node IDs are deterministic within one graph recipe, but they are not promised
to remain identical after graph density or algorithm changes. Placement saves
its resolved Base binding in addition to its graph node reference.

### 3.2 Edge contract

```ts
interface BaseSurfaceGraphEdge {
  id: string;
  a: string;
  b: string;
  chordLength: number;
  geodesicLikeDistance: number;
  directionAtA: Vector3Value;
  directionAtB: Vector3Value;
  curvatureChange?: number;
  structuralWeight?: MeasuredScalarFact;
  neighbourhoodMethod: string;
  surfacePlausibility: number;
}
```

Edges are undirected surface-neighbour relations. `directionAtA` and
`directionAtB` are the endpoint-to-endpoint chord projected into each local
tangent frame; no arbitrary global edge orientation is authored.
`geodesicLikeDistance` is a versioned local path estimate, not an exact
geodesic. Its method may use projected intermediate samples, chord length and
normal change. Placement can compare local distances without claiming a
global shortest path.

An adjacency candidate is rejected when it appears to jump between nearby but
disconnected sheets, across a narrow gap or far from the represented surface.
The exact test belongs to the generation recipe and may use bounded midpoint
projection/residual, normal change and a maximum multiple of local spacing.
The generator reports disconnected graph components; it never inserts a long
edge merely to force connectivity.

## 4. Generation approaches

| approach | strengths | weaknesses | decision |
| --- | --- | --- | --- |
| Sampled points + k-nearest neighbours | Very simple; works for SDF and mesh through common sampling/query capabilities | Random clusters/holes; raw Euclidean kNN can bridge nearby sheets; area representation is uneven | Useful base primitive, but insufficient without spacing and surface filters |
| Poisson surface samples + adjacency | Even minimum spacing, stable placement capacity, source-neutral and deterministic with a frozen candidate order | Dart throwing is approximate; still needs adjacency validation and density controls | **Recommended first implementation** |
| Direct mesh vertices/edges | Cheap for an imported mesh; exact source topology and boundary edges | Unavailable for SDF, density follows triangulation, remeshing changes output, imported defects leak downstream | Adapter hint/diagnostic only, never the portable graph contract |
| Simplified/remeshed proxy | Uniform controllable density and reusable neighbourhood topology | Adds decimation/remeshing error, versions, feature loss and cross-backend reproducibility work | Defer until large imported meshes prove it necessary |
| Curvature-aware adaptive sampling | Retains ridges/valleys and spends samples where shape changes | Requires reliable multi-scale curvature, complicates density/area weights and can overfit mesh noise | Later extension layered onto the Poisson contract |

### 4.1 Recommended first generator

`poisson-surface-mutual-knn-v1` is a staged algorithm, not a mesh operation:

1. request deterministic surface candidates from `BaseGeometry` with a seed,
   bounds, count/budget and coordinate contract;
2. canonicalize candidates and reject invalid/non-finite positions, normals or
   stale Base bindings;
3. apply deterministic dart-throwing/Poisson thinning in project distance,
   using a saved target spacing and stable candidate/tie order;
4. estimate area weights and local spacing from the accepted neighbourhood;
5. generate local kNN candidates, retain mutual neighbours first, and apply a
   saved maximum-distance and surface-plausibility test;
6. add only bounded local non-mutual edges where needed to avoid sampling
   artefact isolates; never connect different validated Base components;
7. estimate local normals/frame, curvature and optional boundary/thickness
   facts at saved neighbourhood scales;
8. canonicalize IDs/order, compute components and quality/audit facts, then
   fingerprint the result.

`k`, target spacing, candidate multiplier, projection residual, normal-change
limit and isolate policy are explicit recipe fields. No value is frozen by
this document; the first fixture may start near six neighbours, but benchmark
and failure cases must select the actual default.

For a Metaball, candidate production can initially reuse deterministic bounds
sampling plus `projectToSurface()`. For STL/Mesh, area-weighted triangle
barycentric candidates, nearest-surface queries and mesh-boundary diagnostics
feed the same Poisson/adjoining stages. Placement never sees which producer
was used.

## 5. Graph-aware random placement

Placement is a portable decision layer over a graph. It does not realize
Flower, Coin or Curve geometry.

```ts
interface GraphPlacementRequest {
  graphId: string;
  graphFingerprint: string;
  strategy: PlacementStrategy;
  seed: string;
  runIndex: number;
  inputPlacementFingerprint: string;
  motifAssignments: MotifAssignmentPolicy;
  envelopes: PlacementEnvelope[];
  countOrCoverage: PlacementTarget;
}

interface PlacementStrategy {
  algorithm: "pure-random" | "graph-poisson" | "mixed";
  algorithmVersion: string;
  scoreTerms: {
    spacing: WeightedTerm;
    curvature: WeightedTerm;
    structural: WeightedTerm;
    directionalFlow: WeightedTerm;
  };
  stochasticity: {
    candidateChoice: number;
    positionJitter: number;
    orientationJitter: number;
    scaleJitter: number;
    fieldNoise: number;
  };
  constraints: PortablePlacementConstraints;
}
```

`PlacementEnvelope` is a shape-neutral footprint/clearance requirement
resolved before placement. It can describe nominal radius, allowed scale range
and orientation freedoms without exposing Flower petals or Curve control
points to the graph.

### 5.1 Strategy families

| strategy | graph use | intended behavior |
| --- | --- | --- |
| Pure random | None for the current path | Preserve current `packPatchesGreedy()` exactly. A future source-neutral pure-random implementation gets a different algorithm version. |
| Graph Poisson | Clearance/path distance and area weights | First new strategy. Spreads placements before choosing among comparably good sites with a seeded PRNG. |
| Curvature weighted | Node curvature/confidence | Prefer or avoid ridges/valleys without changing the Motif definition. Missing/low-confidence values invoke an explicit fallback policy. |
| Spacing weighted | Area/local spacing and accepted placements | Vary density/scale while retaining a minimum declared clearance. |
| Structural weighted | Optional structural-importance facts | Bias toward or away from identified regions. This remains an authoring heuristic, not a safety claim. |
| Directional flow | Tangent frames, edge directions and optional principal direction | Orient sequences or Motifs along a portable surface direction field. |
| Mixed | Named weighted terms | Compose score fields and constraints in a versioned model rather than introducing one hard-coded mode per combination. |

### 5.2 Reproducibility

Reproduction inputs are graph fingerprint, full strategy, seed, run index,
input-placement fingerprint, Motif assignment policy, envelopes and algorithm
version. The implementation must:

- sort candidates by stable graph ID before scoring;
- derive namespaced random streams from semantic keys such as
  `seed/run/placement/node/choice`, not a shared mutable global RNG sequence;
- use stable ID tie-breakers after quantized/canonical scores;
- record rejected/selected candidate facts needed to diagnose a version
  mismatch;
- never substitute a missing curvature/thickness/structural field with a
  numeric zero without the strategy's explicit fallback policy.

Changing candidate iteration parallelism or backend scheduling must not
change the placement result.

### 5.3 Regularity and randomness are not one internal scalar

At `candidateChoice = 0`, graph Poisson repeatedly selects the highest
clearance/score candidate with stable tie-breaking. It reads as regular. At
`candidateChoice = 1`, selection is seeded among a wider admissible score
band or through a saved temperature distribution. Minimum clearance and hard
constraints still apply.

Position, orientation, scale and field noise remain independent axes. A future
UI may offer an author-friendly `randomness 0–100%` macro, preset or linked
control, but it expands into the explicit stochasticity vector and saves that
vector. Advanced UI can unlink the axes. The project model is therefore not
locked to one slider or to today's wording.

## 6. PlacementIntent and Motif independence

The graph has no `PatchShape`, Flower, Curve or mesh-realization field.
Placement output is portable intent:

```ts
interface PlacementIntent {
  id: string;
  motifDefinitionId: string;
  graphBinding: {
    graphId: string;
    graphFingerprint: string;
    location:
      | { kind: "node"; nodeId: string }
      | { kind: "edge"; edgeId: string; parameter: number };
  };
  surfaceBinding: PortableBaseSurfaceBinding;
  orientation: PortableQuaternion;
  scale: Vector3Value;
  rotationAroundNormal: number;
  envelopeUsed: PlacementEnvelope;
  placementRunId: string;
  selectionProvenance: PlacementSelectionFact;
}
```

The initial slice uses node locations and uniform scale; the union permits
edge interpolation later without changing graph topology. The resolved
surface binding and transform are authoritative for realization. The graph
reference explains why the placement exists and detects staleness.

`MotifDefinition` supplies local coordinates and a shape-neutral placement
envelope. `MotifRealization` consumes the placement transform afterward. A
Flower and a Custom Curve can therefore use the same placement strategy while
producing unrelated geometry.

## 7. Surface Graph, Motif graph and Network are distinct

Three graph families remain separate:

```text
BaseSurfaceGraph node
   -> PlacementIntent
      -> MotifInstance / current SurfacePatchNode
         -> JunctionIntent
            -> Network Node or Edge attachment
```

- `BaseSurfaceGraph`: sampled Base surface and local neighbourhoods;
- existing `surfaceGraph.ts::SurfaceGraph`: placed Motifs and their author
  relations;
- TASK 10 Network graph: structural/artwork Node/Edge topology to be realized
  as Spider/stem/curved members.

They share IDs only by explicit references. A placement node never becomes a
Network node implicitly. Portable provenance records
`baseSurfaceGraphNodeId -> placementIntentId -> motifInstanceId ->
junctionIntentId -> network attachment ID`. If the Surface Graph is rebuilt,
the old trace becomes stale; Network topology is not deleted or renumbered.

## 8. FKEI relationship

Current FKEI schemas do not change. A future version can contain:

```text
baseSurfaceDistribution
  graphRecipe
    base fingerprint
    generator + version
    seed / spacing / budgets / adjacency / metric policies
  graphSnapshot?              derived portable evidence/cache
    graph fingerprint
    nodes / edges / quality
  placementRuns
    strategy + version
    seed / run index / input-placement fingerprint
    resulting PlacementIntent[]
```

Authority and cache rules:

- graph generation conditions and placement strategy/seed are authored facts;
- resulting `PlacementIntent[]` is the portable authored placement result;
- the graph snapshot is optional derived evidence, accepted only when Base and
  recipe fingerprints match;
- a cached BVH, remesh, Worker/CUDA buffer or native path is never FKEI truth;
- a missing graph/backend does not prevent opening, inspecting or saving
  existing placement intent;
- changing the Base marks graph and placement bindings stale. Regeneration is
  an explicit author operation, not an automatic restore side effect;
- v1 migration preserves literal current `PatchPoint[]`; no graph recipe or
  placement strategy is inferred from their final positions.

Future Save/Restore tests must cover Web without a native backend and exact
strategy/seed/intent preservation. FKEI fingerprints must not include a
preferred backend as shape authorship.

## 9. GeometryEngine boundary

Heavy source-specific graph generation belongs behind GeometryEngine:

```ts
interface BuildBaseSurfaceGraphRequest {
  operation: "buildBaseSurfaceGraph";
  contractVersion: number;
  baseSource: BaseSource;
  baseFingerprint: string;
  coordinateContract: PortableCoordinateContract;
  recipe: BaseSurfaceGraphGenerationRecipe;
}
```

The result is the portable graph plus quality/provenance, never a backend
handle. Web initially uses the current SDF/query functions. STL/Mesh may use
BVH, triangle-area candidates and boundary adjacency internally. Windows CPU
or CUDA may accelerate candidate projection, nearest queries, curvature,
thickness and neighbourhood search.

Graph Poisson selection itself is small graph/data work and should have a
portable CPU reference implementation. A backend may batch score/distance
work only if it returns the same discrete decisions under the strategy
contract. UI, strategy editing, seed, undo/history, result acceptance and
stale-state warnings remain in the browser.

This extends the TASK 13 job API with `buildBaseSurfaceGraph`; it does not
create per-point localhost calls. Large sample arrays cross as bounded binary
artifacts if a native engine is used.

## 10. First vertical slice after the print gate

Implement the smallest opt-in path:

```text
current Metaball Base
  -> deterministic surface candidates using current projectToSurface
  -> fixed-spacing Poisson thinning
  -> mutual local kNN + surface plausibility
  -> BaseSurfaceGraph preview/audit
  -> graph Poisson PlacementIntent
  -> current Flower generator for newly created opt-in instances only
```

Sequence:

1. define portable graph/recipe/placement types and pure validators in tests;
2. add a Web-only, shadow `buildBaseSurfaceGraph` adapter over the current
   Metaball source; graph output does not drive geometry;
3. freeze a small graph fixture: source/recipe fingerprint, deterministic
   node/edge order, components, spacing/area/normal quality and rejection
   audit;
4. implement graph Poisson as a pure function and freeze identical
   `PlacementIntent[]` for the same seed;
5. visualize graph and placements as diagnostics without creating Patches;
6. realize only a separate opt-in Flower sample through the current
   `generateShapePoints()` compatibility adapter;
7. compare project facts and final realized mesh through the Migration
   Regression Harness. The first-print baseline continues to select the legacy
   random path and must remain exact;
8. add forced graph/backend failure and prove fallback leaves the project and
   current pure-random result unchanged.

Do not begin with STL, curvature weighting, adaptive density, directional flow
or Network generation. Once this slice is deterministic, add a closed STL Base
that produces the same graph contract through mesh capabilities; placement
and Motif realization code should require no source-kind branch.

## 11. Regression and conformance gates

- existing baseline FKEI SHA, project/Spider/finalGraph invariants and current
  resolution-68 geometry contract remain unchanged;
- current `randomPack` uses the current code path and reproduces Patch IDs,
  point order/radii/roles and saved FKEI;
- same Base fingerprint + graph recipe produces identical node/edge IDs,
  canonical order, components and graph fingerprint on repeated Web runs;
- candidate backends compare exact discrete graph/placement decisions where
  they implement the same algorithm contract; scalar position/normal/
  curvature tolerances are operation-specific and reviewed, never inherited
  automatically from mesh-volume tolerance;
- same graph fingerprint + placement request produces identical placement
  IDs, Motif assignments, transforms and rejection reasons;
- near but disconnected surfaces do not receive an adjacency edge;
- changing graph recipe, Base or placement strategy marks dependent evidence
  stale rather than silently moving a Motif;
- STL/Mesh generation uses its own capability adapter but the same portable
  graph, strategy and placement validators;
- realization results pass `compareGeometryResult(reference, candidate,
  tolerances)` before any architecture path replaces production behavior;
- Web remains functional with native/CUDA graph generation unavailable.

## 12. Deliberately unresolved

- benchmark-selected target spacing, candidate multiplier, neighbour count and
  surface-plausibility thresholds;
- the canonical multi-scale curvature estimator and principal-direction sign;
- thickness methods for thin/open/non-manifold imported meshes;
- whether large graph snapshots are always embedded or content-addressed in a
  future FKEI container;
- whether author-painted structural importance is a separate surface field or
  a graph-node annotation layer;
- when an edge-interpolated placement is worth supporting beyond node-only
  placement.

These choices need visual comparison, failure fixtures and later physical
evidence. They are not guessed during the geometry freeze.
