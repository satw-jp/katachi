# CUDA-3B persistent JSON vs compact binary transport

The persistent RTX 3080 worker now supports two transports in the same process,
CUDA context, loaded/JITed PTX module, and kernel function:

- `length-framed-json-v1`: retained as the reference/debug transport.
- `compact-binary-v1`: performance candidate at the helper/worker boundary.

The outer GeometryEngine API remains JSON and its portable semantic contract is
unchanged. Every benchmark run kept Web authoritative, CUDA observational only,
`shadow=true`, and `productionApplied=false`.

## Method

- Persistent JSON baseline commit: `f0b37e35e2a767d77edf42eb41d6505f1d7e2826`.
- Final executable SHA-256: `32D62914ABA976639D125E0336E4298C5AA7F316DCB9A1C6664016F4B42C8ACA`.
- Sizes: 32,768, 100,000, and 250,000 deterministic samples.
- Per size and transport: one verified warm-up plus five measured jobs.
- JSON and binary measured jobs alternated in the same worker PID, generation,
  CUDA context, PTX module, kernel function, and capacity-managed buffers.
- Every warm-up and measured job checked ordered sample identity, ordered edge
  identity, exact classification, finite values, and margin tolerance against
  the Web reference.
- Values below are medians of five measured jobs, in milliseconds.

## End-to-end results

| Samples | JSON client→helper→result | Binary client→helper→result | Improvement | JSON helper job | Binary helper job | JSON worker round-trip | Binary worker round-trip |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 32,768 | 1,083.423 | 258.136 | 76.2% | 880.257 | 59.128 | 791.323 | 3.444 |
| 100,000 | 3,428.918 | 747.454 | 78.2% | 2,802.892 | 117.386 | 2,516.564 | 8.818 |
| 250,000 | 8,290.895 | 1,918.762 | 76.9% | 6,702.330 | 300.993 | 5,938.511 | 19.392 |

| Samples | JSON request bytes | Binary request bytes | JSON result bytes | Binary result bytes | CUDA e2e | Kernel | Maximum margin delta |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 32,768 | 4,607,521 | 524,432 | 6,752,751 | 524,464 | 0.820 | 0.179744 | 5.888e-7 |
| 100,000 | 14,110,648 | 1,600,144 | 20,634,724 | 1,600,176 | 3.053 | 0.593568 | 5.535e-7 |
| 250,000 | 35,486,342 | 4,000,144 | 51,886,039 | 4,000,176 | 6.265 | 0.874688 | 6.094e-7 |

Binary reduced worker request bytes by about 88.6–88.7%, result bytes by
about 92.2%, and worker round-trip latency by about 99.6–99.7%. GPU work remains
well below one millisecond at 250,000 samples for the measured kernel timing.

## Timing breakdown

| Samples | Transport | Host request encode | Identity hash | Native request decode | CUDA e2e | Native response encode | Worker residual | Host result decode | Result validation | Outer HTTP JSON residual |
|---:|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 32,768 | JSON | 32.530 | 0 | — | 0.866 | — | 790.274 | 29.976 | 18.948 | 209.745 |
| 32,768 | Binary | 20.430 | 10.316 | 0.920 | 0.820 | 0.300 | 0.973 | 13.410 | 23.914 | 204.983 |
| 100,000 | JSON | 96.108 | 0 | — | 3.220 | — | 2,513.263 | 117.850 | 65.475 | 626.025 |
| 100,000 | Binary | 42.509 | 32.128 | 2.462 | 3.053 | 1.219 | 2.101 | 9.547 | 53.471 | 633.815 |
| 250,000 | JSON | 234.790 | 0 | — | 6.275 | — | 5,932.521 | 282.587 | 181.411 | 1,635.293 |
| 250,000 | Binary | 102.450 | 77.988 | 5.416 | 6.265 | 2.912 | 4.709 | 20.641 | 155.088 | 1,617.373 |

The JSON worker residual includes native JSON parse/result construction,
serialization, and pipe transfer. After binary removes that cost, the dominant
end-to-end component is the unchanged outer helper HTTP JSON response plus
host-side semantic reconstruction, validation, and comparison.

## Binary protocol

All integers and floats are little-endian. The existing 16-byte `KCF1` frame
provides explicit version, frame kind, and uint64 payload length.

The request payload has a 96-byte `KCB1` header containing protocol version,
operation id, flags, a 32-byte SHA-256 identity fingerprint, units and
coordinate metadata, smoothness, boundary tolerance, iteration/ball/sample
counts, and validated offsets/total length. The body contains packed ball and
sample `float32 x/y/z/r` records.

The response payload has a 176-byte `KBR1` header containing the echoed identity
fingerprint, sample count, context/module/function/buffer reuse flags, detailed
timings, and buffer capacities. Each output is 16 bytes: signed distance
float32, adjusted margin float32, clearance float32, and classification uint32.

Sample and edge strings never cross the binary worker boundary. The helper
keeps the validated ordered identity table, verifies the echoed fingerprint,
and restores `sampleId`/`edgeId` by stable index before running the existing
executable-result validator and Web comparison.

## Decision

Adopt `compact-binary-v1` as the performance candidate for large shadow jobs,
while retaining framed JSON for reference and diagnostics. It makes the
persistent worker boundary fast enough that CUDA is no longer the bottleneck.

It does not make the full 100,000–250,000 sample application path genuinely
interactive: medians are about 0.75 s and 1.92 s because the portable outer API
still serializes the full semantic result as JSON and performs host validation
and Web comparison. A future task should target that outer helper/client
boundary or chunk/stream observations without changing GeometryEngine
semantics. No CUDA result should become authoritative as part of that work.
