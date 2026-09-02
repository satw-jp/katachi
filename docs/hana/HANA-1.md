# HANA-1 — Stroke to 3D Stroke to Simple Field Stem

Status: HANA-1C PASS / FROZEN; Stem / Field not started
Updated: 2026-09-02

## First destination

HANA-1 has one bounded path:

```text
Raw Gesture / Stroke
  ↓
Editable 3D Stroke
  ↓
simple Field Stem
```

The first destination is not a finished flower. Flower Head, `hana-taba`, SKIN Support, SKIN Web, Print integration, and CUDA are outside HANA-1.

## HANA-1A result

The Four View Input Shell passed its 2026-09-01 EasyCanvas / Apple Pencil check. Top / Axome / Front / Right, one/four layout, splitter, orthographic camera controls, per-viewport Draw/Edit/View modes, raw pressure/time capture, separate viewport strokes, JSON saving, and the Raw Gesture / Editor State boundary were verified without browser console errors.

The author observed that strokes drawn in the lower Front and Right viewports do not move together. This is the intended HANA-1A boundary: they are still separate 2D Viewport Gestures. Declaring that two projections describe one Stroke, choosing the missing axis, and showing the resulting 3D Stroke across all viewports are HANA-1B questions. No linkage was added in HANA-1A.

## HANA-1B fixed decisions

- Draw creates a new shared `Stroke3D`; HANA-1B holds one Stroke only and requires Clear before another Draw.
- Front Draw sets Y=0 and derives X/Z, Right Draw sets X=0 and derives Y/Z, Top Draw sets Z=0 and derives X/Y.
- The Raw Gesture remains unchanged. A deterministic arc-length resample creates 32 editable control points.
- Every control point retains `sourceStroke`, normalized `sourceT`, source sample interval, interpolated raw pressure, and interpolated raw time.
- Front Edit changes X/Z only, Right Edit changes Y/Z only, and Top Edit changes X/Y only. The hidden axis remains unchanged.
- Top / Front / Right / Axome are projections of the same `Stroke3D`, not per-view copies.
- Pressure is preserved as provenance and remains a diagnostic display value. It does not define radius or Field strength.
- Save JSON separates `rawGestures`, `strokes3D`, and `editorState`.
- Axome is a view/camera surface in HANA-1B. Axome Draw and direct Axome Edit are excluded.

## HANA-1B result

The 2026-09-01 EasyCanvas / Apple Pencil run passed with `pointerType=pen`, one Front Raw Gesture containing 615 ordered points, pressure range `0.1435546875–0.5703125` with 241 distinct non-binary values, monotonic time, one shared 32-control `Stroke3D`, four-view projection, and Right-side depth editing. Four edited controls changed Y from the initial Front plane value 0 to values spanning `-3.3140803106425–4.15162277910253`; X remained the hidden retained axis during Right editing. Raw Gesture samples and their pressure/time remained present after editing, all controls retained provenance, and the saved document separated `rawGestures`, `strokes3D`, and `editorState`. Browser console warnings/errors were zero.

The accepted artifact is `hana-1b-document-2026-09-01T12-14-00-475Z.json`. An earlier Sidecar-to-Mac-over-RDP attempt produced `pointerType=mouse` and constant pressure `0.5`; it was intentionally rejected from the hardware gate.

## HANA-1C fixed decisions

```text
Raw Gesture
immutable author input
        ↓
Control Stroke
32 editable points
        ↓
Smooth Centerline
regenerable Catmull-Rom display
```

- The open Smooth Centerline uses centripetal Catmull-Rom, `alpha=0.5`, and eight samples per control segment. With 32 controls it produces 249 derived samples and retains the first and last points.
- Dense Smooth Centerline samples are not persisted as canonical data. The document persists the Control Stroke and fixed curve settings.
- Soft Edit OFF affects one control. LOW affects the selected control and up to two neighbors on each side with weights `1 / 0.67 / 0.33`. MEDIUM affects up to four neighbors on each side with weights `1 / 0.8 / 0.6 / 0.4 / 0.2`.
- Soft Edit applies only the two visible axes in each orthographic View. The hidden axis of every affected control remains fixed.
- Control provenance remains unchanged after position editing. Smooth pressure/time/sourceT values are diagnostic interpolation from adjacent controls.
- Pressure does not control Centerline width, radius, or Field strength.
- Stroke identity color is deterministic editor presentation only and never enters Gesture, Field, Geometry, or Print data.
- Axome remains View-only. Adaptive resampling, Undo, Load, units, multiple Stroke editing, Stem, and Field remain excluded.
- Smoothness is a non-destructive 0.00–1.00 display control. It does not change the Control Stroke, control count, Catmull-Rom alpha, samples per segment, or the 249-sample count.
- Smoothness derives four fixed passes of endpoint-preserving `0.25 / 0.50 / 0.25` relaxation, then interpolates original and fully relaxed positions. Missing smoothness in an older document means `0`.
- The Smooth Centerline Stop Gate is: Smooth Centerline continuously interpolates the intended Control Stroke deformation and does not introduce a local kink, loop, or spike absent from the Control Stroke.
- Soft Edit is displacement falloff to neighboring controls; it is not a shape-rounding function.
- Pencil-first authoring: Apple Pencil is primarily a drawing instrument. Precise control-point editing is mouse-oriented. Future Pencil correction should prefer redraw / overdraw rather than point manipulation. Redraw / Overdraw is not implemented in HANA-1C.

## HANA-1C hardware verification

The EasyCanvas + Apple Pencil verification passed. Smoothness was usable continuously from `0.00` through `1.00`, including `1.00`, with no single optimum value selected; it remains an author-selected parameter for the intended expression. Apple Pencil was used primarily for Draw, while precise control-point editing remains mouse-oriented. The browser console had zero warnings and errors.

HANA-1C is now PASS / FROZEN. Stem, Field, and every later materialization phase remain unstarted.

## Viewport plan

Reuse SKIN's existing four-view behavior as narrowly as practical:

- Top / Front / Right / Axome are the working views. This is the same set as SKIN's existing default Top / Axome / Front / Right layout.
- Put a small `Draw / Edit` switch at the edge of each viewport.
- Front, Right, and Top support Draw and Edit.
- Axome begins as primarily View / Edit; Axome drawing is not required for the first milestone.
- All viewports show and edit one shared 3D Stroke. They do not own separate copies of the Stroke.
- One-view / four-view switching and independent orthographic camera state should follow the existing SKIN interaction where it can be reused without coupling HANA to SKIN production code.

## Data separation

Raw Gesture and Editable 3D Stroke are separate records.

- Raw Gesture preserves the original stroke boundaries, ordered samples, `pointerType`, `x`, `y`, raw `pressure`, and `time`.
- Editable 3D Stroke is derived and may have fewer editable controls than the Raw Gesture.
- The hundreds of raw samples are not exposed directly as edit handles. HANA-1 resamples them into a smaller editing representation.
- Resampling and later 3D edits must retain a defined relationship to the raw samples so pressure and time are not lost.
- A simple Field Stem is derived from the Editable 3D Stroke. It must not overwrite either upstream representation.

The exact persistent schema is deliberately unresolved until the projection, resampling, and provenance rules below are decided.

## SKIN capabilities that appear reusable

| Existing SKIN capability | HANA use | Reuse boundary |
| --- | --- | --- |
| `src/studies/skin/multiViewport.ts` | One/four layout, Top/Axome/Front/Right defaults, split calculation, active-viewport hit testing, per-view camera draft | Prefer narrow reuse or a small adapter; do not move or refactor the SKIN module during HANA start |
| `src/studies/skin/rhinoViewportControls.ts` | Rhino-style rotate, pan, zoom gesture interpretation | Reuse the leaf-level control semantics without taking a dependency on SKIN geometry |
| Orthographic camera setup in `src/studies/skin/renderer.ts` | Shared scene shown through independent orthographic views | Reproduce or extract only the smallest proven camera/scissor pattern; do not reuse the full SKIN renderer |
| Viewport-specific screen-to-ray handling in `src/studies/skin/renderer.ts` | Project Draw/Edit input from the selected viewport into the shared 3D Stroke | Treat as a pattern until HANA's projection rule is decided |
| `setOrbitEnabled` and pointer propagation patterns | Prevent camera navigation from competing with Draw/Edit input | Apply locally to the active HANA viewport |
| Editor-only view state in `multiViewport.ts` and `supportPaintDraft.ts` | Keep camera/layout state separate from author shape data | Preserve the same separation; viewport state is not Raw Gesture or final shape data |

The existing SKIN renderer is large and coupled to SKIN-specific geometry, selection, clipping, Support Paint, and production UI. It is not a suitable whole-module dependency for HANA.

## Open after HANA-1C

1. Whether the fixed 32-point editing budget needs curvature-aware or adaptive sampling.
2. Whether fixed index-distance Soft Edit needs a spatial or curvature-aware falloff.
3. World units, document origin, and the point where millimeters become meaningful.
4. Undo/history and loading the versioned HANA document; HANA-1C only saves it.
5. Whether Axome direct editing is necessary after orthographic editing is tested.
6. How preserved pressure should influence a later realization, if at all.
7. How a Smooth 3D Stroke should be materialized. No next geometry phase is selected by HANA-1C.
