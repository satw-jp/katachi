# T17 — Web公開: satw.jp に Studies セクションを立て、Katachi / Kumo をデプロイする

**発注**: 作者（2026-07-17）。**目的**: ちょっとした成果はすでに Stream
（現在 https://satw.a-8c3.workers.dev/stream）に流れているが、道具そのものはまだ
手元にしかない。道具を Web に置き、サイトから触れるようにする。三層でいえば
表層（Stream）の隣に、道具への入口を開く作業。

**作者の決定（2026-07-17・確定）**:
1. サイトのナビに第3のセクションを**立てる**（Works 内の1エントリではなく）
2. 名前は **Studies**（作者は Lab という言葉に違和感を持っている。Lab は使わない）
3. URL は**サブドメイン方式**（katachi.satw.jp / kumo.satw.jp — 運用が楽な方を選択）
4. **Stream には触らない**（投稿への「この画を開く」リンク等はやらない）

対象リポジトリが3つあるため、パートを分けた。各パートは独立して着手できる。
サイトのドメインは移行中で、現在の本番は https://satw.a-8c3.workers.dev/
（Cloudflare Workers）。移行前は `*.a-8c3.workers.dev` の URL で公開し、
移行後にカスタムドメインを付け替える。

---

## Part A — サイト側: Studies セクション新設（satw.jp のリポジトリ）

対象: satw.a-8c3.workers.dev を配信しているサイトのリポジトリ。
**既存サイトの構造・スタイル・実装の流儀に完全に合わせること。** 現状のサイトは
モノクロ・余白の多い静かなデザイン（ナビ: Works / Stream / About / Contact）。
これは要求仕様であって画面設計ではない — 見た目の最終判断は作者が行う。

### A-1. ナビゲーション

- ナビを Works / **Studies** / Stream / About / Contact にする
  （Studies の位置は Works と Stream の間を推奨。最終位置は作者判断）

### A-2. Studies 索引ページ（/studies）

- 道具の一覧ページ。各エントリ: **サムネイル / 名前 / 一行説明 / 注記 / リンク**
- エントリのデータは**1ファイルの一覧**（JSON か TS 配列か、サイトの流儀に合う形）に
  分離する。道具が増えたら1エントリ足すだけでページに並ぶこと
- 初期エントリは2つ（一行説明は案 — 作者が直す前提）:

| 名前 | 一行説明（案） | 注記 | リンク |
|---|---|---|---|
| Katachi | 場からかたちを作る造形の道具。こねる・詰める・重さを見る 8つの Study | PC・Chrome 推奨 | https://katachi.a-8c3.workers.dev/ |
| Kumo | 雲が生まれる条件を、地表から一段ずつ操作して観察する 3D 実験 | デスクトップ専用 | https://kumo.a-8c3.workers.dev/ |

- ページ冒頭に位置づけの一文（案 — 作者が直す前提）:
  「ここにあるのは完成した作品ではなく、研究のための道具です。日々変わり、
  壊れることもあります。」
- サムネイルは各アプリのスクリーンショットを静的画像として置く（Stream 既出の
  画像を流用してよい）
- 道具へのリンクは新しいタブで開く（サイトとは別のアプリなので）

### A-3. やらないこと

- Stream のページ・投稿形式には一切触れない（作者の決定4）
- Works には触れない

---

## Part B — Katachi のデプロイ（このリポジトリ）

対象: このリポジトリ。実態: Vite の**マルチページ静的ビルド**（index.html =
cloud-sculpt + gravity / sag / mpm / foam / rings / pack / skin の計8ページ、
`vite.config.ts` の rollupOptions.input に列挙済み）。`base: "./"` 済み。
three.js 使用。**mpm は WebGPU** — セキュアコンテキスト必須だが、workers.dev は
HTTPS なので追加対応は不要（vite.config.ts のコメントにある LAN 開発時の問題は
公開URLでは起きない）。

### B-1. Cloudflare Workers（静的アセット）としてデプロイ

- assets-only Worker を追加する。例:

```jsonc
// wrangler.jsonc
{
  "name": "katachi",
  "compatibility_date": "2026-07-17",
  "assets": { "directory": "./dist" }
  // ドメイン移行後: katachi.satw.jp をカスタムドメインとして追加（移行はタスク外）
}
```

- `package.json` に `"deploy": "npm run build && wrangler deploy"` を追加
- wrangler は devDependency の追加になる — 外部依存の追加は本来要承認だが、
  **Web公開は作者決定済みなので、この1件は承認済みとみなしてよい**
  （依存を増やしたくなければグローバル `npx wrangler@latest` でも可。選んだ方と
  理由を README に一行）
- マルチページなので SPA fallback は**設定しない**（8つの .html がそのまま配信される）
- `recipes/` や `docs/` は dist に入らない（研究記録はリポジトリに留まる）。
  これで正しい — 公開するのは道具だけ

### B-2. 公開URLでの動作確認（このリポジトリの検証義務に従う）

- 8ページすべてが公開URLで開けること
- **mpm ページで backend 表示が WebGPU になること**（Chrome・デスクトップ。
  AGENTS §3 の実座標クリックの検証義務はここでも同じ）
- recipe の書き出し→読み込みが公開URLで一往復できること（正本 = 操作履歴の
  save/load はこのプロジェクトの生命線。AGENTS 冒頭の運用ルール）
- 各ページの Version / UpdatedAt 行が表示されていること

### B-3. README への追記

- README.md に公開URL・デプロイ手順・「デプロイは手動（`npm run deploy`）」を数行で記録

### B-4. T16 との関係

- [T16（プロジェクト整理）](T16-consolidation.md)とは独立に着手できる（T17 は
  src/ を触らない）。ただし**同時に走らせない**こと（T16 は全 Study を触るため、
  検証がぶつかる）。順序はどちらが先でもよい

---

## Part C — Kumo のデプロイ（active/Kumo リポジトリ）

対象: Kumo の独立リポジトリ（package 名 kumo・port 5176）。
**着手前に Kumo 側の AGENTS / docs / 既存タスク（K1 等）を読み、Kumo の流儀に従うこと。**

- Part B と同じ構成で Worker 名 `kumo` としてデプロイ
  （現在 `kumo.a-8c3.workers.dev`、移行後 `kumo.satw.jp`）
- 着手前に確認: Kumo の vite 設定に `base: "./"` があるか。なければ足す
- Kumo はデスクトップ専用ガード（900px 未満で案内表示）が実装済み — そのまま活かす。
  公開URLでガードの表示も確認する

---

## Part D — 継続更新の仕組み（作者の追加発注 2026-07-17:「変更があったら更新まで」）

公開は一度きりの行為ではなく、**変更のたびに公開URLへ反映されるまでが作業**とする。
仕組みは2層。第1層が正で、第2層は任意。

### D-1. 作業セッションの型に組み込む（正・両リポジトリ必須）

- Katachi の AGENTS.md §3「終了時」のチェックリストに1項を追加する:
  「**公開に影響する変更（src / 各 .html / 依存）があった場合、`npm run deploy` を
  実行し、公開URLで当該変更を確認するまでが完了**。デプロイしなかった場合は
  その旨と理由を報告に一行」
- Kumo 側にも同等のルールを Kumo の運用文書（AGENTS 等、Kumo の流儀に従う）に追加
- これにより、以後どの実装AIのセッションでも「動作確認 → デプロイ → 公開URLで確認」
  が既定の流れになる。docs/ や README だけの変更ではデプロイ不要（公開物に出ないため）
- **前提（作者の一度きりの手作業）**: 各マシンで `wrangler login` を一度実行して
  Cloudflare アカウントに接続する。認証はAIが代行しない — 実装AIは login 済みかを
  `wrangler whoami` で確認し、未認証なら作者に依頼して待つこと

### D-2. push → 自動デプロイ（任意・Katachi のみ・後日でよい）

- Katachi には GitHub remote（satw-jp/yohaku）があるため、GitHub Actions で
  main への push 時に build + `wrangler deploy` する自動化も可能
- 必要になったら: Cloudflare API トークン（Workers 編集権限）を作者が発行し、
  GitHub リポジトリの Secrets に作者自身が登録する（トークンの発行・貼り付けは
  作者の手作業。AIはワークフローYAMLの作成のみ行う）
- 注記: GitHub 上のリポジトリ名がまだ `yohaku` のまま。改名するかは作者判断
  （正本 = `~/Projects/docs/rename-ledger.md` に従う）
- Kumo は remote が無いため対象外（D-1 のみで運用）

## スコープ外（全パート共通）

- Stream への一切の変更（作者の決定4）
- ドメイン移行そのもの・DNS 設定（移行後のカスタムドメイン付けは別途一言で済む）
- 道具側の UI・機能の変更（デプロイ構成の追加のみ）
- Katachi のホーム/ナビ再設計（8ページの一覧は今は素朴なリンク。
  T16 の人間の判断ポイント1 — 公開はこのままでよい）
- アクセス解析・OGP 画像などの飾り（必要になったら別途）

## 受け入れ基準

- [ ] サイトのナビに Studies があり、/studies に2つの道具が並ぶ
- [ ] 索引の各エントリから katachi / kumo の workers.dev URL が新しいタブで開く
- [ ] Katachi: B-2 の4項目すべて（8ページ・WebGPU・recipe 往復・Version 行）
- [ ] Kumo: 公開URLで動作し、900px 未満で案内が出る
- [ ] 一覧データに仮エントリを1つ足すと索引に現れる（増える前提の検証。確認後削除）
- [ ] 各リポジトリで build が通る
- [ ] D-1: Katachi の AGENTS.md 終了時チェックリストにデプロイ項が入り、
      Kumo 側にも同等の記載がある。試しに軽微な変更を1つデプロイして公開URLに
      反映されることを一往復確認する

## 人間の判断ポイント（作業を止めない。案のまま進めて公開後に直す）

1. 一行説明・位置づけの文・Studies のナビ位置（上記の案は出発点）
2. サムネイルにどの画を使うか（実装は Stream 既出の画で仮置きし、作者が差し替える）

## 完了時の記録

- docs/tasks/README.md の地図に T17 の行を「実装済み」へ更新
- 公開URL 2つと索引ページのスクリーンショットを作者に報告
- README.md（Part B-3）への追記をもって記録完了とする（Study の manifest は
  対象外 — このタスクは Study の中身に触れないため）
