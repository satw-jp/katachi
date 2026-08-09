# Katachi — 実装タスク指示書

モデル非依存の指示書置き場。実装モデルは着手前に必ず
STATEMENT → RESEARCH → AGENTS → 対象タスク の順で読む。

## 共通規約（全タスクに適用）

1. **仕様を発明しない**。指示書に無い判断が必要になったら、作業を止めずに済む範囲で仮決めし、
   「仮決めリスト」として完了報告に含める。大きな分岐は質問リストにして人間へ
2. **完了条件をすべて満たすまで完了と言わない**。満たせない場合は何が・なぜ残ったかを報告
3. 完了時に対象 Study の README（Question/Setup/Observation/Next）と manifest を書く（AGENTS §3）
4. 技術選定は自由、ただし AGENTS §5（依存最小・場が第一級・履歴の save/load・共通色スケール）を守り、
   選定理由を README に一行残す
5. 実物（印刷・破壊）に関わる工程は手順書だけ作り、実行は人間に渡す（AGENTS §6）

## タスク地図（第0段 = 雲。RESEARCH §5 に対応）

| タスク | Study | 状態 | 概要 |
|---|---|---|---|
| [T1](T1-cloud-sculpt.md) | S1 雲をこねる | **指示書あり・着手可** | メタボール雲の SDF、こねる＋つまみ、操作履歴の save/load |
| T2 | S2 重力を入れる | [指示書あり](T2-gravity.md) | T1 の雲に自重の場を重ねる。まず正直な近似（各点の上に載る質量の累積、接地への力の道の細さ）で「苦しさ」を共通色スケールで表示。近似であることを画面に明記。本物の解析（ボクセル FEM 等）への置換は後続タスク |
| T2b | S2b たわむ | [指示書あり](T2b-sag.md) | 材料の場の第一パラメータ（柔らかさ）。バネの素描で自重のたわみを釣り合いまで解き、休み形（正本）とたわみ形（導出物）の差を二枚の姿で見せる |
| T2c | S2b v0.2 液体と凍結 | [指示書あり](T2c-liquid-freeze.md) | Y5 相の造形の第一歩。柔らかさ1=ベタッと池になる液体（接続の記憶を持たない緩和＋凝集の素描）、新 op freeze=たわみ形を正本に焼き付け固体へ。T2d(風=気体の端) と T3(固体として出力) の前提 |
| T2d | S2c 本物を混ぜる (MPM) | [指示書あり](T2d-mpm.md) | Y6 発注。MLS-MPM で弾性固体↔液体を本物の構成則で。生成の物理は本物へ（計器は粗いまま = 役割分離）。freeze は結果を引数に持つ（GPU 非決定性と正本再現の両立）。対象機材 = M4 MBA / RTX3080 の Chrome |
| T2e | S2c v0.2 GPUで回す | [指示書あり](T2e-webgpu.md) | WebGPU compute へ移植（物理は不変・CPU は検算基準として残す・バックエンド常時表示）。固定小数点 atomics の P2G、描画は転送コストを実測して選ぶ。作者機 M4/3080 で「こねる速度」を狙う |
| T2f | S2c v0.3 外の形を招く | [指示書あり](T2f-import-stl.md) | Blender/過去作の STL を MPM 粒子として取り込む（内側をボクセル充填）。球化は既存の freeze に任せる最小負荷設計。RESEARCH §3「入口=既存メッシュの輸入」の回収 |
| T3 第一便 | 固体として出力 | [指示書あり](T3-mesh-export.md) | S1 にマーチングキューブス→STL/OBJ の門を架ける。実寸(mm)が第一級・レシピ JSON と対で保存・水密検査つき。相の造形の一周（流す→凍らせる→固体データ）が閉じる |
| T3 第二便 | S3 印刷して壊す | 概略のみ | 人間が A1 で印刷・破壊。予測（T2 の色）と実測（どこから壊れたか）の突き合わせ記録テンプレートを作る。以後全 Study の校正の型になる |
| T7 | S-foam 泡のセル | [指示書あり](T7-foam-cells.md) | Y7 発注(穴の造形①②)。球の雲をセル分解し、開口つまみ一本で 体積→穴あき殻→糸 を掃引。糸=Plateau境界。既存 Study は変更しない(追加のみ)。③絡まりは次便(軌跡の凍結) |
| T8 | S-rings 輪の手 | [指示書あり](T8-ring-hand.md) | Y7補正発注。球の上に「単位」の階層: 球の鎖の輪（ふわつき付き）、単位のドラッグ/回転/複製、絡み数（Gauss linking number）の常時表示=位相の計器。S1レシピ還流で STL/MPM/foam に接続 |
| T9 | S-pack 虚を詰める | [指示書あり](T9-void-packing.md) | Y7第二補正発注（作者の普段の作り方）。実体の内部に虚の球を貪欲パッキング→smooth減算→残渣が骨組み。殻→膜と柱→骨組みは密度の創発。隙間=骨の最小太さの計器つき。正本の語彙を初めて拡張（実+虚） |
| T10 | S-skin 表面に詰める | [指示書あり](T10-surface-packing.md)・**T9 完了待ちで着手**（共有ファイル衝突防止） | Y7 表面版発注。表面に不定形の閉パッチを目地つき貪欲パッキング。**地と図の反転**: プレートが実（形態は暗示・バラバラの部品）⇄ 形態が実（殻に窓）をワンタッチ往復 |
| T11 | S-skin v0.2 リングの皮 | [指示書あり](T11-ring-skin.md) | 作者発注「リングによって総体の形状ができるのが見たい」。パッチ形状にコイン/平リング(O字窓)/立体リング(S-rings 語彙の輸入)。重なり許容で絡みが偶発 → 絡んだペア数・連結成分数の計器 = 布になったかが数字で見える。T8×T10 の合流 |
| T12 | S-skin v0.3 生きた表示 | [指示書あり](T12-skin-live-view.md) | 作者報告2件: 平/立体リングの選択が青くならない(owner端数畳み込みの比較バグ疑い)＋レイマーチ容量の代わりに InstancedMesh ビーズ近似で全量をインタラクティブ表示(容量超過で自動切替) |
| T13 | S-pack v0.2 反転と改善 | [指示書あり](T13-pack-invert.md) | 作者発注。地と図の反転を体積へ: 虚に実を詰める(ホスト=型枠・詰めた実の集積が作品)。skin で確立した改善一式を移植(乱数の続き・飽和処方箋・ビーズ全量表示・メッシュオーバーレイ) |
| T14 | S-pack v0.3 雲を詰める | [指示書あり](T14-cloud-units.md) | 作者発注「球体じゃなくて雲自体を入れ込む」= Y7第二補正の原文「ランダムな形態をパッキング」への回帰。単位=球の小群(シード派生で単位ごとに違う形)、S1レシピを詰め材にも(自作の雲で自作を築く)。両モード対応 |
| T15 | S-pack v0.4 グリッドとばらし | [指示書あり](T15-grid-lattice.md) | 作者発注: 表層の語彙(コイン/リング)を内部へ＋配置モード「グリッド」新設。**ばらし一本(0=完全格子〜1=ランダム)がグリッドと有機の橋** = H1「揺らぎ×拘束」の UI 化。秩序から始めて揺らぎを注ぐ |
| T16 | 全体（整理） | [**一部実装済み・R0再監査へ継続**](T16-consolidation.md)（下記「T16 の現在地」） | 2026-07-17 監査発。8 Study に分岐したコピー（input/loop/ui/style/recipe/meshExport）を「最も進化した実装」を正として一本化。挙動・見た目・recipe 後方互換は不変。他タスクと同時進行しない |
| T17 | 全体（Web公開） | [実装済み](T17-web-publishing.md) | 2026-07-17。satw.jp に Studies 索引を新設し、Katachi / Kumo を Cloudflare Workers（静的アセット）として公開。「変更 → deploy → 公開URL確認」を両プロジェクトの作業終了条件へ追加。Stream / Works / Study 本体は不触 |
| T18 | 全体（意匠） | [指示書あり](T18-design-alignment.md) | 2026-07-17 作者発注。Katachi / Kumo の UI chrome を satw.jp の実測トークン（紙白・墨・ヘアライン・Helvetica Neue）へ統一。計器の色・3Dの地は不変（地は作者裁定済み: そのまま）。Katachi 側は T16-3（style共通化）完了が前提 |
| T19 | 羊に原理を作用させる | [第一便実装](T19-hitsuji-principles.md) | 2026-07-28 作者発注。作者自身の hitsuji を共通入力に、加工前／差分成長／相分離／流れに沿う羊毛化を同じ尺度で比較する。第一便は方向選別の素描 |
| T20 | 軌跡を塊にする | [第十一次実装](T20-trajectory-fusion.md) | 2026-07-29 作者発注。細く柔らかい紐を長さ無制限として追加し、形状充填を最優先する |
| T4 | S4 細くする | 未起草 | 接地半径の掃引（脚径掃引の Yohaku 版）。並べて比較する Explorer 型 UI |
| T5 | S5 触るまでの時間 | 未起草 | 実物を人に見せる観察実験の型（記録シートのみ、ソフト不要かもしれない） |
| T6 | S6 育てる手 | 未起草 | 応力の高い所に肉を足す成長規則。三つ目の手 |

T2〜T2e は実装済み（〜2026-07-10。MPM は WebGPU で作者機 RTX3080 動作確認済み）。T3 第一便は起草済み（2026-07-10、作者発注:「これを3Dデータ化するには」）。風（T2f 候補）は MPM の外力として後日。
順序は入れ替え可。ただし T3（現実との校正）を長く先送りしないこと — 画面だけの余白は嘘に育つ。

## T16 の現在地（2026-07-26 実測）

状態: **一部実装済み・R0再監査へ継続**。

T16 は「指示書だけがある未着手タスク」でもなければ「全面完了」でもない。
以下は 2026-07-26 に実ファイルの import と各 Study の manifest `revisits` から
確認できた範囲だけを書く。推測で埋めた行は無い。

- **入力・ループ・UI 部品・base style は複数 Study で共有化済み**（T16-2 / T16-3）。
  `src/lib/loop.ts` と `src/lib/ui/version.ts` は 9 Study すべてが import し、
  `src/lib/ui/slider.ts` も 9 Study の `ui.ts` が使う。`src/lib/input.ts` は 6 Study
  （cloud-sculpt / gravity / pack / rings / sag / skin）。`src/styles/base.css` は
  9 Study の `style.css` が冒頭で `@import` している。
  manifest 側にも 8 Study 分の revisit（2026-07-17「T16 UI consolidation」
  「T16 style consolidation」「T16 input/loop consolidation」）が残る。
  interior-growth は T16 のあと（2026-07-24）に追加されたため該当 revisit を持たず、
  最初から共有側を使っている。

- **recipe envelope は一部 Study だけが `src/lib/recipe.ts` を利用**（T16-4）。
  共有封筒 `src/lib/recipe.ts` / `src/lib/history.ts` を通しているのは
  **9 Study 中 2 つ（cloud-sculpt と interior-growth）だけ**。
  残る 7 Study（gravity / sag / mpm / foam / rings / pack / skin）は
  `{ formatVersion: 1, studyId, exportedAt, entries }` という同じ封筒を
  各自の `history.ts` で組んでいる（foam のみ関数名が `serializeFoamRecipe`）。
  「T16 recipe/history consolidation」の revisit を持つのも cloud-sculpt 1 件のみ。
  なお cloud-sculpt の `src/lib/recipe.ts` import は複数行に分かれているため、
  1 行単位の grep では見落とす。

- **mesh export は場の抽出と保存形状の検査だけが共有され、Study 固有の生成は残る**（T16-5）。
  `buildMeshFromField` / `computeSamplingBounds` / `rescaleMeshResult` /
  `orientMeshForSavedStl` / `inspectSavedStlTopology` / `encodeBinaryStl` を
  foam・rings・pack・skin・interior-growth の 5 Study が import する一方、
  各 Study の `meshExport.ts`（セル / リング / 詰め物 / パッチ / 内部成長）は残っている
  — これは T16-5 が意図した「インターフェースだけ統一」の姿である。
  ただし共有先は `src/lib/meshExport.ts` ではない（次項）。

- **R0 で、共有ハブが依然 Study 配下（`src/studies/cloud-sculpt/`）に残ることを確認した**。
  上の mesh export も、自分以外の 8 Study が使う `Ball` / `smoothMin` / `fieldSdf`
  （`cloud-sculpt/field.ts`）も、置き場所は Study の中である。
  `src/lib/` にあるのは history / recipe / input / loop / ui / geometry の 7 ファイルで、
  T16-5 が想定した `src/lib/meshExport.ts` は存在しない。
  つまり cloud-sculpt が事実上の Library として振る舞っている。
  詳細は `docs/architecture/katachi-dependency-duplication-map-20260725.md` §1・§2。

### 実ファイルから成否を判定できなかった項目

T16-consolidation.md の次の項目は、今回の docs-only 調査では**未確認**である。
できていないとも、できているとも書かない。

- T16-3 の「各 Study で before/after のスクリーンショット比較を残す」— 比較画像は
  リポジトリ内に見当たらない。manifest に残るのは「見た目不変・ビルド後 CSS サイズ据え置き」
  という記述だけで、画像が別の場所に保管されたのかどうかは判定できない
- T16-4 の受け入れ基準「手元の既存 recipe ファイル（旧形式）の読み込みテストが全 Study で通る」—
  自動テストは 4 本（skin 3 本・interior-growth 1 本）のみで、全 Study の旧形式 recipe 読込を
  通す試験は存在しない。手作業で行われたかどうかは判定できない
- T16-1 の呼称置換 — `tsconfig.json` の `noEmit: true` と、リポジトリ直下に
  `vite.config.d.ts` が無いことは確認した。文書側の「Yohaku」残存はこの節では判定しない。
  ただし保存 STL / OBJ のヘッダ文字列は旧名のままである
  （`src/studies/cloud-sculpt/meshExport.ts`。バイト列と SHA-256 が変わる production 変更のため
  docs-only では直せない）

### R0（2026-07-25/26）との関係

`docs/architecture/` に置いた R0 の 5 文書は、**9 Study 時点での再監査**である。
T16 の監査は 2026-07-17 の 8 Study 時点で行われ、そのあとに interior-growth が加わった。

R 系列は T16 を置き換える別の大規模整理ではない。T16 のあとに残ったもの —
Study 配下に残る共有ハブ、制作設定（printer preset の Katachi / Optimizer 二重定義など）、
Optimizer との境界 — を扱う続編である。上の「一部実装済み」の範囲を前提に読むこと。

- [機能地図](../architecture/katachi-capability-map-20260725.md)
- [依存関係・重複マップ](../architecture/katachi-dependency-duplication-map-20260725.md)
- [Optimizer との境界](../architecture/katachi-optimizer-boundary-20260725.md)
- [座標・書き出し契約](../architecture/katachi-coordinate-export-contract-20260725.md)
- [段階整理計画](../architecture/katachi-reorganization-plan-20260725.md)

interior-growth への T 番号の発番は、作者判断を伴うためこの文書では行わない。
