# SKIN CUDA Geometry Compute Lab

This directory is a shadow-only feasibility laboratory. It is not imported by
the production SKIN application, helper, GeometryEngine runtime, FKEI, mesh
export, support or Print code.

The draft contracts separate continuous geometric facts from authoring
decisions:

- mesh analysis returns stable face indices, `insideScore` and
  `overhangAngleDeg`;
- SDF grid evaluation returns ordered scalar values;
- generic route evaluation returns collision/clearance observations but never
  accepts a route.

The first benchmark prototypes reuse the reviewed containment executable as a
Base-metaball point evaluator. They do not claim that the executable already
represents Surface Pattern or permanent capsule geometry. Every CUDA value is
compared with the Web reference, remains a candidate, and is recorded with
`shadow=true` and `productionApplied=false`.

Run the contract/reference tests:

```text
npx tsx tools/skin-local-engine/geometry-compute-lab/geometry-compute-lab.test.ts
```

With the existing fixed-loopback helper running on the RTX 3080 machine, run
the real project benchmark:

```text
npx tsx tools/skin-local-engine/geometry-compute-lab/benchmark.ts
```

`KATACHI_CUDA_GEOMETRY_RESOLUTION` may select a bounded 48–160 lab resolution.
It does not alter production settings.

