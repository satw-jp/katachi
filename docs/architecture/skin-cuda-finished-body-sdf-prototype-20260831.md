# CUDA-GEO-5 — Finished BODY SDF Grid Prototype

Status: RTX 3080 shadow laboratory only. Web/CPU remains authoritative,
`shadow=true`, `productionApplied=false`. This prototype is not imported by
the production SKIN UI or BODY mesh path.

## Immutable field snapshot

`katachi.skin.finished-body-field-snapshot.v1` is a derived compute transport,
not FKEI or model state. Version 1 encodes the exact current Print #002 branch:

- right-handed object coordinates, `+z`, explicit units-per-millimetre;
- Base/host balls and host smooth-union value;
- reinforced realized Surface Pattern/Motif points, split into production's
  flat coin/flatRing order and raw ring3d/flower order;
- thickness, Surface roundK and the current plate/coinBulge=0 boolean order;
- permanent finalGraph edges (Web plus reinforcement) as ordered capsules and
  the same bounded capsule blend used by `createFinishedSkinBodySdfEvaluator`;
- project identity plus a SHA-256 geometry fingerprint over the packed bytes.

Removable Support and scaffold pillars are structurally absent. Version 1
fails closed for window mode, non-zero coin bulge/balance or non-zero QUAD
mesh-join width instead of approximating unimplemented production branches.
The measured snapshot was 13,152 bytes: 12 host balls, 152 flat realized
points, zero raised points and 325 permanent capsules.

The helper provides lab-only exact-origin, shadow-header-protected routes. A
volatile session binds project fingerprint, algorithm contract and geometry
fingerprint. The worker keeps one current snapshot, CUDA context, loaded PTX,
kernel function and capacity buffers. A repeat request is a 96-byte regular
grid definition; snapshot geometry is not resent and repeat H→D bytes are zero.

## Measured result

Deterministic 120 mm Print #002, resolution 128, x-fastest-y-z order:

| Evidence | Result |
|:---|---:|
| Grid | 61 × 61 × 129 = 480,009 points |
| CPU grid preparation | 1.68 ms |
| CPU Finished BODY SDF | 8,708.94 ms |
| Snapshot encode | 2.39 ms |
| Snapshot upload, cold full helper path | 214.20 ms |
| CUDA first grid, full helper path | 32.14 ms |
| CUDA first grid kernel | 1.194 ms |
| CUDA warm full helper path, median of 10 | 28.36 ms |
| CUDA warm kernel, median of 10 | 1.236 ms |
| CUDA warm worker round-trip median | 15.26 ms |
| CUDA warm D→H median | 0.429 ms |
| CUDA warm result decode median | 6.22 ms |
| Maximum absolute SDF delta | 3.182928e-7 |
| Float32 comparison tolerance | 1e-5 |
| Sign/classification mismatch | 0 / 0 |

The locally rebuilt prototype executable is 64,512 bytes with SHA-256
`F72EAA1D3EEF71374D2C8F900D0E402C452ED751BC926EBC944D8F271BA49F0B`.
It uses the Windows CUDA Driver API and embedded PTX JIT; CUDA Toolkit and nvcc
are not used. The generated executable and native build directories remain
ignored; CMake/MSVC source is the reproducibility record.

## Offline CPU isosurface simulation

The CUDA scalar array was supplied to the existing CPU
`buildMeshFromField` sampling order. No CUDA mesher, Marching Cubes, repair or
production adoption was added.

- triangle count after the existing bounded Final BODY repair: 222,268 CPU reference / 222,268 CUDA-field;
- components: 1 / 1;
- watertight: true / true, open 0 / 0, non-manifold 0 / 0;
- maximum source-bounds delta: 1.728593e-7;
- saved-topology diagnostics match exactly: 333,402 total edges, closed,
  consistently wound, degenerate-free, one component.

The simulation deliberately applies the same existing CPU repair and
saved-topology gate to both fields. It does not route the CUDA result into the
production builder.

## Decision

Replacing only the measured 9,427.32 ms baseline sampling portion with the
28.36 ms warm full path projects the 19,373.54 ms BODY build to about
9,974.58 ms, a 48.5% reduction. This is a **Strong candidate** for a later
selective integration. It is not authorization to make CUDA authoritative or
to alter the BODY mesh path. CPU isosurface assembly, topology, repair and all
author semantics remain unchanged.

Raw evidence:

- `tools/skin-local-engine/geometry-compute-lab/reports/finished-body-sdf-grid-2026-08-31.json`
- `tools/skin-local-engine/geometry-compute-lab/reports/finished-body-sdf-grid-2026-08-31.md`
