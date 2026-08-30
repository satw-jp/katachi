# SKIN REBUILD Spider Graph Simplification Study — 2026-08-31

Status: development-only authoring study. No result is adopted by production
geometry, FKEI, STL or 3MF.

Frozen input:

- branch: `agent/skin-network-lab`;
- TASK 16 base commit: `9e781c1443f616c63727f1ad58d8ae0fcc052697`;
- fixture: `public/samples/skin-rebuild-first-print.fkei`;
- fixture SHA-256: `4bacfcced0fe311eef704a792d61f4a68531051ff408e26d5ff2937b8bbfadcf`;
- immutable Cleanup result: 101 nodes / 118 topological edges / one component.

## 1. Cleanup and Simplification are separate operations

Cleanup remains the deterministic TASK 15 normalization that merges only
numerically coincident nodes, removes endpoint duplicates exposed by those
merges and collapses exact equal-radius unprotected degree-2 subdivisions. Its
success contract is preservation of morphology intent and terminal component
partitions.

Simplification starts only after that immutable result. Removing an edge
changes cycle redundancy, possible route choice and the read of the artwork.
It is therefore an author operation even when graph connectivity stays the
same. `spiderGraphSimplificationLab.ts` clones the Clean input, returns a new
topology per level and never mutates or replaces the Cleanup Candidate.

The Clean graph has cycle rank:

```text
E - V + components = 118 - 101 + 1 = 18
```

Those 18 cycle edges are the complete theoretical removal budget while one
component is mandatory. High uses that budget as an observation limit and
ends at a spanning tree. It is not a recommended density.

## 2. Deterministic removal strategy

For each removal round, every currently retained edge is evaluated again.
The edge is immediately rejected when Dijkstra search, excluding that edge,
finds no alternative endpoint path. A provisional graph is then measured with
the same terminal contract used by Cleanup. The removal is eligible only when:

- connected components remain 1;
- Motif connectivity remains 38/38;
- support-target connectivity remains 20/20.

Eligible edges receive a deterministic authoring score from:

- shortest alternative-path detour ratio and hop count;
- short-cycle redundancy;
- endpoint degree/local density;
- alignment with the alternate route as a coarse parallel-path proxy;
- graph-hop proximity to Motif/support terminals;
- a graph-theoretic criticality proxy.

The highest score is removed, then all metrics are recomputed on the changed
graph. Equal scores use lower criticality and stable Clean Edge ID. No random
deletion or mutable seed is involved. `criticality` is explicitly not stress,
load path, buckling, slicer or physical-strength analysis.

Preset fractions apply to the 18-edge cycle budget, not to all 118 edges:

| Level | Removed | Nodes | Edges | Components | Motif | Support | Total edge length |
|---|---:|---:|---:|---:|---:|---:|---:|
| None | 0 | 101 | 118 | 1 | 38/38 | 20/20 | 123.79283631872248 |
| Low | 4 | 101 | 114 | 1 | 38/38 | 20/20 | 111.65651038019591 |
| Medium | 9 | 101 | 109 | 1 | 38/38 | 20/20 | 101.66512626977895 |
| High | 18 | 101 | 100 | 1 | 38/38 | 20/20 | 85.60725989522943 |

Low removes Clean Edges 64, 80, 81 and 83. Medium additionally removes 13,
62, 70, 71 and 77. High reaches a tree after also removing 1, 26, 40, 58, 69,
72, 73, 79 and 101. Presets are nested and repeated evaluation returns the
same order.

## 3. Portable topology and provenance

Each result stores only retained endpoint relations in `topology`. Straight
radius realization remains in the TASK 16 adapter and is used by the Lab only
to draw the current view. A future curve/spline/custom realization can use the
same simplification decision IDs.

Every disposition retains:

```text
Simplified retained/removed Clean Edge
  -> Clean Edge ID
  -> contributing Raw Edge IDs
  -> collapsed Raw Node IDs (TASK 16 lineage)
```

Removed edges do not disappear from the study record. The decision carries
score, criticality, shortest alternative path at the decision round, accept or
reject reasons and removal order. This is sufficient to inspect why a route
was changed and to undo or compare a later policy.

## 4. Visual Lab

`/skin-network-lab.html` remains a Vite development-only page omitted from the
production multi-page build. TASK 16 Raw, Clean and Raw/Clean views remain.
TASK 17 adds Simplified and Clean/Simplified views plus None/Low/Medium/High
author levels:

- Clean: gold;
- retained Simplified edge: green;
- edge removed by the selected level: red;
- selected decision edge: white.

The edge inspector lists removed, still-optional and rejected edges. It shows
removal score, graph criticality, alternative path, detour, reasons and Raw
lineage. A bridge at High, for example, shows criticality 1, no alternative
path and an explicit `components=1` rejection rather than silently vanishing.

Real coordinate clicks exercised all four levels and all five display modes.
Visible counts were 118/114/109/100 edges with the required connectivity at
each step. An accepted removal and a bridge rejection were inspected; console
warning/error count was zero.

## 5. Author decision remains open

Connectivity says that every terminal can still reach the same component; it
does not say that the route distribution looks like a spider web, that a long
detour is desirable or that redundancy is physically expendable. The author
must compare at least:

- whether Low already opens useful visual breathing room;
- whether Medium makes the primary routes readable or merely sparse;
- whether High's tree loses the desired web quality and visual resilience;
- which red removals create awkward empty corridors near Motif connections;
- whether some parallel/redundant routes should remain for form, not graph need.

No level is connected to `buildSkinRebuildLattice()`, finalGraph, FKEI Save,
STL/3MF export or the production UI. Any future adoption requires a separate
author decision, GeometryEngine realization comparison, Migration Regression
Harness run, slicer QA and physical-print evaluation.
