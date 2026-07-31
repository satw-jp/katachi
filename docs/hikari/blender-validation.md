# hikari ↔ Blender validation protocol

Status: proposed baseline
UpdatedAt: 2026-08-01

## Purpose

Blender is a reference environment and a place for higher-quality experiments. It is not the destination of hikari and is not assumed to be ground truth without a recorded scene setup.

The two tools have different jobs in the same making loop. Use hikari to find a viewpoint, small shape change, or host/inclusion relationship worth pursuing. Use Blender to craft and assess a selected still or moving image. A Blender result does not replace the live exploration that led to the choice.

Favorite Blender data and physical resin photographs enter first through the [reference corpus](reference-corpus.md). They become validation baselines only when the relevant source and conditions are sufficiently recorded.

Every comparison asks one phenomenon-level question. Shape, camera, receiver, and light are held fixed while one material variable changes.

## Case bundle

Use one folder per immutable case:

```text
hikari-<case-id>-<utc-stamp>/
  case.json
  recipe.json
  hikari-settings.json
  mesh.obj
  mesh.stl
  hikari/render.png
  blender/scene.blend
  blender/render.png
  comparison.md
```

`mesh.obj` is the primary Blender input. `mesh.stl` is a secondary geometry check. Existing exports use millimetres and preserve raw x/y/z; they do not declare a build axis or print-ready plate orientation.

`case.json` records:

- schema version and case ID;
- exported UTC time;
- source repository and Git commit;
- Katachi study ID/version;
- filenames and SHA-256 values;
- mesh resolution, triangle count, watertight result, source bounds, millimetre bounds, scale in mm/source-unit;
- coordinate contract: millimetres, raw axes, Katachi field origin, identity transform to Blender unless explicitly changed;
- camera, receiver, and light values;
- renderer/backend and optical sample count;
- known approximations.

Generated `.blend` files and images are not committed by default. Commit case specifications, comparison notes, and only selected reference images that are intentionally part of the baseline.

## Blender setup

1. Import `mesh.obj`; verify dimensions against `case.json` before judging optics.
2. Preserve raw axes. Do not silently rotate to a fabrication axis.
3. Place a neutral receiver just below the recorded minimum vertical bound using a fixed epsilon.
4. Recreate the recorded camera and light direction.
5. Use Cycles for the reference render.
6. Map hikari IOR and RGB absorption to a transmissive volume/material. Record the exact node values.
7. Keep world, exposure, view transform, bounces, samples, denoising, and caustics settings fixed within a matrix.
8. Note any Blender control with no hikari equivalent and any hikari proxy with no Blender equivalent.

## Baseline matrix

| ID | Question | Fixed inputs | Sweep | Observe |
|---|---|---|---|---|
| M0 | Did geometry and scale survive export? | shape | OBJ vs STL, opaque clay | bounds, silhouette, topology |
| M1 | Does clear transmission bend the same way? | shape/camera/light | IOR 1.50, absorption 0 | background distortion, silhouette |
| M2 | Does a transparent shadow respond to thickness and source size? | shape/camera | absorption 0.55/2.50 × source 0.53°/10° | density, chroma, penumbra |
| M3 | Does focused light move with refraction? | shape/camera | IOR 1.10/1.65 × source 0.53°/10° | centroid, spread, peak relation to shadow |
| M4 | Does a colored host attenuate by path length? | shape/camera/light | neutral/amber/dark absorption | body gradient, transmitted shadow color |
| M5 | Does an equal-IOR clear inclusion remove absorption without inventing a boundary? | host/inclusion geometry | equal IOR | boundary visibility, bright/clear interior region |
| M6 | Does a different-IOR clear inclusion become a refractive object? | same as M5 | inner IOR low/high | boundary, distortion, apparent void/light |
| M7 | Are roughness and material variation directionally comparable? | selected M6 case | low/high roughness/variation | highlight spread, interior haze; qualitative only |
| M8 | What is exploratory only? | selected case | prism/stress modes | record hikari-only behavior; no equivalence claim |

## Comparison record

For every case, distinguish observation from interpretation:

```text
Observed:
- silhouette ...
- body brightness / thickness gradient ...
- background distortion ...
- shadow footprint / chroma / penumbra ...
- focused-light centroid / spread ...
- inclusion boundary visibility ...

Interpretation:
- likely cause ...
- hikari approximation involved ...
- Blender setting that may explain the difference ...

Decision:
- keep / revise / investigate
- next single-variable case
```

## Completion rule

A Blender comparison is complete only when the case can be reproduced from the saved bundle, dimensions match, settings are recorded, both images exist, and the result is written back as an observation. A visually pleasing screenshot without those items is a reference image, not validation.
