# Katachi Capability Map（2026-07-25）

対象: `/Users/atsushisato/Projects/active/Katachi`（9 Study）
本書の範囲: 指示書 §3「成果物A — Capability Map」のみ。
依存/重複の分類、Katachi⇔Optimizer の責任境界、座標・export 契約、再編計画は
それぞれ**別文書**が担当する。本書は事実の地図であり、移動・統合・共通化の提案はしない。

---

## 0. 読み方

### 0.1 ラベル（指示書 §2.4）

- **Observed** — コード・import・export・manifest・README・テスト実行結果から確認した事実
- **Inferred** — 複数の Observed から導いた解釈
- **Proposed** — 将来の整理案（**本書には置かない**。別文書へ）
- **Author decision** — 作者が選ぶ必要がある事項（本書では指摘のみ）

本書は**ほぼ全体が Observed** である。Inferred の箇所は明示的に `Inferred:` と書く。

### 0.2 記号（§3.2 の定義）

| 記号 | 意味 |
|---|---|
| `L` | 現在 `src/lib` 等の共有実装を利用している |
| `S` | Study 固有の実装（そのディレクトリ内で定義） |
| `D` | 他 Study の実装へ直接依存（依存先を併記） |
| `—` | 未実装 |
| `?` | **未検証**（本書で断定できなかったセル。§4 に理由を列挙） |

一つのセルに複数記号が並ぶ場合は、実際に両方が同時に成り立っている
（例: `D+S` = 他 Study の関数を import しつつ、その上に Study 固有の実装を重ねている）。

**「似ている」では記入していない。** すべて実 import 文と実 export 定義を照合した結果である。

### 0.3 Study 略号（横断表の列）

| 略号 | Study | 略号 | Study | 略号 | Study |
|---|---|---|---|---|---|
| CS | cloud-sculpt | MP | mpm | PK | pack |
| GR | gravity | FM | foam | SK | skin |
| SG | sag | RG | rings | IG | interior-growth |

### 0.4 安全に関する断り（AGENTS §6）

本書に現れる `save gate`・`support`・`overhang`・`build volume`・`coverage` 等はすべて
**Katachi 生成場の内部からの推定値と、その推定に対する拒否条件**である。
本書はいかなる形状についても「サポート不要」「印刷可能」とは述べない。
実物の印刷・破壊・荷重の判断は人間のみが行う。

---

## 1. 各 Study は何を調べているか（指示書 §2.1、一文ずつ）

Observed（各 README `## Question` の要約。作者の言葉の言い換えであり、置き換えではない）。

| Study | このStudyは、どの原理から、どんなかたちが生まれるかを調べている |
|---|---|
| **cloud-sculpt** | 球の smooth-min 合成場という原理から、いつ「雲」に見え始め、いつただの塊に堕ちるかたちが生まれるかを調べている。 |
| **gravity** | 「質量の流れ ÷ 断面積」という粗い力の素描という原理から、こねる手応えの向き（細くすれば赤い）と一致する苦しさの色の分布が生まれるかを調べている。 |
| **sag** | 柔らかさ一本のつまみで駆動する反復緩和（固体＝接続の記憶／液体＝近傍の押し引き）という原理から、休んでいる正本と力の下のかたちの差が生まれるかを調べている。 |
| **mpm** | 弾性論・流体力学という本物の構成則を時間積分する MPM という原理から、作者と実装者が入れていない振る舞い（しわ・座屈・とぐろ）が立ち上がるかを調べている。 |
| **foam** | 各点で最近傍の球を選ぶセル分解と Plateau 境界という原理から、体積のある殻から中身のない糸まで一本のつまみで連続に渡るかたちが生まれるかを調べている。 |
| **rings** | 球の鎖でできた「輪」という単位を階層として足す原理から、絡み合いという位相を持ったかたちが生まれるかを調べている。 |
| **pack** | ホストの内部へ虚を貪欲にパッキングして smooth 減算するという原理から、殻に穴が空き膜と柱を経て骨組みだけが残るかたちが生まれるかを調べている。 |
| **skin** | ホスト表面へ不定形の閉パッチを貪欲にパッキングし、実と虚を反転させる原理から、バラバラの部品（プレートが実）と窓の空いた殻（形態が実）の両方のかたちが生まれるかを調べている。 |
| **interior-growth** | host 内部の 3D 生成場に沿って coin/ring unit を build plate 側から連続支持で育てるという原理から、内部サポート危険域の少ないかたちが生まれるかを調べている（「サポート不要」は問うていない、と README が明記）。 |

---

## 2. Study ごとの Capability（指示書 §3.1）

9 列の表は読めないため、Study ごとに 1 ブロックとする。すべて Observed。
行数・ファイル名は実ファイル、依存は実 import 文による。

---

### 2.1 cloud-sculpt（S1）

| 項目 | 内容 |
|---|---|
| Study名 / 表示名 | `cloud-sculpt` / 雲をこねる (Cloud Sculpt)。manifest v0.2.0（updatedAt 2026-07-17、revisits 10）。HTML entry は `index.html`（**launcher ではなくこの Study 本体**） |
| Question | 球の集まりはいつ雲に見え始め、いつただの塊に堕ちるか。「場をこねる」操作は手に馴染むか |
| 形状生成原理 | 球の SDF を smooth-min（`smoothMin`）で合成した連続場 |
| 入力 | synthetic field のみ（`growBalls(params)` = seed 由来の乱数で球を生成）。外部ファイル入力なし |
| 中心表現 | SDF（`Ball[]` + blend k） |
| 作者の主操作 | こねる（つまみで場を再生成）、選ぶ／掴んで動かす／半径変更／追加／削除 |
| recipe/history | **正本**。`history.ts` が `Op` 7種（grow / setParam / addBall / removeBall / moveBall / setBallRadius / clear）を記録。`Recipe = RecipeEnvelope<"cloud-sculpt", HistoryEntry>` で **`src/lib/recipe.ts` の共有封筒を利用（L）**、記録シェルも `src/lib/history.ts`（L）。export / import / replay すべてあり |
| renderer | 全画面 raymarch quad（`THREE.ShaderMaterial` + 自前 GLSL `shaders.ts`、`MAX_BALLS = 256`）+ OrbitControls |
| picking | あり。`picking.ts` の `raymarchField`（**この関数が gravity / sag / rings の picking の実体でもある**）。座標変換は `src/lib/input.ts`（L） |
| Worker | なし（メッシュ生成はメインスレッド） |
| mesh export | あり。`meshExport.ts`（879行）= marching tetrahedra 基盤。**本リポジトリの mesh 機能の事実上の供給元**。`buildCloudMesh` / `buildMeshFromField` / `buildMeshesFromSharedField` / `computeSamplingBounds` / `polygonizeTet` / `inspectWatertight` / `inspectSavedStlTopology` / `rescaleMeshResult` / `orientMeshForSavedStl` / `computeConnectedComponentsWithKey` / `encodeObj` / `encodeBinaryStl` / `downloadMeshBundle` を export |
| fabrication設定 | 「最長辺 mm」入力のみ（`scaleMmPerUnit` を決める）。printer preset / layer height / build volume / 角度 いずれもなし |
| diagnostics | `inspectWatertight`（Float64、丸め前）の結果を `meshSummary` として表示 |
| save gate | **なし**。`ui.setMeshStatus(meshSummary(result), result.watertight.ok)` は状態表示のみで、書き出しは拒否されない |
| provenance | なし |
| tests | なし（`package.json` の test script 対象外） |
| 現在の未解決 | README Next: 球数 64 超えでのユニフォーム配列→テクスチャ化、ドラッグ移動の奥行き制御が無い、marching tetrahedra と 256ケース marching cubes の比較未実施 |
| 他Studyとの関係 | manifest `related: []`、README Related も S2/S3 の予定と MorphogenesisLab のみ。**実際には 8 Study すべてがこの Study を import している**（§5 の不一致1） |

---

### 2.2 gravity（S2）

| 項目 | 内容 |
|---|---|
| Study名 / 表示名 | `gravity` / 重力を入れる (Gravity)。v0.1.0（2026-07-17、revisits 6）。entry `gravity.html` |
| Question | 粗い力の素描（質量の流れ ÷ 断面積）でも、こねたときの手応えの向きは合うか |
| 形状生成原理 | cloud-sculpt と同じ smooth-min 場。形は変えず、**苦しさ（strain）を色として重ねる** |
| 入力 | synthetic field（`growBalls`、cloud-sculpt から import） |
| 中心表現 | SDF + ball ごとのスカラー strain |
| 作者の主操作 | こねる、選ぶ／動かす、`snapToGround`（接地させる） |
| recipe/history | 自前正本。`studyId: "gravity"` の封筒を `history.ts` 内で自前構築（**`src/lib/recipe.ts` は未使用**）。Op は cloud-sculpt の 7種 + `snapToGround` |
| renderer | 全画面 raymarch quad（自前 `shaders.ts` 157行）+ OrbitControls |
| picking | `raymarchField` を **cloud-sculpt/picking.ts から直接 import**（`main.ts` 113・171行）。座標変換は `src/lib/input.ts`（L） |
| Worker | なし |
| mesh export | **なし**（`meshExport.ts` が存在しない） |
| fabrication設定 | なし |
| diagnostics | `physics.ts` の `computeStrain`（`ballVolume` / `overlapArea` / `GROUND_TOUCH_EPS` / `STRAIN_REFERENCE = 6.0`）。青=楽↔赤=限界の共通スケール |
| save gate | なし（書き出す mesh が無い） |
| provenance | なし |
| tests | なし |
| 現在の未解決 | README Next: `STRAIN_REFERENCE` と色閾値が S3（印刷して壊す）待ちの未較正、ハブ球のトポロジー不連続性、色パレットの Library 昇格提案が保留中（**Author decision**） |
| 他Studyとの関係 | manifest `related: ["cloud-sculpt"]`＝実 import と一致。**逆向きの edge が未記録**: sag が `gravity/physics.ts` の `ballVolume` / `overlapArea` / `computeStrain` を import している（§5 の不一致1） |

---

### 2.3 sag（S2b）

| 項目 | 内容 |
|---|---|
| Study名 / 表示名 | `sag` / たわむ (Sag)。v0.2.0（2026-07-17、revisits 7）。entry `sag.html` |
| Question | 柔らかさのつまみ一本で雲は自重にどう応えるか。休んでいる正本と力の下の形の差を形の差として見られるか。（T2c）柔らかさ1は本物の液体の端になれるか。たわんだ一瞬を凍らせて正本に焼き付ける操作は自然か |
| 形状生成原理 | cloud-sculpt の場に対する**反復緩和ソルバー**（`deform.ts` 436行）。固体側＝元の距離を記憶したバネ網、液体側＝現在フレームの近傍だけによる押し引き、その間をクロスフェード |
| 入力 | synthetic field（`growBalls`） |
| 中心表現 | SDF（正本の rest balls）+ 導出物としての deformed balls |
| 作者の主操作 | こねる、柔らかさを動かす、選ぶ／動かす、**`freeze`（導出物を正本へ昇格させる、本リポジトリ唯一の操作種）** |
| recipe/history | 自前正本。`studyId: "sag"` を自前構築。Op = cloud-sculpt 7種 + `freeze`。**たわみ位置は履歴に持たない**（rest balls + softness の純関数として再計算される）ことで replay 決定性を担保 |
| renderer | raymarch quad **2枚 2 scene**（本体 + ゴースト = 休んでいる形の重ね表示）+ OrbitControls |
| picking | `raymarchField`（cloud-sculpt/picking.ts から import）。**たわんだ座標**に対して raymarch する（`main.ts` 152・211行） |
| Worker | なし |
| mesh export | **なし**。README Next が「凍った池の STL/3MF 化は次の課題」と明記 |
| fabrication設定 | なし |
| diagnostics | `computeStrain`（gravity/physics.ts から import）による苦しさの色 |
| save gate | なし |
| provenance | なし |
| tests | なし |
| 現在の未解決 | README Next: `K_BASE`/`GRAVITY`/`LIQUID_*` 定数群が未較正、飛沫（孤立水滴）をバグと見るか萌芽と見るか（**Author decision**）、ゴースト既定 ON と色が作者確認待ち、ドラッグが「たわんだ位置を掴んで正本へ書く」対応でよいか未確認、メッシュ書き出し未着手 |
| 他Studyとの関係 | manifest `related: ["cloud-sculpt", "gravity"]`＝実 import と一致（**9 Study 中、cloud-sculpt 以外の Study のロジックを import している 3 例のうちの 1 つ**） |

---

### 2.4 mpm（S2c）

| 項目 | 内容 |
|---|---|
| Study名 / 表示名 | `mpm` / 本物を混ぜる (MPM)。v0.3.0（2026-07-17、revisits 10）。entry `mpm.html` |
| Question | 本物の理論（弾性論・流体力学）を形態形成の原理に持ち込むと、入れていない振る舞いが原理の側から立ち上がるか。S2b に構造的に出せない時間積分された挙動が見えるか |
| 形状生成原理 | Material Point Method（`sim.ts` 301行の CPU 実装 + `gpu/gpuSim.ts` 419行の WebGPU 実装）。粒子 ⇄ 格子の転送を時間積分 |
| 入力 | 3系統: (1) synthetic field（`growBalls`）、(2) **cloud-sculpt recipe JSON**（`parseS1Recipe` + `replayS1` を import）、(3) **binary STL ファイル**（`stlImport.ts`） |
| 中心表現 | particle（`particle.ts`）+ 背景格子。**SDF は使わない**（`seeding.ts` は各球内の rejection sampling で粒子を撒く） |
| 作者の主操作 | 種を撒く、材料パラメータ（ヤング率・ポアソン比・体積弾性率・粘性・密度）を動かす、`run`（N substeps 実行）、**`freeze`（粒子→球へ戻して正本化）** |
| recipe/history | 自前正本。`studyId: "mpm"` を自前構築。Op = seed / seedMesh / setParam / run / freeze / clear。`freeze` は**結果の `Ball[]` を args に明示的に持つ**（GPU の float 加算順が固定でないため、replay で物理を再実行しない設計。history.ts 冒頭に理由を長文で記録）。**cloud-sculpt 形式の recipe を書き出す経路もある**（`studyId: "cloud-sculpt"` として `mpm-frozen-s1-recipe-*.json`） |
| renderer | `THREE.Points`（頂点色付き粒子雲）+ `MeshStandardMaterial` の地面 + OrbitControls。**raymarch ではない** |
| picking | **なし**（`pointerdown` / Raycaster / `ndcFromPointer` いずれも無し） |
| Worker | なし（並列化は Web Worker ではなく **WebGPU compute**。`gpu/capabilities.ts` が `navigator.gpu` の有無を判定し CPU へフォールバック） |
| mesh export | **なし**（書き出すのは recipe JSON のみ）。`stlImport.ts` は**読む側**であり、書く側は cloud-sculpt の `encodeBinaryStl`（README Related がこの対を明記） |
| fabrication設定 | なし（STL の取り込みはあるが、printer / scale / layer の設定は持たない） |
| diagnostics | バックエンド表示（CPU / WebGPU と、WebGPU が使えない理由の文字列）、粒子数、substep 時間 |
| save gate | STL 取り込み側にのみガード: 内部に粒子を置けなかった場合「非水密メッシュ、または内外判定の失敗の疑い」と告げて拒否する。書き出し側の gate は無し |
| provenance | なし |
| tests | なし |
| 現在の未解決 | README Next: 自動実行時の描画と WebGPU 計算の競合の根本原因が未特定（**作者の実機での再検証が必須**）、CPU 側 100k/300k 粒子ベンチ未実施、固定小数点 atomics スケール `1e6` のオーバーフロー未検証、gridN=128 未計測 |
| 他Studyとの関係 | manifest `related: ["cloud-sculpt", "sag"]`。**実 import は cloud-sculpt のみ**。sag は README が「対照群」と述べている概念上の関係で、コード依存は無い（§5 の不一致2）。`src/lib/geometry/pointInMesh.ts` の `rayTriangleIntersectX` を利用（L）— この共有ファイルは skin の分割検証が同じ判定を必要としたことで抽出された、と `stlImport.ts` 冒頭が記録 |

---

### 2.5 foam（S-foam）

| 項目 | 内容 |
|---|---|
| Study名 / 表示名 | `foam` / 泡のセル (Foam Cells)。v0.1.0（2026-07-17、revisits 6）。entry `foam.html` |
| Question | 同じ雲をセルに分解して見るとどうなるか。穴を第一級の造形要素にしたとき、体積のある殻から中身のない糸（Plateau 境界）まで一本のつまみで連続に渡れるか。渡れないならどこで千切れるか |
| 形状生成原理 | `cell.ts`（175行）— 各点で最近傍の球を選ぶセル分解と Plateau 境界。`ballSdf` / `fieldSdf` / `smoothMin` を cloud-sculpt から import して構成 |
| 入力 | synthetic field（`growBalls`）+ **cloud-sculpt recipe の読み込み**（`loadFromS1Recipe` が `replayS1` で再生し、結果を自分の `loadBalls` エントリ 1 件として記録し直す） |
| 中心表現 | SDF（セル場） |
| 作者の主操作 | こねる、開口（opening）と厚み（thickness）のつまみ |
| recipe/history | 自前正本。`studyId: "foam"` を自前構築。**「別レンズを自己完結した履歴で持ち、S1 recipe は読み込み専用で輸入する」という設計パターンの初出**（rings / pack / skin がこれを踏襲したと各 README が記録） |
| renderer | 全画面 raymarch quad（自前 GLSL `shaders.ts` 167行。`cell.ts` の TS 実装と lockstep を保つ必要がある、と冒頭が明記）+ OrbitControls |
| picking | **なし**（T7 タスク文書の「やらないこと」として明示的に落とした、と `ui.ts` 冒頭が記録） |
| Worker | なし |
| mesh export | あり。`meshExport.ts`（72行）は薄いラッパで、`buildMeshFromField` / `computeSamplingBounds` / `encodeBinaryStl` / `encodeObj` / `meshSummary` をすべて cloud-sculpt から import（`meshSummary` は re-export） |
| fabrication設定 | 「最長辺 mm」のみ |
| diagnostics | watertight 実測（README に完了条件4として記録）、`meshSummary` |
| save gate | なし |
| provenance | なし |
| tests | なし |
| 現在の未解決 | README Next: 明示的な Voronoi/Delaunay 隣接グラフへの置き換え（現状は「各点で独立に最近傍3球」規則）、レイマーチが細い糸を実際より疎らに見せる問題、セル個別編集、物理（S2/S2b/S2c）との統合未着手 |
| 他Studyとの関係 | manifest `related: ["cloud-sculpt"]`＝実 import と一致。**逆向き未記録**: rings / pack / skin の README がいずれも foam を設計パターンの出典として挙げているが、コード依存は無い |

---

### 2.6 rings（S-rings / T8）

| 項目 | 内容 |
|---|---|
| Study名 / 表示名 | `rings` / 輪の手 (Ring Hand)。v0.1.0（2026-07-17、revisits 7）。entry `rings.html` |
| Question | 球の上に「単位」という階層を足すと何が変わるか。輪はつまみで不揃いに生めるか。輪を掴み動かし絡ませる手は成立するか。いま何のトポロジーができているかを道具が正直に言えるか |
| 形状生成原理 | `ring.ts`（149行）— 球の鎖（`generateRingBalls`）としての輪。ふわつき（`wobbleR` / `wobblePos`）を seed 由来乱数で与える。**この Study の `generateRingBalls` / `rotatePoint` / `rotateVector` / `vCross` は pack・skin・interior-growth が import している** |
| 入力 | synthetic（輪のレシピ `RingRecipe`。`DEFAULT_RING_RECIPE`） |
| 中心表現 | SDF（球の鎖）+ **単位（`RingGroup`）というグラフ的階層** |
| 作者の主操作 | 輪を置く / 掴む / 動かす / 回す（ワールド軸まわり15度刻み）/ 複製 / 削除、絡ませる |
| recipe/history | 自前正本。`studyId: "rings"` を自前構築。Op に単位レイヤ（addRing / moveRing / rotateRing / duplicateRing / removeRing）を追加。**cloud-sculpt 形式への書き出し側**（`meshExport.ts` の `downloadS1Recipe` が `serializeS1Recipe` を import して使う）— foam の「読む側」とは逆方向 |
| renderer | 全画面 raymarch quad + OrbitControls。**`shaders.ts` が cloud-sculpt/shaders.ts から `MAX_BALLS` を import**（本リポジトリ唯一の GLSL 層のクロス Study 依存） |
| picking | `raymarchField`（cloud-sculpt/picking.ts から import、`main.ts` 175・277行） |
| Worker | なし |
| mesh export | あり。`meshExport.ts`（89行）は薄いラッパ。`buildCloudMesh` / `encodeBinaryStl` / `encodeObj` / `meshSummary`（`s1MeshSummary` として）を cloud-sculpt から import |
| fabrication設定 | 「最長辺 mm」のみ |
| diagnostics | `linking.ts`（150行）— **Gauss linking number**（`gaussLinkingNumber`）、全ペア絡み表（`allPairLinking`）、深い重なりの警告（`findDeepOverlaps`）。`ringCenterline` が輪を閉曲線に変換する |
| save gate | なし |
| provenance | なし |
| tests | なし |
| 現在の未解決 | README Next: 回転が「カメラの up 軸まわり」の簡易実装（仮決め）、絡み数の融合警告しきい値 0.55 が未較正のヒューリスティック、輪以外の単位、複数輪の自動配置、重力・たわみとの統合は対象外 |
| 他Studyとの関係 | manifest `related: ["cloud-sculpt", "foam"]`。**実 import は cloud-sculpt のみ**（foam は設計パターンの参照）。**逆向き未記録**: pack・skin・interior-growth が `rings/ring.ts` を、skin が `rings/linking.ts` を import している（§5 の不一致1・3） |

---

### 2.7 pack（S-pack / T9〜T15、v0.4）

| 項目 | 内容 |
|---|---|
| Study名 / 表示名 | `pack` / 虚を詰める (Void Packing)。v0.4.0（2026-07-17、revisits 9）。entry `pack.html` |
| Question | ホスト内部へ虚を貪欲にパッキングして smooth 減算すると、殻に穴が空き→膜と柱→骨組みだけが残る遷移が、遷移用のつまみを引かずにパッキングの帰結として現れるか。詰め方の偶然がムラを生むか。隙間 g は印刷可能性の計器として正直に機能するか |
| 形状生成原理 | `field.ts`（1030行）— host 場 − void 場の smooth 減算（Inigo Quilez の `opSmoothSubtraction`）。**二段の smooth-min**（unit 内は `localK`、unit 間は `roundK`）。`PackMode` で **carve（地）と fill（図）を反転**できる。詰める単位は sphere / cloud / 平リング / 立体リング、配置は greedy / grid |
| 入力 | synthetic field + **cloud-sculpt recipe を 2 通りに読む**（ホストとして／「単位の原型」として登録） |
| 中心表現 | SDF（合成場）+ `PackUnit`（球群 + 外接球）というグラフ的単位 |
| 作者の主操作 | ホストをこねる、詰める（`packUnits`）、単位を手で足す／消す、隙間 g・試行数を動かす、地と図を反転する |
| recipe/history | 自前正本。`studyId: "pack"` を自前構築。**`packUnits` は結果（各単位の球リストと境界）を args に明示的に持つ**（replay が greedy RNG walk を再実行しない設計）。cloud-sculpt recipe は読み込み専用 |
| renderer | 3 表示モード `raymarch` / `beads`（uncapped `InstancedMesh`）/ `mesh`（実三角形オーバーレイ）+ OrbitControls。**skin の T12 実装をほぼそのまま port した**と README v0.2 が明記（変数名を void/host 語彙に置換した箇所が大半） |
| picking | `picking.ts`（135行）に `raymarchComposite` / `raymarchHost` を自前実装、内部で cloud-sculpt の `ballSdf` / `fieldSdf` を import。座標変換は `src/lib/input.ts`（L） |
| Worker | なし（メッシュ生成はメインスレッド） |
| mesh export | あり。`meshExport.ts`（199行）が `buildMeshFromField` / `computeSamplingBounds` / `encodeBinaryStl` / `encodeObj` / `meshSummary` を cloud-sculpt から import し、合成場と連結成分数を足す（`countConnectedComponents` は pack 内で自前定義） |
| fabrication設定 | 「最長辺 mm」のみ（`main.ts` 398-399行で `mmPerUnit` を導出） |
| diagnostics | 計器 2 つ: **最薄の肉（外接球ベース推定）** と **充填率**。`meshSummary` に「部品数 N」を付す |
| save gate | **なし**（部品数は表示のみで書き出しを拒否しない） |
| provenance | なし |
| tests | なし |
| 現在の未解決 | README Next: 外接球 clearance が粗く細長い原型で密度を上げられない、骨組みだけ（外殻消失）の追い込み未達、最薄の肉が「保守的な推定であって保証ではない」、充填率の二重計上、**carve モードの連結成分数は「密閉された内部空洞の壁」を数えているだけで印刷部品数とは限らないのに `meshSummary` の文言が carve/fill で同一**、手動追加が合成場 raymarch 非対応 |
| 他Studyとの関係 | manifest `related: ["cloud-sculpt", "foam", "rings", "skin"]`。**実 import は cloud-sculpt と rings の 2 つのみ**。foam は設計パターン、skin は**コードを port した（＝コピーであって import ではない）**関係（§5 の不一致3） |

---

### 2.8 skin（S-skin / T10〜T14、v0.13）

| 項目 | 内容 |
|---|---|
| Study名 / 表示名 | `skin` / 表面に詰める (Surface Patch Packing) / リングの皮。v0.13.0（2026-07-20、revisits 21 — 9 Study 中最多）。entry `skin.html` |
| Question | ホスト表面を不定形の閉パッチで詰めたとき、プレートが実（バラバラの部品）と形態が実（窓の空いた殻）の両方が出るか。パッキングをやり直さずにワンタッチで往復できるか。目地 g は両モードで正直に機能するか。（v0.2）リングを敷き詰めるとリングによって総体形状ができるか |
| 形状生成原理 | `field.ts`（1007行）— host 場から殻を切り出し（`shellSdf(p) = abs(hostSdf(p)) - thickness/2`）、表面上のアンカー + 接線平面の副点を再射影して smooth-min したパッチを、`opSmoothIntersection`（プレート版）または `opSmoothSubtraction`（窓版）で合成。パッチ形状は coin / 平リング / 立体リング（`generateRingBalls` を rings から import）。v0.13 で `coinBulge`（コインのふくらみ）を追加 |
| 入力 | synthetic field + **cloud-sculpt recipe**（ホストとして）+ **skin 自身の recipe**（実運用では「実 CoinSRF（141 coins）」を読み込んでいる、と README が繰り返し記録） |
| 中心表現 | SDF（合成場）+ `Patch`（アンカー + 副点）+ **A/B 分割のためのパッチ隣接グラフ** |
| 作者の主操作 | ホストをこねる、詰める（`packPatches`）、モードを反転する（`setMode`）、パッチを手で足す／消す、**seed を選んで A/B に分ける → 確定する（`confirmPartition`）** |
| recipe/history | 自前正本。`studyId: "skin"`、`formatVersion: 1` を自前構築。`packPatches` は結果を args に持つ。`setMode` を独立 op にして反転自体を履歴に残す |
| renderer | 3 表示モード `raymarch` / `beads` / `mesh`（`renderer.ts` 551行）+ 二色 A/B プレビュー + OrbitControls |
| picking | `picking.ts`（234行）に `raymarchComposite` / `raymarchHost` を自前実装、内部で cloud-sculpt の `fieldSdf` を import。座標変換は `src/lib/input.ts`（L） |
| Worker | **あり**。`partition.worker.ts`（43行）+ `partitionWorkerProtocol.ts`（33行、型のみを両側で共有する独立ファイル）。`buildPartitionMeshes` をメインスレッドから外す目的（T13 監査修正 P0-2） |
| Worker: cancel/stale | **あり**。`requestId` 単調増加 + 世代（generation）番号。`msg.requestId !== requestId` の返信は破棄。draft 変更・patch 無効化のたびに `activePartitionWorker.terminate()` を呼ぶ（`main.ts` 788・882・950行）。「**すべての exit path が Worker を terminate する**（前回はエラー/stale 経路でしか terminate していなかった）」と gate-correction P1-2 のコメントが記録 |
| mesh export | あり。`meshExport.ts`（147行）+ `partition.ts`（684行）。cloud-sculpt から `buildMeshFromField` / `buildMeshesFromSharedField` / `computeConnectedComponentsWithKey` / `computeSignedMeshVolume` / `inspectSavedStlTopology` / `orientMeshForSavedStl` / `rescaleMeshResult` / `encodeBinaryStl` / `encodeObj` を import。書き出しは通常 4 ファイル（original / part-A / part-B STL + provenance JSON） |
| fabrication設定 | 「最長辺 mm」（`targetLongestMm`）から `scaleMmPerUnit` を導出し、**original / A / B が同一倍率であることを gate で検証**（`gate.commonScale`）。printer preset / build volume / layer height / 角度は**持たない** |
| diagnostics | 計器 4 つ: 目地（unit と mm 併記）、表面被覆率（粗い推定、`estimateCoverage`）、連結成分数（パッチ隣接の推定・プレート版）、絡んだペア数/隣接ペア数 と 連結成分数（絡みで繋がった群、`linking.ts` が rings の `gaussLinkingNumber` を import）。加えて A/B 分割の体積差・境界面積・field 整合性・mesh 忠実度（Wilson score interval の 95% 上側信頼限界） |
| save gate | **あり（本リポジトリで最も厳しい gate の一つ）**。`evaluatePartitionGate` が single source of truth（UI も provenance も同じオブジェクトを読む）。拒否する条件: 元形状の体積が 0 または非有限 / original・A・B の scale 不一致 / **保存後 Float32 STL が watertight でない**（original・A・B それぞれ）/ A または B が 2 部品以上に分かれている / 保存後トポロジー無効による指標使用不可 / 元形状内部サンプル 0 / 重複・隙間・不整合の 95% 上側限界が許容超過 / 体積差が許容超過。`verification=true` で**明示的にバイパスできる**（その旨が provenance の limitations に書き込まれる） |
| provenance | **あり**（`<base>-partition-provenance.json`）。主なフィールド: `generatedAt` / `tool{name,version,updatedAt}` / `mode` / `resolution` / `targetLongestMm` / `scaleMmPerUnit` / `scaleAssumption`（「実機較正値ではない」と明記）/ `shapeParameters{thickness,roundK,coinBulge}` / `gate` / **`inputRecipe{filename, sha256}`** / **`outputStl{original,partA,partB の filename と sha256}`** / original・partA・partB の体積・符号付き体積・面数・連結成分数・mm bbox・`savedTopology` / `limitations`（9〜10項目の限界の明文） |
| tests | **あり（102件）**。`partition.test.ts` 41件（marching tet の `polygonizeTet`/`tetGradient`/`orientTriangle`、`inspectSavedStlTopology`、`rescaleMeshResult`、`buildInsideTester`）、`partitionTutorial.test.ts` 50件、`coinBulge.test.ts` 11件。`npm run test:partition` で実行、`npm run typecheck:partition-test`（`tsconfig.test.json`）で型検査。**実測: 41 + 50 + 11 = 102 passed** |
| 現在の未解決 | README v0.13「未確認事項」: **実スライサーでの検証は一切行っていない**（「サポートが不要になる」という作者の仮説自体は未検証）、Optimizer 診断比較は作者が候補を選ぶまで未実施、resolution 48 プレビューと実出力（96相当）の異同未確認、coin 間の谷が印刷時に問題になるか未確認。README Next: プレート版の連結成分数のライブ計器と実測の乖離（ライブ44 vs メッシュ22）、窓モードで殻が割れる境界条件の掃引、測地距離近似の誤差、パッチ形状の多様化 |
| 他Studyとの関係 | manifest `related: ["cloud-sculpt", "foam", "rings", "pack"]`。**実 import は cloud-sculpt と rings の 2 つのみ**（foam・pack は設計パターン／port 元）。`src/lib/geometry/pointInMesh.ts` の `buildInsideTester` を利用（L）— この共有ファイルは mpm の STL 取り込みと同じ判定を必要としたことで抽出され、**単体テスト作成中にバグが発見・修正された**と README v0.6 が記録（§5 の不一致3） |

---

### 2.9 interior-growth（S-interior-growth、v0.5）

| 項目 | 内容 |
|---|---|
| Study名 / 表示名 | `interior-growth` / 内部から育つネットワーク（manifest title に「S2.1 audit-fix — 構造修正済み・coverage最低合格は依然未達」と現状が書かれている）。v0.5.0（2026-07-25、revisits 9）。entry `interior-growth.html`。**全ファイルが未追跡（uncommitted）** |
| Question | 生成の向きを変えるだけで（host 内部に Kumo 的な場を置き coin/ring の連続体を下から育てる）内部サポート危険域は減らせるか。field-only / coin-constrained / ring-constrained の 3 候補を同じ host・同じ seed で並べた差は数字と体積として読めるか。**「サポート不要」「印刷可能」は問わない**と README が明記 |
| 形状生成原理 | `growth.ts`（2794行、本リポジトリ最大のソース）— host 内部の生成場に沿った greedy な unit 成長 + `colonization.ts`（500行）の coverage 誘導コロニゼーション。採用条件に **build plate または親 unit への連続支持** を課す。`smoothMin` を cloud-sculpt から、`generateRingBalls`/`rotateVector`/`vCross` を rings から import |
| 入力 | synthetic host fixture 3種（`box` / `sphere` / `waisted`、`hostSdf` を `field.ts` に自前定義）+ 自身の recipe JSON（**旧 Phase-1A 形式からの migration 付き**） |
| 中心表現 | graph（unit のネットワーク: root / edge / 親子支持関係）+ そこから導出する SDF と mesh |
| 作者の主操作 | printer / build axis / layer height / support 角度 / 目標被覆率 / 生成つまみ（lift・drift・cohesion・branching・voidBias 等 20 パラメータ）を決めて **候補を生成する**（3 variant を一度に）、候補を見て選ぶ |
| recipe/history | 自前正本だが **`src/lib/recipe.ts` の共有封筒を利用（L）**: `Recipe = RecipeEnvelope<"interior-growth", HistoryEntry>`、記録シェルは `src/lib/history.ts`（L）。Op = setHost / setEnvelope / setParams / setPrinterPreset / setCustomBuildVolume / generateCandidates / clear。`generateCandidates` は結果を args に持つ。**migration**: `migrateEnvelope` / `migrateStoredResult` が旧形式を構造的に検出して変換し、`legacyMigrated` フラグを provenance へ伝播（入力ファイルは書き換えない） |
| renderer | **bead / instanced mesh 表示（raymarch GLSL ではない）**。`unitsMesh` / `rejectedMesh`（不採用 unit）/ `edgeLines`（支持グラフ）/ `voidExteriorMesh` の 4 レイヤ + OrbitControls。理由が冒頭に記録: 3 候補を同期表示すると raymarch shader が uniform 予算の 3 倍を要し、skin が既に上限に当たっていた |
| picking | **なし**（`pointerdown` / Raycaster / `ndcFromPointer` いずれも無し） |
| Worker | **あり**。`growth.worker.ts`（69行）+ `growthWorkerProtocol.ts`（66行、型のみ共有。skin の先例を踏襲したと明記）。`growNetwork` + `buildCandidateMesh` を Worker で実行 |
| Worker: cancel/stale | **あり**。stale: `requestId` を全返信が持ち帰り、古い run の返信を破棄。cancel: **`worker.terminate()`**（フラグの polling ではない — 生成が 1 本の長い同期処理で Worker のメッセージループが塞がるため、と protocol 冒頭が理由を記録）。progress は候補 index（1/3、2/3）と stage（growth / mesh / gate）を分けて報告し、`elapsedMs` は Worker がその request を受け取ってからの経過時間 |
| mesh export | あり。`meshExport.ts`（505行）が `buildMeshFromField` / `computeMeshVolume` / `encodeBinaryStl` / `inspectSavedStlTopology` / `orientMeshForSavedStl` / `rescaleMeshResult` / `meshSummary` を cloud-sculpt から import。**保存 mesh を build plate 平面で切る**（`buildCandidateMesh`）。書き出しは候補ごとに STL + provenance JSON + recipe JSON |
| fabrication設定 | **9 Study 中で唯一、造形準備の設定を一式持つ**: printer preset（`PRINTER_PRESETS` = Bambu Lab A1 256³ / A1 mini 180³ / Custom 200³。前2つは `source: "official"`、Custom は `source: "author"` と出典を区別）、custom build volume、build axis、layer height (mm)、support 閾値角度、`derivedMaxLateralAdvancePerLayerMm`、`fitHostToBuildVolume`（`STUDY_MARGIN_FRACTION = 0.1`）、`plateBoundaryEpsilonMm(layerHeightMm) = min(layer height/4, 0.05mm)`、`canonicalScaleMmPerUnit` |
| diagnostics | 被覆率（`coverage.ts` 397行、採用 unit ごとにサンプリングした `coverageCurve` を残す）、rejected 合計と**理由別内訳**（`coverage-unreachable` / `support-angle-blocked` / `root-not-on-plate` / `unsupported-span-exceeded` / `ring-discontinuous-support`）、root 数 / edge 数 / host 占有率 / **closed void 数**（`growth.ts` の flood fill）、`actualPlateContactCount` / `launchPointCount`（P2 で意味を分離）、`heightCoverage` / `topReached` |
| save gate | **あり**。`evaluateSaveGate` が拒否する条件: メッシュが空 / 非有限座標 / 境界が閉じていない（open edge・non-manifold edge）/ 面方向が不整合 / 退化三角形あり（**Float32 保存時**）/ **connected component が 1 でない**（monolithic 候補が実際に一体でなかった監査指摘への対応）/ 保存 mesh の mm bbox が **raw build volume** を超える / 保存 mesh の最低 build 軸座標が build plate より `plateBoundaryEpsilonMm` を超えて下にある。**失敗条件は 0/pass に丸めず全件 `reasons` に列挙する**（AGENTS §6「正直な計算」を明示引用） |
| provenance | **あり**（`CandidateProvenance`、本リポジトリで最も広い）。`toolVersion` / `generatedAt` / `sourceFixture` / `printer{preset,buildVolume,source}` / `hostBboxMm` / `canonicalScaleMmPerUnit` / `resolution` / `params` / `envelope` / **`angleConvention`（"0deg=parallel-to-plate, 90deg=vertical-wall (Katachi local approximation, not asserted to match any specific slicer)" — 特定スライサーとの一致を主張しないと文字列自体に書いてある）** / `variant` / `effectiveKind` / `primaryPathUnitIds` / `heightCoverage` / `topReached` / `coverageReference` / `metrics` / `coverageCurve` / `scoreWeights` / `topology` / `savedLowestBuildAxisMm` / `savedPlateBoundaryEpsilonMm` / `savedPlateContactVertexCount` / `legacyMigrated` / `limits[]`。STL の **SHA-256** を `sha256Hex` で計算して添付 |
| tests | **あり（106件）**。`growth.test.ts`（1885行）を `npm run test:interior-growth` で実行。**実測 106 passed**。対象は成長規則・不変条件（「`growNetwork` は渡された envelope/params を変更しない」等）・coverage・保存ゲート・migration |
| 現在の未解決 | README「未解決（正直な記録）」と Next: **ring-constrained が box/waisted で保存後 mesh 多 component（box 10 / sphere 3 / waisted 5）**（save gate は正しく拒否している。材質 union は連結、resolution でも空間 index でもないところまで切り分け済み）、**blend が host 壁の外へ膨らむ**（plate は切ったが側面のはみ出しは未処理）、**`STUDY_MARGIN_FRACTION`（10%）が unit 半径と独立**（`unitRadius=0.18` で box 実測 184.2mm、build volume 超過で gate が拒否）、**recipe 読み込み時の mesh 再構築のみ今もメインスレッド**、実スライサーでのサポート生成量・実 CoinSRF/実 STL host は対象外 |
| 他Studyとの関係 | manifest `related: ["cloud-sculpt", "rings", "pack", "skin"]`。**実 import は cloud-sculpt と rings の 2 つのみ**（pack は greedy growth の設計 precedent、skin は保存後 topology gate / canonical scale / `rescaleMeshResult` の gate-correction パターンの出典として README が挙げるが、コード依存は無い）。README Related は Optimizer 側の 2 文書も参照している（§5 の不一致3） |

---

## 3. 横断 Capability × Study（指示書 §3.2）

すべて Observed。記号は §0.2。列は §0.3 の略号。
「似ている」ではなく **import 文と関数定義の照合** で記入した。

### 3.1 本表

| Capability | CS | GR | SG | MP | FM | RG | PK | SK | IG |
|---|---|---|---|---|---|---|---|---|---|
| deterministic RNG (`hashSeed`/`makeRng`) | S | D‡ | D‡ | D | D‡ | D | D | D | D |
| SDF primitives / composition（TS 側） | S | D† | D† | — | D+S | D† | D+S | D+S | D+S |
| SDF（GLSL 側、raymarch shader） | S | S | S | — | S | S＋D* | S | S | — |
| field sampling（格子上の場の評価） | S | — | — | — | D | D | D | D | D+S |
| history recording | **L** | S | S | S | S | S | S | S | **L** |
| recipe serialization | **L** | S | S | S | S | S | S | S | **L** |
| recipe migration | — | — | — | — | — | — | — | — | S |
| version display (`createVersionRow`) | **L** | **L** | **L** | **L** | **L** | **L** | **L** | **L** | **L** |
| slider (`createSlider`) | **L** | **L** | **L** | **L** | **L** | **L** | **L** | **L** | **L** |
| pointer→NDC / viewport hit (`lib/input`) | **L** | **L** | **L** | — | — | **L** | **L** | **L** | — |
| frame loop (`startFrameLoop`) | **L** | **L** | **L** | **L** | **L** | **L** | **L** | **L** | **L** |
| Three.js camera / OrbitControls | S | S | S | S | S | S | S | S | S |
| picking | S | D | D | — | — | D | S+D | S+D | — |
| Worker protocol | — | — | — | — | — | — | — | S | S |
| progress / cancel / stale result | — | — | — | — | — | — | — | S | S |
| STL import | — | — | — | S+**L** | — | — | — | — | — |
| mesh generation (marching tetrahedra) | S | — | — | — | D | D | D | D | D |
| STL/OBJ encoding | S | — | — | — | D | D | D | D | D |
| watertight inspection（Float64、丸め前） | S | — | — | — | D | D | D | D | — |
| Float32 saved-topology inspection | S§ | — | — | — | — | — | — | D | D |
| connected component count | S | — | — | — | — | — | S | D | D |
| component gate（部品数で保存を拒否） | — | — | — | — | — | — | — | S | S |
| build-volume fit | — | — | — | — | — | — | — | — | S |
| build-axis handling | — | — | — | — | — | — | — | — | S |
| build-plate clipping | — | — | — | — | — | — | — | — | S |
| scale / orientation（mm 倍率・保存向き） | S§ | — | — | — | S | S | S | S+D | S+D |
| partition（A/B 分割） | — | — | — | — | — | — | — | S | — |
| SHA-256 | — | — | — | — | — | — | — | S | S |
| provenance | — | — | — | — | — | — | — | S | S |
| coverage | — | — | — | — | — | — | — | S¶ | S¶ |
| void / exterior flood fill | — | — | — | — | — | — | — | — | S |
| support / overhang approximation | — | — | — | — | — | — | — | — | S |
| save gate（何らかの保存拒否条件） | — | — | — | — | — | — | — | S | S |
| tests | — | — | — | — | — | — | — | S(102) | S(106) |

### 3.2 表の注

- **†** GR / SG / RG は `ballSdf` / `fieldSdf` を直接 import していない。TS 側の SDF 評価はすべて
  cloud-sculpt の `raymarchField` の内部で起きている（＝picking 経由の間接依存）。
  型 `Ball` と `growBalls` は直接 import している。
- **‡** GR / SG / FM は `cloud-sculpt/random.ts` を直接 import していない。乱数は
  `growBalls`（cloud-sculpt/field.ts）の内部で消費される。したがって `D` だが**間接**。
  直接 import しているのは MP / RG / PK / SK / IG の 5 Study。
- **\*** rings の GLSL は自前だが、`rings/shaders.ts` が `cloud-sculpt/shaders.ts` から
  `MAX_BALLS` を import している（**本リポジトリ唯一の GLSL 層クロス Study 依存**）。
- **§** `inspectSavedStlTopology` と `orientMeshForSavedStl` / `rescaleMeshResult` は
  cloud-sculpt/meshExport.ts が**定義しているが、cloud-sculpt 自身の UI からは呼ばれていない**
  （`main.ts` が使うのは `buildCloudMesh` / `downloadMeshBundle` / `meshSummary` のみ）。
  実際の利用者は skin（partition.ts）と interior-growth（meshExport.ts）だけである。
  Inferred: これらは cloud-sculpt の機能としてではなく、後発 Study のために
  cloud-sculpt/meshExport.ts へ置かれた共有関数として振る舞っている。
- **¶** skin と interior-growth の `coverage` は**名前が同じで意味が違う**。
  skin の `estimateCoverage`（field.ts 739行付近）は殻表面サンプルのうちパッチに覆われた割合。
  interior-growth の `coverage.ts` は host 表面のうち生成 unit が到達・被覆した割合で、
  build 制約（到達可能性）と結び付いている。**共通実装ではなく、独立した 2 実装である。**
- **scale / orientation** 行の `S`（CS/FM/RG/PK/SK）はいずれも UI の「最長辺 mm」入力から
  `scaleMmPerUnit` を導く同じ形の処理で、5 Study それぞれの ui.ts / main.ts に個別に書かれている。
  IG だけは printer の build volume からの fit（`fitHostToBuildVolume`）で倍率を決める別原理。
- **Worker** を持つのは skin と interior-growth の 2 Study のみ。両者ともプロトコル型を
  独立ファイル（`*WorkerProtocol.ts`）に置き、`requestId` による stale 破棄と
  `terminate()` による cancel という**同じ設計**を採っているが、**コードの共有は無い**
  （interior-growth 側のコメントが「skin/partitionWorkerProtocol.ts と同じ先例」と明記）。

### 3.3 `src/lib` の現況（Observed）

共有実装は 7 ファイル・合計 284 行しかない。

| ファイル | 行数 | export | 利用 Study 数 |
|---|---|---|---|
| `src/lib/history.ts` | 12 | `recordHistoryEntry` | 2（CS, IG） |
| `src/lib/recipe.ts` | 32 | `RecipeEnvelope`, `serializeRecipeEnvelope`, `parseRecipeEntries` | 2（CS, IG） |
| `src/lib/input.ts` | 14 | `ndcFromPointer`, `eventTargetsViewport` | 6（CS, GR, SG, RG, PK, SK） |
| `src/lib/loop.ts` | 14 | `startFrameLoop` | 9（全 Study） |
| `src/lib/ui/slider.ts` | 54 | `createSlider` | 9（全 Study） |
| `src/lib/ui/version.ts` | 6 | `createVersionRow` | 9（全 Study） |
| `src/lib/geometry/pointInMesh.ts` | 152 | `rayTriangleIntersectX`, `buildInsideTester` | 2（MP, SK） |

Observed: root `README.md` は三層構造の Library の場所を `src/library/` と書いているが、
**`src/library/` は存在しない**（`ls` で No such file or directory）。実体は `src/lib/`。
この不一致の扱いは**別文書**（再編計画）の担当。

---

## 4. 未検証セル・断定を避けた箇所

本書で `?` を置いたセルは無い。ただし次は「読んだ範囲では確認できた」以上の強さでは主張しない。

1. **GR/SG/FM の deterministic RNG**（`‡`）— `growBalls` の内部で乱数が消費されることは
   `cloud-sculpt/field.ts` の `growBalls` が `./random.ts` を import していることから確定だが、
   3 Study の側に「乱数を使っている」という直接の証拠（import 文）は無い。`D` は間接依存の意味で置いた。
2. **GR/SG/RG の TS 側 SDF**（`†`）— `raymarchField` の内部実装（`ballSdf`/`fieldSdf` を使う）は
   `cloud-sculpt/picking.ts` の import 文から確定。3 Study 自身のコードには SDF 評価が無い。
3. **各 Study の GLSL が TS 実装と一致しているか**は本書では検証していない。
   foam/pack/skin の各ファイル冒頭が「TS と GLSL は lockstep を保つ必要がある」と自ら注記している
   のみを記録した。二重定義の分類は**別文書**の担当。
4. **mpm の diagnostics の網羅性** — バックエンド表示・粒子数・substep 時間は確認したが、
   `ui.ts` 433行を全読していないため、他の計器が無いとは断定しない。
5. **cloud-sculpt / foam / rings / pack の save gate が「無い」** ことは、
   書き出し経路（`downloadMeshBundle` / `downloadBlob`）の前に拒否分岐が見当たらないことに基づく。
   `main.ts` を全読して確認したのは cloud-sculpt のみで、他 3 Study は
   `meshExport.ts` の書き出し関数に条件分岐が無いことによる判断である。
6. **テスト件数の内訳の割り当て**（partition 41 / partitionTutorial 50 / coinBulge 11）は、
   `package.json` の実行順と実行ログの出力順の対応、および `tetGradient` を import しているのが
   `partition.test.ts` であることから確定した。合計 102 は skin README v0.13 の記述とも一致する。

---

## 5. README / manifest の `Related` と実 import の不一致（Observed）

**すべて「不正確」ではなく「粒度が違う」種類の不一致である。**
README の `Related` は AGENTS §4 が定める「他 Study への参照」であり、
コード依存に限定されていない。ここでは両者を分けて記録する。

### 不一致1 — 逆向き（in-edge）が記録されていない

`Related` は「自分が参照しているもの」だけを持ち、「自分が参照されているもの」を持たない。

| Study | manifest `related` | 実際にこの Study を import している Study |
|---|---|---|
| cloud-sculpt | `[]` | **8 Study すべて**（foam, gravity, sag, mpm, rings, pack, skin, interior-growth） |
| rings | `["cloud-sculpt","foam"]` | **3 Study**（pack, skin, interior-growth） |
| gravity | `["cloud-sculpt"]` | **1 Study**（sag が `physics.ts` を import） |
| sag / mpm / foam / pack / skin / interior-growth | — | **0**（どの Study からも import されていない） |

注（この列の数え方）: 右列は **他 Study からの in-edge 数**であり、定義元の Study 自身は数えていない。
したがって「その module を使っている Study の総数 = この数 + 1」である。
例: `gravity` の **1 Study** は cross-Study importer が 1（sag）という意味で、
`gravity/physics.ts` の利用 Study 総数は 2（gravity 自身 + sag）である。

Inferred: cloud-sculpt の `related: []` は Study 開始時（2026-07-03、当時 1 Study）のまま更新されておらず、
現在は「この Study を変更すると 8 Study に波及する」という最も重要な事実が
manifest 上のどこにも現れていない。

### 不一致2 — 概念上の関係がコード依存として書かれている

| Study | `related` に載っているがコード依存が無い相手 | README が述べている実際の関係 |
|---|---|---|
| mpm | `sag` | 「対照群。同じ主題を静的緩和ソルバーの素描として解いている」（README Related）。import は 0 |
| rings | `foam` | 「自己完結した独自履歴を持ちつつ S1 recipe を読み込める設計パターンを踏襲（rings は逆方向、S1 へ書き出す側）」。import は 0 |
| pack | `foam` | 同じ設計パターンの踏襲。import は 0 |
| skin | `foam` | 同じ設計パターンの踏襲。import は 0 |
| interior-growth | `pack` | 「void/host 合成 field、greedy growth の設計 precedent」。import は 0 |

### 不一致3 — 「共有」と書かれている関係の実体が**コピー**である

これは最も注意して読む必要がある行である。

| Study | 相手 | README の記述 | 実体 |
|---|---|---|---|
| pack | skin | v0.2 が「skin で確立した改善一式（乱数の続き・飽和の処方箋・InstancedMesh ビーズ全量表示・全体メッシュオーバーレイ）を pack へ**移植**した」「変数名・関数名を pack の語彙に置き換えただけの箇所が大半」と明記 | **import は 0**。`pack/renderer.ts` `pack/main.ts` `pack/ui.ts` に同型のコードが独立して存在する |
| skin | pack | 「詰める機構（貪欲パッキング・結果を引数に持つ op・計器・レイマーチの設計）を最大限**踏襲**した」 | **import は 0**。`skin/field.ts` 冒頭が「pack/field.ts から import せずローカルに書き出した（Study を自己完結させるため、foam に対して pack が採ったのと同じ選択）」と理由まで記録している |
| interior-growth | skin | 「保存後 topology ゲート・canonical scale・`rescaleMeshResult` の gate-correction パターン」 | `rescaleMeshResult` 等は**両者とも cloud-sculpt から import**（共通の親経由で一致）。gate ロジック自体（`evaluateSaveGate` vs `evaluatePartitionGate`）は独立実装 |

Observed（重要）: `pack/meshExport.ts` `skin/meshExport.ts` `foam/meshExport.ts` の各冒頭に
「同じパターン」「同じ先例」という自己申告のコメントが残っており、
**コピーであることは隠されていない**。どれを重複と見なし何を昇格候補とするかの分類は
**別文書**（依存/重複マップ、再編計画）の担当であり、本書は判断しない。

### 実際に確認できたクロス Study edge（値 import。型だけの import も含む）

```
cloud-sculpt/field.ts        ← foam, gravity, sag, mpm, rings, pack, skin, interior-growth (8)
cloud-sculpt/random.ts       ← mpm, rings, pack, skin, interior-growth (5)
cloud-sculpt/meshExport.ts   ← foam, rings, pack, skin, interior-growth (5)
cloud-sculpt/history.ts      ← foam, mpm, rings, pack, skin (5)
cloud-sculpt/picking.ts      ← gravity, sag, rings (3)
cloud-sculpt/shaders.ts      ← rings (1)   ← GLSL 層で唯一
rings/ring.ts                ← pack, skin, interior-growth (3)
rings/linking.ts             ← skin (1)
gravity/physics.ts           ← sag (1)
```

凡例: `A ← X, Y (n)` の `n` は **この module を import している他 Study の数**であり、
定義元の Study 自身は含まない。よって利用 Study 総数は `n + 1` である。
例: `gravity/physics.ts ← sag (1)` は cross-Study importer が 1、
利用 Study 総数は 2（gravity 自身 + sag）を意味する。
この数をどう分類に使うかは本書の担当ではない（→ Dependency / Duplication Map）。

Inferred: 依存の受け手（他 Study から import される側）は cloud-sculpt / rings / gravity の 3 Study だけで、
残り 6 Study は葉（誰からも import されない）である。

---

## 6. 本書が意図的に扱わないこと

- 重複の分類と共通化候補の判定 → **別文書**（Dependency / Duplication Map）
- Katachi と Optimizer の責任境界 → **別文書**（Responsibility Boundary）
- 内部座標・build axis・保存 STL・スライサー座標の契約 → **別文書**（Coordinate / Export Contract）
- `src/library/` の新設を含む再編・段階移行 → **別文書**（Reorganization Plan）
- production code / config / README / manifest の変更（本書は docs-only。何も変更していない）

---

作成: 2026-07-25 / 根拠: `src/` 実ファイル、全 import 文の照合、9 Study の README・manifest、
`vite.config.ts`、`package.json`、`npm run test:partition`（102 passed）、
`npm run test:interior-growth`（106 passed）。
リポジトリに約 43 の未コミット・未追跡パス（`src/studies/interior-growth/` 全体を含む）があるため、
`git diff` ではなく実ファイルを正本として読んだ。
