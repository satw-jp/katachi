# 実在資料・アセット・確認範囲の索引

[工程本編へ](README.md) / [新形状ひな形](NEW_SHAPE_RUN_TEMPLATE.md)

この索引は**既存sourceの所在と何を裏付けるか**を示します。raw geometryの再生成、テスト再実行、巨大原本の再hash、Blender/プリンタ操作は本資料作成では行っていません。future workflowの不足を一般知識で埋めて実装済み扱いしていません。

## 確認したGitHub snapshot

- main：`f87aeedb71725782b2db7a24ba6f8a84956ca2fc`。
- 操作系保存archive：`c75d4b0adcf04b0ad8bde7810dc906e72c36e948`。
- PR #59 / add-on：`b63538933969e570b50e8ea46a7e3b70f624744f`、確認時Draft/open/未merge。
- この文書はmainから独立した`docs/skin-stl-to-print-workflow-v1`に追加。Astra/Solの実装branchやarchiveを変更しない。

以後の実行時は、そのcaseのactual CURRENTとIssue/PRの追補を確認してください。**固定snapshotは比較用の根拠であって、永続的に最新という意味ではありません。** 古いmain文書を理由に新しいbranchの完了工程をやり直しません。

## S01｜共通authority

- [AGENTS.md](https://github.com/satw-jp/katachi/blob/f87aeedb71725782b2db7a24ba6f8a84956ca2fc/AGENTS.md)
- [TEAM_PROTOCOL_CORE.md](https://github.com/satw-jp/katachi/blob/f87aeedb71725782b2db7a24ba6f8a84956ca2fc/docs/TEAM_PROTOCOL_CORE.md)

GitHub技術authority、bounded実装、decision-owner review、原本/dirty保護、Authorのphysical/Print GO gateを規定。旧Sol名称は退役advisor pluginの呼出しを意味しない。

## S02｜配布可能なEditorの現状

- [Issue #58：非造形の可搬化task](https://github.com/satw-jp/katachi/issues/58)
- [Draft PR #59](https://github.com/satw-jp/katachi/pull/59)

PR本文・refを取得。PRの保存記録は隔離install、kernelパリティ、fresh reopen、同じ環境での再移設、原本55/保存コード352のSHA不変。**この資料が試験を独立再実行したわけではない。** 実GUI、別PC、companionのStart/resume、Drive cloud syncは未確認。#58の作成時点のNOT STARTEDだけを見て実装を再開しない。

## S03｜インストール、Bind、移設、復旧

[ADDON_INSTALL_AND_RESTORE.md](https://github.com/satw-jp/katachi/blob/b63538933969e570b50e8ea46a7e3b70f624744f/tools/skin_branch_editor_addon/ADDON_INSTALL_AND_RESTORE.md)

Windows / 記録上Blender 5.2.2 LTS。元データを独立コピーし、環境ディレクトリを先に作った隔離設定で動かす。enableとproject Bindを分離。保存後の再Bind、unregister、移設後のmanifest pathの明示選択、companionの別扱いを説明する。

**これは既存MINIAの復元手順。任意STLからの新case importerではない。**

## S04｜PROJECT.jsonの実装上の制限

[create_project.py](https://github.com/satw-jp/katachi/blob/b63538933969e570b50e8ea46a7e3b70f624744f/tools/skin_branch_editor_addon/create_project.py)

実codeを読取確認。依存manifestの各SHA、開いているLOWER70 source、埋込`MINIA_SOURCE_LEDGER.zlib.base64`とsceneのledger SHAを照合する。新しい`AUTHOR_WORK_COPY.blend`と`PROJECT.json`を作り、既存出力の上書きを拒否する。

生成schemaは`MINIA_EDITOR_PROJECT_V0`。files、work_file、source_ledger_sha256、source_to_plate、source_reference_fingerprints、readonly_runs等を保存する。

**新HostのJSONをそのままこの関数へ渡せないことが、別形状対応の明確な未接続点。** guardを書き換えて適合したように見せず、新case用の明示adapterとroundtrip検証が必要。

## S05｜配布物のidentity

[DISTRIBUTION.json](https://github.com/satw-jp/katachi/blob/b63538933969e570b50e8ea46a7e3b70f624744f/tools/skin_branch_editor_addon/DISTRIBUTION.json)

記録値：

```text
SKIN_BRANCH_EDITOR_0.1.0.zip
bytes: 227577
SHA-256: 48d8aa43115ccfa8fa5d17d85a1fad75c8491afd131b88c7ed5ddeb604c6009d
保存先:
J:\My Drive\codex\2026-08-31\skin-rebuild\outputs\
minia-blender-addon-v0-evidence\SKIN_BRANCH_EDITOR_0.1.0.zip
```

cloud_share_urlはnull、cloud_syncはUNVERIFIED。ローカル同期pathを既存クラウド共有URLと偽らない。本資料ではZIP bytesをダウンロード・再hashしていない。

## S06｜STL→花→枝→保存のComposition設計

[SKIN_COMPOSITION_FLOW_V0.md](https://github.com/satw-jp/katachi/blob/f87aeedb71725782b2db7a24ba6f8a84956ca2fc/docs/tasks/SKIN_COMPOSITION_FLOW_V0.md)

原本STL、花prototypeとframe、単位/変換、面積sampling、実instance、branch recipe、保存復元の設計がある。**文書の状態は実装開始前。今回、完成E2E実行の証拠としては使わない。** `inset-relay-mst-v0`と`.skincomp / katachi.skin.composition.v0`は、この設計の範囲で読む。

例の入力：

- [mocomoco_221104.stl](https://drive.google.com/file/d/1J-72M2eY8nrujwlrpIJNtU0lb47WKrPR/view)：文書記録13,318,784 bytes / 266,374 triangles / SHA `c848ea33eebf4b65ad4386fede4c82a7f1185e921098a5c018135cda1fad6c4e`。
- [motif_63_D_BACKARC.npz](https://drive.google.com/file/d/1PFsI4DFFbHq4d3UUVGpjEidCv9pspJV4/view)：文書記録SHA `ddb793d271fda8bd649676381b2deed48580f6192d84169a5032f99a81ca8c8f`。
- [patch_identity.json](https://drive.google.com/file/d/1DKbym-AAB0QhHBptYc3Mvpuvt9e35WPz/view)：花の元frameの出典。

この数値・配置preset・寸法を、新しいSTLや実印刷用R4へ自動転用しない。

## S07｜MINI TARGETという別の花配置

- [Issue #33](https://github.com/satw-jp/katachi/issues/33)（関連する選択の出典）
- [Issue #36](https://github.com/satw-jp/katachi/issues/36)（TARGETの入力lockと枝再生成設計）
- [TARGET placements.npz](https://drive.google.com/file/d/1pW74VIu0ezqS7njBOVQxzSdnomKMwYaZ/view)
- [TARGET surface.json](https://drive.google.com/file/d/1d6mFMsE23WVZNWM9TD1ng4MDDON8OFTZ/view)
- [TARGET flower_back_anchors.json](https://drive.google.com/file/d/1-NWSr4yGkmBgtqGkKKhTFGixcQqHUGGR/view)

会話に提供されたJSON本文では2,303 instance、`skin_surface_replay_v0`、world anchor等を確認できる。anchor文書は`CANDIDATE_UNCONNECTED / connected_geometry=false`という**その保存段階**の記録。

#36はgeometry authorityをplacements＋locked D6＋accepted anchorに置き、JSON mirrorだけから別geometryを選ばないよう指定。**このindexは#36の全後続実装を再監査したものではなく、現時点の生成成否を古いanchor statusだけで断定しない。**

## S08｜旧R4の花と接触の実データ

- [R4_D6_SIZE_RHYTHM_V2 data](https://drive.google.com/drive/folders/1SDB_5y6tqN59TePc43GnRMHYSqLovdhR)
- [surface.json](https://drive.google.com/file/d/1KWmS-mlpJKbMsv70F6pfa9brKG9Gih8b/view)
- [parameters.json](https://drive.google.com/file/d/1QYE3xM64sIbe4SsWS_ZMxw1rIO59YC7e/view)
- [natural_contacts.json](https://drive.google.com/file/d/1NfYksC6gCkeMuGB1leM0tTJiW3NhFCSq/view)
- [host.npz](https://drive.google.com/file/d/1ocUDEVt-AnZ9o_FuiqEH83asF6xkNofk/view)
- [D6_local.npz](https://drive.google.com/file/d/1xHPTV8ncz8_c-Ydl1aJCkBqKs2Xw0YSC/view)

会話に提供された本文には花ID、position_mm、normal、orientation_matrix、physical_scale、host_triangle_id、connection_base_local_mm等がある。parametersは4,283花を記録。**surface gate時点のattachment未更新と、後続の実際の枝接合は別。** natural_contactsの数値・接触ペアはこのlayoutとsource fingerprint専用で、新caseの接触判定ではない。

## S09｜実R4系の枝recordと生成の分離

- [旧Local Lobe structure.json](https://drive.google.com/file/d/1Qv9pOqs3a_14QEaf-JdRiOjBGmzgUr0n/view)
- [#36のA-derived sourceとrecipeの説明](https://github.com/satw-jp/katachi/issues/36)

提供本文にROOT_ADDITION、SHARED_CORE等の種類、中心線、parent/target、径/テーパー、mesh_sourceと変更履歴がある。**宣言graphと実材接触、source単位とMINIA plate変換を分ける。** #36のHost-only core保持はその同系Hostに限るrecipeで、任意STLへ同じcoreを置く指示ではない。

## S10｜Editorから製造へ戻す歴史的契約

[EDIT_TO_PRINT_PIPELINE.md](https://github.com/satw-jp/katachi/blob/b63538933969e570b50e8ea46a7e3b70f624744f/docs/evidence/minia_internal_repair/EDIT_TO_PRINT_PIPELINE.md)

この固定文書はV1時点の追加専用patch、native baseline保持、inverse transform、geometry・slice・package・Author gateの契約。文書自体が実材化後の完成packageを実証したものではないと明記している。

**重要な版差：** 後のworkspaceには削除mask/rerouteがある。旧契約の「既存枝削除はHOLD」と後の承認済み編集を黙って統合せず、現在のAstra製造taskが何を受け付けるか確認する。AuthorはAstraへ印刷データ作成を任せたと報告しているが、**この資料作成ではその最新packageのexact path/SHAと成果を再検証していない**。完成を否定も、新しいPrint GOを付与もしない。

## S11｜操作系archive・評価式・履歴

固定archive `c75d4b0adcf04b0ad8bde7810dc906e72c36e948`：

- [README](https://github.com/satw-jp/katachi/blob/c75d4b0adcf04b0ad8bde7810dc906e72c36e948/tools/minia_author_workspace/README.md)
- [ARCHITECTURE](https://github.com/satw-jp/katachi/blob/c75d4b0adcf04b0ad8bde7810dc906e72c36e948/tools/minia_author_workspace/ARCHITECTURE.md)
- [USER_GUIDE](https://github.com/satw-jp/katachi/blob/c75d4b0adcf04b0ad8bde7810dc906e72c36e948/tools/minia_author_workspace/USER_GUIDE.md)
- [OPTIMIZER](https://github.com/satw-jp/katachi/blob/c75d4b0adcf04b0ad8bde7810dc906e72c36e948/tools/minia_author_workspace/OPTIMIZER.md)
- [HISTORY](https://github.com/satw-jp/katachi/blob/c75d4b0adcf04b0ad8bde7810dc906e72c36e948/tools/minia_author_workspace/HISTORY.md)

元9,421 record・18,842端点anchorなどを保護した編集基盤、追加点・削除区間・rerouteのregistryを記録。これらの件数を新caseの必須件数にしない。

現optimizerは支持距離＋合流補正、局所花支持とclearance等による探索。全層の保持、花の離れた複数接点、物理強度、透明性の最適化は未証明。RUN_007の200本/LINK_LIMIT/赤ゼロ未達は探索保存結果であって印刷packageではない。

## S12｜Runnerと再現索引の境界

- [R5_SLICE_RUNNER_CURRENT](https://github.com/satw-jp/katachi/blob/f87aeedb71725782b2db7a24ba6f8a84956ca2fc/docs/status/R5_SLICE_RUNNER_CURRENT.md)
- [Issue #28：FUKEI Repro Packager](https://github.com/satw-jp/katachi/issues/28)

Runner側の入力locks・execution context・resultを再利用する。上記CURRENT先頭にはrequest identityと環境/coverage未解決を分ける記録がある。**request key、cache再利用可否、実G-code一致、印刷可否をまとめない。** loader調査を本資料から再開しない。

#28は参照型の再現入口のtask。巨大geometryのbackup、作品生成、slice、Print GO判定と別。文書があるだけでツールの最新実装完了と判断しない。

## S13｜初期造形・profile・メモリでの失敗教訓

[Issue #38：MINIA 0.2 PETG](https://github.com/satw-jp/katachi/issues/38)

標準startup欠落、33GB級メモリ不足、精度維持、旧READY撤回が記録された**別lane**。接点toolpath PASSだけでは正しいmachine startupや物理初層を証明しない。現在のAstraの別packageへ、この旧laneのHOLDを無条件に移したり、逆に取り消したりしない。

## S14｜旧MINIAの印刷実績とpackage identity

[SOURCE_BINDING.json](https://github.com/satw-jp/katachi/blob/b63538933969e570b50e8ea46a7e3b70f624744f/docs/evidence/minia_internal_repair/SOURCE_BINDING.json)

会話に提供された`PACKAGE_RESULT.json`本文とsource bindingの保存記録が、次を指す。

```text
旧印刷用package:
J:\My Drive\codex\2026-09-23\files-pasted-by-the-user-fukei\outputs\
R4_MINIA_TERMINAL_REVIEW_20260922\package_only\plate_1.gcode.3mf
bytes: 178806997
SHA-256: 1533927c778c49fc5f84ccc0388de8ee09bca5d9a1b826cb475d32ea9826040d
embedded: Metadata/plate_1.gcode
G-code bytes: 674530071
G-code SHA-256: b90c9037bf38a63ac852d77e7326c5cc99b605f0091cca19b1b68ba7dd561ad9
記録: 778層 / Z155.8mm / A1 mini / PLA

編集原本:
J:\My Drive\codex\2026-09-22\skin-fukei-slice-runner-execution-3\outputs\
MINIA_PLA_EDITABLE_REPACKED.3mf
SHA-256: 2fd6d48034e46c2e9e0200fd3ed145159d825035df3892bc1f61ac4e2d4f9736
```

完走・除去後の外形保持という実物報告と、内部損傷というAuthor観察は両立する。**完全健全な内部、最新修正版の印刷成功、再印刷GOという意味ではない。** 歴史的RunnerのFAILED記録と、その後に検証した完成G-code/packageも同じgateへまとめない。

## Author判断の出典（source評価とは別）

この会話でAuthorが示した方針：必要時に枝Editorを使う制作フロー、後日別STLでも試したい、外周花が生き残れば内部造形の荒れを許容、Astraは製造側・Solは操作系、Large等の停止を無断解除しない。

[Labの写真folder](https://drive.google.com/drive/folders/1JM156ZthiHv1oHnk-7Guth9sKSWGGey0)は既報IMG_1935–1948の所在。写真→特定の新candidate/branch IDのbindingや損傷率測定を、本資料作成で行ったことにはしない。

## 本資料が新しく提案したもの

caseごとのStage00–10の並べ方、変更時の失効表、記入式RUNひな形、計画用STOP `NEW_SHAPE_PIPELINE_PLAN_READY`は**既存資料から整理した将来運用の提案**。既存softwareのschemaや生成関数を追加実装したものではなく、旧taskの許可境界を上書きするものでもない。
