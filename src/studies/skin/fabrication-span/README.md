# Material Span Coupon v0

## Question

With a Bambu Lab A1, a 0.8 mm nozzle and PLA, can a known two-anchor route be
handed to the printer as one continuous XYZ motion so that sag, attachment,
commanded-path error and repeatability can be observed as material behaviour?

Material Span is a fabrication-layer concept. It is a persistent filament line
between existing structural points, but it is not a primary structural member.
It is therefore distinct from Stage 5B Permanent Reinforcement and Stage 8
Removable Support. It is not a change to either system.

## Setup

Open `/fabrication-span.html`, choose one of the five variants, and inspect the
**Commanded Path** and validation status. The UI can generate a reviewable
`.gcode` file and matching `.json` metadata file; it does not upload, start, or
control a printer. The preview is explicitly a commanded path, never a final
physical-span prediction.

For command-line generation, run `npm run build:skin-fabrication-span`. By
default it writes the five `.gcode` and five metadata files to the sibling
`fabrication-span-output` directory, outside the repository worktree. The
generator records the exact current Git HEAD in metadata.

### Coordinate contract

All coordinates inside this Study are explicit machine-space millimetres. There
is no SKIN source-coordinate scale, centering, or hidden conversion. The coupon
uses A=(40, 90, 20) mm and B=(80, 90, 20) mm, with a 40 mm XY distance. Its
guardrail envelope is X=20..100, Y=70..110, Z=0..30 mm, deliberately well
inside the A1 nominal 256 x 256 x 256 mm build volume. The A1 plate view in
Bambu Studio remains the human check before use; the guardrail is not a
manufacturer guarantee.

The existing SKIN exporter uses a separate A1 mini convention (including a
90,90 mm plate centre). That convention is not reused here. The coupon's
machine-space contract is kept visible in every metadata JSON file.

### G-code contract

The file uses absolute XYZ (`G90`) and absolute extrusion (`M82`). E is built
from a deterministic, explainable v0 model:

```
extrusion length = path length
                 × extrusion multiplier
                 × deposited cross-section
                 ÷ filament cross-section
```

For the span, deposited cross-section is `nozzleDiameterMm²`; for conventional
anchor tower lines it is `nozzleDiameterMm × layerHeightMm`. This is not a
volumetric simulation or a slicer.

The startup contract intentionally emits only `G90`, `M82`, and `G92 E0` after
review comments. It does not guess an A1 homing, heater, fan, upload, or print
start macro. The shutdown contract is comments only: no heater, fan, homing,
upload, or print-start command is emitted. A human must use the normal A1 /
Bambu Studio flow to inspect setup, heat, home, and decide whether to proceed.
Never direct-send these files.

## Observation

### 2026-09-02 — deterministic coupon implementation

The first coupon is deliberately small: two conventional 10 mm × 10 mm anchor
towers are made in Phase A, then one one-way A → B Material Span is made in
Phase B. The span path is `A → vertical departure → straight elevated route →
vertical arrival → B`. No sinusoid, noise, random jitter, or simulated sag is
added. The path is deterministic and the final filament is intentionally left
to extrusion, gravity, cooling, speed and time.

Five variants are provided and change one thing at a time:

| ID | Changed parameter | Value |
| --- | --- | --- |
| baseline | none | 20 mm/s, 0.95 flow, 1.5 mm lift |
| fast | print speed | 26 mm/s |
| slow | print speed | 14 mm/s |
| low-flow | extrusion multiplier | 0.82 |
| high-lift | span lift | 4.0 mm |

All five pass the in-tree finite-coordinate, coupon-bound, feed, extrusion,
temperature, fan, endpoint, path-direction and absolute-E checks. This is
software evidence only. No physical sample has been printed yet, so no claim
of attachment, sag, strength, cooling behaviour or repeatability is made.

## Hypothesis

The useful output is not a visually perfect CAD curve. A clear A → B command
should make the difference between commanded route and final material shape
observable. Speed, flow and lift should produce distinguishable but measurable
changes, while the anchors keep anchor failure separate from span failure.

## Related

- Parent SKIN Study: `src/studies/skin/README.md`.
- Stage 5B Permanent Reinforcement and Stage 8 Removable Support remain
  production concepts with unchanged ownership and routing.
- The existing SKIN A1 mini / 0.4 mm export remains separate. This Study does
  not import production SKIN, alter BODY geometry, add a 3MF part, or change
  support routing.
- A1 build volume and optional 0.8 mm nozzle are recorded from the official
  [Bambu Lab A1 technical specifications](https://bambulab.com/pl/a1/tech-specs).

## Next

Human physical observation only: start with the baseline file below, inspect it
in Bambu Studio, and print it once the machine setup has been independently
checked. If it attaches safely, repeat the baseline before comparing another
variant. Record observations in `notes/physical-test-sheet.md`.

Bouquet integration, HANA-to-SKIN conversion, Permanent Reinforcement mixing,
3MF Material Span parts, full BODY toolpaths and Material Span v1 are outside
this Study.

## Physical Test Sheet

The blank record is in `notes/physical-test-sheet.md`. It captures machine,
variant, temperature, fan, speed, flow, anchor distance, lift, A/B attachment,
continuity, sag, lowest point, asymmetry, stringing, blob, nozzle interference,
repeatability, visual/structural notes, disposition and photographs. The first
file to print is `skin-material-span-v0-baseline.gcode`, after human review.
