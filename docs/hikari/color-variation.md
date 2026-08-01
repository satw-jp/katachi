# hikari — color variation as an internal concentration field

Status: planned from the existing visual variation controls
UpdatedAt: 2026-08-01

## Intent

Color in a cast transparent body is not always uniform. Pigment or ink may pool, diffuse, stretch into threads, preserve incomplete mixing, or settle while curing. These variations are intentional material events, not surface texture or post-processing.

Hikari already has `内部のむら` and `むらの大きさ`, but the current procedural pattern is a visual approximation and is not authoritative across the body view, transparent shadow, CPU focused-light path, WebGPU path, and Blender exchange. The next material step turns it into a shared object-local concentration field.

## Field contract

```ts
type PigmentField = {
  id: string;
  mode: "uniform" | "diffused" | "pooled" | "streaked" | "hand-trace";
  seed: string;
  baseConcentration: number;
  contrast: number;
  featureScaleMm: number;
  directionObject: Vec3;
  offsetObject: Vec3;
  frozenRevision: string;
};

absorptionAt(pointObject) =
  material.absorptionPerMm * concentration(field, pointObject)
```

The field lives in object-local coordinates. Whole-object placement never makes the pigment slide. `directionObject` records the direction of settling or pouring during fabrication; it is not silently replaced by current world gravity after the form is rotated.

## Starting families

| Family | Material memory | First approximation |
|---|---|---|
| uniform | thoroughly mixed pigment | concentration 1 everywhere |
| diffused | ink blooming softly through resin | broad smooth noise with low contrast |
| pooled | pigment gathering in low or thick regions | directional gradient plus broad accumulation pockets |
| streaked | a pour or incomplete stir leaving threads | elongated object-local field along a recorded direction |
| hand-trace | the author's mixing gesture remains visible | a frozen sparse path with falloff through volume |

These are causal field families, not literal texture presets. A family may be seeded randomly, then frozen and edited. It never changes during orbit, time playback, or case reopen.

## Relation to geometry and inclusions

- Geometry variation changes boundaries, normals, thickness, and therefore light direction.
- Pigment variation changes absorption along a path without changing the boundary.
- A clear inclusion removes or replaces part of the host pigment path; it does not inherit the host concentration field.
- Several colored inclusions may later own separate pigment fields.
- Bubbles, haze, scattering particles, and opaque foreign material are separate future media; do not fake them only by raising pigment contrast.

This separation lets the author ask whether a light drawing came from the hand-shaped surface, a thickness change, or a color concentration trace.

## Author-facing workflow

```text
色のむら  [均一] [にじむ] [溜まる] [筋] [手の痕跡]
強さ      [均一 ↔ はっきり]
大きさ    [細かい ↔ 大きい]
向き      [pour / settle direction]
          [もう一度つくる] [このむらを固定]
```

Natural view keeps only family, strength, size, reroll, and freeze. Exact seed, millimetres, direction vector, field revision, and sampling limits remain in Analysis and the saved case.

## Implementation order

1. Extract the existing shader `materialPattern` into a pure, versioned field specification and fixed numeric sample cases.
2. Replace the current scalar visual-only meaning with concentration sampled in object-local coordinates.
3. Integrate the same field along host segments in camera view and transparent-shadow throughput.
4. Share the field function/constants with CPU and WebGPU focused-light paths within documented numeric tolerance.
5. Add diffused, pooled, and streaked families; add hand-trace only after a trace can be drawn/frozen reproducibly.
6. Export the frozen field recipe and a Blender reconstruction aid. A baked volume/grid may be optional; the case always retains the procedural source.

Sampling while interacting may be coarse and refine after pause, but refinement may only reduce error. It must not rearrange the visible pigment pattern.

## Quality gate

- orbiting reveals one stable internal field rather than a screen-space overlay;
- doubling physical path through the same concentration approximately doubles optical depth;
- a colored shadow carries the same local absorption tendency as the visible body;
- a clear inclusion removes host pigment depth where the path enters it;
- changing whole-object pose does not move the frozen pigment relative to the form;
- reroll changes the seed explicitly and case reopen restores the exact field;
- uniform mode matches the material baseline within tolerance;
- CPU, realtime, and WebGPU fixed points return compatible concentration and transmission;
- Blender comparison can identify which part is field behavior and which is final-render lighting or color management.
