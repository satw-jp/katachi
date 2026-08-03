# hikari — current week execution plan

Status: historical execution snapshot; current status is delegated to [`master-plan.md`](master-plan.md)
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
  -> minimal existing MPM / freeze bridge verification
  -> transparent-material evidence gate
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

### W3A — turn the receiver field into an observable artwork study

Status: v0.29.3 was rejected because it enlarged/darkened the shadow; v0.29.4 conserves delivered RGB light and leaves the Composite shadow unchanged. The physical light-drawing gate remains open.

- Keep the Composite shadow as the unmodified reference. The expressive mode may redistribute delivered light only; it may not darken coverage or draw a detached plate.
- Preserve same-camera Composite/Stroke evidence and per-block RGB conservation tests. Random layout is deterministic and may not flicker.
- Implement LD1 as a saved mid-scale authored deformation in the shared shape query and Blender export. The present cellular plate is not a substitute for that geometry.
- Compare the same LD1 case at 0.53°, 5°, and 20°. Record whether the same ridge softens monotonically; do not mark the comparison complete until the control has actually changed and been observed.
- Check WebGPU and SAFE/CPU qualitatively after LD1, while expecting SAFE's lower sample count to remain coarser.

Exit: one coherent arc or moving ridge can be attributed to the saved geometric trace, and the source-size comparison is recorded without changing the pattern procedurally.

### W3B — connect several real inclusions

Status: the deterministic generator contract exists; runtime, UI, `.hkr`, and Blender connection remain.

- Expose `なし / ひとつ / いくつか`, with a deliberately small first cap such as eight analytic inclusions.
- Save stable IDs, seed, count, sizes, transforms, material, minimum host wall, and minimum gap; camera movement and reopening never reroll them.
- Start with several separated spheres, then soft clusters. Reject invalid containment rather than silently shrinking or overlapping bodies.
- Route the same ordered inclusion list through BODY, CPU receiver, WebGPU receiver, `.hkr`, and Blender. A bounded path must report an event limit instead of continuing through the wrong medium.
- Fix one three-inclusion equal-IOR case and one varied-material case before adding more controls.

Exit: a saved three-inclusion case reopens identically and shows the same medium relationships in Realtime, receiver diagnostics, and Blender export. This is a core link to the author's existing physical works, not optional scene decoration.

### W4 — deeper Progressive BODY paths

- Keep Realtime's current continuity approximation unchanged.
- In Progressive only, trace a bounded 4–6 boundary/segment path with medium identity, geometric normals, Beer–Lambert attenuation per segment, Fresnel transmission/reflection, and TIR.
- Use deterministic sampling and publish unresolved/convergence diagnostics. Do not claim quality from sample count alone.
- Compare M4 after inclusion material and M5/M6 after the deeper path against the frozen Blender/reference images.

Exit: on both Mac and Windows, a fixed nested/TIR case shows the same physical phenomenon after convergence. Pixel equality is not required; backend-only black patches, detached light, or a benefit visible only in SAFE mode are failures.

### W5 — minimal MPM freeze bridge for the artwork take

Status: the existing coarse bridge is integrated and browser-verified in v0.29.0; further living-shape work remains behind the optical gate.

- Reuse the existing Katachi/MPM shape source rather than build a new general simulator.
- The first bridge lets one slowly changing shape pause, freeze, reopen, and become the exact static input to Hikari.
- The preview may run before the complete W4 research slice only to produce the August artwork take. The adopted proxy is fixed as explicit history; no claim is made that continuous MPM optics is physically complete.
- Preserve author actions such as bend, inflate, pinch, and later slime/growth families as separate layers over the base evolution.
- Add an optional centre-lock evolution mode by measuring the proxy centre of mass after each step and removing only global drift; label it as an authored constraint rather than unconstrained physics.
- A later offline MPM renderer advances simulation and camera on independent fixed-frame timelines, writes one deterministic adopted proxy per frame, and supports both deformation-only and deformation-plus-orbit PNG sequences.

Stop rule: until W2–W4 pass their fixed optical cases, W5 stops at this verified coarse start/adopt/save bridge. Continuous surface reconstruction, new deformation families, and MPM renderer work do not expand; implementation time returns to optical blockers and evidence.

## Budget and parallelism

- 15% — W0 evidence plus W1 automatic orbit
- 20% — W2 inclusion material
- 25% — W3 receiver parity family and metrics
- 25% — W4 deeper Progressive BODY
- 15% — QA, `.hkr`/PNG/Blender evidence, public-build verification, and verification of the already-existing W5 bridge; no further MPM scope until the gate passes

Design and technical decisions stay with the primary thread. Bounded tests, case authoring, documentation audits, Blender-bundle inspection, and cross-platform verification can run in parallel. Two agents must not edit the same runtime files.

## Definition of this week's completion

- Automatic orbit can be started/stopped for screen recording without changing the observation geometry.
- Outer and inclusion transmitted hue/concentration are independent and saved.
- The representative uniform-material receiver case family has explicit parity evidence.
- The expressive `筆跡` plate is available for composition, while LD1—not the current cellular pattern—remains the acceptance gate for a physical light drawing.
- Progressive BODY demonstrates a deeper valid path and reports unresolved work on Mac and Windows.
- At least one before/after Hikari/Blender comparison is recorded; Blender remains validation, not a second implementation target.
- The existing evolving-shape bridge freezes into the same reopenable Hikari scene; it enters an artwork take only after the black/white optical artifact gate passes.

The production-oriented August sequence is tracked separately in [Hikari × Ambient — 2026年8月 作品化スケジュール](ambient-submission-schedule-2026-08.md). It requires the black/white artifact gate before recording the first rough take.
