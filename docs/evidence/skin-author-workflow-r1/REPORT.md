# SKIN AUTHOR WORKFLOW R1 — BOUNDED HOLD

2026-10-07。独立branch `agent/skin-author-workflow-r1`。制作UI base `6fd5beddf844b3647b88eaffae65ea326e4d6337`、Fix1 checkpoint `8147555`。MINILの制作・job・成果物には介入していない。push / merge / deploy未実施。

最終runtime `b9872c885e551b9182c758652046028636d8e83d`。最終archive `outputs/r1-final/author-workflow-r1.skincreation` は114,154,791 bytes、SHA256 `8befcd72e97c322d2d89624138d4819848cd10b325194035f2c260d5136b1673`。原本SHAを終了時にも再確認し一致。納品のGit bundleはbase `6fd5beddf844b3647b88eaffae65ea326e4d6337` を前提とする差分bundle。baseを持つ元repositoryへ別branchとしてfetchできる。追加のcode/docs/evidence zipにも今回の差分と検証証拠を含める。

**全体の AUTHOR OPERATION REVIEW READY は未達。実作品規模のP3をHOLDとする。** 小型fixtureの機械的PASSを実作品の成立に読み替えない。技術的成立、Author採用、fabrication/physical評価、Print GOは別。Send・Print GO・実機操作なし。

## 段階別の実績

| 段階 | 判定 | 根拠・限界 |
|---|---|---|
| P0 保存Fix1 | pass | 元archiveの6結果を維持。全NPZ・入力・配置byte不変。2.4mm側のsemantic hashとcountを実配列に一致。4指定digest一致。実Chromeで比較・Undo/Redo・保存・別folder/fresh reopen・破損拒否を確認。`../skin-creation-ui-v0/FIX1_REPORT.md` |
| P1 印刷条件UI | bounded pass | 実profileの機種・ノズル・材料、同材料Support/interface、Standard品質と層高、preset、明示snapshot、配置承認を実装。任意品質・別材料割当は未対応を表示 |
| P2 最新Console接続 | fixture pass / artwork未成立 | main `3437d964792ff717c2181cebfb84f8574c95eded` の `tools/slice-console` を無変更pin。既存ConsoleRouter FULL_SLICE / PACKAGE_ONLYを使用。独自Runner・fingerprint collector・reuse/cacheは作っていない |
| P3 実作品slice/package/Preview | **fix-required / BOUNDED HOLD** | 代表作品のSTL展開が14,115,790,384 bytes・282,315,806三角形。export後、native起動前にCancel。実作品G-code・package・Previewなし |
| 保存再開 | bounded pass（実操作証拠参照） | 造形、比較、選択、preset、recipe、失敗履歴をarchiveで保存。別folder、新規Chrome contextで同一性・自動再sliceなしを検証。完成実作品resultの再bindは未成立。bundle hash検証は限定テスト |

## 実作品の停止点

対象は旧制作UIの小花 g=11/15・枝2.2mm、snapshot `85b317379b62460db0ee1e9fbf3ea426`、structure `f0c2ddaaa455de11435319287fa73b49e6675d2541052c8f2eed48d7f1b9fea4`。MINILではない。

D6実mesh 65,144三角形 × 4,283個 + Permanent internal。全part一体の平行移動のみ、拡縮・簡略化・修復・Host混入なし。source bounds と移動量は `outputs/r1-browser/PRELAUNCH.json`、実exportは `outputs/print-artifacts/3a6a3a92e21c4227813f8b0d26571daa/GEOMETRY_LOCK.json`。

実行時runtime `74b750d`、attempt `3a6a3a92e21c4227813f8b0d26571daa` は `CANCELLED / Cancelled before launch`。STL SHA256 `d275b39d2fe20672ed3f409a0880d8a22434b3d3fd1a30b31a6975ab50f59117`。診断用14.1GB STLはtask内 `work/cancelled-artwork-stl/assembly.stl` に移動保全。完成成果物ではない。現在のAPI/UIは512MiBの展開上限を明示し、事前にsliceを止める。同じ巨大jobを再試行していない。

最小の次作業は、**形状を変えずD6共有mesh/instanceを保持するnative入力経路を、既存Consoleの契約に合わせて検証すること**。この版のsingle-STL入力では代表作品を完走できず、Authorが実作品印刷データまで自走できるとは報告しない。未知のnative_saved状態や他作品contextを捏造して代用しない。

## fixtureの成立範囲

| 機種 | nozzle | 材料 | Standard層高 | native resolved | matching-context package | GUI Preview |
|---|---|---|---|---|---|---|
| A1 | 0.4 | PLA | 0.2mm | PASS | PASS | 実確認PASS（小型boxのみ） |
| A1 mini | 0.4 | PLA | 0.2mm | PASS | PASS | 未実施 |
| A1 | 0.4 | PETG | 0.2mm | PASS | PASS | 未実施 |
| A1 | 0.6 | PLA | 0.3mm | PASS | PASS | 未実施 |

engineは既設Bambu Studio 02.08.02.61。installed resourceと継承/include解決後profile、engine SHAを保存し、fixture確認済みsignatureと違う環境は拒否。project filamentは1、support/interfaceの0は同材料automatic。物理AMS slot未指定。通常Support有効設定をnative resolvedで確認したが、小型boxでは実作品のSupport量・接触・除去性・chronologyを証明していない。

初回4条件はslice後のnative exportで-13。Bambuのexport引数がoutputdir相対であることを[当該versionの実装](https://raw.githubusercontent.com/bambulab/BambuStudio/v02.08.02.61/src/BambuStudio.cpp)で確認し、basenameに修正した4回が成功。失敗記録を保全。native sliced-only packageはCRC/hashが通ってもGUIで「ジオメトリデータが含まれていません」と拒否された。完成standalone G-code + **その同じ実行の** native.3mfを既存PACKAGE_ONLYへ渡した4packageが成立。A1/0.4/PLAをBambuで開き、10層、0.20mm、A1、PLA、0.4mm、時間7m33s、材料0.12g表示を確認。再slice・Send・造形開始は押していない。

`outputs/fixtures-export-path-fix/*/matching-context-package/` が有効なfixture package。`runs-output/.../plate_1.gcode.3mf` は旧sliced-only検査証拠でありGUI成立品として採用しない。`FIXTURE_RESULTS.json`の生のreview_readyもGUI合格を意味しない。GUI証拠 `outputs/preview-fixture/A1-04-PLA-preview.jpg`。

## 起動と操作

このPCの通常入口は `work/katachi-r1/tools/skin_creation/launch.ps1`。UI5196 / API5197を使用し、使用中portがあれば既存サービスを止めず終了する。現在の検証サーバーが動いている間は `http://127.0.0.1:5196/skin-rebuild.html?mode=creation` を開く。旧5188/5189は触らない。

最終runtimeのランチャーを実起動し、新規APIへ納品archiveを実UIで読み込んで確認済み。開始から再描画・recipe表示まで37,269ms、browser errors0。証拠 `outputs/r1-final/LAUNCHER_RESULT.json` / `03-final-runtime-launcher.png`。`outputs/Launch-SKIN-Author-R1.ps1` はこのローカルrepositoryを指す通常起動wrapper。

このPCには既設Python/vendorとNode dependenciesがある。別PCの初回setupでは `npm ci`、Python numpy/scipy/trimesh/manifold3d、Bambuの既定実行path/profileを用意する必要がある。engine/profile hashが違えば改めてfixture検証が必要で、自動upgradeしない。通常操作にLLM/API key/JSON編集は不要。setupの完全な別PC移植は未検証。

1. `outputs/r1-final/author-workflow-r1.skincreation` を「開く」で読む。旧オリジナル未修正版は勝手に移行せず、P0の明示変換を使う。
2. 比較して「この候補を印刷対象に選択」。機種・材料などを選び、必要ならpreset保存/読込。
3. 「選択snapshotと条件を確認」で実profile・bounds・移動量を見る。「表示した平行移動を適用」は全部品一体の移動。今回の実作品はサイズ上限を表示して実行不可となる。
4. 保存で造形・recipe・過去attemptを維持。開くだけではsliceしない。完成resultがある場合は別の `.skinprint` bundleを併せて保存し、移動後はhash一致で再bindする設計。今回、その完成実作品resultはない。

## 検証と残る限界

P0 Python9、既存authoring5/composition8、build PASS。最終Pythonは保存9・print境界5 PASS。既存Console16テストPASSはsynthetic/fake実行を含み、実機成立ではない。実Chrome証拠は `outputs/r1-final/BROWSER_RESULT.json`。preset応答中の選択リセットを修正し、処理中の操作を無効化した。初回Browser接続失敗・preset待機失敗は破棄せず記録を保持。巨大export中にVite接続が切れたため、APIの実行記録を独立に確認してCancelした。

geometry再生成0回。native fixture初回失敗4回＋原因を限定修正した4回、既存G-codeのPACKAGE_ONLY4回。実作品native sliceは0回、STL export1回。UI→最新adapter→実作品G-codeの通し成立なし。実際に変更したコードは保存メタデータ、印刷UI、profile/input adapter、専用port入口と証拠のみ。Consoleコードはpinしたまま。

最終build PASS（Vite8.33秒、既存chunk-size警告のみ）、git diff --check PASS。P0以降の全geometry再生成回帰は実施していない。fixtureの確定package検査は `MATCHING_CONTEXT_FIXTURES.json` を参照。共有worktree作成がWindows環境で失敗したため独立cloneで作業した。失敗時に元common repositoryへ作られた未使用Fix1 branch refは保全し、元checkout・原本は変更していない。

通常操作からAI依存を外すUIは実装したが、実作品入力経路のHOLD解除には追加実装が必要。生成・描画・保存の全工程の厳密な計測比較は未完了。APIログ上、代表の最終bounds確認は約11秒、保存packは約24秒（通信・描画完了を含むend-to-end測定ではない）。元作品generationの速度改善はしていない。

FOLLOW-UP: native共有mesh入力、実作品のSupport/chronology診断、実作品package/Preview/完成resultの移動再bind、他fixture GUI Preview、別PC setup検証。これらを完了扱いにせず、今回のP3 blockerを限定して引き継ぐ。全体レビュー判定 **fix-required**。局所technical PASSは記録済み、Author ACCEPT/Print GO/Productionへ昇格しない。
