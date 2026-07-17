# T16 — プロジェクト整理（8 Study の重複解消・UI統一・土台の補修）

**作成**: 2026-07-17 の全体監査（Claude Fable、作者の指示による）。監査時点で
`npm run build` は正常（593ms）、全8ページ動作。**改称直後**: 本プロジェクトは
2026-07-17 に Yohaku → Katachi へ改称済み（正本 = `~/Projects/docs/rename-ledger.md`）。

**目的（研究上のなぜ）**: 8つの Study は T1→T15 の積み上げでコピーが分岐しながら
育った。次の Study を足すたびに9枚目のコピーが生まれる状態を止め、
「手の履歴（recipe）」という第一級データの扱いを一本化する。
新しい観察は増やさない。**挙動を変えない**（ルート AGENTS.md リファクタリング方針）。

**依存**: なし。ただし全 Study の main/ui を触るため、他タスクと同時進行しないこと。

**このタスクは「相談不要（AIの裁量）」の範囲だけで構成してある。**
文末の「人間の判断ポイント」は含めない — 作者が決めたら別タスクに切り出す。

---

## 監査で確認された現状（2026-07-17）

- `src/lib/` が存在せず、**共有コードがゼロ**。8 Study × { main.ts / ui.ts /
  renderer.ts / shaders.ts / history.ts / style.css } + meshExport.ts ×5 +
  picking.ts ×3 + field.ts ×3。src 合計 約17,870行
- 同名関数の多重実装: `tick` ×8、`exportHistory` ×8、`buildSlider` ×8、
  `applyRecipeText` ×8、`record` ×8、`serializeRecipe / parseRecipe / replay /
  applyEntry` ×7、`ndcFromEvent / isEventOnViewport` ×6、`buildUi` ×6
- **ただしコピーは分岐済み**（例: gravity と sag の history.ts は 140/156 行中
  diff 106 行）。機械的な統一は不可。**「最も進化した実装」を特定して正とし、
  他 Study を一つずつ移行**する
- style.css 8枚 計2,108行。ベースは共通、末尾に Study 固有が足されている
- meshExport 5枚は大きく分岐（SDF / セル / リング / スキンでジオメトリ源が違う）
- 色スケール定数（作者承認の 青(0.30,0.55,0.95)↔赤(0.95,0.25,0.20)）が
  shaders 内に散在（gravity, sag で確認）
- 良い点: **Version / UpdatedAt 表示は全8 Study が準拠**。維持すること
- `tsc -b` が `vite.config.d.ts` をリポジトリ直下に排出（emitDeclarationOnly）。
  Morpho の vite.config.js 影問題と違い実害はないが、成果物の散らかり

## サブタスク（この順で。1 Study 移行ごとに小さくコミット）

### T16-1. 衛生（低リスク・最初）
- `vite.config.d.ts` の排出先を `node_modules/.tmp` 等へ（tsBuildInfoFile と同様に）。
  既存の `vite.config.d.ts` は削除
- 呼称の残存置換: README.md / AGENTS.md / vite.config.ts コメント内の「Yohaku」を
  Katachi へ。**ただし STATEMENT.md と、名前の由来・来歴を述べている行は書き換えない**
  （改称の経緯として「旧名 Yohaku」の記述をむしろ README 冒頭に1行残す）
- 受け入れ基準: build 正常、ルートに生成物が落ちない

### T16-2. 入力とループの共通化（副作用小）
- `src/lib/input.ts`: `ndcFromEvent` / `isEventOnViewport` / picking の共通部
- `src/lib/loop.ts`: `tick` / resize / rAF の骨格
- 移行順: 最小の Study（gravity → sag …）から。**AGENTS §3 の実座標クリック検証
  義務に従い、各移行後に実クリックで動作確認**（verify 用ポート 5185）
- 受け入れ基準: 移行済み Study の操作が改修前と同一

### T16-3. UI 部品と style の共通化
- `src/lib/ui/`: `buildSlider` / `buildUi` の共通部、Version・UpdatedAt 表示部品、
  デバッグ折りたたみ（ルート docs/ui-guidelines.md 準拠）
- `src/styles/base.css` に8枚の共通部分を抽出、各 Study には固有分だけ残す
- **見た目は変えない**。スクリーンショット比較（before/after）を各 Study で残す
- 受け入れ基準: 全ページで見た目・操作が同一、style 合計行数の削減を実測報告

### T16-4. recipe / history の一本化（最重要データ層・最後に慎重に）
- `src/lib/recipe.ts` + `src/lib/history.ts`: `serializeRecipe / parseRecipe /
  applyRecipeText / replay / record / exportHistory` を統一
- 先に8 Study の recipe スキーマの差分を表にして本ファイル末尾へ追記すること
- 統一スキーマには version フィールドを必須とし、**旧形式の recipe が全 Study で
  読み込める後方互換を必ず保つ**（「正本 = 原文 + 手の履歴」— 過去の手の履歴が
  開けなくなることは、このプロジェクトでは作品の損失にあたる）
- 受け入れ基準: 手元の既存 recipe ファイル（旧形式）の読み込みテストが全 Study で通る

### T16-5. meshExport はインターフェースだけ統一
- 共通化するのは外側のみ: 実寸 mm・水密検査・STL/OBJ 書き出し・recipe 対保存の層を
  `src/lib/meshExport.ts` に。ジオメトリ生成（SDF / セル / リング / スキン）は
  各 Study に残す（無理に抽象化しない — ルート AGENTS「未使用の抽象化は作らない」）
- 将来 Kumo・Optimizer と形式を共有する背骨になるので、Study 非依存の型で書く。
  ただし今回は Katachi 内で閉じる（先回りの汎用化はしない）

### 進め方の掟
- 一度に全 Study を書き換えない。1 Study 移行 → 実画面確認 → コミット
- mpm（WebGPU）は特殊なので各サブタスクの最後に回す。gpu/ 配下は触らない
- 挙動・見た目・保存形式の互換をすべて維持。「ついでの改善」をしない
- 完了時: docs/tasks/README.md の地図に T16 を追記し、README の Study 一覧を現状に合わせる

## 人間の判断ポイント（T16 に含めない・作者裁定待ち）

1. 8ページをどう一覧するか（ホーム/ナビの設計。今は素朴なリンク）
2. Study の統廃合（rings と skin、pack と foam の関係など）
3. 見た目の変更を伴う UI 刷新
4. 休止中の Morphogenesis Lab（archive/）の T6 を再開するか
