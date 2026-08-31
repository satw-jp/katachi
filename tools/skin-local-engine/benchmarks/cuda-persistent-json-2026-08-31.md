# CUDA-3A persistent JSON worker benchmark

The fixed RTX 3080 executable now supports a persistent, 16-byte
length-prefixed `KCF1` JSON frame. The helper reuses one worker process, CUDA
context, loaded/JITed PTX module, kernel function, and capacity-managed ball,
sample, and output buffers. The portable GeometryEngine semantic contract and
HTTP JSON API are unchanged.

Every benchmark outcome kept Web authoritative, CUDA observational only,
`shadow=true`, and `productionApplied=false`.

## Method

- CUDA-2 baseline: `e185df3f32b88c84a3b4a45e703cbfa7e34aea4a`.
- Sizes: 5, 32,768, 100,000, and 250,000 deterministic samples.
- Per size: terminate the worker, measure one cold job, then ten consecutive
  warm jobs in the same PID/generation/context.
- Each size used a fresh Node benchmark process to bound benchmark-host heap;
  worker persistence was maintained across all 11 jobs for that size.
- Every run checked ordered sample/edge identity, exact classification, finite
  values, and margin tolerance against the Web reference.
- Warm values below are medians of ten runs, in milliseconds.

## Results

| Samples | Cold client | Cold worker start | Context/PTX init | Warm client | CUDA-2 warm client | Delta | Warm helper | Warm worker JSON round-trip | Warm CUDA e2e | Kernel |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 5 | 268.262 | 230.411 | 115.485 | 3.617 | 211.771 | -98.29% | 0.986 | 0.822 | 0.124 | 0.014848 |
| 32,768 | 1,435.197 | 216.806 | 91.846 | 1,153.904 | 1,180.285 | -2.24% | 938.580 | 849.064 | 1.277 | 0.351056 |
| 100,000 | 4,090.244 | 223.412 | 106.618 | 3,531.459 | 3,202.924 | +10.26% | 2,853.299 | 2,555.026 | 3.145 | 0.631696 |
| 250,000 | 9,702.291 | 224.639 | 103.708 | 8,448.159 | 7,431.528 | +13.68% | 6,755.379 | 5,970.128 | 6.564 | 0.901648 |

| Samples | Worker JSON residual | H-to-D | D-to-H | Node result parse | Result validation | Maximum margin delta |
|---:|---:|---:|---:|---:|---:|---:|
| 5 | 0.682 | 0.052 | 0.030 | 0.030 | 0.015 | 1.018e-7 |
| 32,768 | 847.851 | 0.098 | 0.230 | 31.353 | 19.265 | 5.888e-7 |
| 100,000 | 2,551.844 | 0.191 | 0.600 | 122.504 | 67.384 | 5.535e-7 |
| 250,000 | 5,963.878 | 1.079 | 1.387 | 300.878 | 195.036 | 6.094e-7 |

The persistent worker removes the fixed process/context/PTX penalty and makes
small jobs effectively immediate. It does not improve large JSON workloads:
100,000 and 250,000 samples are slightly slower than the CUDA-2 run because
JSON parsing, construction, serialization, pipe transfer, HTTP serialization,
and client parsing dominate run-to-run variation. The CUDA section itself is
only 6.6 ms at 250,000 samples.

All warm jobs for every size used the same PID and worker generation. Every
CUDA result reported context/module/function reuse. All warm jobs also reported
ball content reuse and sample/output buffer capacity reuse.

## Failure and cancellation

- An active-worker kill rejects the candidate with `cuda_worker_crashed`.
- The next job starts a new PID/generation and matches Web again.
- Malformed magic/version/kind, oversized frames, invalid JSON/result, timeout,
  CUDA error, and process exit fail the candidate closed.
- Helper jobs remain queued until the single worker is available; queued jobs
  can be canceled and never enter the worker.
- Running-kernel forced cancellation is not implemented in CUDA-3A. A crash or
  timeout terminates the worker process instead; the next request may restart
  it.
- Terminal helper records are released after client receipt to avoid retaining
  large result documents.

## Decision

Persistent process/context/module/function reuse should remain. It is a major
small-job improvement and is the right lifecycle for later transports. It is
not sufficient for interactive SKIN-scale payloads while JSON remains the
worker transport. CUDA-3B should retain this lifecycle and compare JSON with a
packed binary transport using stable host-side identity indices.
