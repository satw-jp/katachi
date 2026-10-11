# SKIN STL → Print — reference CURRENT

## Authority / scope

Author依頼：ベース形状をSTLで読み込むところからプリントまでを整理し、後で他の形状にも使える参照入口を残す。

**入口： [STLから花・枝・編集・プリントまで](../workflows/skin-stl-to-print/README.md)**

これは工程参照のCURRENTです。既存Astra製造lane、Solの#58/#59、その他のcase CURRENTを置換しません。新しいSTLの制作taskを自動開始するものではありません。

## Present state

- **REFERENCE_DOCUMENTS_READY / NEW_CASE_NOT_STARTED**。
- 工程、入力・出力・gate、変更時の失効範囲、別形状用template、source indexを文書化。
- 文書branch：`docs/skin-stl-to-print-workflow-v1`。基準main：`f87aeedb71725782b2db7a24ba6f8a84956ca2fc`。
- 操作archive参照：`c75d4b0adcf04b0ad8bde7810dc906e72c36e948`。
- Editor参照：PR #59 / `b63538933969e570b50e8ea46a7e3b70f624744f`、確認時Draft/open/未merge。
- この資料作成で、geometry生成・Editor起動・slice・Computer Use・Send・Printは実行していない。code/tests/原本/worktreeも変更していない。

## Important boundaries / gaps

1. 既存の花・枝JSONと生成資料はあるが、任意STLからプリントまでの汎用自動E2Eは未検証。
2. 配布Editor 0.1.0のcreate_projectは固定LOWER70と埋込ledgerを照合する。別case用のdata adapterは、この配布版の移設PASSだけから完成扱いできない。
3. 追加専用V1と、後の削除mask/rerouteを含む編集は別。Astraの最新製造handoffと対応させる。
4. 現optimizerの赤は全体graphのheuristic。独立保持ルート・積層途中の接続・物理強度とは別。
5. 旧成功MINIA packageは比較用。Astraの最新の補強済み印刷packageを今回再監査した証拠ではない。
6. Authorの目的は外周花の保持。内部の粗さ・赤ゼロ未達だけを不良としない。

## Next gate

次に新STLが指定されたとき、[NEW_SHAPE_RUN_TEMPLATE.md](../workflows/skin-stl-to-print/NEW_SHAPE_RUN_TEMPLATE.md)で入力・単位・目標寸法・recipe・担当・許可範囲を固定し、最初の未接続工程と次のbounded taskを返す。

計画用の提案STOP：`NEW_SHAPE_PIPELINE_PLAN_READY`。既存software enumではなく、新規生成／slice／実機の許可でもない。

出典と読取範囲：[SOURCE_MAP.md](../workflows/skin-stl-to-print/SOURCE_MAP.md)。Source binding / Editor software / geometry / slice / toolpath / package / GUI / Print GO / Physical / Author ACCEPTを分ける。

## Protected scope

元STL、花prototype、旧case、成功MINIA原本、AstraとSolの作業branch、archive、RUN/checkpoint、dirty/unpushed work、稼働job、Large・MINI_D・MINIL・#37/#38の状態。main mergeと他taskの解除は行わない。
