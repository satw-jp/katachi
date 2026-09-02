# SKIN Fabrication Span 0

Research-only prototype for the fabrication boundary of SKIN. The study starts with a Material Span Coupon rather than a finished object: two anchors and explicit fabrication conditions are computed, while the final material line is left to molten resin, gravity, cooling, and the physical fixture.

## Question

When resin is fixed at two points and passed through open air, what material variation appears, and can that variation become usable in the work?

The software does not author a completed sagging curve. It supplies the conditions for a physical span.

## Setup

Open `/skin-fabrication-span.html` in the local Vite app. The default coupon is nine spans arranged in the Y direction:

- 40 mm anchor-to-anchor span, held as a parameter rather than buried in geometry code
- three feed presets: 600, 900, and 1200 mm/min
- three extrusion multipliers: 0.85, 1.00, and 1.15
- starting profile assumption: 0.8 mm nozzle and 1.75 mm filament

The profile values are explicit research assumptions. They are not copied from, or presented as a verified, Bambu Studio profile. The G-code export is a deterministic body only. It declares relative E with `M83`, but does not contain machine-specific start/end, homing, calibration, purge, AMS, or shutdown sequences. It is not ready for automatic printer execution.

## What is controlled

- anchor A and anchor B
- planned nozzle path: a straight line between the anchors
- feed rate
- extrusion amount and explicit extrusion multiplier
- fabrication profile
- coupon row spacing and simple rail dimensions
- deterministic span IDs (`F1-E1` through `F3-E3`)

Filament length is calculated from the path-volume relationship:

`path length × line width × effective layer thickness × extrusion multiplier ÷ filament cross-sectional area`

The result is an explicit relative filament amount in the Intent and in the traceable G-code comments. No random seed or digital noise is used.

## What is intentionally uncontrolled

- sag
- cooling deformation
- string shape
- local thickness variation
- accidental contact
- physical surface texture

These are not predicted in the planned preview. The preview shows the planned straight nozzle trajectory, travel moves, anchor positions, and span IDs only.

## Planned trajectory and physical observation

`FabricationSpanIntent` is the author/toolpath-generator boundary: anchors, motion, extrusion mode, filament amount, and role. `PlannedTrajectory` is the straight path derived from it.

`FabricationObservation` is a future, separate record of what the machine and material actually produced: for example measured sag, thickness, contact, or a broken span. An observation must not be imported back into the Intent as a completed-curve field or other pre-authored final shape.

HANA import and a production SKIN connection are intentionally absent. A future boundary may map a HANA control stroke to fabrication candidates (for example gesture speed to feed), but this prototype does not make that decision.

## Future SKIN boundary

The later research question is whether a SKIN Permanent Web edge can be classified as structurally critical or non-critical:

```text
SKIN Permanent Web edge
        ↓
structural importance judgment
        ↓
rigid fabrication  |  material-span intent
```

This study does not add a `material-span` attribute to `finalGraph`, FKEI, Stage 5B, Stage 8, or production geometry. It does not change the current SKIN geometry, print snapshot, export semantics, support algorithm, or print gate.

## What this does NOT prove

- It does not prove that any preset is physically safe or validated on a Bambu A1.
- It does not prove that the generated body-only G-code can be run directly by a printer.
- It does not prove a sag amount, a successful bridge, a desired thickness, or a usable artwork.
- It does not replace Bambu Studio, machine calibration, material-specific setup, or human supervision.
- It does not simulate physics or make an organic-looking curve digitally.

## Stop Gate

Stop after deterministic toolpath generation, planned preview, G-code text/export, pure-function tests, build, and browser QA. Do not send to a printer, upload by MQTT/FTP, operate AMS or Developer Mode, connect HANA, change production SKIN, merge, or deploy.

## Next physical observation

After a human chooses and checks the machine setup, print a small coupon with the nine IDs visible in the same order. Photograph or measure each span without rewriting its original Intent. Record which spans sag, thicken, touch, string, cool into a different line, or fail, and keep those measurements as a separate `FabricationObservation` ledger.

## Observation

2026-09-02 — The isolated source/build entry, eight pure model tests, and full production build completed successfully. Browser QA was attempted but held because this environment rejected the local Node listen with `EACCES` on the project QA ports; no physical behavior or printer communication was observed.

## Related

- `src/studies/skin/README.md` — production SKIN study context
- `STATEMENT.md` and `RESEARCH.md` — material, structure, and observation principles
