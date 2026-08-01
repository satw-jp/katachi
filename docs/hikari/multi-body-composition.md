# hikari — multiple transparent bodies as a light composition

Status: planned after the single-body optical and placement gates
UpdatedAt: 2026-08-01

## Purpose

Several independent transparent forms can make a relation that a single body cannot: one body divides the incoming light, another receives or bends that divided field again, and their colored shadows and focused-light drawings meet on a floor or wall. The arrangement itself becomes a work.

This is different from a clear inclusion inside a colored host:

- an **inclusion** is a nested medium boundary inside one material body;
- a **body arrangement** is several separate objects divided by air, each with its own pose, scale, material, and optional inclusion.

The two must remain different in the data model and interface. Finishing one host plus one inclusion is still the immediate optical milestone.

## Scene contract after the single-body gate

```ts
type TransparentBody = {
  id: string;
  shapeRevision: string;
  host: Medium;
  inclusions: Medium[];       // initially zero or one
  pose: RigidPose;
  physicalScale: PhysicalScale;
  visible: boolean;
};

type MultiBodyStudy = {
  bodies: TransparentBody[];
  selectedBodyId: string;
  light: Light;
  receivers: Receiver[];
  environment: NaturalLightStudy;
};
```

Each body keeps its internal host/inclusion coordinates local. Whole-body pose and physical scale are independent. The first multi-body release forbids interpenetration between independent bodies; contact and intersecting transparent solids wait for a general medium stack.

## Relations worth studying

| Relation | Variables | Optical question |
|---|---|---|
| sequence along the sun | order, gap, orientation | does the second body sharpen, spread, recolor, or remove what passes through the first? |
| side-by-side pair | spacing, unequal scale, shared/different material | when do two light drawings read separately, touch, or merge? |
| arc or circle | radius, facing direction, count | does the composition form a changing field as the sun and viewpoint move? |
| suspended field | height, depth layers, density | how do overlapping silhouettes differ from actual sequential light transport? |
| family of related forms | shared recipe with small variations | which small shape differences produce a legible rhythm of light? |
| mixed clear/colored bodies | material order and concentration | where is color added, filtered again, or lost? |

Camera overlap alone is not called optical interaction. The Analysis view must distinguish rays that pass through multiple bodies from shadows or silhouettes that only overlap on screen.

## Author-facing workflow

The initial actions stay small:

1. freeze one trusted body;
2. duplicate it or add one other frozen body;
3. move the selected body along the ground or light direction;
4. change gap, order, orientation, or material relation;
5. orbit and move Tokyo time;
6. pause and save when the shared receiver drawing becomes interesting.

`Pair`, `Row`, `Arc`, and `Field` are layout starters only. A saved study contains explicit body records and poses, never just a preset name. Early studies cap the body count so interaction remains immediate; high-count installations may use proxy rendering while moving and refine after pause.

## Transport order

1. Extend the CPU reference tracer from one body's ordered boundaries to all non-intersecting bodies along a ray.
2. Preserve per-segment medium identity and RGB absorption across repeated `air → body → air` transitions.
3. Apply the same traversal to transparent shadow throughput before focused-light accumulation.
4. Add the real-time view approximation, then the WebGPU path, against fixed two-body cases.
5. Increase the author-facing count only after two bodies remain coherent under orbit, Tokyo time, and receiver comparison.

Do not fake multi-body interaction by blending two finished caustic textures. Each receiver contribution must preserve its originating light path, and a ray that actually crosses two bodies must accumulate both interface loss and absorption.

## First fixed cases

- **M1 clear pair:** identical clear bodies side by side; separate, touching, and overlapping receiver drawings.
- **M2 colored sequence:** amber body before clear body, then reversed, with the same sun and receiver.
- **M3 near/far pair:** same bodies at two gaps along the light direction; verify penumbra and concentration change.
- **M4 related family:** two frozen variations from one Katachi recipe; show that a small geometry change remains optically legible.
- **M5 viewpoint ambiguity:** screen silhouettes overlap while light paths do not, proving that Natural and Analysis views tell compatible stories.

Every case stores body IDs, shape revisions, materials, physical scales, poses, pairwise gaps, ordering along the light direction, camera, environment, receiver, and approximation notes.

## Quality gate

- moving one body updates its own appearance and the shared receiver without moving the others;
- reversing two colored/clear bodies changes transport only when the light path crosses both;
- per-body visibility can isolate which body produced a shadow or focused-light region;
- the same arrangement survives save/reopen and Blender reconstruction;
- pairwise gaps and physical dimensions are explicit, not inferred from camera framing;
- invalid body interpenetration is reported instead of rendered as plausible output;
- two-body CPU, realtime, and WebGPU cases agree within documented tolerances;
- interaction remains pleasant with the supported count, and refinement after pause is visible but does not change the physical interpretation.

## Artwork and scale

At object scale, a pair or small family can become a tabletop or floor installation. At furniture scale, separate bodies can establish a field of seats, partitions, or suspended masses. At architectural scale, a row or field may become a canopy or daylight installation. Hikari supplies the light relation and reproducible arrangement; Blender remains the place to finish a specific architectural image, and physical testing remains necessary for fabrication and safety.
