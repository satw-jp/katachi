# hikari — next implementation plan

Status: active — Phase 3A complete; 3B/3C partial; 3D implemented; 3E partial
UpdatedAt: 2026-08-01

## Design principle

The next step is not broad rendering fidelity or a finished beauty render. It is a responsive material-sketching space: move around a transparent form, make one small change, and see a meaningful optical consequence.

CPU is the reference path for new medium-boundary behavior. The view shader and WebGPU path follow only after reference tests pass. This prevents three implementations from silently disagreeing.

Reproducibility serves exploration. It captures a discovery for Blender or physical work, but ordinary looking, orbiting, and trying variations must not become a case-management task.

The roadmap has one hard order: finish the transparent-material experience first, then add whole-object placement. Placement data is reserved in the scene contract now, but placement controls do not compete with optical work before the quality gate passes.

## 2026-08-01 plan review — optical coherence is the blocking gate

The author observed a detached bright region outside the visible transparent shadow. This is not accepted as an artistic approximation. v0.21.1 removed the `0.223` shape-unit receiver-plane disagreement and invalid TIR deposits. v0.22.0 replaced adaptive bounds and peak-normalized 8-bit display data with a fixed-domain Float32 flux field. v0.23.0 completes the first paired composition: one seeded aperture/sun-disk sample records both its unobstructed baseline and refracted RGB deposit, Natural subtracts the former before adding the latter, and support containment is applied to transport data rather than as a second shader effect.

This changes the critical path. The following gate blocks room rendering, living shape, whole-object placement, physical scale, multiple bodies, and Ambient Mix:

1. one receiver frame is the source of truth for Natural, CPU, WebGPU, saved cases, and Blender;
2. one finite-light sample set is shared by straight-through coverage and refracted transport;
3. every affected incident sample records its unobstructed receiver point, medium path, loss, and deposited receiver point;
4. the reference receiver field is fixed-domain HDR data, not a per-frame normalized display texture;
5. direct, transmitted, reflected, absorbed, escaped, and deposited energy are accounted for before tone mapping;
6. the author-facing default is `shadow-contained`: focused light may appear only inside the finite-source shadow support, allowing only the sample-count-aware reconstruction footprint plus one support texel of feathering;
7. a later physical comparison mode may show traced spill outside that support only when it comes from a valid escaped ray and the energy ledger closes. It may never come from a mask, blur, spectral decoration, or mismatched receiver.

Transparent shadow and focused light remain separable diagnostics, but they are no longer independent images added together. They are two readings of one receiver transport result.

### Revised dependency order

```text
evidence cases
  -> explicit material / OpticalScene
  -> receiver + light sample SSOT
  -> CPU reference transport and energy ledger
  -> Natural composition
  -> WebGPU parity and safe fallback
  -> Blender / physical comparison
  -> transparent-material quality gate
  -> room and windows
  -> living shape and freeze
  -> placement
  -> scale and multiple bodies
  -> Ambient Mix
```

The first five slices are now implemented: receiver coherence/valid-path correction in v0.21.1, fixed-domain HDR flux and CPU/WebGPU sample weighting in v0.22.0, paired baseline replacement plus shared finite-source samples and independent runtime loss buckets in v0.23.0, author-visible receiver diagnostics plus a pure CPU/WebGPU field comparator in v0.24.0, and an isolated same-count device runner in v0.25.0. v0.25.1 makes reconstruction bandwidth follow mean sample spacing while preserving flux: radius 3 at 16,384 samples, 8 at 2,048, and a capped 12 at 1,024. The Tokyo 17:00 same-count case now passes all current gates, but Phase 3E remains open until a representative fixed case family also passes.

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

### Phase 2c — intentional color variation inside the host

Follow [internal color-variation field](color-variation.md). Replace the current shader-only `内部のむら` with one versioned, object-local pigment concentration field shared by the body, transparent shadow, CPU focused light, WebGPU, saved cases, and Blender reconstruction.

Begin with uniform, diffused, pooled, and streaked families. A frozen hand-trace follows when it can retain an authored gesture reproducibly. Keep geometry irregularity, pigment concentration, clear inclusions, haze/scattering, and bubbles as separate causes even when their visual results overlap.

## Phase 3 — shared receiver transport and energy ledger

The shadow query and forward optical tracer must use the same receiver, finite-light samples, and medium-transition semantics. A receiver is a frame, not a hidden floor constant:

```ts
type ReceiverFrame = {
  id: string;
  origin: [number, number, number];
  normal: [number, number, number];
  tangentU: [number, number, number];
  tangentV: [number, number, number];
  extent: [number, number];
};

type ReceiverTransportField = {
  receiverId: string;
  sceneRevision: string;
  lightRevision: string;
  width: number;
  height: number;
  texelArea: number;
  geometricCoverage: Float32Array;
  straightThroughputRgb: Float32Array;
  depositedFluxRgb: Float32Array;
  lossFluxRgb: Float32Array;
  diagnostics: EnergyLedger;
};
```

For each finite-light sample:

1. intersect the unobstructed ray with the shared receiver and record its baseline contribution;
2. traverse ordered medium boundaries;
3. accumulate path length per medium;
4. multiply Beer–Lambert RGB throughput and interface Fresnel transmission;
5. classify TIR as internal/reflected unless a later valid escape is actually traced;
6. intersect the escaped ray with the same receiver frame and deposit flux in receiver-space coordinates;
7. return RGB throughput, coverage, and energy diagnostics.

Reference composition replaces affected baseline direct light with transported light. It does not add a normalized bright texture on top of an independently shaded floor. Natural tone-maps this result; Analysis can separately show coverage, straight throughput, raw receiver hits, deposited HDR flux, and the final composite.

Implementation slices:

1. **3A — receiver coherence — implemented in v0.21.1:** Natural, CPU, and WebGPU use `OpticalScene.receiver`; saved cases and Blender retain the same receiver contract.
2. **3B — valid paths — implemented for the reference path in v0.23.0:** unresolved entry/exit paths deposit no receiver energy; TIR, material/interface loss, receiver escape, and invalid paths remain distinct ledger outcomes. Decorative spectral point styling remains Analysis-only and no longer offsets Natural receiver deposits.
3. **3C — support and diagnosis — implemented in v0.24.0:** the transport field rejects deposits outside the reconstructed baseline-shadow support before rendering. Natural can switch without retracing among Composite, Shadow coverage, Delivered light, and Non-arrival light. The last field is splatted at each affected baseline position and includes material/interface loss, reflection, receiver escape, fixed-domain escape, and unresolved paths; author-imposed support rejection remains a separate numeric bucket.
4. **3D — HDR reference field — implemented in v0.22.0, low-sample reconstruction corrected in v0.25.1:** a fixed 32×32 domain, 512² Float32 flux, aperture/sample weighting, and an energy-preserving reconstruction kernel replace adaptive 8-bit peak normalization. The radius is `clamp(round(3 × sqrt(16384 / sampleCount)), 3, 12)` texels. Deposit, coverage, non-arrival, and support expansion share it, so SAFE's sparse point pattern is reconstructed without changing integrated flux.
5. **3E — CPU/WebGPU parity — reconstructed-field runner implemented, raw/case-family alignment open in v0.25.1:** both backends share the exact seeded aperture and angular sun-disk sample prefix, 28-float result ABI, RGB throughput semantics, paired baseline replacement, flux weighting, reconstruction radius, and stable receiver coordinates. A separate comparison GPU prevents error-scope/status races with the displayed field; exact-count CPU and WebGPU builds publish no texture, geometry, status, or callback side effects, abort stale scene revisions, serialize jobs, and return compact summaries rather than typed arrays. The author can run the 2,048-ray gate in Calculation Status. Tokyo 17:00's reconstructed fields measure 0.46% maximum RGB-flux error, 0.27-texel centroid distance, zero-texel 95% envelope distance, support IoU 1.0, deposit L1 0.87%, and negligible coverage L1; every current display-field gate passes. Radius 8 smoothing can hide sub-kernel hit-boundary differences, so this is not yet a raw tracer-parity claim. Keep Phase 3E open until raw-hit or fixed-radius auxiliary metrics and the morning/noon/evening material case family pass.

Acceptance:

- every receiver hit has plane signed distance at most `1e-4` shape unit;
- world-to-receiver-to-world round trips stay within `0.25` texel;
- CPU and WebGPU use the same receiver and light revision IDs;
- a TIR ray deposits no receiver energy unless a later valid escape is traced;
- disabling focused light leaves the transmitted shadow intact;
- enabling focused light changes only the body-affected receiver region in `shadow-contained` mode; energy outside the reconstruction-radius-plus-one support is at most `0.5%` and no displayed pixel exceeds `1/255` there;
- no object and sun below the horizon both produce zero focused-light energy;
- increasing absorption never increases deposited total flux;
- the reconstruction kernel changes integrated flux by less than `0.5%`;
- reconstruction radius is monotonic with sample count, remains 3 at 16,384, is 12 at 1,024, and produces no disconnected SAFE sampling islands;
- fixed CPU/WebGPU cases keep total flux within `5%`, centroid within one texel, 95th-percentile position within two texels, and support IoU at least `0.9`;
- the CPU energy-ledger residual is at most `1%`; WebGPU is at most `5%` until its accumulation is upgraded;
- CPU reference cases numerically cover air→host→inclusion→host→air;
- the default morning, noon, and evening cases show no disconnected bright patch;
- Blender direct-only comparison keeps the shadow and focused-light relation on the same recorded receiver.

In the same phase, establish the reference path in [light drawing from the author's trace](light-drawing.md). The first gate is one controlled real surface bulge moving one receiver line. Remove decorative deposit/normalization behavior from the validation mode before increasing caustic spectacle.

## Phase 4 — Tokyo natural light, rooms, and receiver materials

Make the visible surroundings, simple room geometry, openings, and receiving surfaces part of the optical scene before declaring the transparent body complete. Follow [natural-light environments and receiver materials](lighting-environment.md).

Phase 4 cannot begin until Phase 3A–3E pass for the open-air reference case. A room must constrain the same light transport; it cannot conceal a receiver or energy mismatch.

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
- focused light remains causally inside the author-facing shadow support and cannot survive with no valid incident path;
- one authored surface/thickness trace producing a stable line or arc on the receiver, with source size controlling clarity;
- continuous Tokyo date/time motion in open air and through one recorded room opening;
- explicit room width, depth, ceiling height, window count/proportion/size/position/height/spacing, and object-to-window relation;
- a same-exposure body/no-body room comparison that reports redistribution and loss as well as concentration;
- stable interaction without holes, flicker, invalid normals, or plausible-looking output from an invalid scene;
- CPU reference, real-time shader, and WebGPU behavior within documented tolerances, with a safe fallback;
- accepted M4–M6 and M9–M12 Blender comparisons and selected physical reference observations.

The Primary and author review the Natural view first. Numeric tests and Analysis views can explain a failure but cannot pass a visually unconvincing result.

## Phase 6 — capture an interesting state, then compare

The first capture slice is implemented in v0.25.0. An editable JSON-based `.hkr` document contains multiple complete replayable views; each view carries the shape recipe, Hikari settings, camera, observation, backend, version, and commit. Legacy single-case JSON opens as a one-view document. The current renderer viewport can be exported separately as PNG and is not embedded in `.hkr`. Blender export still materializes one current case and its checked mesh/sidecar bundle.

The remaining capture work is:

- extend each view when the corresponding runtime features arrive: geographic place beyond Tokyo, playback state, room/opening geometry, whole-body pose, and general receiver records;
- link the selected Blender bundle's mesh hashes and measurements back to its source view;
- evidence links and selected output-image references without silently embedding unbounded pixels;
- view rename, duplicate, reorder, delete, update, dirty-state, and autosave recovery;
- shared-shape deduplication only if real document sizes justify a v2 migration.

Then add side-by-side or saved-state A/B comparison. The view list is an observation record, not a general effect-preset manager.

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
