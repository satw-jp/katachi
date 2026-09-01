# HANA-1 — Stroke to 3D Stroke to Simple Field Stem

Status: HANA-1A input shell verified; 3D projection has not started
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

## Decisions required before implementation

1. **2D-to-3D projection:** how a stroke drawn in Top, Front, or Right establishes or updates the missing axis.
2. **Cross-view edit conflicts:** what happens when edits from different views constrain the same 3D point inconsistently.
3. **Resampling rule:** fixed count, distance tolerance, curvature-aware sampling, or another deterministic method; also the initial handle budget.
4. **Pressure/time provenance:** how raw sample intervals and values map to resampled controls and remain traceable after edits.
5. **Pressure meaning in 3D:** whether HANA-1 only preserves pressure or also maps it to the simple Field Stem radius, and with what reversible rule.
6. **Coordinates and units:** canvas normalization, world axes, origin, scale, and the point at which millimeters become meaningful.
7. **Reuse mechanism:** narrow imports from SKIN versus HANA-local adapters. No shared-library extraction is justified before the HANA experiment proves a stable common need.
8. **Persistence:** versioned HANA-1 draft format, its link to the frozen `katachi.hana-gesture.v0` input, and whether edit history or undo is persisted.
9. **Axome edit scope:** which edits are safe in Axome before Axome drawing is introduced.
10. **Accepted devices:** whether HANA-1 accepts mouse/touch for editing while still preserving and visibly distinguishing the original `pen` author input.
11. **Field diagnostic output:** the smallest Field Stem visualization needed to validate the computation without turning Mesh export into an HANA-1 deliverable.

Implementation should begin only after these decisions are recorded. None requires a prior SKIN production refactor.
