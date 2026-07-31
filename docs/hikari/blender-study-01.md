# hikari — Blender study 01 reading

Status: inspected source; original unchanged
UpdatedAt: 2026-08-01

## Role

`study_01_light_size05.blend` is the first source-level Blender reference supplied by the author. It is an area-source transparent-resin study. The planned room/natural-light study was not completed in this file.

The source remains outside Git. This document records only values read in Blender 5.2.0 LTS; it does not publish or modify the `.blend`.

## Active scene

- Cycles, 256 samples, denoising, 12 maximum/transmission bounces, AgX, exposure 0;
- 1920×1080 at 50% output, active 50 mm camera;
- metric scene units, but the intended real-world object dimension is not yet confirmed;
- one visible resin body (`Sphere.008`) with subdivision;
- a rectangular emissive plane acting as the visible area source;
- alternative Area and Point lamp objects exist but are hidden from render;
- no active external image or library dependency was reported by Blender's loaded data.

A raw-file inventory also found the names `forest.exr` and `0dac0b05ae44d0d8663c049cdde90b2ced7ef559_1_500x500.jpg`, neither present beside the source. They may be unused study history rather than live dependencies. Confirm Blender's External Data report before treating the file as a portable archive; neither candidate is required by the active scene reading recorded here.

The active resin body's Blender dimensions are about 2.80 × 2.57 × 2.55 scene metres. Do not treat this as the author's intended fabrication scale until confirmed; the new physical-scale contract records that decision explicitly.

## Active material

`Resin_scatter` uses:

- Principled transmission weight 1.0;
- IOR 1.45;
- surface roughness 0.05;
- purple Volume Absorption;
- zero active Volume Scatter density;
- a local object-coordinate distance mask that multiplies absorption density.

The mask uses the object named `Empty`, vector length, a narrow color ramp near the region boundary, and a 0.5 density multiplier. This creates a bright/clear absorption region inside the same surface material. It is therefore closest to an **equal-IOR absorption void**, not a separately modelled transparent inclusion with its own refractive boundary.

Several `ClearRegion*` empties and alternate resin materials remain in the file as study history, but they are not all connected to the active material. Alternate datablocks explore IOR values around 1.0, 1.2, and 1.45, absorption colors, and scattering variants.

## What enters hikari

1. Reproduce the active equal-IOR absorption-void case before adding different-IOR nesting.
2. Add a rectangular area source and sweep source size while holding camera, form, and receiver fixed.
3. Keep absorption color/density, IOR, surface roughness, and optional scattering as separate parameters.
4. Record physical scale; the same numeric volume density cannot be compared across arbitrary scene units.
5. Use a second Blender case for a real nested boundary and a later case for room natural light.

## Comparison limits

The current PNG and `.blend` help define a visual question, not a calibrated truth image. The receiver, area-source power, scene scale, clear-region dimension, and intended material concentration still need author confirmation before quantitative comparison.

The author also confirms that the current CG has not reproduced the physical works' geometry-derived “light drawing.” Do not tune the existing render into a false baseline by adding a floor pattern. The next Blender comparison should introduce one controlled real surface irregularity and vary only area-source size.
