# SKIN Author Workflow R1 — 全体担当Astraへの実装引継ぎ

作成日: 2026-10-07 JST  
Repository: `satw-jp/katachi`  
文書の性格: **新しい担当範囲・実装契約の設計。実装完了／既存Issue／Print GOを示すものではない。**

## 0. 今回のAuthor決定

MINIL個別作品は、別の新規Astraが印刷可能な状態まで進める。
このAstraは、SKIN/FUKEI全体で再利用する**Author操作の制作・印刷ワークフロー**を担当する。

目的は、毎回AIに指示を出して作品を作ることではなく、Authorが通常のUI操作で、対応する入力・設定から制作と印刷データ作成を行えること。

最終的なAuthor体験:

`ベース形状 → 花形状（既定あり） → 花・内部枝生成 → バランス調整 → 造形版を選択 → 機種・ノズル・材料・印刷条件 → Support／slice → Preview → .gcode.3mf保存`

**MINIL納品をこのUI完成の待ちに戻さない。このUI開発もMINILのPhysical PASS待ちにしない。**

これは制作UIの実装担当であり、全体の再監査・全史調査だけを行う担当ではない。最初に短い実装計画を記録したら、範囲内の実装と実操作検証へ進む。

## 1. 責任分担と衝突防止

| 対象 | 担当・扱い |
|---|---|
| 今回のMINILの造形版、局所Support修正、印刷条件、actual job、full slice、納品package | MINIL担当Astra。ここでは変更・実行しない |
| 制作UI、保存メタデータFix 1、印刷条件UI、UI→Slice Console接続、保存再開、起動入口 | この全体担当Astra |
| Slice Consoleの既存実行・package機能 | 現物の適用可能なcheckpointをpinして再利用。別Runnerへforkしない |
| Slice Consoleで別担当が進行中のfingerprint等の機能 | 所有者を尊重する。このtaskで吸収・再設計・二重実装しない |
| 構造として何を採るか、美的判断、実スプール確認、Print GO、Send、実機評価 | Author。workerが代行承認しない |

- 作業branch、worktree、入力snapshot、output root、使用port、変更予定pathを開始時に記録する。
- 同じpathの実装を二人で同時に変更しない。必要な共通修正は一人が実装し、固定commit／snapshotを受け取る。
- MINILの進行中出力・原本・dirty workを直接読む計算入力にしない。受渡し済みの不変snapshotを参照する。
- MINIL側の新しい成果を「最新ファイルだから」と自動取込しない。
- MINILの機種、ノズル、材料、Support、geometry、G-codeにこのUIの既定値を逆流させない。
- ローカルCPU/RAMを奪う重いengine試験は、既存sliceの実行状態を確認してから行う。他担当processの停止・横取りは禁止。空き待ちになってもUI／fixture／保存実装まで全停止しない。
- この設計は他のAstraを実際に起動・通知した記録ではない。担当間の受渡しはartifact/task記録で行う。

## 2. Read first — 必要な入口だけ読む

1. `AGENTS.md`
2. `docs/TEAM_PROTOCOL_CORE.md`
3. `docs/status/SKIN_THREAD_HANDOFF_CURRENT.md`。記載日と対象範囲に注意。古いNOT STARTEDで後発成果を巻き戻さない。
4. 制作UIのtask-local `docs/status/SKIN_CREATION_CURRENT.md`、`docs/tasks/SKIN_CREATION_UI_V0.md`、最新evidence。
5. この文書と付録Aの保存メタデータFix 1。
6. `tools/slice-console/CURRENT.md`、`tools/slice-console/README.md`、そこで示す対象機能のtask／code。
7. `docs/status/R5_SLICE_RUNNER_CURRENT.md`、`docs/fabrication/A1_BAMBU_CLI_RUNBOOK.md`、`docs/fabrication/TOOLPATH_AUDIT_RULES.md`を接続上必要な範囲だけ読む。
8. #26/#27/#33/#35/#36、#29/#32は対象関数・保存契約・受入境界の確認が必要なときだけ参照。

`sol-advisor`等やSol/Highへの切替は開始条件ではない。古いSOLラベルは役割／checkpoint名。

### 2026-10-07に取得した現在地

- 制作UI CURRENTは2026-09-30版。4条件生成・比較・保存復元の証拠があるがSupport／sliceは未接続。
- 保存メタデータFix 1は指示書がある。今回の読取・限定検索では完了checkpointを確認できなかった。**実行側で完了を確認できれば再実装しない。未完了なら付録Aを実施する。**
- Slice Console CURRENTはexecution-environment fingerprint v0.1のpure実装・287 synthetic/legacy tests PASSを記録。実環境collector、cache／REUSEの完成を意味しない。
- Slice Console READMEの実行入口は、準備済み`SLICE_JOB.json`を実行するもの。機種等を選んでjobを組む今回のUIはその上流に置く。
- 現在の`mesh_import`は1件のSTLを検証する契約。宣言transformをRunner自身が適用する契約ではない。
- `package_gcode.py`の既存経路は完成G-codeに加えて元3MF設定を必要とする。G-codeだけからmetadataを捏造してはならない。

これらは保存記録／取得コードの確認であり、Author端末の稼働process・新しい未同期作業まで検証済みという主張ではない。

## 3. 開始baseと既存成果

### 制作UI

- reported branch: `agent/skin-creation-ui-v0`
- delivery HEAD: `6fd5beddf844b3647b88eaffae65ea326e4d6337`
- runtime: `7a9ee03e220976aa3fc473ad51a7bcb15020960b`
- reported worktree:
  `J:/My Drive/codex/2026-09-22/skin-repo-satw-jp-katachi-task/work/skin-creation-ui-v0`
- original archive: `docs/evidence/skin-creation-ui-v0/author-project.skincreation`
- bytes: `114117140`
- archive SHA-256: `654535f9bc4422bebfe965cf5fa936ca7b67568696ee685a650cf17c91bba0d9`
- existing launcher: `tools/skin_creation/launch.ps1`
- observed entry: `http://127.0.0.1:5188/skin-rebuild.html?mode=creation`

baseは「Fix 1済みのはずの未知commit」ではなく、実在する上記objectまたは検証できたその後継を使う。未pushだけで元実装が存在しないと判断しない。実在しないobjectの取得を永遠に試みない。ローカルobjectもsnapshotも取得できない場合のみ、必要なものを一つに絞ったHOLDにする。

既存branchをcheckout/resetして作業せず、Fix 1完了後の**実際のcommit**を起点に独立した全体UI branchを作る。
提案名: `agent/skin-author-workflow-r1`。既存同名branchがある場合は所有者確認なしに再利用しない。

Slice Consoleは対象checkpointのコードを比較・pinして使う。古い制作UI branchに存在しないという理由で、昔のDrive Runnerをもう一つ新設しない。別系譜全体を無差別mergeせず、互換な入口または最小の明示adapterで接続する。

## 4. 全体の道筋と今回の終了点

| 段階 | Authorに増える能力 | 今回の扱い |
|---|---|---|
| P0 保存修正・入口固定 | 正しい保存と、使う版が分かる | 実施／完了済みなら証拠を再利用 |
| P1 印刷recipeの操作 | 機種・ノズル・材料・品質をUIで選び保存できる | 実装 |
| P2 実データ接続 | 選択造形からSupport／sliceを実行できる | 実装 |
| P3 出力・再開 | .gcode.3mf、Preview、別sessionで再開できる | 実装しR1終点とする |
| P4 造形の調整幅拡大 | 2条件切替から、実規則に対応する数値調整へ | R1後の次taskとして列挙、同時に広げない |
| P5 入力形状拡大 | 自作Host一例、自作花一例を同じ流れで使う | 対応境界を検証する別task。万能Host対応としない |

**R1は「既知ベース／既知D6で、制作から印刷ファイルまで一周する版」。自由なHost・花・任意パラメータまで完成したとは呼ばない。**

## 5. P0 — 保存修正と作業入口

付録Aは未完了のFix 1を開始するための全指示。新しい完了commit探しは不要。

- 2.4 mm結果の`mesh_archive`集計を実NPZに合わせる。
- 2.2/2.4 mmの構造semantic digestを既存#36の同一定義へ統一する。
- 元archive、placements、anchors、中心線、実meshは保持する。
- 重い4条件再生成を要求せず、保存geometryと限定tests、実browser save/reopenで閉じる。
- 既に別担当が同Fixに着手している場合は重複実装せず、固定checkpointを受け取る。その間P1の非競合部分を進めてよい。

本laneの新文書は、既存CURRENTを必要範囲で拡張するか、短い`SKIN_AUTHOR_WORKFLOW_CURRENT.md`から既存へリンクする。全laneのCURRENT書換えを行わない。
CURRENTには、版、実際のbase/runtime、起動方法、active task、未完了、次の操作、evidence、branch/publication状態だけを見えるようにする。

## 6. P1 — 印刷条件UI

### 画面

制作画面に「印刷準備」を接続する。現在編集中／比較表示中の結果ではなく、**明示選択した造形snapshot**を対象とする。
対象サムネイル、花数、枝径、対象版を表示する。テストで残った`selected`をAuthor ACCEPT扱いしない。

基本設定:
- 機種: A1 mini／A1。
- ノズル径: 実インストールの対応profileから選択。0.4 mmを基準、追加径は実profile／fixture検証したものを有効化。
- 作品filament profile: PLA／PETGを初期対象にする。名称だけでなく実profileと版を保持。
- Support本体の材料、接触面（interface）の材料を別欄にする。
- plate、process/品質preset、層高、Support方式、接地条件。
- preset保存／読込、既定に戻す、前の設定との違い。

R1の操作受入は、A1とA1 mini、PLAとPETG、0.4 mmと少なくとも追加1径の**実際に通せる選択経路**を対象とする。追加径は実導入profileを確認して決める。確認できない値を作らない。
別材料Supportは小さいfixtureで材料割当が証明できた組合せだけ有効化する。未対応を「選べるが無視する」実装にしない。範囲不足は該当項目未完了として明示する。

### 条件の権威

UI choice → normalized print recipe → actual profile snapshots／overrides → resolved settings／G-code commandsを区別する。
一般のprofile継承エンジンは新設せず、既存Bambu処理・#32等の対応済み抽出を使う。

- profileの名前変更だけで機種／ノズル／材料を変えたことにしない。
- 過去案件の240℃などを材料一般の定数にしない。
- node/flow/nozzle等が変わっても作品geometryを自動で太らせない。
- incompatible、profile不足、未解決、未対応は具体的な理由と共に停止する。
- project filament indexと物理AMS slotは分離する。このUIで送信時スロットを固定しない。
- slicerのversionとresource／profileのidentityをjobへ結び付ける。最新への自動upgradeはしない。
- UIに表示しない暗黙defaultも、結果の再確認に必要なものは保存する。

## 7. P2 — 実geometryからSlice Consoleへ

### 7A. 制作geometryと印刷入力

作品として印刷する花・Permanent internalを明示する。表示用Hostを自動で印刷solidへ含めない。
sourceからactual meshを作り、units・ID/provenance・array／boundsを照合する。
既存の実証済みmesh/native経路を再利用する。STL化による不必要な展開や修復を当然視せず、選んだ経路の適用範囲を確認する。

現在の単一STL契約を複数ファイルや手製projectで黙って迂回しない。必要な複数part・materialの接続は、対象native/adapterの実証範囲として扱う。`native_saved=true`等を都合で偽装しない。

### 7B. 配置

制作座標→印刷座標の変換をprint recipeへ保存。花／枝を個別に床へ落とさない。相対位置は保持。
実geometryのbounds、plateの実制約、Support、brim、prime towerの領域を確認する。
機種を変えても自動縮小しない。床下geometryの無言clipping、根元延長、自動補強も禁止。
必要なtranslation/rotationは、目的・実変換量・適用後previewを表示したAuthor操作として行う。
MINILの床問題を解決するtaskに転用しない。共通UIは問題を表示・記録する。

### 7C. 実行契約

`選択snapshot + print recipe + profile/engine/input locks → SLICE_JOB → pinned Slice Console executor → isolated attempt → result`

既存JobSpecのcandidate、inputs、profiles、output、locks、CLIとinput_mode等を再利用する。新しい万能orchestrator、slicer、G-code parserを先に作らない。
通常UIから実行するときに、AuthorによるJSON編集・script探し・Astraへの再指示は不要とする。

- 明示クリックでのみ実行。保存、restore、設定変更、page再表示で自動sliceしない。
- 長時間処理はtask-specific progress／logs／Cancelを表示し、UIを固めない。
- 正常完了前のpartial outputを有効結果へ付け替えない。
- cancel／失敗でも元project・前の完成resultを保持。
- 古いjobが後から完了しても、新しく選択した案を上書きしない。
- 監視失敗とnative実行失敗を区別し、traceback等を保存する。他processをkillしない。
- 同じ実行に対する連打・再接続の二重launchを防ぐ。既存のrequest policyを勝手に変更しない。
- 完成済みの**そのattempt**の再表示は可。未実装の汎用cache／REUSEや、request key一致だけでの自動再利用は追加しない。
- execution-env collector等の別研究を一括完成することを、このUIの前提にしない。ただし既存の必須guardは外さない。未知項目は未知として残す。

### 7D. Support

R1は適用可能なBambu native Support生成を、指定条件のslice経路に接続する。
SKINのPermanent枝と取り外すSupportを、データ・表示・材料割当で区別する。
Supportがslicer内toolpathとしてのみ生成される場合、独立したSupport meshを保存済みと主張しない。
既存のauthored Supportは、完全にbindされた入力として扱える場合の別モード。新造形への自動流用は不可。

この全体担当は、今回MINILのRisk A/Bを直す設計・試行は行わない。現在の作品が持つ確認済み不成立を、UI合格のために非表示にしない。
一般warning、限定screenの候補、確認済み不成立、未検査を分ける。AIに毎回文章を読ませて色を決めさせず、判定可能なものは明示規則で表示する。

## 8. P3 — package、結果表示、保存再開

### 8A. packageが今回の重要な接続境界

現在のSlice Console package経路は**G-codeだけでなく元3MF設定**を必要とする。
`.skincreation`には、それだけで今回のnative Bambu project metadataが保証されているわけではない。

よって、新しい選択造形・今回の機種／ノズル／材料と対応したnative contextを、既存の検証済み経路で用意してbindする。
別作品やsmoke用3MFのprinter/filament設定をコピーして、今回のsliceと一致したことにしない。
必要なsource metadataが得られないときは、この接続だけのHOLDを出す。CRCや拡張子が通るだけのcontainerを作って成功扱いしない。

既存のnative sliced 3MF→sliced-only routeと、completed standalone G-code＋matching context→package routeは区別して記録する。

### 8B. 出力

- completed standalone G-codeと`.gcode.3mf`を別identityで保持。
- DEFLATE等の既存container圧縮は再利用し、展開後のG-code bytes/SHAが**同じrunの**standaloneと完全一致することを確認。
- package CRC、layer/終端/必要な設定・metadataを既存対応範囲で検査する。
- 機種、ノズル、project材料、層、時間、材料量、warningがBambu Studio Previewで確認できること。
- Previewは意図しない再sliceを誘発しないこと。保存G-codeを変えて見た目だけ直さない。
- 独立slice間のraw G-code同一性を普遍的に要求しない。入力・条件の同定、同一run内のpayload完全性、再slice時の必要な差分を区別する。
- UIでは「出力完了／要確認／診断用／未完了」を表示し、software結果からPrint GOを自動付与しない。
- G-codeの欠落、古いresult、context不一致、known hard blockerがある結果は通常の印刷候補にしない。必要なら診断用artifactとして別表示。

### 8C. 保存

geometry snapshot、print recipe、attempt/result/packageへの対応を保存する。
巨大G-codeを履歴ごとに`.skincreation`へ複製しない。大容量artifactは適切な隣接bundle/参照＋hashで保持し、移動後も明示的に再bindできること。

- source/recipeと成果物のidentityを結ぶ。selected/compare/履歴cursorを混同しない。
- 復元時に元作品がない／profile版違い／artifact欠落なら、どこが使えないかを表示。
- 既存結果の閲覧と再sliceの可能性を別状態にする。
- 壊れたarchiveを拒否し、現在の有効projectを保持。
- saved codeを自動実行しない。ローカル生成APIはloopbackの必要操作だけを公開し、任意shell実行口を追加しない。
- 一度の明示setupと、通常の起動／制作を分ける。既存5188/5189や他サービスを無断停止せず、検証用は独立port。

## 9. 変更と失効の最小表

| 変更 | 保持するもの | 再計算／失効するもの |
|---|---|---|
| カメラ・表示 | 全geometry／印刷結果 | 表示だけ |
| 枝径のみ | 花配置、花実寸、anchor、対応中心線 | 枝mesh、接触evidence、Support／slice／package |
| 花倍率・配置 | 元Host、元D6 | 配置、自然接触、花依存枝、その下流 |
| 機種・ノズル・材料・品質・Support | 選択造形snapshot | 必要な配置確認、Support／toolpath、結果package |
| 印刷配置 | 制作座標の元geometry | 印刷geometry、Support／slice／package |
| 圧縮／配送containerのみ | 検証済みG-code bytes | packageとpackage検査 |

実装は既存の履歴・revision仕組みを拡張する。全projectを毎回失効させることも、staleを最新扱いすることも避ける。

## 10. MINIL担当との受渡し

新しい通信基盤は作らない。既存manifest／recipe／短いhandoffで十分。

MINILから受け取れると有用なもの:
- candidate/snapshotのidentity、source/geometryのhash、座標系とplate変換。
- 使用したengine/profile、作品／Support／interfaceの割当。
- job/attempt、入力表現、完成result、G-code/packageのhash。
- 修正scriptと適用条件、元の失敗と改善の測定evidence。
- software、fabrication、Physical、Author、Print GOの各状態。

具体的なartifactを固定して受け取る。結果がまだなければ全体UIを止めない。
全体担当が提供するのは、UI/adapterの固定版、入力契約、testsと操作手順。
MINILは安定した従来routeを使い続けてよく、新UIへの乗換えを強制しない。

共通化する前に区別する:
- **そのまま共通化しやすい処理**: input/setting binding、保存検査、失効、実行記録、完了G-codeのpackage。
- **適用条件のある処理**: Support preset、placement rule、局所enforcer生成、mesh化例外。
- **案件に残すもの**: MINILの特定ID/Zのpatch、Authorの造形判断、実機結果。

固定IDを埋め込んだ処理を別名にして汎用と呼ばない。必要な場合のみ、第二の適合ケースまたは小さい回帰で適用範囲を証明する。

## 11. 実証計画 — MINILの納品試行を重複させない

### 最初の確認

既存4条件のブラウザ生成・fresh replay証拠は保持する。Fix 1で全geometry生成をやり直さない。

### 小さい独立fixture

UI選択からnative結果までを確認する。可能な組合せを全部検証済みと見せない。
最低限、A1/A1 miniの差、PLA/PETGの差、追加ノズル径、対応する別材料Supportを切り分けて確認する。
事前にfixture／profile／engine／attempt予定を短いvalidation planへ固定し、同一条件は原則一回。failed runを残したまま無条件retryしない。

### 実作品規模の縦通し

小さいfixtureだけでR1全体完了にしない。
基準候補は、納品archiveの**小さい花g=11/15・枝2.2 mm**をread-onlyに複製したtooling検証用snapshot。これはMINIB/Cそのものでも、今回MINIL納品候補でもない。
候補のsource identitiesと実profileに基づいて、支持／bounds等の確認を行う。印刷成立を先に仮定しない。

このtooling snapshotで選択→profile→Support/slice→package→Preview→保存復元を代表1条件通す。fixture通過後、exact input/profile/engine、有限のtime/resource/attempt上限を記録してから実行する。
MINIL担当と同じinput＋settingsのfull sliceは別に走らせない。同一データを検証に使う必要がある場合は完成済み同一attemptのevidenceを受け取り、実行せず残りのUI／bind／package段だけ試験する。
resource競合時は重い試験を保留し、非競合実装を進める。完了前なのにR1全体PASSにはしない。

### 成功と限界

- 実行・package・Previewの成立を示す。Physical PASSはこのlaneの受入条件にしない。
- 確認済みの局所不成立がある場合は診断用出力までを報告し、fabrication readinessはHOLD。
- 上記の成果が不足しているとき、fake CLI/synthetic testsだけで「自分で印刷データまで作れる」と報告しない。
- UIの変更、save/reopen、stale結果拒否は実browser操作でも確認する。
- runtime dependency不足やSource mismatchと、作品の設計上のriskを別に報告する。

## 12. R1完了条件

1. 正しい版を一つの起動入口から開ける。通常操作にLLM／API key／chat履歴／手動JSON編集を要しない。
2. 保存Fix 1が実物・限定tests・fresh reopenで閉じている。
3. 既存の4条件生成・比較・Undo/Redo・保存が壊れていない。
4. 機種、ノズル、材料、Support/interface、品質を実profileへ結び、実行結果と照合できる。
5. 選択造形と印刷配置を誤らずSlice Consoleへ渡せる。
6. 代表の実作品規模caseを、Support/sliceと`.gcode.3mf`／Bambu Previewまで通す証拠がある。
7. 不適合・欠落・誤hash・stale・キャンセル・失敗が有効projectやcompleted結果を壊さない。
8. 保存→別folder→fresh sessionで、造形・印刷recipe・対応resultを再開できる。再読込だけで再sliceしない。
9. MINILや他jobのsource／geometry／既定profile／processを無断で変更していない。
10. 対応範囲、未対応、known risk、起動と操作方法、正確なruntime/evidence/publication状態が記録されている。

STOP: **SKIN AUTHOR WORKFLOW R1 — AUTHOR OPERATION REVIEW READY**

途中checkpointがPASSしたら次の事前定義stageへ進む。毎回同じ着手許可を取り直さない。
ただし人の造形判断、新規のgeometry変更、対象外profile／engine、他担当asset変更、Print GOは別判断。
現実のblockerがある場合はその段だけBOUNDED HOLDにし、できた機能・未完了・最小の次作業を返す。

## 13. 成果物と更新先

以下は**今回の出力先案**であり、既存の完了taskを探す指示ではない。既存の相当文書があれば重複作成しない。

- `docs/tasks/SKIN_AUTHOR_WORKFLOW_R1.md`: この仕様とstage別計画。
- task-local CURRENT: owner、base、runtime、port、active stage、blocker、next、evidence。
- `docs/evidence/skin-author-workflow-r1/REPORT.md`: Author向け起動・操作・対応表・限界。
- 同folderの入力/設定lock、stage別tests、browser証拠、完成resultとpackage identity。
- 修正版`.skincreation`、印刷preset、移動可能なproject/artifactのまとまり。
- 検証用`.gcode.3mf`とpackage検査記録。大容量はGit本文へ入れずDrive artifactへ。
- 変更前後で残った通常AI介入、code/manual edits、再生成回数、生成/描画/保存時間の実測。

実装前にtask文書を自分のbranchへ保存し、実物のcommitだけをCURRENTへ記録する。
通常commitは可。今回の引継ぎはpush・main merge・deployの新しい許可ではない。GitHub未公開なら未公開を明示し、docs/code/evidenceのbundleと固定local checkpointを次担当が受け取れるようにする。

## 14. R1後に残す次の作業 — 今回混ぜない

- 花倍率、大小分布、密度／配置規則、枝のまとまり等を、実生成規則に対応するUIへ段階拡張する。
- 入力を変更した最初の具体例で、同じコード＋recipeによる生成を実証する。
- カスタムHostは、Host依存core／domain／corridor／rootの再生成能力を確認してから対応。106 coreの無検証流用は禁止。
- カスタム花は、原点・実寸・向き・back attachmentを明示する。見た目のmesh差替えだけで接続済みにしない。
- 操作を妨げる実測箇所だけ表示／計算を軽量化する。previewと印刷geometryを分け、軽量化を原本へのdecimationにしない。
- 実printの学びを適用条件付きpreset／recipeへ戻す。今回のMINILの成否を全SKINへ一般化しない。

## 15. Forbidden

MINILの納品geometry／Support patch／actual job／印刷判断への横入り、旧作品の原本変更、同一jobの盲目的再slice、他担当process停止、任意shell公開、archive code自動実行、secret/credential操作、reset/rebase/force push/clean、稼働worktreeの整理、旧Large専用patchのmini自動転用、#27 MSTによるR4代替、架空のFix完了commit、test PASSからのPrint GO自動昇格。

**technical PASS ≠ fabrication PASS ≠ physical PASS ≠ Author ACCEPT ≠ Print GO ≠ Production**

## 16. 実物入口

- 規約: https://github.com/satw-jp/katachi/blob/main/AGENTS.md
- Protocol: https://github.com/satw-jp/katachi/blob/main/docs/TEAM_PROTOCOL_CORE.md
- SKIN handoff: https://github.com/satw-jp/katachi/blob/main/docs/status/SKIN_THREAD_HANDOFF_CURRENT.md
- Slice Console CURRENT: https://github.com/satw-jp/katachi/blob/main/tools/slice-console/CURRENT.md
- Slice Console README: https://github.com/satw-jp/katachi/blob/main/tools/slice-console/README.md
- Creation CURRENT: https://drive.google.com/file/d/1f8_vDHTs-KP3SQnFkLGHVTaklw7qs4ip/view
- Creation task: https://drive.google.com/file/d/1Ad8QGE819YyKULF_-NXiYpUWZ-yvSFJY/view
- Creation REPORT: https://drive.google.com/file/d/1uEye7N1KT_WSUz7R7PNkGaWMP54wq4Ub/view
- Original archive: https://drive.google.com/file/d/1Mb1UfN9rJlpdbHrZsxLQy5x8AZvQSoJM/view
- Final browser evidence: https://drive.google.com/file/d/1HTA2E7UJJBKwrJmOV4jCRpOinVtfMBr6/view

---

# 付録A — 保存メタデータFix 1の既存指示全文

以下は既存の指示書を同梱したもの。発行日や「完了未確認」は元記録を保持する。
競合時は、本書本文の最新の担当分離を優先する。既存完了／作業中が確認できれば重複実装しない。

# SKIN Creation UI v0 — 保存メタデータ Fix 1

発行: 2026-09-30
状態: IMPLEMENTATION INSTRUCTION / COMPLETION NOT VERIFIED
Repository: satw-jp/katachi
対象: 制作UI v0の保存メタデータ・digest・保存復元の限定修正

この文書は、このチャットで既に指示したFix 1を実行側へ渡すためにまとめたものです。完成commitや既存GitHub taskの所在を示す文書ではありません。
以下を新task文書として保存して着手してください。「Fix 1完了checkpointが既に存在すること」を開始条件にしません。

## 0. 目的と既存成果

4条件の実生成、比較、Undo/Redo、保存、fresh reopen、両花倍率の再生成一致という既存成果を保持します。
問題は2.4 mm案の保存メタデータ2点です。geometry・生成規則の再設計はしません。
本FixはSupport、Runner、印刷profile、slice、G-code、Print GOのtaskではありません。

## 1. Read first / base / 作業境界

Read first:
- AGENTS.md
- docs/TEAM_PROTOCOL_CORE.md
- docs/tasks/SKIN_CREATION_UI_V0.md
- docs/status/SKIN_CREATION_CURRENT.md
- docs/evidence/skin-creation-ui-v0/REPORT.md
- 本文書

確認済みとして報告された元branch:
`agent/skin-creation-ui-v0`

出発点の納品HEAD:
`6fd5beddf844b3647b88eaffae65ea326e4d6337`

元の最終runtime（完成Fixではない）:
`7a9ee03e220976aa3fc473ad51a7bcb15020960b`

推奨作業branch:
`agent/skin-creation-ui-v0-metadata-fix1`

元HEADを起点に新しい独立worktreeで作業します。元branch・稼働中5188/5189サービス・他jobを変更/停止しません。
branchが既に存在する場合は所有者・HEAD・dirty状態を確認し、上書きしません。対象HEADが同じローカルrepositoryに存在すれば、remoteで未公開であることだけを理由に停止しません。
新branchにこの仕様を `docs/tasks/SKIN_CREATION_UI_V0_METADATA_FIX1.md` として保存します。このpathは今回作成する出力先であり、既存文書の所在ではありません。

## 2. Exact input / evidence

元納品archive（上書き禁止）:
`docs/evidence/skin-creation-ui-v0/author-project.skincreation`

元worktreeの報告path:
`J:/My Drive/codex/2026-09-22/skin-repo-satw-jp-katachi-task/work/skin-creation-ui-v0`

Archive:
- bytes: `114117140`
- SHA-256: `654535f9bc4422bebfe965cf5fa936ca7b67568696ee685a650cf17c91bba0d9`
- Drive: https://drive.google.com/file/d/1Mb1UfN9rJlpdbHrZsxLQy5x8AZvQSoJM/view

元REPORT:
https://drive.google.com/file/d/1uEye7N1KT_WSUz7R7PNkGaWMP54wq4Ub/view

元の最終ブラウザ証拠:
https://drive.google.com/file/d/1HTA2E7UJJBKwrJmOV4jCRpOinVtfMBr6/view

前回read-only監査記録:
`SKIN_CREATION_UI_V0_READONLY_REVIEW_20260930.json`

この監査JSONを取得できなくても、この文書の仕様・数値と元archiveで着手できます。監査JSONや完成Fix commitの探索を新しい必須gateにしません。

## 3. 修正A — mesh_archive集計値を実NPZへ一致させる

対象:
`STRUCTURE.json / mesh_archive / vertex_count, triangle_count`

2.4 mm生成では実meshが更新される一方、aggregate countsが2.2 mm baselineのまま残っています。

| 花倍率 | 枝径 | 旧記録の頂点数 | 実NPZ頂点数 | 旧記録の面数 | 実NPZ面数 |
|---|---:|---:|---:|---:|---:|
| 1 | 2.4 | 1,110,273 | 1,114,730 | 2,203,938 | 2,212,936 |
| 11/15 | 2.4 | 1,663,967 | 1,668,601 | 3,304,054 | 3,313,074 |

元archive code snapshotでの入口:
`code/engine.py` の `generate()`。
`dict(baseline, members=..., diameter_main_mm=..., structure_semantic_sha256=...)`
で保存する経路を確認してください。worktreeでは `tools/skin_creation/` の対応実装を使います。

要求:
- 実際に保存したMEMBER_MESHES.npzの配列から集計する。
- 表の期待値を処理内へhard-codeしない。
- member IDs / offsets / vertex・face rangesと実配列の整合を検証する。
- 新規生成結果のpublish前と、通常のarchive restore時に整合を確認する。
- 対象は二つの2.4 mm条件と、それぞれの再生成duplicateを含む保存内全result。
- 正しい2.2 mm案は同じ検証を通し、変更不要のmetadataをむやみに変更しない。

## 4. 修正B — 構造digest定義を統一する

対象:
`STRUCTURE.json / structure_semantic_sha256`
および、この値を参照するresultの `meshHash` 等。

現状:
- 2.2 mm: #36由来のfull sorted-member semantic digest。
- 2.4 mm: `core.digest_json([m['mesh_geometry_sha256'] for m in members])`。

同じ項目名で意味が異なります。

要求:
- 2.2 mmで使用中の#36 semantic projection・順序・数値表現・canonical serializationをそのまま共通処理として再利用する。
- 2.4 mmも同じ意味の構造digestを算出する。
- 定義名・版を明示する場合はhash対象外のmetadataとして記録し、既存baseline hashを変えない。
- mesh一覧だけのdigestを残す場合は別項目で意味を明示する。
- 全result参照を修正版のdigestへ整合させる。旧digestは必要ならlegacy provenanceとして保持するが、新しい構造digestと同一扱いしない。
- 単に期待hash文字列へ置き換えない。実member recordsから再計算する。

同じ定義での期待値:

| 花倍率 | 枝径 | 構造semantic SHA-256 |
|---|---:|---|
| 1 | 2.2 | `ed07e2e20226accbaf920e41e568ab74d9d3159c9ae32a53a5bde368c44014a4` |
| 1 | 2.4 | `c354bc8dda74c21252777cb19e0a37b2578cc00e9ec420af8bb29956b3c8043f` |
| 11/15 | 2.2 | `f0c2ddaaa455de11435319287fa73b49e6675d2541052c8f2eed48d7f1b9fea4` |
| 11/15 | 2.4 | `b3ae8984c151f32ae9cf1671fe1efb208b0e9c9c6459c755c4a05c0a24b5039f` |

集計情報を直すためだけに#36のhash定義全体を再設計しません。

## 5. 保存済み結果の限定修正

元archiveを検証してから、別の出力へ修正版を作成します。

変更禁止:
- 元Host / D6 / distribution / seed / placement recipe
- flower count / positions / orientations / scales / anchors
- topology / IDs / parent-target / centerline / diameter・taper geometry
- MEMBER_MESHES.npzのbytesと各member geometry
- 元archiveと旧evidence

変更可能:
- 誤ったmesh集計値
- 構造digestと、それを参照する記録
- 明示的な保存/検証/変換version、manifestの依存hash・サイズ
- 新しいtask / tests / evidence

元の輸送hash・payload hash・member mesh整合を確認したうえで、既知の旧形式に限定して変換します。破損archiveのhashを再計算して正当化しません。
変換元archive SHA、適用したFix、旧→新digest対応を保存します。通常restoreは未修正/不正なmetadataを黙って受け入れず、現在の有効projectを保持します。

保存内のコードは実行しません。元geometryの生成由来と、新しいserializer/validatorのコード版を区別します。メタデータ修正しただけの結果を「Fix1コードで全生成済み」と報告しません。

NPZはbytesをそのまま保持します。再圧縮・再保存による不要な変更を避けます。
修正後はJSON/manifest/archiveのhashが変わってよい一方、geometry・placement・anchor・member meshが不変であることを検証します。

history、cursor、compare、selected、result IDsと各案の対応を保持します。不要な候補やRedo tailの削除で整合を取らないでください。

## 6. 限定tests / done criteria

1. 4条件の保存済みgeometryを読み、mesh_archive集計・member ID/rangesが実配列と一致する。
2. 上記4構造digestが既存#36定義で再計算一致する。fresh duplicateも対応する元resultと一致する。
3. 同一meshでもparent/target等、既存semantic定義に含む構造情報が変われば構造digestが変わる。
4. stale count、誤hash、壊れたmember range・参照を通常restoreで拒否し、有効projectを保持する。
5. 既存generate()の修正済み保存経路を小さいfixtureで通す。納品JSONだけの手修正では完了にしない。
6. 元archive前後SHAが不変。入力・placements・anchors・NPZ・各member meshも不変。
7. 修正版を実ブラウザで開く → 保存 → fresh sessionで再読込。比較・選択・履歴・Undo/Redoを確認する。
8. 変更境界に必要なfocused tests / build / diff checkを実施する。

全4条件のflower/contact/structure生成や重い接触監査の再実行は不要です。保存済みgeometryと小さいfixtureで閉じます。
元の実ブラウザ4条件・fresh generation証拠は、旧runtimeに結び付いた証拠として保持し、今回再実行した試験とは区別します。
テスト用サービスは別の空きloopback portを使う等、稼働中のAuthor環境を止めない方法にします。

## 7. Outputs / checkpoint

新branchで通常commitし、以下を記録します。pushはしません。

- `docs/tasks/SKIN_CREATION_UI_V0_METADATA_FIX1.md`
- `docs/evidence/skin-creation-ui-v0/FIX1_REPORT.md`
- `docs/evidence/skin-creation-ui-v0/FIX1_COMPARISON.json`
- 修正版 `author-project-fix1.skincreation`（大容量artifact。Gitへ直接追加しない）
- 元→修正版archiveのbytes/SHAと、変更ファイルのallowlist
- geometry不変、メタデータ変更、限定tests、実ブラウザsave/reopen証拠
- branch / base / testedImplementationHead / evidenceHead
- task-local CURRENTへの正確なcheckpointと残る制限

上記は今回作る出力名であり、既に存在する成果物・完了commitの指定ではありません。
SHAを本文に追記するためだけのcommit loopは不要です。

## 8. HOLD解除と印刷UIへの接続

修正2点と上記限定testsがすべてPASSしたら、
`SKIN CREATION UI V0 — METADATA FIX1 TECHNICAL CHECKS PASS`
を途中checkpointとして保存します。

ここで得られた実際のcommitを、既に指示済みのSKIN Print Preparation UI v0の出発点にします。新しい印刷準備用branchをそのcommitから作り、既存の指定範囲内で続行して構いません。存在しない「事前のFix1完了commit」を再度探索したり、同じ着手許可を取り直したりする必要はありません。

これは限定された前提条件の機械的成立を確認するもので、Authorの作品採用、Print GO、Physical PASSや全体完了をworkerが自認する許可ではありません。

Fix1中にsource不一致、geometry変更の必要、hash定義の不明点等が判明した場合だけ、exact file/field/actual/expectedを保存してBOUNDED HOLDとします。新たな広範な棚卸し・geometry修正へ展開しません。

## 9. Forbidden

本Fix1段階でSupport生成、Runner改修、slice、STL/3MF/G-code出力、printer send/printをしない。
main merge、push、force push、reset、rebase、clean、他worktree整理・稼働process停止をしない。
元作品のmetadataを後付けで改変しない。
完了していないFix1を完了済みと報告しない。
通常の読込や確認だけで重い生成・sliceを始めない。
