# CUDA-2 real workload scaling benchmark

Recorded on 2026-08-31 using the reviewed, hash-pinned RTX 3080 executable through
the fixed `127.0.0.1:47658` loopback helper. Every measurement used the existing
`evaluateContainmentShadow` path: Web remained authoritative, CUDA remained an
observational candidate, and `productionApplied` remained `false`.

## Method

- Deterministic fixtures: 5, 32,768, 100,000, and 250,000 samples.
- Runs: one first run followed immediately by five warm runs for every size.
- Executable benchmark iterations: one, matching a real application job.
- Comparison on every run: ordered sample identity, edge identity,
  classification, finite numeric values, and radius-adjusted margin tolerance.
- Margin tolerance: `0.00005`.
- The NVIDIA driver and JIT cache had been exercised during CUDA-1 and a
  preliminary benchmark pass. "First" therefore means first for that size in
  the final measurement series, not a post-reboot driver-cache cold start.

The helper's finite request limit was raised from 8 MiB to 48 MiB because the
advertised 250,000-sample fixture is 33.842 MiB. The 250,000 sample limit,
fixed executable path/hash, Host restriction, Origin allowlist, shadow-only
header, and production isolation remain enforced. The adapter's finite stdout
limit is 64 MiB; the largest observed executable result was 49.482 MiB.

## Timing definitions

- **Shadow total**: Web reference + capability probe + helper candidate + full
  comparison.
- **Client/helper**: existing Windows client submission, polling, result parse,
  and contract validation.
- **Helper job**: synchronous compiled adapter invocation.
- **Exe process**: complete evaluation child-process wall time, including stdin
  and stdout protocol work.
- **CUDA e2e**: timing reported by the reviewed executable around its CUDA
  `evaluate()` section. It excludes executable input JSON parse and output JSON
  serialization.
- **Setup/context/PTX**: executable setup timing. It includes context creation,
  PTX module JIT/load, kernel lookup, ball allocation/copy, and host sample
  packing.
- **Transfer residual**: CUDA e2e minus setup minus kernel. In the reviewed
  binary this combines sample/output allocation, sample H-to-D, output D-to-H,
  event setup, and synchronization. H-to-D and D-to-H cannot be separated
  without changing the reviewed executable.

## Results

Warm values are medians of five runs; all times are milliseconds.

| Samples | Request / result MiB | First client/helper | Warm shadow total | Warm client/helper | Warm helper job | Warm exe process | Warm CUDA e2e | Setup/context/PTX | Transfer residual | Kernel | Max margin delta |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 5 | 0.001 / 0.002 | 234.519 | 212.684 | 211.771 | 209.701 | 158.683 | 84.837 | 84.053 | 0.731 | 0.033792 | 1.018e-7 |
| 32,768 | 4.394 / 6.440 | 1,199.236 | 1,211.626 | 1,180.285 | 1,023.106 | 895.219 | 82.181 | 81.496 | 0.486 | 0.048992 | 5.888e-7 |
| 100,000 | 13.457 / 19.678 | 3,187.711 | 3,283.632 | 3,202.924 | 2,667.621 | 2,413.402 | 88.155 | 87.279 | 0.829 | 0.047456 | 5.535e-7 |
| 250,000 | 33.842 / 49.482 | 7,497.410 | 7,644.454 | 7,431.528 | 6,110.598 | 5,483.539 | 95.148 | 93.409 | 1.541 | 0.054752 | 6.094e-7 |

Host/protocol decomposition of the warm medians:

| Samples | Capability inspection | Adapter request stringify | Exe process/protocol residual | Adapter result parse | Adapter result validation | Client transport/poll/JSON/validation residual |
|---:|---:|---:|---:|---:|---:|---:|
| 5 | 50.933 | 0.015 | 73.846 | 0.030 | 0.047 | 3.041 |
| 32,768 | 48.718 | 22.641 | 813.219 | 29.727 | 15.555 | 163.003 |
| 100,000 | 51.453 | 65.430 | 2,319.178 | 67.662 | 49.752 | 535.303 |
| 250,000 | 54.439 | 165.952 | 5,388.390 | 209.645 | 153.060 | 1,277.249 |

The process/protocol residual includes process launch/teardown plus the
executable's JSON input parse, result JSON serialization, and pipe I/O. Its
near-linear growth with the 35 MiB input and 49 MiB output identifies JSON and
host protocol movement—not CUDA—as the dominant scaling cost.

## First versus warm

| Samples | First client | Warm client median | Change | First helper | Warm helper median | First CUDA e2e | Warm CUDA e2e median |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 5 | 234.519 | 211.771 | -9.70% | 226.004 | 209.701 | 96.039 | 84.837 |
| 32,768 | 1,199.236 | 1,180.285 | -1.58% | 1,018.215 | 1,023.106 | 83.717 | 82.181 |
| 100,000 | 3,187.711 | 3,202.924 | +0.48% | 2,646.410 | 2,667.621 | 82.548 | 88.155 |
| 250,000 | 7,497.410 | 7,431.528 | -0.88% | 6,169.200 | 6,110.598 | 97.589 | 95.148 |

Only the five-sample case shows a material first/warm difference. At realistic
payload sizes, JSON volume dominates and first/warm variation is mostly run
noise.

## Correctness

All 24 jobs matched. Every job preserved ordered sample identity and edge
identity, matched Web classification exactly, returned finite values, and kept
the maximum margin delta below tolerance. The worst observed delta was
`6.094441462600741e-7`, about 1.22% of the `0.00005` tolerance.

Web was authoritative in every outcome. CUDA was only a candidate observation.
Every helper, Web, and CUDA result reported `shadow=true` and
`productionApplied=false`; no candidate fact was connected to production
geometry.

## Bottleneck decision

1. **C — JSON/process protocol is the primary bottleneck.** At 250,000 samples,
   process/protocol residual alone is 5,388 ms, versus a 0.055 ms kernel.
2. **B — repeated process/context/PTX setup is the baseline bottleneck for small
   jobs.** Capability inspection is about 50 ms and context/PTX setup is about
   84-93 ms per job. Removing it will greatly help small jobs, but persistent
   CUDA with the same JSON protocol will not by itself make 250,000 samples
   interactive.
3. Host result serialization, parsing, validation, polling, and Web comparison
   are the next material costs at large sizes.
4. Allocation/transfer/synchronization is below 1.6 ms at 250,000 samples.
5. **D — GPU computation is not the bottleneck.** Kernel time stays near
   0.03-0.07 ms.

The current one-job/one-process method is acceptable for occasional offline
shadow conformance runs, but not for repeated interactive SKIN-scale work. A
persistent process/context is recommended, paired with a compact or binary
request/result protocol; persistence alone addresses the fixed baseline but
leaves the dominant large-payload JSON cost.

## Persistent-engine reuse inventory (design only)

- **CUDA context:** create once on the RTX 3080, keep it current on the worker
  thread, and destroy it only at controlled shutdown/recovery.
- **Loaded PTX module:** load/JIT the reviewed embedded PTX once per context;
  retain the module handle while the executable artifact/algorithm contract is
  unchanged.
- **Kernel function:** cache the `CUfunction` obtained from the retained module.
- **Ball buffer:** retain capacity and reuse contents when the base-ball
  fingerprint matches; recopy only when the base changes.
- **Sample/output device buffers:** use grow-only capacity buffers up to the
  250,000-sample ceiling; overwrite only the active range and never expose
  stale trailing data.
- **Pinned host buffers (future):** retain capacity-matched staging buffers for
  samples and outputs, then consider asynchronous copies/streams only after the
  protocol bottleneck is removed and correctness remains shadow-verified.

The persistent design must continue to fail back to Web on timeout, process
crash, CUDA failure, stale identity, or comparison mismatch. It must keep the
fixed artifact hash and algorithm contract, serialize or safely isolate context
access, preserve all bounds, and remain incapable of applying CUDA results to
production geometry.
