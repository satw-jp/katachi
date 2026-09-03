# HIKARI2-0 Native GPU Foundation

Status: design-only checkpoint; implementation has not started
Date: 2026-09-03
Scope: H2-0A foundation and H2-0B first optical fixed case

This document is a design boundary, not an implementation plan that authorizes repository creation or production integration. Hikari2 is a future native application. The current browser Hikari, the Mitsuba Bridge, and this design checkpoint remain separate systems.

## 1. Product and platform boundary

HIKARI2-0 targets Windows 11 on an NVIDIA RTX machine. The RTX 3080 is the authoritative reference device for H2-0 validation. H2-0 has no browser runtime and does not use Chromium, Electron, Tauri, WebView, or Mac support. CPU fallback is not allowed for H2-0; if the required NVIDIA/CUDA/D3D11 pairing is unavailable, H2-0 fails closed with a diagnosable error.

The recommended foundation stack is:

- C++20
- CMake
- Visual Studio 2022
- Win32 windowing and message loop
- Dear ImGui for the initial authoring UI
- Direct3D 11 for presentation
- CUDA for compute
- OptiX only in a later phase, not H2-0A
- Mitsuba as a separate Physical worker, not as an in-process H2 renderer

H2-0 is not a port of the existing browser application. It may reuse contracts, fixed cases, coordinate conventions, and verified optical expectations, but it must not copy browser lifecycle, renderer, UI, or module code.

## 2. Repository boundary

For this checkpoint, the repository boundary is documentation and contract reference only:

- `docs/hikari/` records the Hikari/Hikari2 design and current-state decisions.
- `tests/hikari/fixtures/opticalEventCases.ts` is the current reference for verified R05 fixed cases and expectations.
- The existing browser Hikari remains the production browser study and is not renamed or replaced by H2.
- The Mitsuba Bridge/worker remains an independent Physical path.
- A future native H2 repository or project directory is intentionally not created by this task; its name, build ownership, and distribution boundary require a separate decision.

The native application should consume a versioned, language-neutral contract representation when implementation begins. Directly importing TypeScript modules into native code is not part of this design.

Reusable reference material is limited to:

| Existing Hikari material | H2 reuse | H2 must not copy |
|---|---|---|
| ShapeSource and coordinate conventions | Scene meaning, units, handedness, scale conventions | Browser scene/render implementation |
| Optical event contract | Event names, accounting boundaries, receiver separation | Browser transport code as a native ABI |
| R05 fixed cases | Inputs, expected event/domain/positivity outcomes, tolerances | Unverified browser-specific output assumptions |
| Revision/fingerprint intent | Immutable snapshot and provenance semantics | Browser timing or module lifecycle |
| Mitsuba results | Separate reference/evidence path | Mitsuba as an H2-0 in-process dependency |

## 3. H2-0 module shape

The initial native design is split by ownership and failure boundary:

1. `platform`: Win32 window, input, message pump, DPI, shutdown, and device-lost notifications.
2. `ui`: Dear ImGui panels, authoring commands, status display, and bounded command submission. UI code never calls CUDA or presents a D3D11 frame directly.
3. `presentation`: DXGI swap chain, D3D11 device/context, backbuffer lifecycle, resize, and present.
4. `compute`: CUDA context, kernels, bounded dispatch, synchronization, and error translation.
5. `interop`: D3D11 resource registration, CUDA mapping/unmapping, ownership transitions, and synchronization primitives.
6. `scene`: immutable scene snapshot schema, revision assignment, canonical serialization, hash, and unit conversion.
7. `scheduler`: render jobs, cancellation, bounded progressive batches, stale-result rejection, and last-valid-frame selection.
8. `diagnostics`: structured logs, provenance records, device identity, timings, failures, and run artifacts.
9. `fixed_cases`: native adapters for the R05 cases and contract-level acceptance checks.

The modules are conceptual boundaries for H2-0A. No module or API is implemented by this document.

## 4. GPU and graphics device matching

The D3D11 adapter and CUDA device must be the same physical GPU. Startup must:

1. Enumerate DXGI adapters and reject software adapters.
2. Select the requested NVIDIA RTX adapter, with RTX 3080 as the H2-0 authoritative reference.
3. Create the D3D11 device on that adapter.
4. Match the adapter to the CUDA device through the D3D11 device identity/LUID and the CUDA-D3D11 interop device query (for example, the `cudaD3D11GetDevices` family of APIs, subject to the installed CUDA SDK).
5. Record adapter name, vendor, DXGI LUID, CUDA device identity, driver, CUDA runtime, and feature capability.
6. Fail closed if no exact pairing exists, rather than silently selecting another GPU or a CPU path.

Multi-GPU policy is not generalized in H2-0A. A non-authoritative RTX device may be useful for future diagnostics, but it is not an acceptance substitute for the RTX 3080 reference path unless a later decision explicitly adds a device matrix.

## 5. CUDA–D3D11 interop ownership

Presentation remains D3D11-owned. Compute remains CUDA-owned. A shared texture or buffer has one owner at a time:

1. D3D11 creates the presentation resource with the required bind/misc flags.
2. CUDA registers the eligible resource once during resource setup.
3. The render thread maps the resource for a bounded CUDA dispatch.
4. CUDA writes only while the resource is mapped to CUDA.
5. The render thread synchronizes, unmaps the resource, and returns ownership to D3D11.
6. D3D11 copies or presents the completed resource after the ownership transition.

No UI-thread code may map a resource, submit a kernel, use the immediate context, or present. Resize and resource destruction must first quiesce the scheduler, unmap/unregister resources, and then recreate the D3D11/CUDA pair. The interop layer must expose explicit state transitions and error returns; implicit simultaneous access is prohibited.

## 6. UI thread and render thread

The UI/platform thread owns Win32 messages, input, Dear ImGui frame construction, and authoring command creation. The render thread owns the D3D11 immediate context, swap chain/present, CUDA context, interop resources, and compute dispatch.

The boundary is a bounded command queue plus immutable snapshot handoff:

- UI commands are small, ordered, and cancelable where applicable.
- A scene edit creates a new revision request; it does not mutate a scene object already held by a render job.
- The render thread consumes the latest eligible snapshot and may discard superseded queued work.
- GPU calls never block the UI thread on an unbounded operation.
- Resize, device reset, cancellation, and shutdown are explicit render-thread commands.
- Shutdown drains or cancels work before destroying CUDA/D3D11 resources.

The design does not require a particular lock-free implementation yet. It requires bounded ownership, no shared mutable scene graph, and a visible upper bound on work submitted per UI frame.

## 7. Immutable revisioned scene snapshot

Every authoring state that can affect an H2 render is represented by an immutable snapshot:

```text
SceneSnapshot {
  sceneRevision
  shapeSource
  physicalScale
  camera
  hostMaterial
  inclusions
  light
  receiver
  environment
  computeParameters
  contractVersion
  canonicalHash
  provenance
}
```

`sceneRevision` is monotonic within a running session. The snapshot includes the effective ShapeSource, BODY geometry, material/IOR/absorption, camera, light, receiver, environment, coordinate/unit conventions, and explicit compute parameters. Pure display UI state is excluded. Canonical serialization and hash are generated from the snapshot, not from mutable UI objects.

A render job captures one snapshot and its revision. A result may become `CURRENT` only if its captured revision and canonical hash still match the current authoring snapshot. This is a safety rule, not a performance hint.

## 8. Progressive but bounded dispatch

H2-0A uses bounded progressive dispatch only to keep the native authoring loop responsive. Each render tick has an explicit batch size, dispatch count, and time/work budget. There is no unbounded kernel launch, hidden background render, automatic refine, debounce refine, idle rendering, or progressive Mitsuba integration in H2-0A.

Each job records a deterministic seed, fixed compute configuration, batch count, and cancellation checkpoint. Cancellation is checked between bounded batches. The UI can continue to author while a render is in progress; it must not wait for an unlimited GPU operation.

## 9. Stale, cancellation, and last-valid-frame rules

The state machine is intentionally conservative:

- `READY`: a valid snapshot can be submitted.
- `RENDERING`: a job owns a captured immutable revision.
- `CURRENT`: the displayed Physical/reference frame matches the current snapshot.
- `STALE`: a prior valid frame exists but its revision/hash no longer matches the authoring snapshot.
- `CANCELLED`: the active job was explicitly cancelled; it cannot become current.
- `ERROR`/`OFFLINE`: the backend is unavailable or failed; the LIVE authoring path remains available.

An authoring edit immediately advances the revision and marks any prior Physical result stale. It does not alter the authoring scene to match a Physical result. A render result with a mismatched revision is retained only as a prior artifact if useful, never as `CURRENT`. Cancellation preserves the last valid frame and its provenance. A new explicit refine may start from `STALE` or `CANCELLED` without requiring a reload.

The last valid frame is preserved across ordinary render errors, cancellation, bridge unavailability, and device recovery attempts. H2-0 must not replace it with an unvalidated partial result.

## 10. Device-lost and CUDA error handling

The native path must detect and classify:

- DXGI device removed/reset and swap-chain failures.
- CUDA initialization, context, launch, synchronization, mapping, and unmapping failures.
- Interop registration and ownership-transition failures.
- Invalid snapshot/contract data and provenance mismatches.

On failure, the scheduler stops issuing work, marks the backend state, preserves the last valid frame, emits a structured error, and returns control to LIVE authoring. Recovery is explicit: quiesce, destroy invalid resources, re-enumerate and rematch the same GPU, recreate resources, and re-probe capabilities. No CPU fallback, silent device substitution, or automatic authoring rollback is permitted.

## 11. Provenance and logging

Every accepted, rejected, cancelled, and failed render produces a structured record suitable for JSONL or an equivalent machine-readable log. Minimum fields:

- application build and source commit
- contract version and fixed-case ID, when applicable
- scene revision and canonical snapshot hash
- captured/current revision comparison
- shape, scale, camera, material, light, receiver, and compute configuration identifiers
- DXGI adapter name/vendor/LUID
- CUDA device identity, CUDA runtime, driver, and Windows version
- dispatch dimensions, batch size/count, deterministic seed, and timings
- interop resource and synchronization outcome
- result hash, selected frame state, cancellation status, and error codes

Logs must distinguish `CURRENT`, `STALE`, `CANCELLED`, `ERROR`, and `OFFLINE`. Human-readable UI status is derived from the same state transition, not maintained as an unrelated second truth.

## 12. H2-0A acceptance gates

H2-0A is accepted only if all of the following are demonstrated on Windows 11 with the RTX 3080 reference path:

1. Native Win32 application starts without a browser, Chromium, WebView, or CPU fallback.
2. DXGI and CUDA identify and use the same NVIDIA RTX 3080 device.
3. D3D11 presentation and CUDA interop produce a deterministic visible frame across repeated runs with the same snapshot/configuration.
4. UI input and authoring remain responsive while bounded compute batches run.
5. Immutable revision checks reject stale and race results; no old result becomes `CURRENT`.
6. Cancellation returns safely, preserves the last valid frame, and allows a later explicit render.
7. Device-lost and CUDA error paths preserve the last valid frame and fail closed without CPU fallback.
8. Provenance logs contain the required device, revision, configuration, timing, and result identity.
9. Clean shutdown, resize, and explicit recovery do not leak or use resources after ownership release.
10. The H2-0A foundation has no dependency on the browser Hikari runtime or the Mitsuba worker for LIVE operation.

These gates establish native foundation safety. They do not claim optical parity, OptiX support, or production readiness.

## 13. H2-0B first optical fixed case

The first optical contract case should be the existing `R05-inclusion-pass`. It is deterministic, uses a straight centerline transmission through an explicitly valid inclusion, and exercises host/inclusion material mapping plus receiver delivery without requiring OptiX. `R05-receiver-focus` is the follow-up receiver-oriented case after the first adapter is stable.

The native adapter must consume the existing case values, not create a new near-equivalent case:

- host center `(0, 0, 0)`, host radius `1.5`, smoothness `0`
- inclusion center `(0, 0, 0)`, radius `0.35`, enabled and valid
- scale `20 mm / shape unit`, source `assumed`
- centerline ray origin `(0, 0, 3)`, direction `(0, 0, -1)`, maximum events `8`
- host IOR `1.5`, host absorption `(0.005, 0.005, 0.005) / mm`
- inclusion IOR `1.2`, inclusion absorption `(0.001, 0.02, 0.04) / mm`
- camera `(0, 0, -4)`
- light propagation `(0, 0, -1)`, white radiance, sample weight `1`, sample count `1`, seed `R05-inclusion-pass`
- receiver plane point `(0, 0, -2.35)`, normal `(0, 0, 1)`, extent `u/v = -16..16`

The H2-0B acceptance assertion is contract-level first: valid inclusion containment, expected receiver domain, terminal receiver hit, positive delivered result, closed receiver accounting, separate receiver flux, and scalar coverage. The existing fixture tolerances remain authoritative. Exact pixel parity with the browser renderer or Mitsuba is not an H2-0B prerequisite; any later numerical comparison must be a separately designed evidence task. The first native case also must emit a snapshot hash and device provenance so a result cannot be accepted without identity.

## 14. Things explicitly deferred

The following are not H2-0A/H2-0B design commitments:

- OptiX integration or Dr.Jit gradients.
- Expressive caustics, caustic controls, inverse optimization, or Light → Shape.
- Automatic or idle Mitsuba updates.
- Browser compatibility, WebGL/WebGPU fallback, or Electron/Tauri packaging.
- Mac support or CPU fallback.
- A new `.hkr` format, manifest/version bump, deploy, or production Hikari replacement.
- Final UI layout, visual hierarchy, and application branding.
- A multi-GPU scheduling policy.

Those items must not be pulled into H2-0 merely because they are useful future work. The next implementation decision is limited to approving the H2-0A native foundation boundary and its acceptance harness.
