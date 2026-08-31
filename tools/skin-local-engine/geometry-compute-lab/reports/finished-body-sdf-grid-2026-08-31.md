# CUDA-GEO-5 — Finished BODY SDF Grid Prototype

- Policy: Web/CPU authoritative; CUDA shadow only; productionApplied=false
- Snapshot: 13,152 bytes, sha256:da554d53d2f9fae108473c404069a6ba68f8215b79cfd22efc47656f4d78bd03
- Grid: 480,009 points (61 × 61 × 129), x-fastest-y-z
- CPU SDF: 8708.94 ms
- CUDA cold full grid: 32.14 ms; kernel 1.194 ms
- CUDA warm median: 28.36 ms; kernel 1.236 ms
- Max SDF delta: 3.182928e-7 (tolerance 0.00001)
- Sign/classification mismatch: 0/0
- Offline mesh triangles: 222,268 CPU vs 222,268 CUDA-field
- Offline mesh components: 1 vs 1; watertight true/true
- Projected BODY build: 9974.58 ms (48.5% faster than 19,373.54 ms baseline)
- Recommendation: **Strong candidate**

No CUDA value was applied to production geometry. GPU meshing, Marching Cubes, topology and repair are outside this prototype.
