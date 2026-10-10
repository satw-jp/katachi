# MINI_A 操作系・プログラムGUIのGitHub保存

Author request: 「今回作ったblendの操作系とプログラムGUIは今後のためにとても重要なものとなると思うのでやったことを出来る限りGITHUBに記録しておいて」

Decision owner: Author。Scope: 実使用コード、作業履歴、操作・設計・依存物・証拠・限界を保存。optimizer改善や形状変更は行わない。

## Definition of Done

1. 既存リポジトリ・公開範囲を確認し、未push/別laneの作業を保持する。
2. Blenderの操作方法、設計判断、制約、修正履歴を文書化する。
3. 実行に必要な自作コード・設定を相対配置と元内容を保持して記録する。
4. 検証結果・各回の集計・外部成果物hash・未対応事項を記録する。
5. 保存内容を検査し、GitHubの専用branchへ反映したcommitを確認する。

## 検査と判定

コードコピーのhash照合、Python構文、PowerShell構文、既存の8ルール試験、Markdown相対リンク、差分の公開対象確認を行う。古い未完成試行2本の構文エラーは歴史資料として明示し、実使用runtimeの構文合格と区別する。

保存taskの判定だけを行い、物理強度・造形価値・印刷許可は判定しない。詳細結果は `docs/evidence/minia_author_workspace/ARCHIVE_CHECKS.json` と `ARCHIVE_REVIEW.md`。

保護：元の作業フォルダを改修しない。保存済みblend、checkpoint、GUIの実行状態を変更しない。公開repoには作品本体／座標cache／大容量結果／第三者ZIPを追加しない。
