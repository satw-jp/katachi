# ローカル実行担当向け — J CODEX bulk retirement前のread-only監査

監査のみ。copy/move/delete/rename/attribute変更/Git変更/同期変更/process停止は不可。新しい監査reportを新規scratchへ保存する以外、元dataへ書かない。これは移行を許可するscriptではない。

目的: Authorがjobを一件ずつ仕分けなくてよいように、`J:\My Drive\codex`の2026-10-09以外を、既知例外＋一回の機械監査で分類する。

## 入力

- `J_CODEX_COLD_ARCHIVE_AUDIT_20261009.json`。既知依存のseedであり完全inventoryでも削除allowlistでもない。
- GitHub mainのSKIN_MINI_CURRENTと、MINIA PR #56の最新explicit CURRENT/locks。進行中更新があれば古いseedとdiffを示す。
- J/Dの実filesystem・Drive Desktop設定・現在の実行状態。

## 一回の収集

1. dated folder/job単位に相対path集合、file count、logical bytes、可能ならallocated bytes、last-write、hidden/system/offline/reparse種別を列挙する。reparseを盲目的に追って範囲外へ出ない。エラー/未読は0件ではなくUNKNOWN。日時だけでactiveを決めない。全巨大payloadのhashやクラウド一括hydrateはこの監査で行わない。
2. 現行Blender/Bambu/Python/pythonw/PowerShell/Node/Console等のPID、開始時刻、executable、取得可能なworking dir・参照pathを読む。commandline全体やcredential・tokenは報告へ出さず必要なpathだけ残す。取得できないopen handle/CWDはUNVERIFIED。既存権限で読めないものを管理者化・新監視tool導入して迂回しない。
3. .lnkのTargetPath/WorkingDirectory/必要な引数内path、Startup、Scheduled Tasksの該当起動、既存profile/config/env/vendor参照を読む。起動しない。Bambu履歴に出るだけのpathとactive inputは区別。Blender .blendの外部library/cache/textureは保存manifestでたどり、不明な場合はそのjobをHOLD。既存のrunを検証のために再開しない。
4. `.git` directory/file、commondir、gitdir、objects/info/alternates、submodule/shared objectの参照を確認。`GIT_OPTIONAL_LOCKS=0`でworktree list --porcelain、status --porcelain=v2 --branch --untracked-files=all、必要なrev-parse/for-each-ref等のread-only query。未tracked/ignoredもinventoryに含める。remote refとの一致不明はunpushed=UNKNOWNとし、fetch/pull/push/checkout/clean/prune/gc/repairを実行しない。差分git bundleのprerequisite baseを確認。common .gitをdate外/対象外に持つ場合、その経路も保護する。
5. 現行CURRENT/task/locks/profile/launcherから小さいtext/JSONの直接path参照を抽出し、必要なruntime/inputまで推移的にたどる。履歴コメント全件の文字列一致だけで永久KEEPにしない。dynamic import/相対pathの基準dirを扱い、明示解決できないものだけHOLD。
6. Google Drive Desktopのstream/mirror、対象sync root、cache backing volume、pending sync/error、Jの実volume、Dのsync除外をread-onlyで確認。D未確認を非同期領域と仮定しない。cloud file IDと参照リンクを保持する必要があるものを識別。Google native docsのpointerを本文バックアップとみなさない。

## 出力

`DATE_SUMMARY.json` / `JOB_CLASSIFICATION.json` / `KEEP_EXCEPTIONS.json` / `REFERENCE_EDGES.json` / `LOCAL_STATE_GAPS.md`。
各jobに要求された4分類の一つ、根拠、保護される最小prefix、数量・logical/allocated bytes、未確認、コピー安定性、cloud保持要否を付ける。

この監査だけでDへの新コピーは行わない。未検証DコピーをVERIFIEDとせず、`SAFE_TO_COLD_ARCHIVE_AND_RETIRE_FROM_J`へ昇格しない。既にあるD実物について検証が明示的に許可されていなければ、将来条件として分ける。

退役の必要条件:
- exactly同じ相対path集合/件数/bytes/全file SHA（隠しfileを含む）、コピー前後のsource整合。
- 対象に現行書込/開いているfileがない、または停止確認済みの適切なsnapshot。
- active runtime・設定・入力・worktree・common Git参照が対象外に残らない。
- 未公開/未commit/物理証拠が失われず、完全な再現保管と再開方法が説明できる。
- cloud deletionをしないlocal-only回収か、cloud削除影響を明示承認した退役かが確定。
- D必要容量と保全余白が足りる。

Authorにfileごとの判断を戻さず、既知例外と追加例外の差分、残りの一括候補、合計容量、必要な未解決判断だけを一表で返す。
不明jobがあることを理由に全jobの分類を止めない。しかし不明をSAFEへ変更しない。

STOP: J CODEX COLD ARCHIVE — READ-ONLY CLASSIFICATION READY / NO DATA MUTATION。