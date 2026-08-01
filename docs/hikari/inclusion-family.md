# hikari — one or many transparent inclusions

Status: staged after the one-inclusion optical reference
UpdatedAt: 2026-08-01

## Intent

A colored transparent host may contain one clear region or many. Their shapes and sizes may be irregular and generated rather than manually modelled. The interesting result is not randomness by itself, but how clear regions appear as voids, lights, lenses, or other spaces while the author moves around the host.

The first implementation uses one sphere only as a boundary-sequence reference. It is not the final authoring model.

## Reproducible generator

```ts
type InclusionRecipe = {
  seed: string;
  count: { min: number; max: number };
  shapeFamily: "round" | "soft-cluster" | "stretched" | "mixed";
  sizeMm: { min: number; max: number; distribution: "even" | "varied" };
  placement: "scattered" | "clustered" | "layered" | "author-seeded";
  minimumHostWallMm: number;
  minimumGapMm: number;
  allowMerge: boolean;
};
```

Generation is deterministic. The same recipe, seed, host revision, and physical scale produce the same inclusion records. Nothing rerolls during camera movement, time playback, or file reopen. `もう一度つくる` changes the seed explicitly; saving freezes the resulting shapes and transforms as well as the recipe.

## Shape sources

Use increasing levels of complexity:

1. one analytic sphere for the medium-transition reference;
2. several analytic spheres with different radii;
3. one inclusion made from a small smooth-union ball cluster;
4. several independently shaped clusters;
5. a frozen Katachi/S1 inclusion or imported validation mesh only after the realtime field remains stable.

Round, cluster, and stretched are generator families, not permanent geometric restrictions. Each generated inclusion is a normal `Medium` with its own `ShapeSource`, transform, material, and stable ID.

## Validity and contact

- Every inclusion must remain inside the host with at least `minimumHostWallMm` clearance.
- Separate inclusions keep `minimumGapMm` clearance in the first multi-inclusion release.
- If `allowMerge` is enabled later, touching clear regions become one unioned medium region; they are not traced as two coincident boundaries.
- Invalid candidates are rejected deterministically and retried from the same random stream up to a recorded attempt limit.
- If the requested count cannot fit, generation returns fewer inclusions with an explicit issue. It never silently shrinks wall thickness or places a plausible-looking invalid region.
- A user move that breaks containment remains visible as an editing warning, while optical output falls back to the last valid state or host-only view.

## Author-facing controls

Keep the initial surface small:

```text
内包      [なし] [ひとつ] [いくつか]
かたち    [丸い] [やわらかな塊] [伸びた] [混ざる]
大きさ    [揃う ↔ ばらつく]
密度      [少ない ↔ 多い]
配置      [散る] [集まる] [層になる]
          [もう一度つくる]
```

After generation, Natural view still begins with orbit and time. Selecting an inclusion reveals position, rotation, scale, material relation, and delete/duplicate controls. Raw random seeds, clearance, attempts, and boundary diagnostics stay in Analysis and the saved case.

## Optical implementation order

1. Prove `air → host → one inclusion → host → air` in the CPU reference and realtime view.
2. Generalize boundary-event sorting to several non-overlapping inclusions on a straight shadow ray.
3. Add refracted camera paths through at most one inclusion per path, then multiple sequential inclusions with a bounded event count.
4. Connect CPU focused-light output and only then the WebGPU path to the same event contract.
5. Add cluster-shaped inclusions after analytic-sphere cases remain stable on Mac and Windows.

The renderer may support more stored inclusions than a single ray can cross. A bounded realtime path must report when it reaches the event limit; it must not continue with an incorrect medium.

## First validation set

- one central clear sphere, equal IOR;
- one offset clear sphere, different IOR;
- three unequal clear spheres, equal IOR;
- eight varied spheres, separated and fully contained;
- one soft-cluster clear region;
- two nearby regions that are valid when separated and invalid when their required gap is broken;
- the same seed reopened from a case file with identical IDs, shapes, sizes, and transforms.

For each case compare orbit views, colored transparent shadow, focused light, and the host path length removed by every clear region. Blender and physical references are used to judge the phenomenon; they do not replace deterministic boundary tests.
