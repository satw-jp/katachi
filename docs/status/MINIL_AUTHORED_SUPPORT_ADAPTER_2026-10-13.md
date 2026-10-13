# MINIL authored Support adapter — Issue #64 / 2026-10-13

## STOP

**MINIL_SOL_AUTHORED_SUPPORT_ADAPTER_HOLD**

Support候補は未生成。空の `SUPPORT_GEOMETRY.json` は候補やリスク0の意味ではありません。
Astraへの評価範囲は入力・レシピのblocker照合のみです。製造成立の自己認証はしていません。

## 完了した範囲

- PR #63固定HEAD `15a1487bf8f2704af2b62ff4cd9342770cd3f864` を実物確認。元ブランチはclean、未pushコミットなし。
- 新規 `agent/minil-authored-support-adapter-v1` worktreeでMINIL専用CASE/RECIPE/ROOTS/OVERRIDES、入力検証、依存関係付きステージdispatcherを実装。MINI_A既存コード・goldenは変更なし。
- TARGET配置NPZのsemantic SHAを再計算し一致。全2,303 flowerのD6実メッシュからbuild-frame bbox、法線、最下頂点、下向き面数を導出。接点には採用していません。
- Permanent 2,885部材のsemantic SHAと各部材のmesh SHAを再計算し一致。全部材の実ソリッドを確認。
- cycle2 nativeのSHAを実ファイルから確認。追加115枝は元NPZと台帳・配列range・root/flower参照・ソリッドを照合。B0は不変、115は `MINIL_B115_PROVISIONAL` のまま。
- 22入力のSHAを処理前後で照合し一致。MINILテスト9 PASS、元MINI_Aテスト35 PASS、FAIL/SKIP=0。元の94分フルreplayを再実行したという意味ではありません。
- 全体図と下面参照図を保存して画像readback。表示は参照用で、接触・除去・印刷PASSの根拠ではありません。

## HOLD：5つの未解決条件

| ID | 問題 | 必要な根拠・次の限定作業 |
|---|---|---|
| H01 | ネック・脚・brace・接触／collision許容値がMINI_A source-world値のまま | MINIL/PLAで同値にするか変換するかを定めた出典付きレシピ。11/15の一律縮小は禁止 |
| H02 | cycle2 CADはraft前のgrounded frameで最下Z=0。raft2設定だけではCAD Supportの接続面にならない | artwork位置を変えずに扱うroot/raft境界の明示 |
| H03 | V4/V5/V6/V7のbirth/load/grid・履歴選択・多variant部材と旧ID例外がMINILに未対応 | 原アルゴリズムに基づくMINIL派生入力とステージport。今回のboundsを偽の旧V5/V6入力にしない |
| H04 | ROOT/SP004・R36A000858/SP002の修正済み所有権と、現one-piece source-solidの対応が未bind | 正確なID/solid対応の確認。split CADの再結合や推定置換はしていない |
| H05 | 工具実体・切断順・破片escapeのMINILレシピなし | 出典付き寸法／fragment規則。bbox rayや下面法線だけでアクセスPASSにしない |

H03は未実装のport範囲を含みます。入力同一性PASSを「完成したMINIL Support生成器」と読み替えないでください。
H04は旧分割案を再採用する提案ではなく、一体モデルの入力所有権の照合不足です。

## 検証していない項目

Support接触、non-target干渉、bed-root経路、chronological proxy、fragment/cutter通路、内部trap、保護外面への損傷はすべて `NOT_RUN_NO_CANDIDATE`。
Support数・coverage・切断経路・製造成立は未評価。旧G-code UIDや25,037件を新候補の根拠に転用していません。

## 同一性

- TARGET: `e48b2a1ca56d30e6d91a1f3bc14807e279b72be53b3501c6b1806926061df723`
- Structure: `ed07e2e20226accbaf920e41e568ab74d9d3159c9ae32a53a5bde368c44014a4`
- provisional cycle2 project: `3c7228514dc351b66d0775b3d5c35269e6d0eb0be620aa2287fce8cff8b5823d`
- +115 NPZ: `502ca176c80a0abee816465f61f7944796b3839614eea6d6f02ff4775491d536`

## DoD判定

固定入力・隔離実装・生成可能範囲の実行・machine-readable HOLD・保存とAstra評価資料まで実施。
「候補完成」のDoDは未達で、Issue #64が明示したHOLD分岐で停止します。
技術的残件は上記5点。新たなSupport寸法や造形案をこのturnで試しません。

維持：one-piece / geometry変更=0 / slice=0 / Send=NO / Print=NO / print_go=false。
