# SKIN REBUILD Network / Junction architecture — 2026-08-30

Status: design and migration plan only. This document does not change runtime
code, the `katachi.skin-rebuild.fkei.v1` schema, package versions, geometry
thresholds, or generated output. The unresolved physical print remains the
gate before any migration begins.

Frozen reference:

- repository checkpoint: `6b5d61a0ceb57a967346dfecba12fff62d1aff19`;
- baseline: `public/samples/skin-rebuild-first-print.fkei`;
- baseline SHA-256:
  `4bacfcced0fe311eef704a792d61f4a68531051ff408e26d5ff2937b8bbfadcf`;
- dependency direction from TASK 9:
  `UI -> GeometryEngine -> WebGeometryEngine / WindowsCudaGeometryEngine`.

## 1. Decision summary

The future Network has four separately versioned facts:

1. **raw topology**: which stable Node IDs are connected by which stable Edge
   IDs, including role, provenance and author protection;
2. **cleaned topology**: a deterministic, tolerance-bounded derivation that
   removes representation noise without changing authored form;
3. **author simplification intent**: an explicit operation which may change
   structure and strength, previewed and confirmed by the author;
4. **geometry and junction intent**: portable curve/profile/morph recipes that
   Web and Windows-CUDA backends can realize, never a native pointer or final
   mesh as the only editable source.

A topological Edge means only `Node A <-> Node B`. A straight cylinder is the
current realization of that relation, not the definition of an Edge. The
initial compatibility implementation will still use only `straight` plus a
circular constant-radius profile, so adopting this model need not change one
coordinate or triangle.

## 2. What the current code actually stores

| current fact | file / function | current coupling | future correspondence |
| --- | --- | --- | --- |
| `InternalStructureGraph` | `src/studies/skin/voronoi.ts` | Contiguous numeric IDs; Node owns position/radius; Edge owns endpoint indices/radius; an Edge is assumed straight everywhere. | Compatibility adapter into stable-ID `NetworkTopology`, `StraightEdgeDefinition` and `CircularProfileDefinition`. |
| Spider lattice generation | `src/studies/skin/rebuild/model.ts::buildSkinRebuildLattice()` and private `GraphBuilder` | Route generation, near/exact Node reuse, undirected duplicate removal, radius, containment and <=45-degree realization checks happen in one builder. Connection meaning is held separately in `SkinRebuildLatticeConnection`. | A topology proposal plus straight realization request and portable validation evidence. |
| `finalGraph` | `SkinRebuildProject.finalGraph`; `assembleSkinRebuildProject()` | Recomputed as `mergeSkinRebuildGraphs(dryWeb, lattice)`. Exact-position merge discards source identity and reindexes every record. Removable `printSupport` is deliberately excluded. | A derived artwork view over named Network layers; never an authoritative saved graph. |
| Stage 5B reinforcement | `reinforceSkinRebuildOverhangRegion()` and `stage5bReinforcement.worker.ts` | A selected red-face sample is routed to a Node or a point that splits an existing straight Edge. Accepted branches are appended to the same `lattice`; a separate graph is returned only for cyan preview. | `JunctionIntent` plus generated reinforcement topology with lineage to the source Edge and diagnosed surface region. |
| support contact split | `mergeSkinRebuildGraphsAtSupportContacts()` | Splits artwork Edges at physical pillar contacts only in the reachability graph; BODY geometry stays unchanged. | A derived validation/reachability view, not an authoring cleanup or saved topology mutation. |
| author edge deletion | `removeSkinRebuildLatticeEdge()` and `retainConnectedSkinRebuildLatticeConnections()` | Deletes by transient numeric ID, compacts unreferenced Nodes and re-audits support claims by connectivity. | Stable-ID author command plus revision/provenance history and invalidated derived claims. |
| FKEI | `src/studies/skin/rebuild/fkei.ts` | v1 saves `dryWeb`, `lattice`, `printSupport` and `latticeConnections`. IDs must equal array indices; Edges must be straight and <=45 degrees. `captureSkinRebuildFkei()` intentionally removes `finalGraph`, and restore reassembles it. | A future schema can save raw/cleaned topology and author intent; current v1 remains byte/schema compatible. |

The current builder already performs two useful but incomplete cleanup acts:
it reuses some positions and suppresses duplicate endpoint pairs. It does not
retain stable identity, aliases, source layer, role, cleanup policy or edge
lineage. Exact-position merging in `mergeSkinRebuildGraphs()` also makes
provenance unrecoverable after the fact. This is why cleanup cannot simply be
added as another call to that function.

`src/studies/skin/graphCore.ts` is the preferred foundation for stable string
IDs, revision lineage, lifecycle, provenance, canonical serialization and
fingerprints. `SurfaceGraph` and `ArtworkGraph` demonstrate those contracts.
They should inform the Network layer, but their semantic edge types must not be
reused as if a surface relation and a printable Network member were the same
thing.

## 3. Portable Network document

The following TypeScript is a conceptual contract, not code authorized for
this checkpoint.

```ts
interface NetworkDocument extends GraphRecordMetadata {
  kind: "network-document";
  schemaVersion: 1;
  coordinateFrame: CoordinateFrameRef;
  rawTopology: NetworkTopology;
  cleanup: NetworkCleanupDerivation | null;
  simplificationIntent: NetworkSimplificationIntent | null;
  edgeGeometryDefinitions: NetworkEdgeGeometryDefinition[];
  profileDefinitions: NetworkProfileDefinition[];
  junctionIntents: MotifNetworkJunctionIntent[];
}

interface NetworkNode extends GraphRecordMetadata {
  kind: "network-node";
  position: Vector3Value;
  nodeRole: "route" | "motif-anchor" | "junction" | "branch" |
    "plate-contact" | "diagnostic-split";
  anchorRefs: PortableAnchorRef[];
  authorProtection: "none" | "position" | "identity-and-position";
}

interface NetworkEdgeTopology extends GraphEndpointRecord {
  kind: "network-edge";
  from: string;
  to: string;
  geometryDefinitionId: string;
  profileDefinitionId: string;
  roles: NetworkEdgeRole[];
  materialDisposition: "permanent-artwork" | "removable-print-support";
  intersectionBehavior: "connect" | "cross-without-connection";
}
```

IDs are opaque stable strings. Array order is canonical serialization order,
not identity. Node position belongs to portable project coordinates. A Node
does not acquire a material radius merely because the current renderer needs
one: material thickness belongs to the referenced profile. A Node may retain
a conservative clearance or junction envelope as validation intent, but that
is distinct from an Edge profile.

Roles are semantic and may be combined, for example:

- `spider-route`, `dry-web`, `surface-connector`;
- `overhang-reinforcement`, `junction-stem`, `bridge-break`;
- `structural`, `decorative`, `validation-only`.

`materialDisposition` is separate so permanent artwork cannot accidentally be
exported as removable support or vice versa. A role is not a geometry kind.
Every Node and Edge carries `GraphProvenance`: generator name/version and input
fingerprint for generated records, and pinned/moved/added/deleted history for
author edits.

### 3.1 Edge geometry definition

```ts
type NetworkEdgeGeometryDefinition =
  | { id: string; kind: "straight"; contractVersion: 1 }
  | { id: string; kind: "polyline"; points: Vector3Value[]; contractVersion: 1 }
  | { id: string; kind: "bezier"; controls: Vector3Value[]; degree: 2 | 3; contractVersion: 1 }
  | { id: string; kind: "spline"; basis: string; knots: number[]; controls: Vector3Value[]; contractVersion: 1 }
  | { id: string; kind: "custom-curve"; assetRef: PortableAssetRef; contractVersion: number }
  | { id: string; kind: "custom-geometry"; recipeRef: PortableAssetRef; endpointMap: EndpointMap; contractVersion: number };
```

Control data is expressed in a declared project or edge-local coordinate
frame. Endpoints are still owned by topology; a curve definition cannot point
to different Nodes. `custom-geometry` saves a portable recipe/asset hash and
endpoint mapping, not a backend-specific mesh handle. If an optional realized
mesh cache is saved later, its input fingerprint makes it discardable.

### 3.2 Radius and profile

```ts
type NetworkProfileDefinition =
  | { id: string; kind: "circle"; radius: ScalarOrCurve; units: "project" | "mm" }
  | { id: string; kind: "custom-profile-sweep"; curveRef: PortableAssetRef;
      scale: ScalarOrCurve; twist: ScalarOrCurve; units: "project" | "mm" };
```

The current `edge.radius` maps to one constant circular profile. Future taper,
custom profile sweep and endpoint transitions do not alter incidence. Profile
continuity at a Node is a realization/junction validation question, not a
reason to rewrite topology.

## 4. Raw, cleaned and simplified states

These states are not interchangeable:

```text
rawTopology
    |
    | deterministic, policy-versioned, intent-preserving
    v
cleanedTopology + aliases + lineage + audit
    |
    | explicit author strength/constraints, preview and confirmation
    v
simplifiedTopology (derived preview/result)
```

Raw topology is the reproducible generator/import result. Cleaned topology is
the normal input to realization. The simplification result is derived from
cleaned topology plus saved author intent; it is not allowed to overwrite the
raw or cleaned facts silently.

### 4.1 Graph Cleanup

Cleanup removes numerical or representational defects without intentionally
changing form. It has no 0–100% creative-strength slider. Its policy records
project/mm tolerances, algorithm version, input fingerprint and fail-closed
conditions. It emits:

- `cleanedTopology` with retained stable IDs where possible;
- `nodeAliases: oldId -> retainedId`;
- `edgeLineage: oldId -> newId[]` for split/normalized members;
- deleted-record reasons and protected records left unchanged;
- before/after connectivity, bounds, length, role/profile and anchor audits;
- warnings requiring author review instead of guessed repairs.

Recommended deterministic order:

1. validate finite coordinates, endpoint existence, profiles, roles and
   provenance; canonicalize undirected endpoint order without changing IDs;
2. merge nearly coincident Nodes only within the declared tolerance and only
   when anchor, role, protection and coordinate-frame contracts are compatible;
3. find true 3D intersections and split Edges when both records say
   `intersectionBehavior: connect`; a projected crossing or explicit
   `cross-without-connection` remains unchanged;
4. normalize overlapping collinear intervals only when curve kind, profile,
   roles, material disposition and connection semantics match;
5. remove duplicate undirected Edges after the split/overlap steps, preserving
   combined provenance and lineage;
6. remove or collapse a micro Edge only when it is a generator/numeric artifact
   and doing so preserves anchors, components, roles and profile transitions;
   otherwise report it as a simplification candidate;
7. remove a degree-2 Node as cleanup only when the two realized segments are
   exactly collinear within the cleanup tolerance, have compatible profiles
   and roles, and the Node is neither protected nor an attachment/junction.
   Near-collinear or strength-relevant removal belongs to Simplification.

For future curves, the GeometryEngine may batch-evaluate closest approaches
and intersection candidates. The portable core still decides the topology
rewrite from versioned policy and returns aliases/lineage. A CUDA kernel may
accelerate candidate discovery; it may not decide that two author identities
are equivalent.

Cleanup must preserve connected components, protected attachment reachability,
material disposition and declared intersection semantics. A tolerance that
would merge two different Motif anchors is an error, not permission to choose
one.

### 4.2 Graph Simplification

Simplification is an authored structural operation. It may reduce branch
density, collapse or reroute members, prune cycles, change strength paths or
relax a curve. The future 0–100% control saves intent rather than only its
latest mesh:

```ts
interface NetworkSimplificationIntent {
  id: string;
  contractVersion: 1;
  inputCleanedFingerprint: string;
  strength: number;                 // 0..1; 0 is a strict no-op
  strategy: "density" | "branch-prune" | "curve-relax" | "custom";
  protectedNodeIds: string[];
  protectedEdgeIds: string[];
  protectedRoles: NetworkEdgeRole[];
  seed?: string;
  provenance: GraphProvenance;
}
```

The UI must show raw/cleaned/simplified counts, connectivity and validation
differences before confirmation. Undo/Redo operates on the intent command.
Every non-zero simplification invalidates mesh, support claims, junction
realization, overhang diagnosis and export evidence. It is never run as a Save
side effect and never disguised as Cleanup.

## 5. Motif to Network Junction

A Junction is portable morphological intent joining a Motif instance to one or
more Network attachments. It is not the final union mesh.

```ts
interface MotifNetworkJunctionIntent extends GraphRecordMetadata {
  kind: "motif-network-junction";
  contractVersion: 1;
  motif: {
    definitionId: string;
    instanceId: string;
    attachmentSiteId: string;
  };
  networkAttachments: Array<
    | { kind: "node"; nodeId: string }
    | { kind: "edge"; edgeId: string; curveParameter: number }
  >;
  connectionPosition: Vector3Value;
  connectionFrame: PortableFrame;
  incomingDirections: Vector3Value[];
  connectionCount: number;
  influenceRadius: { value: number; units: "project" | "mm" };
  morphStrength: number;             // 0..1
  transitionType: "none" | "collar" | "calyx" | "custom";
  role: "permanent-artwork" | "removable-print-support";
  sourceSurfaceRegionId?: string;
}
```

This contains every required identity and geometric cue: Motif identity,
Network Node/Edge identity, connection position, incoming direction(s),
connection count, influence radius, morph strength and transition type. The
connection frame prevents a backend from inferring orientation differently.
If Cleanup splits an attached Edge, its lineage remaps the attachment; an
attachment exactly at the split is promoted to the new stable Node. Ambiguous
remapping fails closed and leaves the Junction stale.

The intended realization is:

```text
portable planar Motif instance
        |
        | JunctionIntent: frame, directions, count, radius, strength
        v
calyx-like bounded morph / transition
        |
        v
profiled stem and Network
```

`morphStrength: 0` with `transitionType: "none"` is the compatibility path.
Morphing creates an instance-specific derived realization; it never mutates
the shared `MotifDefinition`. The engine returns transition geometry plus
audits for attachment continuity, Base clearance, profile continuity,
self-intersection, realized connection count and input fingerprint.

Current Stage 5B can later be adapted without pretending its geometry already
is a Calyx. Its red-face sample/normal becomes a surface attachment fact; the
chosen lattice Node or split Edge becomes `networkAttachments`; the accepted
route becomes generated reinforcement topology; `reinforcement` remains a
derived preview. Existing `SkinRebuildLatticeConnection` facts become portable
connectivity claims referencing stable Motif/Network IDs instead of nearest
numeric positions.

## 6. GeometryEngine boundary

The portable core owns documents, stable IDs, edit commands, cleanup policy,
simplification intent, Junction intent, validation contracts and canonical
fingerprints. It does not own DOM, Worker objects, CUDA buffers or final mesh
state.

GeometryEngine receives coarse-grained immutable jobs such as:

- `realizeNetworkEdges(topology, definitions, profiles, quality)`;
- `findNetworkIntersectionCandidates(realizedCurves, tolerance)`;
- `realizeJunctions(motifInstances, topology, junctionIntents, quality)`;
- `unionArtwork(base, motifs, network, junctions, quality)`;
- `validateNetworkContainment(...)`, `diagnoseTopology(...)` and
  high-resolution mesh/export jobs.

The current Web implementation remains the normative compatibility adapter:
straight endpoint interpolation, exact capsule/cylinder field behavior and
current containment/angle screens. Windows CUDA may accelerate curve sampling,
junction morphology, high-resolution union and mesh generation. Both return
portable curves/meshes/audits with backend provenance. Backend provenance is
evidence and never part of shape authorship.

Graph deduplication, alias/lineage bookkeeping, metadata, canonicalization and
serialization stay on CPU. Large spatial candidate searches may be
accelerated, but their results pass through the same core policy.

## 7. Future FKEI relationship

No field is added to `katachi.skin-rebuild.fkei.v1`. Its validator deliberately
rejects unknown keys, so silently inserting optional Network data into v1
would be a breaking change.

A future reader should support v1 and a new versioned schema. A future Network
section can conceptually contain:

```text
network
  rawTopology
  cleanup
    policy + inputFingerprint
    cleanedTopology
    nodeAliases + edgeLineage + audit
  simplificationIntent
  edgeGeometryDefinitions
  profileDefinitions
  junctionIntents
```

The raw and cleaned graphs are portable facts. The cleanup result is accepted
only when its input fingerprint and policy version match. A simplified graph
and realized mesh are reproducible caches/evidence; the saved simplification
and junction intents are authoritative. Native paths, CUDA pointers and GPU
buffers are forbidden.

v1 migration is deterministic and non-destructive:

- each `dryWeb`, `lattice` and `printSupport` numeric Node/Edge receives a
  stable namespaced string ID derived from source slot, old ID and source
  snapshot fingerprint;
- every old Edge receives `straight` plus a constant `circle` profile from
  `edge.radius`;
- roles/material disposition are inferred only from the explicit v1 slot, not
  from geometry;
- `latticeConnections` are adapted to stable Motif/Network claims;
- no Junction morph is inferred; transition is `none`, strength is zero;
- current `finalGraph` remains derived and is not promoted to an authoritative
  saved record.

Opening v1 must first reproduce the current in-memory project and output. A
new-format Save requires an explicit migration boundary and round-trip tests;
opening an old file alone must not rewrite it. During shadow migration the
legacy projection and new topology are compared, but only the legacy path may
drive geometry until equivalence is proved.

## 8. Compatibility with planned features

| planned feature | why it does not break this boundary |
| --- | --- |
| STL Base Import | Network positions and attachments use project coordinates and Base capability references, not metaball arrays. Containment/nearest-surface calls go through GeometryEngine. |
| Custom Curve Motif | Junction references a stable Motif definition/instance/attachment site; it does not inspect Coin/Flower fields. |
| Base Surface Graph | This remains a distinct surface-sampling/adjacency document used for placement and attachment. It does not become structural Network topology. |
| Spider Graph Cleanup | Raw/cleaned snapshots, aliases, lineage and policy are first-class; cleanup cannot overwrite author intent. |
| Curved Network Edge | Topology endpoints remain unchanged while the geometry definition swaps from `straight` to polyline/Bezier/spline/custom curve. Audits evaluate the realized curve/tube. |
| Calyx-like Junction / Motif Morph | Portable Junction intent supplies identity, frame, directions, count and influence; Web/CUDA realizes it without storing the final mesh as authorship. |

The same model also accommodates custom-profile sweep and custom geometry
without teaching graph topology about tessellation.

## 9. Migration sequence after the print gate

1. Freeze current v1 fixtures, graph arrays, finalGraph projection, mesh facts
   and baseline hash. Add no-op stable-ID adapters in tests only.
2. Define portable Network contracts beside `InternalStructureGraph`; adapt the
   old graph to `straight`/circle and back, proving exact arrays and geometry.
3. Produce raw/cleaned shadow documents and cleanup audit only. Do not feed the
   cleaned result to mesh generation.
4. Prove deterministic aliases/lineage for merge, duplicate, split and exact
   degree-2 cases, including protected Motif and plate anchors.
5. Route the current straight graph through `WebGeometryEngine` with output and
   validation equivalence. Keep the direct path as fallback.
6. Introduce author-confirmed Simplification with strength zero as the initial
   no-op; add non-zero strategies only with physical/strength review.
7. Add `JunctionIntent` with `none`/zero compatibility behavior, then opt-in
   collar/Calyx strategies with backend conformance tests.
8. Add a new FKEI version only after v1 open, v1 compatibility realization,
   migration, Save/Restore, Web-without-native-backend and failure recovery all
   pass.

Every step keeps Web support. No step requires Electron or makes FKEI depend on
Windows.

## 10. Required conformance and failure tests

- stable IDs survive array reorder, cleanup and backend selection;
- near Nodes with incompatible anchors never merge;
- duplicate and collinear overlap cleanup retain roles, maximum profile and
  provenance without creating a new component;
- projected crossings remain disconnected; explicit 3D `connect`
  intersections split deterministically;
- micro/degree-2 cleanup refuses protected Junction/Motif/plate Nodes;
- `strength: 0` simplification is a canonical no-op; non-zero changes invalidate
  all dependent evidence;
- Junction edge attachments remap through split lineage or fail stale;
- straight compatibility realization matches current containment, <=45-degree
  screening, `finalGraph`, mesh and export coordinate facts;
- v1 FKEI opens and round-trips through the current path unchanged;
- Web opens and edits future project data when CUDA is absent;
- CPU/Web and CUDA return the same discrete topology where required and bounded
  geometry/audit agreement elsewhere.

## 11. Deliberately unresolved decisions

- canonical spline basis and custom-asset embedding/reference policy;
- operation-specific cleanup tolerances in project units versus millimetres;
- which profile transitions require an explicit Junction rather than an
  ordinary branch node;
- which simplification strategies can make physical strength claims, if any;
- whether cleaned topology bytes are mandatory evidence or may be recomputed
  from raw topology and a frozen policy version.

These require benchmark, interoperability and physical-print evidence. They
must not be guessed during the geometry freeze.
