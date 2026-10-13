# Astra実装指示 — MINI_A Authored Support Generator 完全再現 V2

## 目的

MINI_Aで実際に使用した取り外し式Supportを、**毎回AIが設計しなくても生成できる通常のプログラム**として完成させる。

単にSupportをコピー・復元するツールではない。

**花の形状・配置、Permanent内部枝、固定レシピ、明示的な作品別例外から、接点の選択、Supportの生成、mesh実体化、検査まで自動実行すること。**

Astraが実装担当。設計・技術レビューは本ChatGPTチャット、採否・次の製造工程の決定はAuthor。

**今回は一括実装タスクとする。各工程で再びLUNAへ依頼したり、Astraの設計承認を求めたり、個別の次タスク指示を待ったりせず、最後の再現テストまで進める。**

ただし、必要な元コードが存在しない、記録と矛盾する、保護対象を変更する必要がある場合は、根拠付きでHOLDする。

## 1. 作業基準

- Repository：`satw-jp/katachi`
- Branch：`agent/minia-authored-support-program-v0`
- Draft PR：[PR #63](https://github.com/satw-jp/katachi/pull/63)
- 確認済み開始基準HEAD：`179d99de67924cd77711c734a00e952487ca4d7a`
- 実装場所：`tools/authored_support/`
- Source authority：[Issue #62](https://github.com/satw-jp/katachi/issues/62)の最新Astra一括実装指示V2、従来のV1設計、SOURCE_RULE_MAP、元コード

実行前に最新HEAD、worktree、dirty/unpushed、稼働job、AGENTS.md、TEAM_PROTOCOL_CORE.md、実在する上位AGENTSを確認する。

既存のV4 D2限定PASSを保護する。既存worktreeを強制reset/cleanしない。mainへmergeしない。Draft PRを維持する。

正常運用時のLLM/API/network利用は0。Bambuの`normal(auto)`や`tree(auto)`へ変更しない。

## 2. 完成条件

**同じMINI_A元入力から、最終22,373件のSupport計画と全meshを元規則により再生成し、成功版MINI_AのSupportとの一致を検証する。**

以下を個別に確認する。

- 全Support種類、ID、順序、anchor/target、接点・法線・切断点、寸法、経路、作品別例外の一致
- 生成meshの頂点・面・数値型・形状配列の一致
- 成功版3MF内のauthored Support partとの対応
- source→mini→nativeの変換が正確に一度だけ適用されること
- goldenや保存済み完成Supportを生成入力に使っていないこと
- fresh process、異なる出力先、移設後にも再現できること
- 原本が変更されないこと

**件数だけの一致、見た目の近似、完成JSON/meshのコピーは不合格。**

## 3. 最後まで実装する工程

### Phase A：V4 D2の既存成果を固定

現在のstage registryとV4 D2生成器をそのまま出発点にする。

既存の確認結果：

- 151候補再生成
- 拒否記録157件一致
- 元入力から再計算したmask一致
- 151/151件のmesh配列一致
- V4対象の4,202入力ファイルの前後SHA一致

これらはV4 D2限定の技術成果であり、全体Support再現とは区別する。

### Phase B：D2除去順を生成する

元コード：

- `R4_V2_V3_A1_EXPERIMENTAL_V4/reproduce/check_geometry.py`
- `R4_V2_V3_A1_EXPERIMENTAL_V4/reproduce/removal_below.py`

既存V4 D2生成器が作った151候補を入力する。

元の水平24方向の工具経路判定と、斜め下方向の追加探索を副作用のないPython関数に移植する。

**150件の除去順と保留`D2_112`を、保存済み回答を読まずに再計算すること。**

計算終了後に、保存済み`removal_sequence.json`と順序・ID・工具方向・残存IDを比較する。

なお、**150件の除去順成立と、後工程の`RETAINED_LOW_D2=115`は別の選択結果**である。無説明な絞り込みで同一視しない。

### Phase C：V5／V6を含む上流依存を完成させる

V7の元コードは、V4だけでなく次のデータも使用している。

- `R4_V5_AUTHORED_SUPPORT_REVIEW`
- `R4_V6_INTERNAL_ENVELOPE_REVIEW`
- V5の`support_geometry.json`
- V6の`selected_support_ids.json`
- V6のgrid／BODY初出情報
- V2花、V3内部構造、Host domain、protected corridor

SOURCE_RULE_MAPに記載されている9工程だけで、依存関係が完全だと決めつけない。

**元のどのコードが各中間データを生成したのかを追跡し、必要な生成処理を追加実装すること。**

元から固定されたAuthor入力は明示的sourceとして扱う。一方、生成可能な中間成果を、保存済み完成データで代用しない。

不明な生成規則をAIの推測で置換しない。

### Phase D：V7 Support生成

元コード：

`R4_V7_STRONG_SUPPORT_GATE/reproduce/`

以下の処理と、それらに依存する実際の補正コードを移植する。

- `prepare.py`
- `demands_anchors.py`
- `route_external.py`
- `route_body.py`
- `route_outer_body.py`
- `feet.py`
- `scaffold.py`
- `assemble.py`
- その他、採用Supportを実際に変更した接点・clearance・brace修正

接点選定、bed-rootedの外部経路、BODY-to-BODYの一時支持、上部brace、足、犠牲接点、除去方向、ID、選択順を元処理に合わせる。

**目標チェックポイント：Support mesh object 14,536件。**

V6 BODY-onlyのrooted material検査に、新しく生成するSupportを遡って加点しない。

この時点の一致結果を保存し、次工程へ続ける。

### Phase E：A1下部補強

元コード：

`R4_A1_MASTER_SUPPORT_PHYSICAL_REVISION/reproduce/revise_lower.py`

既存Supportを保持し、元規則によって下部の補強を追加する。

| 種類 | 元記録の追加数 |
|---|---:|
| `LOWER_LOCAL_SLEEVE` | 635 |
| `LOWER_RISING_SCAFFOLD_BRACE` | 4,220 |
| 合計追加 | 4,855 |

**目標チェックポイント：14,536 → 19,391件。**

接合、元Supportの保持、干渉、順序、mesh配列、寸法、IDを確認する。

旧コードは100% source-worldの寸法で再現し、ここでMINILの物理寸法として採用しない。

### Phase F：A/F2最終Support

元コード：

`R4_A_F2_PRINT_PREPARATION/reproduce/`

少なくとも以下を、元の実際の依存順に統合する。

- `lower_support.py` — 既存移植済みcallableを活用
- `lower_braces.py`
- `repair_contacts.py`
- `repair_main_ends.py`
- `final_support_data.py`
- 必要な検査・再接続処理

元コードの接点候補、A/F2両方のPermanentに対する干渉検査、犠牲接点、支柱、足、collar、braceの選択順を維持する。

目標とする元記録は次のとおり。

| 種類 | 変化 |
|---|---:|
| 拡張した足・collar | +864 |
| 花下面の直接接点 | +1,148 |
| 下部接点brace | +972 |
| 不要なIDの除外 | −2 |
| **最終** | **22,373** |

`N00224`と`X03795`は、それぞれ実際に除外された工程を特定し、source identityとexpected-beforeを持つ作品固有overrideで処理する。

F2固有の再接続を、A側へ無条件に適用しない。

**最終15種類・22,373件について、SupportのID集合・計画内容・実mesh・削除や付け替えの履歴を比較する。**

数字に合わせるために不足Supportをコピー・追加したり、不要と判断したものを推測で削除したりしない。

### Phase G：成功版MINI_Aとのnative一致

比較元：

`MINIA_PLA_EDITABLE_REPACKED.3mf`

SHA256：

`2fd6d48034e46c2e9e0200fd3ed145159d825035df3892bc1f61ac4e2d4f9736`

元Support台帳SHA256：

`ba38bb5f52212c214d42bec859ac83d58be7793b693f27c8aae4160bc08ba758`

既存の`pack_parts.py`、`TRANSFORM_AND_REFERENCE_LOCKS.json`、実際の3MF metadataを参照する。

ARTWORK＋PERMANENTとREMOVABLE_SUPPORTは別partとして認識する。

元記録のsource→plate変換：

```text
p_plate = p_source × 0.7333333333333333
        + (89.58849309285482,
           91.38825149536133,
           1.2951087678814617)
```

ただし、この式を機械的に重複適用せず、実際のnative component/build transform連鎖と照合する。

Support計画の一致、source-world mesh一致、native変換後のSupport part一致は独立して判定する。

ZIP日時や格納順だけの違いはgeometry不一致とみなさない。一方、許容差を後から広げて形状の不一致を隠さない。

成功版3MFは読取専用。今回は製造用3MF・STL・G-code・印刷packageの新規生成を行わない。

### Phase H：CLIを完成させる

既存のコマンドを、実際の生成処理へ接続する。

```text
python -m tools.authored_support inspect
python -m tools.authored_support build
python -m tools.authored_support verify
python -m tools.authored_support replay
```

各コマンドの契約：

- `inspect`：入力、source hash、依存、runtime、工程状態を確認
- `build`：goldenを読み込まずに、元入力から全Support計画とmeshを生成
- `verify`：入力SHAで固定した成功版と、計画・mesh・native partを比較
- `replay`：buildからverifyまで実行し、最終判定を返す

現在の`build/verify/replay`は全体HOLDの経路なので、必要な生成処理の統合後に完成経路へ接続すること。

実行関数の登録はPythonで行い、JSON内の文字列を実行可能関数として扱わない。

入力・生成物・比較基準を混同しない。

## 4. 必須の修正・テスト

`check_asset()`は期待SHAが空または不正形式ならPASSしてはいけない。64桁の正しいSHA256で固定する。

GOLDEN自身のSHAと参照先のSHAを比較前に確認する。

全Permanent `mesh_source`の必要な内容identityも閉じる。

以下を試験する。

1. 全15種類のSupportが元入力から再生成される。
2. 22,373件の最終計画と全meshの一致が確認される。
3. 成功版native Support partとの対応が検査される。
4. GOLDENや生成済み中間成果を隠しても`build`が動く。
5. 同じ入力からの別プロセス・別出力先で再現できる。
6. 入力SHA不一致、未知kind、欠損ID、二重ID、誤override、衝突、二重scaleを検出する。
7. 原本や既存runへの上書きを拒否する。
8. import時にファイル変更・生成・外部プロセス起動をしない。
9. 正常実行にLLM/API/networkを使用しない。
10. 過去の支持・除去の未確認事項を勝手にPASSへ変更しない。

実装した各工程の再現チェックを通してから次へ進むが、**各工程で新しいAuthorレビュー依頼を挟まず、同一タスク内で最後まで実装すること。**

計算量の大きい再実行は無制限に行わない。stage別の入力・レシピ・コード・runtime identityに紐付く隔離cacheは利用可能とする。修正回数上限などの上位規則を守る。

## 5. 保存する成果

```text
tools/authored_support/
  cli.py
  stage_registry.py
  planner.py
  rules/
  stages/
  presets/minia_legacy_v1/
  tests/
  README.md

新規run/
  SOURCE_LOCK.json
  RECIPE_RESOLVED.json
  OVERRIDES_APPLIED.json
  STAGE_RESULTS/
  support_geometry.json
  support_mesh/
  DECISIONS.jsonl
  VALIDATION.json
  REPLAY_COMPARISON.json
  TESTS.json
  RESULT.md
```

既存のsource/schemaを可能な限り再利用する。

すべての中間工程について、生成ID、採用・拒否、変更されたmesh、source identity、expectedとの一致・不一致を保存する。

大きなmeshと実行証拠はDriveへ、小さいコード・レシピ・状態・再現入口はGitHubへ保存する。

Draft PR #63に実装を反映し、mainへはmergeしない。

## 6. 最終STOP

**すべて再現できた場合**

`MINIA_AUTHORED_SUPPORT_PROGRAM_REPLAY_READY`

必要条件は、全上流生成、22,373件のSupport計画、全mesh、native Support partの再現比較と必要テストが通過していること。

これは**ソフトウェア上の再現成功**であり、印刷可能判定ではない。

**どれかが再現できない場合**

`MINIA_AUTHORED_SUPPORT_PROGRAM_REPLAY_HOLD`

未取得source、生成規則不足、ID不一致、plan不一致、mesh不一致、native変換不一致を分類し、具体的なファイル・ID・理由を返す。

部分的な実装・PASSを失わず保存する。結果に合わせた閾値緩和、完成形のコピー、別方式の自動採用は禁止。

## 7. 今回やらないこと

- MINILへの実Support適用
- MINILの花2,303輪やPermanentの変更
- MINILの追加115枝の採否変更
- SuperTack設定や層高の変更
- Bambu Studioでのslice
- STL・製造用3MF・G-code・印刷packageの生成
- プリンタへのSend・Print
- 他作品・他branch・既存jobの変更
- mainへのmerge

**MINILへの適用は、MINI_Aの全再現が確認された後の別gateとする。** MINI_AのSupport座標や旧寸法をそのままコピーしない。

## 8. 最終報告

このChatGPTチャットへ、以下を一度に報告する。

- branch / HEAD / dirty / Draft PR
- 完成した工程と元記録との件数比較
- 全Support plan一致結果
- mesh配列一致結果
- native part一致結果
- testsのPASS/FAIL/SKIP
- 実測時間・メモリ
- 原本SHAの前後確認
- 未対応のsource・ID・例外
- 通常生成でのLLM/API/network利用が0であること
- MINIL適用、slice、Send、Printがすべて0であること
- 作者が次に判断すべき事項

**最終指示：既存V4 D2の限定再現PASSを保護し、残るV4除去順、V5/V6依存、V7、A1下部補強、A/F2最終Support、成功MINI_Aのnative part照合まで、一つの実装タスクとして完遂してください。毎工程で依頼を差し戻さず、元資料だけで決められることは続けて実装し、全体READYまたは根拠付きHOLDで終了してください。**