# MINI_A Blender 操作系の再利用可能アドオン化 v0 — Sol 専用タスク

**状態：READY FOR NEW SOL / IMPLEMENTATION NOT STARTED（この文書の登録時点）**  
**範囲：Blender操作系・GUI・復元性・再利用性のみ。造形／fabricationの改修は禁止。**  
**Decision owner：Author。実装：新規Sol。レビュー：Author（必要ならChatGPTによる技術レビュー）。**  
**起点：** `archive/minia-editor-optimizer-20261010` の **`c75d4b0adcf04b0ad8bde7810dc906e72c36e948`**。  
**作業ブランチ：** `agent/minia-blender-addon-portability-v0`（アーカイブから分岐。元アーカイブは固定）。

## 0. Authorの決定と境界

Astraには **MINI_Aの造形・印刷データ作成** を別途担当させている。**このタスクはAstraが製造形状／G-code／print packageを作り終えたかどうかの再判定、差し替え、再生成をしない。** Astra側の実際の成果物・最新gateは同担当のCURRENT／handoffを優先する。本タスクの履歴的な旧MINI_A成功packageやV1/V2は**操作系復元の参照**であり、最新造形候補のauthorityにしない。

今回残したい価値は、BlenderでAuthorが実際に使った**選択・追加線・途中点・再着色・4画面・clip・区間削除・参照保護・STOP/復旧**と、必要な場合に別途起動する**探索GUI／検証済みRUNを開く機能**。後日ほかのMINI_A作業にも再利用できるよう、インストール可能なBlender add-on/extensionと最小の外部補助ツールへ切り出す。

**作品の新しい優先順位（Authorの観察）：外周の花が印刷・Support除去後に残ること。内部の乱れ／糸引き／色の赤は、それだけで修正必須としない。** この情報はGUI文言と評価の限界へ反映する。ただし、写真から破損IDを確定したり、評価式・製造形状を勝手に変更しない。

## 1. 最初に読む authority と証拠（必要部分だけ）

1. [AGENTS.md](../../AGENTS.md)、[TEAM_PROTOCOL_CORE](../TEAM_PROTOCOL_CORE.md)。本taskの保護範囲。
2. **固定した原本アーカイブ**：
   - [README](https://github.com/satw-jp/katachi/blob/c75d4b0/tools/minia_author_workspace/README.md)
   - [USER_GUIDE](https://github.com/satw-jp/katachi/blob/c75d4b0/tools/minia_author_workspace/USER_GUIDE.md)
   - [ARCHITECTURE](https://github.com/satw-jp/katachi/blob/c75d4b0/tools/minia_author_workspace/ARCHITECTURE.md)
   - [RESTORE](https://github.com/satw-jp/katachi/blob/c75d4b0/tools/minia_author_workspace/RESTORE.md)
   - [OPTIMIZER](https://github.com/satw-jp/katachi/blob/c75d4b0/tools/minia_author_workspace/OPTIMIZER.md)
   - [HISTORY](https://github.com/satw-jp/katachi/blob/c75d4b0/tools/minia_author_workspace/HISTORY.md)
3. 証拠：
   - [ARCHIVE_REVIEW](https://github.com/satw-jp/katachi/blob/c75d4b0/docs/evidence/minia_author_workspace/ARCHIVE_REVIEW.md)
   - [ARCHIVE_CHECKS](https://github.com/satw-jp/katachi/blob/c75d4b0/docs/evidence/minia_author_workspace/ARCHIVE_CHECKS.json)
   - [SOURCE_SNAPSHOT](https://github.com/satw-jp/katachi/blob/c75d4b0/docs/evidence/minia_author_workspace/SOURCE_SNAPSHOT.json)
   - [DRIVE_ARTIFACTS](https://github.com/satw-jp/katachi/blob/c75d4b0/docs/evidence/minia_author_workspace/DRIVE_ARTIFACTS.json)
   - [RUN_SUMMARIES](https://github.com/satw-jp/katachi/blob/c75d4b0/docs/evidence/minia_author_workspace/RUN_SUMMARIES.json)
   - [MINIA_AUTHOR_WORKSPACE_CURRENT](https://github.com/satw-jp/katachi/blob/c75d4b0/docs/status/MINIA_AUTHOR_WORKSPACE_CURRENT.md)
4. 以前の非製造編集・layerwise V1/V2は `tools/minia_internal_repair` と対応CURRENTを**参考として**扱う。現optimizerの赤とV2の独立保持ルート数は**別評価**であり混同しない。

保存環境：**Windows / Blender 5.2.2 LTS / Blender Python・NumPy・mathutils / NetworkX 3.6.1 / Windows PowerShell + Windows Forms**。GitHubには作品本体、元.blend、host、全graph cache、第三者ZIP、checkpointは同梱されていない。これらはDriveで元SHAと照合する。現場の `J:\\My Drive\\codex\\2026-10-09\\files-pasted-by-the-user-astra\\outputs` は保存当時のパスであり、移設後の固定前提にしない。

## 2. 現状の限界を固定

- アーカイブの内容保存、現行コードの構文検査、ルール8試験はPASS記録あり。ただし**別PCへの再配置／新規installからの実GUI操作／完全な一括再生成は未検証**。
- `.blend`単独ではkeymap、class、handler、overlay等のPython登録が復元されない。`MINIA_LOWER50_BOOTSTRAP.py` と連鎖するruntimeが必要。
- `historical_work/` は**読み取り・比較専用**。過去の生成scriptを順次実行しない。上書き可能な旧scriptや意図的に未修正の構文エラーが存在する。
- `MINIA_AUTO_100_RUN_007.blend` は**現アーカイブの最新検証済み結果**（追加200本、LINK_LIMIT）。変更・上書き・再探索しない。
- 赤は全体graphの支持距離と合流係数に基づくheuristic。**破損確率・強度・積層途中の到達性を示さない。** optimizerの局所花2/3経路も全基部までの独立経路ではない。

## 3. 実装範囲

### A. 依存・起動棚卸し

現行の起動entrypoint／import chain／keymap／operator／panel／draw handler／load_post／timers／PowerShell GUI／相対・絶対pathを**保存原本に対してread-onlyで列挙**する。外部依存の必要性・ライセンス・Blender標準Pythonへの導入法を整理する。

**二つを区別：**
1. Blender側のAuthor編集UI・表示（add-on/extensionの必須対象）。
2. 自動探索のWindows Forms dashboard/optimizer（既存の外部companionとして保持できる。初版でBlender内へ全面移植しない）。

### B. 再利用可能なBlender add-on/extension

Blender 5.2.2 LTS向けの**インストール可能なZIP**を作る。Blender Extension形式等の採用は実環境API・読み込み方法に合わせて決定し、READMEに固定する。

- add-onのregister/unregisterが繰返しても重複class、keymap、handler、timer、draw handlerを残さないこと。
- 同梱したruntimeのimport順・同名module優先順位を決定的にし、旧ファイルを削除／整理して挙動を変えないこと。
- プラグイン有効化だけで作業中の他.blend、Authorの既存Blender設定、他のアドオン、印刷データを変えない。
- 作品データはaddon ZIPへ含めない。Authorが選んだdata root／project manifestをbindし、hash／尺度／座標変換を照合してから使う。無関係な「最新ファイル」へのfallback禁止。
- Macへの転用は将来候補。**Windows / Blender 5.2.2を最初の実測対象**とする。未検証platformを対応済みと書かない。

### C. 既存操作とのパリティ（意味を変えない）

最低限の対象：

- 保護された編集objectを選択し、**2点 `F` で仮線追加**。面の生成はHOLD。
- **`Ctrl+Shift+Alt+A`** で元枝／追加枝の途中点。
- **`Ctrl+Shift+R`** で色更新と、現仕様どおり10mm以上の空き区間の途中点処理。
- 選択点の強調表示、単画面／上・前・横・アクソメの4画面。
- X/Y/Zの0〜100% clip、全ビュー共通反映、傾斜clip、明示的な「表示範囲を反映」。入力callbackごとの重量再生成は禁止。
- 区間の複数選択・削除mask、**花へ直接つながる枝の保護**。承認済みrerouteと通常削除を混同しない。
- `CURRENT / STALE / HOLD` の状態と理由、参照・元点・属性・未知IDの保護、無変更保存・再読込。
- 切り出し時の選択、quadの投影・パン、native clip初期化順など、HISTORYに記録された既知不具合の再発防止。

表示の赤／黄／緑は**従来heuristicの説明を明示**。外周花の保持が優先で、内部の赤や粗さだけでは不良判定をしない。見た目の色変更と評価アルゴリズム変更は分離し、本taskで評価式・閾値・探索規則を変更しない。

### D. Companionと復元

`dashboard.ps1` / `run.ps1` / `stop.ps1` は元のStart/Stop/排他lock、checkpoint、検証済みRUN、USER_STOP、LINK_LIMIT、保存・fresh reopenという契約を保持する。必要ならパス解決・起動方法のみ非破壊にラップする。

- 作品／source／host／cache／NetworkX外部ZIP／checkpointの**取得・再配置手順**をひとつの依存manifestと復元ガイドへ整理する。
- 元Driveの実ファイルに対してSHA照合。欠けたものを黙って空ファイルや別versionへ置換しない。
- 移設先で絶対パスを設定できるが、addonコードを手編集せず再利用可能にする。
- `RUN_007` は既存結果の**read-only open**を基本。探索を自動再開・勝手に増本しない。再開実験が必要になれば後段の別gate。
- Windows PowerShellのUTF-8 BOM、System32の実行パス、実際の必要権限を保持。管理者権限を勝手に要求しない。
- 第三者依存物をZIPに含める前にライセンス・同梱可否を確認。無断再配布不可なら正規入手・ローカル設定方式。

## 4. 禁止／他laneとの分離

**造形・fabrication一切の作業をしない。**

- 既存／新規Permanent・Support・Flower geometryの設計、実材化、mesh編集、3MF/STL/G-code生成、slice、previewでのprint-ready判定、material/profile変更、Send、Print。
- Astraの最新印刷用packageの再生成・修正・gate再判定。Astraの作業checkout・worktree・branch・uncommitted filesへ干渉しない。
- optimizerの候補採用・探索再開・RUN_008生成・作品の200枝追加／削除／置換。**操作試験は隔離したコピー／合成fixtureのみ**。
- 外周花の破損写真を勝手に個体IDへ結び付けること、現在の赤heuristicを物理強度や印刷途中の独立ルートへ昇格すること。
- 巨大作品データ・秘密情報のpublic GitHub追加、main merge／force push／破壊的git操作。
- 既存アーカイブbranchを書き換えること。dirty/unpushed workを消すこと。OS GUI自動操作や本番Blender環境へのアドオンinstallはAuthorの明示許可なしに行わない。

## 5. 検証・受入条件

**既存の動作を勝手に改善・変更することより、元通りの操作が再現できることを優先。**

1. アーカイブの元コード・DriveデータのSHA照合、entrypoint/依存manifest、必要ライセンス一覧。
2. 新しい隔離フォルダ／Blenderの隔離設定でaddon ZIPのinstall・enable・disable・reload・fresh startupに成功（試験できた部分だけPASS）。
3. keymap／handler／draw handlerの重複0、unregister後の残骸0。既存addonsに副作用なし。
4. 合成fixture／**コピーした**作品上でF、点追加、色更新、選択点、1/4画面、clip反映、区間削除と花接続保護、CURRENT/STALE/HOLD、save/reopenの意味が旧操作と一致。
5. 参照破壊や出所不明編集はHOLD、無変更保存は no-op。元RUN_007・baseline・checkpoint・Drive artifactsのhashを前後照合し保持。
6. 作者の実GUI操作・可読性・ショートカット競合・使いやすさは**Author acceptanceまでUNVERIFIED**と記録。headless testsをGUI PASSにしない。
7. 性能：起動時間・編集／clip再評価所要時間・peak memoryを可能な範囲で測り、旧版との比較条件・限界を報告。
8. READMEから、**Blenderインストール済みの別環境で、addon導入→data root設定→既存projectをopen→編集確認→保存/再読込**が実行可能な手順へ整理。未検証段階で「完全再現」宣言をしない。

## 6. 成果物

小さいcode/docsをこのtaskの隔離branchでcommitして、**Draft PRを作るところまで**（main mergeしない）。

- `tools/skin_branch_editor_addon/`：インストール可能なaddonのソース、配布ZIP作成手順。
- `SKIN_BRANCH_EDITOR_<version>.zip`：installable ZIP。バイナリ/作品本体の保存先はDrive、GitHubにhashとlink。GitHubへ巨大ファイルを追加しない。
- `ADDON_INSTALL_AND_RESTORE.md`：導入、Project選択、既知制限、アンインストール／復旧。
- `LEGACY_BEHAVIOR_MATRIX.md`：旧操作→新操作、チェック結果、未確認UI。
- `DEPENDENCY_MANIFEST.json`、`TEST_RESULTS.json`、`RESULT.md`、`CURRENT.md`、必要なhash/evidence links。
- 旧dashboardをcompanionとして残した場合の起動・停止・RUN確認手順とその独立性。

GitHubを技術SSOT、Driveを大容量原本・配布ZIP/evidence保管先にする。

## 7. STOPと次gate

成功なら：

**`STOP: MINIA_BLENDER_ADDON_INSTALLABLE_FOR_AUTHOR_GUI_REVIEW`**

不足があれば、具体的不足と原本を保護して：

**`STOP: MINIA_BLENDER_ADDON_PORTABILITY_HOLD`**

最終報告は、branch/HEAD/dirty状態、PR URL、ZIP/path/SHA、元アーカイブSHA、動作確認対象Blender/Windows、Legacy操作パリティ、欠ける外部依存、実GUI未確認事項、版移設の再現結果、原本不変・`slice=0 / Send=0 / Print=0`、次のAuthor一操作を含める。

**このタスクの終了後、AuthorのGUI受入れまでは「完全再現」や「汎用完成版」と呼ばない。** 探索アルゴリズムの見直し、透明性／外周花の品質評価、造形への適用は別gateとする。
