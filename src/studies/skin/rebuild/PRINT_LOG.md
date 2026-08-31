# SKIN REBUILD — Physical Print Log

実機結果が返るまで、下記baselineの形状生成・判定・修復・出力座標は変更しない。
画面表示、UI、記録、文書、公開だけを、このbaselineと分離して進める。

## Print Test #001

| Field | Record |
| --- | --- |
| Status | **printing / result pending** |
| Source checkpoint | `1681a1de1a24e220c4b5e1db55a8427c3caa0706` (`checkpoint(skin-rebuild): reach first printable export`) |
| `.fkei` source | `public/samples/skin-rebuild-first-print.fkei` |
| `.fkei` SHA-256 | `4bacfcced0fe311eef704a792d61f4a68531051ff408e26d5ff2937b8bbfadcf` |
| `generatorCommit` | `6f7b36fb115d58245044e50a48a3f3bd52c6891d` |
| Started at | _pending entry_ |
| Completed at | _pending result_ |
| Printer | _pending entry_ |
| Printer firmware | _pending entry_ |
| Material / color / lot | _pending entry_ |
| Nozzle / build plate | _pending entry_ |
| Slicer / version | _pending entry_ |
| Slicer project / profile | _pending entry_ |
| Layer / wall / infill / speed | _pending entry_ |
| Result | _pending result_ |

### `generatorCommit` provenance

`generatorCommit` とsource checkpointは別の意味を持つ。このsampleとvalidation reportは
checkpoint `1681a1d` で初めてrepositoryへ追加されたが、生成スクリプトは生成時の
`git rev-parse HEAD`を記録するため、直前のchecked-out HEAD `6f7b36f`が保存されている。
スクリプトに古いSHAのハードコードはないため、historical factとして値を変更しない。

この値は生成時のchecked-out base commitを示すが、clean working treeを証明する値ではない。
したがって追跡時は、artifactを格納したsource checkpoint `1681a1d`、このファイルのSHA-256、
validation reportを組み合わせて参照する。

### Physical checks

| Check | Result / observation | Photo / slicer reference |
| --- | --- | --- |
| outer shell | _pending_ | _pending_ |
| Surface Pattern | _pending_ | _pending_ |
| Spider Network | _pending_ | _pending_ |
| motif/network junction | _pending_ | _pending_ |
| red-face reinforcement | _pending_ | _pending_ |
| removable support | _pending_ | _pending_ |
| mesh jaggedness | _pending_ | _pending_ |
| print failure location | _pending; record layer/Z/region if any_ | _pending_ |

### Result notes

- Slicer warnings / floating regions: _pending_
- First-layer behavior: _pending_
- Support removal behavior: _pending_
- Visible defects: _pending_
- Breakage / failure sequence: _pending_
- Decision for the next geometry iteration: **on hold until this result is recorded**

## Print Test #002 — internal removable support free candidate

| Field | Record |
| --- | --- |
| Status | **unprinted / unapproved** |
| Source checkpoint | `92967bdd9dade700e263cba20b023cdf375b02ff` |
| Generator commit observed | `92967bdd9dade700e263cba20b023cdf375b02ff` |
| Generator | `scripts/build-skin-rebuild-support-free-print-002.ts` from `buildSkinRebuildProject()` + `DEFAULT_SKIN_REBUILD_SETTINGS` |
| Settings | target 120 mm; permanent Web 3.9 mm; dormant removable-support setting 1.6 mm; export resolution 68 |
| Motifs | 38 |
| Permanent Web / finalGraph | 306 nodes / 325 edges / 1 connected component; 125.72856977473991 source-unit total length / 3330.832233693637 mm at BODY scale |
| Project target audit | 20 overhang targets / 20 supported permanent targets / 0 unsupported permanent targets |
| BODY | 59,292 triangles; bounds x -24.627120..24.307546 mm, y -24.629698..23.872749 mm, z 0..120.000000 mm; scale 26.492246270368643 mm/source-unit |
| BODY topology | watertight; 1 component; 0 open edges; 0 non-manifold edges; 0 degenerate triangles; 0 winding-inconsistent edges |
| Removable Support | mode `off`; 0 nodes / 0 edges / 0 triangles; support artifact absent |
| BODY-only 3MF | generated; 1 part; 59,292 BODY faces; 0 scaffold/support faces; 0 enforcer faces; 0 blocker faces |
| `.fkei` artifact | `outputs/skin-rebuild-print-002-support-free.fkei` — 249,547 bytes; SHA-256 `21206dbe66fa9fc372c378b4166b18323ce297bd079c4bd405e7cc508a66e08d` |
| BODY STL artifact | `outputs/skin-rebuild-print-002-support-free.stl` — 2,964,684 bytes; SHA-256 `458f9fad5d54789fd40548d8ab12b8d59b5004479c2b04ea79e3b49ca5c349aa` |
| BODY-only 3MF artifact | `outputs/skin-rebuild-print-002-support-free.3mf` — 939,377 bytes; SHA-256 `94c0e7f733d359e36dc74688270b9c736dafb11a0e9a041356df30a908afadd6` |
| Validation | `outputs/skin-rebuild-print-002-support-free.validation.json`; fixed `generatedAt=2026-08-31T00:00:00.000Z`; SHA-256 `751cf91e5bb94d9249fa2f86175a65dca4d09b6f1bf315f2db3c6e086286025f` |
| Slicer / physical print | `slicerPreview=not-run`; `physicalPrint=not-run`; no approval claim |
| `printApproval` | `false` |

### Print #001 comparison (immutable validation source)

The comparison is read from `public/samples/skin-rebuild-first-print.validation.json` and its
immutable FKEI (`4bacfcced0fe311eef704a792d61f4a68531051ff408e26d5ff2937b8bbfadcf`): Print #001
records 80 mm target scale, 2.6 mm permanent Web, 59,524 BODY triangles, 67 removable-support
edges, and support present. Print #002 uses the current 120 mm / 3.9 mm default scale policy,
59,292 BODY triangles, and explicitly has no removable-support graph or artifact. These are
finite generated-artifact facts only; no slicer, physical-print, removal, strength, or safety
conclusion is inferred. The candidate remains unprinted, unapproved, and `printApproval=false`.

### 2026-08-31 — Supplied Print #001 observation / TASK A diagnosis

#### Observation (supplied by the author; not independently re-measured)

> many upper Motifs are embedded in removable support; supports pierce Motifs; one isolated ~1 mm support is removable; clustered supports are difficult to remove; prioritize leaving no support inside the finished Body.

Printer, slicer, layer/Z, material, and photographs remain pending above. This entry does not infer a
slicer or printer cause, and `printApproval` remains false.

#### Interpretation (code trace)

`main.ts` passes final artwork (`project.finalGraph`) and `lowestPoints` to
`buildSkinRebuildPrintSupport()` in `rebuild/model.ts`. That function derives contacts from non-spider
overhang lowest points, surface-unanchored artwork nodes without a lower printable neighbour, and
long shallow edge interpolation. It sets `plateRootCenterZ` from the lowest-point floor plus support
radius, then emits only vertical root-to-contact edges. `requestPillar()` never searches for the first
BODY intersection or collision-free termination.

The permanent lattice and reinforcement routes have sampled full-radius **Base** containment and a
short Pattern-back endpoint attachment exception; those checks do not inspect a removable Support
against Motif/shell/permanent Web/reinforcement. `buildSkinRebuildFinalMesh()` includes only the
Surface composite and permanent `finalGraph`; `buildPrintSupportMesh()` exports capped Support
cylinders separately. `mergeSkinRebuildGraphsAtSupportContacts()` (an exact collinear split only when a
support node lies on an artwork edge) and the Internal Print Gate provide reachability/topology
bookkeeping, not Support-vs-BODY collision checking. The missing TASK B predicate is therefore a
radius-aware intermediate-route test against the finished BODY: only the intended final endpoint may
contact the target surface; a candidate whose intermediate capsule intersects the finished BODY is
rejected and recorded as explicit unsupported. TASK B does not terminate at an earlier collision or
search an alternate path.
