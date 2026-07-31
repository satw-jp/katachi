# hikari — next implementation plan

Status: planned
UpdatedAt: 2026-08-01

## Design principle

The next step is not broad rendering fidelity or a finished beauty render. It is a responsive material-sketching space: move around a transparent form, make one small change, and see a meaningful optical consequence.

CPU is the reference path for new medium-boundary behavior. The view shader and WebGPU path follow only after reference tests pass. This prevents three implementations from silently disagreeing.

Reproducibility serves exploration. It captures a discovery for Blender or physical work, but ordinary looking, orbiting, and trying variations must not become a case-management task.

The roadmap has one hard order: finish the transparent-material experience first, then add whole-object placement. Placement data is reserved in the scene contract now, but placement controls do not compete with optical work before the quality gate passes.

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
  objectPose: Transform;
  host: Medium;
  inclusions: Medium[];
  receiver: Receiver;
  light: Light;
};
```

The first implementation is deliberately limited to one outer host and one transformed inclusion.

`ShapeSource` and every medium transform are local to the object. `objectPose` moves the complete host/inclusion assembly in world space and begins as identity. It is serialized now but has no placement UI before the optical quality gate. Rotation is stored as a quaternion and scale remains uniform so SDF distance and normal behavior stay well-defined.

Ray state must track the current medium. At each boundary it must determine the incident and transmitted IOR, apply Fresnel transmission, and integrate RGB absorption only across segments inside the relevant medium.

Required controls:

- outer and inner material preset;
- outer and inner IOR;
- outer and inner RGB absorption;
- inclusion position, rotation, and scale;
- inclusion visibility;
- boundary/debug view.

Interaction requirements:

- Natural keeps direct orbit, pan, and zoom available;
- inclusion transforms update during interaction, with refinement allowed after input settles;
- the first controls read as a relationship—outer colored resin and inner clear resin—before exposing raw optical coefficients;
- the first exploration prompts are `walk around it`, `move the inclusion`, and `change the host color`;
- boundary/debug views are opt-in and never replace Natural automatically.

Acceptance:

- same IOR + clear inner material behaves as an absorption void with little refractive boundary;
- different IOR produces a visible boundary and background distortion;
- moving the inclusion changes both the camera view and receiver shadow predictably;
- invalid overlap or an inclusion outside the host is reported, not rendered as if valid;
- changing viewpoint, host color, or inclusion position produces a visually attributable change rather than only a changed number;
- returning to a saved view restores its camera and optical scene.

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

## Phase 4 — transparent-material quality gate

“Complete” is an author-approved experience threshold, not a claim of physically perfect rendering. The gate passes only when all of these remain coherent while the camera moves:

- silhouette, front/back boundaries, reflection, refraction, and background distortion;
- thickness-dependent RGB absorption for clear, colored, and dark transparent hosts;
- equal-IOR and different-IOR host/inclusion relationships;
- surface roughness and highlights without hiding the interior;
- colored transparent shadow and focused light as distinct phenomena;
- stable interaction without holes, flicker, invalid normals, or plausible-looking output from an invalid scene;
- CPU reference, real-time shader, and WebGPU behavior within documented tolerances, with a safe fallback;
- accepted M4–M6 Blender comparisons and selected physical reference observations.

The Primary and author review the Natural view first. Numeric tests and Analysis views can explain a failure but cannot pass a visually unconvincing result.

## Phase 5 — capture an interesting state, then compare

Case export/import begins as `save this view`, not as a general preset manager. The primary action captures a promising observation; comparison and evidence fields expand when that state is selected for Blender or physical validation.

Add a case export/import surface containing:

- shape recipe and mesh references;
- optical scene and all material values;
- light, receiver, and camera;
- application version and Git commit;
- backend/sample count;
- hashes and mesh measurements;
- selected output images and observation notes.

Then add side-by-side or saved-state A/B comparison. Do not begin with a general preset manager.

## Phase 6 — whole-object placement study

Begin only after Phase 4 passes. Keep four coordinate concerns separate:

1. source shape in object-local coordinates;
2. host and inclusion transforms local to the object;
3. whole-object pose in world coordinates;
4. camera, light, optical receiver, and ground reference in world coordinates.

First release:

- move the complete object along the ground normal using a height control;
- rotate it with an author-friendly yaw/pitch/roll UI while storing a quaternion;
- reset to the saved pose;
- switch between `resting` and `free` placement intent;
- show ground clearance and object dimensions in millimetres;
- update body rendering, shadow, focused light, camera framing, and case export from the same pose.

`Receiver` remains the optical surface that receives shadow and light. A separate `GroundReference` expresses visual/support intent; it does not claim structural support. `resting` initially aligns the transformed lower bound to the ground plane, while `free` preserves the authored height.

Acceptance:

- a resting object reads as deliberately installed on the ground, without visible penetration or a stale shadow;
- a free object can be lifted and reoriented as a furniture or spatial-object study;
- host/inclusion relations remain unchanged under the whole-object pose;
- saved cases and Blender exports reproduce the pose and ground relation;
- changing placement does not alter the material parameters or hide optical-quality regressions.

Room layout, collision, structural support, non-uniform scale, parent hierarchies, and multiple-object placement remain outside this phase.

## Deferred

- arbitrary nesting depth;
- multiple internal bounces and path tracing;
- spectral rendering beyond the current exploratory bands;
- solved cure-stress birefringence;
- HDRI authoring;
- automated Blender scene generation before the manual protocol is repeated enough to stabilize;
- a generic shape editor inside hikari; initial variation comes from the live Katachi field and its existing small edits;
- shot sequencing, keyframed cameras, and final-render controls;
- room planning, collision, support analysis, and multiple-object arrangement;
- non-uniform whole-object scale and transform hierarchies;
- generic material support outside transparent and translucent media.

## Technical risks

- Nested SDF boundaries can become ambiguous where surfaces intersect or nearly coincide. The first scene must reject invalid containment and use an epsilon policy recorded in tests.
- Equal IOR does not mean equal absorption. Tests must isolate boundary visibility from attenuation.
- The current GPU payload stores only balls and one global IOR. Nested media require a new scene buffer, not an extra uniform patched into the old format.
- Browser GPU timings are observational and device-dependent; they are not acceptance thresholds.
- Blender comparisons validate phenomena and trends, not pixel equality.
