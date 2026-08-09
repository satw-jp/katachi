# Hikari — current week plan

Status: implementation authorized by the author on 2026-08-01
UpdatedAt: 2026-08-01

Active overnight slice: [overnight-plan-2026-08-01.md](overnight-plan-2026-08-01.md). For this slice, geometry-derived light drawing is the first implementation priority. Multiple inclusions must remain possible in the scene contract, and a dark host must not be treated as an exposure defect.

Current LD1 evidence: [curved-ribbon OFF / ON / difference](evidence/ld1-curved-ribbon-2026-08-01.png). The former surface-normal-only variation now changes the saved optical boundary and moves real receiver hits. Next is to replace this fixed analytic ribbon with an author-controlled or captured trace, then integrate finite source size through the focused-light path.

## Working rule

This week is Hikari-only. Other projects and unrelated studies are paused.

The author has explicitly requested implementation. Do not commit, deploy, or broaden
the scope beyond the active handoff without a separate decision.

## Goal

Reach one coherent first-complete state for Hikari as a transparent-material
observation tool:

- inspect transparent material and a host/inclusion relationship;
- observe meaningful changes while the camera moves;
- observe a live shape changing the optical appearance;
- save and reopen the camera, shape, and optical state;
- record a reproducible screen video or screenshot sequence.

This is not a claim of physically complete rendering.

## Priority order

### P0 — camera observation tool and recording

The camera is part of the observation model, not only a convenience control.

Define and later implement:

- camera position, target, elevation, and distance;
- perspective projection;
- focal length in mm and sensor size, with derived field of view;
- near/far clipping values;
- optional barrel/pincushion lens distortion, off by default;
- automatic orbit around a target with start/stop, speed, direction, orbit center,
  and preserved radius/elevation;
- camera settings included in reproducible case data.

The first recording mode should keep the camera radius and height fixed while the
camera rotates around the selected target. Lens length must not change during the
orbit unless explicitly requested.

### P1 — transparent-material core

- explicit host material with IOR, RGB absorption, roughness, and physical scale;
- one clear or colored inclusion inside the host;
- equal-IOR and different-IOR comparisons;
- inclusion position/rotation/scale and visibility;
- CPU reference behavior before GPU parity work;
- transparent shadow and focused-light output kept distinct;
- invalid containment or overlap reported instead of rendered silently.

### P2 — living shape

Use the existing Katachi shape source first. The minimum useful result is:

- shape changes over time or through an existing interaction;
- Hikari display follows the change;
- low-quality updates while moving and refinement after pause;
- the author can pause at an interesting state;
- the exact paused shape and optical state can be saved and reopened.

Do not begin by building a new general simulation system or arbitrary nesting.

### P3 — evidence and handoff

- freeze the current baseline before optical changes;
- capture the minimum reproducible cases for clear transmission, colored shadow,
  host absorption, equal-IOR inclusion, and different-IOR inclusion;
- record camera, backend, sample count, shape hash, settings, and known approximations;
- finish with a build/smoke checklist and a short observation record.

## Suggested weekly allocation

- Camera model and automatic orbit: 15%
- Transparent-material core: 40%
- Living shape minimum: 25%
- Case reproducibility, visual QA, and handoff: 20%

If the optical core is not coherent, stop the living-shape work at the smallest
working bridge and spend the remaining budget on stability and evidence.

## Explicitly deferred

- Blender as a primary feature; treat it later as a validation/export add-on;
- rooms, windows, Tokyo natural-light environment, placement, and physical context;
- print-oriented translucent shells and fabrication diagnostics;
- arbitrary nesting depth, full path tracing, and spectral rendering;
- automatic Blender scene generation;
- broad material support outside transparent/translucent media.

## Agent handoff

Before taking work, an agent should read this file and the relevant section of
`docs/hikari/implementation-plan.md`. The primary thread decides optical semantics,
visual acceptance, and when implementation is authorized. Until then, agents may
inspect, propose, or update planning notes only.
