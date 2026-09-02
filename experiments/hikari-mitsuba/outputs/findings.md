# Hikari Mitsuba RTX Spike findings

## Scope

- repository: `satw-jp/katachi`
- source commit: `586a20cedfca9e769f710cfd96a400b4737069d5`
- fixed case: `P0-colored-shadow`
- production Hikari connection: none
- Hikari runtime / Light Drawing / `.hkr` / manifest / version: unchanged

## Environment

- Python: `J:\My Drive\codex\2026-09-02\hikari-ssot-github-hikari-repository-satw\work\katachi\experiments\hikari-mitsuba\.venv\Scripts\python.exe` / `3.12.13 (main, Aug  7 2026, 02:26:41) [MSC v.1944 64 bit (AMD64)]`
- Mitsuba: `3.9.1`
- Dr.Jit: `1.5.0`
- selected variant: `cuda_ad_rgb`
- CUDA variant: `PASS`
- named OptiX variant: `none exposed by this wheel`
- GPU evidence: `nvidia-smi` identifies the RTX 3080 and the rendered tensor is `drjit.cuda.ad.TensorXf`.
- CUDA/OptiX boundary: CUDA execution is evidenced; OptiX execution is not claimed because this wheel exposes no OptiX-named variant.

## Fixed case and transfer

The case replays the existing `hikari-blender-backlight-study.hkr` shape recipe through the current Hikari `replay()` and `buildCloudMesh()` path. The canonical mesh is `62,012` triangles, SHA-256 `05f5f08afef2a5233a2b9b7c69ab2f609f97ea6ff5086c0b5246c82febb5e1dc`, and saved topology is `True` with one connected component. Hikari shape units are mapped to millimetres using the current adapter's explicit assumed `20 mm/shape-unit`; this is not a measured artwork scale.

The mapping is recorded in `fixed-case.json`: host IOR `1.5`, host absorption per mm `{'r': 0.0075, 'g': 0.005, 'b': 0.003125}`, propagation direction `{'x': -0.27294305817398523, 'y': -0.9320221997469609, 'z': 0.23840450116025227}`, receiver `legacy-floor` at y=`-47` mm, and fixed camera/FOV `45°`.

## Render results

- BODY: `outputs/body.png` generated with Mitsuba path tracing.
- receiver-only physical reference: `outputs/receiver-only.png` generated.
- caustic lower sample: `outputs/caustic-16spp.png` generated.
- caustic higher sample: `outputs/caustic-64spp.png` generated.
- timings: `outputs/render-timings.json`.

The Mitsuba result is a physical-reference candidate, not calibrated photometry and not pixel parity with Hikari. Hikari's known 5° Light Drawing issue was not touched or re-evaluated.

## EXPRESSIVE PROTOTYPE

`expressive-mild.png` and `expressive-strong.png` start from the positive difference between the physical caustic receiver render and the receiver-only physical render. Gain, contrast, spread, and warm color emphasis operate on that causal region only; global image brightness is not used. These are offline prototypes and are not production shaders.

## LIGHT → SHAPE probe

`gradient-probe.json` records a single uniform-scale geometry control on the exported Hikari mesh. It computes a `cuda_ad_rgb` Dr.Jit gradient for an explicit receiver-coupling geometry proxy and a finite difference around a `1.0%` scale delta. AD gradient=`0.007835472002625465`, finite central slope=`0.007835461292415857`, direction agreement=`True`. A full visibility-aware rendered-image gradient is not claimed because this wheel exposes no `prb_reparam` plugin. This is a bounded feasibility result, not an optimizer or automatic shape update.

## SKIN helper reuse assessment

Potentially reusable later: fixed loopback transport, capability probing, Origin/CORS/LNA handling, bounded request validation, binary artifact transfer, worker lifecycle, cancellation, session/cache patterns, provenance, and fail-closed behavior. Do not reuse SKIN GeometryEngine semantics, containment operations, project/FKEI semantics, or arbitrary Python/executable/filesystem execution. A future Hikari service should expose a fixed operation such as `hikari.mitsuba.render.v1` with declared inputs and bounded outputs.

## Findings

1. A current Hikari fixed shape can be transferred to Mitsuba via the existing mesh realization path without modifying production source.
2. CUDA execution works on the RTX 3080 through `cuda_ad_rgb`; the installed wheel does not expose an OptiX-named variant, so OptiX remains unverified.
3. A separated physical receiver render and causal expressive controls are feasible offline.
4. A finite differentiable geometry probe is feasible, subject to keeping parameter count and target definition bounded.
5. The minimum future architecture is an isolated worker/service with a fixed render operation, explicit case/provenance JSON, declared mesh/material/light/receiver mapping, artifact hashes, bounded request sizes, cancellation, and no arbitrary command or path execution.
