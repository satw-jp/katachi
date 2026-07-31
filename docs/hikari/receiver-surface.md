# hikari — abstract receiver surface

Status: core environment requirement
UpdatedAt: 2026-08-01

## Author observation

The author has found transparent works compelling on mortar, earth, grass, acrylic, and wood flooring. hikari does not need to reproduce those places as detailed scenes. It should let the receiving surface change through abstract optical and visual properties, then hand a chosen concrete setting to Blender for image-making.

The receiver is where transparent shadow, [light drawing](light-drawing.md), reflection, and surrounding color become visible. It is an active part of the work, not a neutral UI background.

## Separate three meanings

```text
receiver optics      how the surface returns or transmits incident light
surface character    non-representational variation in that response
receiver geometry    plane, orientation, distance, and later relief
```

Do not mix them. A mottled color must not move a ray endpoint. A relief field may move it, but that is a geometry change and a separate case variable.

## Abstract model

```ts
type OpaqueReceiverMaterial = {
  kind: "opaque";
  baseColor: Rgb;
  diffuseReflectance: number;
  specularReflectance: number;
  roughness: number;
  character: {
    amount: number;
    featureScaleMm: number;
    directionality: number;
    directionDeg: number;
  };
};

type ThinTranslucentReceiverMaterial = {
  kind: "thin-translucent";
  baseColor: Rgb;
  transmission: number;
  roughness: number;
  thicknessMm: number;
  knownApproximation: string[];
};

type ReceiverSurface = {
  plane: Plane;
  material: OpaqueReceiverMaterial | ThinTranslucentReceiverMaterial;
};
```

Begin with the opaque model. A transparent acrylic receiver is not just a shinier floor: light continues through it and may need another surface below. Add the thin-translucent model only after opaque receiver response and shared ray endpoints are stable.

## Natural-view controls

The first surface opens with three controls:

```text
Brightness  dark ↔ light
Color trace cool/neutral/warm or a quiet tint
Surface     dry/matte ↔ smooth/gloss
```

Brightness is the first diffuse-return control; do not expose separate albedo/specular terminology in Natural. An expanded surface adds character amount, size, and direction. Transmission appears only when the Transmitting family is selected and is clearly marked as a later optical mode, not an opaque-floor style.

No recognizable concrete, soil, grass, or wood texture is required. Variation is an abstract, world-anchored modulation whose mean energy stays consistent. It must not look like a projected caustic or follow the object in screen space.

## Material families as starting points

| Family | Abstract starting tendency | What it helps the author read |
|---|---|---|
| Pale surface | pale, matte, low character; mortar/paper memory | colored shadow and focused-light baseline |
| Dry surface | neutral/warm, matte; earth/stone memory | soft contrast and grounded installation |
| Deep surface | dark, matte; wet earth/dark-floor memory | whether the light drawing survives reduced contrast |
| Living surface | quiet green, matte, coarse character; grassland memory | whether the optical event survives an active ground |
| Warm surface | warm, medium roughness, directional character; flooring memory | interior scale, reflection, and low daylight |
| Transmitting surface | glossy/transmitting thin layer; acrylic memory | reflected and transmitted continuation; later optical mode |

These names load values; they do not lock the surface to a literal material. The saved case stores expanded values and an optional family ID.

## Implementation order

1. Replace hard-coded floor color and `groundReflectance` with one opaque `ReceiverMaterial` shared by Natural, CPU reference, and WebGPU composition.
2. Keep focused-light endpoint/HDR density independent of receiver shading. Apply receiver response only when composing the visible surface.
3. Add Brightness, Color trace, and Surface controls and the five opaque starting families.
4. Add character scale/direction after proving it cannot be mistaken for or alter a geometry-derived light drawing.
5. Add a second receiver orientation or a floor/wall corner only when a case requires it.
6. Add thin-translucent Acrylic with explicit thickness and an under-surface context.
7. Add real relief as receiver geometry, with new ray intersections and its own before/after case—not as a material slider.

## Quality gate

- Switching receiver family changes contrast, color interaction, and reflection while fixed ray endpoints remain fixed.
- Light-drawing lines stay geometry-derived and can be followed across Tone/Surface/Return changes.
- Character has no recognizable stock texture, no screen-space swimming, and no object-following pattern.
- Saved cases restore expanded receiver values, physical feature scale, plane, and approximation status.
- Concrete material realization remains a Blender task after an abstract relation is chosen.
