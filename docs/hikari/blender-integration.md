# hikari ↔ Blender integration design

Status: bundle v2 and bootstrap in implementation
UpdatedAt: 2026-08-01

## Division of work

hikari is the live instrument: orbit freely, move Tokyo time, alter a form or material relation, and stop when an optical event becomes interesting. Blender is the selected-shot workshop: rebuild one saved state, test a more expensive transport model, and make a still or film without turning hikari into a general DCC application.

The handoff is therefore a reproducible case, not only a mesh. A visually pleasing Blender file with unknown scale, axes, light, or material mapping is a reference; it is not a comparison result.

## What exists now

- Hikari case JSON records the shape recipe, complete Hikari settings, camera, backend, version, and observation.
- OBJ/STL export records selected physical size, triangle count, bounds, and watertightness.
- `hikari-blender-study` v2 carries the case identity, mesh hashes, author scale, host/inclusion optical media, receiver, sun vector and angular diameter, camera, environment assumptions, and explicit approximations.
- The Hikari panel can produce the case, recipe, OBJ, STL, and Blender study sidecar with one action.
- `tools/blender/import_hikari_study.py` is the deterministic Blender bootstrap. Artistic refinement stays after import.

The runtime still has one analytic spherical inclusion. The sidecar already permits an inclusion array, but generic multiple-inclusion export is not declared complete until every inclusion has either a deterministic analytic reconstruction or an independently watertight primary mesh.

## Bundle v2

All files use one sanitized case ID:

```text
<case-id>.hikari-case.json
<case-id>.blender-study.json
<case-id>.recipe.json
<case-id>.obj
<case-id>.stl
```

The OBJ is the primary host geometry. STL is a dimension/topology check and must not be imported as a second render object. Each mesh asset records `mediumId`, `purpose`, role, format, SHA-256, and whether its vertices are `medium-local` or already in `hikari-world` space. Current exports are medium-local and receive the declared medium pose exactly once. A future zip container may preserve this exact logical layout; zip is transport, not the data model.

The selected longest edge is an author decision. For the first appearance-matched transfer, Hikari's per-shape-unit absorption is converted to inverse millimetres at that selected scale. It is explicitly not a measured resin coefficient. Later scale studies keep two named branches:

1. **same material** — hold inverse-mm coefficients fixed and allow a larger body to become optically denser;
2. **match appearance** — compensate concentration to preserve optical depth at the new size.

## Coordinate and unit contract

Hikari and Blender do not share an up axis.

| Meaning | Hikari | Blender target |
|---|---|---|
| handedness | right-handed | right-handed |
| up | +Y | +Z |
| north | -Z | +Y after mapping |
| point/vector mapping | `(x, y, z)` | `(x, -z, y)` |

The row-major source-to-target matrix is:

```text
[ 1  0  0 ]
[ 0  0 -1 ]
[ 0  1  0 ]
```

The raw OBJ remains Y-up. Blender imports it below a deterministic root transform using this matrix. The same transform applies to host/inclusion pose, camera position and target, receiver position and normal, sun propagation direction, window wall directions, and later animation channels. Captured vertical FOV and viewport aspect set Blender's camera and render frame together. Never rotate the mesh alone and then repair the camera by eye.

Mesh coordinates are already millimetres. Analytic poses and the saved camera remain in Hikari shape units and are multiplied by `physicalScale.mmPerShapeUnit` before or as part of the root mapping. Blender scene units are set so dimensions read in millimetres.

## Material transfer

The baseline Blender material is intentionally plain:

- surface transmission 1;
- Hikari IOR copied directly;
- roughness copied directly;
- RGB `absorptionPerMm` mapped to volume absorption with the exact conversion recorded;
- no decorative surface texture unless the case explicitly carries one.

Three different inclusion cases must stay distinct:

1. **Equal IOR, lower absorption:** conceptually one continuous optical volume with a concentration void. A volume mask or boolean cavity experiment is safer than assuming two overlapping solids create no interface.
2. **Different IOR:** a real inner boundary. Compare a boolean cavity plus inner body against Blender's nested-volume behavior and record which construction was used.
3. **Multiple inclusions:** begin with separated, contained media keyed by `mediumId`; do not support merging/intersection implicitly.

The current selected Blender reference file uses Cycles, AgX, high transmission bounces, a purple Volume Absorption material, and an object-coordinate clear-region mask. It is useful evidence for equal-IOR absorption variation and area-light response. It is not yet evidence for a separate refractive inner body or a daylight room.

## Natural light and rooms

Blender consumes Hikari's resolved solar vector; it does not independently recalculate Tokyo astronomy. The Sun angle receives the recorded angular diameter. This keeps both tools on the same time and direction while still allowing Blender to add expensive bounce lighting.

Comparisons produce at least two Blender passes:

- **direct-only diagnostic**, comparable to Hikari's first room/window transport;
- **final Cycles**, including the selected world and room bounce.

Room dimensions and every window become real millimetre geometry. Multiple windows on one wall remain separate aperture records. The first importer may build walls from pieces around rectangles; later boolean construction is acceptable if the resulting openings and normals remain deterministic. Hikari's direct-only result and Blender's global illumination must not be presented as equivalent.

## Pigment and authored traces

The `PigmentField` recipe remains object-local and physical-scale aware. Uniform, diffused, pooled, and streaked modes can become a generated Blender node group for exploration. Exact cross-renderer validation uses a baked 3D concentration field (3D LUT/VDB or equivalent), because CPU integer noise, WebGL, WGSL, and Blender noise are not guaranteed to match point by point.

`hand-trace` is not serialized as a large shader uniform. It becomes a curve or baked volume asset. This is the route for the author's hand disturbance to remain a material trace that sharpens or softens under different light, rather than becoming a screen-space texture.

## Animation handoff

The first animation tracks are cheap and deterministic:

- camera and target;
- whole-object pose;
- Tokyo clock / sun direction;
- room and window state changes only at explicit keys.

Living topology is treated differently:

- first, export a chosen frozen moment;
- for short diagnostic changes, use a bounded Alembic/USD/VDB sequence;
- for a finished film, let Blender refine timing and interpolation after the selected Hikari states are locked.

Per-frame OBJ downloads are not the animation architecture. Pigment `frozenRevision`, shape revision, and case ID must identify the exact state shown at every authored stop.

## Return path from Blender

Blender writes `blender-result.json` rather than silently changing the Hikari case. It records:

- source case ID, source commit, sidecar hash, and actual imported dimensions/transforms;
- Blender version, renderer, device, samples, bounces, denoise, color management, and timing;
- the actual material-node mapping and nested-volume construction;
- render filenames and hashes;
- unsupported items, approximations, and manual edits.

An optional `hikari-patch.json` contains only values Hikari understands: camera, pose, material coefficients, light/time, receiver, and environment parameters. Blender-only nodes, compositor work, sculpting, and grading return as observations or references, never as opaque Hikari state.

## Comparison gates

| Gate | Comparison |
|---|---|
| G0 | dimensions, axes, floor side, silhouette |
| G1 | camera framing and target |
| G2 | clear host, IOR, background distortion |
| G3 | colored absorption versus path length |
| G4 | equal-IOR and different-IOR inclusion behavior |
| G5 | transparent shadow and focused light versus source size |
| G6 | pigment concentration field and hand trace |
| G7 | Tokyo sun and window clipping, direct-only |
| G8 | room indirect light separated from direct transport |
| G9 | camera/time/shape animation continuity |

Each gate uses the same case and exposure for a Hikari image, Blender direct-only image, and Blender final image. The decision is `keep`, `revise`, or `investigate`; pixel identity is not the goal.

## Automation boundary

Automate now:

- bundle and hashes;
- units and coordinate mapping;
- host mesh, one analytic sphere inclusion, receiver, camera, sun;
- baseline Cycles/AgX material and render settings;
- fixed-frame render and result manifest;
- later, deterministic room/window geometry and contact sheets.

Keep as author judgment:

- the pleasing viewpoint and moment;
- nested-volume artifact assessment;
- node refinement for the hand-made light drawing;
- room material and global-illumination choices;
- compositor, hero image, and film timing.

This boundary preserves hikari's strength: it stays quick enough to play with, while Blender receives enough truth to make a chosen image deliberately.
