# Katachi 座標・export契約 — R0

作成日: 2026-07-25
対象: `/Users/atsushisato/Projects/active/Katachi`（9 Study）
元指示: Optimizer `docs/sonnet-instruction-20260725-katachi-capability-map-and-reorganization-r0.md` §6（成果物D）
姉妹文書: 責任境界は [katachi-optimizer-boundary-20260725.md](katachi-optimizer-boundary-20260725.md)
関連（別文書・本文書では作らない）: capability map / dependency-duplication map / reorganization plan

これは調査と設計の文書である。実装・移動・削除は一切行っていない。
ラベル規約は指示書 §2.4（**Observed** / **Inferred** / **Proposed** / **Author decision**）。

---

## 0. 最初に — この契約は今どこまでを覆っているか

**Observed** — 「Katachi全体の座標契約」と呼べるものは、今日は存在しない。
9 Studyのうち**造形の封筒（fabrication envelope）を持つのは1つだけ**である。

| Study | メッシュ書き出し | scaleの決め方 | build axis | build plate | build volume | provenance | SHA-256 |
|---|---|---|---|---|---|---|---|
| **interior-growth** | STL（候補ごと） | printer presetからの canonical scale（`fitHostToBuildVolume`） | **あり**（`envelope.buildAxis`, x/y/z） | **あり**（`buildPlateOffset`） | **あり**（保存ゲートで判定） | あり | あり |
| **skin** | STL（part-a / part-b） | `targetLongestMm`（最長辺を何mmにするか） | なし | なし | なし | あり | あり |
| cloud-sculpt | STL + OBJ | `targetLongestMm` | なし | なし | なし | なし | なし |
| foam | STL + OBJ | `targetLongestMm` | なし | なし | なし | なし | なし |
| pack | STL + OBJ | `targetLongestMm` | なし | なし | なし | なし | なし |
| rings | STL + OBJ | `targetLongestMm` | なし | なし | なし | なし | なし |
| sag | **なし**（recipeのみ） | — | — | — | — | — | — |
| gravity | **なし**（recipeのみ） | — | — | — | — | — | — |
| mpm | **入力のみ**（`stlImport.ts`） | — | — | — | — | — | — |

**この文書の契約が実際に適用される範囲（Observed）:**

- §2の6座標系の区別が**全部意味を持つのはS-interior-growthだけ**
- S-skinには「選ばれたbuild軸」も「build plate」も存在しない。適用されるのは
  「内部field座標 / renderer world / 保存STL / スライサー期待」の4つだけ
- cloud-sculpt / foam / pack / rings には「最長辺を何mmに合わせたか」以外の造形前提がない
- sag / gravity / mpm には適用されるものがない

**この狭さを隠さずに書くことが、全Studyへ一般化したふりをするより有用である。**
以下の議論は、既定では「interior-growthの契約」として読み、他Studyへは
「昇格の実需が出たときに広げる候補」として読む（AGENTS.md §4「昇格」、§1「道具は研究の堆積物」）。

---

## 1. 区別する座標（§6.1）

6つを混同しないために、それぞれ「定義 / 誰が決めるか / 今日の実装 / 単位」を分ける。

### 1.1 Study internal field coordinates（内部場座標）

**Observed** — 無次元のfield unit。原点は host の中心。3つの合成hostの寸法（`field.ts`）:

- `box`: `BOX_HALF = (1, 1, 1)` → bounds ±1
- `sphere`: `SPHERE_R = 1.15`
- `waisted`: `(±0.95, ±1.2, ±0.95)`

**Observed** — この座標系そのものに「上」はない。既定で上に見えるのは
`DEFAULT_FABRICATION_ENVELOPE.buildAxis = { x: 0, y: 1, z: 0 }`（`field.ts:186`）だからである。
**つまり「内部fieldは既定Y-up」という言い方は、正確には「既定のbuild軸がyである」という意味**であり、
field座標に焼き込まれた上方向ではない。

### 1.2 Renderer / world coordinates

**Observed** — field座標と**1:1**。変換なし。
`renderer.ts` はunitやvoid点を `position.set(p.x, p.y, p.z)` でそのまま置き、
three.jsの既定（Y-up）カメラで見る。build volumeのwireframe boxも
「world x/y/z に沿って `buildVolumeMm/scaleMmPerUnit` から直接サイズを決める（回転なし）」と
コメントに明記されている（`renderer.ts:119`）。

**Inferred** — 画面で見えている向きが、そのまま保存STLの向きである。
作者が画面で「上」と思った方向は、STLの中では `buildAxis` の軸であって、Zではない。

### 1.3 Selected build axis（選ばれた造形軸）

**Observed** — `envelope.buildAxis: Vec3`。UIのradioが出すのは +x / +y / +z の3つ。
コードは符号も持ち回る（`cardinalBuildAxis` が `sign: 1 | -1` を返す）が、UIから負の軸は出ない。
斜め軸は非対応で、`buildPlateOffset` のdoc commentが
「Only axis-aligned buildAxis values (±x/±y/±z) are supported ... not a general oblique-axis solver」と
自分で限界を書いている。

この軸が決めるもの: build plate平面、overhang cone（rule 5）、height coverage、
`fitHostToBuildVolume` の高さ方向、保存ゲートの最低座標測定。

### 1.4 Printer build-volume coordinates（プリンタ造形体積座標）

**Observed** — `PRINTER_PRESETS`（`field.ts:464`）:

| id | label | buildVolumeMm | source |
|---|---|---|---|
| `bambu-a1` | Bambu Lab A1 | 256 × 256 × 256 | official（2026-07-24 メーカー仕様ページ確認） |
| `bambu-a1-mini` | Bambu Lab A1 mini | 180 × 180 × 180 | official（同上） |
| `custom` | Custom | 200 × 200 × 200 | author（作者が上書きする初期値） |

既定は `bambu-a1-mini`。

**Observed（見落としやすい前提）** — プリンタのW/D/Hとfieldのx/y/zの間に**写像がない**。
そのまま同一視している:

- `fitHostToBuildVolume` は `axisComponent(buildVolumeMm, buildAxis)` を高さとして使う。
  `buildAxis = y` なら **プリンタの「Y」が高さ**として扱われる
- 保存ゲートは `mesh.mmBounds.size.{x,y,z}` を `buildVolumeMm.{x,y,z}` と**成分ごとに**比較する

**Inferred** — 3つのpresetが全て立方体なので、この同一視は今日は目に見えない。
非立方体のプリンタをcustomで入れた瞬間に意味が変わる（`buildAxis=y` なら
プリンタのZ寸法ではなくY寸法が高さ制限になる）。**これは今日の実害ではないが、
契約として明文化されていない箇所である。**

### 1.5 Saved STL coordinates（保存STL座標）

**Observed** — 保存されるバイト列の座標は、**field座標 × `scaleMmPerUnit` を float32 に丸めたもの、それだけ**である。
コードを一つずつ確認した。

- `encodeBinaryStl`（`cloud-sculpt/meshExport.ts:808`）:
  `view.setFloat32(offset, p.x * result.scaleMmPerUnit, ...)`。**乗算のみ**
- `rescaleMeshResult`（同 :521）: `mmBounds` と `watertight` を再導出するだけ。
  **頂点に触れない**。原点も軸も正規化しない
- `orientMeshForSavedStl`（同 :532）: float32丸め後の頂点キーで
  (1) 退化三角形を落とし、(2) 辺の使われ方からcomponentごとにwindingを揃え、
  (3) 符号付き体積が負のcomponentを反転する。**面の向きだけ**。
  関数自身のdoc commentが `Coordinates are never moved or welded.` と書いている

**Observed（S-interior-growthの追加操作）** — `buildCandidateMesh` は
メッシュ化の**前に**場を切る:
`savedField = max(unitsSmoothField, plateOffset - dot(p, buildAxis))`。
build plate平面より下の材質を、完成メッシュの平行移動ではなくhard intersection（`Math.max`）で除去する。
smooth blendを使わないのは、plate平面に本当に平らな底面を作るため。

**Observed（既定値での実際の数値）** — 既定 = host `box` + preset `bambu-a1-mini` + `buildAxis = y`:

```
host height (field)   = 2.0                    (BOX_HALF.y = 1)
heightMm              = 180 × (1 − 0.1) = 162  (STUDY_MARGIN_FRACTION = 0.1)
scaleMmPerUnit        = min(162/2, 162/2, 162/2) = 81
buildPlateOffset(box, y) = −1.0  (field)
plate in mm           = −1.0 × 81 = −81 mm
```

plate-clip修正後のinterior-growth coin候補STLは **`minY = plateY = −81 mm`**。
これは前段の監査で**保存済みバイナリSTLのバイト列を読み直して実測**されており、
上のコード定数からの導出とも一致する。

**したがって保存STLは、既定で「Y方向が上、底面が y = −81 mm」に置かれている。**

### 1.6 Slicer expected coordinates（スライサーが期待する座標）

**Observed** — STL形式は単位も軸も持たない。Optimizer README も
「STLには単位情報がないため、入力座標をmmと仮定しています」を警告として出す。

**Inferred（一般的な前提であり、特定のスライサーの仕様として断定しない）** — 一般的なFDM
スライサーは Z-up、造形プレートを `z = 0`、単位をmmとして読む。
Optimizer自身も `orient` で「指定方向が+Zになる剛体回転 + Z最小が `z = 0` に接する平行移動」を
行っており、+Z造形を前提に overhang を推定している。

---

## 2. 今日ある差（Observed）

保存STL（§1.5）とスライサー期待（§1.6）の間には、**記録されていない剛体変換が1つある**。

| | 既定のKatachi保存STL | 一般的なスライサー期待 |
|---|---|---|
| 上方向 | **Y**（`envelope.buildAxis`） | Z |
| プレート面 | **y = −81 mm** | z = 0 |
| 単位 | mm（`scaleMmPerUnit` 適用済み） | mm（仮定） |
| メタデータ | **なし** | — |

**Observed** — STLファイル自体は `buildAxis` も plate offset も持たない。
binary STLの80バイトヘッダに入るのは `Yohaku Cloud Sculpt <name>` という固定文字列
（`encodeBinaryStl`。S-interior-growth と S-skin もこの共有関数を使うため、
**ヘッダには常に "Cloud Sculpt" と書かれる**）。

**Observed — provenanceから何が復元できて、何ができないか。**

復元できる:
- `envelope.buildAxis`（`CandidateProvenance.envelope`）→ どの軸が上か
- `canonicalScaleMmPerUnit` → mm/field unit
- `savedLowestBuildAxisMm` → **プレート面を0とした**保存メッシュの最低座標（既定で ≈ 0）
- `savedPlateContactVertexCount` → プレート面に実際に接している頂点数
- `sourceFixture.hostId` → hostが分かるので、Katachiの定数を持つ人なら
  `buildPlateOffset(hostId, buildAxis)` を再計算できる

**復元できない（数値として書かれていない）**:
- **保存STL自身の座標系におけるプレート面の絶対mm座標**（既定の `−81`）。
  `savedLowestBuildAxisMm` はプレート相対なので、この値からは絶対位置が出ない
- `buildAxis` を +Z へ持っていく回転そのもの

**Inferred** — つまり今日、`*.stl` と `*-growth-provenance.json` の両方を持っていて、
かつKatachiのhost定数を知っている読み手だけが、そのSTLを正しく置き直せる。
STL単体では置き直せない。provenance単体でも（絶対プレート座標がないので）足りない。

---

## 3. export案の比較（§6.2）

指示書の3案を、6つの判断材料で比較する。**実装しない。**

### 3.1 案の定義

- **A. Raw coordinatesを保存** — 現状。field座標 × scale をそのまま書く
- **B. 保存時にZ-up / plate=0へ正規化** — 保存の直前に剛体変換（回転 + 平行移動）を掛ける。
  field / recipe は変えない。逆変換をprovenanceへ残す
- **C. Raw と print-ready を両方保存** — 2本のSTLを出す

### 3.2 比較表

| 判断材料 | A. Raw（現状） | B. 保存時に正規化 | C. 両方保存 |
|---|---|---|---|
| **再現性** | 最も強い。保存STL = field × scale という等式が成立し、`meshLowestBuildAxisMm` などの測定がfield座標のまま説明できる | 保つことは可能だが、等式が「field × scale × R + t」になる。Rとtの記録が欠けた瞬間に測定値とファイルが対応しなくなる | Raw側でAと同じ強さを保てる。ただし2本の対応関係の管理が増える |
| **スライサー互換** | 弱い。既定で横倒し・プレート下81mm。作者が毎回スライサーで手で直す（その操作は記録されない） | 最も強い。そのまま読める | 強い。print-ready側をそのまま渡せる |
| **Optimizer連携** | **既に成立している**。Optimizer `orient` が「指定方向を+Zへ回転 + Z最小を z=0 へ」を実装済みで、回転・平行移動・入出力SHA-256を来歴JSONに残す。AがOptimizerの入力として想定どおり | Optimizerが既に持つ機能をKatachi側に二重実装することになる。Optimizer側の変換来歴も走らない | Optimizerには Raw を渡し、スライサーには print-ready を渡す、と使い分けられる。ただしOptimizerが**どちらを診断したか**の取り違えリスクが新たに生まれる |
| **recipeとの関係** | 最も素直。recipeは場と手の履歴だけを持ち、座標系の話が一切入らない | recipeは変えないので直接の影響はない。ただし「recipeをreplayして出したSTL」と「保存されたSTL」がバイト単位で一致しなくなる（変換が保存パスにしかないため） | Raw側はAと同じ。print-ready側はrecipeから直接導けない派生物になる |
| **build volume** | 判定はfield座標のまま。§1.4の「プリンタ軸=field軸」という暗黙の同一視が残り続ける | 正規化後はプリンタのX/Y/Zと保存STLのX/Y/Zが揃うので、build volume判定が**素直になる**。これはBの隠れた利点 | Raw側は同一視のまま、print-ready側は揃う。判定をどちらで行うか決める必要がある |
| **SHA-256** | 1ファイル1ハッシュ。単純 | 1ファイル1ハッシュ。ただし「同じ形状の別向き」が別ハッシュになるので、Rawとの同一性は変換記録でしか結べない | **2ハッシュ**。provenanceは両方を記録し、どちらが正本かを明示する必要がある |

### 3.3 A案の弱点を過小評価しないための注記（Observed）

**保存STLはすでに「純粋な研究形状」ではない。** `buildCandidateMesh` は
build plate半空間とのhard intersectionを掛けてからメッシュ化しており、これは
**造形都合の、しかも情報を失う**操作である（切り落とした材質は戻らない）。

**Inferred** — 「保存時にgeometryを触らない」という原則は、より不可逆な操作については
既に譲られている。にもかかわらず、**厳密に可逆な剛体変換**についてだけ原則が維持されている。
この非対称は、B案を検討する正当な理由になる。この矛盾を作者の前に置いておく。

（なお plate clip 自体は「完成meshを平行移動して最低Zを0にする」方式を**避けるため**に
選ばれた設計であり、その判断そのものは記録されている。ここで指摘しているのは
その判断の是非ではなく、原則の適用範囲が一貫していないという点だけである。）

### 3.4 推奨（**Proposed** — 実装しない。採否は作者が決める）

**A を維持し、STL単体で解釈できない事実をprovenanceへ書き足す。正規化はOptimizer `orient` に任せる。**

理由（一行）: **Z-up / plate=0への正規化は、変換来歴とSHA-256付きで既にOptimizer側に実装・テスト済みであり、Katachiで作り直すのは「入力を変えず別ファイルへ変換し来歴を残す」という既存の分業をそのまま複製することになるため。**

補足すると:

1. B案が解決する問題（スライサーへそのまま渡せない）は、Optimizer `orient` を1回通せば
   解決し、しかも**回転・平行移動・入出力ハッシュが来歴に残る**。Katachi側で正規化すると、
   その来歴は残らないか、Katachiが同等のものを新規に書く必要がある
2. A案の実際の欠陥は「向きが違うこと」ではなく「**STLとprovenanceを見ても絶対プレート座標が分からないこと**」である。これは変換ではなく**記録の欠落**であり、数値を3つ足せば閉じる
3. C案は、作者が「毎回Optimizerを通すのが負担だ」と実測で言った時点で正しくなる。
   今その実需は観測されていない（AGENTS.md §1「道具は研究の堆積物」）

**Proposed — Aを閉じるために足す数値（provenanceへ、3項目）**

| 項目 | 内容 | なぜ必要か |
|---|---|---|
| `savedFrame.upAxis` | `"x" \| "y" \| "z"` と符号 | `envelope.buildAxis` から導けるが、保存フレームの話として明示する |
| `savedFrame.platePlaneMm` | 保存STL自身の座標での**プレート面の絶対mm座標**（既定 `−81`） | 現在どこにも数値として書かれていない唯一の欠落 |
| `savedFrame.toPrintReady` | `buildAxis → +Z` の回転と、その後の平行移動（`plate → 0`）。適用**していない**ことを明記 | 読み手が自分で正規化できる。Optimizer `orient` の `direction_to_positive_z` / `translation_mm` と同じ語彙 |

これはprovenance（既に存在する形式）への**追記のみ**で、STL・recipe・場・生成ロジックに一切触れない。
小さく戻せる。**ただし本ラウンドでは実装していない。**

**Proposed（もう1点、別件だが同じ場所）** — `encodeBinaryStl` のヘッダが常に
`Yohaku Cloud Sculpt <name>` になる件。害はないが、interior-growth や skin のSTLが
"Cloud Sculpt" と名乗るのは記録として不正確である。Study名を渡せるようにするのは
1引数の変更で済む。

---

## 4. この契約を他Studyへ広げるとき（Proposed）

今日は §0 のとおり狭い。広げるなら順番がある。

1. **S-skin** — STL・provenance・SHA-256は既にある。足りないのはbuild軸とプレートの概念だけ。
   ただしS-skinのA/B分割は「手が通るか」を問う研究であって造形向きの研究ではないので、
   build軸を持たせる実需があるかどうかから確認する（**Author decision**）
2. **cloud-sculpt / foam / pack / rings** — `targetLongestMm` しかない。
   provenanceもSHA-256もない。ここへ封筒を先回りして入れない。
   「この形をプリンタに乗せたい」と作者が言ったStudyから順に足す
3. **sag / gravity / mpm** — メッシュを書き出さないので対象外

**Inferred** — 「全Studyに共通の座標契約を今作る」のは、指示書 §2.3
「先に巨大基盤を作らない」に反する。実際に造形の封筒を必要としたStudyは
9つのうち1つであり、2つめ（S-skin）ですら必要としていない。

---

## 5. Author decision キュー

1. **export案 A / B / C のどれを採るか。** 本文書の推奨はA + provenance追記（§3.4）だが、
   §3.3の非対称（不可逆なclipは許し、可逆な回転は許さない）を踏まえてBを選ぶ判断も成り立つ
2. **§3.4の3項目をprovenanceへ足すか。** 足すStudyはinterior-growthのみか、S-skinにも入れるか
3. **プリンタ軸とfield軸の同一視（§1.4）を明文化するか、写像を入れるか。**
   非立方体のcustom presetを使う予定があるかで答えが変わる
4. **binary STLヘッダのStudy名（§3.4末尾）を直すか**
5. **S-skinにbuild軸の概念を入れる実需があるか**（§4-1）

---

## 6. この文書が主張していないこと

- どの案を採っても「印刷可能」「サポート不要」「安全」を意味しない
- 「Z-up / plate=0にすればスライサーが正しく処理する」とは言っていない。
  一般的な前提としてそう扱われる、というだけである
- Katachiの保存ゲートが通ることは、実機での定着・成功を意味しない
- 実物の印刷・破壊・人が触れる試験は人間のみが行う（Katachi AGENTS.md §6）
