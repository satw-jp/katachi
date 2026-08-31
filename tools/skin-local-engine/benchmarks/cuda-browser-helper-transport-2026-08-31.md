# CUDA-4A Browser / Helper Transport Benchmark

Web remains authoritative. CUDA is a shadow candidate only; `productionApplied=false` for every run.

| Samples | Transport | Encode | HTTP | Helper decode | Worker | Helper encode | Browser decode | Semantic validate | Client total | Full path | Request | Response | Max margin Δ |
|---:|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 32,768 | json | 23.79 ms | 188.99 ms | 33.64 ms | 47.28 ms | 23.34 ms | 39.73 ms | 14.95 ms | 212.79 ms | 253.43 ms | 4.58 MiB | 6.73 MiB | 5.888e-7 |
| 32,768 | binary | 16.28 ms | 9.62 ms | 2.14 ms | 5.33 ms | 0.03 ms | 7.00 ms | 11.10 ms | 44.88 ms | 82.58 ms | 0.50 MiB | 0.50 MiB | 5.888e-7 |
| 100,000 | json | 66.58 ms | 566.84 ms | 125.37 ms | 107.76 ms | 73.38 ms | 136.93 ms | 47.45 ms | 631.69 ms | 760.28 ms | 14.12 MiB | 20.71 MiB | 5.535e-7 |
| 100,000 | binary | 44.83 ms | 12.16 ms | 1.58 ms | 7.53 ms | 0.01 ms | 12.78 ms | 36.31 ms | 106.52 ms | 190.39 ms | 1.53 MiB | 1.53 MiB | 5.535e-7 |
| 250,000 | json | 179.07 ms | 1503.84 ms | 333.62 ms | 265.82 ms | 176.78 ms | 361.45 ms | 145.68 ms | 1682.91 ms | 2022.08 ms | 35.51 MiB | 52.07 MiB | 6.094e-7 |
| 250,000 | binary | 115.58 ms | 31.90 ms | 3.82 ms | 22.94 ms | 0.01 ms | 41.89 ms | 121.65 ms | 322.69 ms | 590.87 ms | 3.81 MiB | 3.81 MiB | 6.094e-7 |

Both routes use the same persistent CUDA context and compact worker transport. JSON remains the reference/debug route.

## Real browser QA

Chrome 151 on Windows successfully ran the repository's actual `WindowsLocalGeometryEngineClient` from the Vite SKIN origin (`http://127.0.0.1:5174`) through the loopback helper and RTX 3080. At 32,768 samples, the first binary run was 361.5 ms including cold worker startup; the warm binary run was 84.0 ms for the complete Web-reference/shadow-comparison path and 45.0 ms inside the binary client. The candidate matched with zero missing identities, zero classification mismatches, and maximum margin delta `5.888e-7`. `shadow=true` and `productionApplied=false` were preserved.

The local development origin did not display a Local Network Access prompt. The Cloudflare production page loaded successfully, but the browser automation's read-only page scope does not expose page `fetch`, so a fresh public-origin capability request could not be initiated in this run. The helper's public-origin Private Network Access preflight is covered by an automated test and is restricted to the existing allowlist; no browser security setting or permission bypass was used.
