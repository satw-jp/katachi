# Yohaku

**楽をしているうえで、無理をしているように見えるべき。**

かたちの「二つの余白」（実際の余白 = 力学の余裕／見かけの余白 = 身体が読む余裕）を主題に、
SDF・構造力学・材料を学びながら造形するための研究プラットフォーム兼、造形の道具。
MorphogenesisLab（`active/MorphogenesisLab`）の姉妹プロジェクト — 散歩という同じ地層から生えた二本目の幹。
道具そのものが作品であり、道具から作品が生まれる。

状態: **v0（2026-07-03 起草）**。思想文書のみ。実装は未着手（docs/tasks/ の指示書から始める）。

## 文書の地図（読む順）

| 文書 | 役割 |
|---|---|
| [STATEMENT.md](STATEMENT.md) | 原点 — なぜ作るか（作者の言葉。検閲は随時） |
| [RESEARCH.md](RESEARCH.md) | 研究骨子 — 中心の問い・命題 Y0〜Y4・三つの問い×五つの解き方・第0段 Study・遠い地図 |
| [AGENTS.md](AGENTS.md) | 運用憲章 — 役割分担・作業の型・コード原則・安全（全 AI・人間はまずここ） |
| [docs/tasks/](docs/tasks/README.md) | 実装タスク指示書（T1〜。共通規約つき、モデル非依存） |

## 三層構造

- **Study**（`src/studies/<name>/`）— 試行錯誤の場所。自己完結（コード＋研究ノート＋manifest＋記録）
- **Library**（`src/library/`）— Study から昇格した安定な操作
- **Instrument** — Library を束ねた造形の場。**道具は研究の堆積物**（初日は Study だけでよい）

## 経緯

2026-07-03、作者と Fable 5 の3日間の対話で起草。過程のアーカイブ:
`~/Projects/docs/yohaku-statement-draft-20260703.md`／`yohaku-research-draft-20260703.md`
（本プロジェクト内の同名文書が**正**。docs/ 側は初出時の記録）。
Drive 側の関連調査: `~/Projects/docs/drive-survey-20260703.md`
