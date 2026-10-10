# MINI_A — Blender操作系と自動改善GUIの保存記録

2026-10-10 JST の実装スナップショット。Authorが編集した枝を保持しながら、内部接続を確認・編集・探索するための道具です。これは新しい改修版ではなく、実際に使ったコードと判断の記録です。

| 読みたい内容 | 入口 |
|---|---|
| Blender操作、ショートカット、クリップ、区間削除 | [操作ガイド](USER_GUIDE.md) |
| GUI、探索条件、終了条件、評価の意味 | [自動改善プログラム](OPTIMIZER.md) |
| データ構造、保護、モジュールの読込順 | [実装構成](ARCHITECTURE.md) |
| 元データと依存関係を揃えて復元する | [復元手順](RESTORE.md) |
| 要望・不具合・修正・今後の課題 | [開発履歴とFOLLOW-UP](HISTORY.md) |
| 保存時点の状態、証拠、次の判断 | [CURRENT](../../docs/status/MINIA_AUTHOR_WORKSPACE_CURRENT.md) |
| 各回の実績 | [RUN_SUMMARIES.json](../../docs/evidence/minia_author_workspace/RUN_SUMMARIES.json) |

## 保存範囲

- `outputs/`：実使用したbootstrap、Blender runtime、optimizer、Windows GUI。元の相対配置とファイル内容を保持。
- `historical_work/`：調査、生成、修正、検証の作業スクリプト。**過去版・試行版を含み、順に全部実行するものではありません。** 実行すると指定先を上書きするスクリプトもあります。
- 以前のsource binding / layerwise V1・V2は [既存保存コード](../minia_internal_repair/README.md) に保持。旧ブランチ `agent/minia-internal-repair-editor-v1` の `9031925` から記録を移しています。
- `.blend`、元の作品データ、host、グラフキャッシュ、全座標入り報告、checkpoint、第三者のZIPはGitに入れず、[DriveのSHA-256台帳](../../docs/evidence/minia_author_workspace/DRIVE_ARTIFACTS.json)で識別します。

現在の入口は `outputs/MINIA_LOWER50_BOOTSTRAP.py`。名前にLOWER50とありますが、LOWER70およびAUTO100結果もこの入口を使います。GUIは `outputs/MINIA_OPTIMIZER/dashboard.ps1`。ファイル単体のダブルクリックだけでは、必要なruntimeが登録されない場合があります。

公開コードには当時のローカルパスが残っています。移設時の変更箇所を復元手順に明記しました。元データなしで単独起動できる配布アプリ、完全な一括再生成手順、物理強度保証ではありません。

## 保存時点の結果

最新検証済みは **MINIA_AUTO_100_RUN_007.blend**。200本追加で `LINK_LIMIT` 終了。

| 指標 | 開始時 | RUN_007 |
|---|---:|---:|
| 赤と評価された枝の総延長 | 15,195.663 mm | 14,931.649 mm |
| 花の局所的な奥向き経路が2系統以上 | 1,586 | 1,780 |
| 3系統以上 | 10 | 10 |
| 最長の連続直線 | — | 49.810 mm |

赤の総延長は約1.74%減少。赤ゼロは未達です。報告は保存→別プロセスで再読込→再着色の検証にPASS。これは評価式と保存整合性の結果であり、印刷成功・実物強度・透明性を判定した結果ではありません。
