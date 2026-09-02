# Hikari Mitsuba RTX Local Bridge (HIKARI-MITSUBA-0)

This directory is an isolated research bridge. It is not imported by the
production Hikari application, does not replace the WebGL/WebGPU LIVE/PLAY
renderer, and does not change the Hikari manifest or version. A missing or
failed Mitsuba bridge must leave Hikari usable.

## Fixed boundary

The helper binds only to `127.0.0.1:47659`. Port `47658` is reserved by the
existing SKIN helper. LAN binding, `0.0.0.0`, arbitrary local endpoints, and
browser-supplied Python, executable, plugin, scene, URL, or filesystem path
are not accepted.

The browser flow is:

`Hikari browser client → fixed JSON contract → loopback bridge → fixed scene builder → Mitsuba → metadata → bounded PNG artifact`

The client transfers the canonical OBJ bytes realized by the existing Hikari
`ShapeSource → buildCloudMesh → canonical triangle mesh` path. The bridge
sanitizes the OBJ to plain `v`/`f` records, stores it only in a private
temporary directory, and builds the scene itself. No SDF or custom Mitsuba
plugin is reimplemented here. `physicalScale.source: "assumed"` remains
explicitly non-measured (the current case uses 20 mm per shape unit).

## API

- `GET /v1/capabilities` reports the fixed schema, Mitsuba/Dr.Jit/Python
  versions, variants, selected variant, CUDA/GPU state, worker readiness, and
  `optix: "unknown"`.
- `POST /v1/render` accepts only `hikari.mitsuba.render.v1`. The allowlisted
  request contains case/provenance, bounded canonical mesh bytes, physical
  scale, camera, host material, light, receiver, environment, `body` or
  `receiver` purpose, explicit `cuda` or `cpu` device, spp, and resolution.
- `POST /v1/cancel` takes a request ID and matching provenance fingerprint.
  Cancellation is cooperative: a result that finishes after cancellation is
  discarded and no artifact is published.
- `GET /v1/artifacts/{requestId}` returns the PNG as binary. It requires the
  matching `X-Hikari-Provenance-Fingerprint` header; metadata and artifact
  hashes are checked by the client. Artifacts are bounded and expire.

CUDA is never silently replaced by CPU. A `cuda` request fails with
`cuda_unavailable` unless `cuda_ad_rgb` and the detected local CUDA GPU are
ready. The worker fixes its Mitsuba variant once at startup: on the RTX
reference machine it is `cuda_ad_rgb`; a `cpu` request against that worker is
rejected as `device_unavailable` instead of triggering an unsafe process-global
variant switch. On a machine that starts without CUDA, the worker may select
`scalar_rgb` and an explicitly `cpu` request is then supported. OptiX is not
claimed by this bridge.

## Run locally

From this directory, use an isolated optional environment:

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe server.py
```

The command is fixed developer setup, not a browser-controlled execution
surface. The current reference environment is Mitsuba 3.9.1 / Dr.Jit 1.5.0
with `cuda_ad_rgb` on the RTX 3080; the capabilities endpoint is the runtime
source of truth.

## Tests and smoke gate

Contract tests do not require Mitsuba:

```powershell
.venv\Scripts\python.exe -m unittest discover -s . -p "test_bridge.py"
node --experimental-strip-types --test client.test.ts
```

The real local gate starts this helper, probes capabilities, exercises BODY
and RECEIVER requests through `client.ts`, verifies PNG hashes and timing,
tests cancel/reconnect, and stops the helper. It is intentionally separate
from `npm run test:hikari`, `npm run test:studies`, and the production current
gate.

## Explicit non-goals

This checkpoint does not implement a production renderer adapter, UI, `.hkr`
schema, Expressive/reference output, Light → Shape, optimization, OptiX
support, or a fix for the known Light Drawing 5° parity difference. It also
does not alter the current Optical Event Contract, ShapeSource, BODY/CPU/GPU
parity, debug, Blender export, or any production code path.
