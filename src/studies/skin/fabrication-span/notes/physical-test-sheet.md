# Fabrication Span Physical Test #001

Print the baseline first. Human operator checks the A1 setup, plate, material,
temperature, homing and Bambu Studio preview before printing. Do not direct-send
the generated file. If the baseline does not safely attach, stop the sweep and
record the failure.

First file to print: `skin-material-span-v0-baseline.gcode`

| Field | Record |
| --- | --- |
| Date | |
| Machine | Bambu A1 |
| Nozzle | 0.8 mm |
| Material | PLA brand / color |
| Variant ID | baseline / fast / slow / low-flow / high-lift |
| Nozzle temp | °C |
| Bed temp | °C |
| Fan | % |
| Speed | mm/s |
| Extrusion multiplier | |
| Anchor distance | 40 mm XY |
| Commanded lift | mm |
| A attachment | PASS / PARTIAL / FAIL |
| B attachment | PASS / PARTIAL / FAIL |
| Continuity | PASS / FAIL |
| Sag | mm or photo observation |
| Lowest point | mm, if measurable |
| Asymmetry | none / slight / strong |
| Stringing | none / slight / strong |
| Blob | none / slight / strong |
| Nozzle interference | yes / no |
| Repeatability | unknown / low / medium / high |
| Visual note | |
| Structural note | |
| Disposition | Keep / Reject / Retry |
| Photo filenames | |

## Procedure

1. Inspect the G-code and metadata in Bambu Studio. Confirm the active printer,
   plate, filament, nozzle, temperatures and coordinate placement.
2. Confirm that the normal printer UI, not this Study, handles homing and
   heating. Do not upload or start automatically.
3. Print the baseline once. Record attachment, continuity, sag and any
   interference. Treat sag as an observation, not an automatic failure.
4. If the baseline is safe and continuous, print the baseline a second time
   when possible before comparing one changed-parameter variant.
5. Compare only one variant parameter at a time. Stop immediately for anchor
   release, broken filament, plate fall, blob accumulation, nozzle winding or
   machine collision.
