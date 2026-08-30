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
