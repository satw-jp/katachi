# hikari — project definition

Status: design baseline
UpdatedAt: 2026-08-01

## Purpose

hikari is a real-time visual instrument specialized for transparent materials.

It is not intended to replace Blender or become a general-purpose renderer. Blender is where a chosen still image or moving image can be crafted and finished. hikari is where the author can casually move around a form, make small changes, and enjoy discovering how its appearance changes before deciding what to make.

Its primary value is the immediate, continuous relationship between:

- viewpoint and the apparent interior, distortion, shadow, and focused light;
- small changes to the source shape and the resulting optical behavior;
- a colored transparent host and a clear or differently colored inclusion within it;
- the author's irregular surface/thickness traces and the lines of focused light they draw onto a floor or wall;
- natural light changing with place, date, time, openings, room dimensions, ceiling height, and the form's position relative to a window.

The initial physical reference is cast resin, but the design must also admit glass, acrylic, liquids, voids, and other transparent or translucent media.

The first representative scene is:

> A clear inclusion sits inside a dark or colored transparent host. Oblique light makes the inclusion appear as a void, light, or another space, while a transmitted colored shadow and a focused light region remain visible on the receiver.

This is not one shot to optimize. It is a small space to move through: circle it, make one small change, and immediately ask what changed and how that discovery might affect a physical work.

A second core question gives the optical work a spatial purpose:

> In a small room with no artificial lighting, can a transparent body near an opening collect and redirect daylight so it behaves like a daylighting instrument?

hikari does not assume the answer is yes. It compares the same room with and without the body and shows where light is redistributed, including darker regions and losses as well as bright concentrations.

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
6. **The light drawing belongs to the form.** A caustic line or arc is not floor decoration. It must arise from the author's actual geometry and become sharper or softer for a reason when the light environment changes.
7. **Natural light is the primary light.** Tokyo is the first geographic clock. Open air and simple rooms expose how date, time, opening direction, room size, ceiling height, and distance from a window change the same body.
8. **A daylighting device redirects; it does not generate.** A brighter patch must be accompanied by an explainable light path. Compare body/no-body states and preserve relative energy before calling the form useful for daylight.

## Roadmap order

1. Make the body, transparent shadow, and focused light use one receiver, one finite-light sample set, and one energy-accounted transport result. The author-facing default never shows focused light detached from the finite-source shadow support.
2. Complete the colored-host / clear-inclusion relationship and compare the same fixed cases in Hikari, Blender, and selected physical references.
3. Bring deterministic Tokyo natural light from open air into simple rooms and real window openings without changing that transport contract.
4. After the transparent-material gate, let a simple shape slowly grow, drift, or sag while its optical appearance changes; pause at an interesting moment and make that state reproducible.
5. Expose whole-object height, orientation, and placement relative to a ground reference for the chosen frozen form.
6. Use grounded placement for object studies and free/floating placement for furniture or spatial-object studies.
7. Study the chosen form from hand scale through furniture and architecture, then add several independent bodies and the five-view Ambient presentation branch.

General placement is postponed as an interaction feature, not ignored in the architecture. Phase 4 may move the body only nearer to or farther from an opening as an environment relation; height, free orientation, grounded/floating intent, and spatial arrangement wait until a form is frozen. Shape-local coordinates, whole-object pose, inclusion-local pose, optical receiver, and future ground reference remain distinct so the optics do not need to be rewritten later.

Ambient Mix is a parallel presentation branch after the same optical quality gate. It begins with five independent saved views and camera orbits, then deterministic recorded response, then a read-only live Ambient bridge. It does not begin with five mutually interacting optical bodies or audio-driven MPM.

## Current implementation

The current implementation is co-located with Katachi Cloud Sculpt. This is intentional for the present phase: Katachi produces the shape field and hikari reads the same balls, smooth-union value, and camera in memory, without an export/import step.

Editable multi-view persistence is defined in [Hikari document (`.hkr`)](document-format.md); Blender continues to consume one selected materialized case through [the Blender integration contract](blender-integration.md).

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
- persistent top-bar backend status and one-tap `GPU · WebGPU` / `SAFE · CPU` switching;
- geometric normals for view-ray medium decisions, with cosmetic normal variation restricted to reflection and surface appearance;
- isolated same-count CPU/WebGPU receiver comparison from the Calculation Status panel;
- current-renderer-resolution viewport PNG export and editable multi-view `.hkr` documents;
- STL, OBJ, and Katachi recipe export from the same source field.

Known limits:

- runtime rendering supports one validated analytic spherical inclusion; the scene and bundle contracts allow arrays, but generic multiple-inclusion meshes are not connected yet;
- outer material uses clear/amber/dark RGB absorption presets; the versioned pigment concentration field exists but is not connected to every CPU/GPU/shadow path yet;
- the current clear inclusion can sit inside a colored host, but only the first analytic sphere is rendered and focused;
- CPU, WebGPU, and view-shader optical logic are parallel implementations and can drift;
- truly unresolved nested view rays use a bounded host-tinted ambient fallback so an implementation limit is not displayed as black absorption. This is an explicitly view-only approximation; recursive internal reflection/refraction remains open and receiver transport still rejects unresolved energy;
- Natural, CPU, and WebGPU share the `OpticalScene` receiver, seeded aperture/sun-disk samples, and fixed-domain Float32 transport field. Natural removes the affected unobstructed baseline before depositing refracted RGB flux. Four author views separate the composite, shadow coverage, delivered light, and light that did not arrive; the energy summary keeps delivery, non-arrival, containment rejection, and residual visible. The same-count Tokyo 17:00 reconstructed field passes every current display-field gate after sample-count-aware reconstruction, but raw-hit parity and a representative case family remain open;
- SAFE CPU reconstructs its 1,024-sample receiver field with a wider energy-normalized kernel. This removes visible sampling gaps but resolves less spatial detail than the normal 16,384-sample WebGPU field and is not a fidelity match;
- no multiple internal bounces or physically calibrated HDR environment;
- Tokyo open-air direction is active, while room/window geometry is a pure admission contract not yet rendered;
- Blender bundle v2 includes Hikari settings, camera, hashes, scale, media, receiver, and sun, but `blender-result.json` return import and generic inclusion meshes remain planned.

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
- [Reproducible baseline cases](cases/README.md)
- [Blender validation protocol](blender-validation.md)
- [Blender integration design and bundle v2](blender-integration.md)
- [Reference corpus](reference-corpus.md)
- [Natural-light environments and receiver materials](lighting-environment.md)
- [Light drawing from the author's trace](light-drawing.md)
- [Abstract receiver surface](receiver-surface.md)
- [Living-shape and freeze workflow](living-shape.md)
- [Physical scale and spatial context](scale-context.md)
- [Multiple transparent bodies as a light composition](multi-body-composition.md)
- [One or many transparent inclusions](inclusion-family.md)
- [Internal color-variation field](color-variation.md)
- [Artwork, Ambient, and open-call strategy](artwork-strategy.md)
- [Ambient environmental artwork contract](ambient-integration.md)
- [Five-voice Hikari × Ambient Mix](ambient-mix.md)
- [Blender study 01 reading](blender-study-01.md)
- [Adjacent study: printed translucent light shade](printed-translucent-shell.md)
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
- the focused-light region never appears outside the sample-count-aware reconstruction footprint plus one support texel in the author-facing mode;
- CPU, WebGPU, Natural, saved cases, and Blender identify the same receiver frame, with no shape-derived hidden floor;
- no object, night, unresolved TIR, or an invalid medium path can deposit focused light;
- receiver flux remains comparable across absorption, sample count, and texture resolution instead of being renormalized to the brightest pixel each frame;
- a Tokyo date/time change that moves direct light, shadow, and focused light continuously;
- one unlit-room case with explicit width, depth, ceiling height, openings, and object-to-window relation;
- a body/no-body comparison that shows where daylight is redistributed without inventing energy;
- orbiting the Natural view reveals a view-dependent change without requiring a numeric readout;
- a small source-shape change and a small inclusion transform change both affect the body and receiver in the same interaction cycle;
- a saved interesting view restores the camera and optical scene and can be sent to Blender without manual reconstruction;
- a saved case bundle that explains every input and known approximation.
