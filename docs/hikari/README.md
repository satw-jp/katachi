# hikari — project definition

Status: design baseline
UpdatedAt: 2026-08-01

## Purpose

hikari is a real-time visualizer specialized for transparent materials.

It is not intended to replace Blender or to become a general-purpose renderer. Its role is to let the author move shape, light, viewpoint, and material conditions quickly, then observe what appears inside and around a transparent form.

The initial physical reference is cast resin, but the design must also admit glass, acrylic, liquids, voids, and other transparent or translucent media.

The first representative scene is:

> A clear inclusion sits inside a dark or colored transparent host. Oblique light makes the inclusion appear as a void, light, or another space, while a transmitted colored shadow and a focused light region remain visible on the receiver.

## Product boundary

hikari owns:

- real-time observation of reflection, refraction, absorption, transparent shadows, and light concentration;
- comparison of material, light, camera, and nested-medium conditions;
- reproducible settings and evidence for each observation;
- fast approximation with explicit limits;
- an interchange and comparison loop with Blender and physical resin tests.

hikari does not currently own:

- general 3D modelling;
- a node-based material editor;
- a full path tracer or physically complete caustics;
- structural analysis or fabrication safety;
- large scenes, animation editing, or video finishing;
- automatic agreement with Blender at the pixel level.

## Current implementation

The current implementation is co-located with Katachi Cloud Sculpt. This is intentional for the present phase: Katachi produces the shape field and hikari reads the same balls, smooth-union value, and camera in memory, without an export/import step.

Implemented today:

- WebGL SDF rendering of one smooth-union transparent body;
- entry/inside/exit refraction with one material IOR;
- Beer–Lambert-like absorption and thickness-dependent tint;
- finite-source transparent shadows with soft penumbra;
- CPU or WebGPU optical-ray sampling;
- a receiver irradiance field for focused light;
- roughness and procedural material variation;
- exploratory prism-dispersion and cure-stress/polarization views;
- Windows-safe CPU fallback;
- STL, OBJ, and Katachi recipe export from the same source field.

Known limits:

- only one medium boundary exists;
- material color is not yet an editable RGB absorption coefficient;
- no clear inclusion inside a separately colored host;
- CPU, WebGPU, and view-shader optical logic are parallel implementations and can drift;
- no multiple internal bounces or physically calibrated HDR environment;
- Blender export does not yet include hikari settings, camera, hashes, or comparison metadata.

## Architecture decision

hikari remains inside the Katachi repository until a stable interchange boundary exists. Creating a copied standalone application now would duplicate the shape field and three optical implementations before the material model is stable.

The extraction boundary is:

```text
Katachi shape/history
        |
        v
ShapeSource { revision, balls, smoothK, recipe }
        |
        v
OpticalScene { media, receiver, light, camera }
        |
        +--> reference CPU tracer
        +--> realtime view shader
        +--> WebGPU tracer
```

An independent `Projects/active/hikari` repository becomes appropriate when:

1. `ShapeSource` is explicit and versioned;
2. one host plus one inclusion can be represented by `OpticalScene`;
3. a saved validation case can be reopened without Katachi localStorage;
4. CPU reference tests define the expected medium transitions;
5. the browser application can build from the adapter without importing Katachi UI or history internals.

Until then, GitHub remains the source of truth through the Katachi repository, with hikari documents and implementation committed together.

Related documents:

- [Next implementation plan](implementation-plan.md)
- [Blender validation protocol](blender-validation.md)
- [Web publishing procedure](publishing.md)

## Success criteria for the next milestone

The milestone is complete when one frozen shape, camera, receiver, and light setup demonstrates all of the following in both hikari and Blender:

- a readable transparent shadow;
- shadow density varying with optical path length;
- shadow color varying with host absorption;
- a clear inclusion whose boundary disappears when host/inclusion IORs match;
- the same inclusion becoming visible through distortion when IORs differ;
- a focused-light region that remains distinct from the shadow;
- a saved case bundle that explains every input and known approximation.
