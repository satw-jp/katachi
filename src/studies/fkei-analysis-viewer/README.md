# FKEI Analysis Viewer v0

## Question

Can the same FKEI reveal different properties when observed through Geometry, Graph, Surface, and Void representations?

## Setup

Open `fkei-analysis-viewer.html`, choose `Open FKEI`, and load a canonical SKIN REBUILD `.fkei`. The bundled `C0 Sample` opens the existing `skin-rebuild-first-print.fkei` fixture. Use the four representation tabs to change only the representation; orbit and zoom are shared by all four views. `Reset View` is the only camera reset.

The viewer is read-only. It reuses the current canonical FKEI parser/validator and current Production v0 BODY generation path. It does not save, migrate, normalize, repair, or write back FKEI data.

## Observation

Browser Gate, 2026-09-06, using the bundled C0 fixture (`skin-rebuild-first-print.fkei`, source SHA-256 `4bacfcced0fe311eef704a792d61f4a68531051ff408e26d5ff2937b8bbfadcf`):

- Geometry loaded the canonical schema `katachi.skin-rebuild.fkei.v1`, with 12 Host / Base metaballs, 38 authored Motifs, and a Permanent Artwork Structure of 253 nodes / 272 edges.
- Graph reported 253 nodes, 272 edges, 27 junctions, 1 component, and cycle rank β1 = 20. Removable Support was not included.
- Surface reported 143,448 triangles and bounds of 32.6 × 32.4 × 80.0 mm from the canonical Production BODY path.
- Void used the fixed 64³ grid inside the Host / Base envelope. It reported 1 component, largest component 100.0%, and 0 boundary-connected components; the final BODY extended outside the Host / Base sampling envelope.
- Orbiting the camera, then switching Geometry → Graph → Surface → Void, preserved the camera and read-only canonical identity. No save/export/edit control was exposed.

These are observations only; author interpretation remains open.

## Hypothesis

The same authored artifact may reveal different spatial facts when its semantic ingredients, permanent structure, materialized surface, and Host/Base void are made independently legible.

## Related

- `../skin/` — canonical SKIN FKEI parser, authored Host/Motif model, Permanent Artwork Structure, and Production v0 BODY path.
- `../skin/renderer.ts` — existing read-only SKIN renderer reused for Geometry, Graph, and Surface presentation through the Viewer adapter.
- `../../lib/hash.ts` — source and canonical identity hashing.

## Next

Author review only: decide whether Geometry→Graph, Graph→Surface, and especially Graph→Void produce new understanding. Do not add clearance, visibility, Field, Scenario, or split-view analysis before that review.
