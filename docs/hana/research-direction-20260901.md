# HANA research direction — 2026-09-01

Status: research direction, not an implementation commitment

## Position

HANA began as a Study for drawing one flower from an author's Gesture. HANA-0 through HANA-1B established a more general possibility: HANA can become a **3D Drawing Instrument**.

Neither of these roles is subordinate to the other:

```text
                 HANA Core
          Gesture / Stroke / Draw
                    │
        ┌───────────┴───────────┐
        ↓                       ↓
 standalone HANA           HANA in SKIN
 3D Drawing                authoring input
```

- **HANA standalone:** drawing in 3D is the subject of the instrument itself.
- **HANA inside SKIN:** HANA is one possible authoring capability that may provide Stroke, Graph, or author intent to SKIN.

HANA is not being connected to SKIN production by this document.

## Authorship and realization

The current working model is:

```text
Gesture / Stroke
what the author drew
        ↓
Control Stroke / Graph
editable structure
        ↓
Field / SDF
shape realization
        ↓
Mesh
display and manufacturing output
```

Mesh is not necessarily the canonical author input. Raw Gesture remains evidence of the author's ordered movement, pressure, and time. Control Stroke or Graph expresses editable structure. Field/SDF and Mesh are downstream computational representations.

## Four drawing research candidates

These are research candidates, not accepted runtime features.

### Space Draw

Draw a Stroke in space. HANA-1 currently studies this route.

```text
2D Gesture
↓
3D Stroke
```

### Surface Draw

Project a Gesture from a viewport onto an existing Base surface.

```text
Gesture
↓
Viewport ray
↓
Base surface hit
↓
Surface Stroke
```

Candidate view directions include Front, Back, Left, Right, Top, Bottom, and Axome. Possible future interpretations include adding material, removing material, Motif placement, Web direction, and Density field input.

### Silhouette Draw

Draw orthographic outlines that may establish a Base.

```text
Front silhouette
      ∩
Right silhouette
      ∩
Top silhouette
      ↓
Base Field
```

The intersection of extrusion Fields from several directions is one possible research route. No algorithm is selected yet.

### Section Draw

Redraw a section at an arbitrary location inside a Base so that forms not captured by silhouettes alone can be expressed: concavity, necking, bulging, and internal variation.

```text
Silhouette
↓
coarse Base
↓
add Section
↓
edit section
↓
update Base
```

## Apple Pencil and platform boundary

HANA-0 through HANA-1B proved this path on real hardware:

```text
Apple Pencil
↓
EasyCanvas
↓
Windows Browser
```

An eventual `HANA for iPad` remains a candidate because complex authoring tools can run effectively on iPad-class hardware. Native iPad work is not authorized now.

The design principle is:

> Gesture, Stroke, Graph, and other authored document data remain platform independent.

Windows Browser, iPad Native, CPU, CUDA, and WebGPU are execution environments or backends. They are not the HANA document itself.

## HANA Print research candidate

A Prusa MK3S may be researchable not only as a conventional layered FDM machine, but as a device that draws filament Strokes through XYZ space.

```text
HANA Gesture
↓
3D Stroke
├─ Field → Mesh → conventional FDM
└─ Toolpath → direct extrusion drawing
```

Pressure, drawing speed, and time might eventually map to extrusion amount, printer velocity, and toolpath order. This is a future research idea only. It does not authorize Toolpath generation, printer control, or changes to the current print pipeline.

## Boundary at this checkpoint

- HANA-1C may improve Smooth Centerline and Soft Edit quality only.
- Surface Draw, Silhouette Draw, Section Draw, Print drawing, iPad Native, Field, Mesh, and runtime SKIN integration remain future research.
- Existing SKIN production geometry, Web, Support, Validation, Print, FKEI, CUDA adoption, and deployment remain unchanged.

Related:

- `docs/hana/direction.md`
- `docs/hana/HANA-0.md`
- `docs/hana/HANA-1.md`
- `docs/architecture/skin-hana-bridge.md`
