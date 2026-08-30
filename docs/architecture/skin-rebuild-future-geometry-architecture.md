# SKIN REBUILD future geometry architecture

Status: design only — no implementation or migration is authorized before the physical result for checkpoint `1681a1de1a24e220c4b5e1db55a8427c3caa0706` is recorded.

## 1. Purpose and frozen boundary

The future architecture should let SKIN REBUILD add new Base, Motif, distribution, network-edge and compute implementations without teaching the UI, FKEI document or project model about a particular geometry engine. The production workflow remains:

`BASE → MOTIF → SURFACE DISTRIBUTION → NETWORK → JUNCTION / MORPH → VALIDATION → PRINT / EXPORT`

The following are frozen until the physical print result returns:

- current Spider lattice and Dry Web geometry;
- overhang thresholds, red-face reinforcement and removable-support geometry;
- mesh resolution, defaults, SDF evaluation, topology repair and export coordinates;
- current `.fkei` shape reproduction and bundled sample bytes.

This document proposes boundaries and migration gates only. It does not rename existing runtime types, change saved schemas, introduce CUDA dependencies or move geometry code.

## 2. Architectural rules

1. UI actions create backend-neutral project commands; they never invoke CUDA, WebGPU or a concrete SDF directly.
2. FKEI stores authored intent, stable identities, source provenance and versioned parameters, not backend handles or transient GPU buffers.
3. CPU remains the portable reference implementation and compatibility fallback.
4. WebGPU and CUDA are adapters behind the same compute contract. A project opens even when its preferred accelerator is unavailable.
5. Topology, geometric realization and presentation are separate layers.
6. Every backend reports the implementation/version, numeric policy and warnings used for a result.
7. Export consumes a validated canonical geometry result in the existing object-to-mm and print-plate coordinate contract.

## 3. Shared pipeline contracts

The names below are conceptual interfaces, not committed TypeScript APIs.

```text
Project / FKEI / UI
        |
        v
GeometryRequest + immutable ProjectSnapshot
        |
        v
ComputeBackend (CPU reference | WebGPU | CUDA adapter)
        |
        v
GeometryResult + ValidationFacts + BackendProvenance
        |
        v
Preview / diagnosis / export
```

A `GeometryRequest` identifies the operation, input snapshot hash, coordinate frame, quality policy, seed and cancellation/progress channel. A `GeometryResult` contains backend-neutral typed data such as a surface sample, graph, indexed mesh or triangle soup plus validation facts. It never exposes a GPU buffer as the only copy.

`BackendProvenance` records backend kind, adapter version, numeric precision, device class where appropriate, elapsed time and any fallback. It is evidence, not part of shape authorship.

## 4. BASE

### 4.1 Sources

Initial implementations:

- Metaball / SDF, corresponding to the current authored Base;
- STL / mesh import;
- future implicit, parametric, scan or other source formats.

### 4.2 Common geometry interface

Downstream stages depend on a `BaseGeometry` capability interface instead of a source-format union. Capabilities are explicit because not every source can provide every query efficiently:

- stable source identity and source-to-project transform;
- bounds and units;
- inside/outside or signed-distance query;
- closest-surface projection with normal;
- deterministic surface sampling;
- mesh realization at a requested quality;
- optional acceleration structure construction;
- source provenance and warnings.

An imported mesh may implement signed distance through a winding/nearest-surface adapter; an SDF may realize a mesh through the current bounded mesher. Callers request a capability and receive a typed unsupported result rather than inspecting whether the source was STL or metaballs.

Source coordinates remain distinct from project/object coordinates and final millimetre export coordinates. Import normalization is explicit and saved; it is never inferred again by a different backend.

## 5. MOTIF

`MotifDefinition` describes design intent and `MotifInstance` describes one placed, stable-ID realization. The first registry contains:

- Coin, Ring and Flower;
- one-stroke Flower;
- Curve, SVG and Polyline;
- Custom Motif supplied by a future extension.

Each definition declares its parameter schema, local 2D/3D frame, boundary/centreline representation, attachment sites, deformation permissions and deterministic realization version. SVG or custom inputs retain a canonical asset hash and normalized local transform.

Motif realization does not decide where instances are distributed and does not own network topology. It may expose attachment and morph handles used later by Junction / Morph.

## 6. SURFACE DISTRIBUTION

The current fully random packing remains the first `SurfaceDistributionStrategy`. Future strategies share the same inputs and output stable placement records.

The intended graph-aware route is:

`BaseGeometry → SurfaceGraph → graph-aware random distribution`

`SurfaceGraph` is a sampled/topological description of the Base surface with stable nodes, adjacency, local frames, area/curvature facts and optional author constraints. It is not the later structural Network graph.

A distribution strategy receives the Base capability, optional Surface Graph, Motif definitions, seed and constraints. It returns placements plus rejected-candidate facts. Randomness is derived only from the saved seed and a versioned algorithm. Strategies may use geodesic distance, curvature, regions or graph neighbourhoods without changing Motif or Base serialization.

## 7. NETWORK

### 7.1 Separate topology from edge geometry

`NetworkTopology` owns stable node/edge IDs, incidence, roles, attachment identities and connectivity claims. `NetworkEdgeGeometry` realizes one topological edge.

Initial and future edge realizers:

- Straight, matching the current Spider member concept;
- Curve;
- Spline;
- Custom edge geometry.

Topology algorithms may propose or edit connections without knowing whether an edge is straight or curved. Geometry algorithms receive endpoints, endpoint frames, clearance/radius policy and optional control data. Validation evaluates the realized curve/tube, not merely the topological chord.

Dry Web, Spider Network and future Graph algorithms become named topology strategies. Existing topology and straight-edge facts remain the compatibility strategy during migration.

### 7.2 Saved representation

FKEI eventually stores a versioned topology recipe and a versioned edge-geometry recipe separately. Stable IDs and endpoint references survive a change of compute backend. Cached realized geometry may be stored as optional evidence, but it cannot be the only editable source.

## 8. JUNCTION / MORPH

`JunctionDefinition` bridges Motif attachment sites and Network endpoints. The intended morphological sequence is:

`planar Motif → calyx-like Junction → stem / Network`

The junction receives Motif local geometry, incident edge directions, edge count, radii, authored strength/load hints and Base clearance capabilities. It returns a bounded transition geometry and attachment audit.

`MotifMorphPolicy` may deform a Motif according to connection direction, number and strength. Morphing remains a separate, versioned operation with limits defined by the Motif. A connection cannot silently mutate the original Motif parameters; FKEI records the morph policy and derived instance facts. A no-morph policy preserves current behavior.

## 9. COMPUTE BACKEND

### 9.1 Shared application layer

The UI, command/history journal, FKEI parser/serializer and project model are shared on Windows, macOS and browser deployments. They depend only on backend-neutral requests, results and progress/cancellation events.

The backend selector performs capability negotiation and shows the selected backend and fallback reason. A saved project may express a preferred backend for convenience, but never requires it for opening or light editing.

### 9.2 CPU reference and WebGPU fallback

CPU is the normative portable path for contract tests, compatibility execution and smaller jobs. WebGPU is an optional client-side accelerator for browsers on Windows or macOS, including pages served from Cloudflare. Cloudflare hosts the static application; browser WebGPU executes on the client, not in the Worker runtime.

If WebGPU is unavailable or fails capability checks, the operation falls back to CPU when the requested quality fits a declared resource budget. Viewing, light editing and FKEI round-trips must remain available even when high-resolution generation is deferred.

### 9.3 Windows CUDA adapter

An optional CUDA adapter targets the author's RTX 3080 for high-precision/high-throughput generation and analysis. It should run behind a narrow local service, worker or native bridge that accepts serialized backend-neutral requests and returns backend-neutral results. CUDA modules may depend on NVIDIA libraries; UI, FKEI and project packages may not.

The adapter must:

- advertise supported operations, memory and precision before selection;
- validate request and snapshot hashes;
- stream bounded progress and support cancellation;
- return portable results and provenance;
- fail without corrupting the project, allowing CPU/WebGPU retry;
- pass the same conformance fixtures as CPU within operation-specific tolerances.

CUDA is an accelerator, not a new project format.

## 10. Reproducibility and numeric policy

Bit-identical floating-point output across CPU, WebGPU and CUDA is not assumed. Reproducibility is defined in layers:

1. canonical project/FKEI bytes and stable IDs;
2. identical discrete topology where the algorithm contract requires it;
3. bounded numeric agreement for projection, field and mesh facts;
4. identical validation decisions around explicitly guarded thresholds;
5. unchanged export coordinate contract.

Operations near a threshold report their margin. Backend conformance tests include adversarial near-threshold fixtures so a faster adapter cannot silently weaken fail-closed validation.

## 11. Migration gates

No gate starts before the physical print checkpoint is resolved.

1. Freeze and document the current CPU behavior as reference fixtures without reorganizing it.
2. Introduce backend-neutral request/result types around one read-only diagnosis operation.
3. Add conformance tests and provenance; keep the original direct call as fallback.
4. Wrap current Metaball/SDF as the first Base adapter with byte- and geometry-equivalence checks.
5. Separate existing Network topology records from straight-edge realization without changing output.
6. Add WebGPU only after the CPU adapter passes; add CUDA only after both the request boundary and failure recovery are stable.
7. Version FKEI extensions additively and prove old samples restore to the same shape before enabling new authoring.
8. Introduce graph-aware distribution and Junction/Morph as opt-in strategies; never migrate an existing project implicitly.

Each gate requires unit tests, FKEI round-trip fixtures, browser QA, backend provenance and an explicit geometry-baseline comparison.

## 12. Test architecture

- Base capability fixtures: SDF and imported closed mesh answer consistent bounds, sign, projection and normals.
- Motif fixtures: canonical Coin/Ring/Flower and curve assets realize deterministically from saved intent.
- Distribution fixtures: seed/version stability, Surface Graph identity and graph-aware constraint audits.
- Network fixtures: topology remains stable while Straight/Curve/Spline realizers are exchanged; realized geometry receives the full clearance and angle audits.
- Junction fixtures: bounded continuity, attachment identity and no-morph compatibility.
- Backend conformance: CPU reference versus WebGPU/CUDA within declared tolerances, including cancellation and forced failure.
- Persistence: old FKEI opens unchanged; new optional fields survive Save/Restore; missing accelerator never blocks parsing.
- Export: canonical project-to-mm and print-plate coordinates remain identical across backends.

## 13. Open decisions for a later implementation proposal

- Which Base capabilities are mandatory for editing versus high-resolution generation?
- Which operations require identical discrete topology across backends?
- How are large imported assets referenced or embedded in FKEI without making projects fragile?
- Which curve representation is canonical for Network edges and SVG/Polyline Motifs?
- Which tolerance and precision tiers correspond to preview, validation and final export?
- What local transport and sandbox boundary should the CUDA adapter use?
- Which project changes invalidate cached realized geometry while retaining topology and authorship?

These decisions require benchmark and print evidence; none should be inferred by the current UI cleanup.
