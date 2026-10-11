# 新形状case — 入力・工程・gate記録ひな形

**これは記入用Markdownです。`PROJECT.json`、`SLICE_JOB.json`、既存アプリschemaの代用品ではなく、実行可能な設定でもありません。**

[工程本編](README.md)を読み、新case用の文書としてコピーして使います。初期値はNOT STARTED/UNVERIFIED。空欄をMINIAの過去値で埋めず、担当がsourceとAuthor判断から記入してください。このtemplateを埋めても、未許可の生成・slice・Send・Printを開始しません。

## A. Caseと担当

| 項目 | 記入 |
|---|---|
| case_id / revision | 未設定 |
| GitHub issue/task / CURRENT | 未設定 |
| technical source commit / branch | 未設定 |
| Drive artifact root / URL | 未設定 |
| Author / decision owner | Author |
| 造形・製造review担当 | 未設定（Astra等、明示委任） |
| 操作系・adapter担当 | 未設定（Sol等、別task） |
| bounded実装担当 | 未設定 |
| 目的 | 例：外周花の保持／半透明素材の外観。具体的なAuthor判断を記載 |
| 現在許可された操作 | 初期はread-only入力確認・計画のみ |
| 禁止・保護対象 | 元STL、旧case、稼働job、dirty/unpushed work、他laneのHOLD |
| 次の一つのgate | 未設定 |

## B. 原本・生成入力の台帳

pathだけでなく、役割、出典、expected SHAとobserved SHA、測定方法を記録します。以前のreceiptを再利用したときは「今回全bytesを再hash」と書かないこと。

| role | 実ファイル/URI | 版/recipe | bytes / SHA | 座標系/単位 | 確認範囲 |
|---|---|---|---|---|---|
| source Host STL | 未設定 | 原本 | 未確認 | 未決 | 未確認 |
| working Host / host.npz | 未生成 | 未決 | 未確認 | 未決 | 未確認 |
| flower prototype mesh | 未選択 | family/template ID | 未確認 | local frame未決 | 未確認 |
| prototype frame / back anchor | 未設定 | 未決 | 未確認 | local | 未確認 |
| flower placements | 未生成 | recipe/seed未決 | 未確認 | working/plate未決 | 未確認 |
| surface/anchor mirror JSON | 未生成 | schema未決 | 未確認 | 未決 | geometry authorityとの関係未確認 |
| natural contacts | 未生成/必要性未決 | 同配置のfingerprint | 未確認 | 未決 | 未確認 |
| branch structure | 未生成 | family/recipe未決 | 未確認 | 未決 | 未確認 |
| accepted baseline mesh | 未生成 | このcaseのbaseline | 未確認 | 未決 | 未確認 |

### 単位・配置の判断

- source単位→mmの解釈：未決。
- 目標寸法XYZ：未決。
- source→working変換：未決。
- working→plate変換と逆変換：未決。
- Hostを印刷するか、参照面だけか：未決。
- 花を同じ物理サイズにするか、Hostと同じ倍率で変えるか：未決。
- 原本修復の必要性と許可：未決。原本のin-place修復は禁止。

## C. 実行する生成方式

- 使用するHost importer：未選択（実在するfile/commit/実行環境を示す）。
- 花配置：未選択（R4/D6系、Composition設計などを区別）。
- 枝生成：未選択（R4 familyと`inset-relay-mst-v0`を混ぜない）。
- recipe parameters / seed / tie-break / version：未決。
- 保存した結果を読む工程と、再生成する工程：未決。
- 新しいHostで失効するcore/枝/接触/Support/cache：未確認。
- 生成実装の利用可能性：UNVERIFIED。文書に書いてあるだけか、実行済み結果まであるかを明示。

## D. Branch Editorへの受渡し

- Editor版 / Git commit / ZIP SHA：未選択。
- 対象Windows/BlenderとGUI確認範囲：未確認。
- 既存MINIA専用bindingか、新case用adapterか：未決。
- 実際に使うPROJECT schema・作成tool：未設定。任意JSONの名前をPROJECTに変えて代用しない。
- source ledger、花ID、branch ID、joint、半径、変換、保護対象の対応：未確認。
- 原本から独立したwork copy：未作成。
- 必要cache/dependenciesのidentityと新case適合：未確認。
- no-op保存・fresh reopen・意味的ID一致：NOT STARTED。
- 未知ID・source変更・座標混同でHOLDする試験：NOT STARTED。
- Add/途中点/削除mask/reroute/STALEの対応範囲：未確認。

**現在の0.1.0/create_project.pyは固定LOWER70とそのledgerを検証する実装です。別形状用adapterの完成を、MINIA移設PASSから推測しません。**

## E. Author編集と製造への受渡し

| 項目 | 記入 |
|---|---|
| 返されたwork copy / SHA | 未提出 |
| Authorの変更意図／対象領域 | 未設定 |
| 追加枝・途中点 | 未確認 |
| 削除区間・reroute | 未確認 |
| 保護された花・外殻・原本への差分 | 未確認 |
| 差分extractorの対応version | 未確認 |
| 実材化tool/commitと径・接合定義 | 未確認 |
| geometry前後のidentityと許可差分 | 未確認 |
| 意図した接合／孤立／望まない融合 | 未確認 |
| Support設計／除去空間 | 未確認 |
| Astraの現行製造handoff | 未設定（旧成功packageを最新と誤認しない） |

## F. Slice・package・実機条件

| 項目 | 記入 |
|---|---|
| target printer / nozzle | 未決 |
| material / 実spool / plate | 未決 |
| layer / first layer / line width | 未決 |
| temp / cooling / flow / speed / acceleration | 未決 |
| infill / retraction / raft / brim / Support | 未決 |
| resolutionと他の精度条件 | 未決 |
| profile原本・inherits/include・resolved設定 | 未確認 |
| machine startup/end/templateの根拠 | 未確認 |
| Runner/Consoleの承認済み実行入口 | 未設定 |
| SLICE_JOBとinput locks / environment | 未作成 |
| 許可slice回数・上限・retry方針 | 未許可 |
| RAM/commit余裕・重い同時process | 未確認 |
| 完成G-code / bytes / SHA / exit | 未生成 |
| layer数・max Z・時間・材料量 | 未取得 |
| actual toolpath監査範囲・未確認領域 | 未実施 |
| warningsと扱い | 未確認 |
| print package / bytes / SHA | 未生成 |
| embedded=standalone / ZIP CRC / metadata | 未実施 |
| GUI Preview / Send dialog | 未実施。Computer Use許可を別記 |
| Author Print GO | 未許可 |
| Send / Print | 本caseでは未実施 |

## G. Gate表

| gate | status | exact artifact / evidence | 誰が何を確認したか | 残件・次gate |
|---|---|---|---|---|
| Source/data binding | NOT STARTED | — | — | — |
| Host import/transform | NOT STARTED | — | — | — |
| Flower placement | NOT STARTED | — | — | — |
| Permanent generation | NOT STARTED | — | — | — |
| Editor import/bind/roundtrip | NOT STARTED | — | — | — |
| Author edit review | NOT STARTED | — | — | — |
| Manufacturing geometry | NOT STARTED | — | — | — |
| Support/holding review | NOT STARTED | — | — | — |
| Slice completion | NOT STARTED | — | — | — |
| Toolpath audit | NOT STARTED | — | — | — |
| Package integrity | NOT STARTED | — | — | — |
| GUI/delivery check | NOT STARTED | — | — | — |
| Author Print GO | NOT AUTHORIZED | — | Author | — |
| Physical run / removal | NOT STARTED | — | — | — |
| Author ACCEPT | UNVERIFIED | — | Author | — |

不要な任意工程は理由付きNOT APPLICABLE。software・geometry・slice・package・Print GO・physical・artisticを一つのPASSへまとめません。

## H. Lab記録

- printed case/revision / package SHA / run ID：未設定。
- 写真folder・file ID・撮影時点・個体binding：未設定。
- 完走/停止、停止位置・観察：未記録。
- Support除去前後と外周花の生存／脱落：未記録。
- 内部粗さの観察とAuthorが許容した範囲：未記録。
- 材料の透け・見え方・外観採否：未記録。
- この物理観察で言えないこと：未記録。

## I. 最初のSTOP／次回の再開欄

```text
STOP: NEW_SHAPE_PIPELINE_PLAN_READY  ← 計画用の提案名、既存runtimeのenumではない
現在の段階:
保存済み成果物:
原本の保持・branch/HEAD・dirty状態:
実行したこと / 未実行:
最初の未接続箇所:
次のbounded task / 担当 / 必要な許可:
再開時に読む小さいファイル:
稼働jobがある場合の所在と所有（勝手に停止しない）:
```

途中で中断したら、この欄とcase CURRENTを更新して、前段を無条件にやり直さず再開します。読取・記録担当に製造や実機操作の権限が自動移譲されたとは扱いません。
