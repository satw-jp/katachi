# hikari — project definition

Status: design baseline
UpdatedAt: 2026-08-01

Current weekly handoff: [current-week-plan.md](current-week-plan.md)

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
9. **Darkness is authored information.** A dark outer body containing a small or clear light region can express comfort in darkness. Natural view must not automatically lift every host to the same brightness or treat disappearance and black silhouette as failed exposure.
10. **Inclusions are plural in the scene model.** The first transport milestone may validate one inclusion, but saved data and renderer boundaries must admit several independently shaped, transformed, and material-bound inclusions. The author is developing a physical work in which this multiplicity matters.

## Roadmap order

1. Bring the transparent body, nested material relationship, transmitted shadow, focused light, and a deterministic Tokyo natural-light study in open air and simple rooms to the agreed visual quality gate.
2. After that gate, let a simple shape slowly grow, drift, or sag while its optical appearance changes; pause at an interesting moment and make that state reproducible.
3. Expose whole-object height, orientation, and placement relative to a ground reference for the chosen frozen form.
4. Use grounded placement for object studies and free/floating placement for furniture or spatial-object studies.
5. Study the chosen form from hand scale through furniture and architecture, preserving either the same physical material or an explicitly appearance-matched material.

General placement is postponed as an interaction feature, not ignored in the architecture. Phase 4 may move the body only nearer to or farther from an opening as an environment relation; height, free orientation, grounded/floating intent, and spatial arrangement wait until a form is frozen. Shape-local coordinates, whole-object pose, inclusion-local pose, optical receiver, and future ground reference remain distinct so the optics do not need to be rewritten later.

## Current implementation

The current implementation is co-located with Katachi Cloud Sculpt. This is intentional for the present phase: Katachi produces the shape field and hikari reads the same balls, smooth-union value, and camera in memory, without an export/import step.

Implemented today:

- a versioned, JSON-serializable `ShapeAsset` contract plus a separate runtime shape-query adapter;
- adapters for the current smooth-union metaballs and sampled signed-distance or density volumes;
- authored region metadata kept separate from optical-material binding;
- a serializable `OpticalScene` and minimal `HikariCase` that do not depend on localStorage;
- a live Cloud Sculpt adapter; Flow projection and CPU optics now query `RuntimeShape`;
- `観察を保存／観察を開く`, preserving shape recipe, Hikari controls, camera, scene, backend, and approximation notes;
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

- the live Cloud path and CPU optics use the contracts, but the WebGL view shader and WebGPU compute shader still evaluate metaballs directly;
- current live fingerprints are labelled non-cryptographic `fnv1a32`; a cryptographic provenance hash remains an export-stage requirement;
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
ShapeAsset { revision, representation, regions, recipe, hash }
        |
        v
RuntimeShape { distance, contains, normal, regionAt }
        |
        v
OpticalScene { media, receiver, light, camera }
        |
        +--> reference CPU tracer
        +--> realtime view shader
        +--> WebGPU tracer
```

## Shape handoff is a core purpose

The author identified an important direction on 2026-08-01:

> 「katachiで重要なのは内部重点や表面重点などの複雑形状をhikariに持っていきやすくできること」

This means that the Katachi → hikari boundary must not be designed only around the
current smooth-union `Ball[]` source. Katachi is valuable here because it can create
forms whose meaning is in where material is emphasized: inside a volume, on a host
surface, along a path, around a void, or across several regions. A single exported
mesh may preserve the silhouette while losing the distinction that made the form
interesting.

The handoff therefore has three related parts:

1. **Optical shape query** — hikari can evaluate the chosen shape for boundary,
   normal, containment, and optical path queries without knowing the Study UI.
2. **Frozen geometry** — a complex result can be viewed and exported even when its
   generating Study is not running live.
3. **Recipe and provenance** — the source Study, field/region meaning, parameters,
   revision, scale, and approximation limits travel with the shape so the optical
   observation remains reproducible.

The first useful contract is consequently broader than `balls / smoothK` while
remaining small enough to implement incrementally. It is split deliberately into
portable data and browser-runtime behavior:

```ts
type ShapeAsset = {
  revision: string;
  bounds: Bounds;
  representation: Metaballs | SampledField;
  regions: ShapeRegion[];
  recipe: JsonValue;
  sourceHash: string;
  approximations: string[];
};

type RuntimeShape = {
  asset: ShapeAsset;
  distance(point: Vec3): number;
  contains(point: Vec3): boolean;
  normal(point: Vec3): Vec3;
  regionAt(point: Vec3): string | undefined;
};
```

`regions` are not a replacement for the optical medium model. They preserve the
Katachi-side distinction between host, inclusion, surface emphasis, interior
emphasis, void, and other authored regions so hikari can map that meaning to
`Medium` objects deliberately. The first implementation may still adapt the
current `Ball[]` field, but new complex studies should not be forced to flatten
their result into an undifferentiated mesh before hikari can observe it.

An independent `Projects/active/hikari` repository becomes appropriate when:

1. `ShapeAsset` and `RuntimeShape` are explicit and versioned;
2. one host plus one inclusion can be represented by `OpticalScene`;
3. a saved validation case can be reopened without Katachi localStorage;
4. CPU reference tests define the expected medium transitions;
5. the browser application can build from the adapter without importing Katachi UI or history internals.

Until then, GitHub remains the source of truth through the Katachi repository, with hikari documents and implementation committed together.

Related documents:

- [Next implementation plan](implementation-plan.md)
- [Blender validation protocol](blender-validation.md)
- [Reference corpus](reference-corpus.md)
- [Natural-light environments and receiver materials](lighting-environment.md)
- [Light drawing from the author's trace](light-drawing.md)
- [Abstract receiver surface](receiver-surface.md)
- [Living-shape and freeze workflow](living-shape.md)
- [Physical scale and spatial context](scale-context.md)
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
- a Tokyo date/time change that moves direct light, shadow, and focused light continuously;
- one unlit-room case with explicit width, depth, ceiling height, openings, and object-to-window relation;
- a body/no-body comparison that shows where daylight is redistributed without inventing energy;
- orbiting the Natural view reveals a view-dependent change without requiring a numeric readout;
- a small source-shape change and a small inclusion transform change both affect the body and receiver in the same interaction cycle;
- a saved interesting view restores the camera and optical scene and can be sent to Blender without manual reconstruction;
- a saved case bundle that explains every input and known approximation.
