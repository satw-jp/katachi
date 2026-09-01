# HANA-0 — EasyCanvas Pen Input Probe

Status: **PASS / FROZEN**
Verified: 2026-09-01

## Question tested

Can an iPad and Apple Pencil, connected through EasyCanvas, be used as a Windows input device while preserving the author's ordered Stroke and pressure data in a browser?

```text
Apple Pencil
  ↓
iPad
  ↓
EasyCanvas
  ↓
Windows / Windows Ink
  ↓
Browser PointerEvent
  ↓
Stroke data
```

## Verified result

The path succeeded in the real browser test.

- `pointerType` was `pen` for both strokes.
- 2 separate strokes were retained in drawing order.
- The exported JSON contains 651 ordered points in total: 165 points in stroke 1 and 486 points in stroke 2.
- Every point contains `x`, `y`, `pressure`, and `time`.
- Pressure was present as continuous, non-binary data at all 651 points.
- Stroke 1 pressure ranged from `0.0185546875` to `0.1044921875` with 32 distinct recorded values.
- Stroke 2 pressure ranged from `0.1123046875` to `0.501953125` with 125 distinct recorded values.
- Time remained nondecreasing within each stroke, so point order and drawing order are recoverable.
- Multiple strokes remained separate in the exported data.
- JSON saving succeeded using the experimental format `katachi.hana-gesture.v0`.
- The displayed line width responded to pressure, while raw pressure values remained stored without replacing them with display widths.
- The browser console had no errors during the confirmed test.

## Evidence and format status

The verified capture was `hana-gesture-2026-09-01T09-53-58-265Z.json`. It is experimental Gesture data, not the final HANA save format.

The HANA-0 probe currently exists as a separate local implementation outside the Katachi repository, at local commit `488335c` (`Build HANA-0 pen input probe`). That repository is clean, has no configured remote, and is not pushed or deployed from this work. Its behavior and evidence are recorded here; its source is not being imported into Katachi as part of this documentation task.

## Freeze rule

HANA-0 is complete and frozen. Changes are limited to correcting evidence or repairing a regression in the probe itself. Shape generation, smoothing, Graph, 3D Stroke, Field / SDF, Mesh, STL, Flower Head, `hana-taba`, SKIN integration, Support, Web, FKEI, and CUDA are not HANA-0 work.

The next allowed stage is HANA-1 — Stroke → 3D Stroke → simple Field Stem. HANA-0 must not be expanded into that implementation.
