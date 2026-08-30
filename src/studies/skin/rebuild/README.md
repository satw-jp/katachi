# SKIN REBUILD

## Question

ベース形状を型として、その表面パターン、任意の DryWeb、表裏判定、
印刷時のオーバーハング最下端、向かい合うパターン裏中央からの内部ラティスを、
一つの保存可能・STL出力可能な制作フローへまとめられるか。

## Setup

`/skin-rebuild.html` を開く。入口は元SKINの `main.ts / ui.ts / renderer.ts / style.css` を
直接共有し、上部Project Bar、左右ペイン、下部Status、1/4画面、カメラ・clipping・選択操作を維持する。
Stage 1 Base ShapeとStage 2 Surface Patternは元アプリと同一のDOM、callback、history、recipe、`.fkei`経路である。
上部`Stage 2 Sample`は、元ランタイムでstrict parse / exact fingerprint / atomic restoreできる
12 host ball / 38 coin patchの同梱`.fkei`を開く。

## Observation

### 2026-08-30 — future geometry architecture (design only)

実装を変えず、`docs/architecture/skin-rebuild-future-geometry-architecture.md`へ将来境界を定義した。
BASEはMetaball/SDF、STL/Mesh import、将来sourceを共通Geometry capabilityへ隠蔽し、MOTIFは
Coin/Ring/Flower、一筆Flower、Curve/SVG/Polyline、Customをversioned definitionとして扱う。
Surface distributionは現行randomを保持しつつ`Base → Surface Graph → graph-aware random`を追加可能にする。

NETWORKはNode/Edge topologyとStraight/Curve/Spline/Custom edge geometryを分離し、JUNCTION/MORPHは
平面Motif→がく状transition→stem/networkと、接続方向・本数・強度によるversioned morphを担う。
UI/FKEI/projectはbackend-neutral request/resultだけを共有し、CPUをreference/fallback、BrowserのWebGPUを
optional accelerator、Windows RTX 3080のCUDAを外部adapterとした。CUDA型やbufferはUI/data modelへ入れない。
実機結果後の段階migration gate、backend conformance、FKEI互換、座標不変testまで記述しただけで、runtime、
保存schema、形状出力は変更していない。

### 2026-08-30 — Cloudflare deploy audit (authentication hold)

公式の現行Workers Static Assets / Wrangler資料とWrangler 4.111.0で`wrangler.jsonc`を監査した。
`assets.directory=./dist`は現行構成のまま有効で、production build後の`wrangler deploy --dry-run`は
121 assetsを読み取り成功した。現行`wrangler check`はgeneric config checkではなくalphaの`check startup`
だけなので、deploy dry-runを構成検査に使った。compatibility dateは実機結果待ちのruntime freeze中のため更新しない。

`wrangler whoami --json`が`loggedIn:false`を返したため、指定どおりproduction deployを保留した。
temporary accountへは迂回していない。従って公開URLと公開Web版FKEI Save / Restore実操作も未完了で、
再開条件と実行済みcheckを`DEPLOYMENT.md`へ記録した。形状・UI runtime・保存schemaは変更していない。

### 2026-08-30 — current / future / legacy right-pane inventory

右ペインの既存controlを`RIGHT_PANE_INVENTORY.md`で棚卸しし、REBUILD表示だけを3分類した。
Base Shape、Surface Pattern、FKEI、Geometry / Mesh、最終診断、Print / Exportは`CURRENT`、
Artwork Graph、Dry Web、Spider / integrated networkは`FUTURE`として通常表示を維持する。

補助diagnostic、開発status、過去のprint assembly evidence、凍結実験は削除せず、初期状態を閉じた
`Advanced · Legacy / Research`へまとめた。開けば同じDOMとhandlerが現れ、旧`/skin.html`では従来の
labelとopen状態を維持する。恒久・移行・Legacyのテスト契約を別リストにして重複無しを回帰testで固定した。
実ブラウザではCURRENT 5 stage、FUTURE 3 stage、Legacy 1 shelfを確認し、shelfを実クリックで開閉、
Base / Surface / Graph / Dry Web / Spider / FKEI / 最終診断 / exportの残存とconsole issue 0件を確認した。
形状生成、mesh、判定閾値、座標、保存schemaは変更していない。

### 2026-08-30 — four-phase production navigator

右WORKFLOWの最上部に、常時表示する`← 1 / 4 BASE SHAPE →`型の制作フェーズナビを追加した。
4フェーズは`BASE SHAPE`、`SURFACE PATTERN`、`NETWORK`、`PRINT / EXPORT`で、左右矢印は
既存Stage 1、2、3、6の先頭を開いてスクロールする。端では矢印をdisabledにする。

これは既存8工程を再実装せず、同じDOM、callback、history、Graph / Dry Web / Spider、mesh、診断、
FKEI、export controlへ焦点を移すだけのUI層である。実ブラウザで1→4と4→1を実クリックし、ナビが
右ペイン上部に残ること、Base / Surface / Network / Print controlが残ること、console issue 0件を確認した。
形状・座標・判定・出力値は変更していない。

### 2026-08-30 — legacy JSON controls removed from REBUILD only

上部PROJECTから旧`履歴を書き出す (Export JSON)`と`skin 履歴を読み込む`をSKIN REBUILDに
限って非表示にした。削除対象は既存DOMのmountだけで、内部history journal、Undo / Redo、Shape Recipe、
`.fkei` Open / Save、復元処理とcallbackはそのまま保持する。旧`/skin.html`では同じJSON入出力UIを維持した。

実ブラウザでREBUILD側の旧control 0件、`.fkei Open`／`.fkei Save`／Undo／Redoの残存、旧SKIN側の
JSON export／import残存、両ページのconsole warning/error 0件を確認した。形状生成・判定・修復・出力座標は変更していない。

### 2026-08-30 — Axome camera roll / horizontal print-plate view

左TOOLSの印刷プレート表示付近へ`Axome roll調整`と`水平に戻す`を追加した。現在のAxome
view axisへworld +Zを射影した方向をcamera upの0°とし、XY印刷プレートが画面上で水平になる。
既存Trackballがpositionと`camera.up`を一緒に回した後も、現在のview axisからrollを再計測する。

操作対象は選択中のAxome cameraだけで、Top / Bottom / Front / Back / Left / Rightではdisabledになる。
新しい保存fieldは追加せず、既存editor camera poseの`up`だけを使う。model、print plate実座標、
Shape Recipe、`.fkei`形状、STL / OBJ / 3MF出力へは値を渡さない。

unit testでは0°の水平基準、37°round-trip、Top方向の適用不能を確認した。実ブラウザではAxome
30°→水平0°、Topでdisabled、Axome復帰、旧`/skin.html`でcontrol 0件、console warning/error 0件を確認した。

### 2026-08-30 — Print Test #001 baseline record

最初の実機造形を後から同定できるよう、`PRINT_LOG.md`へsource checkpoint、`.fkei` sourceと
SHA-256、`generatorCommit`、printer／slicer追記欄、外殻から失敗位置までの確認表を固定した。
statusは`printing / result pending`で、結果が入るまで形状生成・判定・修復・出力座標を変更しない。

sampleの`generatorCommit=6f7b36f...`は、artifactが格納されたcheckpoint `1681a1d...`とは
役割が異なる。生成スクリプトは固定SHAではなく生成時の`git rev-parse HEAD`を記録しており、
sampleとscriptは次のcheckpointで初めて追加された。この値は生成時のchecked-out baseを示す一方、
clean working treeの証明ではないため、値を改変せずcheckpointとartifact SHA-256を併記する。

### 2026-08-30 — first printable-export checkpoint

外殻、恒久蜘蛛ラティス、赤面補強、別体print support、工程6〜8のmesh／診断／3MF・STL・OBJ出力、編集可能な
`.fkei`保存までを一つのSKIN REBUILD UIで通せる最初のcheckpoint。作者は3Dプリント用データの出力到達を確認したが、
slicerでの最終確認と実機造形結果はまだ無いため、完成版・印刷成功とは扱わず`printApproval=false`を維持する。

checkpoint直前の検証は、test source typecheck、`test:skin-rebuild`、`test:branching-support`、`test:partition`、
production build（265 modules）がすべて成功した。同梱first-print sampleは59,524 triangles、1 component、closed、
open/non-manifold/winding-inconsistent/degenerate/non-finiteがすべて0。別体supportもclosedで、BODYと同じplate shift後の
Z原点差は0 mm。Stage 2 editable sampleと完成sampleの`.fkei`生成・parse／restoreも成功した。

### 2026-08-30 — v0.90.6 completed `.fkei` save contract alignment

蜘蛛ラティス生成は、深い凹部でPattern裏への直通線が作れない場合、既存蜘蛛Graphの安全な途中点へ接続できる。
この経路は45°以下・全径Base内包・実Graph接続を満たしていたが、保存側だけが記録rootの法線へ古い
`-0.12`以下の直接対向条件を再適用し、同じ完成projectを`lattice print/opposition contract failed`として拒否する場合があった。

保存検査は法線値を有限な計測事実として保持し、各支持claimについて、赤面接点→自Pattern裏→記録された蜘蛛Graph rootが
保存Graph上で実際につながることを検証する。45°超過、法線範囲外、不正ID、切断経路は引き続き停止する。
Pattern #5の実データで、旧閾値外のroot計測値でも接続済み経路はsave/open roundtripし、自Pattern裏の経路を切断したfixtureは
保存停止する回帰試験を追加した。実ブラウザでも11/12から1操作で12/12・1,793 edgeとなり、完成`.fkei`保存成功を確認した。
`printApproval=false`は維持する。

### 2026-08-30 — v0.90.5 existing-web fallback for deep concavities

作者の最終`.fkei`は39 Pattern、蜘蛛支持12点中11点で、Pattern #5だけが未支持だった。既存蜘蛛Graphはすでに
1 componentかつBase内包済みだったが、支持passは未支持点から自Pattern裏中央、さらに別Pattern裏中央までの
新規2-leg chordを毎回要求した。深い凹部ではこの新規chordだけが全径Base内包を満たさず、同じボタンを押しても0本追加になった。

通常の向かい合うPattern経路を全候補試した後、既存Graphの各componentに別Pattern裏anchorがあることを確認し、そのcomponent内の
近傍route nodeへ未支持接点を結ぶ有限fallbackを追加した。候補は下側、距離、法線、安定ID順で最大192点に制限する。経路生成は
通常と同じ45°bridge、1.5 mmまでの局所細分、ラティス全半径を含むBase SDF検査を通す。外側許容や角度緩和は追加していない。

作者データのPattern #5は1回の選択支持で4 edgeを追加し、支持12/12、未支持0、全1,793 edgeの最大角44.99075°、
Base外0となった。接続claim再監査と`.fkei` roundtrip後も12件すべて保持し、Pattern #5自体も残る。実データを回帰fixtureとして固定した。
有限SDF/Graph検査であり、slicerや実物造形の合格ではないため`printApproval=false`を維持する。

### 2026-08-30 — v0.90.0 explicit Stage 3–8 workflow and multi-region reinforcement

元editorの8段階を、3=Surface Pattern内外、4=全meshオーバーハング、5A=恒久蜘蛛ラティス、
5B=赤面エリア補強、6=作品mesh確定、7=確定作品の最終診断、8=残存赤への別体印刷サポートに整理した。
工程7は工程6で確定した作品をexport resolutionで再診断し、その結果を保持する。工程8は保持した残存赤だけを入力にし、
作品Graphへ混ぜず橙の別Graphとして生成する。未完了の`.fkei`保存は引き続き許可するが、3D書き出しは6→7と、
残存赤がある場合の8を完了するまでfail closedする。

赤面選択は単一IDからSetへ変更した。通常クリックは置換、Shift+クリックは追加、Ctrl+クリックは除外、左TOOLSの
ドラッグ選択はpointer軌跡を6 CSS px間隔でraycastして触れた連結領域をまとめる。5Bは未補強の選択領域を順番に処理し、
成功領域を緑へ、失敗領域を黄色選択のまま残す。追加経路は恒久Graphへ入る一方、同じ経路だけを深度非依存の明るい水色
overlayとして再描画するため、通常の蜘蛛ラティスや作品meshに隠れず確認できる。

実ブラウザではドラッグ2領域、Shift追加、Ctrl除外、2領域一括補強4線を確認した。工程6は2秒以内で確定し、工程7は
201,380 facesから残存赤744領域／13,428面／6.6%を16 Worker・2.5秒で表示、工程8は橙の別体支柱66本を生成した。
緑面、水色補強、残存赤、橙supportの順序表示を確認した。これは有限解像度の幾何診断であり、slicerや実印刷の保証ではない。
`printApproval=false`を維持する。

### 2026-08-30 — v0.89.0 whole-mesh overhang regions

工程4の従来診断は各Patternに1つの最下端点だけを持ち、同じPattern内の別の下面や連続する危険面の広がりを
表示できなかった。最終Surface meshの全triangleを保存STLと同じ向きへそろえ、+Z造形方向に対して選択角度以上の
下面を検出する。plate band内に全頂点がある直接接触面を除き、共通edgeを持つ危険triangleを決定的な領域へまとめる。
赤いface overlayは表示専用で、左TOOLSから作品・恒久lattice・別体supportとは独立して切り替える。

同梱38 Patternをanalysis resolution 48 / 16 Workerで実画面検証すると、86領域、1,224危険面、439.5 mm²、
全mesh面積の10.3%を0.4秒で抽出した。赤面ON/OFFとconsole error 0を確認した。Pattern最下端は蜘蛛支持の既存入力として
残す。これは有限resolutionの幾何診断であり、layer height、extrusion width、bridge、冷却、slicer islandや
印刷成功を判定しない。`printApproval=false`を維持する。

### 2026-08-30 — v0.88.4 shared BODY/support coordinates

3MFで作品とsupportの高さがずれる原因は、BODYだけが最終mesh最下端をZ=0へ移動し、別体supportは
元source座標のままSTL化されていたことだった。BODYに適用したsource-space Z移動量をmesh factとして記録し、
Internal gate cache、export Workerを通してsupportへ同じ値を適用する。supportの作品接触上端は動かさず、
垂直支柱の下端だけを正確にZ=0まで延ばす。3MF instanceのZ配置もBODY単体ではなく全partのunion boundsを使う。

### 2026-08-30 — v0.88.3 bounded saved-STL triangle-hole repair

作者報告の `closed=false / components=1 / open=3 / degenerate=0 / nonManifold=0` は、保存STLの
Float32-mm座標で三角形1面分の境界だけが残った状態だった。最終build-plate移動と面方向正規化の後、
open edgeが正確に3本で1つの3頂点cycleを作り、1 component、他のtopology defectが0の場合だけ、
隣接面と逆向きになる1面を補う。各辺2.5 mm以下・面積2.5 mm²以下も要求し、候補追加後にclosed、
consistent winding、1 componentへならなければ採用しない。大きい開口や複数穴は従来どおり停止する。
工程6の下部STATUSとInternal欄には「微小三角穴 1面を自動修復済み」を表示する。

### 2026-08-30 — v0.88.2 truthful automatic Internal-gate repair

工程5Bの入力を恒久latticeだけから完成artwork Graphへ広げ、45°以内の下側近傍だけを積層支持として扱う。
浅い非支持端点には別体verticalを置き、5 mm超の浅いspanには4.8 mm以下の間隔で実接触を追加する。
reachability専用Graphだけをその接触点で分割するため、BODY geometry/STLは変えず、支柱との物理交差を判定へ反映する。
Stage 6は選択線径が2.5 voxel以上になる最小8刻み解像度へ自動補正し、0.8 mm用に256を許可する。
未修復NGは最初の理由を3D書き出し欄へ直接表示する。7 mm bridge＋中央支柱と浅い長尺edgeの回帰を追加した。

### 2026-08-30 — v0.88.1 explicit export-block recovery

工程5Aに、現在のauditで残っている蜘蛛支持targetを全件support-onlyで処理する明示ボタンを追加した。
入力N点の作者調整操作は残し、書き出しfail-closedからの復帰だけを別操作にした。3経路だけ生成したpartial
latticeから開始し、1回で残りをすべて追加してunsupported target IDが空になる回帰を固定した。
書き出し停止文は、この操作名をそのまま案内する。

### 2026-08-30 — v0.88.0 local-normal targets and explicit batch actions

蜘蛛支持はBase重心の上／下ではなく、各PatternのBase側内向き法線がPlate方向を向くかで決める。
Plateを向かない危険赤面はPattern接続だけを義務にし、5Bの別体印刷サポートへ渡す。厳しい法線coneで
候補0だったときに外側loopを終了していたため同じN-1/Nが残る不具合を直し、段階的に候補を広げる。
赤面の画面選択と1点処理、入力N点の一括蜘蛛支持、全未接続Patternの一括接続を追加した。
fixtureは選択target 1回で未支持0、指定3経路、一括接続1回で未接続0、Base内包、全edge 45°以内を確認する。

### 2026-08-30 — v0.86.1 physical Pattern attachment

作者報告 `Fail closed: input 保存STL topology NG（closed=true, degenerate=4, nonFinite=0, components=34, open=0, nonManifold=0, windingInconsistent=0）` は、34個の閉じたSurface部品が蜘蛛の巣Graphと物理的に融合していないことを示した。
リングやcoreなしの花はPattern centroid自体が穴になり得るため、Graph上の裏中央nodeが全Patternへつながっても、
最終SDFでは別componentとして残る。工程3は従来の中央配置がrealized Pattern sphereへmesh-resolvableな重なりを
持つ場合はそのまま維持し、穴の場合だけ中央に最も近い実材料をBaseへ再投影したinside attachmentへ移す。
12個のflat-ring fixtureをDryWebなしの蜘蛛の巣へ接続し、保存STLがclosed / degenerate 0 / 1 componentになる回帰を追加した。

`degenerate=4`はbuild plate原点への平行移動後のFloat32座標でcollinearになるゼロ面だった。
保存topologyが元から無視するrepeated/collinear zero-area faceだけを同じ条件で除去し、最終保存座標で再orientationする。
独立した大きなPattern shellを削除して通す変更ではなく、物理融合できないものは引き続きfail closedする。
旧`.fkei`の保存済みinside/latticeは自動改変せず、工程3→4→5A→5Bの再実行で新しいattachmentを明示生成する。

### 2026-08-30 — v0.86.0 truthful Stage 6 progress and mesh reuse

作者が報告した工程6 mesh検査の約90%停止と、STL書き出しのInternal判定約99%停止は、実処理の停止ではなく、
時間で進める近似表示がSDF sampling後の同期的な面結合・topology・component検査を区別せず、下部STATUSの
経過秒も更新していなかったためだった。工程6は近似進捗を廃止し、preparing / sampling / assembling /
topology / components / repair / saved-topology / printability / encoding / supportをWorkerから実測通知する。
下部STATUSは現在工程、16コア、slice、面数、経過秒を同じ欄へ表示し、cancelは既存のまま維持する。

内部ラティスのSDFはPatch objectをvoxelごとに辿らず、同じpoint順・smooth-min順を連続Float64配列へ一度だけ
compileする。工程6で検査したexact Float32 triangle列はshape / Pattern / graph / resolution / diameterに束縛して
保持し、同じBODYのInternal判定ではresolution³ samplingを繰り返さない。repair後の保存座標topologyが
向きと水密を既に証明した場合は、同じmeshの再orientation・再topology走査も行わない。等価性回帰を追加した。

実ブラウザの完成sample、resolution 128、16 Worker、BODY 227,480 triangle・水密1 component、
Internal 492 edge、別support 1,872 triangle / 39 componentで、初回STL書き出しは5.9秒だった。
v0.85の同じPC・sample・resolutionの11.5秒から約48%短い。v0.84はGraph構成も異なるため純粋なCPU比較ではない。
Slice Previewと実印刷は未実施で、`printApproval=false`を維持する。

### 2026-08-30 — v0.85.0 separate spider lattice and print support

工程5を `5A クモの巣ラティス` と `5B 印刷サポート` に分けた。5AはPattern裏中央を結ぶ恒久部材だけを
生成し、build plateへ伸びる垂直支柱を含めない。5Bは5AのうちSurfaceに直接定着していない最下部へ、
取り外す前提の垂直支柱を別Graphとして生成する。両者は太さ入力と左TOOLSの表示切替を個別に持ち、
`.fkei`も別Graphのまま保存・復元する。

工程6のBODY STL/OBJにはSurfaceと5Aだけを融合し、5Bは同じmm座標へclosed capped cylinderを直接組み立てて
`-print-support.stl/.obj`として別保存する。5Bのための第二のresolution³ SDF meshは行わない。最終判定の
積層到達性だけはBODY+5Bを一緒に監査する。mesh slice Worker上限は8から16へ広げ、
`hardwareConcurrency=20`ではUI用threadを残して16 Workerを選ぶ。

同梱fixtureは恒久ラティス465 node / 492 edge、別サポート78 node / 39 edge、BODY 60,832 triangle・
closed 1 component、support 1,872 triangle・closed 39 componentとなった。Slice Previewと実印刷は未実施で、
`printApproval=false`を維持する。実ブラウザの完成sample、resolution 128、ラティス径2.6 mm、サポート径
1.7 mmでは、下部STATUSに16コアを表示し、BODY 227,480 triangle・水密1 component、別support
1,872 triangle / 39 componentとなった。初回判定から保存完了まで11.5秒、判定済みBODYの保存準備は
0.8秒だった。旧v0.84の18.6秒に対して同じPC上で約38%短いが、内部Graph構成も分離により変わっている。

### 2026-08-30 — v0.84.0 lattice-inclusive cached Stage 6 export

工程6は、工程5の蜘蛛の巣ラティスをSurfaceと同じSDFへ合成してSTL/OBJを保存する。DryWebを
`none`にしたREBUILDでも`finalGraph`をInternal判定対象として扱う。Surfaceへ十分融合しないendpointと
谷型routeにはbuild plateからの垂直rootを追加し、全edge 45°以内に加えて下からの積層到達性も満たす。
逆向き体積の閉じた内部空洞面だけを除き、同じ向きの独立Patternはtopology gateで停止する。

工程6の初回クリックはA1 mini最終判定を自動実行する。その合格STLをcacheし、STL/OBJ/recipe保存では
同じfieldを再mesh化せず、Worker内でcached binary STLからOBJだけを作る。cache missは従来の最大8 slice
Workerを使う。下部STATUSへ工程、実進捗、core、slice、面数、秒、完了/error/cancelを残す。実ブラウザの
resolution 128完成sampleは333,592 triangle、1 component、水密、Internal 1,031 edge、未支持node/edge 0/0、
初回gate 18.6秒、cached保存準備1.0秒、console error 0だった。

### 2026-08-29 — v0.83.1 exact route-node identity

工程5の `Connectivity loop emitted a segment above the 45 degree contract` を修正した。
計画上のbridgeは45°以内だったが、太さに応じた近傍node統合が中間点を別経路へsnapし、保存される
実edgeだけを急角度へ変える場合があった。Pattern裏anchorとroute中間点は完全一致座標だけを共有し、
最終分割点はlerp計算値ではなく呼出側のendpointそのものを使う。18 Pattern / 1.6 mmと
64 Pattern / 4.0 mmのstress fixtureで、保存Graph全edge 45°以内・未接続Pattern 0を確認した。

### 2026-08-29 — v0.83.0 lattice-only unification loop

DryWebを必須工程から外した。工程4は0 node / 0 edgeの明示的な空Graphでも現在のSurfaceを解析し、
工程5のラティス自身が向かい合うPattern裏中央と支持対象を接続する。その後、実際のGraph componentを
再計測し、未接続Patternが残る間は45°以内の二脚bridgeを有限回追加する。未支持点も厳しい向かい合い
条件から既存の `normal dot <= -0.12` まで段階的に再探索し、進展がなければ正直に残す。

未支持点はSTLと印刷判定を引き続き止めるが、編集途中の事実を失わないよう完成`.fkei`の保存と再保存は
許可する。左TOOLSへ「印刷プレート面を表示」を追加し、1画面・4画面の共通XY面を表示専用で切り替える。
同梱38 Pattern候補はDryWeb 0 edge、未接続0、支持35/35、最大42.754°となった。

### 2026-08-29 — v0.82.0 parallel lowest-point extraction

工程4をメインスレッド上の直列計算から、キャンセル可能な専用Workerへ移した。
最終メッシュのz sliceは使用可能CPUに応じて最大8 Workerへ分割し、面方向整理、Pattern帰属、
最下端確認も背景Worker内で続ける。下部STATUSは工程、実進捗、分割/頂点件数、コア数、
面数、経過秒を表示し、完了・失敗・キャンセル結果を残す。入力変更とFKEI Openは進行中処理を停止する。

同梱38 Patternでは20,320 analysis面を8コア/0.5秒で処理し、従来と同じ最下端38点・支持対象11点だった。
計算直後の4画面切替は応答し、console errorは0件だった。

### 2026-08-29 — v0.81.1 Dry Web mesh visibility

Dry Webはメッシュ要求には含まれていたが、旧normal-mesh表示が独立した内部Graphを隠し、
不透明Surfaceの背後で消えたように見えていた。Dry Web完成時または既存Dry Webのメッシュ表示時は、
既存の`SKIN半透明`観察へ自動で切り替え、cyanの内部Graphを維持する。形状、保存、STL出力は変更しない。

### 2026-08-29 — v0.80.0 original editor shell correction

作者確認により、簡略版専用UIをSKIN REBUILDの入口として使わないことを確定した。
元アプリのUIと操作系を丸ごと維持し、REBUILD名と同梱Stage 2 sampleだけを追加する。
実ブラウザで初期12/0、4画面Top/Axome/Front/Right、sample復元12/38、Stage 3 Graph 38 nodeを確認した。

### 2026-08-29 — v0.79.0 first printable entity prototype

指定コミット `6f7b36fb115d58245044e50a48a3f3bd52c6891d` の現行SKINを監査した。
再利用したのはSDFメッシュ、最終メッシュ上のモチーフ最下点抽出、InternalStructureGraph、
STL orientation/topology gate、FKEI入力予算である。旧Permanent/Risk-driven checkpointの
review-only固定データ、旧UI、Bambu support/scaffold経路を外した独立prototypeとして検証したが、
作者のUI修正指示を受けて入口から外した。model / FKEI / STL topologyの比較試験としてのみ残す。

既定サンプルは38パターンをベース表面へ決定的に配置する。ベースSDFの負側を内側、正側を外側として
38/38件を再計算検証する。DryWebなしの表面から抽出したオーバーハング最下点のうち、plate contactを
除く候補を法線が向かい合う別パターン裏へ接続し、さらに全Pattern裏を同じラティスへ統合する。
ラティス各segmentはbuild方向から45度以内、5 mm以下に分割する。

これはスライサーでも印刷成功保証でもない。`printApproval=false` を固定し、実Slice Preview、
floating region確認、実物印刷は作者が行う。

## Hypothesis

印刷候補を作る最短段階では、危険面の汎用最適化より、表面パターンの裏中央という既に作者が
読める点へ支持関係を固定した方が、形と支持の因果を失わずに一体メッシュまで到達しやすい。

## Related

- `../` — 元のSurface Pattern / DryWeb / FKEI / print gate実装
- `../../flower-core-network/` — 表面単位の裏中央をつなぐ比較対象
- `../../cloud-sculpt/meshExport.ts` — 共有するSDFメッシュ/STL topology境界

## Next

- 作者が同梱STLを実スライサーで確認し、floating regionと初層を記録する
- 実プリント後、糸径2.6 mmとbreakaway不要の永久内部構造としての扱いを再評価する
- 元Stage 1 / 2からStage 3以降へ、作者の実形状で一周する
