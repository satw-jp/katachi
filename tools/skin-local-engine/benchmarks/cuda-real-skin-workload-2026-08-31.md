# CUDA-4C Real SKIN Workload Shadow Benchmark

Current 120 mm project: 12 Base balls, 38 patterns, 306 lattice nodes, 325 lattice edges, 8159 containment samples.

| Path (10 warm runs, median) | Full Web + CUDA compare | Client | Worker | CUDA e2e | Kernel | Max margin Δ |
|:---|---:|---:|---:|---:|---:|---:|
| outer binary | 33.83 ms | 16.93 ms | 1.43 ms | 0.362 ms | 0.127 ms | 1.580e-7 |
| session repeat | 23.39 ms | 15.16 ms | 1.31 ms | 0.342 ms | 0.123 ms | 1.580e-7 |

Web-only reference median was 4.09 ms. Classifications: 8159 inside, 0 boundary, 0 outside.

Cold outer-binary full path was 402.74 ms, including worker/context/PTX startup.

All ordered sample/edge identities and classifications matched; no samples were missing. Web remained authoritative and every CUDA result reported `productionApplied=false`.

The fixture copies current default-project Base and permanent lattice topology into the portable benchmark contract. It deliberately does not encode the production attachment-site exemption, so it is a faithful workload/transport fixture rather than a replacement for the production audit.

With the real 8,159-sample workload, the warm shadow path is judged interactively useful when its measured full comparison remains near or below the 100 ms reference. Helper failure was also verified to keep the Web result authoritative.

## Real browser QA

Chrome 151 loaded the checked-in 120 mm fixture through the actual Vite client. The cold full Web/CUDA comparison was 304.8 ms; after persistent worker warm-up it was 40.3 ms (22.2 ms inside the binary client). The browser run had zero missing identities, zero classification mismatches, maximum margin delta `1.580e-7`, `shadow=true`, and `productionApplied=false`.
