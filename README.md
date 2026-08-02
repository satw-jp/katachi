# Katachi

旧名 Yohaku。2026-07-17 に Katachi へ改称した。

**楽をしているうえで、無理をしているように見える — そうであってもいい。**

かたちの「二つの余白」（実際の余白 = 力学の余裕／見かけの余白 = 身体が読む余裕）を主題に、
SDF・構造力学・材料を学びながら造形するための研究プラットフォーム兼、造形の道具。
MorphogenesisLab（`active/MorphogenesisLab`）の姉妹プロジェクト — 散歩という同じ地層から生えた二本目の幹。
道具そのものが作品であり、道具から作品が生まれる。

状態: **Katachi active / 11 Study / Hikari v0.32.1（2026-08-02）**。HikariはKatachiの形を透明体・光・影・環境として観察し、Blenderへ渡すワークスペース。

## 文書の地図（読む順）

| 文書 | 役割 |
|---|---|
| [STATEMENT.md](STATEMENT.md) | 原点 — なぜ作るか（作者の言葉。検閲は随時） |
| [RESEARCH.md](RESEARCH.md) | 研究骨子 — 中心の問い・命題 Y0〜Y4・三つの問い×五つの解き方・第0段 Study・遠い地図 |
| [AGENTS.md](AGENTS.md) | 運用憲章 — 役割分担・作業の型・コード原則・安全（全 AI・人間はまずここ） |
| [docs/tasks/](docs/tasks/README.md) | 実装タスク指示書（T1〜。共通規約つき、モデル非依存） |
| [docs/architecture/](docs/architecture/) | Study機能・依存・座標・Optimizer境界・再編方針の監査記録 |
| [src/instrument/README.md](src/instrument/README.md) | Instrument第一段階であるStudy一覧の設計 |

## 三層構造

- **Study**（`src/studies/<name>/`）— 一つの生成原理を研究する自己完結単位（コード＋研究ノート＋manifest＋記録）
- **Library**（`src/lib/`）— 複数のStudyで実需が確認された小さく安定した操作
- **Instrument**（`src/instrument/`）— LibraryとStudyの成果を束ねる制作の入口。現在は `/studies.html` のStudy一覧

## 起動・ビルド

```bash
npm install
scripts/launch-server.command
```

Hikariを含む開発サーバーは `http://localhost:5174` で起動する。launcherは全branchのmanifestを比較し、
最新版ではないworktreeからの起動を停止する。起動中の版と作業場所は次で再確認できる。

主な入口:

- `/` — Hikariを含むS1「雲をこねる」
- `/studies.html` — 11 Studyの一覧
- `/skin.html` — 表面パッチとA/B分割
- `/interior-growth.html` — 内部から育つネットワーク
- `/hitsuji.html` / `/hitsuji-field.html` — 羊への原理作用と現象表示
- `/tangle.html` — 軌跡の充填と融合

```bash
node /Users/atsushisato/Projects/scripts/verify-hikari-current.mjs --runtime
```

ビルド確認:

```bash
npm run build
```

## Web公開

公開URL: https://katachi.a-8c3.workers.dev/

Cloudflare Workersへは手動で公開する。最新版ゲートとテストを確認したうえで、
`VITE_GIT_COMMIT=<commit> npm run build`と`npx wrangler deploy`を実行し、
公開URL上の版・主要ページを確認する。

現在の実装は、cloud-sculpt / gravity / sag / mpm / foam / rings / pack / skin /
interior-growth / hitsuji / tangle の11 Study。各StudyのQuestion・Setup・Observationは
`src/studies/<name>/README.md`、versionと更新記録は各`manifest.json`を正本とする。

## 経緯

2026-07-03、作者と Fable 5 の3日間の対話で起草。過程のアーカイブ:
`~/Projects/docs/yohaku-statement-draft-20260703.md`／`yohaku-research-draft-20260703.md`
（本プロジェクト内の同名文書が**正**。docs/ 側は初出時の記録）。
Drive 側の関連調査: `~/Projects/docs/drive-survey-20260703.md`
