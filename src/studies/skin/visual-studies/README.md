# SKIN ART — Visual Studies

## Question

Can one completed SKIN be read through different visual laws instead of being
shown only as a network of lines? This isolated route compares field,
particle, growth, volume, shadow, scan, residue, and matter as presentation
layers over the same completed FKEI source.

## Setup

- Open `/skin-art/studies/` and choose a neutral `VISUAL STUDY` from the right
  side. Each study reads `public/samples/skin-rebuild-first-print.fkei`
  through the existing SKIN REBUILD parser and derives its completed graph.
- The study renderer only creates temporary Three.js scene objects. It never
  writes the source FKEI, runtime state, graph generator, save path, or export
  path.
- The browser path uses the existing WebGL/Three.js boundary. It uses GPU
  point shaders and scene instancing where the browser's WebGL renderer
  permits; it does not claim WebGPU compute.

## Observation

- **2026-09-02**: The route exposes eight visibly different readings from one
  source: FIELD is a continuous point field without graph edges, DUST is a
  discrete particle migration, GROWTH extends strokes out of motif centers,
  VOLUME is a soft occupied cloud, SHADOW is a projected residue, SCAN shows
  only a moving depth intersection, RESIDUE keeps proposal/rejection/revision
  layers, and MATTER turns walked graph paths into soft tubes.

## Hypothesis

The source graph becomes more legible as a set of laws when each study changes
the primitive being observed, not only the order in which edges appear. FIELD,
DUST, SHADOW, and SCAN are the clearest tests of that claim; GROWTH and MATTER
are the strongest candidates for a later artwork pass.

## Related

- `src/studies/skin/rebuild/networkFormation.ts` — the retained ten traversal
  comparison route.
- `public/samples/skin-rebuild-first-print.fkei` — the read-only completed
  SKIN source used here.

## Next

Compare stills and short recordings at the same camera and decide which two or
three visual laws deserve a deeper, material-specific study. This route is a
research lens, not a replacement for the ten traversal works.
