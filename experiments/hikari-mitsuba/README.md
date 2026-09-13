# Hikari Mitsuba RTX Spike

This is an isolated research spike. It is not connected to the Hikari production renderer, Light Drawing, `.hkr`, manifest, version, OPT-1a/1b, or deployment path.

Base: `main@586a20cedfca9e769f710cfd96a400b4737069d5`

## Reproduce

From the repository root:

```text
node --experimental-strip-types experiments/hikari-mitsuba/generate_fixed_case.mjs
experiments/hikari-mitsuba/.venv/Scripts/python.exe experiments/hikari-mitsuba/probe_environment.py
experiments/hikari-mitsuba/.venv/Scripts/python.exe experiments/hikari-mitsuba/run_spike.py
experiments/hikari-mitsuba/.venv/Scripts/python.exe experiments/hikari-mitsuba/verify_spike.py
```

The venv is isolated and ignored. Install only the research requirements:

```text
experiments/hikari-mitsuba/.venv/Scripts/python.exe -m pip install -r experiments/hikari-mitsuba/requirements.txt
```

The scripts write fixed-case provenance, hashes, render PNGs, timings, metrics, expressive comparisons, gradient evidence, and findings under `outputs/`. `verify_spike.py` checks the generated/committed evidence without starting Mitsuba.

## Fixed case

The selected existing case is `P0-colored-shadow`, derived from the documented `hikari-blender-backlight-study.hkr` recipe. The current Hikari `replay()` and `buildCloudMesh()` functions generate the mesh; the spike does not duplicate the field or change production code. The current adapter's explicit assumed scale is 20 mm per shape unit. Its source is marked `assumed`, not measured.

The case has no inclusion enabled, so no inclusion geometry is invented for this transfer. If a future spike selects an inclusion case, its medium and boundary must be represented explicitly in the mapping instead of silently collapsing it.

## Stages

- Stage 1: `probe_environment.py` selects `cuda_ad_rgb`, records Python/Mitsuba/Dr.Jit/variants, renders a CUDA probe, and records `nvidia-smi` evidence. The installed Mitsuba wheel exposes CUDA but no OptiX-named variant; the result therefore claims CUDA use and explicitly leaves OptiX unverified.
- Stage 2: `generate_fixed_case.mjs` records source commit, recipe, canonical ShapeSource hash, mesh hash, dimensions, scale, camera, light, receiver, and material mapping.
- Stage 3: `run_spike.py` creates a Mitsuba dielectric host with homogeneous RGB absorption, a fixed receiver, area emitter, neutral environment, and the captured camera. `body.png` is the body render.
- Stage 4: `receiver-only.png`, `caustic-16spp.png`, and `caustic-64spp.png` provide a receiver reference, lower-spp intermediate, and higher-spp physical caustic candidate. Hikari's 5° parity issue is not changed.
- Stage 5: `expressive-mild.png` and `expressive-strong.png` operate only on positive physical extra energy over receiver-only. They are labeled `EXPRESSIVE PROTOTYPE` in `findings.md` and never alter production shaders.
- Stage 6: `gradient-probe.json` uses one uniform-scale geometry control on the exported mesh with `cuda_ad_rgb`, an explicit receiver-coupling geometry proxy, and finite differences. A full rendered-image visibility gradient is not claimed because this wheel has no `prb_reparam` plugin. No optimizer runs.
- Stage 7: `findings.md` records the SKIN helper reuse boundary and a fixed-operation future architecture.

## Mapping boundary

All values are explicit in `outputs/fixed-case.json`: Hikari shape units are converted to millimetres, Hikari IOR becomes Mitsuba dielectric IOR, Hikari RGB absorption per shape unit is divided by the explicit scale to become `sigma_t` per millimetre, the Hikari receiver becomes a horizontal diffuse rectangle, and the Hikari propagation direction/radiance becomes a finite area emitter setup. These values are research assumptions, not calibrated photometry.

## Non-production rule

No arbitrary Python/executable/filesystem API is created. A future service, if accepted, should expose only a fixed bounded operation such as `hikari.mitsuba.render.v1`, with provenance, capability probing, request validation, artifact hashes, cancellation, and fail-closed behavior.
