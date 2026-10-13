# Issue #62 — MINI_A Authored Support / ChatGPT設計・LUNA直接実装指示 V1

2026-10-12 JST

**Author指示：『LUNAに依頼するんならこのチャットで設計して指示まで作って』。**

この文書は[Issue #62](https://github.com/satw-jp/katachi/issues/62)の実行設計を具体化する追記。旧[正式task](MINIA_AUTHORED_SUPPORT_PROGRAM_V0.md)の原本保護・出典・禁止事項を引き継ぐ。重複する実行仕様と担当は本V1を優先する。

**設計・方式・テストの受入条件：このチャットのChatGPT。限定実装・試験・証拠：LUNA。採否と次gate：Author。Astraによる追加設計・事前承認を実装開始の依存条件にしない。** Astraの既存製造資料はread-onlyの参照。後日のMINIL適用は別task。

登録時点では設計・指示のみ。LUNAはまだこの文書によって自動起動されておらず、生成プログラムも完成していない。

## 1. 今回の完成単位

**MINI_Aの入力と固定レシピを選び、一つのコマンドで、元と同じauthored removable Supportを生成し、比較結果と未確認事項まで保存できること。** 通常実行のLLM/API/ネットワーク呼出しは0。

新しいSupport方式を考えるのではなく、元の計算規則を通常のPython関数へ移す。Bambuのnormal/treeへ置換しない。完成済みSupport JSONやNPZのコピー、最終中心線の読み直しだけでは『花とPermanentからの生成』に合格しない。

許可は、固定MINI_Aと合成fixtureの隔離再現・テストまで。製造中の作品、MINIL、新しい印刷packageを変更しない。GUI新設・アドオン統合・STL新形状対応・MINIL適用・sliceは範囲外。

## 2. 作業基準とsource固定

repo: `satw-jp/katachi`
branch: `agent/minia-authored-support-program-v0`
追記前の確認済みHEAD: `64ff54c1a5b505b034bf17730f46c1281c608dad`
main由来base: `f87aeedb71725782b2db7a24ba6f8a84956ca2fc`

開始時にこのbranchの最新HEAD、所有、既存worktree/dirty/unpushedを確認。既存の他worker環境をcheckout/resetしない。mainをmerge/rebaseして基準を変えない。AGENTS.md / TEAM_PROTOCOL_CORE.mdと、実在する上位AGENTSを読む。修正回数等のローカル制約を別名taskで回避しない。

完全なsourceパス・Drive URL・保存SHAは旧taskの§2を再利用する。特に：

- 成功参照の編集用3MF SHA: `2fd6d48034e46c2e9e0200fd3ed145159d825035df3892bc1f61ac4e2d4f9736`
- 保存Support台帳 SHA: `ba38bb5f52212c214d42bec859ac83d58be7793b693f27c8aae4160bc08ba758`
- 成功参照G-code SHA: `b90c9037bf38a63ac852d77e7326c5cc99b605f0091cca19b1b68ba7dd561ad9`
- source/transform lockは `b63538933969e570b50e8ea46a7e3b70f624744f` の `docs/evidence/minia_internal_repair/TRANSFORM_AND_REFERENCE_LOCKS.json`。

これらは基準の識別値。今回ChatGPTが巨大原本を再hashした値ではない。生成プログラムがG-codeを読み込む必要はない。成功runの結び付けだけに使い、照合対象はSupport計画・mesh・native part。

## 3. 既存コードから固定した設計判断

以下は実際に提供されたコードの内容と、そこからの抽出設計。新しい造形条件ではない。

### lower_support.py

出典: [Drive原本](https://drive.google.com/file/d/1_WkoPy6HE7OKu4wamVNt0xwYQNdE8ehC/view)
保存SHA: `174ad470791bc3e1dc58574bb0f670dd5abbfc73e263d6dde09ac05f30da1356`

- `R4_V5_AUTHORED_SUPPORT_REVIEW/reproduce/geometry`と、先行`R4_A1_MINI_RELEASE_CANDIDATE/data/support_geometry.json`に依存する。
- 障害物集合にAとF2のPermanentを両方含み、旧mesh_source文字列で重複排除する。この挙動をMINI_A固定再現で勝手にAだけへ簡略化しない。
- bedはsource座標の`-1.7660574107474478`。MINIの物理ベッド設定値ではない。
- bboxは候補絞り込み、交差採用の判定は実solidの体積`>1e-5`。
- 円柱24分割。足radius候補`[3.5, 3.0]`、height`0.8`。25超のshaftに許容される局所collar候補。
- 花templateの面を`[::24]`で取り、面重心・法線を使う。これは候補点samplingであり、製造花meshの減面ではない。
- 下向き法線`nz < -0.55`、高さ`bed+2.2 < z < bed+35`。元Z順。既存/新接点との距離2.5未満を除外。1花で新接点最大2、試験候補最大22。
- shaft radius`0.8`、neck radius`0.3`。main/footはBODYに干渉しないこと、neckの交差相手は対象Flower一件だけ。
- 新contactのfoot radius候補`[3.5, 2.5, 1.8]`、height`0.65`。局所sleeveとcut点を記録する。

**上記値は旧source-worldでの再現定数。MINILのmm値や最適値として転記しない。** 検索順・サンプル間引き・22回上限・数値epsilonまで含めて保存する。性能改善のために選択順を変えない。

### final_support_data.py

出典: [Drive原本](https://drive.google.com/file/d/1CS6nHXkEb6ZHeAR2fYvTUtrcoWc271IB/view)
保存SHA: `80d54c9c6b25d3db9fce0059f10ea096ddd1c821d6ec2120a7dfe112f6b7fc44`

- `X03795`を除外し、欠けた`T01268`に向く不要braceである理由を保存する。
- Flower/Permanent/Support/BEDのID集合へanchor/targetが存在するか確認する。
- `BODY_TO_BODY_TEMPORARY`の過去rooted判定をhistoricalへ移し、現toolpathの証明ではないと記録する。
- 元JSONを上書きするtop-level codeなので、そのまま実行/importしない。

`X03795`の除外は**固定case専用override**。全形状で同じIDを削除する共通規則にしない。過去rooted評価は今回も現在のPhysical PASSにしない。

### 未確認部分の扱い

この2ファイルだけで上流から全Supportを生成できるとは確認していない。上流builder、geometry kernel、brace、patch、native変換の詳細は、LUNAが実装のために元コードを必要分だけ追う。

これは新しい設計をLUNAに任せる意味ではない。**既存計算を移植し、入力/出力対応を記録する作業**。出典がなければ方式を発明せず、実装済み部分と欠落sourceをこのチャットへ返す。Astra待ちを勝手に挿入しない。

## 4. 実装構成を固定

実装rootは `tools/authored_support/`。小さい通常Python packageとする。

```text
tools/authored_support/
  __init__.py
  __main__.py                 # python -m tools.authored_support
  cli.py
  contracts.py               # 型、必須項目、schema version
  source_io.py                # 明示root mapping、SHA、NPZ/JSONの読取
  planner.py                  # 既存生成規則の順序を統括
  rules/                     # 実在する各builderの副作用除去版
  mesh_backend.py            # 元geometry kernelを薄くwrap
  overrides.py               # case-bound例外のみ
  validate.py
  compare.py
  presets/minia_legacy_v1/    # case、recipe、override、golden index
  tests/
  README.md
```

実関数は`load_inputs`、`generate_plan`、`materialize`、`validate`、`compare_reference`相当に分離する。import時の読込・保存・subprocessを禁止。`bpy`やBambuを通常生成の必須依存にしない。元kernelが必要とする依存は実バージョンをlockし、別kernelへ置換しない。必要なら再現のための隔離runtimeを使用し、ユーザー環境の既存依存を更新しない。

関数分離で旧式の反復的なgeometry判定を壊さないこと。plannerは旧規則どおり候補meshをkernelで試作・判定できる。採用された構築パラメータをplanへ残し、materializeが同じものを再構成する。

### 入力は5種、役割を混ぜない

| record | 必須内容 | 目的 |
|---|---|---|
| CASE.json | case_id、schema、花/枝/template等の役割・論理root・相対path・期待SHA、recipe/override、source frameとtransform chain | 対象を明示。最新ファイル探索なし |
| RECIPE.json | recipe_id/version、stage順、実コード由来の全定数・候補順・停止条件・単位・source locator、kernel/runtime lock | AIが毎回条件を決めない |
| OVERRIDES.json | bound case/source identity、operation、対象ID、expected-before、理由、出典 | 個別修正を共通規則から分離 |
| GOLDEN.json | 読取専用の成功参照台帳/mesh/native partと期待値・出典 | 比較専用。通常生成の入力にしない |
| ROOTS.local.json | 論理root→当該PCの実path | 移設可能。形状identityへ絶対pathを混ぜない |

これらは薄い実行用の外側の記録であり、既存surface/structure/support_geometryのschemaを作り直す指示ではない。正式geometryがNPZならJSON mirrorだけを正本にしない。unknown metadataは保持する。

レシピの各数値には`source_file_sha256`、function/line locator、意味、単位を対応させる。厳密な元依存versionが不明ならunknownと記録。結果を見て許容差を拡げたり、近い依存versionで同一と主張しない。

CASEの既知ファイル/IDはLUNAが資料から埋める。Authorに手入力させない。生成時に必要な過去Supportは、上流stageの生成出力として接続する。過去の完成Supportを生成入力へ紛れ込ませない。

### 座標系

初版は`SOURCE_WORLD_MM_LEGACY_REPLAY`で生成し、成功版と同じtransform chainを最後の比較で一度だけ適用する。world→plate/nativeの行列は実metadataとlockから読む。既にmini化した位置へもう一度11/15を掛けない。legacyの距離・角度・体積epsilonの単位を保存する。Hostを自動的に中実の障害物に追加しない。

### 出力

`support_geometry.json`の既存objects形式を保持。各SupportのID、kind、anchor/target、構築パラメータ、points/contact/normal/cut、mesh pointer、由来stageと例外適用を追跡できるようにする。

```text
<new-run>/
  SOURCE_LOCK.json
  RECIPE_RESOLVED.json
  OVERRIDES_APPLIED.json
  support_geometry.json
  support_mesh/                 # Supportのみ。NPZ等
  DECISIONS.jsonl                # 採用/棄却/HOLDと根拠
  VALIDATION.json
  REPLAY_COMPARISON.json
  RESULT.md
```

有限候補が不成立でも、元recipeに次の候補があれば元の順序で進める。候補切れは明示的HOLD。エラーごとにAIへ質問するプログラムにせず、ID・stage・理由を機械可読で返す。未確認のchronology/removalを今回の再現gateへ新たなPhysical要件として持ち込まない。

出力は新規run folderだけ。既存run/sourceを上書きする`--force`は初版に不要。失敗時は部分出力をINCOMPLETEとして保全し、成功manifestを出さない。実行キーは入力内容＋recipe＋override＋kernel/code identityから作り、絶対path・日時・出力先は別の観測記録にする。

## 5. CLIと使い方

以下は**LUNAが実装するCLI契約**であり、今存在するcommandではない。

```text
python -m tools.authored_support inspect --case CASE.json --roots ROOTS.local.json --out NEW_INSPECT_DIR
python -m tools.authored_support build   --case CASE.json --roots ROOTS.local.json --out NEW_RUN_DIR
python -m tools.authored_support verify  --run NEW_RUN_DIR --golden GOLDEN.json --roots ROOTS.local.json --out NEW_VERIFY_DIR
python -m tools.authored_support replay  --case CASE.json --golden GOLDEN.json --roots ROOTS.local.json --out NEW_REPLAY_DIR
```

- inspect: 指定された依存/identity/対応kindの確認だけ。花・枝・Supportの生成なし。
- build: 上流入力から計画とSupport meshを生成し、入力・出力・参照等を検査。GOLDENへアクセスしない。
- verify: 既存生成結果をread-onlyで比較。新しいmesh生成や基準変更なし。
- replay: buildとverifyを一つのrunで順に呼ぶ。元の完成Supportは比較側だけに渡す。

exit code: 0=そのcommandの技術契約を完了、2=既知HOLD/未対応/比較不一致、1=予期しない実行エラー。0をPhysical PASS/Print GOにしない。細かなgeometry警告と再現一致は別fieldで返す。

通常生成・検証にネットワークやLLMは使わない。依存の正規取得は初回の作業準備だけ。第三者コード・ライセンス・versionを保存する。

## 6. 実装順序と途中停止条件

### A. 入力と全kindの由来を固定

最終MINI_A Support台帳から、各kindの件数・builder・上流入力・patch・native part対応を列挙。`SOURCE_RULE_MAP.json`を小さく作る。既存のsource bindingは再利用。明示された依存以外の全Drive/全履歴調査をしない。

### B. 元規則を移植

上流→既存patch→lower_support→brace/再接続→最終整合→native比較という**実際の依存順**をソースで確定し、関数化する。この順序例に合うよう元履歴を改変しない。stageごとのschema・ID・出力契約を固定し、同じcallableをCLIとtestsから使う。旧scriptを文字列置換して原本rootへ走らせない。

### C. 例外と計算順を固定

X03795等は実資料のexpected-beforeを付けたcase overrideとする。同じID名でもsourceが違えば不適用。A/F2両方の障害物と元mesh_sourceによるdedup意味も記録し、移設で変わらないlogical asset IDへ対応させる。旧入力配列順、`np.argsort`の条件・同順位挙動・NumPy versionを保持。勝手にsortや並列化して別の接点を選ばない。

### D. 合成テスト→固定MINI_Aの全体再現

小さいfixtureで基本バグを直してから、固定MINI_Aを生成。plan比較、mesh比較、native transform比較を分離する。再現率や件数だけでなく、不一致IDを出す。全kindを処理した証拠を残す。

### E. 独立再実行と移設

fresh process・別出力rootで同じ固定MINI_Aを再生成し、意味上の同一性を確認。形状出力のmtimeやNPZ ZIP timestampをgeometry identityにしない。大容量無制限retry禁止。重い同時計算・全3MFの不要な展開を避け、入力hashとcode/recipeに紐付いた安全なstage cacheは使用可。過去未認証出力を成功cacheにしない。

各stageごとにAstraへの承認待ちを作らない。この設計とsourceで決まる作業は同task内で進める。不足がある場合は、進められる独立実装とテストを残し、本チャットへ正確なblockerを返す。上位ルールのサイクル上限を守り、失敗ループを別名で再開しない。

## 7. 必須テスト

| 試験 | 必須結果 |
|---|---|
| import / inspect | 原本書込み0・generator/slicer起動0 |
| goldenへの依存禁止 | buildはgoldenを隠しても同じ入力だけで生成できる。比較だけがgoldenを読む |
| 上流再生成 | 古い生成中間物を隠した隔離runで全必要stageが動く。手編集データは正規overrideとしてのみ許可 |
| 下部候補選定 | 元順序、面sampling、normal/z/距離、2接点・22試行の境界を保持 |
| 実体干渉 | bboxが重なるだけとsolid交差を区別。shaft/foot衝突を拒否。neckは対象Flowerだけ |
| 対象/anchor/ID | 欠落・重複・未対応kind・別case overrideをHOLD |
| 候補なし | 元の全有限候補を試した結果と理由を保存。新方式へのfallbackなし |
| 計画一致 | kind/ID集合、anchor/target、contact/normal、centerline、寸法、例外をgoldenと比較 |
| mesh一致 | 同じkernel/数値規約で配列または厳密な対応を確認。bbox/体積だけで一致としない |
| 変換一致 | source→mini/nativeを一回適用。二重scale・別pose・単位不明を検出 |
| 再実行/移設 | fresh process・別rootでも意味上の出力一致。旧pathの存在へ依存しない |
| 原本保護/失敗 | source・golden・既存作品不変。既存出力拒否、失敗出力はINCOMPLETE |
| runtime offline | 生成/検証でネット/LLM/APIなし。import後の外部プロセスなし |
| 過去証拠 | BODY_TO_BODY_TEMPORARYの古いrooted/除去状態を勝手にPASSへ昇格しない |

比較は入力byte SHA / plan semantic identity / mesh array identity / native part照合 / serialized container hashを別にする。float32丸め等は旧native変換経路から先に固定。JSONの絶対path、空白、NPZ日時を除外する正規化規則を明示し、数値や接点は除外しない。

**再現基準が元から持つgeometry警告は再現記録に残す。再現するためにその警告を修正したり、逆に元の物理実績だけで新検査をPASSにしない。**

## 8. 成功とHOLDを明確化

READYの必要条件は、固定MINI_Aについて上流からのplan生成・全kindの実材化・成功版native Supportとの対応が完了し、比較とfocused testsが通ること。

旧taskの『replay-only制約』は部分成果の分類としては許されるが、**replay-only kindや未追跡kindが残れば全体READYにはしない。** 完成Supportや大量の最終座標をoverrideへ押し込んで通してはいけない。

部分成果は捨てずに、source未取得 / recipe未抽出 / native binding未完了 / plan mismatch / mesh mismatch / runtime errorを区別する。ソフトウェア再現だけのgateなので、新しい物理実験を実行しないことを理由にこの再現taskを止める必要はない。

成功STOP: `MINIA_AUTHORED_SUPPORT_PROGRAM_REPLAY_READY`
不足STOP: `MINIA_AUTHORED_SUPPORT_PROGRAM_REPLAY_HOLD`

成果: 実コード、CLI、埋めたcase/recipe/override、source map、tests、replay結果、実測時間/メモリ、再実行手順、Draft PR。READMEに『この版はMINI_A固定再現。任意形状・MINIL適用・印刷安全性は未認証』を明記。

GitHubに小さいcode/docs/recipe/証拠索引を保存。大きいSupport meshや実物データはDrive。既存ファイルの共有状態を変えず、保存/同期/hashの確認範囲を区別する。main mergeはしない。

## 9. 次工程と禁止範囲

今回、独立したSupport生成器だけを作る。Branch Editorの変更・ボタン追加はしない。後段の任意形状やMINILへの適用は、既存の生成済み枝・花を受け取るadapter taskとして別途設計する。

MINIL cycle2の115枝、SuperTack45°Cのsettings-only候補、0.1mm層はそのまま保護。MINI_Aの旧0.2mm層・PLA・PEI65°Cを、このtaskを理由にMINILへ反映しない。

**禁止：花/Permanent変更、製造用原本や過去Supportへの上書き、MINILの新Support生成、normal/tree代替、新方式研究、profile変更、STL/3MF/G-code/print package生成、Bambu/slice、Computer Use、printer接続、Send、Print、既存job再実行、#58/#59・Large・他MINIへの干渉。** Supportの隔離NPZ等の再生成だけを許可。

最終報告は結論→理由→次の行動。branch/HEAD/dirty、変更file、上流再現可否、plan/mesh/native照合、tests、未再現IDと理由、出力path/SHA、原本保護、LLM/API=0、slice=0 / Send=0 / Print=0を記載し、このチャットへ返す。

**LUNAへの開始文：Issue #62の本V1を設計authorityとして直接実装し、固定MINI_Aのauthored Supportを元入力からAIなしで生成・再現照合できるCLIとテストを作って指定STOPへ。Astraへの再設計依頼、MINIL適用、slice、Send、Printはしない。**
