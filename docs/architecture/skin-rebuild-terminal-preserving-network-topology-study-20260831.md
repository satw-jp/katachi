# SKIN REBUILD Terminal-preserving Network Topology Study — 2026-08-31

Status: development-only authoring study. No result is adopted by production
geometry, FKEI, STL or 3MF.

Frozen input:

- branch: `agent/skin-network-lab`;
- TASK 17 base commit: `8db47bb49bbf3de0720e48e3bfdcd205c7e001a5`;
- fixture: `public/samples/skin-rebuild-first-print.fkei`;
- fixture SHA-256: `4bacfcced0fe311eef704a792d61f4a68531051ff408e26d5ff2937b8bbfadcf`;
- immutable TASK 15 Clean graph: 101 nodes / 118 topological edges / one component.

## 1. Question and boundary

TASK 17 showed that edge removal alone stops at 100 edges because a connected
101-node graph needs at least 100. TASK 18 asks a different question: which
Clean Nodes are identities that must stay, and which are intermediate route
samples that can become control points of a longer topological Edge?

`spiderGraphTerminalTopologyLab.ts` consumes the immutable Cleanup result and
returns a separate study result. It is not imported by
`buildSkinRebuildLattice()`, finalGraph, FKEI capture/restore, STL/3MF export or
the production Vite inputs. Contraction therefore changes only a Lab topology
view. It does not change the frozen straight Spider realization or any exported
geometry.

## 2. Node classification

Classification is based on the Clean graph and the saved Motif/support
connections, not distance alone:

| Class | Baseline count | Policy |
|---|---:|---|
| Unique absolute terminal | 38 | retain identity; all carry Motif role |
| Support terminal | 20 | retained; these are also Motif terminals |
| Multi-role terminal | 20 | retained with both roles |
| Inferred major branch / junction, degree >= 3 | 28 | retain identity and degree |
| Explicit semantic junction | 0 | current `InternalStructureGraph` has no such field |
| Critical non-terminal endpoint, degree <= 1 | 20 | retain identity |
| Intermediate degree-2 topology node | 43 | eligible for series contraction |

The categories overlap where a terminal is also a degree-3 branch. Terminal
classification wins, while the same ID is also present in the major-branch
audit. A future explicit Junction role must be added as portable project intent;
it must not be inferred permanently from degree or position.

The 38 unique terminals yield `38 * 37 / 2 = 703` terminal pairs. All levels
retain 703/703 pair reachability. Motif connectivity remains 38/38 and support
connectivity remains 20/20.

## 3. Degree-2 series contraction

The implemented operation is topology-preserving series rewiring:

```text
Clean A -- Edge p -- Intermediate B -- Edge q -- Clean C
                         ↓
Topology A --------- Topology Edge r --------- C
                      realization: polyline A-B-C
```

The topology Node B is removed, but B is not discarded as shape intent. The
replacement Edge stores B in an ordered polyline control path. Repeated
contraction extends the ordered path rather than replacing it with a straight
segment. Radius samples are preserved separately as source values. This creates
the future boundary:

```text
Topology Edge + portable path/provenance -> straight / curve / spline realization
```

A contraction is rejected when the two neighbours already have a direct Edge,
because that would remove a cycle rather than only change graph subdivision.
Every tentative contraction is audited before acceptance. It must preserve:

- one connected component;
- Motif and support terminal component partitions;
- every terminal identity and all 703 terminal-pair paths;
- every inferred major-branch identity and degree;
- complete Clean/Raw Node and Edge provenance;
- cycle rank 18.

The presets are geometric-intent thresholds, not requested target counts:

| Level | Maximum bend | Maximum polyline/chord detour | Max contracted controls per Edge |
|---|---:|---:|---:|
| None | disabled | disabled | 0 |
| Low | 105 deg | 1.65x | 1 |
| Medium | 115 deg | 2.50x | 3 |
| High | all degree-2 series candidates | unbounded | unbounded |

Eligible candidates are processed deterministically by lowest intent cost and
stable Clean Node ID. The cost combines maximum bend, detour, terminal hop
distance and major-branch hop distance. It is an authoring heuristic, not a
physical-strength score.

## 4. Observed levels

| Level | Nodes | Edges | Contracted Nodes | Rewired Edges | Components | Motif | Support | Terminal pairs | Cycle rank |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| None | 101 | 118 | 0 | 0 | 1 | 38/38 | 20/20 | 703/703 | 18 |
| Low | 85 | 102 | 16 | 16 | 1 | 38/38 | 20/20 | 703/703 | 18 |
| Medium | 66 | 83 | 35 | 35 | 1 | 38/38 | 20/20 | 703/703 | 18 |
| High | 58 | 75 | 43 | 43 | 1 | 38/38 | 20/20 | 703/703 | 18 |

High contracts all 43 intermediate degree-2 Nodes. Its remaining 58 identities
are the 38 absolute terminals plus 20 protected critical endpoints. This is an
observed topology limit under the current protected-role policy, not a proposed
production density. Unlike TASK 17 High, it does not remove the 18 graph cycles;
each node contraction removes exactly two Edges and adds one replacement Edge,
so `E - V + 1` stays 18.

## 5. Candidate operations not auto-applied

The study inventories the other requested candidates but deliberately leaves
them as review-only:

- 28 spatially nearby pairs of inferred degree-3 junctions were found. They are
  not merged because proximity alone cannot prove shared author intent, and a
  merge would change major-branch identity and degree;
- zero three-Node small-cycle clusters were found by the current bounded test;
- zero intermediate Nodes had a direct-neighbour short detour suitable for a
  cycle-reduction proposal;
- terminal-between-terminal detours are represented by the same degree-2 series
  operation only when every terminal remains an endpoint, never by terminal
  deletion;
- small-cycle representative Nodes and nearby-junction consolidation require an
  explicit author-selected Junction identity plus a separate cycle-change
  operation. They are not smuggled into Cleanup or terminal preservation.

This split is intentional. Degree-2 contraction changes representation while
preserving graph homeomorphism. Junction merge, cycle reduction and branch
rewiring change graph identity and belong to a later author-controlled study.

## 6. Provenance contract

Every retained topology Node stores:

```text
Topology Node -> Clean Node ID -> Raw Node IDs
```

Every topology Edge stores:

```text
Topology Edge
  -> ordered Clean control Node IDs and positions
  -> contributing Clean Edge IDs
  -> contributing Raw Edge IDs
  -> contracted Clean and Raw Node IDs
  -> source radius samples
```

For example, the first Medium contraction shown in the Lab rewires Clean Node
61 into `topology-edge:118`. Its path is Clean Nodes `15 -> 61 -> 16`, from
Clean Edges 32/33 and Raw Edges 70/71/72/73; Raw Node 99 is retained as Node
provenance. Later contractions may supersede the first replacement Edge ID, but
the final Edge still contains the complete ordered path and source lineage.

Tests require exact one-time coverage of all 101 Clean Nodes and all 118 Clean
Edges by retained identities or replacement-Edge provenance. The Cleanup input
is deep-compared before and after the study to prevent mutation.

## 7. Visual Lab and author decision

The development-only `/skin-network-lab.html` now switches between two studies:

- Edge Density: TASK 17 Clean-to-Simplified edge removal;
- Node Topology: TASK 18 Clean-to-topology contraction.

Node Topology retains Raw, Clean and Raw/Clean, and adds Topology and
Clean/Topology modes. It distinguishes polyline realization, removed topology
Node, rewired chord, retained Motif terminal and retained support terminal. The
Node inspector shows classification, roles, articulation, bend/detour/intent
metrics, accept/protect/reject reasons, final polyline controls and Raw/Clean
lineage. Nearby inferred junction pairs are shown faintly as review-only; they
are never applied.

Real coordinate clicks exercised all four topology levels, all five display
modes and all four TASK 17 compatibility levels. The visible topology counts
matched the table, terminal and contracted-node details were inspected, and
browser console warning/error count was zero.

The author still has to decide whether Medium or High reads more clearly as a
spider network, whether preserving the exact polyline produces too much visual
noise, and whether some endpoints should become semantic Junctions. No level is
a print recommendation. Any production adoption requires a separate author
decision, Migration Regression Harness comparison, GeometryEngine realization,
slicer QA and physical-print evidence.
