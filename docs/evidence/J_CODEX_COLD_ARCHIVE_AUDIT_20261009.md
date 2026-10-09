# J:\My Drive\codex — Cold archive read-only audit

監査日: 2026-10-09 JST  
**結論: 今日以外を全部Dへコピーした後、Jから一括削除してよい、とは判定しない。**  
この文書は削除・コピー・移動の実行指示ではない。今回ユーザーのJ/D、Git、クラウドに書込みなし。

## 1. 監査範囲

GitHubの2026-10-09 MINIL CURRENTと、ALL_SKIN側MINI_A PR #56のcommit固定CURRENT／SOURCE_BINDING／実コード、Driveの最新MINIL checkpoint・診断ZIP内INPUT_LOCK、R1納品報告を読んだ。Windows実機の全ファイル、プロセス、ローカルGit状態、Drive Desktop設定、D照合は未実施。これらの未確認を「問題なし」にしない。

MINI_A PR #56: Draft/open/unmerged、remote HEAD 90319254754bc54e76eb6d5b1c986782c9b62be4。remoteへの公開はローカルdirty/untracked/unpushed不存在を証明しない。
MINIL: Issue #36追補6077471500、main公開commit f87aeedb71725782b2db7a24ba6f8a84956ca2fcを確認。HOLD、現在の実装taskなし、4-part候補は未着手。停止していても入力・修正済みCAD・interlock evidenceは再開authority。

## 2. 分類の意味

- SAFE_TO_COLD_ARCHIVE_AND_RETIRE_FROM_J: コピー完全照合、現在の依存解決、Git/プロセス、クラウド処理、保持方針の全条件が揃ったもの。**今回の確定0件**。
- SAFE_TO_COPY_TO_D_BUT_KEEP_ON_J: 変更されない証拠をDへ保全する候補。現時点のJ退役は不可。
- KEEP_ON_J_ACTIVE: 現行runtime入力、現行作品authority、再開対象。OSのプロセスが今動いているという意味ではない。
- HOLD / UNKNOWN: 情報不足。自動ローカル監査でそのjobだけ解決し、全フォルダの作業を止めない。

親フォルダに複数分類が混在すれば、親の一括退役は不可。「例外に一致しない」だけで退役可へ昇格しない。

## 3. 現物から絞れた重要依存

### MINI_A: 今日のVisualizer → 9月10日の三つのJSON

`tools/minia_internal_repair/real_graph.py` のContextが下の3ファイルを指定pathで読んでSHA照合する。3ファイルの記録容量合計は38,281,608 bytes（約36.51 MiB）。これは9月10日全57.26 GiBがruntimeに必須という意味ではない。

- `J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_A_MINI_LOCAL_LOBE_R1\data\structure.json`
- `J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_ROOT_LAUNCH_R5\data\FROZEN_ADDITIONS.json`
- `J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_A_F2_PRINT_PREPARATION\A\data\support_geometry.json`

別途、9月22日のMINIA_PLA_EDITABLE_REPACKED.3mf、9月23日の成功版package、9月10日のsource/transform/provenanceを現在の編集baselineとして参照する。実行直読と再現/証拠用途は別分類とした。

### MINIL: 最新A++ → 8月31日・9月28日の入力

ダウンロードした4,187,559 bytesの診断ZIPはSHA256 16f538ce3ac56170cdad0485ce9c9b1e13c0355022fecc89fce3c74c84ad5de2。
ZIP内 `evidence/A_PLUS_LARGER_3PART_20261007T/INPUT_LOCK.json`を独立読取。8/31の凍結replay bundleの9入力と、9/28の修正済みCAD3入力を参照している。記録されたpostcheck PASSは当時のsource報告で、今回J上のbytesを再hashした意味ではない。
巨大元mesh・過去G-code/3MF・依存runtimeはZIPに含まれない。新しい4 MB証拠ZIPとGitHub CURRENTだけを残しても、完全replayには不足する。

### R1: 差分Git bundleだけでは全復元できない

R1 REPORTは独立clone、未push、差分bundleが6fd5bedd... baseを必要とすることを明記。runtime/起動先は10/7 work/katachi-r1。元creation repositoryを退役させる前にbase objectとGit共通データの保全を確認する。
同reportの14.1 GB診断STL `work/cancelled-artwork-stl/assembly.stl` はcold化の有力候補。ただし最新P3依存、D照合、クラウド扱い未確認のため削除承認ではない。

## 4. job / path別一覧

以下はJ上の存在や現物サイズを新しく確認したinventoryではない。remote sourceが指す必要path・Author報告に基づく分類である。詳細なhash・出典は同名JSONを参照。

| ID | 分類 | J:\My Drive\codex 以下 | 理由 |
|---|---|---|---|
| K00 | `KEEP_ON_J_ACTIVE` | `2026-10-09` | Authorが残す対象。MINI_A V2の現行配布物・runtime・cache・新編集の保存先。 |
| K01 | `KEEP_ON_J_ACTIVE` | `2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_A_MINI_LOCAL_LOBE_R1\data\structure.json` | real_graph.Contextが開始時にこの原pathから読んでSHA照合し、その後の入力変更検出にも使う。 |
| K02 | `KEEP_ON_J_ACTIVE` | `2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_ROOT_LAUNCH_R5\data\FROZEN_ADDITIONS.json` | real_graph.Contextが開始時にこの原pathから読んでSHA照合し、その後の入力変更検出にも使う。 |
| K03 | `KEEP_ON_J_ACTIVE` | `2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_A_F2_PRINT_PREPARATION\A\data\support_geometry.json` | real_graph.Contextが開始時にこの原pathから読んでSHA照合し、その後の入力変更検出にも使う。 |
| K04 | `KEEP_ON_J_ACTIVE` | `2026-09-22\skin-fukei-slice-runner-execution-3` | MINI_Aの現行編集基準MINIA_PLA_EDITABLE_REPACKED.3mfとrepacking evidence。最低限この原本・根拠・解決済み入力参照を保持。job全体は暫定保護粒度。 |
| K05 | `KEEP_ON_J_ACTIVE` | `2026-08-31\skin-rebuild\work\katachi-skin-mini-target-internal-replay-v0` | 最新A++のINPUT_LOCKがこのworktree内の凍結再生成bundleを直接参照する。worktree/Git共通管理情報の実機所在は未確認。 |
| K06 | `KEEP_ON_J_ACTIVE` | `2026-09-28\files-pasted-by-the-user-minil` | 最新の修正済みCAD・interlock・A++ L2/L3証拠の再開元。停止中であってもactive authority。job全体は暫定保護粒度で、過去attempt全部のhot保持を永久指定するものではない。 |
| K07 | `KEEP_ON_J_ACTIVE` | `2026-10-07\skin-author-workflow-r1-astra-handoff\work\katachi-r1` | R1のlaunch.ps1が参照する未完P3再開repository。reportでは独立clone・未push。現時点のdirty/プロセスは未確認。 |
| P01 | `SAFE_TO_COPY_TO_D_BUT_KEEP_ON_J` | `2026-09-23\files-pasted-by-the-user-fukei\outputs\R4_MINIA_TERMINAL_REVIEW_20260922` | MINI_Aの印刷実績版packageと証拠。D照合後もクラウド参照・再開解決を変えるまではJ退役不可。 |
| P02 | `SAFE_TO_COPY_TO_D_BUT_KEEP_ON_J` | `2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_A1_MINI_RELEASE_CANDIDATE` | MINI_Aのsource binding/transform/再現用原本。親subtreeは保守的分類。K01–K03に一致する実行依存はKEEPを優先。移設後の参照解決と証拠保存が確認できれば縮小可能。 |
| P03 | `SAFE_TO_COPY_TO_D_BUT_KEEP_ON_J` | `2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_D6_SIZE_RHYTHM_V2` | MINI_Aのsource binding/transform/再現用原本。親subtreeは保守的分類。K01–K03に一致する実行依存はKEEPを優先。移設後の参照解決と証拠保存が確認できれば縮小可能。 |
| P04 | `SAFE_TO_COPY_TO_D_BUT_KEEP_ON_J` | `2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_A_F2_PRINT_PREPARATION` | MINI_Aのsource binding/transform/再現用原本。親subtreeは保守的分類。K01–K03に一致する実行依存はKEEPを優先。移設後の参照解決と証拠保存が確認できれば縮小可能。 |
| P05 | `SAFE_TO_COPY_TO_D_BUT_KEEP_ON_J` | `2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_A_MINI_LOCAL_LOBE_R1` | MINI_Aのsource binding/transform/再現用原本。親subtreeは保守的分類。K01–K03に一致する実行依存はKEEPを優先。移設後の参照解決と証拠保存が確認できれば縮小可能。 |
| P06 | `SAFE_TO_COPY_TO_D_BUT_KEEP_ON_J` | `2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_ROOT_LAUNCH_R5` | MINI_Aのsource binding/transform/再現用原本。親subtreeは保守的分類。K01–K03に一致する実行依存はKEEPを優先。移設後の参照解決と証拠保存が確認できれば縮小可能。 |
| P07 | `SAFE_TO_COPY_TO_D_BUT_KEEP_ON_J` | `2026-10-07\skin-author-workflow-r1-astra-handoff\outputs` | 納品skincreation・検証証拠・起動wrapper・差分Git bundle。差分bundleは6fd5bedd baseを必要とし単体で全履歴復元不可。 |
| P08 | `SAFE_TO_COPY_TO_D_BUT_KEEP_ON_J` | `2026-10-07\skin-author-workflow-r1-astra-handoff\work\cancelled-artwork-stl` | assembly.stlはnative前Cancel時の診断保全物。hot pathから外す有力候補だが、最新P3の参照・D一致・cloud取扱い未確認のため現時点の退役承認ではない。 |
| P09 | `SAFE_TO_COPY_TO_D_BUT_KEEP_ON_J` | `2026-09-23\minib-bounded-repack-prepare-only-minib` | MINIB R2のexact送信用package・mapping証拠。失敗/旧日付だけで削除せず、同一成果とcloud参照を保全する。 |
| U01 | `HOLD / UNKNOWN` | `2026-09-22\skin-repo-satw-jp-katachi-task\work\skin-creation-ui-v0` | R1差分bundleのbase repository候補。元base object、common dir、dirty/unpushed、他worktree参照を実機で読むまで退役保留。 |
| U02 | `HOLD / UNKNOWN` | `2026-09-05\files-mentioned-by-the-user-samples\work\r2\vendor` | real_graph.pyのNetworkX fallback。今日の配布runtime内ZIPで解決すれば実行時依存ではない。現機の解決元・他利用元は未確認。 |
| U03 | `HOLD / UNKNOWN` | `2026-09-20\files-pasted-by-the-user-fukei\outputs\fukei_slice_runner` | 旧Runner運用入口。最新版コードの存在だけでは既存shortcut/起動設定の切替は証明できない。現機の.lnk/task/process参照を確認する。 |
| U04 | `HOLD / UNKNOWN` | `2026-09-06` | 37.49 GiBはAuthor報告。date内jobの全量inventory・依存・Git状態未確認。 |
| U05 | `HOLD / UNKNOWN` | `2026-09-18` | 21.75 GiBはAuthor報告。date内jobの全量inventory・依存・Git状態未確認。 |
| U06 | `HOLD / UNKNOWN` | `all dated folders earlier than 2026-10-09 not covered by verified entries` | 上記以外の日付/未列挙jobは未監査。検索非ヒットを退役承認にしない。 |

## 5. 追加の原本保護

Large #35のfinal geometry、exact standalone G-code、DEFLATE packageは判定B。正確なJの所在は今回未解決なので日付を推測しない。JSONに名前・hashを保持した。全日付のローカル台帳に突き合わせ、候補fileだけhash照合する。全大容量ファイルへ検索目的のSHA計算を一斉実行しない。

MINIB/C・MINIA・Largeのphysical写真、actual sent payload、原profile、失敗の比較evidenceは「失敗/過去」のためだけに不要判定しない。再生成できるgeometryと一回限りの物理観察は異なる。

## 6. Google Drive境界

J:\My Driveが現役同期場所なら、通常の削除や同期領域外への移動はクラウドにも反映される前提で扱う。ローカルDのfile SHA一致は、クラウドfile ID・共有・revision history・CURRENT中Driveリンクの存続を保証しない。

現在のDesktop同期モード、Jの実体（実ディスク/仮想Drive/ミラー/cache）、D保存先が同期対象外であることは未確認。

空き容量を増やす目的なら、cloud原本は維持し、安定ファイルをDへ独立保全したうえで、非activeファイルのローカル保持だけを減らす方式が第一候補。streaming時のオンライン専用化と通常Deleteは別。mirror時は同じ手順ではない。モード変更は同期完了・新旧path確認が必要で、今回実施しない。

同期一時停止のまま削除して再開、DriveFS cacheの手動消去、未検証のjunctionやsymlink置換は行わない。未同期cacheには唯一の変更がある可能性がある。

Dだけに残す本当のcloud retirementを選ぶ場合は、Driveリンク/履歴の喪失を含む別の明示決定が必要。不可逆なphysical evidence/未公開codeは単一Dコピーだけへ減らさない。

## 7. 容量

容量はAuthor報告: J空き58.77 GiB、D空き889.79 GiB。例示6日合計343.62 GiB。これはcodex全量でも、削除によって回復する実ディスク量でもない。D必要量は全対象のlogical bytes、実allocation、重複・再解析・cache hydrationの影響を区別して計算する。

## 8. 手作業を増やさない実施案（今は監査のみ）

1. 添付JSONの既知例外をseedとして、実機担当が日付/job全体を一回だけread-only inventoryする。
2. Git/実行/設定参照で見つかった追加例外だけ機械的に保護。その他を一括処理候補へ集約し、ファイル単位でAuthorに質問しない。
3. inventory/同期/原本参照の未確認はそのjobだけHOLD。非該当jobの確認を続行する。
4. コピーが後で明示許可されたら、まず安定した普通のデータをDへ非破壊コピーし、相対path集合・件数・bytes・file SHA・source安定性を照合。live Git/DB/書込中runは整合snapshotとして別扱い。
5. J退役はコピーとは別gate。自動RETIRE_LISTは検証PASSのものだけ。cloud originalを残すlocal-only回収と、cloudも退役させる削除を分ける。

今回retire_approved_pathsは空。既知例外を除いた全てを削除してよい、というallowlistにはしない。

## 9. 出典

- https://github.com/satw-jp/katachi/blob/90319254754bc54e76eb6d5b1c986782c9b62be4/docs/evidence/minia_internal_repair/SOURCE_BINDING.json
- https://github.com/satw-jp/katachi/blob/90319254754bc54e76eb6d5b1c986782c9b62be4/docs/evidence/minia_internal_repair/TRANSFORM_AND_REFERENCE_LOCKS.json
- https://github.com/satw-jp/katachi/blob/90319254754bc54e76eb6d5b1c986782c9b62be4/tools/minia_internal_repair/real_graph.py
- https://github.com/satw-jp/katachi/blob/90319254754bc54e76eb6d5b1c986782c9b62be4/tools/minia_internal_repair/README.md
- https://github.com/satw-jp/katachi/pull/56#issuecomment-6077496245
- https://github.com/satw-jp/katachi/blob/main/docs/evidence/SKIN_MINI_MANUFACTURING_AUDIT_2026-10-09.md
- https://drive.google.com/file/d/12LVDoKjJY53FmLF5TzJw4CMAf3m8W97K/view
- https://drive.google.com/file/d/17B1Q_P5YSvq2JtWKF0AQyYvG9L-Im9nK/view
- https://drive.google.com/file/d/118Hkl5hEvOzAKRRQsPSpCf58gE92_kCZ/view
- https://support.google.com/drive/answer/13401938?hl=en-Link
- https://support.google.com/drive/answer/16631477?hl=eN
- https://git-scm.com/docs/git-worktree.html

- https://github.com/satw-jp/katachi/issues/36#issuecomment-6077471500