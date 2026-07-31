# hikari — next implementation plan

Status: planned
UpdatedAt: 2026-08-01

## Design principle

The next step is not broad rendering fidelity. It is one representative transparent-material scene that can be reproduced and compared.

CPU is the reference path for new medium-boundary behavior. The view shader and WebGPU path follow only after reference tests pass. This prevents three implementations from silently disagreeing.

## Phase 0 — freeze evidence before changing optics

Deliverables:

- four baseline cases: clear body, colored shadow, low/high IOR caustic, and current Windows-safe fallback;
- saved shape recipe and mesh for each case;
- complete hikari settings and camera snapshot;
- screenshots and a short observation record;
- current build and public URL recorded by commit.

Acceptance:

- a future build can reopen the same case without relying on browser localStorage;
- each image identifies app version, commit, backend, sample count, and case ID.

## Phase 1 — explicit material model

Replace the water/glass display choice as the material definition with an explicit material record:

```ts
type OpticalMaterial = {
  id: string;
  ior: number;
  absorptionRgb: [number, number, number];
  roughness: number;
};
```

The existing water/glass choices remain presets that populate these values.

Acceptance:

- neutral, amber, and dark transparent presets are reproducible;
- zero absorption is visually neutral;
- doubling path length increases attenuation consistently;
- transparent shadow color uses the same absorption coefficients as the body.

## Phase 2 — one host plus one inclusion

Introduce a small scene model rather than special-casing a second mesh in the shader:

```ts
type Medium = {
  id: string;
  shape: ShapeSource;
  transform: Transform;
  material: OpticalMaterial;
};

type OpticalScene = {
  host: Medium;
  inclusions: Medium[];
  receiver: Receiver;
  light: Light;
};
```

The first implementation is deliberately limited to one outer host and one transformed inclusion.

Ray state must track the current medium. At each boundary it must determine the incident and transmitted IOR, apply Fresnel transmission, and integrate RGB absorption only across segments inside the relevant medium.

Required controls:

- outer and inner material preset;
- outer and inner IOR;
- outer and inner RGB absorption;
- inclusion position, rotation, and scale;
- inclusion visibility;
- boundary/debug view.

Acceptance:

- same IOR + clear inner material behaves as an absorption void with little refractive boundary;
- different IOR produces a visible boundary and background distortion;
- moving the inclusion changes both the camera view and receiver shadow predictably;
- invalid overlap or an inclusion outside the host is reported, not rendered as if valid.

## Phase 3 — shared transparent-shadow throughput

The shadow query and forward optical tracer must use the same medium-transition semantics.

For each finite-light sample:

1. traverse ordered medium boundaries;
2. accumulate path length per medium;
3. multiply Beer–Lambert RGB throughput;
4. multiply interface Fresnel transmission;
5. return RGB throughput and boundary diagnostics.

The focused-light field and transparent shadow remain separate outputs. A caustic must not erase the underlying shadow.

Acceptance:

- disabling focused light leaves the transmitted shadow intact;
- enabling focused light adds energy locally without exposing texture-domain edges;
- CPU reference cases numerically cover air→host→inclusion→host→air;
- shader and WebGPU results stay within documented qualitative tolerances.

## Phase 4 — comparison mode and case export

Add a case export/import surface containing:

- shape recipe and mesh references;
- optical scene and all material values;
- light, receiver, and camera;
- application version and Git commit;
- backend/sample count;
- hashes and mesh measurements;
- selected output images and observation notes.

Then add side-by-side or saved-state A/B comparison. Do not begin with a general preset manager.

## Deferred

- arbitrary nesting depth;
- multiple internal bounces and path tracing;
- spectral rendering beyond the current exploratory bands;
- solved cure-stress birefringence;
- HDRI authoring;
- automated Blender scene generation before the manual protocol is repeated enough to stabilize;
- generic material support outside transparent and translucent media.

## Technical risks

- Nested SDF boundaries can become ambiguous where surfaces intersect or nearly coincide. The first scene must reject invalid containment and use an epsilon policy recorded in tests.
- Equal IOR does not mean equal absorption. Tests must isolate boundary visibility from attenuation.
- The current GPU payload stores only balls and one global IOR. Nested media require a new scene buffer, not an extra uniform patched into the old format.
- Browser GPU timings are observational and device-dependent; they are not acceptance thresholds.
- Blender comparisons validate phenomena and trends, not pixel equality.
