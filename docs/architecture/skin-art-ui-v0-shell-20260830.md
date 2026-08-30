# SKIN ART UI v0 — Design System + Application Shell

Date: 2026-08-30

Branch: `agent/skin-art-ui`

Baseline: `e26891b7369159bae7ee1113104547bd2821595f`

## Objective

Turn the existing SKIN REBUILD editor into an artwork-facing Web application
without creating a second authoring runtime. v0 is a Presentation Layer shell:
it changes hierarchy, language, spacing, typography, panels, navigation and
responsive behavior while keeping every production action connected to the
existing DOM node and callback.

The visual direction is quiet and editorial rather than CAD-like: a minimal
project header, generous viewport, low-chrome side tools, and one clearly
focused authoring phase at a time.

## Reused unchanged

| Existing surface | v0 treatment | Retention contract |
| --- | --- | --- |
| Project bar and `.fkei` Open / Save | Restyled, English-first labels | Existing buttons, inputs, handlers and atomic restore remain the same nodes. |
| Shape Undo / Redo | Restyled in the project header and Tools pane | Existing shape and workflow journals remain authoritative. |
| Left Tools / View controls | Regrouped under an editorial Tools / View rail | Existing display toggles, camera controls and selection handlers remain mounted. |
| One/four viewport and renderer | Given more visual priority and calmer overlays | `SkinRenderer`, cameras, clipping, picking and WebGL canvas are unchanged. |
| Stage 1–8 controls | Presented through four artwork phases | Existing controls, IDs, state updates and callbacks are moved or shown; none are reimplemented. |
| Graph / DryWeb / spider editing | Presented as the Network phase | Existing graph types, workers and generation paths remain authoritative. |
| Mesh, diagnosis, FKEI and export | Presented as Print / Export | Existing fail-closed validation, cached mesh and 3MF/STL/OBJ paths remain authoritative. |
| Bottom progress and honesty status | Restyled as a compact process/status strip | Existing progress, cancellation and evidence text remain live. |

## Presentation-only additions

- A `skin-art-ui` root mode and versioned design tokens.
- A minimal artwork header with project identity, file actions and a compact
  runtime/version signature.
- A left `TOOLS / VIEW` rail with clearer visual grouping.
- A large central viewport with a quiet artwork label and interaction hint.
- A right phase rail with four always-visible phase buttons:
  `BASE SHAPE`, `SURFACE PATTERN`, `NETWORK`, `PRINT / EXPORT`.
- A phase context header above the existing controls. Selecting a phase opens
  and scrolls to the existing target stage; it does not compute geometry.
- `Advanced / Lab` language for retained research, diagnostic and legacy
  controls. These controls stay mounted and initially collapsed.
- Responsive modes that preserve the viewport first, then expose Tools and
  Phase controls as bounded side surfaces rather than shrinking the canvas to
  an unusable size.

## Explicitly outside this branch

- Geometry algorithms or thresholds.
- Spider, DryWeb or Graph generation.
- FKEI schema, Base/Motif data models or restore semantics.
- `GeometryEngine`, worker protocols, CUDA/WebGPU boundaries.
- STL, OBJ or 3MF geometry and output logic.
- New authoring features implemented inside the UI.

## Phase mapping

| Artwork phase | Existing entry stage | Existing downstream controls kept in scope |
| --- | --- | --- |
| 1 — Base Shape | `skin-stage-1` | Existing Base/FORM controls and host history. |
| 2 — Surface Pattern | `skin-stage-2` | Existing placement, motif, packing and direct edit controls. |
| 3 — Network | `skin-stage-3` | Existing Artwork Graph, DryWeb, spider and reinforcement controls in Stages 3–5. |
| 4 — Print / Export | `skin-stage-6` | Existing mesh, final diagnosis, removable support and export controls in Stages 6–8. |

## Verification gates

1. Source-level tests prove the shell uses the existing phase target IDs and
   existing production controls.
2. `test:skin-rebuild` and the production build remain green.
3. Browser QA uses real pointer clicks for every phase, Tools/Advanced
   disclosure, one/four viewport switching, and a project action that does not
   mutate geometry.
4. The final Git diff contains no changes under geometry/model/FKEI/worker or
   export implementation files.
