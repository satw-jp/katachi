# HANA-1 — Stroke to 3D Stroke to Simple Field Stem

Status: HANA-1B shared 3D Stroke PASS / FROZEN; Stem / Field not started
Updated: 2026-09-01

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

## Open after HANA-1B

1. Whether the fixed 32-point editing budget needs curvature-aware or adaptive sampling.
2. Whether editing one control should deform only that point or a local neighborhood in a later Soft Edit stage.
3. World units, document origin, and the point where millimeters become meaningful.
4. Undo/history and loading the versioned HANA document; HANA-1B only saves it.
5. Whether Axome direct editing is necessary after orthographic editing is tested.
6. How preserved pressure should influence a later Stem/Field, if at all.
7. The next Stop Gate for turning one shared Stroke3D into a simple Field Stem without entering Flower, Support, Web, Mesh, or print work.
