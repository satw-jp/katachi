# Windows local GeometryEngine — shadow-only prototype

This helper is a narrow TASK 13 transport and executable adapter. It binds to
the fixed loopback address `127.0.0.1:47658`, never scans ports or the LAN, and
accepts only the versioned `evaluateContainment` batch. It is not connected to
`main.ts`, FKEI, production geometry, STL or 3MF.

Mutation requests require the explicit Cloudflare production origin or the
Katachi development origin on its fixed Vite port `5174`; arbitrary webpages
and missing-Origin requests cannot submit jobs.

## Current machine result (2026-08-31)

- `nvidia-smi` sees an NVIDIA GeForce RTX 3080 with driver 595.95 and reports
  driver CUDA compatibility 13.2.
- `nvcc`, CMake and MSVC `cl` are not available on PATH.
- the `python.exe` names resolve only to Windows App Execution Alias stubs and
  do not provide a working interpreter.
- `bin/katachi-containment-cuda.exe` does not exist.

The driver report does not mean that the CUDA Toolkit/compiler is installed.
Consequently this prototype does not claim or execute a CUDA kernel. The
capability endpoint honestly advertises CUDA as unavailable and the browser
adapter keeps the Web reference result.

Run the read-only machine probe:

```text
node tools/skin-local-engine/probe-windows-capability.mjs
```

Run the helper (it can expose capabilities while the compiled adapter is
absent, but rejects jobs with a structured 503):

```text
node tools/skin-local-engine/server.mjs
```

Run focused helper tests:

```text
node --test tools/skin-local-engine/*.test.mjs
```

## Compiled executable insertion contract

No install or build is performed by this prototype. After the author
deliberately installs and verifies CUDA Toolkit, CMake and Visual Studio C++,
place the separately reviewed executable at the one fixed path:

```text
tools/skin-local-engine/bin/katachi-containment-cuda.exe
```

The helper launches that exact file with `shell: false`; requests cannot choose
a command or filesystem path. The executable must implement:

1. `--capabilities-json`: write one JSON object with contract
   `katachi.cuda-containment-executable-capabilities.v1`,
   `executableProtocol: 1`, `engineVersion`, `precisionMode`, `device.name`, and
   `algorithmContracts` containing
   `katachi.skin.evaluate-containment.metaball-radius.v1`.
2. `--evaluate-containment-json`: read one versioned GeometryJob request from
   stdin and write one JSON object with contract
   `katachi.cuda-containment-executable-result.v1`; echo `clientRequestId`,
   `projectFingerprint` and `algorithmContract`; return every requested
   `sampleId`/`edgeId` exactly once with Base signed distance,
   radius-adjusted margin, clearance and classification; include the portable
   summary and `timingMilliseconds`.

Resume in this order:

1. rerun the capability probe and confirm `nvcc`, CMake and MSVC are real tools;
2. build the executable outside the Web bundle and put it at the fixed path;
3. run `--capabilities-json` directly and inspect the advertised device and
   precision;
4. run both focused test commands;
5. start the helper and confirm `/v1/capabilities` advertises the algorithm;
6. compare CUDA samples against the Web reference on frozen fixtures before
   considering any runtime integration.

Even after a match, this prototype remains observational:
`productionApplied` is always false. Pairing, signed distribution, full
cancellation of an in-flight native process, artifact transfer and real
Cloudflare-to-loopback browser permission QA remain required before any
shape-affecting use.
