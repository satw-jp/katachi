# SKIN REBUILD Spider Graph Cleanup laboratory — 2026-08-30

Status: test/laboratory implementation only. The Cleanup Candidate does not
feed `buildSkinRebuildLattice()`, `finalGraph`, mesh realization, FKEI Save, or
export. Production geometry remains frozen.

Frozen input:

- source checkpoint: `f1251cff8e2bcf3ee9b760186368b961859ff519`;
- laboratory branch: `agent/skin-network-lab`;
- fixture: `public/samples/skin-rebuild-first-print.fkei`;
- SHA-256: `4bacfcced0fe311eef704a792d61f4a68531051ff408e26d5ff2937b8bbfadcf`.

## 1. Laboratory boundary

`src/studies/skin/rebuild/spiderGraphCleanupLab.ts` accepts an existing
`InternalStructureGraph` and terminal descriptors. It clones the input into an
immutable-observation `rawGraph`, reports findings, and builds a separate
`cleanupCandidate`. No production module imports it. The test reads the saved
baseline graph; it never calls Cleanup from the production Spider generator.

The graph algorithm owns topology and terminal identity. Straight-segment
facts are behind `SpiderEdgeGeometryAdapter` (`length`, `pointAt`, endpoint
`tangentAt`, and `closestApproach`). A future curve implementation can reuse
connectivity and terminal audits. This checkpoint ships only the straight
adapter, and automatic degree-2 joining is explicitly disabled for a curved
adapter until a curve-join contract exists.

All 38 Motif inside anchors are protected connectivity terminals. The 20
`latticeConnections.targetPatchId` anchors are also tracked separately as
support-target terminals. Protection is therefore based on portable semantic
input rather than assumptions about the current numeric node-ID range.

## 2. Cleanup policy versus Simplification

The lab policy treats only representation-preserving cases as automatic
Cleanup:

- merge same-component nearly coincident nodes within `1e-6` only when radii
  are compatible and two protected identities would not be combined;
- after merge, remove same-endpoint duplicate edges only when radii match;
- collapse an unprotected degree-2 node only for equal-radius straight edges
  whose deviation from exactly straight is at most `1e-5` degrees and whose
  replacement would not duplicate an existing edge.

The following remain observations or author review, not automatic Candidate
rewrites: collinear interval normalization, intersection splitting, ordinary
micro-edge pruning, incompatible radii, protected anchors, near-collinear
degree-2 nodes up to the 2-degree diagnostic window, and all curve joins.
Those operations can change material, junction meaning, route identity, or
strength and therefore belong to an explicit future policy or Graph
Simplification. A 0–100% creative strength control must never alter this fixed
Cleanup policy silently.

## 3. Baseline findings

| finding | count | interpretation |
| --- | ---: | --- |
| nearly coincident node pairs | 2 | `(56,63)` at `3.1031676915590914e-17`; `(103,108)` at `5.551115123125783e-17`; same component, unprotected, radius-compatible |
| exact duplicate endpoint groups in Raw | 0 | Current numeric endpoint IDs differ before near-node merge. |
| collinear overlaps | 4 | Edge pairs `20/29`, `21/28`, `76/83`, `77/82`; equal radius. |
| edge intersections | 4 | Pairs `20/28`, `21/29`, `76/82`, `77/83`; all are endpoint-to-endpoint contacts without a shared Node ID, not interior crossings. |
| micro edges | 0 | No edge is below the radius-relative diagnostic threshold. |
| degree-2 collinear nodes | 150 | All are equal-radius, unprotected, and inside the exact Cleanup angle tolerance in Raw. |

The two near-node merges make four endpoint duplicates explicit. Removing
those four edges accounts for the complete non-zero length difference:

`0.4682599824045541 * 2 + 0.4996067456041785 + 0.49960674560417845`
`= 1.9357334560174652`, within floating-point accumulation error of the
reported `1.9357334560176014` delta. The subsequent exact degree-2 collapses
preserve centreline length; two of the original 150 candidates disappear as
separate nodes in the preceding near-node merges, leaving 148 collapse
operations.

## 4. Raw and Candidate comparison

| fact | Raw Spider | Cleanup Candidate | delta |
| --- | ---: | ---: | ---: |
| nodes | 251 | 101 | -150 |
| edges | 270 | 118 | -152 |
| connected components | 1 | 1 | 0 |
| total edge length | 125.72856977474008 | 123.79283631872248 | -1.9357334560176014 |
| Motif terminals resolved/connected | 38/38 | 38/38 | 0 |
| support terminals resolved/connected | 20/20 | 20/20 | 0 |

Topology preservation is stricter than comparing only counts. For each role,
the test records the sorted terminal-ID set in every component and requires
the complete component partition to remain identical. It also requires the
global component count to remain identical. The baseline passes all three
gates: component count, Motif partition, and support-target partition.

Summed edge length is reported separately because it is geometry, not
topology: removing a duplicate span intentionally removes its second Raw
count. A Candidate may therefore pass topology preservation while exposing a
non-zero length delta. That delta must remain visible and explained before any
future production adoption.

## 5. Tests and limits

`spiderGraphCleanupLab.test.ts` fixes the baseline SHA before parse/restore,
proves the input graph is unchanged, fixes all Raw/Candidate counts and lengths,
and checks terminal partitions. Synthetic fixtures independently exercise
near nodes, endpoint duplicates, overlaps, an interior intersection, a micro
edge, exact degree-2 collapse, and refusal to collapse a protected terminal.

Run the focused lab with:

```text
npx tsx src/studies/skin/rebuild/spiderGraphCleanupLab.test.ts
```

It is also part of `npm run test:skin-rebuild`. The lab does not claim that
geometric crossings should connect, that duplicate tubes are mechanically
interchangeable, or that the Candidate is printable. No Candidate mesh is
built. Production adoption requires an explicit shadow-to-production gate,
the migration regression contract, visual comparison, slicer inspection, and
the author's physical-print decision.
