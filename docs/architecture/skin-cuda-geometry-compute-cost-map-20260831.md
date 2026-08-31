# SKIN CUDA Geometry Compute / Analysis Backend — Cost Map

Status: shadow laboratory only. Base commit
`13fe4d204041748d2782f29abec5c8474343a37b`; branch
`agent/skin-cuda-geometry`. Nothing in this document authorizes a production
geometry, FKEI, Support, Web-topology, Print or deployment change.

## Boundary

CUDA answers **what is geometrically true**: continuous distances, angles,
clearances, coverage fields and ordered sample values. Browser/CPU answers
**what the work should do**: thresholds, target generation, route acceptance,
sparse selection, graph topology, Motif relationships and author edits.

Web remains authoritative. CUDA is a candidate observation only:

```text
authoritativeBackend = web
candidateBackend     = cuda
shadow               = true
productionApplied    = false
```

## Measured 120 mm workload

The Lab calls existing production functions without importing the Lab back
into production. The deterministic project has 12 Base balls, 38 Patterns,
306 lattice nodes, 325 lattice edges and 8,159 current radius-aware route
containment samples. Resolution 128 produced 222,268 final BODY faces and an
exact 61 × 61 × 129 meshing grid (480,009 scalar samples).

| Operation | Workload | Web/CPU | CUDA full observation | CUDA kernel | Current decision |
|:---|---:|---:|---:|---:|:---|
| Project build | 38 Patterns / 325 lattice edges | 1,200.14 ms | — | — | CPU authority |
| Final BODY build | 222,268 faces | 19,373.54 ms | — | — | unchanged production path |
| Finished-BODY composite field sampling | 480,009 points | 9,427.32 ms | not encoded | — | GPU excellent after primitive snapshot |
| Remaining assembly/orientation/topology/repair | inferred remainder | 9,946.23 ms | not selected | — | CPU/fail-closed |
| Mesh Base-inside field | 222,268 face centroids | 67.35 ms | 739.61 ms | 0.853 ms | CPU today; GPU possible with index-native contract |
| Base-only SDF grid | 480,009 points / 2 batches | 80.46 ms | 1,690.28 ms | 2.175 ms | CPU today; CUDA is a lower bound only |
| Overhang screen/grouping after mesh | 222,268 faces | 93.36 ms | not selected | — | CPU preferable for grouping |

All RTX values were finite. Ordered identity and classification matched for
every face/grid sample. Maximum absolute signed-distance delta was
`5.396e-7` for mesh faces and `2.697e-7` for grid points. The reviewed device
was `NVIDIA GeForce RTX 3080`; the executable SHA-256 remained
`32D62914ABA976639D125E0336E4298C5AA7F316DCB9A1C6664016F4B42C8ACA`.

The Base-only Web calculation is already cheap. Reusing the old containment
contract makes CUDA slower despite the sub-3 ms kernels because face/grid
strings, request construction, identity hashing and semantic reconstruction
dominate. A real geometry-field transport must use stable numeric indices
without weakening topology identity.

## SKIN Compute Cost Map

| Production family | Current evidence | Dominant work | Suitability | Boundary |
|:---|:---|:---|:---|:---|
| Stage 3 Inside / Outside | 38 authored Patterns; 222,268 face-centroid Lab field | repeated Base/field SDF | GPU possible | continuous score on GPU; threshold and author bias in browser |
| Stage 4 Overhang | 14,008 risky faces / 851 regions; grouping 93.36 ms after mesh | normals plus edge adjacency | CPU preferable now | scalar angle may be batched; grouping/region identity stays CPU |
| Stage 5B reinforcement | existing UI evidence reports bounded multi-pass candidate search lasting seconds | containment and candidate route scoring | GPU high for facts | route generation/acceptance stays CPU |
| Stage 6 BODY mesh | 480,009 SDF calls; 222,268 final faces; 19.37 s total | composite field plus isosurface/topology | GPU excellent for field | CPU selects grid and performs topology/fail-closed repair |
| Stage 7 diagnosis | existing real browser evidence: 201,380 faces, about 2.5 s | mesh fields, attribution, region grouping | GPU high for fields | diagnosis meaning/regions stay CPU |
| Stage 8 removable Support | existing evidence: 66 separate members | finished-BODY keep-out and route collision | GPU high for facts | sparse selection and Support Graph stay CPU |
| FKEI restore recalculation | invalidated evidence re-enters Stage 3–7 | same operations | inherited | no backend/session facts persisted in FKEI |
| High-resolution preview | same resolution-cubed scalar field | SDF grid | GPU excellent | preview remains functional without CUDA |
| Graph topology / Support selection / Web topology | small stable-ID graph decisions | maps, sets, author semantics | CPU | never a CUDA responsibility |

## Draft shared primitives

The Lab contract defines three portable semantic operations:

1. `evaluateMeshAnalysisField`: stable face indices, continuous
   `insideScore` and `overhangAngleDeg`. Thresholding consumes cached values
   and does not rerun CUDA.
2. `evaluateSdfGrid`: field fingerprint, explicit bounds/dimensions and
   x-fastest ordered scalar values.
3. `evaluateGeometryRoutes`: stable route index/polyline/radius input and
   minimum BODY/Web/neighbor clearance plus first-collision facts. CUDA never
   accepts a route.

At the time of this Cost Map, the reviewed executable represented only the metaball Base. Production
BODY grid acceleration therefore requires an immutable portable snapshot for
Surface Pattern primitives and permanent capsule edges, with the current
smooth-min order and coordinate contract fixed. This prerequisite is not
silently approximated by the Base-only result.

CUDA-GEO-5 subsequently implemented and measured that prerequisite as a
separate shadow Lab. See
`skin-cuda-finished-body-sdf-prototype-20260831.md`; this does not alter the
Cost Map measurements or authorize production integration.

## Priority

Using impact × GPU suitability ÷ integration complexity:

1. finished-BODY SDF grid sampling;
2. mesh continuous analysis fields with stable numeric identity;
3. generic route collision/clearance shared by Stage 5B, Stage 8 and Web;
4. structural coverage built from the preceding facts.

The first Cost Map phase prototyped the first two lower-level measurements;
CUDA-GEO-5 then evaluated the Finished BODY prerequisite separately. Route evaluation was
specified and its existing 8,159-sample Base-containment workload was counted,
but no Support-specific kernel or selection behavior was added.

## Stop

The Lab does not change CUDA authority, production geometry, FKEI, Stage 5B,
Stage 8, Web topology, Motif placement, Print #002/#003 or authoring UI. The
next task, if approved, should choose one of the top two prerequisites rather
than expanding every GPU-looking operation at once.
