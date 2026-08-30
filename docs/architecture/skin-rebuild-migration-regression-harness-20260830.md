# SKIN REBUILD migration regression harness — 2026-08-30

This is a test-only freeze around
`public/samples/skin-rebuild-first-print.fkei`. It does not change production
geometry, the FKEI schema or the baseline file.

`src/studies/skin/rebuild/migrationRegression.test.ts` verifies:

- fixture SHA-256, strict FKEI parse and project restore;
- host 12, Pattern 38, inside classification 38/38;
- Spider 251 Nodes / 270 Edges, zero disconnected Patterns;
- support targets 20/20, zero unsupported, 20 connection claims;
- finalGraph 251 Nodes / 270 Edges and its target/grid statistics;
- separate print support 134 Nodes / 67 Edges;
- resolution 68 final mesh: 59,524 triangles and 29,688 unique Float32-mm
  saved vertices;
- one connected, closed, consistently wound component with zero open,
  non-manifold, degenerate and non-finite triangles;
- 80 mm longest dimension, fixed mm bounds and volume
  14,302.041001524116 mm3.

Discrete Web-reference topology and tessellation counts are exact. Bounds use
1e-6 mm absolute plus 1e-9 relative tolerance. Volume uses 0.1 mm3 absolute
plus 1e-5 relative tolerance. These tolerate scalar noise without hiding a
topology failure.

The test exports a backend-neutral `GeometryResultContract` and
`compareGeometryResult(reference, candidate, tolerances)`. A future Web,
Windows CPU or CUDA adapter converts its result to that contract. Backend
provenance is retained but is not a shape difference. Cross-backend count or
numeric tolerances must be reviewed explicitly when that backend exists; the
current reference replay is not weakened in advance.

Run through:

```text
npm run test:skin-rebuild
```

The baseline SHA is checked before parsing, so an edited fixture fails before
new expected values can accidentally bless it.
