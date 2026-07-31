# hikari — living shape and freeze workflow

Status: planned after optical quality gate
UpdatedAt: 2026-08-01

## Purpose

hikari should make time part of forming: a transparent body slowly changes, its interior, shadow, and focused light change with it, and the author stops at a beautiful moment. Stopping is not an interruption. It is the transition from observation to a shape decision.

```text
shape slowly changes
  → optical appearance changes
  → author pauses at "this moment"
  → exact state is captured
  → refine, place, export, or continue
```

This is not a general animation system and not a promise of resin-flow prediction. It is a way to discover forms through visible change.

## Families of forming

1. **Sculpt:** the small S1 vocabulary—add, remove, move, and resize a ball, plus smooth-union strength—inside the shared Katachi shape source.
2. **Cloud:** deterministic slow growth, drift, separation, and fusion. It is a procedural forming behavior, not physical simulation.
3. **Sag:** a slime-like slow gravity/viscosity flow based on the existing MPM study. It stretches, pools, and approaches separation, but is not calibrated resin viscosity, wetting, surface tension, or curing.
4. **Branch:** slime-mold-like searching, gathering, connection, and branching. It uses a growth/colonization driver, not the Sag material simulation.
5. **Ferment:** seeded internal expansion and bubble/cell growth inspired by yeast fermentation. It begins as deterministic nucleation and growth, not biological or pressure-calibrated prediction.

These phenomena do not share one false universal physics model. They share input gestures, time control, snapshots, diagnostics, and freeze semantics. The default surface shows mode, start/pause, one speed control, reset, and save this shape. Raw driver parameters remain behind an Analysis surface or a later advanced study.

## The author's hand inside a phenomenon

Natural change and intentional editing happen in the same run. The author places a local influence rather than specifying the final surface:

- **bend:** give a selected region a direction;
- **inflate:** place growth or outward pressure;
- **pinch:** place contraction or a neck;
- **attract:** invite material or a growing branch toward a region;
- **repel:** protect an empty region or redirect growth.

The same gesture vocabulary is recorded across drivers, but each driver declares which gestures it supports. An unsupported gesture returns a visible diagnostic instead of silently doing nothing or changing its meaning.

```ts
type ShapeGesture = {
  id: string;
  kind: "bend" | "inflate" | "pinch" | "attract" | "repel";
  center: Vec3;
  radius: number;
  strength: number;
  direction?: Vec3;
  appliedAtStep: number;
};
```

The gesture log and final frozen geometry are both saved. Replay explains how a form emerged; the frozen geometry guarantees what was chosen.

## Existing MPM assets

The repository already contains useful, separate pieces:

- deterministic CPU MLS-MPM as the reference implementation;
- a WebGPU port with CPU fallback;
- deterministic seeding from S1 `Ball[]`;
- explicit accumulated-step history;
- a freeze operation that records its resulting `Ball[]` rather than assuming a later simulation replay will match;
- export of the frozen result back to an S1 recipe.

The current MPM renderer displays particles, while hikari's transparent body raymarches a smooth ball SDF. `freezeParticlesToBalls()` is deliberately coarse and can lose small regions or change topology. It is suitable as the first stopped-shape bridge, but repeatedly using it every render frame would make a refractive boundary jump or flicker.

## Adapter boundary

Do not import the MPM page, controls, or point renderer into hikari. Introduce a shape-driver boundary:

```ts
type DeformationFrame = {
  step: number;
  simulationTime: number;
  preview: ShapeSource;
  backend: "cpu" | "webgpu";
  approximation: string[];
};

type FrozenShape = {
  shape: ShapeSource;
  sourceMode: "sculpt" | "cloud" | "sag";
  seedId: string;
  step: number;
  simulationTime: number;
  parameters: unknown;
  sourceHash: string;
};

interface ShapeDriver {
  seed(source: ShapeSource): void;
  apply(gesture: ShapeGesture): DriverDiagnostic;
  advance(steps: number): void;
  preview(): DeformationFrame;
  freeze(): FrozenShape;
  reset(): void;
}
```

Simulation time, optical rendering, and display refresh run at separate rates. During movement, hikari may use fewer optical samples and a 5–10 Hz shape proxy; after pause it refines the full Natural view. The saved state always contains the frozen shape, not only a seed and elapsed time.

## Implementation stages

### L0 — protect the static optical quality gate

Complete materials, nested media, transparent shadow, focused light, environments, and receiver consistency before integrating moving geometry. Save representative static cases so later motion cannot hide regressions.

### L1 — frozen MPM bridge

Bundle an existing MPM recipe, explicit frozen S1 shape, and hikari optical case. Import the frozen shape into hikari without live simulation. This proves replay, coordinate, ground, and authorship semantics with minimal new rendering work.

### L2 — guided Sculpt inside the shared source

Expose S1-scale edits in hikari without copying its field or history implementation. First implement bend, inflate, pinch, attract, and repel as deterministic local edits over selected ball groups. Do not label a direct displacement as physical bending. Each gesture updates the body, transparent shadow, and focused light; undo and save remain compatible with Katachi.

### L3 — live Cloud

Add a cheap deterministic driver over the smooth ball field. Prioritize continuous silhouette and optical legibility over complex motion. This proves play, pause, reset, preview quality, and exact capture before combining two GPU-heavy systems.

### L4 — live Sag preview

Adapt the existing CPU-reference/WebGPU-fallback MPM core behind `ShapeDriver`. Begin with a low-frequency ball proxy while moving and full refinement after pause. Record actual frozen geometry because GPU runs are not treated as bit-identical across devices.

### L5 — Branch exploration

Extract deterministic direction, cohesion, spatial search, and candidate-growth ideas from the existing interior-growth study without importing its fabrication constraints or build-axis assumptions. Convert its units through an explicit branch `ShapeSource` adapter.

### L6 — Ferment exploration

Add deterministic nucleation, radius growth, and merge policy. Reuse smooth fields and foam-derived display ideas where useful, while stating that the existing foam study is not a fermentation simulation. Multiple internal bubbles wait until nested-medium ordering and containment safely support them.

### L7 — continuous MPM surface only if required

If the proxy boundary remains visibly stepped or flickers, create a particle-density SDF or reconstructed-surface `ShapeSource`. This is a separate rendering project, not a small change to `freezeParticlesToBalls()`.

### L8 — host/inclusion motion

First move only the host while the inclusion remains explicitly bound in object-local space. Pause and report invalid containment instead of clipping it silently. More expressive follow, attached, or world-locked inclusion behavior comes only after the single moving boundary is stable.

## Pause and choose

Pause is immediate and reversible. After pausing, offer:

```text
[Save this observation] [Choose this shape] [Continue] [Reset]
```

- **Save this observation** keeps shape, optics, view, light, environment, floor, motion mode, and time.
- **Choose this shape** creates an immutable `FrozenShape` that can be placed, exported, or refined.
- **Continue** resumes from the complete simulation state.
- **Reset** returns to the recorded seed.

The screen shown at the instant of choosing must match the captured shape. If a coarse conversion changes the form, show the refined frozen result before confirmation.

## Success criteria

- The change is slow enough to read shape, refraction, colored shadow, and focused light together.
- Natural remains enjoyable with only mode, play/pause, speed, and save visible.
- Pausing never advances the simulation while awaiting GPU readback.
- A chosen shape reopens independently of runtime backend and local storage.
- CPU replay is deterministic for fixed cases; GPU provenance is recorded without claiming bit equality.
- The MPM ground offset does not leak into receiver or later placement coordinates.
- A frozen form can proceed to whole-object placement, Blender, and physical study without manual reconstruction.
