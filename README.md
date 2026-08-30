# Katachi

旧名 Yohaku。2026-07-17 に Katachi へ改称した。

**楽をしているうえで、無理をしているように見える — そうであってもいい。**

かたちの「二つの余白」（実際の余白 = 力学の余裕／見かけの余白 = 身体が読む余裕）を主題に、
SDF・構造力学・材料を学びながら造形するための研究プラットフォーム兼、造形の道具。
MorphogenesisLab（`active/MorphogenesisLab`）の姉妹プロジェクト — 散歩という同じ地層から生えた二本目の幹。
道具そのものが作品であり、道具から作品が生まれる。

状態: **11 Study が存在する**。package version は 0.1.0。
各 Study は独立した manifest version を持つ（各 `src/studies/<name>/manifest.json` が正本）。

他プロジェクトから参照する現在地は
[Projects共通の Current Project State](../../docs/current-project-state.md) に集約する。
Git HEADだけで最新版を決めず、各Studyのmanifest・研究ノート・公開画面を合わせて確認する。

| Study id | 表示名 | version | updatedAt | status |
|---|---|---:|---|---|
| cloud-sculpt | 雲をこねる (Cloud Sculpt) | 0.2.0 | 2026-07-17 | active |
| gravity | 重力を入れる (Gravity) | 0.1.0 | 2026-07-17 | active |
| sag | たわむ (Sag) | 0.2.0 | 2026-07-17 | active |
| mpm | 本物を混ぜる (MPM) | 0.3.0 | 2026-07-17 | active |
| foam | 泡のセル (Foam Cells) | 0.1.0 | 2026-07-17 | active |
| rings | 輪の手 (Ring Hand) | 0.1.0 | 2026-07-17 | active |
| pack | 虚を詰める (Void Packing) | 0.4.0 | 2026-07-17 | active |
| skin | 表面に詰める (Surface Patch Packing) / SKIN REBUILD | 0.90.6 | 2026-08-30 | active |
| interior-growth | 内部から育つネットワーク (Interior Growth) | 0.5.0 | 2026-07-25 | active |
| hitsuji | 羊に原理を作用させる (Hitsuji Principles) | 0.11.0 | 2026-07-28 | active |
| tangle | 軌跡を塊にする (Trajectory Fusion) | 0.10.0 | 2026-07-29 | active |

package version と各 Study version は独立した別概念であり、**連動させない**ことが
R0 Author decision **Q8** として作者承認済み（2026-07-26）。両者の意味・正本・更新条件は
[katachi-version-contract-20260726.md](docs/architecture/katachi-version-contract-20260726.md) を正本とする。
ただし major/minor/patch を何で上げるかの基準は、この文書でも**未決**のままである。

> 注: interior-growth の manifest `title` には
> 「S2.1 audit-fix — 構造修正済み・coverage最低合格は依然未達」という但し書きが付いたままである。
> この但し書きは 2026-07-25 の後続作業より前の状態を指しており、現在の Study README の Observation と
> 一致しない。manifest 自体の修正は本タスクの範囲外のため、ここでは表示名のみを載せている。

## 文書の地図（読む順）

| 文書 | 役割 |
|---|---|
| [STATEMENT.md](STATEMENT.md) | 原点 — なぜ作るか（作者の言葉。検閲は随時） |
| [RESEARCH.md](RESEARCH.md) | 研究骨子 — 中心の問い・命題 Y0〜Y4・三つの問い×五つの解き方・第0段 Study・遠い地図 |
| [AGENTS.md](AGENTS.md) | 運用憲章 — 役割分担・作業の型・コード原則・安全（全 AI・人間はまずここ） |
| [docs/tasks/](docs/tasks/README.md) | 実装タスク指示書（T1〜。共通規約つき、モデル非依存） |
| [docs/architecture/](docs/architecture/) | 9 Study 時点の機能地図・依存・Optimizer との境界・座標契約・段階整理計画（R0、2026-07-25/26） |

`docs/architecture/` の6文書:

| 文書 | 役割 |
|---|---|
| [capability map](docs/architecture/katachi-capability-map-20260725.md) | 9 Study の機能地図と横断capability表 |
| [dependency / duplication map](docs/architecture/katachi-dependency-duplication-map-20260725.md) | 実importの依存グラフと重複分類 |
| [Katachi / Optimizer boundary](docs/architecture/katachi-optimizer-boundary-20260725.md) | 責任境界とファイル/データ契約 |
| [coordinate / export contract](docs/architecture/katachi-coordinate-export-contract-20260725.md) | 内部場・build軸・保存STL・スライサー座標の契約 |
| [reorganization plan](docs/architecture/katachi-reorganization-plan-20260725.md) | 段階移行案 R0.5〜R5 と作者判断キュー Q1〜Q9 |
| [version contract](docs/architecture/katachi-version-contract-20260726.md) | 同じ version という語で呼ばれている別概念の分離と更新条件 |

R0 は**整理実装ではなく、整理を始める前の地図**である。実装承認ではない。

## 三層構造

- **Study**（`src/studies/<name>/`）— **一つの生成原理を研究する自己完結単位**。
  試行錯誤の場所（コード＋研究ノート＋manifest＋記録）
- **Library**（`src/lib/`）— **複数の Study で実需が確認された、小さく安定した操作**
- **Instrument**（`src/instrument/`）— Library と Study の成果を束ねる**制作の入口**。
  現在あるのは Study 一覧（`/studies.html`）だけ — 詳細は
  [src/instrument/README.md](src/instrument/README.md)。
  **道具は研究の堆積物**であり、先回りして巨大化させない

> 決定（2026-07-26）: Library の正式な置き場所は **`src/lib/`** とする
> （R0 Author decision **Q1** — 作者承認済み）。9 Study が既に `src/lib` を参照しており、
> `src/library` へ改名しても得られるのは名前の一致だけで、制作の能力は増えないため。
> 判断の記録と初版の選択肢（A案 `src/lib` 採用 / B案 `src/library` へ段階移行）は
> [reorganization plan](docs/architecture/katachi-reorganization-plan-20260725.md) §5 Q1 に残している。
> 現在 `src/lib/` は7ファイル（history / recipe / input / loop / ui.slider / ui.version /
> geometry.pointInMesh）。`src/library/` は存在しない。

> 注（2026-07-26）: fan-out の大きい共有ハブは今も Study 配下に残っている — 特に
> `src/studies/cloud-sculpt/` の `field.ts`（自分以外の8 Study が利用）と
> `meshExport.ts`（5 Study が利用）。これらは**段階的な昇格候補**であって、
> **一括で `src/lib/` へ移すことはしない**。1件ずつ、実需とテストと実画面を確認しながら扱う。
> `src/styles/base.css`（9 Study の `style.css` が冒頭で `@import` する）は
> **既に安定共有済み**であり、昇格候補ではない。実測は
> [dependency / duplication map](docs/architecture/katachi-dependency-duplication-map-20260725.md) を参照。

## 起動・ビルド

```bash
npm install
npm run dev
```

開発サーバーは `http://localhost:5174` で起動する
（`vite.config.ts` が `strictPort` で5174に固定している。
root共通 `docs/launcher-spec.md` のポート台帳で Morpho(5173)・Yomu(5175) と衝突させないため）。

主な画面:

| URL | 中身 |
|---|---|
| `/` (`index.html`) | S1「雲をこねる」。**launcher ではなく Study 本体**（従来どおり変更なし） |
| `/studies.html` | **Study 一覧（launcher）** — 11の生成原理への入口。2026-07-26 追加 |
| `/gravity.html` ほか | 各 Study。URL は変えていない |

ビルド確認:

```bash
npm run build
```

## Web 公開

公開URL: https://katachi.a-8c3.workers.dev/

Cloudflare Workers への公開は手動で行う。`npm run deploy` でビルド後の `dist/` のみを配信する。
公開手順を固定して再現できるよう、Wrangler は devDependency としてプロジェクト内に置く。

現在の実装:

11 Study・12 Study ページ（hitsuji は比較と現象の2画面）。共通の土台は vite + three.js + 素の TypeScript で、
実行時の外部依存は three だけ。全 Study が操作履歴（レシピ）の JSON
export/import を持つ。

各 Study を一行の生成原理で示す（機能の羅列ではなく、何から何が生まれるかを見る）:

- `cloud-sculpt` — 場を球の smooth union としてこねる
- `gravity` — 雲へ重力由来の苦しさの近似を重ねる
- `sag` — 休み形からたわみ形を導く
- `mpm` — 粒子法で固体と液体の生成を扱う
- `foam` — 雲をセル壁・開口・糸へ変える
- `rings` — 球の輪を単位として置き、動かし、絡ませる
- `pack` — 虚または実の単位を内部へ詰める
- `skin` — 表面へ patch/coin/ring を詰め、分割する
- `interior-growth` — 造形制約を受けながら内部から表面へ育てる
- `hitsuji` — 作者自身の同じ羊へ三原理を作用させ、同一性の境界を比較する
- `tangle` — 選んだ立体の内側で、自己交差しない複数の軌跡を交差・融合させ、輪郭と線の履歴の共存を見る

各 Study の Question・Setup・Observation は `src/studies/<name>/README.md` が正本。
機能の詳細な地図は [docs/architecture/](docs/architecture/) を参照。

## 経緯

2026-07-03、作者と Fable 5 の3日間の対話で起草。過程のアーカイブ:
`~/Projects/docs/yohaku-statement-draft-20260703.md`／`yohaku-research-draft-20260703.md`
（本プロジェクト内の同名文書が**正**。docs/ 側は初出時の記録）。
Drive 側の関連調査: `~/Projects/docs/drive-survey-20260703.md`

## 最新Observation

- 2026-07-26: **Study 一覧（launcher）を `/studies.html` として追加した**（R5）。
  Instrument の最初の一枚で、9つの生成原理への入口だけを持つ。Study 本体は統合していない。
  root `/` は従来どおり cloud-sculpt で、既存9 Study の URL も nav-row も変更していない
  （nav の 66/72 は未着手のまま — 完全N×Nを契約にするか launcher を正本にするかが未決のため）。
  カタログ `src/lib/studies.ts` は id・表示名・status を各 manifest と自動照合し（15件）、
  version は複製していない。**10 entry のビルド成功**、9リンクをローカルで実座標クリック確認、
  mobile幅375pxで重なりなし、`npm run deploy` 後に公開URLでも9リンクの到達（全て HTTP 200）と
  root が cloud-sculpt のままであることを確認した。
  同日、`src/lib/hash.ts` への SHA-256 昇格（R2）と interior-growth の
  `savedFrame` provenance（R3）も公開へ含めた。
- 2026-07-26: **R1（文書の正本化）— 作者が Q1 を承認し、Library の正式な置き場所を `src/lib/` に決めた。**
  root README の「三層構造」を実体へ合わせ（Study = 一つの生成原理の自己完結単位 /
  Library = `src/lib/` の小さな安定操作 / Instrument = 制作の入口）、
  `src/library/` という未実在の記述と「Q1 未決定」注記を決定の記録へ置き換えた。
  併せて、`src/studies/cloud-sculpt/` に残る共有ハブは**段階的な昇格候補であり一括移動しない**ことを明記した。
  reorganization plan §5 Q1 は Author decision から決定済みへ更新し、初版の選択肢は決定履歴として残した。
  **production code は一行も変更していない**（docs-only）。
- 2026-07-26: **R0（整理前の地図）の5文書が揃った** — `docs/architecture/` に
  capability map / dependency・duplication map / Katachi⇔Optimizer boundary /
  coordinate・export contract / reorganization plan。production code を一行も変えずに、
  9 Study 時点の実体を実 import から測り直した。判明した主なもの:
  共有基盤は `src/lib/`（7ファイル）と `src/styles/base.css`（9 Study が `@import`）に
  既にある一方、fan-out の大きい**形状・mesh 基盤は `src/studies/cloud-sculpt/` に残って**おり、
  `field.ts` を自分以外の8 Study、`meshExport.ts` を5 Study が利用している。
  `src/library/` は存在しない。この整理に伴い root README と `docs/tasks/README.md` の
  現在状態を更新した（過去の Observation は原文のまま保持）。
  同日 `npm run build` を実行し、**9 entry の本番ビルドが成功**することを実測した。
  R0 は実装承認ではなく、Library の置き場所・保存座標・launcher は
  作者判断（Q1〜Q9）待ちである。
- 2026-07-19: 両端分割の約半分候補で、同色の孤立成分を端点側の連結成分へ自動修復するようにした。
  また通常書き出しは保存後トポロジー有効に加え、A/Bがそれぞれ連結成分1の場合だけ許可する。
  合成グラフを含むpartitionテスト41件、型検査、8ページの本番ビルドが通過。
  詳細は`src/studies/skin/README.md` Observation v0.9を参照。
- 2026-07-19: S-skinのA/B提案を「連結成分を丸ごとA」から「A端・B端を順に選び、
  隣接グラフ距離で約半分」に変更した。作者が青/オレンジの分割形状を概ね了承。端点選択は
  B端で自動終了、明示的な中止表示、青=A/オレンジ=B凡例へ改善した。
  詳細は`src/studies/skin/README.md` Observation v0.8を参照。
- 2026-07-19: 作者が孤立候補を手動補正したCoinSRF 74/67分割はA/Bとも境界閉塞・面方向整合・
  連結成分1だったが、Float32保存時の退化面が18/22枚残りゲート不合格。保存後に面積ゼロとなる
  面だけを明示的に除去し、除去枚数をUI/来歴へ記録する修正を追加。再調整した67/74分割で
  A/Bとも連結成分1・保存後トポロジー有効、体積差0.20%、実メッシュ検証も許容内となり通常ゲート合格。
  通常保存後、作者がOptimizer 0.8.2ローカルWebUIでA/B双方を診断し、どちらもOKと確認した。
- 2026-07-19: S-skinの実CoinSRF A/B分割を保存後Float32 topologyまで修正。作者実UI確認で
  original/A/Bすべてclosed・winding整合・退化なしとなり、重複/未割当/不整合と体積差を含む
  通常書き出しゲートが合格した。保存したA/BはOptimizer独立診断でも双方watertightだった。
  詳細値とSHA-256は`src/studies/skin/README.md` Observation v0.7を参照。

- 2026-08-22: SKIN v0.57.0 adds a deterministic fail-closed final-Surface straight-down reachability filter before Bambu Support Enforcer export. It reports candidate → exterior-reachable / interior-or-occluded counts and records a real 36-case modest-resolution screening matrix; it is not a slicer or print-success guarantee.
- 2026-08-23: SKIN v0.58.0 records the real Bambu Slice Preview failure of tree(manual): external-only Enforcer contacts did not stop tree branches entering the porous interior. Tree export is now rejected; 3MF support is fixed to normal(manual) / snug / build-plate-only / expansion0. The v0.57 tree artifact is superseded and must not be printed.
- 2026-08-23: SKIN v0.59.0 records that Normal/Snug also filled the porous interior (17.17 g support for a 19.88 g model), supersedes v0.58 as do-not-print, and replaces Bambu automatic support with deterministic removable straight scaffold columns generated only in the outer XY hull band; BODY-collision corridors are rejected and 3MF automatic support is explicitly disabled.
- 2026-08-23: SKIN v0.60.0 supersedes the rejected 15-column v0.59 artifact and covers every plate-reachable diagnosed overhang candidate across the full XY field. Exact author geometry yields 83 closed removable columns with Bambu automatic support disabled; Bambu Slice Preview remains the human print gate.
- 2026-08-23: SKIN v0.61.0 records that v0.60 still triggered Bambu floating-regions because its 83 columns stopped 0.22 mm below BODY. The same column layout now tapers to 0.48 mm breakaway tips overlapping BODY by 0.12 mm; human re-slice remains required.
- 2026-08-23: SKIN v0.63.0 densified the dry scaffold to 326 columns, but actual Bambu re-slice still reported floating regions; v0.63 is superseded and must not be printed.
- 2026-08-23: SKIN v0.66.0 adds a wide printable first-layer pad, seven-stage elapsed-time UI, repeat-export caching, grid-phase preservation, and exact detached-component diagnostics. Current exact 160 run is closed but still 2 components, so no v0.66 3MF was emitted and print approval remains false.
- 2026-08-23: SKIN v0.65.0 rejects v0.64 after isolated Bambu layer 1 showed only one start island (horizontal maximum 98 versus layer 3 maximum 4515). All 336 pillars now use a common rescale-safe plate anchor and rounded first-layer foot; the final one-component 1,100,124-face mesh has 0 mm plate spread and an independent 0.10 mm slice shows 190 components across the full XY extent. Bambu isolated layer-1 confirmation remains required.
- 2026-08-23: SKIN v0.64.0 (rejected: isolated layer 1 had only one start island) fused BODY, Dry Web, and all 326 columns through one resolution-160 SDF mesh pass. The exact author candidate is closed, degenerate-free, winding-consistent, and one connected component (1,081,140 faces; one 3MF object/component/part). Bambu re-slice remains required before print approval.
- 2026-08-23: SKIN v0.62.0 packaged BODY and 83 intersecting columns as one BODY_WITH_SCAFFOLD part, but actual Bambu re-slice still reported floating regions; v0.62 is superseded and must not be printed.
