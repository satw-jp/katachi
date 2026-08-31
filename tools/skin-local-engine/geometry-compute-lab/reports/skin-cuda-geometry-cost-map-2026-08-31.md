# SKIN CUDA Geometry Compute Cost Map

Recorded from the deterministic 120 mm project on branch `agent/skin-cuda-geometry` at final-mesh resolution 128. This is shadow/lab evidence only. Web remains authoritative; `shadow=true` and `productionApplied=false`.

## Measured production-shaped workload

| Work | Count | Web/CPU | CUDA candidate | Kernel | Result |
|:---|---:|---:|---:|---:|:---|
| Project build (Stage 3-5A shaped) | 38 patterns / 325 lattice edges | 1200.14 ms | — | — | CPU authority |
| Final BODY build | 222,268 faces | 19373.54 ms | — | — | production algorithm unchanged |
| Mesh analysis field | 222,268 faces | 67.35 ms | 739.61 ms | 0.853 ms | identity/classification matched; max SDF Δ 5.396e-7 |
| Base SDF grid | 480,009 points / 2 batches | 80.46 ms | 1690.28 ms | 2.175 ms | identity/classification matched; max SDF Δ 2.697e-7 |
| Finished-BODY composite grid | 480,009 points | 9427.32 ms | not encoded | — | next primitive-snapshot gap |
| Overhang grouping after mesh | 222,268 faces | 93.36 ms | not selected | — | 14,008 risky faces / 851 regions |

CUDA candidate results are observations only. All sample identities and classifications matched, values were finite, and both candidate paths reported `productionApplied=false`.

## Cost map and boundary

The exact grid used 61 × 61 × 129 points. Finished-BODY field sampling took 9427.32 ms; full BODY build took 19373.54 ms. Marching-tetrahedra assembly, orientation, topology and bounded repair remain CPU/fail-closed work.

1. **Finished-BODY SDF grid sampling** is the highest-impact GPU target. The Base-only CUDA lower bound is already measured, but production use first needs a portable immutable snapshot for Surface Pattern primitives and permanent capsule edges.
2. **Mesh analysis continuous fields** are the lowest-risk first integration target. Stable face indices preserve identity, CUDA `insideScore` matches Web, and `overhangAngleDeg` plus thresholding can remain cached/browser-owned.
3. **Route collision/clearance** remains the next shared primitive for Stage 5B, Stage 8 and future Web. This task fixes its semantic contract but does not implement route selection or a support-specific kernel.

## Authority and stop rule

No CUDA value is connected to BODY, FKEI, STL, 3MF, Support or Web topology. Graph topology, sparse support selection and threshold meaning remain Web/CPU decisions. CUDA failure cannot alter production output.
