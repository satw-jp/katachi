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

### 2026-09-02 — Stage 8 sparse support amount / coverage v0.2 (experimental)

工程8 Sparse Removable Supportに、session-onlyの`SparseSupportAmount`（`low` / `medium` /
`high`）を追加した。Lowはv0.1と同じくOutside regionあたり最大3 target、Mediumは6、Highは12。
各regionでは既存の最下端start band、有限なtarget間隔、決定的なfarthest-nearest選択を維持し、
amountだけでcollision screenやspacing screenを緩めない。default coverage radiusはLowを1.0、
Mediumを0.75、Highを0.5倍として、unsupported範囲をより細かくtarget化する。明示的な低レベル上限は
profile cap内だけ許可し、未知のamountはLowへfail-closedする。

右ペインには既存Stage 8 controlsへ小さな`Support Amount / Coverage` select（Low / Medium / High）
だけを追加した。変更時は既存support graphを空にしてStage 8の再生成・再確認を要求するが、Stage 7.5の
Outside evidenceは保持する。設定とdiagnosticsはsession-onlyで、FKEI schema/snapshot、Inside
Overhang、Stage 5B、Permanent Web、export gateは変更していない。

固定された単一Outside region・12面のselection fixtureで、Low / Medium / Highを比較した結果は、
Critical targets / Supported / Unsupported / Supports / candidates / vertical / bent がそれぞれ
`3 / 3 / 0 / 3 / 3 / 3 / 0`、`6 / 6 / 0 / 6 / 6 / 6 / 0`、`12 / 12 / 0 / 12 / 12 / 12 / 0`。
BODY rejects、accepted BODY collisions、support-support spacing rejectsは全段階0で、builder runtimeは
それぞれ`7.403 ms`、`3.121 ms`、`5.241 ms`（Node process内の単発計測）だった。同一seed・settingsの
再実行は既存のdeep-equal determinism regressionで確認し、Lowは最大3 targetのv0.1挙動を維持した。
### 2026-09-02 — Stage 6 final mesh performance v0

固定base `671227dd35985e0e87bb6e5b87b75a41ffc34456` の代表fixture
`skin-rebuild-first-print.fkei` を16 Worker / resolution 128で実ブラウザ計測した。
Stage 6ボタン押下から完了表示までのcoldはBefore 10.69秒 → After 4.92秒、warm 3回の中央値は
8.85秒（9.80 / 8.85 / 7.71）→ 4.68秒（4.54 / 5.23 / 4.68）で47.2%短縮した。
UI phase境界のwarm中央値は、SDF準備＋slice sampling＋結合が約3.1秒→2.5秒、辺共有＋水密が
約0.9秒→0.6秒、components表示に含まれるStage 6.4診断が約4.5秒→1.2秒だった。

支配的だった重複走査を削減した。Float32 triangle bufferから直接component union-findを行い、inspect時は
同じbufferを使う`analyzeStage6MeshTopology`のcomponentCountを採用し、同診断が既に行う保存座標の
degenerate判定を再実行しない。triangle soup、SDF、FKEI save/load/snapshot、UI、CUDAは変更していない。
Before / Afterとも三角形222,984、bounds 32.6 x 32.4 x 80.0 mm、水密OK、部品数3、内部Voronoi
270辺で一致し、同じfixtureの反復実行でも同一結果だった。`npm run test:skin-rebuild`、`npm run build`、
`git diff --check`は成功した。これはブラウザwall time計測であり、FKEI保存やPrint-ready snapshotの
性能評価ではない。

### 2026-08-31 — Stage 8 sparse removable support v0.1 (experimental)

工程8のAutomaticを、工程4のInside / Outside責任・region id・選択済みPattern owner patch idを
唯一のSSOTとして、工程7の最終作品mesh overhang triangle代表点へ転送する純粋な疎支柱生成へ
置き換えた。転送は再分類を行わず、Inside面・未分類面は候補から捨てる。Outside regionごとに
最下端のstart bandを先に選び、低い帯の空間的な広がりがある場合だけ最大3代表へ縮約するため、
最終診断の489面を489本へ展開しない。選択は決定的なgreedy coverageで、vertical needleを先に
試し、失敗時だけ明示された有限XY plate bounds内のleaning plate rootを試す。各保存segmentは
45度以内で、Y branchingはない。現行workflowはbuild plateのZだけを保持し物理的なXY範囲を
持たないため、作品のsampling bboxをplate境界とはみなさず、leaningは利用不可としてunknown
境界からproofを与えない。

受理GraphはBODY / Permanent Webから分離したまま、短い0.6 mm研究用contact neck（shaftは既存
supportDiameter）を持つ。完成BODYのauthoritative smooth-min SDFへ半径込みcapsuleのbounded
subdivisionを適用し、所有Pattern targetと非所有BODY＋Permanent Webのremainderを独立に検査する。
非有限値、1-Lipschitz違反、非端末交差、target attribution不能、証明予算超過をfail closedする。
既存の正当な端末接触は有限suffixとして残す。既存model側のcollision proofにも
同じbounded adaptive screenを適用し、target / remainderの孤立SDFをBODYの分割とは扱わない。
Support同士はendpointだけでなくcapsule-to-capsule距離を`r1 + r2 + 0.35 mm`（初期研究gap、
heuristic/experimental）で検査する。

Automatic画面は `Sparse Automatic (experimental)` と表示し、Outside regions / Critical targets /
Supported / Unsupported / Supports / rejected BODY / spacing / removable / Inside-derived 0 と
vertical / leaning数を表示する。黄色Critical Targetと半透明赤Rejected Candidateはboundedな
presentation-only debug toggleで、通常のStage 3/4/5B色・BODY・export geometryを変えない。
Offは従来どおりBODY-only、support nodes / edges / artifact = 0のままである。FKEI enum/schema/version、
Print #001/#002 artifact、`shadow=true`、`productionApplied=false`、`printApproval=false`は不変。

#### Boundary and limitations

これはbuild plateから連続し、BODY/Web-clear（意図した接触を除く）、spacing-clearなrouteの有限
geometric screenだけである。nipper/tool access、一般的な取り外し可能性、cavity/enclosure、
slicer layer、material strength、print successは証明しない。current final-artwork coordinatesへ
責任事実を移すnearest stored-triangle projectionにも、同一のtriangulationであるという仮定はない。
Outside regionの支持不足は正直にUnsupportedとして残り、Automaticのexport approvalは常に人間の
reviewへ委ねる。実機印刷・slicer・Mac QAはこのv0.1の完了条件に含めず、次の研究課題とする。

### 2026-08-31 — CUDA shadow integration final gate

review済みCUDA runtimeを、Print #002の`model.ts`、FKEI、mesh export、support、production geometryを
変更せずに選択的統合した。Web containmentをauthoritativeのまま保ち、Windows helperは固定loopback
`127.0.0.1:47658`でのみ待機する。production originは固定allowlistに残し、Gate専用review originは
`KATACHI_SHADOW_REVIEW_ORIGIN`でHTTPS originを1件だけ起動時に追加する。wildcard、HTTP、path付き、
別account/nameのoriginは拒否する。

通常Windows ChromeでLocal Network Accessを通常UIから許可した後、review HTTPS originから
RTX 3080 helperへ到達した。120 mm / 7,740 samples / 321 edgesでsample identity、edge identity、
classificationが一致し、maximum margin deltaは`1.594769e-7`だった。初回topology uploadは308.3 ms、
同一sessionのwarm repeatは73.6 msだった。helper停止時は`helper_unavailable`としてWeb authoritativeを
維持し、再起動後はRTX matchedへ復帰した。全経路で`shadow=true`、`productionApplied=false`を維持する。

final integration branchではlocal-engine/RTX E2E、SKIN REBUILD、branching/support、partition、production
buildを通した。Print #002のFKEI round-trip、BODY watertight / 1 component、BODY-only 3MF、
Removable Support Off / support artifact 0、immutable Print #001 baselineは既存contractのまま維持する。
実Mac QAはこの統合のblockerにせず、**POST-DEPLOY FOLLOW-UP: Mac Web fallback QA**として残す。

### 2026-08-31 — Stage 4 Inside Overhang routing to Stage 5B

工程4の全Overhang診断を保持したまま、工程3で確定済みの各Motifの`surfacePosition / outwardNormal`を
SSOTとして、最寄りMotifへ帰属した最終mesh面の中心が負側ならInside、正側ならOutsideとして表示へ投影する。
Base SDFの再samplingや第二のInside / Outside判定は追加していない。Insideは赤、Outsideは薄い青灰色で
同じ診断overlayに残し、選択・緑の補強済み表示・工程5Bのsurface sampleだけをInside面へ限定した。
この分類と診断bufferはruntime-onlyで、geometry、FKEI schema/semantics、BODY STL/3MF、Automatic Support、
CUDA、Graph topology algorithm、`printApproval=false`を変更しない。

Print #002 FKEIを通常Chromeで開き、工程3（38/38、ambiguous 0）から工程4を再実行した。
全Overhangは1,224 faces / 86 regions、Insideは735 faces / 73 regions、Outsideは489 faces / 53 regions、
工程5B入力は735 faces / 73 regionsだった。region数は元の連続領域IDを各集合で数えるため、InsideとOutsideが
同じ領域に含まれる場合は両方へ現れる。Axome目視では赤いInsideと薄いOutsideが同時に残り、明らかな一括反転は
見つからなかった。console warning/errorは0件。5B時間のBefore/After比較は、全対象を処理するとruntime geometryを
変更するため今回は実行していない。これは入力filterのDoDを妨げない計測未実施として記録し、
5B routing/containment algorithmは変更していない。

### 2026-08-31 — Stage 3 Interior Classification debug colors (presentation only)

工程3が実際に保持する`SkinRebuildPatternSide`だけを、別の表示専用layerへ写す
`Interior Classification: Normal / Debug Colors`を追加した。再判定やfield samplingは行わず、
`insidePosition`を赤、`outsidePosition`を青、`surfacePosition`と既存の
`baseSideIsInside=false`を黄、current工程3の行がないMotifを灰で表示する。Normalではlayerを外し、
従来表示を維持する。geometry、FKEI schema/semantics、Support、5B、CUDA、Graph topology、
Print #002成果物、`printApproval=false`は変更していない。

Print #002 FKEIを開いて工程3を再実行した結果はInside 38 / Outside 38 / Boundary 38 /
ambiguous 0 / 未判定0。Axomeの目視では、見えている各Motifで赤がBase側、青が外側、黄がその間に並び、
明らかな局所反転やambiguousの一方向への偏りは見つからなかった。これは表示上の観察であり、
連続場全域や印刷可能性の証明ではない。Normal↔Debug Colorsを`elementFromPoint`でhit-test後に
実座標clickし、console warning/errorは0件だった。今回記録する`FOLLOW-UP`はない。

### 2026-08-31 — TASK A Print #001 removable-support/body collision diagnosis (documentation-only)

#### Supplied physical observation

> many upper Motifs are embedded in removable support; supports pierce Motifs; one isolated ~1 mm support is removable; clustered supports are difficult to remove; prioritize leaving no support inside the finished Body.

これは作者から受け取ったPrint #001の観察をそのまま記録したもので、ここでは再測定や
スライサー・プリンターの推論を加えない。Printer、slicer、layer/Z、material、photoは
`PRINT_LOG.md`の未記録項目として残し、`printApproval=false`も変更しない。

#### Code-grounded interpretation

- **入力と対象:** `src/studies/skin/main.ts`の
  `diagnoseSkinRebuildArtworkForPrintSupport()`は、最終作品`project.finalGraph`
  （Surface Pattern＋恒久Spider、必要なら保持DryWeb）を`dryWeb`として
  `findSkinRebuildLowestPoints()`へ渡す。Stage 8は同じ`current.finalGraph`と診断済み
  `lowestPoints`を`buildSkinRebuildPrintSupport()`へ渡す。したがってSupportは別Graphだが、
  対象決定は完成作品の診断結果に依存する。
- **Support targetの出所:** `findSkinRebuildLowestPoints()`の`plateContact`/
  `needsSupport`判定（最終mesh由来の`findMotifMeshLowestPoints()`、source fallbackを含む）のうち、
  `!point.needsSupport`または`skinRebuildRequiresSpiderSupport()`でない赤い最下点を
  `buildSkinRebuildPrintSupport()`が候補にする。さらに`artwork.nodes`で、plateの
  `surfaceSdf`中心値がsurface-anchoredでなく、45°以内の低い`artwork`隣接辺がないnodeを候補にし、
  45°超かつ4.8 mm超の長い浅い`artwork.edges`には線形補間contactも追加する。
- **Plate contactとtermination:** 同関数は`plateSurfaceZ = min(lowestPoints.position.z)`
  （空なら`patternFloor = min(patch.points.z - point.r)`）とし、
  `plateRootCenterZ = plateSurfaceZ + supportRadius`を計算する。`requestPillar()`は同じXY列を
  最高Zへまとめ、各contactへ`{x, y, plateRootCenterZ}`からcontactまでの1本の垂直edgeだけを
  作る。これはBODY境界を探索して止める処理ではなく、指定contactで終端する処理である。
- **BODYとの分離:** `buildSkinRebuildFinalMesh()`→`buildSkinMesh()`→
  `prepareSkinMeshField()`はSurface compositeと`combineWithInternalStructure()`の恒久Graph capsule
  だけをBODYへ合成する。`buildPrintSupportMesh()`と`meshExport.worker.ts`はSupportを別の閉じた円柱
  STL/OBJへ変換し、3MFも`mergePrintableSupportIntoBody:false`で別partにする。別partであることは、
  同じ座標でBODYを貫通しないことの判定ではない。
- **既存の衝突・接触チェックの範囲:** 恒久Web/latticeの
  `pathWithContainedPrintableBridge()`、`sampledLatticeEdgeBaseExcess()`、および
  `reinforceSkinRebuildOverhangRegion()`の`builderEdgeRangeStaysInsideBase()`は、線半径を含む
  **Base内包**と、指定されたPattern-back/area attachmentの短いendpoint例外を確認するだけである。
  `mergeSkinRebuildGraphsAtSupportContacts()`はSupport nodeが既存edge上にある場合の
  print-reachability用の完全共線splitだけで、BODY geometryを変更しない。Internal Print Gateの
  `surfaceAnchored`はnode中心、bridge判定はSurface SDF上のedge中心線だけであり、Support cylinderを
  完成BODY（Motif/shell/Web/reinforcement）に対して検査しない。Support STLのtopology検査も交差を
  見ない。
- **直接原因と欠落predicate:** `buildSkinRebuildPrintSupport()`は、候補contactの中心値と
  artwork隣接関係を見た後、root→contactの垂直Support capsuleを途中サンプルしない。
  `surfaceSdf`はSurface compositeの中心点ヒューリスティックで、最終BODYの恒久Graph capsuleを
  含まない。従って、候補として残ったpillar（特にlowestPoint、edge補間contact、surface外に
  見えるartwork node）を上へ伸ばす途中でMotif/shellへ入っても、rejectやunsupported記録が無く、
  観察された「MotifをpierceするSupport」となる。Support内のclusterもXY列dedup以外の
  BODY-clearance判定を持たない。
- **最小のTASK B correction:** `buildSkinRebuildPrintSupport()`のpillar受理時に、完成BODYと同じ
  authoritative field（Surface composite＋`finalGraph` capsule）に対する**半径込みのroot→contact
  capsuleの中間経路collision predicate**を追加する。許可するのは意図したtarget surfaceへの明示した
  最終endpoint contact（境界/attachment）だけとし、そのendpoint例外を中間sampleへ拡張しない。
  intermediate radius-aware capsuleが完成BODYに交差するcandidateはrejectし、explicit unsupportedとして
  記録する。意図したtargetへ届かないcandidateを中間の衝突位置で早期終端せず、TASK Bではalternate-path
  search/別経路探索も行わない。lowestPoint、node、edge補間の全targetと、print gate/exportで同じ判定を
  使い、恒久Web・reinforcement・BODY生成の挙動はTASK Aでは変更しない。

### 2026-08-31 — TASK B finished-BODY support keep-out (finite geometry implementation)

`src/studies/skin/meshExport.ts`の`createFinishedSkinBodySdfEvaluator()`を、通常の
`prepareSkinMeshField()`／slice previewと`src/studies/skin/rebuild/model.ts`の
`buildSkinRebuildPrintSupport()`が共有する。Support側はSurface compositeと渡された恒久
`finalGraph`（lattice／reinforcementを含む）のradius-aware fieldを、plate rootから意図した
target endpointまでサンプルする。中間のBody交差は候補をrejectし、早期終端やrerouteをせず
`unsupportedCount`へ明示的に記録する。終端だけはtarget radiusを含む有限・連続したsuffixに限り
許可し、別の中間交差があればendpoint exceptionで隠せない。Stage 8のaccepted／
rejected-by-Body／unsupported表示とFKEIの任意diagnosticsは、旧ファイルの欠落も読める形で追加した。
これは有限SDF／Graphの判定であり、slicer・実機の取り外しや印刷成功を主張しない。
`printApproval=false`と同梱first-print FKEIは不変である。

### 2026-08-31 — TASK C session-only removable-support policy

Stage 8 now exposes exactly two runtime choices, `Removable Support = Off | Automatic`,
without adding a persisted FKEI field. Automatic keeps the existing TASK B builder and
radius-aware finished-BODY keep-out. Off replaces only the runtime removable-support
Graph with an empty Graph, preserves `finalGraph` and the Stage 7 diagnosis, requires an
explicit Stage 8 confirmation, and emits BODY-only output with no support artifact. Its
visible warning is **“Removable support disabled — unsupported regions may remain”** and
includes the current Stage 7 overhang region/face evidence. The export policy may waive
only support-demand facts (`unsupportedNodes`, `unsupportedEdges`, `overlongBridges`);
watertightness, components, degenerates, diameter/resolution, anchors, floating graphs
and other structural/material failures remain fail-closed. This is a runtime/export-policy
change, not slicer or physical-print evidence; the author choice is unprinted and
unapproved and `printApproval=false` remains unchanged.

### 2026-08-31 — Windows CUDA local-engine boundary (shadow-only prototype)

Web版をauthoritativeのまま維持し、固定loopback `127.0.0.1:47658`へversioned containment jobを渡せる
isolated prototypeを追加した。helper不在、CUDA adapter不在、job失敗、数値・分類不一致では必ずWeb結果を返し、
`productionApplied=false`を固定する。`main.ts`、FKEI、STL/3MF経路からはimportせず、geometry outputへ接続しない。

このWindowsではRTX 3080 / driver 595.95 / driver CUDA compatibility 13.2を検出したが、`nvcc`、CMake、
MSVC `cl`、compiled adapterは存在しない。このためCUDA kernelを実行したとは扱わず、capabilityは
`compiled_executable_absent`を返す。固定executable adapter、Origin/Host制限、Web reference比較、
capability/fallback/helper testと再開手順だけを先に固定した。

### 2026-08-31 — 120 mm author baseline with legacy FKEI compatibility

実機で初回80 mm作品が小さかったという作者判断を受け、新規SKIN REBUILD sessionの制作基準を最長辺
120 mm（1.5倍）へ変更した。恒久Spider latticeも相対的な太さを保つ3.9 mmとする。取り外す印刷Supportは
過去の作者判断「今の細さを維持」に従い1.6 mmのままとした。120 mmだけを適用して恒久線径を2.6 mmのままに
すると回帰モデルの保存meshが16 connected componentsとなったため、その組合せは既定値に採用していない。

既存`.fkei`は保存済みのtarget/恒久線径/Support線径をそのまま画面へ復元し、暗黙移行しない。最長辺または
線径を変更した場合は工程3以降を失効し、画面値とproject設定が異なる状態の保存・出力をfail closedする。
この比較はproject完成前の工程3 runtimeにも適用し、工程4 Workerは開始時の全settings snapshotと完了時の
settingsが一致する場合だけ結果を採用する。0 mmや非有限の物理値も変更なしとは扱わない。
同梱first-print baselineは80 / 2.6 / 1.6 mmのreference artifactとして不変であり、Migration Regression
Harnessは従来の80 mm geometry contractを引き続き検証する。

### 2026-08-31 — Terminal-preserving Network Topology Study (development Lab)

TASK 17でClean 101 nodeを維持したEdge削減が100 edgeのspanning-tree下限へ達したため、Cleanを
terminal/branch/critical endpoint/intermediateへ分類し、中間Topology Nodeを作者意図付きで縮約する別Studyを
追加した。38 Motif terminalのうち20はsupport-targetとのmulti-role、degree 3以上のinferred branchは28、
non-terminal critical endpointは20、degree-2 intermediateは43である。現行Graphにexplicit Junction fieldはない。

実装する縮約はdegree-2 series rewiringだけで、近接距離mergeではない。中間Nodeをtopology identityから外しても、
その位置、順序、radius sampleをreplacement Edgeのportable polyline controlとして保持する。Topology Edgeは
Clean/Raw Edge、contracted Clean/Raw Nodeへ追跡でき、将来straight/curve/spline realizationへ渡せる。
近接inferred junction pair 28件は検出表示だけとし、major branch identity/degreeを変える自動mergeは行わない。

結果はNone 101/118、Low 85/102、Medium 66/83、High 58/75。全levelでcomponent 1、Motif 38/38、
support 20/20、38 terminal間703/703 reachability、major branch identity/degree、全Clean/Raw provenance、
cycle rank 18を維持した。Highは43 intermediateを全てpolyline controlへ移す観察限界であり推奨値ではない。

development-only `/skin-network-lab.html`はEdge Density / Node Topologyを切替可能にし、Topology表示ではremoved
Node、rewired chord、polyline realization、retained Motif/support terminalとNode decision provenanceを比較する。
全level・全表示mode・TASK 17互換levelをelementFromPoint hit-test後の実座標clickで確認し、console
warning/errorは0件だった。production generator、finalGraph、FKEI、STL/3MF、baseline fixture、production
build inputには接続していない。

### 2026-08-31 — Spider Graph Simplification Study (development Lab)

TASK 15のCleanup Candidateを不変入力とし、その後段へ作者操作のSimplificationを別module・別resultとして
追加した。Clean 101 node / 118 edgeはcycle rank 18であり、None/Low/Medium/Highはcycle余剰に対して
0/4/9/18本を決定的に削減する。各roundでedgeを除いた最短alternative path、detour、short cycle、
local density、degree、parallelism、terminal近接、graph criticalityを再計算し、alternative pathなし、
component増加、Motifまたはsupport connectivity低下はrejectする。ランダム削除は行わない。

結果はNone 101/118、Low 101/114、Medium 101/109、High 101/100で、すべてcomponent 1、Motif 38/38、
support 20/20を維持した。Highは18 cycleを全て外すspanning-tree限界であり、推奨値でも強度評価でもない。
`criticality`はgraph上の迂回性を観察するproxyに限り、stress/load/slicer/physical safetyを表さない。
全levelはClean Edge ID→Raw Edge IDs lineageを保持し、removed edgeもscore、order、alternative path、
accept/reject理由を持つため判断履歴から消えない。

development-only `/skin-network-lab.html`へNone/Low/Medium/HighとRaw/Clean/Raw-Clean/Simplified/
Clean-Simplified表示を追加した。Cleanはgold、retainedはgreen、作者削除はred、選択edgeはwhiteとし、
edge inspectorでscore、criticality、alternative path、理由、Raw provenanceを確認できる。全levelと表示modeを
elementFromPointでhit-testした実座標clickで操作し、Highのbridge rejectがcriticality 1 / alternative pathなし /
components=1違反として見えること、console warning/error 0を確認した。production generator、FKEI、finalGraph、
STL/3MF、baseline fixture、production build inputには接続していない。

### 2026-08-30 — Raw / Clean Spider Graph visual comparison (development Lab)

production入口とproduction build inputに接続しない`/skin-network-lab.html`を追加し、同梱baselineの
Raw 251 node / 270 edge、Clean 101 node / 118 topological edgeを同じsurface-only context上で
Raw（cyan）/ Clean（gold）/ Overlayとして実クリック比較できるようにした。retained node、collapsed
degree-2 node、near-node merge、overlap、共有IDを持たないendpoint contact、Motif 38点とsupport target
20点は独立layerで表示を切り替えられる。surface contextは`internalGraph=null`で作り、Raw/Cleanどちらも
作品meshへunionしていない。

Clean topologyはendpoint relationだけを持ち、現行straight/radiusは別realization、各Clean Edgeは
Raw Edge IDsとcollapsed Raw Node IDsをlineageとして保持する。例としてClean Edge 8はRaw Edge
20/21/28/29、collapsed Raw Node 56/63へ追跡できる。全270 Raw Edgeと251 Raw Nodeが、Clean lineageか
明示discard reasonへ重複なく対応することをtestで固定した。

実ブラウザのAxome初期視点ではRaw/Cleanの主要経路と38/38 Motif・20/20 support接続のfootprintは一致し、
4重複区間を含むClean Edge 8周辺に目立つ穴は見えなかった。degree-2分割点が減るためnode表示は整理されるが、
118本の経路自体は依然密であり、「クモの巣感が増したか／単純化されすぎたか」は作者判断として未決定。
Raw/Clean/Overlay、diagnostic checkbox、provenance selectを実操作し、console warning/error 0を確認した。
FKEI Save、STL/3MF export、production採用操作はLabに存在しない。

### 2026-08-30 — Spider Graph Cleanup laboratory (shadow only)

同梱first-print `.fkei`の保存済みSpider 251 node / 270 edgeを読み取り、production
`buildSkinRebuildLattice()`へ戻さないshadow-only解析を追加した。Raw上のendpoint-ID duplicateは0件だが、
距離`3.10e-17`と`5.55e-17`のnearly coincident nodeが2組あり、それぞれの周囲に計4組の
equal-radius collinear overlapと、共有IDを持たないendpoint接触4件があった。micro edgeは0、
equal-radiusの厳密collinear degree-2 route nodeは150件だった。

Candidateは近接node 2組をmergeすると露出するduplicate edge 4本を除き、terminalでなく厳密collinearな
degree-2 nodeを148件collapseした結果、101 node / 118 edgeとなった。componentは1→1、Motif terminalは
38/38、support target terminalは20/20で同じcomponent partitionを維持した。総edge長は
125.72856977474008→123.79283631872248（差-1.9357334560176014）で、差は4本の重複区間長と一致する。
これはproduction geometry採用ではなく、Raw/Candidate分離、入力不変、terminal保護、合成fixture、baseline SHAを
testで固定した観察である。near-collinear、protected/異径node、interior split、curve joinは自動Cleanupにせず
Simplificationまたは将来の明示policyへ残す。

### 2026-08-30 — Base Surface Graph / graph-aware distribution (design only)

現行`packPatchesGreedy()`のbounds乱数→SDF内判定→表面投影→Euclidean clearance→Motif実現という
一続きの経路と、QUAD/Voronoi/Goldberg、既存`SurfaceGraph`の意味を実ファイルで分離した。
`docs/architecture/skin-rebuild-surface-graph-distribution-20260830.md`へ、Metaball/SDFとSTL/Meshが
同じ下流placementへ渡せるportable `BaseSurfaceGraph`を設計した。

初期生成はdeterministic Poisson surface sample＋mutual local kNN＋surface plausibilityを推奨する。
Nodeはposition、normal、決定的tangent frame、scale/confidence付きcurvature、area/spacing、boundary、optional
thickness/structural importance、Base bindingを持つ。Edgeはlocal surface近傍、geodesic-like距離、両端tangent方向、
optional curvature/structural weightを持ち、mesh topologyやSpider Networkと同一視しない。

最初の配置はseeded graph Poissonとし、候補選択、位置、向き、scale、field noiseの偶然性を別parameterにする。
UIが将来0–100%のmacroを出しても保存modelは一本のsliderに固定しない。現行pure randomは別の
`legacy-random-pack-v1`として無変更で共存する。PlacementIntent→Motif→Junction→NetworkのID provenance、
future FKEI/GeometryEngine、Metaball→Graph→Flowerの最小vertical sliceを設計しただけで、runtime、schema、
geometry output、dependencyは変更していない。

### 2026-08-30 — Windows local GeometryEngine transport (design only)

Cloudflare公開UIを維持してWindows native計算へ接続する方式を比較し、固定loopbackへだけbindする
native helperとjob-oriented localhost HTTP / Fetchを初期境界にした。小さいcontrolはJSON、大きいmesh/volumeは
SHA-256付きbinary artifact、progressはFetch response streamの連番NDJSON、cancelはidempotent DELETEとする。

公開HTTPS→loopbackには現行ブラウザのLocal Network Access許可とCORSが別々に必要なため、UIは常に
`Compute: Web`から始め、作者の明示Detect後だけWindows CPU / RTX 3080を提示する。service不在、拒否、version不一致、
crash、CUDA無しではprojectを変えずWebへfallbackする。helperはloopback限定、exact Origin、pairing token、bounded schema、
任意path/command禁止とし、FKEIへendpoint/token/job/CUDA bufferを保存しない。

最初のCUDA prototypeは`evaluateContainment`配下のSpider全半径Base内包batchをshadow-onlyで実行し、Web/CPUと
分類・marginを比較する。`buildMesh`等でproduction geometryを変える前にtransport/security/cancel/crash/fallbackを通す。
設計文書、Study記録のみでruntime、FKEI schema、geometry output、dependency、Cloudflare設定は変更していない。

### 2026-08-30 — migration regression harness

`public/samples/skin-rebuild-first-print.fkei`を変更せず、SHA-256を入口で固定したtest-only回帰を追加した。
strict parse/restore後のBase 12、Pattern 38、inside 38/38、Spider 251 node / 270 edge、未接続0、
支持対象20/支持済20/未支持0、finalGraph統計、別体support 134 node / 67 edgeを実データから固定する。

現行resolution 68のWeb referenceは59,524 triangles、saved Float32-mm一意vertex 29,688、1 component、
closed/winding-consistent、open/non-manifold/degenerate/non-finite各0、longest 80 mm、volume
14,302.041001524116 mm3だった。離散topology/countは厳密、boundsとvolumeだけ限定toleranceで比較する。

`GeometryResultContract`と`compareGeometryResult(reference, candidate, tolerances)`をtest内に定義し、
将来Web/Windows CPU/CUDA結果を同じscalar/topology contractへ正規化できる。backend名は形状差にせず、
CUDA用toleranceは実装・conformance時に明示レビューする。production geometry/FKEI schemaは変更していない。

### 2026-08-30 — Base / Motif source abstraction migration plan (design only)

現行Baseの`Ball[] + hostK`がhistory、`main.ts`、renderer/picking、field/mesh、診断と多数のWorker protocolへ
渡る経路、Motifの`Patch`がshape/params、配置・cell provenance、実現済み球群、fusion/contact/bridgeを同居させる
構造を棚卸しした。`docs/architecture/skin-rebuild-base-motif-abstraction-20260830.md`へ、portableな
`BaseSource → BaseGeometry capabilities`と`MotifSource → MotifDefinition → MotifInstance → derived realization`の
段階移行を記録した。

Base共通能力はbounds、nearest surface、normal、deterministic sampling、inside/outside、optional signed distance、
mesh realization、Base Surface Graph sourceを明示的なsupport/精度付きcontractにする。STL/MeshはBVH等でnearestと
samplingを提供し、閉じた向き整合meshだけが符号／insideを回答し、open/non-manifoldはunknownとしてfail closedする。

既存Patchのpoint配列はregenerateせずcompatibility realizationとして保持し、将来Coin/Ring/Flower/一筆Flower/
Curve/SVG/Polyline/Customをlocal coordinates、transform、surface binding、portable parametersで表す。配置はBase kindを
分岐せず共通surface providerと別物の`BaseSurfaceGraph`を使う。設計文書とStudy記録だけでgeometry/FKEI v1は変更していない。

### 2026-08-30 — Spider Network / Junction data model (design only)

`InternalStructureGraph`、`GraphBuilder`、`buildSkinRebuildLattice()`、Stage 5B補強、
`finalGraph`のmergeとFKEI Save/Restoreを実ファイルで対応付けし、
`docs/architecture/skin-rebuild-network-junction-architecture-20260830.md`へ将来Network境界を記録した。

Edgeを円柱ではなく安定IDを持つNode間のtopologyとし、straight/polyline/Bezier/spline/custom curve、
circle/custom profile、恒久作品／取り外しsupport、Spider／reinforcement／junction-stemの役割を
portable definitionとして分離する。raw Graphから、許容誤差内で形態意図を変えないCleanupと、作者が
0–100%等で構造を変えるSimplificationを別工程にし、Node alias、Edge lineage、監査と保護anchorを保持する。

Motif identity、Network Node/Edge identity、接続位置・方向・本数、influence radius、morph strength、
transition typeを`JunctionIntent`として保存し、最終meshはGeometryEngineが導出する。現行FKEI v1は変更せず、
将来schemaでraw/cleaned Graph、simplification intent、junction intentをmigration可能にする。Web/CUDAとも
同じproject dataを読み、current straight realizationを互換経路にする設計だけでgeometry outputは変更していない。

### 2026-08-30 — Windows compute backend boundary inventory (design only)

公開入口`skin-rebuild.html`は簡略prototypeではなく、元editor shellの`src/studies/skin/main.ts`を読み込み、
そこから`rebuild/model.ts`、FKEI、mesh／diagnosis／export Workerを呼ぶ構成であることを実ファイルと関数で棚卸しした。
`docs/architecture/skin-rebuild-windows-compute-boundary-20260830.md`へ、A=UI/Browser、
B=platform-independent core、C=heavy geometry、D=CPUで十分、の対応表を記録した。

将来境界は`UI → GeometryEngine → WebGeometryEngine / WindowsCudaGeometryEngine`とし、既存Worker protocolを
backend-neutral request/resultへ正規化する。Windows側はCloudflareのWeb UIを置き換えず、限定local serviceとして
batch jobを受ける。FKEIは共通project dataのまま、CUDA pointer、native path、GPU bufferを唯一の正本にしない。

最初のCUDA候補は、resolution³のSDF sampling＋mesh生成、Surface/mesh batch診断、蜘蛛routeの全半径Base内包／
collision検査の3処理とした。STL Base Import、Custom Curve Motif、Base Surface Graph、Spider Graph Cleanup、
Curved Network Edge、Calyx-like Junction / Motif Morphも、意図／topologyをcore、realization／幾何検証をengineへ分ければ
同じ境界に収まる。設計記録だけでruntime、FKEI schema、geometry、閾値、座標、依存は変更していない。

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
