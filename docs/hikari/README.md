# hikari — project definition

Status: design baseline
UpdatedAt: 2026-08-01

## Purpose

hikari is a real-time visual instrument specialized for transparent materials.

It is not intended to replace Blender or become a general-purpose renderer. Blender is where a chosen still image or moving image can be crafted and finished. hikari is where the author can casually move around a form, make small changes, and enjoy discovering how its appearance changes before deciding what to make.

Its primary value is the immediate, continuous relationship between:

- viewpoint and the apparent interior, distortion, shadow, and focused light;
- small changes to the source shape and the resulting optical behavior;
- a colored transparent host and a clear or differently colored inclusion within it.

The initial physical reference is cast resin, but the design must also admit glass, acrylic, liquids, voids, and other transparent or translucent media.

The first representative scene is:

> A clear inclusion sits inside a dark or colored transparent host. Oblique light makes the inclusion appear as a void, light, or another space, while a transmitted colored shadow and a focused light region remain visible on the receiver.

This is not one shot to optimize. It is a small space to move through: circle it, make one small change, and immediately ask what changed and how that discovery might affect a physical work.

## Product boundary

hikari owns:

- casual real-time observation through viewpoint movement and direct condition changes;
- optical comparison of nearby states rather than optimization of one finished frame;
- small source-shape edits that remain connected to the Katachi field;
- comparison of host/inclusion material, light, camera, and receiver conditions;
- reproducible settings and evidence for each observation;
- fast approximation with explicit limits;
- a loop in which promising discoveries can be developed in Blender and checked against physical resin tests.

hikari does not currently own:

- general 3D modelling;
- a node-based material editor;
- a full path tracer or physically complete caustics;
- structural analysis or fabrication safety;
- large scenes, animation editing, or video finishing;
- final still-image composition or shot sequencing;
- replacing author judgment with automatic shape or material optimization;
- automatic agreement with Blender at the pixel level.

## Product principles

1. **Move first, tune second.** Camera movement and the first material/shape controls must make observation enjoyable before analytical views are opened.
2. **One small change stays legible.** A viewpoint, source-shape, host-color, or inclusion change updates the body, transmitted shadow, and focused light as one scene.
3. **Natural leads; Analysis explains.** Natural is the default place to look. Boundary, ray, and throughput views answer questions but are not required to enjoy the change.
4. **The source shape remains live.** hikari observes Katachi's current field. Small shape changes are part of the optical instrument rather than separate render setup.
5. **Interesting states can become evidence.** Saving is lightweight during exploration. Once a state is chosen for Blender or physical work, its shape, viewpoint, light, materials, and approximations become reproducible.

## Roadmap order

1. Bring the transparent body, nested material relationship, transmitted shadow, and focused light to the agreed visual quality gate.
2. Only after that gate, expose whole-object height, orientation, and placement relative to a ground reference.
3. Use grounded placement for object studies and free/floating placement for furniture or spatial-object studies.

Placement is postponed as an interaction feature, not ignored in the architecture. Shape-local coordinates, whole-object pose, inclusion-local pose, optical receiver, and future ground reference remain distinct so the optics do not need to be rewritten later.

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
- [Reference corpus](reference-corpus.md)
- [Web publishing procedure](publishing.md)
- [Model and subagent delegation plan](delegation-plan.md)

## Success criteria for the next milestone

The milestone is complete when one frozen shape, camera, receiver, and light setup demonstrates all of the following in both hikari and Blender:

- a readable transparent shadow;
- shadow density varying with optical path length;
- shadow color varying with host absorption;
- a clear inclusion whose boundary disappears when host/inclusion IORs match;
- the same inclusion becoming visible through distortion when IORs differ;
- a focused-light region that remains distinct from the shadow;
- orbiting the Natural view reveals a view-dependent change without requiring a numeric readout;
- a small source-shape change and a small inclusion transform change both affect the body and receiver in the same interaction cycle;
- a saved interesting view restores the camera and optical scene and can be sent to Blender without manual reconstruction;
- a saved case bundle that explains every input and known approximation.
