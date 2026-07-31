# adjacent study — printed translucent light shade

Status: explicitly deferred; design note only, not in the current implementation queue
UpdatedAt: 2026-08-01

## Purpose

Explore how a translucent shell made by layered 3D printing changes when wall thickness, local thickness, scale, material profile, print structure, and an internal light source change. The author already makes light shades and wants thickness to become a visual design variable.

This work shares a shape source, physical scale, light vocabulary, evidence cases, and export infrastructure with hikari. It does not force a printed shell, internal lamp, or fabrication settings into hikari's first transparent-solid renderer.

## Why it is a separate study

hikari's first material is a transparent solid viewed mainly under external light. A printed shade is a thin translucent shell viewed primarily by transmitted internal light. Its appearance depends on scattering, layer voids, print direction, wall count, infill, pigment, surface texture, and source distance. Treating it as a slightly rougher glass body would be misleading.

The adjacent study may later send a chosen shell back to hikari for external-light observation, but it has its own material and validation model.

## Reusable geometry

The repository already has the needed geometric starting point:

```text
host shape = shared S1 Ball[] + smooth-union k
uniform shell SDF = abs(hostSdf) - wallThickness / 2
shell SDF → shared marching-tetrahedra mesh builder → STL / OBJ
```

`skin/field.ts` provides the uniform shell construction. `cloud-sculpt/meshExport.ts` provides field meshing, millimetre scaling, saved-mesh topology checks, and STL/OBJ encoding. `foam` is a useful pattern for deriving and exporting a new thin field from the shared host, but its cell walls are not the base shade shell.

## Study stages

### S0 — physical coupon baseline

Print a small thickness series using one known printer, filament/resin, color, nozzle, layer height, wall count, infill, and orientation. Photograph it with a fixed internal source, camera exposure, and white balance. Record both successful and uneven samples.

The initial material profile is empirical:

```ts
type PrintedTranslucentProfile = {
  id: string;
  printer?: string;
  material: string;
  color: string;
  layerHeightMm: number;
  wallCount: number;
  infill: string;
  printOrientation: string;
  transmissionByThickness: { thicknessMm: number; relativeTransmission: number }[];
  approximation: string[];
};
```

Do not assume a generic translucent PLA/PETG/resin curve is transferable to another print setup.

### S1 — uniform shell and fabrication evidence

Input one S1 recipe and expose:

- final longest dimension in millimetres;
- uniform wall thickness in millimetres;
- preview/mesh resolution;
- author-supplied printer minimum-wall warning.

Convert `wallThicknessMm` to shape units once from the same physical scale used for export. Save source recipe/hash, scale, wall thickness, sampling step, final bounds, topology, connected components, and known limits.

The export gate checks saved-mesh watertightness, one connected component when required, and whether the sampling step can resolve the requested wall. It does not guarantee a successful or safe print.

### S2 — internal-light optical sketch

Add one internal source and a simple empirical translucent profile. Start with an omnidirectional bulb-like source and a strip/rectangular LED-like source. Compare a fixed camera and exposure while sweeping wall thickness.

The preview may approximate shell transmission and diffusion from the coupon profile. It must label hot spots, multiple scattering, layer anisotropy, and internal reflections as approximations until measured. Thermal and electrical safety are never inferred from the image.

### S3 — local thickness gesture

After uniform thickness is validated, let the author paint or place local `thin` and `thicken` influences. Use the same gesture/history philosophy as living shape, but store a thickness field separately from the host shape.

Abrupt thickness gradients can self-intersect or disagree with physical wall thickness because the smooth host field is not an exact Euclidean distance everywhere. Show a section/thickness diagnostic and remeasure the exported mesh rather than trusting only the input field.

### S4 — layer and infill families

Add print-orientation and infill appearance only as profile-backed families. Keep shell geometry, optical approximation, and printer settings separate so a visually good result is not presented as fabrication proof.

## Minimal interface

```text
Shape      [load / choose]
Size       [physical dimension]
Wall       [uniform thickness]
Material   [measured profile]
Light      [bulb / strip] [position]
Compare    [thickness A / B]
Inspect    [section / thickness / topology]
Save       [case / STL / OBJ]
```

Local painting, infill, texture, and multiple lights remain hidden until the uniform-thickness comparison is useful.

## Success criteria

- A fixed source/camera comparison clearly shows how wall thickness changes brightness and diffusion.
- Physical size and wall thickness remain exact through save, reopen, and STL export.
- The preview identifies which conclusions come from measured profiles and which are visual approximations.
- Local thickness produces an inspectable field and verified saved mesh rather than only a convincing render.
- Cases record printer/material settings and can be compared with new physical shade photographs.
- No result claims structural, thermal, fire, or electrical safety.
