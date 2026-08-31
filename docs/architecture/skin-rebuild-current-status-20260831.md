# SKIN REBUILD current status — 2026-08-31

This document is the handoff snapshot for the current SKIN REBUILD production
checkpoint and the isolated studies that are intentionally not adopted by
production geometry yet.

## 1. Repository and publication checkpoint

- repository: `satw-jp/katachi`;
- branch: `agent/skin-network-lab`;
- source checkpoint: `de9d25ed7de266d52e61387775eee733d0921a6c`;
- remote branch was equal to the local checkpoint when this snapshot was
  prepared;
- public application:
  <https://katachi.a-8c3.workers.dev/skin-rebuild.html>;
- displayed application version: `v0.91.0`;
- immutable first-print FKEI SHA-256:
  `4bacfcced0fe311eef704a792d61f4a68531051ff408e26d5ff2937b8bbfadcf`.

The production checkpoint uses the following new-project authoring defaults:

| Setting | New project | Existing first-print FKEI restore |
| --- | ---: | ---: |
| longest dimension | 120 mm | 80 mm |
| permanent Spider diameter | 3.9 mm | 2.6 mm |
| removable print-support diameter | 1.6 mm | 1.6 mm |

The 120 mm and 3.9 mm values preserve the author's requested 1.5x relation.
Opening an existing FKEI restores its saved values exactly; it is not silently
migrated. A target or diameter change invalidates Stage 3 and later derived
facts. Stage 4 also rejects a Worker result whose complete settings snapshot
is no longer current.

The latest Cloudflare browser check confirmed the new-project values, the
80/2.6/1.6 completed-sample restore, and no console warnings or errors. This
snapshot does not redeploy because it adds documentation only.

## 2. Frozen migration reference

The Migration Regression Harness remains the reference contract for future
Base/Motif abstraction, GeometryEngine separation and candidate Windows/CUDA
backends. The first-print fixture is not changed by the 120 mm new-project
default.

| Invariant | Frozen reference |
| --- | ---: |
| Host count | 12 |
| Surface Pattern count | 38 |
| inside classification | 38/38 |
| Raw Spider | 251 Nodes / 270 Edges |
| disconnected Patterns | 0 |
| support targets | 20/20 |
| finalGraph | 251 Nodes / 270 Edges |
| separate print support | 134 Nodes / 67 Edges |
| export-resolution-68 mesh | 59,524 triangles / 29,688 saved vertices |
| connected components | 1 |
| open / non-manifold / degenerate edges or faces | 0 / 0 / 0 |
| longest dimension | 80 mm |
| volume | 14,302.041001524116 mm3 |

The exact contract and tolerances are documented in
[the migration regression harness](skin-rebuild-migration-regression-harness-20260830.md).

## 3. Network laboratory status

All Network results remain development-only observations. None is imported by
`buildSkinRebuildLattice()`, finalGraph, FKEI Save/Restore, production STL/3MF
export or the production UI.

### 3.1 Cleanup observation

The deterministic Cleanup laboratory separates topology normalization from
creative Simplification.

| Fact | Raw Spider | Cleanup Candidate |
| --- | ---: | ---: |
| Nodes | 251 | 101 |
| Edges | 270 | 118 |
| components | 1 | 1 |
| total edge length | 125.72856977474008 | 123.79283631872248 |
| Motif connectivity | 38/38 | 38/38 |
| support connectivity | 20/20 | 20/20 |

Observed Raw findings were two nearly coincident Node pairs, four collinear
overlaps, four endpoint-contact intersections, zero micro Edges and 150 exact
degree-2 collinear Nodes. Cleanup removes only representation-level duplication
under strict identity and radius constraints. The Candidate is not claimed to
be printable or mechanically equivalent.

See
[the Cleanup laboratory](skin-rebuild-spider-graph-cleanup-lab-20260830.md)
and
[the Raw/Clean visual laboratory](skin-rebuild-spider-graph-visual-lab-20260830.md).

### 3.2 Author-controlled edge Simplification

| Level | Nodes | Edges | components | Motif | Support |
| --- | ---: | ---: | ---: | ---: | ---: |
| None | 101 | 118 | 1 | 38/38 | 20/20 |
| Low | 101 | 114 | 1 | 38/38 | 20/20 |
| Medium | 101 | 109 | 1 | 38/38 | 20/20 |
| High | 101 | 100 | 1 | 38/38 | 20/20 |

High consumes the complete 18-Edge cycle-removal budget and reaches a
spanning tree. It is an observation limit, not a recommended artwork density.
The author's comparison of web quality, useful redundancy and empty corridors
remains open. See
[the Spider Graph Simplification study](skin-rebuild-spider-graph-simplification-study-20260831.md).

### 3.3 Terminal-preserving topology contraction

| Level | Nodes | Edges | contracted Nodes | cycle rank | terminal reachability |
| --- | ---: | ---: | ---: | ---: | ---: |
| None | 101 | 118 | 0 | 18 | 703/703 |
| Low | 85 | 102 | 16 | 18 | 703/703 |
| Medium | 66 | 83 | 35 | 18 | 703/703 |
| High | 58 | 75 | 43 | 18 | 703/703 |

All levels retain components 1, Motif 38/38 and Support 20/20. Contracted
degree-2 Nodes remain ordered polyline controls with complete Raw/Clean
provenance; they are not replaced by an untracked straight segment. Nearby
junction consolidation and cycle-changing rewiring remain review-only because
they change graph identity. See
[the terminal-preserving topology study](skin-rebuild-terminal-preserving-network-topology-study-20260831.md).

## 4. Ten print-size test candidates

An isolated read-only task generated BODY STL candidates at 90, 100, 110, 115,
120, 125, 130, 140, 150 and 160 mm. Every saved file passed the following
geometry gates:

- one connected component;
- closed and watertight;
- zero open, non-manifold, degenerate, non-finite or winding-inconsistent
  triangles/edges;
- saved longest dimension within 0.001 mm of the filename target;
- saved minimum Z within 0.001 mm of the build plate.

The task held permanent Spider at 3.9 mm, the removable-support project setting
at 1.6 mm and export resolution at 68. The binary files and generator evidence
remain in the external task archive rather than Git because they are generated
test artifacts. Their source run was recorded against branch commit `62e5bf5`
plus the then-existing isolated prototype working state; the complete related-
source aggregate hash was frozen by that task.

These files are geometry-gate-passed candidates, not print guarantees. Bambu
Studio Slice Preview and physical printing have not been performed. The
one-component BODY STL files do not contain removable Support geometry; Support
placement/export still requires a separate author decision.

## 5. Windows RTX 3080 CUDA evidence

The repository now defines a versioned `GeometryEngine` contract, Web reference
implementation, loopback client and fail-closed shadow comparison. Production
geometry remains Web-authoritative and every candidate result reports
`productionApplied: false`.

An isolated bring-up task also ran a real `evaluateContainment` CUDA kernel on
an NVIDIA GeForce RTX 3080 through `nvcuda.dll` Driver API and embedded PTX.
No CUDA Toolkit, `nvcc`, installer, update or reboot was required.

| Evidence | Result |
| --- | ---: |
| five-sample maximum margin delta vs Web | `1.02e-7` |
| 32,768-sample maximum margin delta vs Web | `5.89e-7` |
| comparison tolerance | `5e-5` |
| 32,768 samples x 200 average kernel time | `0.015416 ms` |
| measured warm-kernel throughput | about `2.126e9` sample evaluations/s |
| identity/classification comparison | matched |
| shadow / production state | `true` / `false` |

The throughput excludes context creation, PTX JIT, JSON handling and transfer;
the recorded end-to-end benchmark was about 158.7 ms. This is bring-up evidence,
not a production performance guarantee. No production helper path, browser
connection, pairing flow or signed installer exists yet. The next integration,
if authorized separately, must remain shadow-only and use the frozen comparison
fixture before any adoption decision.

The repository boundary is documented in
[the Windows compute boundary](skin-rebuild-windows-compute-boundary-20260830.md)
and
[the local-engine transport design](skin-rebuild-windows-local-engine-transport-20260830.md).

## 6. Diagnostic performance checkpoint

The read-only performance study measured the current restored fixture without
changing source, settings, seeds, tolerances or resolution.

| Area | Current measurement | Interpretation |
| --- | ---: | --- |
| Stage 4 real-browser Worker, resolution 48 | 520 / 526 / 522 ms | deterministic; no visible warm-cache gain |
| Stage 5B candidate search | 129 ms median | repeated nearest scans/full copies visible |
| containment, 270 Edges | 9.6 ms median | acceptable at current fixture size |
| containment, 1,789 Edges | 416 ms median | spatial indexing is justified |
| Stage 6 mesh generation, resolution 68 | 3.47 s median | major cost |
| Stage 6 repair/finalization | 3.82 s median | largest measured cost; about 304 MiB peak heap delta |
| topology inspection | 839 ms median | repeated full ledgers are expensive |
| Stage 7 regenerate + diagnose | 2.58 s median | repeats an available Stage 6 mesh |
| Stage 7 exact Stage 6 mesh reuse | 668 ms median | about 74% lower in the harness |

The smallest high-confidence optimization candidate is exact Stage 6 sampling-
mesh reuse in Stage 7, guarded by a precise mesh fingerprint and separate
diagnosis key. Reusing an immutable topology/component evidence ledger and
adding spatial indexing for larger containment/Stage 5B workloads are next
candidates. None of these optimizations has been applied to production.

The browser Stage 6/7 cold/warm series, finer Stage 6 sub-phase breakdown and
final stale-result/memory report remain incomplete. Partial measurements stay
outside the repository and are explicitly marked as partial.

## 7. Adoption gates and open author decisions

The following boundaries remain closed:

1. Production geometry stays unchanged until physical print observations are
   recorded.
2. Raw/Clean/Simplified/Topology Network results remain visual Lab alternatives;
   no level is a production recommendation.
3. CUDA remains a shadow candidate. Web/CPU remains authoritative.
4. FKEI remains backend-independent and the current schema is unchanged.
5. Generated BODY STL candidates require slicer inspection before printing;
   physical success, removal behavior and surface quality require human
   observation.
6. Performance candidates require regression comparison and stale/cancel safety
   checks before implementation.

The current safe sequence is therefore: compare the Network views, slice the
120 mm BODY candidate first, record physical observations, and only then decide
whether geometry, Network adoption or backend acceleration should advance.

## 8. Verification commands

The repository contracts for this checkpoint are exercised by:

```text
npm run test:skin-rebuild
npm run test:skin-local-engine
npm run build
```

All three commands passed on 2026-08-31 while preparing this snapshot. The
production build emitted only the existing large-chunk advisory. The baseline
SHA was then checked independently and remained
`4bacfcced0fe311eef704a792d61f4a68531051ff408e26d5ff2937b8bbfadcf`.
This document changes no runtime source, dependency, fixture, geometry output
or Cloudflare asset.
