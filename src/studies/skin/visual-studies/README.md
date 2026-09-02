# SKIN ART — Visual Studies

## Question

Can one completed SKIN be read as a permanent bouquet whose hand-made
irregularity is still present? This isolated route compares eight presentation
readings over the same completed FKEI source. Four are now concept-led:
`MUTUAL SUPPORT`, `PERMANENT / CHANGING`, `HAND REMAINS`, and `SUPPORT BECOMES
FORM`. The other four remain as quieter comparison lenses.

## Setup

- Open `/skin-art/studies/` and choose a `VISUAL STUDY` from the right side.
  Each study reads `public/samples/skin-rebuild-first-print.fkei` through the
  existing SKIN REBUILD parser and derives its completed graph.
- The study renderer only creates temporary Three.js scene objects. It never
  writes the source FKEI, runtime state, graph generator, save path, or export
  path.
- The browser path uses the existing WebGL/Three.js boundary. It uses GPU
  point shaders and scene instancing where the browser's WebGL renderer
  permits; it does not claim WebGPU compute.

## Observation

- **2026-09-02**: The route exposes eight visibly different readings from one
  source. `MUTUAL SUPPORT` keeps the flower motifs present while source-near
  stems search for graph junctions. `PERMANENT / CHANGING` holds the object
  still and moves only its projected shadow. `HAND REMAINS` lets source-derived
  hesitation affect line arrival, brightness, and persistence through propose /
  hesitate / revise. `SUPPORT BECOMES FORM` grows denser source-junction paths
  into muted material tubes. FIELD, DUST, VOLUME, and SCAN remain useful
  particle, field, volume, and observation comparisons.

## Source boundary

The completed FKEI used by this route does not contain HANA's Raw Gesture.
The four concept-led readings therefore use a deterministic, bounded proxy
derived from completed Graph geometry: edge length, endpoint connectivity, and
directional change. It is not random noise, and it never changes the Graph,
FKEI, save state, geometry, or export. When a future presentation source
contains the actual HANA stroke, this proxy can be replaced by that source
signal without changing the study boundary.

## Hypothesis

The source graph becomes more legible as a work when appearance carries the
history of how a form is held together: uneven arrival, local concentration,
muted support color, persistent residue, and a shadow that keeps changing
around a stable object. The concept-led four are the strongest candidates for
the next artwork pass; the remaining studies are retained for comparison.

## Related

- `src/studies/skin/rebuild/networkFormation.ts` — the retained ten traversal
  comparison route.
- `public/samples/skin-rebuild-first-print.fkei` — the read-only completed
  SKIN source used here.

## Next

Compare stills and short recordings at the same camera and decide whether the
concept-led four have moved beyond principle demonstrations. This route is a
research lens, not a replacement for the ten traversal works.
