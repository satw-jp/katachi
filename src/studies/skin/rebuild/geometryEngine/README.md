# Shadow GeometryEngine prototype

This directory is an isolated TASK 13 prototype. It is not imported by the
current SKIN runtime and cannot change production geometry, FKEI, STL or 3MF
output.

The portable v1 contract sends one immutable `evaluateContainment` job: the
authored metaball Base plus already-sampled Spider positions, radii and edge
IDs. `evaluateContainmentOnWeb()` is the reference path and uses the existing
Web `fieldSdf`. `evaluateContainmentShadow()` may collect a Windows CUDA
candidate, but always returns the Web result as `authoritative` and always
reports `productionApplied: false`.

The native client only calls the fixed endpoint
`http://127.0.0.1:47658/v1`. It never scans ports or the LAN. An absent helper,
incompatible protocol, unavailable CUDA adapter, failed job or comparison
mismatch produces a structured Web fallback outcome.

Run the focused browser-side contract tests from the repository root:

```text
npx tsx src/studies/skin/rebuild/geometryEngine/geometryEngine.test.ts
```

The Windows end-to-end conformance harness starts the fixed loopback helper,
uses this Web reference and client path, launches the reviewed RTX 3080 CUDA
executable, and compares the candidate without applying it:

```text
npx tsx tools/skin-local-engine/cuda-shadow-e2e.mjs
```

The helper prototype and the later compiled-executable handoff are documented
under `tools/skin-local-engine/README.md`.
