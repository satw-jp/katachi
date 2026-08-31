# CUDA-4B Shadow Geometry Session Cache

250,000 samples. Web is authoritative; CUDA remains a shadow candidate; every comparison matched and `productionApplied=false`.

| Phase | Request | HTTP | Helper decode | Worker | Browser decode | Semantic validate | Client total | Max margin Δ |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|
| first upload (cold) | 3906.39 KiB | 304.70 ms | 9.40 ms | 254.92 ms | 58.22 ms | 150.57 ms | 753.68 ms | 6.094e-7 |
| parameter-only repeat (median) | 0.06 KiB | 26.44 ms | 0.94 ms | 20.83 ms | 29.27 ms | 145.51 ms | 311.14 ms | 6.054e-7 |
| unchanged repeat (median) | 0.06 KiB | 30.47 ms | 0.85 ms | 19.35 ms | 23.66 ms | 124.36 ms | 257.57 ms | 6.094e-7 |

The 250k topology upload drops from 3.81 MiB to a 64-byte repeat request. The 3.81 MiB binary result still returns because portable semantic validation and identity reconstruction remain enabled.

The cache is process-memory only, bound to session/project/algorithm/geometry fingerprint, and is never stored in FKEI. Base, sample topology, coordinate contract, or algorithm changes require a new full upload.
