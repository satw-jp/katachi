# hikari — light drawing from the author's trace

Status: core optical quality requirement
UpdatedAt: 2026-08-01

## Author observation

In the selected physical photographs, light runs across the floor or wall like a drawing. The interesting pattern comes from irregularities left by the author's hand—changes in surface, curvature, and thickness. A hard or direct light environment makes the trace legible; a broad or diffuse environment softens or nearly erases it. The current CG study has not yet reached this appearance.

hikari treats this **light drawing** as an output of equal importance to the body itself. It is not a decorative caustic overlay.

## Causal chain

```text
author gesture / making trace
  → real geometric curvature and thickness variation
  → reflected/refracted ray-direction field
  → convergence, folds, lines, and arcs on a receiver
  → clarity controlled by source size, ambient/direct ratio,
    receiver distance/material, absorption, and scattering
```

Every implementation and comparison must preserve this causality. Adding procedural lines to the receiver, moving a fake texture with the object, or changing a pattern independently of geometry fails the requirement.

## Hikari and Blender roles

- **Hikari** is the search instrument: change viewpoint, Tokyo time, source size, receiver distance, material, and a small authored deformation while watching the same geometry-derived line move or soften in realtime. Its validation display keeps focused light inside the reconstructed transparent-shadow support and accumulates a still case progressively rather than inventing new marks each frame.
- **Blender Cycles** is the reference and finishing path: export the identical geometry/material/light case, retain the actual mid-scale surface irregularity, and converge refractive caustics at higher cost for a chosen still or sequence. It is used to decide whether a missing line is a Hikari transport/reconstruction gap or simply absent for that geometry and light.

The two outputs need not match pixel for pixel. They must agree that the mark originates from the same authored curvature/thickness trace, lies in the causally projected shadow region, moves continuously when that trace moves, and becomes less legible as the source broadens.

## Current gap

The current optics tracer can carry broad ball-SDF curvature to receiver hit positions, but several choices prevent it from resolving the author's trace:

- `surfaceVariation` perturbs only the body-view shader normal; CPU/WebGPU focused-light tracing does not see it;
- the smooth ball field has no explicit mid-scale surface/thickness trace comparable to hand forming;
- v0.22.0 carries receiver hits as fixed-domain 512×512 Float32 flux; bilinear deposition and edge-normalized reconstruction preserve integrated flux, and display exposure is no longer normalized to each frame's peak;
- v0.23.0 derives unobstructed baseline coverage and refracted RGB deposits from the same seeded aperture/sun-disk sample, replaces rather than adds direct light in Natural, and enforces shadow support on the transport field before display;
- the reconstruction footprint now adapts only to emitted sample count, from 3 to 12 texels, to suppress low-sample point gaps. It is still not derived from finite-source geometry, local ray density, a ray-bundle Jacobian, or a physical point-spread function;
- decorative ellipses and spectral styling remain available only in Analysis; the Natural validation field uses one undivided RGB deposit per traced path;
- there is no progressive convergence accumulation, and the shared shape still lacks an authored mid-scale surface/thickness trace.

These effects may remain useful as exploratory display modes, but they cannot be the validation path for light drawing.

## Geometry contract

The trace must be part of the shared `ShapeSource` distance/normal query used by CPU, view shader, and WebGPU. Start with a controlled band-limited bulge or recorded local gesture whose physical amplitude and width are saved. Later inputs can include hand-shaped meshes, scans, or a surface-displacement field.

Do not call shader-only normal noise a making trace. Preserve mid-scale irregularity through freezing, meshing, scale changes, and Blender export; do not smooth it away merely to make a generic glass surface.

The first procedural trace is deterministic and author-selectable rather than freshly random every frame. Save `seed`, physical amplitude, feature width, continuity, directionality, density, smoothing, and a world/object-space mask in `.hkr`. The author may reroll the seed, tune the parameters, then freeze a favored trace. Hikari's shared shape query and Blender export must derive from that same frozen field; the finishing export should bake it as real displaced geometry or an equivalently tessellated mesh, because a view-only bump/normal map cannot preserve thickness, silhouette, and focal distance as a reliable optical reference.

## Focused-light reference path

1. Fix one receiver plane and world-space domain across cases.
2. Deposit each real receiver hit once into a floating-point monochrome/HDR field with shared Fresnel and RGB Beer–Lambert throughput.
3. Remove decorative deposits, spectral offsets, adaptive reframing, and per-frame maximum normalization from the reference mode.
4. Use a deterministic 2D source sampler and estimate the local receiver-mapping area/Jacobian from neighbouring rays. Energy concentration follows convergence rather than an invented point sprite.
5. Derive the splat footprint from receiver texel size and finite source angle/area. Integrate multiple source directions so a larger source physically softens the same line.
6. Accumulate progressively while shape, source, and receiver are still; reset accumulation on any relevant change.
7. Port the passing CPU reference to WebGPU. Natural tone-maps the same HDR field; Analysis can show raw endpoint density, log irradiance, and convergence diagnostics.

Transparent shadow and focused light stay separately inspectable diagnostics, but Natural composes them from one receiver transport result and one energy ledger. A weak or blurred light drawing never causes the shadow to disappear, become a substitute pattern, or detach from the author-facing shadow support.

## First cases

| Case | Fixed | Change | Required observation |
|---|---|---|---|
| LD0 symmetric lens | receiver/source/material | sample count | stable centroid and symmetry as samples increase |
| LD1 one authored bulge | base form/source/receiver | bulge off/on | one local line or arc appears or moves because of geometry |
| LD2 light size | LD1 | 0.5° / 5° / 20° or equivalent area sizes | peak/contrast falls monotonically while total transmission remains comparable |
| LD3 gesture movement | LD1 | move the bulge slightly | the receiver line moves continuously, without random re-layout |
| LD4 receiver distance | LD1 | near/mid/far | position and spread change in fixed world coordinates |
| LD5 physical references | chosen R04/R06 | photographed light condition | compare arc/cusp presence, direction, and sharp/soft tendency; not pixels |

Keep the current fixed 512×512 receiver field for the reference cases. Use 16k–64k deterministic WebGPU samples and the converged CPU-safe cap for cross-checks; progressive accumulation remains a later GPU quality mode. The minimum geometric feature width must remain larger than normal/march epsilon; otherwise aliasing can invent light lines.

## Natural-view experience

The author should be able to:

1. move around the body and notice a light line on the floor or wall;
2. make one local bend, inflate, or pinch gesture;
3. see the light drawing move with it;
4. switch from hard West light to a broad area source and watch the trace soften;
5. pause and save body, trace, light, receiver, and view as one observation.

Analysis explains why; it is not required to enjoy the result.

## Completion gate

- Flattening/removing the authored irregularity removes or predictably changes its light drawing.
- Source enlargement softens the same geometry-derived line without replacing it with a different procedural pattern.
- A still case converges rather than sparkling or changing from random reseeding.
- CPU and WebGPU agree on the qualitative fold/line position and source-size response.
- The receiver material changes readability, not the traced ray endpoints.
- At least one selected physical image and one Blender case record the current gap and the next single-variable comparison.
