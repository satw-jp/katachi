# MINI_A Authored Support Program v0 — 毎回AIに設計させない

2026-10-12 JST

**Author goal:** 「MINI Aで使っているサポートをプログラム化して AIが考えないでいいようにしたい」

**登録時状態: TASK_READY / PROGRAM_EXTRACTION_NOT_STARTED.** この文書の保存はプログラム完成、実装workerの起動、MINILのSupport生成やPrint GOを意味しない。

## 0. 完成させるもの

MINI_Aで実際に使った **authored removable Supportの生成・局所補正・実材化・検査** を、固定recipeと明示的入力で繰り返し実行できる通常プログラムへ切り出す。

- 新しいSupport方式をAIに発明させるtaskではない。
- Bambuのnormal/treeに置き換えるtaskでもない。
- 完成Supportをコピーするだけの復元toolでもない。
- 最初の終了成果は **実行可能なコードとMINI_A再現比較の結果**。調査文書だけを返して完了にしない。
- 正常運用にLLM/API/プロンプト生成/AIの形状判断を入れない。未対応は理由・部材IDを返し、黙って別方式へ変更しない。

最初の実装範囲は、既存MINI_A入力によるgolden replayと、共通API・CLI・合成fixture検証まで。MINIL実作品へ新Supportを生成・適用するのは、この再現結果をreviewした後の別gate。本taskで一体印刷方針を分割へ戻さない。

## 1. Authority / owner / 保護

最初にAGENTS.md、docs/TEAM_PROTOCOL_CORE.mdと、実行環境に実在する上位AGENTSを読む。

- Author: 作品の目的・変更範囲・採用・Print GO。
- ChatGPT / task reviewer: 方式・受入条件の設計とreview。
- Astra: MINI_Aの製造由来とSupport方式の確認、後段のMINIL造形適用review。
- LUNAまたは本taskに明示配属された実装担当: コード抽出、テスト、照合、成果物。
- **#58 / PR #59の操作系Solとは別task**。そのbranchや稼働workspaceを使用・変更しない。

GitHubはtechnical SSOT、Driveは大容量原本・mesh・証拠。main確認base: `f87aeedb71725782b2db7a24ba6f8a84956ca2fc`。本task用branch: `agent/minia-authored-support-program-v0`。実行時は最新HEADと所有・dirty状態を確認し、別の空workspaceで作業。main merge、archiveの変更、既存dirty/unpushedのclean/resetをしない。

## 2. 実在する出典と確認範囲

### A. 成功版の対応記録

固定参照commit `b63538933969e570b50e8ea46a7e3b70f624744f`:

- [TRANSFORM_AND_REFERENCE_LOCKS.json](https://github.com/satw-jp/katachi/blob/b63538933969e570b50e8ea46a7e3b70f624744f/docs/evidence/minia_internal_repair/TRANSFORM_AND_REFERENCE_LOCKS.json)
- [EDIT_TO_PRINT_PIPELINE.md](https://github.com/satw-jp/katachi/blob/b63538933969e570b50e8ea46a7e3b70f624744f/docs/evidence/minia_internal_repair/EDIT_TO_PRINT_PIPELINE.md)

保存記録が指す原本:

```text
J:\My Drive\codex\2026-09-22\skin-fukei-slice-runner-execution-3\outputs\MINIA_PLA_EDITABLE_REPACKED.3mf
SHA256 2fd6d48034e46c2e9e0200fd3ed145159d825035df3892bc1f61ac4e2d4f9736

J:\My Drive\codex\2026-09-23\files-pasted-by-the-user-fukei\outputs\R4_MINIA_TERMINAL_REVIEW_20260922\package_only\plate_1.gcode.3mf
expanded G-code SHA256 b90c9037bf38a63ac852d77e7326c5cc99b605f0091cca19b1b68ba7dd561ad9
```

成功記録は印刷完了とSupport除去後の外形保持の基準。全花無欠損、内部品質、任意形状へのPhysical PASSの保証ではない。これらは今回の文書作成で巨大原本を再hashした値ではなく、保存照合記録の値。

MINI_Aは、別partのauthored Supportを保持し、保存設定はautomatic Support OFF、A1 mini / 0.4 nozzle / PLA / layer0.20 / raft2。**OFFだけをコピーしてもSupportは生成されない。** native object/part type・component/build transform・実材としてのスライス上の扱いも後段で保持する。

### B. 元Supportのデータと再現処理

- [R4_A_F2_PRINT_PREPARATION](https://drive.google.com/drive/folders/1LTIDDkEku4VASL81vBEB-gN229umdCZM)
- [README](https://drive.google.com/file/d/12b-gQ_X3k2LqPdksQ8baahG1wa2FvN7c/view)
- [A/data](https://drive.google.com/drive/folders/1w_jQ9bidRMAnxEZqiQj9XxI-8BgKYEni)
- [reproduce](https://drive.google.com/drive/folders/1YOnyBIGngcjUJ6PJ0D5OnoPvFkx_cyYU)

下記は同じsource root `J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs` 配下。保存lockに記録された値:

| file | recorded SHA256 |
|---|---|
| R4_A_F2_PRINT_PREPARATION/A/data/support_geometry.json | ba38bb5f52212c214d42bec859ac83d58be7793b693f27c8aae4160bc08ba758 |
| R4_A_F2_PRINT_PREPARATION/A/data/FLOWER_PRINT_ASSIGNMENT.json | 69a89c91fb644c5d99e9179cc39171087d2e62eca2a30d886a7b1a742592c9eb |
| R4_A_F2_PRINT_PREPARATION/A/data/ASSEMBLY.json | 92831e32f59e58985249cfa5466a97b04b86d223280b9c9d2796c1ba654fe9c1 |
| R4_D6_SIZE_RHYTHM_V2/data/surface.json | 1bd5efb438fa4423826f912342a43d716a2f506c288daf8696c03903b82e2b05 |
| R4_ROOT_LAUNCH_R5/routes/MINIA_PLA/data/ROUTE_GEOMETRY.json | 87da1d70ee3a0dc1566a0100639745059e592c8d4d26a224fd274715f25ac7e9 |

### C. 今回実コードを読んだ範囲

1. [lower_support.py](https://drive.google.com/file/d/1_WkoPy6HE7OKu4wamVNt0xwYQNdE8ehC/view)
   - 今回取得bytes: 5,839 / SHA256 `174ad470791bc3e1dc58574bb0f670dd5abbfc73e263d6dde09ac05f30da1356`。
   - 花面から下部の受け候補を選び、既存接点との離隔を見てshaft・短いneck・foot・局所collarを作り、対象以外への実体交差を調べる処理がある。
   - ただし先行 `R4_A1_MINI_RELEASE_CANDIDATE/data/support_geometry.json` と `R4_V5_AUTHORED_SUPPORT_REVIEW/reproduce/geometry` 等に依存する。**これ一つで全Support生成が完結するとは未確認。** A/F2両方のPermanentを障害物に入れる旧case固有処理もある。
2. [final_support_data.py](https://drive.google.com/file/d/1CS6nHXkEb6ZHeAR2fYvTUtrcoWc271IB/view)
   - 今回取得bytes: 1,636 / SHA256 `80d54c9c6b25d3db9fce0059f10ea096ddd1c821d6ec2120a7dfe112f6b7fc44`。
   - X03795の除外、anchor/target参照整合、BODY_TO_BODY_TEMPORARYの古いrooted評価をhistoricalへ退避する処理がある。
   - **原本JSONを上書きするトップレベル処理。原場所で実行禁止。** ID例外を汎用生成規則と混同しない。
3. 同reproduceには `audit_support.py`、`verify_changed_contacts.py`、`pack_parts.py`等が存在。本文未読部分と上流builderは最初の実装で必要分だけ確認する。

READMEは下部接点、足、早期brace、局所再接続と除去順を記録しているが、A1原寸での値をMINIの物理寸法として直に使わない。元生成・局所patch・縮尺・native書出しを別段階として追う。

## 3. 最初に一度だけするsource固定

最終MINI_AのSupport partから逆向きに、入力→builder→旧patch→mini変換→native書出しの依存経路を固定する。全Driveや全履歴を収集するtaskにはしない。

- 最終support_geometryの全kindを列挙し、各kindを作るコードと、最終part内のgeometry/ID対応を台帳化する。
- 手修正・削除・付替えは `OVERRIDES.json` として明文化し、適用対象のsource hashとIDを固定する。別作品へ旧IDを近接で付け替えない。
- 元入力の不足やsource/part不一致は具体的ファイル・IDを返す。架空の生成法で補完しない。
- 小入力はhashで確認。巨大データは既存receiptを利用し、必要な再hashだけを記録する。取得や依存解決は初回準備とし、通常実行でネット探索しない。
- ここが通れば同task内でコード化・テストへ進む。毎段階で新しい設計レビュー指示を要求する運用にしない。

## 4. プログラム構成 — 小さいkernel、明示的recipe

推奨実装場所: `tools/authored_support/`。Blender/Katachiから後で共通に呼べるPython kernelとCLIを先に作る。新しいアプリ、独自スライサー、汎用ルール言語は不要。

### 入力

1. `source_manifest`: 使用するHost/花prototype/花配置/Permanent/出力先の明示pointerとhash。
2. 花の実geometryと配置・ID。JSONが証拠mirrorの場合は正本NPZ/mesh側との対応を確認する。
3. Permanentの実geometry、ID、中心線、接続関係。中心線だけで衝突PASSにしない。
4. `MINIA_AUTHORED_SUPPORT_V1` recipe: 出典付きの生成規則、探索順、寸法、接点/根元/braceの条件、上限、数値kernel version。
5. 旧MINI_Aの再現時だけ適用するsource-bound overridesと座標変換。

Hostは配置用の参照面であり、自動的に製品の中実Bodyにしない。Supportの接点は花裏anchor一個だけから推定しない。元のflower面・枝面上の受けを選ぶ方式を保持する。

### 処理の分離

- `generate_plan`: 明示入力からSupport候補・接点・anchor/target・root・brace・removal情報を生成。
- `materialize`: 保存planから旧geometry kernelで実体meshを再構成。
- `validate`: 型/ID/変換/実材接合/意図しない衝突/未処理対象を検査。
- `replay`: MINI_A固定入力の再生成とgolden比較。

名称は設計名。既存関数へ適合させてよいが、CLIが引数と戻り値を持ち、import時にファイル生成・上書き・sliceをしないこと。

`inspect / replay / build / verify`のようなCLIと、同じ処理を呼ぶPython APIを提供する。初回fixture設定は実装者が作る。AuthorへJSON手入力、全接点IDの指定、繰り返すコマンド修正を要求しない。

### 決定性と例外

同じ明示入力・recipe・override・kernel versionから同じID/接点/形状を出す。元コードの探索順・seed・tie-breakを調べて固定し、異なる並列完了順で結果を変えない。

ただし、決定性のために旧生成規則を黙って改善しない。旧挙動から変わる場合は差分とversionを分ける。候補を見つけられない場合は対象IDとreasonを返し、別方式生成・AI呼出し・数値閾値緩和・花削除をしない。

**MINIAの最終Support座標の再出力**と、**花/Permanentから接点を選んでSupportを再生成**は別のテスト。前者しか通っていなければgenerator完成とはしない。

## 5. 座標・径・processの境界

MINI_Aのsource→plateは保存lock上、scale `0.7333333333333333`、translation `(89.58849309285482,91.38825149536133,1.2951087678814617)`。二重適用しない。各寸法がsource mmかplate mmか、既にscale済みかを出力に残す。

例: lower_support.pyのcontact diameter 0.6mmは**旧source内の値**。最終MINIで何mmかはtransform chainを通して決め、今回の0.1/0.2mm layerや0.2/0.4mm nozzleから勝手に作り変えない。bed=-1.766...等の旧case座標も汎用定数にしない。

Bambuのautomatic Support OFFは、authored Supportを実体partとして渡した後のprocess契約。native support_typeやinterface設定だけでこの方式を再現したことにしない。後段ではauthored SupportがG-code上でBody/wall/infillとして扱われる場合も、所有IDによってPermanentと取り外し材を区別する。

本taskでは材料・ノズル・層高・温度・plate・raftを変更しない。MINILのSuperTack/45°C指定をMINI_Aの旧再現に勝手に上書きせず、旧MINI_AのPEI/65°CをMINIL印刷条件へ戻すこともしない。

## 6. 受入条件 — 最初にMINI_Aを再現

以下を**実コードで**検証する。

1. 固定した元Support全kindに、生成経路か明示的なreplay-only制約がある。不明kindを抜かさない。
2. 同じ旧MINI_Aの上流入力から生成した計画と最終Support台帳を、ID集合・kind・anchor/target・接点/法線・経路・径・例外適用履歴で比較する。
3. 計画から再構成したSupport meshと、対応する成功版native Support partを同じ座標で照合する。root/brace/feet/neck/全対象の欠落・重複がないか確認する。
4. 比較粒度を分離する: 入力byte hash、JSON意味上の一致、mesh配列の一致、native変換後の同一性。ZIP日時やJSON空白だけの差をgeometry失敗にしない。一方、任意の近似形状を「見た目同じ」でPASSにしない。
5. nativeのfloat32変換等がある場合は元経路の数値規約を固定して比較し、通すために後から許容差を広げない。
6. 同じ入力の反復、別出力root、fresh processで同じ意味上の結果になる。LLM/API呼出し0。絶対pathを結果の形状identityに混ぜない。
7. Flower/Permanent・成功package・元Support・原本の前後hash不変。既存出力先への書込みは拒否。
8. 合成fixtureで、対象外の衝突、存在しないtarget/anchor、移設、重複ID、二重scale、未対応kind、候補なしを検出。未知をPASSへ落とさない。
9. 旧sourceのBODY_TO_BODY_TEMPORARY等に未確認の印刷順序・除去がある場合は未確認のまま出力する。再現PASSでPhysical PASSへ昇格させない。
10. 完了報告に起動方法、依存version、実測時間・メモリ、未再現ID・失敗の種類を含む。大きい同一計算を無制限に再実行しない。実行環境の修正回数上限を守る。

黄金基準を新しい出力で上書きすること、結果に合わせてexpected値を変更することは禁止。差分があれば根拠と最小blockerを返す。

## 7. 出力と次工程

```text
<new output>/
  SOURCE_LOCK.json
  RECIPE_RESOLVED.json
  OVERRIDES_APPLIED.json
  support_geometry.json
  support_mesh/                 # NPZ等、旧kernel由来の実材配列
  VALIDATION.json
  REPLAY_COMPARISON.json
  RESULT.md
```

既存schema/台帳を可能な限り再利用し、大型の統一project schemaを新設しない。未知metadataも保持し、IDや役割を捨てない。大きいmeshはDrive、コード/recipe/試験/小さな索引はGitHub。

後からの制作経路は:

`STL Host → 花配置 → Permanent生成 → 必要時Branch Editor → このSupport生成器 → Astraの実材/接合review → 許可されたslice/package → Author Print GO`

Branch EditorとSupport生成器は別機能。既存Editor PROJECT.jsonが任意作品に対応済みとはしない。初版はファイル/API接続で十分で、#59のアドオンに新ボタンを付けることを完了条件にしない。

## 8. MINILへの適用境界

MINI_Aのgolden replayが通った後、MINILへ同じルールを入力する次taskを返す。その際に花2,303、既存Permanent2,885、追加115枝の採否、現pose/scale、SuperTack、層高を明示する。115枝をこのtaskで採用済みにしない。

旧MINI_AのSupport位置やFxxxxx/XxxxxxをMINILへ最近傍コピーしない。新しい花配置で対象選定・衝突判定を計算し直す。旧case固有overrideは適用不可ならHOLD。全く別のSupport方式へ切り替えない。

MINIL cycle2は別候補: candidate SHA `3c7228514dc351b66d0775b3d5c35269e6d0eb0be620aa2287fce8cff8b5823d`、G-code SHA `e7e364f99b47a8ba36a6b238378271884a6057df3e12e2378b65354660cef9b9`、1,592層、FIX_REQUIRED_NOT_RELEASED。SuperTack版は別settings-only候補。これらは本taskで変更・再sliceしない。

## 9. STOP / 完了報告

成功:

**STOP: MINIA_AUTHORED_SUPPORT_PROGRAM_REPLAY_READY**

未再現/不足:

**STOP: MINIA_AUTHORED_SUPPORT_PROGRAM_REPLAY_HOLD**

コード・CLI・元規則対応表・MINI_A golden比較・テスト・実行手順・Draft PRを返す。main mergeなし。報告はSource binding / program tests / plan再現 / mesh再現 / geometry検査 / 未確認toolpath / 未確認physicalを分ける。

このSTOPは**通常プログラムとして同じSupportを再現できた**という技術gate。新MINILの印刷成立や全条件での強度保証ではない。再現コードだけでPrint GOを出さない。

**今回許可する実行:** 隔離出力でのSupport再現コード実装・単体試験・固定MINI_A再現。**禁止:** 原本上書き、Flower/Permanent改変、MINIL新Support適用、既存job再実行、Bambu/slice、印刷package再生成、Computer Use、Send、Print。Large/他MINI/#37/#38/#58/#59の状態変更なし。
