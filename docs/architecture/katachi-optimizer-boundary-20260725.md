# Katachi ⇔ Optimizer 責任境界 — R0

作成日: 2026-07-25
対象: `/Users/atsushisato/Projects/active/Katachi`（9 Study） / `/Users/atsushisato/Projects/active/Optimizer`
元指示: Optimizer `docs/sonnet-instruction-20260725-katachi-capability-map-and-reorganization-r0.md` §5（成果物C）
姉妹文書: 座標・export契約は [katachi-coordinate-export-contract-20260725.md](katachi-coordinate-export-contract-20260725.md)
関連（別文書・本文書では作らない）: capability map / dependency-duplication map / reorganization plan

これは調査と設計の文書である。実装・移動・削除は一切行っていない。

## 0. ラベル規約（指示書 §2.4）

- **Observed** — コード・ファイル・実測から確認した事実。読んだ場所を併記する
- **Inferred** — 複数の事実から導いた解釈
- **Proposed** — 将来の整理案。実装していない
- **Author decision** — 作者が選ぶ必要がある事項

本文書は「印刷可能」「サポート不要」「安全」「荷重に耐える」を一切主張しない。両プロジェクトが出すのは
推定値とその根拠・限界だけである。

---

## 1. 現状の一行要約

**Observed** — 今日、KatachiとOptimizerの間には**プログラム的な接続が一つもない**。境界は
「作者がブラウザからダウンロードしたファイルを、Optimizerのファイル選択へ手で渡す」という
人手の受け渡しである。Optimizer README（2026-07-19 のエントリ）自身がそう記録している:
Katachiの `part-a.stl` / `part-b.stl` は「通常のファイル選択で足りるため」専用の受け渡し導線を
実装していない。

**Inferred** — したがって現時点の「境界面」とは、API境界ではなく**ファイル形式の境界**である。
指示書 §5.3 が「KatachiからOptimizerの内部Python/TypeScriptを直接importする案を前提にしない」と
書いているのは、将来の禁止事項というより**既に成立している事実の追認**にあたる。

---

## 2. Katachiが持つ責任（§5.1）

**Observed** — 実際にKatachiのコードにあるもの。括弧内は実在する場所。

| 責任 | 実体 | 現状の所在 |
|---|---|---|
| 形状生成原理 | 9 Studyそれぞれの場の定義と成長・充填・変形則 | `src/studies/<name>/field.ts`, `growth.ts`, `deform.ts`, `cell.ts` ほか |
| 作者が選ぶcreative parameter | seed・半径・blend・被覆率・厚み・coinBulge など | 各Studyの `ui.ts` と `params`/`GrowthParams` |
| field / recipe / history | 正本は場＋操作履歴。表面は導出物（AGENTS.md §5） | 各Studyの `history.ts`、共有封筒は `src/lib/recipe.ts` |
| 制作意図を持つ分割・接合 | S-skinのA/B ownership field分割、patch隣接グラフ | `src/studies/skin/partition.ts`, `main.ts` |
| printer/build-volumeを使った生成上の制約 | printer preset・build axis・build plate・build volume gate | `src/studies/interior-growth/field.ts`, `meshExport.ts` のみ |
| 書き出す形状への明示的geometry operation | build plate半空間とのhard intersection（`Math.max`）、face winding正規化、degenerate除去 | `interior-growth/meshExport.ts:buildCandidateMesh`, `cloud-sculpt/meshExport.ts:orientMeshForSavedStl` |
| provenance | 生成条件・測定値・限界の列挙 | `interior-growth/meshExport.ts:CandidateProvenance`, `skin/main.ts:exportPartition` |

**Observed（重要な非対称）** — 上の「printer/build-volume」行は**S-interior-growthにしか存在しない**。
S-skinはSTL・recipe・provenance・SHA-256を書くがbuild axisもbuild plateもbuild volumeも持たない。
残り7 Studyは `targetLongestMm`（最長辺を何mmに合わせるか）だけを持つ。詳細は姉妹文書 §1。

**Inferred** — Katachiが持つべき責任の判定基準は「**作者の造形意図が入るか**」である。
build axisは作者が選ぶ（＝造形の決定）。分割線も作者が選ぶ。一方、出来上がったファイルが
水密かどうかは作者の意図とは無関係な事実であり、そこはKatachiの独占領域ではない。

---

## 3. Optimizerが持つ責任（§5.2）

**正本 = Optimizer `AGENTS.md`**。全11行のうち責任を規定しているのは次の5点である（引用は要約せず該当条項を指す）。

1. 入力ファイルは決して変更しない
2. 変換結果は必ず別ファイルとして書き出し、何をどう変えたかの来歴を残す
3. 診断は引き続き**入力そのもの**に対して行う
4. 推定値は推定と明記し、印刷可能性を断定しない。機種・素材・作者の実機値を決め打ちしない
5. 最終目標は、形状調整・分割・向きの工夫によって除去不能なサポートを避けること

**Observed** — READMEで確認できる実装（v0.8.2, 2026-07-18時点）。

| 責任 | 実装 |
|---|---|
| 入力自体の独立診断 | `optimizer check` — trimeshによる独立読み込み。Katachiの計算を信用しない |
| topology推定 | watertight / winding一貫 / 境界辺数 / 非多様体辺数 / 独立シェルと体積（`diagnostics.py:435` の `schema_version: 3`） |
| 壁厚推定 | 表面標本から内向きレイ。最小位置・p05・標本数・信頼度 |
| overhang推定 | +Z造形前提。面法線と面積から潜在率、可視性レイで内部/外面を分類 |
| 向き候補 | ±X/±Y/±Zと球面標本を比較し内部率の低い上位3件（入力メッシュは回転しない） |
| scale窓 | 壁厚p05から最小Scale、A1 mini / A1の造形体積から最大Scale |
| 入力を変更しない変換 | `orient`（指定方向を+Zへ剛体回転し、Z最小を `z=0` へ平行移動）、`smooth`（Taubin）、島除去、選択空洞充填 |
| 変換来歴 | `<input>-oriented-provenance.json` など。`schema_version` / `source.sha256` / `origin_source` / `operations[]` / `output.sha256`（`transform.py:94-146`） |

**Observed（境界にとって決定的な事実）** — Optimizerの `orient` は既に
「選んだ方向を+Zにする剛体回転 + Z最小をベッド面 `z=0` へ平行移動」を実装し、
その回転・平行移動・入出力のSHA-256を来歴JSONへ記録している。つまり
**「Z-up / plate=0への正規化」は、既にテスト済みの実装としてOptimizer側に存在する**。
これは姉妹文書 §3 のA/B/C比較の前提になる。

---

## 4. 境界面 — ファイル/データ契約

### 4.1 今日ほんとうに存在するファイル（Observed）

コードを読んで確認した、実際に書き出されるファイル名。

- **S-cloud-sculpt / S-foam / S-pack**（`meshExport.ts` の `downloadMeshBundle`）
  `<base>.stl` + `<base>.obj` + `<base>.recipe.json`
- **S-rings**（同上 + 追加）
  `<base>.stl` + `<base>.obj` + `<base>.recipe.json` + `<base>.s1-recipe.json`
- **S-skin**（`main.ts:exportPartition`）
  `<base>-part-a.stl` + `<base>-part-b.stl` + `<base>-partition.recipe.json` + `<base>-partition-provenance.json`
- **S-interior-growth**（`meshExport.ts` の3関数。ボタンが別々）
  `<base>-<variant>.stl` + `<base>-<variant>-growth-provenance.json` + `<base>-growth.recipe.json`
- **S-sag / S-gravity** — メッシュ書き出しなし（recipeのみ）
- **S-mpm** — STLは**入力**のみ（`stlImport.ts`）。書き出しなし

### 4.2 形式ごとの契約表

指示書 §5.3 の7項目。**現状（Observed）**と**提案（Proposed）**を同じ表の中で分けて書く。

| 形式 | 正本は何か | 誰が書くか | 誰が読むか | version field | SHA-256 | legacy migration | 再計算可能性 |
|---|---|---|---|---|---|---|---|
| **STL**（存在する） | **正本ではない**。場＋recipeからの導出物（AGENTS.md §5） | Katachi 6 Study（`encodeBinaryStl`, binary, float32, 単位情報なし） | Optimizer（trimeshで独立に読む）／スライサー／S-mpm（`stlImport.ts`） | **なし**（STL形式に版の概念がない） | Katachiは書き出しバイト列のSHA-256を**計算するが、STLファイル自体には入らない**（provenance側に置く。interior-growth `sha256Hex`, skin `sha256Hex`） | 概念なし | **条件付き可**。同じrecipe + 同じ `resolution` + 同じcanonical scaleなら再生成できる。ただしSTLに記録がないので、STL単体からは再計算条件が分からない |
| **recipe.json**（存在する） | **これが正本**（場＋操作履歴） | Katachi 9 Study全部 | Katachi自身（replay）。**Optimizerは読まない** | `formatVersion: 1` + `studyId` + `exportedAt`（`src/lib/recipe.ts`）。ただし共有封筒を通しているのは cloud-sculpt と interior-growth の2 Studyのみ、他7 Studyは同じ形を自前で組む | なし。ただしS-skinは**入力**recipeのSHA-256をprovenanceへ記録する（`inputRecipe.sha256`） | **あり**。`formatVersion` は1のまま、**構造検出**で移行する（interior-growth `history.ts:isLegacyEnvelope`／`migrateStoredResult`、S-skinのcoinBulge追加も同じ前例）。未測定値は0ではなく `null` で埋める | **完全**。replayが定義。ただしメッシュ解像度など生成時パラメータの一部はrecipe外 |
| **provenance.json**（存在する。ただし2 Studyのみ） | 生成時条件と測定値のスナップショット | S-interior-growth（`CandidateProvenance`）／S-skin（`exportPartition` 内の無名オブジェクト） | **今日は人間だけ**。Optimizerは読まない | interior-growth: `toolVersion: "0.2.0"`（`meshExport.ts:394` のハードコード定数。manifestの `v0.5.0` とは別物）。skin: `tool.version = manifest.version` | **あり**。interior-growth `savedStlSha256`（保存バイト列）、skin `outputStl.partA/partB.sha256` + `inputRecipe.sha256` | `legacyMigrated: boolean` を記録する（真偽のみ。何をどう移行したかは記録しない） | 測定値なので再計算可能。ただし `savedStlSha256` は保存バイト列に依存 |
| **fabrication-plan.json** | — | — | — | — | — | — | — |
| **diagnostics.json** | — | — | — | — | — | — | — |

### 4.3 存在しない2形式について（Observed、はっきり書く）

- **`fabrication-plan.json` は存在しない。** Katachi・Optimizer両リポジトリを検索して、
  この名前が出てくるのは指示書 §5.3 の候補リスト1行だけである。実装も、これに相当する
  別名のファイルもない。
- **`diagnostics.json` という名前のファイルも存在しない。** ただし**中身に相当するもの**は
  Optimizer側にある: `optimizer check --json` の出力および WebUI の「JSONをダウンロード」が
  出す `<input>-optimizer.json`（`schema_version: 3`、実測4779バイトの例あり）。
  名前だけが違う。**Inferred** — 指示書の `diagnostics.json` はこの既存出力を指していると
  読むのが自然で、新形式を作る必要はない。

**Proposed** — `fabrication-plan.json` を今作らない。作るとしたら、それは
「作者がどの候補をどの向きでどのスケールで出すと決めたか」という**決定の記録**であり、
生成条件（recipe）でも測定値（provenance / diagnostics）でもない第4の種類になる。
その実需は今のところ観測されていない（AGENTS.md §1「道具は研究の堆積物」）。

### 4.4 受け渡し導線（Observed）

```
Katachi (browser)                        作者                    Optimizer (local Python / WebUI)
  ├ *.stl            ──────────────→  ダウンロード  ──────→  ファイル選択 → check → *-optimizer.json
  ├ *.recipe.json    ──────────────→  手元に保持    ──╳──→  （読まない）
  └ *-provenance.json ─────────────→  手元に保持    ──╳──→  （読まない）
                                                            └ orient → *-oriented.stl + *-oriented-provenance.json
```

**Observed** — 破線（`╳`）の2本が、今日つながっていない場所である。Optimizerは
Katachiのrecipeもprovenanceも一切参照せず、STLのバイト列だけを見る。
逆にKatachiはOptimizerの診断JSONを読み戻さない。

**Observed（片方向の非対称）** — OptimizerのprovenanceはKatachiのファイルをSHA-256で
指し示せる（`source.sha256`）。だがOptimizerの**診断**JSON（`schema_version: 3`）は
入力の `path` しか持たず**SHA-256を記録しない**（`diagnostics.py:389` の `input_info`）。
つまり診断結果と入力ファイルの同一性は、今日はファイル名でしか結べない。

**Proposed（最小の追加、3点。いずれも小さく戻せる）**

1. Optimizerの診断JSONの `input_info` に入力のSHA-256を足す。これだけで
   「Katachiのprovenanceが記録したSTLハッシュ」と「Optimizerが診断したファイル」が
   機械的に一致検証できるようになる。**Optimizer側の変更なので本ラウンドでは提案のみ**
2. Katachiのprovenanceに、その形状が置かれている座標系の情報を足す（姉妹文書 §4 で具体化）
3. 上の2つが揃った時点で初めて、「recipe → STL → 診断 → orient → 診断」の
   一本の鎖がハッシュで追跡可能になる。それ以前に自動連携の配管を作らない

---

## 5. 両側にある診断の突き合わせ

指示書 §5.3 末尾の要求: 同じ診断が両側にあるとき、**すぐ削除せず**、
「Katachi生成中の高速近似」と「Optimizerの独立診断」として役割が違う可能性を検討する。
一件ずつ正直に判定する。

### 5.1 判定表

| 診断 | Katachi側（Observed） | Optimizer側（Observed） | 判定 |
|---|---|---|---|
| 水密性 / 非多様体 / winding | `inspectSavedStlTopology`（float32へ丸めた**保存後**三角形で開いた辺・非多様体辺・winding不一致辺・退化三角形を数える。`cloud-sculpt/meshExport.ts:713`） | `topology`（trimeshの `is_watertight` / `is_winding_consistent` / 境界辺数 / 非多様体辺数） | **二つの役割**（削除不可） |
| connected components | `computeConnectedComponentsWithKey`（float32厳密キーのunion-find）。interior-growthの保存ゲートは `!== 1` を**不合格理由**にする | `shells`（塊ごとの体積・微小片候補・非水密シェルは体積 `null`） | **二つの役割**（ただし数え上げ自体は重複） |
| build volume適合 | 保存ゲートが `mesh.mmBounds.size` を printer presetの生の build volume と成分ごとに比較（`evaluateSaveGate`） | `scale_window`（壁厚p05から最小Scale、A1 mini/A1の造形体積から最大Scale） | **二つの役割**。ただし**printer諸元テーブルは真の重複** |
| overhang / support | 生成中のrule 5: `allowedLateralForStepMm(verticalStep, layerHeight, layerHeight/tan(angle))`。unitの1ステップごとに判定し、plate上のunitは免除。`unsupported-span` と `ring-discontinuous-support` も同じ内部derived値を使う | 完成メッシュの面法線と面積からの潜在率 + 可視性レイによる内部/外面分類。+Z造形前提、ベッド接触下面は除外 | **重複ではない**（対象も規約も違う）。ただし**互いに較正されていない** |
| void / 外部連結 | `analyzeVoids`: グリッド分類（0=exterior / 1=void / 2=solid）＋6連結flood fillで `closedVoidComponents` / `closedVoidVolume` / `exteriorConnectedVoidVolume`（`growth.ts:2431-2530`）。**場**に対して測る | 可視性レイによる面の内部/外面分類と、選択空洞の充填（`fill_cavities`）。**メッシュ**に対して測る | **二つの役割**（削除不可） |
| surface coverage | `coverage.ts`（host SDFから作った参照sample集合4000点に対する被覆率、seed固定） | なし | Katachi固有 |
| 壁厚 | **なし**（Katachi全体を検索して該当実装なし） | `wall_thickness_estimate`（内向きレイ、p05、信頼度） | Optimizer固有。**Katachi側の正直な空白** |
| 向き探索 | **なし**。`buildAxis` は作者が選ぶ（UIのradio） | `orientation_scan`（6軸＋球面標本26、上位3件を提案） | Optimizer固有。**境界線として最も明快** |
| 体積 | `computeMeshVolume` / `computeSignedMeshVolume` | shellごとの体積 | 些細な重複。行動不要 |

### 5.2 判定の根拠（重要なものだけ）

**水密性 — 二つの役割（genuine cross-check）。** これは特に強い根拠がある。
`inspectSavedStlTopology` のdoc commentが、この関数が存在する理由をそのまま記録している:
「T13 gate-correction audit finding: KatachiがwatertightだとしたメッシュをOptimizerの独立な
float32 STL readerが非多様体と判定した」。つまりKatachi側の保存後topology検査は
**Optimizerの独立診断に一度負けたから生まれた**。Katachi側はダウンロードをブロックする
**ゲート**（不合格なら通常STLを提供しない）、Optimizer側は完成ファイルに対する**独立検証**。
どちらかを消せば、この相互検証のペアそのものが消える。**削除提案しない。**

**connected components — 二つの役割、ただし計算自体は重複。** Katachiは
「monolithic候補が本当に1個か」という真偽ゲートに使う（S2.1監査で、3〜4成分のSTLが
水密性しか見ていない旧ゲートを通過していた事故の再発防止）。Optimizerは体積つきの一覧を出し、
微小片を選択除去できる。**問いが違う**（合否 vs 一覧と操作）。
union-findの数え上げロジック自体は重複だが、Katachiはブラウザ内でPythonを呼べないので
統合先がない。**現状維持が妥当。**

**build volume — 二つの役割、しかしデータは真の重複。** Katachiの
`PRINTER_PRESETS`（A1 256³ / A1 mini 180³ / custom）とOptimizerの `settings.printers`
（`config/defaults.toml`）は、**同じ機種の同じ造形体積を二箇所に別々に持っている**。
これは役割の違いではなく、単なる定数の二重管理である。判定ロジックは残すべきだが、
**数値そのものは1つの機種データファイルに寄せる余地がある（Proposed）**。
なおOptimizer `AGENTS.md` は「機種・素材・作者の実機値を決め打ちしない」と書いており、
Katachi側 `PRINTER_PRESETS` のコメントもメーカー仕様ページの確認日（2026-07-24）を残している。
統合するならその出典表記ごと移す。

**overhang — 重複ではない。だが較正もされていない。** 両者は違うものを見ている。

- Katachi: **まだメッシュになっていない候補unitの1ステップ**。場の単位。layer heightと
  作者入力の角度から `layerHeight/tan(angle)` の横移動許容量を出す。plate上のunitは免除
- Optimizer: **完成メッシュの面**。+Z前提。面法線と面積、可視性レイ

Katachiのprovenanceは自分でこう書いている（`angleConvention`）:
「0deg=parallel-to-plate, 90deg=vertical-wall (Katachi local approximation, **not asserted to
match any specific slicer**)」。Optimizer READMEも同趣旨の限界を書いている。
**Inferred** — 二つは同じ「サポート」という言葉を使いながら、突き合わせた記録がない。
これは削除すべき重複ではなく、**測るべき差**である。

**Proposed（較正、実装しない）** — 同一STLに対して
「Katachiの生成時rule 5が通した形」と「Optimizerの `overhang_estimate` の内部率」を並べて
記録する比較を一度行う。一致することを期待するのではなく、**どれだけずれるかを数字にする**。
これは実物実験ではないのでAIが実行できるが、結果の解釈と採否は作者の判断（AGENTS.md §6）。

**void / 外部連結 — 二つの役割。** Katachiは**場のグリッド**を数え、生成の途中で使える
（`voidGridResolution` に依存する粗い近似だと自分で限界に書いている）。Optimizerは
**完成メッシュ**に対してレイを飛ばし、さらに充填という**変換**まで行う。
Katachi側は「育てながら閉じた空洞ができていないか」を見る道具、Optimizer側は
「出来上がったファイルのどの空洞を埋めるか」を決める道具。**両方残す。**

### 5.3 まとめ — 削除提案は1件もない

判定した9項目のうち、**削除を提案するものはゼロ**である。真の重複と呼べるのは
「printer機種の造形体積という**定数**」1件だけで、これも診断ロジックではなくデータの重複である。

**Inferred** — この結果は偶然ではない。Katachi側の診断はどれも
**保存前に働いて何かを止める**（保存ゲート、生成中の候補棄却）ために存在し、
Optimizer側の診断はどれも**完成ファイルを独立に見る**ために存在する。
時点と権限が違うので、機能が似ていても置き換えられない。

---

## 6. 境界の一行定義（Proposed）

> **Katachiは「まだ形になっていないもの」に対して、作者の意図を入れながら制約をかける。
> Optimizerは「もう形になったファイル」に対して、意図を知らないまま独立に測り、
> 入力を変えずに別ファイルへ変換する。**

この線から導かれる帰結:

- Katachiは向き探索を実装しない（作者が `buildAxis` を選ぶ。探索はOptimizerの仕事）
- Katachiは壁厚診断を実装しない（完成メッシュに対する事後測定はOptimizerの仕事）
- Optimizerはrecipeを解釈しない（場と履歴はKatachiの正本。Optimizerが読むとKatachiの
  内部表現がOptimizerのAPIになる）
- **例外はS-skinの分割**。coin/Patch由来のA/B分割はOptimizer側で一度試み、
  CoinSRF実ファイル（smooth-min合成で単一シェル）を処理できないと実測で判明したため
  Katachi側へ移した（Optimizer README 2026-07-19 の訂正エントリ）。
  **Inferred** — 「元の場を知らないと不可能な操作はKatachi側」という境界の実例であり、
  上の一行定義と矛盾しない

---

## 7. Author decision キュー

作者が決める必要がある事項。AIは選ばない。

1. **printer機種データを一本化するか。** Katachi `PRINTER_PRESETS` と
   Optimizer `config/defaults.toml` の `printers` が同じ数値を二重に持つ。
   一本化するなら、どちらを正本にするか（片方はビルド時に読むだけにする）
2. **Optimizerの診断JSONに入力SHA-256を足すか。** 足せばKatachi provenanceと機械的に
   結べる。Optimizerリポジトリの変更なので本ラウンドでは触っていない
3. **overhang較正を一度やるか。** Katachiの生成時ruleとOptimizerの事後推定の差を
   数字にする。実装ではなく測定
4. **`fabrication-plan.json` を作るか。** 今は実需が観測されていない。
   作るとしたら「作者の決定の記録」という第4の種類になる
5. **provenanceの `toolVersion` をどう扱うか。** interior-growthは
   `meshExport.ts` のハードコード `"0.2.0"`、S-skinは `manifest.version`（`v0.13.0`）を使う。
   同じ意味の欄が別々の値を指している

**Follow-up（2026-07-26）**: version 契約の正本は
[katachi-version-contract-20260726.md](katachi-version-contract-20260726.md) §6 である。
interior-growth の `toolVersion` と skin の `tool.version` は**同じ意味の欄ではない**——
前者はハードコード定数、後者は manifest version への生きた参照である。語彙統一は Proposed
であって**未実装**であり、既存値は legacy producer tag として扱う。参考として、§4.2 の表が
引用している `meshExport.ts:394` は当時の行番号で、`TOOL_VERSION` は現在
`src/studies/interior-growth/meshExport.ts:397` にある（**実測 2026-07-26**）。
上の item 5 は行番号を引用していない。表の historical な引用はそのまま残す。

---

## 8. この文書が主張していないこと

- どのファイルも「印刷可能」「サポート不要」「安全」を意味しない
- Katachiの保存ゲートは**Katachiが測れる範囲で**の不合格を止めるだけで、合格が実機の成功を
  意味しない
- Optimizerの診断は推定であり、両者が一致しても実物の保証にはならない
- 実物の印刷・破壊・人が触れる試験は人間のみが行う（Katachi AGENTS.md §6）
