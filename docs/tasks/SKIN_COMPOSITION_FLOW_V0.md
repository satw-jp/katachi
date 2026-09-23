# SKIN COMPOSITION FLOW V0 — MOCOMOCO → 花 → 枝 → 保存復元

Date: 2026-09-23 JST
Owner / design / scope: SOL
Implementation / browser operation / tests: LUNA
Status: **READY FOR LUNA — implementation NOT STARTED**
Next gate: **SKIN COMPOSITION FLOW V0 SOL EVIDENCE REVIEW**

## 1. Goalと今回の方針変更

Authorの最新指示:

> 俺が触るのは大変なので例えばルナに mocomoco stlを読み込む 花を配置する 枝を配置する 上記のテストをするみたいなことをやらせたほうが良くない。一旦UIはすごく簡略化して良い。

**部品エディタをAuthorに順番に試させる運用から、LUNAが一つの制作工程を実装・操作・検証し、結果をAuthorへ渡す運用へ変更する。**

今回の完成単位は、実MOCOMOCO STLの読込 → 実D BACKARC花の新規配置 → その配置に対応する共有枝の新規生成 → project保存 → fresh browser復元、を既存SKIN repoの一画面で通すこと。既存機能が不足していれば以下の設計範囲で補う。テスト計画・モック・schemaだけで完了にしない。保存済F2の表示を「花・枝を生成できた」の代用にしない。

この指示は、Issue #26以後の「Authorがv0を手動操作するまで次実装を待つ」条件、および全体CURRENTの旧implementation NONEを**本taskの範囲だけ**上書きする。v0のAuthor ACCEPTを捏造する意味ではない。Transfer Researchの候補1/2も必須の先行taskではなく、本flowに必要な部分だけ参考にする。

操作成立のテストはLUNA、証拠と実装範囲の判定はSOL。Authorには完成した工程の画像と結果を渡し、芸術的価値・作品としての採否はAuthorに残す。R4 / LOEWEの現物・現行候補・Print GOには触れない。

## 2. Baseと作業場所

- repo: `satw-jp/katachi`
- 方針確認checkpoint: main `ecd0e7ae852fb5db565332af1225de78543fa453`。この後の本task文書はmain上の追加指示として読む。
- 新実装base: Authoring v0 Fix 1の**local** commit `1b33b256b2fa82e517bfeb8f251c72f900171f4f`。
- その既存worktree: `J:/My Drive/codex/2026-09-22/skin-repo-satw-jp-katachi-task/work/skin-authoring-research-project-v0`。
- 新branch: `agent/skin-mocomoco-composition-v0`。sandboxで書ける場所に新規・独立worktreeを作る。既存worktreeのcheckout、reset、移動、dirty変更の取り込みは禁止。
- C accepted ancestor: `59ebb3cfb781442a1583509d5e8b5ea40120ff94`。
- AB read-only reuse reference: `87d5225a18dc7a1b8895cc44351db4c000be6261`。

preflightはlocal Git objectとorigin、実際のHEAD、既存branch所有状態を確認するだけ。Fix 1をremoteへpushできていないこと自体で、手元の正しいcommitからの実装を止めない。objectが見つからなければ、その具体的な欠落を記録し、mainへ黙って切り替えない。

最初に `AGENTS.md`、`docs/TEAM_PROTOCOL_CORE.md`、`docs/protocol/PROJECT_AUTHORING_REFERENCE.md`、`docs/status/SKIN_AUTHORING_CURRENT.md`、本task、下記入力lockを読む。他laneの全履歴監査を開始しない。

## 3. 固定した実入力

正確な数値とsource URLは [INPUTS_LOCK.json](skin-composition-flow-v0/INPUTS_LOCK.json)。SOLが原本bytesを取得してhashと下記の幾何計算を確認した。**これは入力準備の証拠であり、新アプリの実行結果ではない。**

| 用途 | 実入力 | 固定値 |
|---|---|---|
| Host | [mocomoco_221104.stl](https://drive.google.com/file/d/1J-72M2eY8nrujwlrpIJNtU0lb47WKrPR/view) | 13,318,784 bytes / 266,374 triangles / SHA `c848ea33eebf4b65ad4386fede4c82a7f1185e921098a5c018135cda1fad6c4e` |
| 花 | [motif_63_D_BACKARC.npz](https://drive.google.com/file/d/1PFsI4DFFbHq4d3UUVGpjEidCv9pspJV4/view) | 617,600 bytes / 32,574 vertices / 65,144 faces / SHA `ddb793d271fda8bd649676381b2deed48580f6192d84169a5032f99a81ca8c8f` |
| 花の元frame | [patch_identity.json](https://drive.google.com/file/d/1DKbym-AAB0QhHBptYc3Mvpuvt9e35WPz/view) | `motifs[id=63]` / 38,916 bytes / SHA `73d046104e38bc95c53805607a9b3ed04ad8634db97cfb049456377647ca4884` |

原本はread-only。上記IDまたは既知の同期コピーを取得し、新task内のasset cacheへ置く。最初に一度hash照合する。全Drive走査、大容量R4完成データの回収、原本書換えは不要。

### Hostの解釈

本開発presetはSOLの明示的解釈として `1 mm/source unit`、右手系・Z-up、scale 1.0を採用する。STLにmmが埋め込まれているという主張ではなく、R4のprint transformとも別。

元座標を保持した上で、sceneへのtranslationだけ `[3.092479705810547, -3.7586593627929688, 196.83554077148438] mm` とし、XY中心／minZ=0へ置く。寸法は約 `188.563820 × 202.730164 × 192.154545 mm`。Hostは花配置の参照面であり、最終作品の充填されたBODYだとは扱わない。

### 花のlocal frameは推測しない

元生成script [build.py](https://drive.google.com/file/d/1YiEExiZIdbx4zsew2Bj-gMx-tSEh-C1x/view) は `v_source = v_local @ F.T + c` を使う。本taskは生成scriptを実行せず、取得済meshに `v_local = (v_source - c) @ F` を適用する。cとFは入力lockの正確な数値を使う。local +Zがfront。PCAやbboxから向きを作り直さない。

SOL確認ではFのdet≈1、roundtrip最大誤差≈1.8e-15 mm。花の全vertices/facesと前後の立体形状を保持する。ブラウザ用binary/JSONへの一度の変換は許可するが、変換script・出力hash・配列対応を残す。FEM生成器の移植、花弁数変更、平面化、別の球・線による代替花は禁止。

裏面接続anchorはlocal Z軸を下から最初に交差する元面の点 `[0,0,-1.4075314471755909] mm`。元face 37194とbarycentricはlockにある。これはSOLが定めた**幾何学的な接続基準点**であり、溶着・強度の証明ではない。

## 4. Runtime設計 — 最小のComposition mode

既存SKINの新しいComposition modeとして実装する。推奨入口は `/skin-rebuild.html?mode=composition`。通常SKIN / Research v0 modeは保持する。別の独立Viewer、既存画面全体の作り直し、共通kernel新設はしない。

画面は一つのviewportと小さな操作帯に限定:

`MOCOMOCO例を開く / STLを開く → 花を配置 → 枝を配置 → 保存 / 開く`

表示はHost・Flowers・BranchesのON/OFF、段階と実数count、エラーだけを基本にする。数値入力は花数・花scale・枝径の3項目まで。seedや詳細frameはpreset/project内に保存する。Host OFFでも花と枝が同じ画面で確認できること。回転・ズーム・fitは既存camera操作を再利用する。

UIの簡略化はこのmodeのみ。既存FKEI、Researchの`.skinproj`、旧compact fixture検証や通常rendererの意味を変更しない。

### UIとテストが同じ処理を使う

新modeのcommandは概念上 `loadHost`, `placeFlowers`, `buildBranches`, `saveComposition`, `restoreComposition` の5つ。DOM操作と幾何・保存処理を分離し、UIと自動テストから同じ実装を呼ぶ。名前は既存構成に合わせてよい。テストだけ完成stateを注入して、UIも動いたと報告しない。

preset読込はstage 1の原本読込だけを行う。花・枝の完成配列をfixtureから先入れしない。既存R4/F2の完成geometryを開くだけでは今回のGoalを満たさない。

### 再利用する実在箇所と許可境界

- C/Fix1: `src/studies/skin/main.ts`、`renderer.ts`、`rebuild/researchProjectAuthoring.ts` のentry/camera/visibility/状態更新パターン。Research専用径編集は壊さない。
- AB: `externalStlHost.ts` のsource/instance分離、STL解析、surface query。依存する `externalStlHostVolume.ts` / `externalStlHostDiagnostics.ts` と中立的な最小依存は固定checkpointから新branchへ**限定移植可**。同名既存fileは比較してから扱い、出典と変更を記録する。AB全履歴・Support配置法の移植は許可しない。
- C acceptedには `externalStlHost.ts` がないことをSOLが確認している。STLをanalytic metaball Host型へcastして通さない。AB queryはY-up mmなので、Z-up compositionとの基底変換を明示し、座標・法線・距離を一貫して戻す。
- `voronoi.ts` のgraph型、`renderer.ts` のsegment表示は意味が一致する範囲で再利用できる。新compositionのstring IDと旧整数render IDはmappingで分離する。
- `buildSkinProductionV0FromProject` をF2再現や外部Host対応の代用品として呼ばない。本taskの枝recipeは以下に限定する。

## 5. 花配置の決定済みrecipe

初期preset: N=64、flower scale=1.0、seed=20260923、anchor最小間隔12 mm、最大試行8192。これらは**機能確認用**であり、LOEWEの密度・寸法・造形設定ではない。

1. 元STLの有効triangleを元index順で使い、面積に比例してtriangleを選ぶ。固定seedのPRNGは実装とversionを記録する。
2. triangle内を一様barycentric samplingし、source triangle index・barycentric・scene position・geometric normalを保存する。既存pointを手置きしただけのfixtureで代用しない。
3. 既採用anchorとの距離12mm以上を満たす順にN件採用。正の有限area/normalを要求。規定試行で不足なら実数とPARTIALを表示し、複製や架空anchorでNを埋めない。
4. orientationは元triangleのwindingに基づくnormalへ花local +Zを向ける。normalの向きを重心からの方向で勝手に反転しない。向きに問題があれば証拠を残す。接線Xはworld Xをnormalの直交面に射影し、退化時world Yを使う。Y=n×X。twistはv0で0。
5. 花の裏anchor aが採用点pへ来るよう `v_scene = p + Q * (scale * (v_local-a))`。花scaleをHostscaleと自動連動しない。花meshは共有してinstance transformで配置する。
6. instance IDは `flower-0000` 等の安定順序、recipe versionとHost revisionを記録する。

UIのcountは実配置数から表示する。入力64をそのまま成功countにしない。N=32でも新しい配置を実行して変化を検証する。今回、全表面の隙間充填、花同士の非交差・融合、最適密度探索は対象外。

## 6. 枝配置の決定済みrecipe

名称: `inset-relay-mst-v0`。**新compositionの共有枝を作る最小のauthoring原型**。R4/F2の内部構造再現、将来のSKIN標準、支持強度・Host内包の保証にはしない。

- 現在のflower instanceごとに裏anchor `a_i=p_i` とinward relay `q_i=p_i-8*n_i` を作る。
- q_iを安定IDで結ぶEuclidean minimum spanning treeを作る。Prim法、開始nodeはZ最小（同値はID順）、同距離のtieはID順。計算はdouble precision。
- 各q_iから対応flowerのa_iへattachment edgeを1本追加する。treeの開始nodeが全体root。無関係のbed foot、Support、格子を足さない。
- 全枝は正の一定径3.0mmを初期値とし、UIで枝径を変更して再生成できる。recipeのinsetと径はfabrication presetから読まない。
- N>=1のときnode 2N、edge 2N-1、全flower anchorがrootから到達可能であること。N=0は枝生成を明示拒否する。
- connectionはflower ID / graph node IDで保持する。同じ座標というだけで別nodeをmergeしない。attachment終点は同じflowerの変換済anchorと一致させる。
- 枝を線だけでなく径を持つsegmentとして描画し、Hostを消して全体と接続先を見られるようにする。source graphとrender meshを分ける。
- この単純treeは凹形状からはみ出したり、他形状と交差し得る。Host内包、花との接触面積、member融合、強度、除去性は **UNVERIFIED** とし、既存queryで明確なはみ出しが見つかった場合も隠さず記録する。これらをPASSと偽らず、今回は巨大な経路最適化・造形repairを開かない。

roleは `permanent-structure-draft`。Removable Supportはゼロ。作品の印刷適合ではなく、**現在の花配置から枝が作られ、同じprojectへ保存される**ことを今回の機能成立とする。

## 7. State・再実行・保存

Composition stateはHost asset/解釈/transform、flower prototype asset/frame、配置recipeと実instance、branch recipeと実graph、revisionを持つ。旧F2 source snapshotとは別の識別子を持たせる。

- 同じ「花を配置」の再実行は配置setを置換し、旧枝をclear/staleにする。追加を繰り返して倍増させない。
- Host変更は新Hostの読込成功後に置換し、花・枝を無効化。読込失敗時に既存projectを消さない。
- 枝再生成は枝setのみ置換。Host/flowersのhash・位置は不変。
- UIの値変更はpending settingsとして扱い、配置・生成ボタンでcommitする。既存結果のrecipe値だけを書き換えない。current/staleを区別する。
- 旧ResearchのUndo/Redo/save/restoreはそのまま。新modeに高度な履歴UIを足すことは必須ではない。

保存形式は新しい `katachi.skin.composition.v0`、拡張子 `.skincomp` の自己完結package。既存archive/保存utilityを使い、frameworkを増やさない。Host原本bytes、必要なflower assetとframe、recipe、実instance/graph、各hashを含める。花の32,574頂点をN回複製して保存せず、prototype1件+transformsにする。

fresh browserで元のJ: path・前session・LLMなしに再開できること。復元は保存した実stateを読むもので、黙って配置を再抽選しない。schema、asset hash、有限値、正のscale/径、transform、参照ID、graphの整合を検証し、失敗時は現projectを保持する。

印刷用STL/3MF、G-code、SLICE_JOBの出力は今回作らない。packageはauthoring projectであり、print-ready releaseではない。

## 8. LUNAが行う受入テスト

Authorの操作待ちで止まらず、LUNAが以下を実施する。小さな単体試験は任意のsynthetic meshも使えるが、GoalのE2Eは**上記の実MOCOMOCOと実D63**を使う。

| Gate | 必須の確認・結果 |
|---|---|
| T1 Host | 原本hash/bytes/266,374 triangles、source→scene変換と寸法。元bytes不変。空/破損STLを拒否し現state維持 |
| T2 Flowers | N=64と別run N=32を実生成。安定ID・finite transform・固定seed再現、anchorのtriangle/barycentric整合。prototype frame往復/前後形状保持。Hostのframeを変えてもflower physical scaleを暗黙変更しない |
| T3 Branches | 64flowersから128nodes/127edges、rootから64anchors到達、attachment終点とflower backanchorの距離<=1e-4mm、positive diameter、Support 0。N変更後の旧枝残留なし |
| T4 Repeat | 花/枝ボタンの再実行でduplicateなし。枝径のみ変更でHost/flowers不変。Host入替は下流を失効。エラーで直前成功stateを破壊しない |
| T5 Save/reopen | 実packageをdownloadしfresh browser contextへ復元。asset/recipe/instance/graphのidentityが保存前と一致。改変asset/未知schema/不正径または参照を拒否して現state維持 |
| T6 Real browser | 実際の読込・花配置・枝配置・表示切替・保存復元を画面経由で実行。実座標click/hit test、DOM countとstateを照合。画像を確認し、blank canvas・反転・画面外・別stage画像の使い回しをPASSにしない |
| T7 Regression | typecheck/build/diff-check、変更した境界の既存Research v0保存復元smoke。R4全層・全メッシュ・Support再監査はしない |

操作はPlaywright等の既存利用可能なbrowser automationで行う。file inputは`setInputFiles`等で実bytesを渡し、Authorにnative picker操作を依頼しない。通常UIのpickerは明示的user action時のみ開く。単なる`element.click()`や完成JSONの注入だけをUI hit testとして扱わない。UIの数値とruntime dataの双方を検証する。

Node環境の既知起動問題には、既に使える直接テスト経路を記録して使ってよい。別経路のPASSを標準コマンドのPASSに言い換えない。既存`f_map` warningは新規エラーと分け、本flowが描画不能なら具体的に報告する。無関係な環境再構築はしない。

## 9. 完了時の納品と中断耐性

納品は一つのreview入口にまとめる:

- **4段階の実画面**: Hostのみ → 花配置 → Host OFFの花+枝 → fresh restore。追加は裏面接続の近景1枚まで。実画面をそのまま保存し、生成画像で代用しない。
- 実際に保存・再読込した `.skincomp`。
- `RESULT.json`: base/HEAD/branch、入力hash、recipe、実count、各T1-T7のstatus、実行コマンド/環境/exit code、既知warning、未確認項目、画像path。
- 入口README: 一文の結果、開く場所、画像、未確認事項。Authorに長い操作手順を返して完了にしない。

中断に備え最初にtask専用 `RESUME.md` を作り、Host → Flowers → Branches → Save/reopenの各安全checkpointで更新する。現在の段階、保存物、実行済み試験、未実行、次の1操作、実行中processがあればPID/cwdを残す。前段をやり直さず再開できること。残量が厳しければ保存優先でPARTIALとして止めてよいが、PARTIALをGoal完了にしない。

実装branchにtask/current/evidenceとStudy README/manifest更新を残し、通常pushはその新branchのみ許可する。元Fix1 branchのremote保存を勝手に別commitで再構成しない。push失敗はbounded attemptで切り上げ、ローカルcommit、差分、必要なら復元可能なbundleと取得先を記録する。認証・ネットワーク問題で機能開発と証拠保存を繰り返さない。

## 10. 保護範囲とSTOP

R4担当Astraのworktree・running process・現行出力・原本、LOEWE candidate、F2 source、Additional10/7、Runner、machine/profile、Support、slice、printer send、物理印刷は変更・実行しない。GPU長時間生成や大量並列テストを避ける。

No main merge / force push / deploy / common kernel / legacy UI rewrite。今回許可するAB再利用はneutral Host importerの限定移植だけ。FIELD/Production/FKEIの意味変更はしない。

本taskの設計・初期recipeはSOLの新しい判断であり、Researchで証明済みの汎用構造法という主張ではない。

最終STOP: **SKIN COMPOSITION FLOW V0 SOL EVIDENCE REVIEW**。

LUNAは「Authorがまず古いv0を触る必要がある」で止まらない。実装と実ブラウザ試験を通した結果、または保存済みの具体的PARTIAL/BLOCKEDをSOLへ返す。software flow PASS、元Research再現、Author artistic ACCEPT、physical PASS、Print GOを区別する。
