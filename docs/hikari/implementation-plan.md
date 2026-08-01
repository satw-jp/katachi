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
  absorptionPerMm: [number, number, number];
  roughness: number;
};
```

The existing water/glass choices remain presets that populate these values.

Acceptance:

- neutral, amber, and dark transparent presets are reproducible;
- zero absorption is visually neutral;
- doubling path length increases attenuation consistently;
- transparent shadow color uses the same absorption coefficients as the body.

Add one authoritative `PhysicalScale.mmPerShapeUnit`. Every backend integrates `absorptionPerMm * segmentLengthShapeUnits * mmPerShapeUnit`. Keep world/SDF coordinates numerically normalized; do not enlarge the raymarch domain to architectural metre values.

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
  physicalScale: PhysicalScale;
  objectPose: RigidPose;
  host: Medium;
  inclusions: Medium[];
  receiver: Receiver;
  light: Light;
};
```

The first implementation is deliberately limited to one outer host and one transformed inclusion.

`ShapeSource` and every medium transform are local to the object. `physicalScale` gives the one shape-unit-to-millimetre conversion. `objectPose` moves and rotates the complete host/inclusion assembly in world space and begins as identity; it does not provide a second hidden scale. It is serialized now but has no placement UI before the optical quality gate. Rotation is stored as a quaternion.

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

### Phase 2b — one or many generated inclusions

After the one-sphere boundary sequence passes, follow [one or many transparent inclusions](inclusion-family.md). Generalize the scene from one clear region to a deterministic, seed-based set whose count, shape family, size variation, and placement can change without losing reproducibility.

Begin with several non-overlapping analytic spheres, then soft-union clusters and frozen Katachi-derived inclusion shapes. Enforce minimum host wall and inclusion gap in physical units. A requested random arrangement that cannot fit reports the failed count; it never makes the host wall thinner or leaves an invalid medium scene.

This remains ahead of arbitrary whole-object arrangement: several inclusions inside one host and several independent bodies separated by air are different optical problems and different authoring actions.

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

In the same phase, establish the reference path in [light drawing from the author's trace](light-drawing.md). The first gate is one controlled real surface bulge moving one receiver line. Remove decorative deposit/normalization behavior from the validation mode before increasing caustic spectacle.

## Phase 4 — Tokyo natural light, rooms, and receiver materials

Make the visible surroundings, simple room geometry, openings, and receiving surfaces part of the optical scene before declaring the transparent body complete. Follow [natural-light environments and receiver materials](lighting-environment.md).

First migrate the existing outdoor view to a deterministic Tokyo date/time and shared sun direction. Then add a simple room with one real rectangular opening, multiple independent windows on the same wall, and finally any combination across the four wall faces. Window count, width/height proportion, sill height, horizontal position, and spacing must change real portal geometry. Room width, depth, ceiling height, opening records, body pose, and the derived body-to-window distance use the same `PhysicalScale` contract as optical absorption. Before the quality gate, the only author-facing whole-body motion is nearer to or farther from the opening; general height/orientation and grounded/floating placement remain Phase 8 work.

Time playback lowers receiver samples while moving and refines after pause. It never blends focused-light accumulation from different moments. The first room transports direct sun through openings and uses a documented sky approximation; it does not claim indirect room bounce, real weather, glazing, or calibrated illuminance.

Add the [abstract receiver surface](receiver-surface.md) without changing optical ray endpoints. The author's area-light Blender scene remains a controlled source-size validation, not the primary hikari lighting model. General artificial-light authoring is deferred.

End the phase with a paired small-unlit-room case: identical exposure and environment, first without and then with the transparent body. Compare floor/wall light distribution, concentrated and darkened regions, chromatic change, and relative received energy. This determines whether the form acts as a useful daylight-redirecting device without pretending that it generates light.

## Phase 5 — transparent-material quality gate

“Complete” is an author-approved experience threshold, not a claim of physically perfect rendering. The gate passes only when all of these remain coherent while the camera moves:

- silhouette, front/back boundaries, reflection, refraction, and background distortion;
- thickness-dependent RGB absorption for clear, colored, and dark transparent hosts;
- equal-IOR and different-IOR host/inclusion relationships;
- surface roughness and highlights without hiding the interior;
- colored transparent shadow and focused light as distinct phenomena;
- one authored surface/thickness trace producing a stable line or arc on the receiver, with source size controlling clarity;
- continuous Tokyo date/time motion in open air and through one recorded room opening;
- explicit room width, depth, ceiling height, window count/proportion/size/position/height/spacing, and object-to-window relation;
- a same-exposure body/no-body room comparison that reports redistribution and loss as well as concentration;
- stable interaction without holes, flicker, invalid normals, or plausible-looking output from an invalid scene;
- CPU reference, real-time shader, and WebGPU behavior within documented tolerances, with a safe fallback;
- accepted M4–M6 and M9–M12 Blender comparisons and selected physical reference observations.

The Primary and author review the Natural view first. Numeric tests and Analysis views can explain a failure but cannot pass a visually unconvincing result.

## Phase 6 — capture an interesting state, then compare

Case export/import begins as `save this view`, not as a general preset manager. The primary action captures a promising observation; comparison and evidence fields expand when that state is selected for Blender or physical validation.

Add a case export/import surface containing:

- shape recipe and mesh references;
- optical scene and all material values;
- geographic place, UTC instant, playback state, room/opening geometry, body pose, light, receiver, and camera;
- application version and Git commit;
- backend/sample count;
- hashes and mesh measurements;
- selected output images and observation notes.

Then add side-by-side or saved-state A/B comparison. Do not begin with a general preset manager.

## Phase 7 — living shape and freeze

After the transparent-material quality gate, follow the staged plan in [living shape and freeze workflow](living-shape.md): frozen MPM bridge, shared S1-scale Sculpt controls, live Cloud, live Sag preview, and only then a continuous MPM surface if the proxy is insufficient.

The central gate is not that simulation runs. It is that the author can watch optical appearance change, pause immediately, and save the exact visible form as a reproducible `FrozenShape`.

## Phase 8 — whole-object placement study

Begin only after Phase 5 passes and a selected form can be frozen. Keep four coordinate concerns separate:

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

## Phase 9 — physical scale and spatial context

Follow [physical scale and spatial context](scale-context.md). Begin with a single selected form and one authoritative physical dimension. Compare hand/object, furniture/sofa, and spatial/roof scales without changing normalized SDF coordinates.

Offer two explicitly different studies:

- **same material:** keep `absorptionPerMm` and IOR fixed, so a larger body naturally becomes denser and darker;
- **match appearance:** reduce effective absorption as scale grows to preserve optical depth, while stating that this is a different material concentration.

Start with a simple context card for each scale. The architectural case is one transparent roof or canopy above a minimal room receiver, used to study the light environment below. It is not a general building modeller.

Acceptance:

- numeric cases prove that log-transmission scales with physical path length in same-material mode;
- match-appearance mode preserves transmission while recording its concentration adjustment;
- camera framing changes independently from physical dimensions;
- a sofa-size body and roof-size body restore exact units, material mode, environment, and receiver;
- the roof case shows transmitted color, shadow, and focused-light distribution inside the simple context.

## Phase 10 — multiple transparent bodies

After one selected body passes the optical, placement, and scale gates, follow [multiple transparent bodies as a light composition](multi-body-composition.md). This is not arbitrary scene layout. It studies how several independent bodies separated by air divide, filter, redirect, and recombine the same natural light.

Begin with two non-intersecting bodies and one shared receiver. Extend the CPU reference to repeated `air → body → air` intervals before connecting the realtime and WebGPU paths. Pair, Row, Arc, and Field may seed arrangements, but saved scenes contain explicit body identities, shape revisions, materials, physical scales, and poses.

Acceptance:

- a two-body ray accumulates both bodies' interfaces and RGB absorption in order;
- side-by-side receiver drawings can be isolated by body and then read together;
- reversing a colored/clear sequence has an explainable result;
- screen-space overlap is distinguishable from a ray that actually traverses both bodies;
- invalid interpenetration is reported until a general medium stack exists;
- the arrangement restores exactly in hikari and can be reconstructed in Blender.

## Deferred

- arbitrary nesting depth;
- multiple internal bounces and path tracing;
- spectral rendering beyond the current exploratory bands;
- solved cure-stress birefringence;
- HDRI authoring;
- automated Blender scene generation before the manual protocol is repeated enough to stabilize;
- a generic shape editor inside hikari; initial variation comes from the live Katachi field and its existing small edits;
- shot sequencing, keyframed cameras, and final-render controls;
- general room planning, collision response, and support analysis;
- non-uniform whole-object scale and transform hierarchies;
- generic material support outside transparent and translucent media.

## Technical risks

- Nested SDF boundaries can become ambiguous where surfaces intersect or nearly coincide. The first scene must reject invalid containment and use an epsilon policy recorded in tests.
- Equal IOR does not mean equal absorption. Tests must isolate boundary visibility from attenuation.
- The current GPU payload stores only balls and one global IOR. Nested media require a new scene buffer, not an extra uniform patched into the old format.
- Browser GPU timings are observational and device-dependent; they are not acceptance thresholds.
- Blender comparisons validate phenomena and trends, not pixel equality.

## Adjacent study, not on the core critical path

The [printed translucent light-shade study](printed-translucent-shell.md) reuses the selected shape, physical scale, evidence cases, and mesh export, but keeps shell thickness, internal light, print profiles, and fabrication diagnostics outside the first hikari milestone. It may begin with physical coupons and uniform-shell geometry without delaying transparent-solid optics.
