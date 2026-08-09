# Katachi → Hikari Snapshot handoff（作者決定・2026-08-09）

Status: accepted direction; Hikari implementation begins after Katachi PACK-SPIKE can freeze one observed state.

## Author request, preserved

> katachiのSRFpackに例えば３や４の球体からなるお花をパックしてみたいと思った
>
> 上記の形状に限らずパッキングをできるようにしたい
>
> hikariが別で実装動いてるからどういうふうに進めたら良いか一緒に考えたい

Rigid packing and deformable packing were proposed as two separate observations. The author answered:

> 両方みたい

For web publishing, the author decided that Katachi and Hikari may remain separate:

> katachiとhikariは別で良いんだけど

This note is the durable handoff for a later Hikari implementer. It does not authorize changing the current
optical solver, `.hkr` format, or deployed Worker before the Katachi-side freeze contract exists.

## Responsibility boundary

```text
Katachi
  Shape Definition
  Motif Definition
  Placement Domain
  Composition Operator
  Rigid / Soft packing
  Freeze
  Immutable Geometry Snapshot
             |
             v
       Hikari Adapter
             |
             v
Hikari
  OpticalScene
  media / material
  light / receiver
  optics / render
  .hkr observation document
```

Katachi owns how the form was generated, placed, and deformed. Hikari owns what optical meaning is assigned
to that frozen form. Katachi does not write IOR, absorption, transmission, caustics, receiver, light, or render
settings into the geometry snapshot.

Hikari must not read Katachi's mutable in-memory editor state as the interchange contract. A live preview,
if added later, is a sequence of immutable snapshot revisions. A chosen observation pins one snapshot ID and
content hash.

## First Katachi source

The first producer is a separate Flower Packing Study, not a rewrite of the existing Surface Patch Packing Study.
It compares the same seed and host surface in two conditions:

- **Rigid:** the flower's core and three or four petal spheres retain their local relation; only the whole motif
  position and orientation change.
- **Soft:** petal spheres remain connected to the core but can move relative to their rest offsets under packing
  pressure; the chosen moment is frozen before Hikari reads it.

The initial Flower is an observation probe. The interchange must not use `flower` as a required type. Later
motifs may be rings, clouds, procedural fields, or imported geometry.

## Snapshot v1 minimum

The exact JSON schema is intentionally not frozen before the Spike produces real data. Hikari should expect the
following semantic minimum:

```ts
interface KatachiGeometrySnapshotV1 {
  format: "katachi-geometry-snapshot";
  formatVersion: 1;
  snapshotId: string;
  revision: string;
  contentHash: string;
  createdAt: string;
  createdFrom: {
    graphVersion: string;
    nodes: readonly {
      type: string;
      version: string;
      implementation?: { id: string; version: string };
      parameters: Readonly<Record<string, unknown>>;
      seed?: number;
      inputHashes: readonly string[];
    }[];
  };
  physicalScale: {
    mmPerShapeUnit: number;
    source: "assumed" | "derived-from-mesh" | "author";
  };
  shapeRefs: readonly SnapshotShapeRef[];
  instances: readonly SnapshotInstance[];
  materialSlots: readonly string[];
  semanticTags: readonly string[];
  diagnostics: {
    convergence: "converged" | "partial" | "failed";
    collisionCount: number;
    maxPenetration: number;
    outsideCount: number;
    deformationVerified: boolean;
    warnings: readonly string[];
  };
}
```

`shapeRefs` must not be mesh-only. Katachi's source of truth may be an SDF, sampled field, procedural shape, or
mesh. If an Hikari backend cannot consume a representation, the adapter either performs a recorded conversion
or rejects it. It does not silently substitute an approximation.

For the first Flower Soft result, a snapshot may record the frozen component-sphere transforms directly. Hikari
does not rerun the packing/deformation solver.

## Web and release boundary

Target public surfaces are independent:

```text
katachi.a-8c3.workers.dev  -> later katachi.satw.jp
hikari.a-8c3.workers.dev   -> later hikari.satw.jp
```

The current production fact remains different: Hikari v0.32.1 is a workspace on the Katachi root page and uses
the `katachi` Worker. Do not overwrite that production deployment merely to satisfy the target diagram.

Release separation means:

- Katachi source changes deploy only Katachi;
- Hikari source changes deploy only Hikari;
- Snapshot compatibility is versioned independently from either app version;
- a valid old pinned Snapshot remains observable after either app advances;
- rejection of an unsupported Snapshot is explicit and leaves the current Hikari document unchanged.

## Handoff stages

1. **File handoff (first):** Katachi downloads one frozen snapshot; Hikari offers `KATACHIの形を開く` and
   validates format, hash, scale, representation, and diagnostics before changing the scene.
2. **One-click browser handoff:** `Hikariで見る` opens the separate Hikari origin and transfers the exact
   snapshot with an explicit origin check. File export/import remains the recovery path and saved truth.
3. **Shared URL (only after need is observed):** server storage and a public snapshot ID require separate
   retention, deletion, privacy, and size decisions. They are not part of v1.

LocalStorage is never the cross-application contract. Optical settings remain in `.hkr`; the `.hkr` document
pins the imported Katachi snapshot identity and any materialized Hikari representation or conversion record.

## 2026-08-09 addendum: figure / ground duality

The author added `samples/katachi_260808.stl` as a reference for a second, parallel research thread:

> ここでは丸い穴が開くよりも図と地が反転するような穴が本体なのか表面が本体なのか、
> どちらの形状も等価に扱うような状況を目指している

Hikari must therefore not hard-code the assumption that a received surface is always “the object” with void on
the other side. A future snapshot may describe a finite observation domain, two complementary phase or region
IDs, their shared interface, and which phase was materialized for a particular derived mesh. Katachi owns that
geometric phase relationship. Hikari independently maps regions and interfaces to optical media/materials.

This does not expand Snapshot v1 before its first real handoff. It is a compatibility constraint: preserve room
for `regionIds`, `boundaryIds`, finite-domain provenance, and phase-to-mesh conversion diagnostics. Do not encode
glass/air assignments or other optical values in Katachi to solve it early.

## Hikari implementation gate

Do not start `HIKARI-BRIDGE-0` until all of the following exist:

1. Katachi can show Rigid and Soft Flower packing from the same seed;
2. the author chooses at least one frozen state worth opening in Hikari;
3. Katachi can reopen that state without rerunning an unversioned solver;
4. the snapshot records physical scale provenance and unresolved collision/deformation diagnostics;
5. one non-Flower motif or an explicit schema review proves that the contract is not Flower-specific.

When the gate opens, add a pure adapter at the Hikari edge. Do not import Katachi UI, history, packing solver,
or Study internals into the Hikari renderer.
