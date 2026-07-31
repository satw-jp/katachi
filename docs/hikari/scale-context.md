# hikari — physical scale and spatial context

Status: planned after placement foundation
UpdatedAt: 2026-08-01

## Purpose

The current physical works are relatively small because of fabrication constraints, not because small scale is the target. hikari should let one chosen form become a handheld object, chair or sofa, spatial object, canopy, or transparent roof and reveal how material and light change with that physical scale.

Changing scale is not camera zoom. In transparent material, optical path length changes absorption and shadow color even when shape proportions and IOR stay the same.

## One authoritative scale

```ts
type PhysicalScale = {
  mmPerShapeUnit: number;
  mode: "same-material" | "match-appearance";
  referenceMmPerShapeUnit?: number;
};

type OpticalMaterial = {
  ior: number;
  absorptionPerMm: Rgb;
  roughness: number;
  featureScaleMm?: number;
};
```

The shape remains in stable normalized coordinates for SDF precision and performance. Segment length becomes physical length only at optical integration:

```text
opticalDepth = absorptionPerMm × segmentLengthShapeUnits × mmPerShapeUnit
```

Mesh export, saved cases, Blender exchange, receiver placement, and measurement use the same `mmPerShapeUnit`. Camera distance or automatic framing never changes it.

## Two different questions

### Same material

Keep IOR and `absorptionPerMm` fixed. A ten-times-thicker object has ten times the optical depth and can become much darker or effectively opaque. This answers: **what would the same material really do at this size?**

### Match appearance

Adjust effective absorption inversely with scale so the visual density stays near the chosen reference. This answers: **what material concentration would preserve this appearance at another size?** It is always labelled and saved as an appearance compensation, not the same resin.

Showing both side by side can turn an attractive rendering choice into a concrete fabrication question.

## Scale contexts

| Context | Example question | Minimal context cue |
|---|---|---|
| Object | What happens in a hand-sized cast form? | neutral receiver and dimension marker |
| Furniture | What changes when a chair becomes a sofa-sized transparent mass? | floor, human-scale marker, low room light |
| Spatial object | How does a suspended or installed body affect circulation and light? | ground, wall, and eye-height marker |
| Roof/canopy | What light environment forms below a transparent body? | one roof body, simple room receiver, sun/window rig |

These are comparison contexts, not a general object, furniture, or architecture modeller.

## Implementation order

1. Add `PhysicalScale` to `OpticalScene` and case export; migrate existing unitless cases explicitly.
2. Replace unitless absorption with RGB absorption per millimetre in the CPU reference, body, shadow, and GPU paths.
3. Test 0.1×, 1×, and 10× scale numerically and visually in both scale modes.
4. Separate `frame camera` from `change physical size` in the UI.
5. Add Object and Furniture context cards, then Spatial object.
6. Add one Roof/canopy study: sunlight through one transparent form onto an interior receiver.
7. Move a selected case to Blender for a finished room or architectural image after hikari finds the interesting scale/light relation.

## Risks and honesty

- Current hikari absorption is a unitless look parameter and differs across rendering paths; scale UI must not ship before it is unified.
- Area and point light size/distance are physical; directional sun angle is scale-independent. Environment presets must not rescale them silently.
- Procedural surface variation also has a feature scale. Until it is expressed in millimetres, label it visual-only.
- Large transparent roofs may be nearly opaque with the same color concentration. Do not auto-brighten in same-material mode.
- Structural safety, load, fabrication, thermal behavior, weathering, and building performance remain outside hikari.
