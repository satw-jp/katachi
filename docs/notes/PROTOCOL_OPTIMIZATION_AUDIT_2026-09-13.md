# Katachi protocol optimization audit — 2026-09-13

Status: **PROPOSED / NOT APPLIED TO GITHUB**

## 1. 調査範囲と結論

対象は `satw-jp/katachi` の運用文書・CURRENT・関連する承認境界。全リポジトリのコード監査、全ブランチの機能検証、ローカルPCの再検証ではない。

GitHub connectorで確認した基準は `main@04cc8ccbb274437862b1813307e627683aec9d4f`。そのコミット日時は2026-09-09 10:04:33 UTC（19:04:33 JST）。監査日は2026-09-13だが、CURRENTに記録された検証日を今日へ書き換える根拠にはならない。

結論：既存のprotocol分離はすでに実施されている。全面再設計ではなく、**共通規則の重複解消、権限の明確化、役割とモデルの分離、タスクに応じた参照、技術完了と承認の分離**が今回の対象。

GitHubへの文書ブランチ作成は安全チェックによりブロックされた。ブランチ・コミット・PRは作成しておらず、main／制作ブランチへの変更もない。本書と差分はレビュー・適用用の提案である。

## 2. 記事との対応と、以前の見立ての訂正

出典：[OpenAI, Rethinking skills and prompts for GPT-6 Astra, 2026-09-11](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)

記事の要点は、必要な文脈に絞り、旧来の過剰な手順を見直し、完了条件と判断境界を明確にすること。以下はその方針をこのリポジトリに適用した設計判断であり、記事による個別リポジトリの保証ではない。

- `TEAM_PROTOCOL_CORE` は元から9項目の短い規則で、`TEAM_REPORTING_RULES` も互換入口に移行済み。「巨大な全文プロトコルが残っている」という見立ては誤り。
- `CURRENT` を任意参照にするのではない。レーン作業では現在の権限・担当・停止条件を確認する入口として残す。
- 機械的な実装途中の承認待ちと、明示されたSOLレビュー・作者判断・実機Gateは別物。後者を一般規則の変更だけで解除しない。
- commit/pushは一律のDone条件ではない。タスクごとに許可を明記する。
- テストは不要にならない。対象に合う検証を残し、既存の必須検証は維持する。全テストの環境が使い捨て・無害とは仮定しない。
- Astraというモデル名から実装権限を推定しない。Research AstraのResearch限定も、別途再割当がない限り残す。

## 3. GitHubで確認したレーン状態

以下は基準mainの記録。未pushの進捗、外部Researchパッケージ、現在の実機状態の保証ではない。

| レーン | 記録された状態 | 今回維持する境界 |
|---|---|---|
| [SKIN_ABC](../status/SKIN_ABC_CURRENT.md) | 作者向け相談窓口。active implementation NONE | 研究・実作品・作者評価から選択的にProductionへ。AB/C統合を自動開始しない |
| [AB](../status/AB_CURRENT.md) | Performance v2 PASS / ACCEPT / CLOSED、`87d5225a...` | G/H/JはHOLD。Support配置を将来標準と決めない |
| [C](../status/C_CURRENT.md) | View Representation Continuity PASS / CLOSED、`59ebb3cf...` | 耐久性問題は局所FAILとして保持。auditは明示開始時のみ |
| [SKIN_R](../status/SKIN_R_CURRENT.md) | Reader Fix 3技術完了、`d5b8a984...`。作者レビュー待ち | Readerの編集・次のfix・Production展開を自動開始しない |
| [HANA](../status/HANA_CURRENT.md) | Touch/Pencil干渉により実機Gate FAILED / OPEN。限定fixは許可済み | `e2456bef...`を基準とするpointer-routing修正のみ。Section Redrawには進まない |
| [Viewer](../status/VIEWER_CURRENT.md) | 技術・作者レビューとも現段階CLOSED、`55cb6f84...` | 新しい研究上の必要がなければ拡張しない |
| [ART](../status/ART_CURRENT.md) | Round 03実装済み、作者のartistic Gate待ち | Round 04未許可 |

HANAの現行[Touch/Pencil task](../tasks/HANA_TOUCH_PENCIL_ISOLATION_FIX_V0.md)は、限定実装・テスト・commit/pushの後に作者による再実機確認を求める。単なる「実機待ち」として実装可能範囲を消してはならない。

CにはAstra後のdurability auditの記載があり、SKIN_ABCは旧C構造を完成させるための補強を否定している。いずれも自動開始は禁止。将来開始する場合、診断だけなのか補強を含むのかをSKIN_ABC/Cの権限で明確にする。今回一方を削除して解消したことにはしない。

SKIN_RはResearch Readerであり、外部Astra generator全体のCURRENTではない。Readerに書かれた停止条件を外部Research全体へ無条件に拡張しない。同時に、外部で新しい候補ができてもReader／Production側の新規実装許可にはならない。

リモートにはaccepted checkpoint以外の研究・印刷用ブランチもあり、ユーザーのopen PR一覧にはHikariの既存Draft PRがある。存在だけから稼働中・承認済み・安全にmerge可能とは判断していない。今回、既存PR・branch・worktreeは操作対象外。

## 4. 変更一覧

| 文書 | 判定 | 変更 |
|---|---|---|
| `AGENTS.md` | SHORTEN | COREへ規則を一本化。仕事別ルーティングと特別参照だけ残す |
| `CLAUDE.md` | SHORTEN / CONDITIONAL | Studyの手順を文書の誤字修正等へ一律適用しない。共通契約を参照 |
| `docs/TEAM_PROTOCOL_CORE.md` | CLARIFY | 役割／モデル、承認済みref／作業ref、権限内継続／明示Gate、証拠の出所を区別 |
| `docs/protocol/READ_SETS.md` | CLARIFY | モデル名でなく担当・仕事で参照先を決定。無関係なCURRENTを全件読ませない |
| `docs/protocol/CURRENT_FORMAT.md` | CLARIFY | 冒頭に今の仕事・Gate。検証日と整形日、技術完了と作者承認を区別 |
| `docs/status/_CURRENT_TEMPLATE.md` | UPDATE | accepted / working / local evidenceを分離。用途付き参照欄 |
| `docs/status/README.md` | ROUTE | SKIN_R / Viewerを含む入口を明示。状態を二重管理する一覧は作らない |
| `docs/protocol/TASK_BRIEF_TEMPLATE.md` | ADD | Goal・Authority・Scope・Done・Permissions/Budget・Stop/Handoffの雛形 |
| 本監査記録 | ADD | 根拠、範囲、未確認事項、適用条件を残す。通常の必読資料にはしない |

`TEAM_REPORTING_RULES`、証拠・handoff・local dirty work・native picker・Hikari・Study authoringの詳細契約は維持。各実CURRENT、過去task、観察文、証拠、実装ソースも変更しない。新しいSkill群やモデル別プロトコルは追加しない。

## 5. 個別タスクの使い方

次の形は新しく承認する仕事の契約であり、過去のtaskを上書きしない。小さな依頼では該当項目だけを短くまとめてよい。

```text
Goal: 今回実現する観察可能な結果。
Authority: 対象CURRENT／task、実行repo・branch・基準commit。
Assignment: 判断責任者と実装担当。モデル名は権限ではない。
Scope: 変更可能範囲と、守る意味・凍結物・他レーン。
Done: 成果物、対象検証、実際の結果確認、証拠の場所。
Permissions: commit/push等の可否、実行環境、重い試行の予算。
Stop: 明示レビュー、人間・実機判断、解決できない重要な権限／仕様矛盾。
```

許可された作業の途中で、単に実装が一段落した、テストを直す、という理由だけで毎回承認を取り直さない。ただし明示されたreview stopは残り、予算を使い切った後の探索や次候補の生成は別許可とする。

## 6. 保護する作品・物理境界

[2026-09-08の作者観察](../observations/AUTHOR_OBSERVATION_SKIN_ARTWORK_FABRICATION_TOOLPATH_ARCHITECTURE_2026-09-08.md)が定める、D0 → 作者判断／Freeze → Fabrication Analysis → D1 → D2 → Toolpath → Physical Record → Selective Translationを保護する。

印刷上の診断は、作者判断前のD0を自動変更する命令ではない。造形上の失敗可能性と機械／工具経路の危険性を混同せず、ソフトウェアの検証結果で実機・作品価値の承認を代行しない。

現在の小開口surface familyの内部removable Support禁止など、条件付きの個別制約を共通ルールへ無条件に一般化しない。一方、該当するタスクでは必須制約として残す。

## 7. 適用と検証

適用は別途許可された文書専用branch/worktreeで行う。基準mainから日数が経っているため、7つの変更対象の現在blob SHAを監査時のものと比較する。対象文書が変わっていたら差分を読み直して調停し、古い全文を上書きしない。

この提案を読むためだけに既存実装branchをmerge/rebaseしない。既存のworktree、dirty/unpushed成果、samples、プリンタ／helper／GPU実行には触れない。merge/deployおよびレーン再開は含まない。

確認項目：原本blob一致、差分の適用性、Markdownリンクの参照先、whitespace、変更パスの限定、文書間の契約整合。アプリのテスト／ブラウザ／実機評価はこの監査では実行していない。

期待挙動のレビューケース：

| ケース | 期待する境界 |
|---|---|
| 文書の誤字修正 | 対象文書と関連規則。全CURRENT・研究文書は不要 |
| 許可済みの使い捨てlocal testで今回の回帰を検出 | 範囲・予算内で修正と再検証。各手順で再承認は不要 |
| 安全性不明のshared/Production接続test | 安全なfixtureと実行権限を確認。無害とは仮定しない |
| HANAの限定fix | 許可されたソフトウェア検証まで。作者の再実機Gateを越えない |
| SKIN_ABC / Viewerのactive NONE | 新しい実装を起動しない |
| 外部Researchの新しい候補 | 固有taskに従う。Reader進捗と混同しない |
| D0にoverhangを発見 | 診断を記録。作者判断前の造形を勝手に変更しない |
| dirty worktree / 不一致ref | 保存して状況を報告。reset/cleanupしない |
| native pickerが必要 | 文脈を提示して明示的なユーザー操作を待つ |
| taskにpush権限がない | generic Doneを理由にpushしない |

これは期待挙動の契約レビューであり、Astraを用いた比較実験の実測結果ではない。文書の短縮率をモデルの速度・費用・成功率の改善率として扱わない。

## 8. 次のcheckpointでのみ行うこと

各実CURRENTの長い履歴は、レーンownerが次に正当に更新するときに冒頭50–100行程度へ現在の入口を整える。作者の言葉・受理済み証拠・未解決のFAIL/HOLDを消さず、Last verifiedを整形日だけで更新しない。

最初の適用後は小さな既承認タスクで、余分な参照読込・不要な承認待ち・範囲逸脱・証拠不足が減るかを観察する。成果を確認する前に全レーンへの強制移行や追加Skill化を進めない。
