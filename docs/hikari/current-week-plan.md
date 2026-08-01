# hikari — current week execution plan

Status: active in the primary implementation branch
UpdatedAt: 2026-08-01

## Outcome for this week

Move hikari toward its first complete form as a **realtime visualizer for transparent materials**: looking around must stay immediate and enjoyable, while a stopped view can be calculated more deeply and recorded for Blender or physical comparison.

Blender is a validation and finishing companion, not the primary interactive experience. Living shape follows the transparent-material gate. Rooms, windows, whole-object placement, architectural scale, multiple independent bodies, print-shell studies, and Ambient Mix remain designed but do not compete with this week's optical work.

## Why the earlier schedule changed

The earlier weekly schedule correctly promoted camera observation and living shape, but it treated the transparent-material core as less complete than v0.27.0 actually is and did not order the remaining optical dependencies tightly enough.

The implementation order is therefore:

```text
freeze current evidence
  -> inclusion transmitted hue + concentration
  -> representative CPU/WebGPU receiver parity cases
  -> deeper Progressive BODY paths
  -> transparent-material evidence gate
  -> minimal living-shape / freeze bridge
  -> spatial pigment variation
```

Uniform inclusion material comes before deeper paths so the integrator is generic by medium. Receiver parity stays on uniform media until failures can be localized. Spatial pigment variation comes only after both are stable because it introduces a line integral and a shared field representation across CPU, BODY, receiver, saved documents, and Blender.

## Work packages

### W0 — preserve the v0.27 reference

- Record the current M0–M6 Hikari cases, PNGs, backend, sample count, build commit, and available Blender references.
- Keep the pre-change images beside later acceptance images; do not silently replace them.
- Use `.hkr` views for reopenable author viewpoints and the Blender bundle for validation.

Exit: a later build can reopen the same shape, camera, material, light, and receiver state.

### W1 — camera observation for recording

Status: implemented in v0.28.0; cross-platform recording verification remains.

- Add Start/Stop automatic orbit around the current OrbitControls target.
- Keep target, radius, elevation, and lens unchanged while orbiting; expose direction and one-orbit duration.
- Automatic movement uses Realtime Observation. Progressive Render is available only after orbit stops, because accumulation from changing camera rays is not a valid still image.
- The stopped viewpoint is already reproducible through the saved camera position, target, FOV, and aspect in `.hkr`.
- Numeric focal length/sensor/FOV authoring follows after the optical gate. Lens distortion is an optional presentation effect and is not part of transparent-material physics.

Exit: the author can screen-record a stable orbit and stop at a view that can be saved and rendered.

### W2 — one inclusion as a complete uniform material

Status: implemented in v0.28.0; fixed Hikari/Blender acceptance images remain.

- Give the inclusion its own transmitted hue and independent absorption concentration, including zero concentration for a clear absorption void.
- Route the same derived RGB Beer–Lambert coefficients through Realtime/Progressive BODY, CPU receiver transport, the current GPU-capable path, `.hkr`, and Blender export.
- Retain equal-IOR and different-IOR cases. A clear equal-IOR inclusion must not gain a painted boundary.

Exit: outer and inner hue/concentration can be changed independently and reopened without backend-specific interpretation.

### W3 — close the uniform receiver parity slice

- Add morning, noon, and evening fixed cases across clear/colored host and equal/different-IOR inclusion relationships.
- Add raw-hit or fixed-radius auxiliary metrics so reconstruction smoothing cannot hide tracer differences.
- CPU remains the reference. WebGPU display claims parity only for the cases that pass the recorded gate.

Exit: Phase 3E representative cases pass or record a precise failing event and backend.

### W4 — deeper Progressive BODY paths

- Keep Realtime's current continuity approximation unchanged.
- In Progressive only, trace a bounded 4–6 boundary/segment path with medium identity, geometric normals, Beer–Lambert attenuation per segment, Fresnel transmission/reflection, and TIR.
- Use deterministic sampling and publish unresolved/convergence diagnostics. Do not claim quality from sample count alone.
- Compare M4 after inclusion material and M5/M6 after the deeper path against the frozen Blender/reference images.

Exit: on both Mac and Windows, a fixed nested/TIR case shows the same physical phenomenon after convergence. Pixel equality is not required; backend-only black patches, detached light, or a benefit visible only in SAFE mode are failures.

### W5 — living shape, only after the optical sub-gate

- Reuse the existing Katachi/MPM shape source rather than build a new general simulator.
- First bridge: one slowly changing shape can pause, freeze, reopen, and become the exact static input to Hikari.
- Preserve author actions such as bend, inflate, pinch, and later slime/growth families as separate layers over the base evolution.

Stop rule: if W2–W4 do not pass their fixed optical cases, W5 is limited to contracts and bridge tests; implementation time returns to optics and evidence.

## Budget and parallelism

- 15% — W0 evidence plus W1 automatic orbit
- 20% — W2 inclusion material
- 25% — W3 receiver parity family and metrics
- 25% — W4 deeper Progressive BODY
- 15% — QA, `.hkr`/PNG/Blender evidence, public-build verification, and W5 bridge only if the gate passes

Design and technical decisions stay with the primary thread. Bounded tests, case authoring, documentation audits, Blender-bundle inspection, and cross-platform verification can run in parallel. Two agents must not edit the same runtime files.

## Definition of this week's completion

- Automatic orbit can be started/stopped for screen recording without changing the observation geometry.
- Outer and inclusion transmitted hue/concentration are independent and saved.
- The representative uniform-material receiver case family has explicit parity evidence.
- Progressive BODY demonstrates a deeper valid path and reports unresolved work on Mac and Windows.
- At least one before/after Hikari/Blender comparison is recorded; Blender remains validation, not a second implementation target.
- Only if the optical sub-gate passes, one evolving shape can freeze into the same reopenable Hikari scene.
