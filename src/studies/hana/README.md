# HANA — Gesture to Flower Study

## HANA-2A status

```yaml
Status: PASS / FROZEN
Real-device Gate: PASS
Platform:
  - iPad Pro 11-inch
  - Apple Pencil
  - EasyCanvas
  - Windows Browser
Branch: agent/hana-2a-point-field-stem
Base checkpoint: 047ea4eb0b8b5018b420af8bc924447e4e0062fa
```

HANA-2Aの最終実機Gateでは、長尺Surfaceの連続Mouse Edit、Live Proxy追従、pointerup後のFinal Surface更新、古いFinal generationのキャンセル、最新Editのみの反映、Surface / Centerline / Samplesのtouch toggle、Right Viewの軸制約、Shape Fidelity、component、通常URLでの操作を確認した。HANA-2Aをこの実装でPASS / FROZENとして固定する。

## Authoring stack v0 status

このBranchはHANA-2A FROZEN commitから派生した、複数Stroke以降のauthoring stack v0である。新しいMilestoneは次の状態表記を使う。

```yaml
Milestone 1: SOFTWARE PASS
Hardware recheck: PENDING
Branch: agent/hana-authoring-stack-v0
Base: 02fd52b96000fd89f412e089f85728341d049ba3
Milestone 2: SOFTWARE PASS
Milestone 3: SOFTWARE PASS
Milestone 4: SOFTWARE PASS
Milestone 5: SOFTWARE PASS
Milestone 6: SOFTWARE PASS
Milestone 7: SOFTWARE PASS
Additional A: SOFTWARE PASS
Additional B: SOFTWARE PASS
Additional C: SOFTWARE PASS
Additional D: SOFTWARE PASS
```

## Remote Compute v0 status

```yaml
Status: SOFTWARE PASS
IPAD REMOTE GATE: PENDING
Branch: agent/hana-remote-compute-v0
Base: 0cbb70f40b0e36db69f44c74e67dff6105c55682
Compute engine: cpu-js-v0
GPU: false
Milestone 1: SOFTWARE PASS
Milestone 2: SOFTWARE PASS
Milestone 3: SOFTWARE PASS
Milestone 4: SOFTWARE PASS
Milestone 5: SOFTWARE PASS
Milestone 6: SOFTWARE PASS
Milestone 7: SOFTWARE PASS
Milestone 8: SOFTWARE PASS
Milestone 9: SOFTWARE PASS
Milestone 10: SOFTWARE PASS
Milestone 11: SOFTWARE PASS
Milestone 12: SOFTWARE PASS
```

LAN launcher default: `npm run dev:hana:lan`

The launcher starts the loopback Windows CPU Compute Service on port `5483` and
the HANA Vite server on port `5482`. It prints the private IPv4 URL to open in
the Windows browser or iPad browser on the same private network. The Vite
server proxies only `/api/hana-compute/*` to `127.0.0.1:5483`; the compute
service itself remains loopback-only. `HANA_LAN_PORT`, `HANA_COMPUTE_PORT`, and
`HANA_COMPUTE_WORKERS` are configurable. Firewall / Wi-Fi reachability is a
machine setup concern and is not silently changed by the launcher.

## Question

作者のApple Pencil Gestureを正本として保ったまま、編集可能なControl Strokeを滑らかな3D Centerlineとして表示し、正投影Viewportから気持ちよくSoft Editできるか。HANA-1Cでは32点を基準にしたが、HANA-2AではRaw Gestureの形状誤差を基準にControl密度を決める。

HANA-1Cで問うのは、32 control pointsを編集の正本として維持しながら、open centripetal Catmull-Romによる派生CenterlineとOFF / LOW / MEDIUM Soft Editを成立させられるかだけである。HANA-2Aではその派生CenterlineをThickness-driven adaptive Material Samples、Point Field、Preview Surfaceへ順に再派生する。Strokeを完成品へする問いは後工程へ送る。

SmoothnessはControl Strokeを変更しない表示パラメータであり、Control Strokeから派生したrelaxed positionsだけをCatmull-Romへ渡す。0では従来表示と一致し、1では固定4-pass relaxationを最大適用する。Smoothnessを追加しても32 controls、alpha、samplesPerSegment、249 samplesは変えない。

## Setup

```text
npm install
npm run dev
```

`http://localhost:5174/hana.html` をWindowsブラウザで開く。EasyCanvasでiPadを接続し、FrontをDrawにして一本描く。生成後はSoftのOFF / LOW / MEDIUMを切り替え、RightまたはTopのEditでcontrol pointをドラッグする。

この確認に使ったWindows環境では、5174がOSのTCP除外範囲に含まれていたため、検証時だけ次の予約外portを使った。Katachiの既定port設定は変更していない。

```text
npx vite --host 127.0.0.1 --port 5480 --strictPort
```

- Draw: PointerEventのRaw Gestureを記録し、終了時に初期平面上の共有`Stroke3D`を生成する。camera操作は止める。
- Edit: control pointをドラッグすると、そのViewで見える2軸だけをSoft Editする。空白ドラッグはcamera操作に使う。
- Soft OFF / LOW / MEDIUM: 選択点のみ / 前後2点 / 前後4点へ固定weightで移動量を配る。
- Smoothness 0.00–1.00: Control Strokeを変更せず、派生Centerlineの局所的なガタつきの残し方を連続調整する。
- Samples: Smooth Centerlineを弧長方向へThickness基準で再sampleしたderived表示。隣接sample spacingはradius以下を目標にし、長さとThicknessで点数が変わる。Control StrokeとSmooth Centerlineは変更しない。
- Surface: Material Samplesを一定半径のsphere SDFとしてsmooth unionし、CPUの既存Field→Mesh coreでPreview Surfaceを生成する。Surface ONで描画中はprovisional samplesからThickness一致のpresentation-only Material Proxy（Instanced Sphere Chain）をrequestAnimationFrameで更新し、並行してresolution 24のprovisional SDFを約100ms throttleで更新する。pointerupではFinal Surfaceを一時的に隠し、preview Proxyを維持したままresolution 48の正式Surfaceを協調的に再生成する。完成後にProxyを消してFinal Surfaceを表示する。Thickness / Smoothness変更もthrottleし、Rebuild Surfaceはmanual/debug fallbackとして残す。
- View: Axomeのcamera操作に使う。Axome Draw/EditはHANA-1Cの対象外。
- Wheel: zoom
- Drag: Top / Front / Rightではpan、Axomeではrotate
- Shift + drag: Axomeでもpan
- Save JSON: `rawGestures`、curve設定を持つ`strokes3D`、Soft設定を持つ`editorState`を分離して保存する。dense Centerlineは保存しない。
- Clear: 一本目を消し、新しいRaw Gestureを描ける状態へ戻す。HANA-1CのStop Gateは一本だけを扱う。

### Pencil-first authoring

Apple Pencil is primarily a drawing instrument. Precise control-point editing is mouse-oriented. Future Pencil correction should prefer redraw / overdraw rather than point manipulation. HANA-1CではEdit modeのcontrol point操作をMouseに限定し、Redraw / Overdraw自体は実装しない。

### 2026-09-03 — Milestone 1: Stable Editing Kernel + Multi-Stroke Document

HANA-2Aの一Stroke documentを破壊せず、`katachi.hana-document.v2`へ独立migrationできるauthoring document層を追加した。Raw GestureとControl Strokeを複数保持し、active / selected Stroke、role、revision、Strokeごとのmaterial設定をauthoring stateとして扱う。旧v1c / HANA-2A JSONはRaw Gesture、Control Point、provenanceを保持したままv2へ移行でき、derived Material / Field / Surface / Proxyは保存対象に含めない。

Soft EditにはControl Point indexではなくworld-space arc-lengthの影響半径を使うpure kernelを追加した。初期値は`LOW=0.75`、`MEDIUM=1.50` world unitsで一箇所に定義し、smoothstep falloff、Raw / provenance不変、Viewの背面軸保持を満たす。authoring-only Undo / RedoはDocument snapshotだけを記録し、derived cacheは対象外とする。

状態: `SOFTWARE PASS`。旧HANA-2A回帰、JSON migration / round-trip、arc-length密度比較、TypeScriptを確認済み。複数Strokeの実機操作は`HARDWARE RECHECK PENDING`として後続Gateに残す。

### 2026-09-03 — Milestone 2: Gesture Material Mapping

Raw Gestureのpressureとtime / distanceから、arc-lengthで参照できるderived Gesture Channelを生成する`gestureMaterial.ts`を追加した。zero / tiny delta time、重複点、外れ値を決定論的に扱い、pressure / speedを平滑化しつつsource point provenanceを保持する。Uniform、Pressure、Speed、Pressure + Speedの4 modeを実装し、base / min / max radiusと各influenceを設定可能にした。

Mapping設定はauthoring Strokeへ保存できるが、Material Profile、dense radius列、Live Proxy、Field、Surfaceは保存しない。UniformはHANA-2Aの一定radiusと一致し、Live用profileには明示的な上限を設け、Final用profileの密度と分離する。状態: `SOFTWARE PASS`。実機でのpressure / speed表現確認は`HARDWARE RECHECK PENDING`として後続Gateに残す。

### 2026-09-03 — Milestone 3: Local Material Object Architecture

Strokeごとにlocal bounds、Material Sample cache、local candidate query、source revision、generation ID、derived mesh cacheを持つ`HanaMaterialObjectRegistry`を追加した。編集・再生成のdirty範囲はobject ID単位で管理し、無関係なStrokeを再生成しない。generationは同一object内でlatest-onlyとし、古い結果はapplyされず、object / cacheの個数が編集回数に比例して増えない。

既存HANA-2AのZ-slice協調生成とPreview優先の境界は維持し、完全なSparse Voxel Systemや通常経路のCapsule SDF置換は行わない。状態: `SOFTWARE PASS`。2本以上のobject isolation、generation cancellation、local candidate query、既存Field回帰をsoftwareで確認済み。実機の複数object操作は`HARDWARE RECHECK PENDING`。

### 2026-09-03 — Milestone 4: Flower Authoring v0

複数のauthoring Strokeから、petalとcoreを持つgesture-authored Flowerを生成するpure authoring kernelを追加した。選択Strokeの順序、Raw Gesture ID、Control Stroke ID、sourceT、local frame、provenanceを保持し、Flowerのmove / rotate、stem attachment、core Stroke追加をimmutableな更新として扱う。materializationはFlower単位のlocal Material Objectへ派生し、global unionやMeshのauthoritative化は行わない。random variationは使用しない。

状態: `SOFTWARE PASS`。5 petals + coreの選択、role更新、provenance、local materialization、move / rotate / stem attachment、既存Documentとの分離をtestsとTypeScriptで確認済み。複数Stroke Flowerの実機操作は`HARDWARE RECHECK PENDING`。

### 2026-09-03 — Milestone 5: Authoring Graph v0

Flower、Stem、Connectorをsemantic node / edgeとして接続するauthoring graphを追加した。junctionを明示的なnodeとして保持し、stem / petal / connector / surface-strand / gesture-strokeのedge role、source object、provenance、revision、protected属性を失わない。cyclesは許可し、connect / disconnectはimmutableに更新する。overlayはGraph edgeから派生し、validatorは参照切れ、重複、欠落node、ゼロ長edgeを検出する。

状態: `SOFTWARE PASS`。junction接続、cycle、overlay、disconnect、validator、source referenceをtestsとTypeScriptで確認済み。Graphを既存SKINへ反映するadapterやproduction geometry変更は行っていない。複数Stroke Graphの実機操作は`HARDWARE RECHECK PENDING`。

### 2026-09-03 — Milestone 6: HANA → SKIN Semantic Bridge v0

HANA authoring stateからSKIN側が受け取れるversioned semantic export `katachi.hana-skin-bridge.v0`を追加した。BridgeはRaw Gesture ID、adaptive Control Stroke、pressure / time / order / provenance、Stroke role、material mapping intent、Flower、Authoring Graph、protected authoring featuresを含む。units、source document format、source revisionを明示し、JSON round-tripと参照validatorを備える。Material Samples、Field、Surface Meshなどのderived geometryはBridgeへ出力しない。

SKIN production repositoryには変更を加えず、既存production behaviorを呼び出すadapterもまだ追加していない。状態: `SOFTWARE PASS`。version check、semantic reference validation、derived geometry exclusion、deterministic JSON round-trip、TypeScriptを確認済み。SKIN側統合と実機操作は`HARDWARE RECHECK PENDING`。

### 2026-09-03 — Milestone 7: End-to-End Authoring Study

固定fixture `hana-authoring-study-v0`を追加した。Stem 1本、Core 1個、Petal 5枚から、pressure-based variable radius profile、Raw / Control provenance、Flower、Stem attachment、junction / Graph、Stroke単位のlocal Material Objectsを決定論的に生成する。Document JSON save / reload、Mouse Soft Edit、authoring-only Undo / Redo、Bridge export / validationまでを一つのStudyとして通す。

通常のHANA URLにはHANA-localのAuthoring Study UIを追加した。`Load Study`はMeshを直接読み込まず、Raw GestureからDocument representationを生成する。`Save Study` / `Load JSON`はRaw / Control / authoring semanticsのみを扱い、`Export Bridge`はversioned semantic Bridgeを出力する。Undo / Redoはauthoring Document snapshotだけを対象とする。既存4 ViewのDraw / Edit / Surface経路とSKIN productionは変更していない。

状態: `SOFTWARE PASS`。固定End-to-End fixture、save / reload、edit、Undo / Redo、Graph、Bridge、browser UI初期化、TypeScript、Vite build、consoleを確認済み。EasyCanvas / iPadでの複数Stroke Flower操作は`HARDWARE RECHECK PENDING`。

### 2026-09-03 — Additional A: Multiple Flowers / Small Cluster

固定End-to-End Studyをsourceとして、3つのFlower placement、branch / junction、Flower単位のlocal Material Object、object selection、cluster save / load、Graph validation、Bridge exportを追加した。Flowerは同じauthoring Stroke provenanceを参照する配置として保持し、local registryはStroke 7個 + Flower 3個の10 objectを置換管理する。cluster JSONはRaw / Control / Flower / Graph / selectionだけを保存し、derived Material ObjectやSurfaceを保存しない。巨大Bouquetやglobal field unionには進んでいない。

状態: `SOFTWARE PASS`。3 Flower、15 petal edge、3 connector branch、local registry、selection、semantic save / load、Bridgeを確認済み。複数FlowerのEasyCanvas実機操作は`HARDWARE RECHECK PENDING`。

### 2026-09-03 — Additional B: Surface Draw foundation

将来のSurface上Stroke authoringに備え、projection UIを追加せず最小の`katachi.hana-surface-draw.v0` data contractだけを追加した。各anchorはsource Surface ID、ray hit position、local normal、local tangent / bitangent frame、source triangle index、barycentric position、Raw Gesture provenance、orderを保持する。anchor追加とJSON round-tripはimmutableで、Surface Meshは編集正本にならない。

状態: `SOFTWARE PASS`。surface hit metadata、local frame、triangle / barycentric validation、provenance、serializationを確認済み。高度なProjection UI、raycast実装、SKIN production接続、実機Gateは`HARDWARE RECHECK PENDING`。

### 2026-09-03 — Additional C: Silhouette / Section data contract

Silhouette plane、projected view direction、2D contour、Section plane、Section curve、source Surface / Gesture provenance、point orderを保持する`katachi.hana-silhouette-section.v0` contractを追加した。representationとserialization、finite / provenance length / duplicate ID validationだけを実装し、輪郭抽出や高度なProjection UIは行わない。

状態: `SOFTWARE PASS`。Silhouette / Sectionの追加、JSON round-trip、plane / contour / provenance validationを確認済み。実際のprojection・section抽出と実機確認は`HARDWARE RECHECK PENDING`。

### 2026-09-03 — Additional D: Chunked Field prototype

長尺・複数Material Objectを将来局所再生成するためのStudy専用`katachi.hana-chunked-field-prototype.v0`を追加した。固定サイズchunk、object-to-chunk reverse index、boundsを跨ぐobjectの隣接chunk登録、dirty chunkだけの決定論的cache再生成、chunk boundary coverage / forward-reverse index validation、JSON serializationを実装した。

これはField / Surfaceの実運用経路へ接続していない隔離prototypeであり、既存のPoint Field / SDF、dense Material Samples、Surface Mesh、HANA-2Aの性能・形状契約は変更していない。chunk cacheとobject membershipは再index時に置換され、境界を跨ぐobjectも片側だけの欠落にならない。状態: `SOFTWARE PASS`。Chunked Fieldの実機確認と通常Fieldへの接続は`HARDWARE RECHECK PENDING`および別設計課題として残す。

### 2026-09-03 — Remote Compute v0 Milestones 1–2

Milestone 1として、DOM・Three.js・Pointer Eventから独立した`katachi.hana-finalization-snapshot.v0`とshared CPU Finalization Coreを追加した。Coreは既存のSmooth Centerline、Thickness-driven dense Material Samples、KD-tree Point Field、cooperative Z-slice Mesh、validationを一つの決定論的経路で実行し、MeshをFloat32 / Uint32 typed arraysとして返す。snapshotは対象objectだけを含み、Authoring Document全体、UI state、Meshは送信・保存しない。

Milestone 2としてLocal / Windows / Autoの`HanaComputeBackend` interfaceを追加した。AbortSignal、generation identity、Remote health、work estimate、strict Remote、Remote失敗時のLocal fallbackを境界化した。初期Auto閾値はMaterial Samples 512点または推定voxel 200,000以上をWindows候補とし、設定可能なpolicyとして固定する。状態: `SOFTWARE PASS`。iPad Remote Gate、実LAN接続、Windows serverは後続Milestoneで確認する。

### 2026-09-03 — Remote Compute v0 Milestone 3: Windows CPU Compute Service

`tools/hana-compute/server.mjs`にloopback専用のWindows CPU Compute Serviceを追加した。`127.0.0.1`の初期portは`5483`、`HANA_COMPUTE_PORT`で変更でき、Node HTTP event loopではFinal計算せずbounded `worker_threads` pool（初期値は`max(1, min(4, logicalCPU - 1))`、`HANA_COMPUTE_WORKERS`で変更）へ委譲する。queueはbounded、requestは2MiB、binary Mesh outputは64MiBを上限とし、worker crash時はreplacement workerを起動する。

`/api/hana-compute/v0/health`、`/capabilities`、`/finalize`、`/cancel`を実装した。Finalization Snapshotだけを受け取り、`katachi.hana-compute-wire.v0`の4-byte header length + UTF-8 header + raw Float32 / Uint32 typed-array payloadでMeshを返す。base64、file access、Document保存、任意コード実行はない。capabilityは`engine=cpu-js-v0`、`gpu=false`、`cancellation=true`、`objectLevelFinalization=true`を明示する。

状態: `SOFTWARE PASS`。health / capability、Worker Finalization、binary decode、malformed request拒否、Node syntax、既存HANA回帰を確認済み。iPad Remote Gate、LAN Firewall、Windows実環境のCPU負荷確認は`IPAD REMOTE GATE PENDING`。

### 2026-09-03 — Remote Compute v0 Milestone 4: LAN launcher

`npm run dev:hana:lan`を追加し、Windows上でCompute ServiceとHANA Vite serverを同時起動する。HANA LAN serverは`0.0.0.0:5482`で待ち受け、Compute Serviceは`127.0.0.1:5483`に限定する。ブラウザからのcompute APIは同一originのVite proxyを経由し、launcherは利用可能なprivate IPv4 URL、local URL、compute engine、worker数を表示する。Ctrl+Cで両方を停止でき、portとworker数は環境変数で設定できる。

状態: `SOFTWARE PASS`。launcher syntax、Vite LAN mode、same-origin proxy、loopback compute endpoint、既定local workflowのport維持を確認済み。実LAN接続、Windows Firewall、iPadからのRemote Finalization実機Gateは`IPAD REMOTE GATE PENDING`。Milestone 5でブラウザUIからRemote / Autoを選択し、pointerupの正式再生成へ接続する。

### 2026-09-03 — Remote Compute v0 Milestone 5: Browser Remote Finalization

HANA-local UIへ`LOCAL / WINDOWS / AUTO`のCompute toggleと接続状態を追加した。通常のlocal modeは既存のHANA-2A経路を維持し、WINDOWS modeではpointerup後の対象Strokeだけをversioned Finalization Snapshotとして同一originの`/api/hana-compute/v0/finalize`へ送る。LAN modeではVite proxyがloopback Compute Serviceへ転送する。AUTOはhealthとwork estimateに基づき、重いFinalizationだけWindowsへ送り、失敗時はLocalへ戻す。strict query (`computeStrict=1`)ではfallbackを許可しない。

Remote結果はbinary typed-arrayを受け取り、identity / generation / validationを確認してからderived Surfaceへ適用する。編集中は従来どおりbounded Live Proxyを表示し、Final Surfaceはpointerup後の最新generationだけを表示する。Remote計算の途中で新しいEditが始まればAbort / cancelを送り、古い結果を表示しない。Surface Mesh、Material Samples、Raw Gesture、Authoring DocumentはRemoteへ保存しない。状態: `SOFTWARE PASS`。LAN launcher + Compute Service、Windows backend、pointerup remote path、Remote result parity、normal URLのconsole warning/error 0を確認済み。Apple Pencil / EasyCanvas / iPadからの実LAN Remote Gateは`IPAD REMOTE GATE PENDING`。

### 2026-09-03 — Remote Compute v0 Milestone 6: protocol and parity

`computeProtocol.test.ts`でheader / typed-array alignment / truncation / size limitを検証し、base64を使わないbinary resultのdecodeを固定した。shared Finalization CoreのLocal resultをwire encode/decodeして、positions、normals、indices、counts、validationがbyte / value単位で一致することを確認する。Node Compute Serviceとのbackend integrationも同じbinary resultを比較する。実装はCPU engine `hana-cpu-js-v0`に限定し、GPUや別精度経路は追加しない。

`npm run test:hana:remote`でRemote protocol、server、parityを実行できる。状態: `SOFTWARE PASS`。Remote実LAN、iPad Pro / Apple Pencil / EasyCanvasからの確認は`IPAD REMOTE GATE PENDING`。

### 2026-09-03 — Remote Compute v0 Milestone 7: object-level finalization

`HanaRemoteObjectCoordinator`はauthoring objectごとにFinalization Snapshotをqueueへ登録し、active / visible / background priority、最大同時実行数、同一objectのcancel / latest-only、stale result拒否を共通化する。`createHanaRemoteObjectJobs`は複数Strokeのauthoring Documentから、各StrokeのRaw Gesture ID、Control provenance、curve、material mapping intentを保持した独立jobを作る。Flower / clusterの各local Material Objectはこのqueueへ個別に渡せるが、global union、Mesh authority、SKIN production接続は行わない。

状態: `SOFTWARE PASS`。2 object以上のbounded parallel queue、同一objectの世代置換、priority、cancel、authoring Documentからのsemantic snapshot生成、derived geometry非保存を確認済み。複数Stroke / Flower clusterのiPad Remote Gateは`IPAD REMOTE GATE PENDING`。

### 2026-09-03 — Remote Compute v0 Milestone 8: Auto policy and benchmark

AUTO modeはRemote healthが`ready`のときだけ、Material Sample数 `512`以上または推定voxel数 `200,000`以上のFinalizationをWindowsへ候補化する。それ以外はLocalを使い、Remote失敗はLocalへfallbackする。`computeStrict=1`ではfallbackしない。`npm run benchmark:hana:remote`はshort / medium / longのwork estimateと選択候補を決定論的に表示し、`--compute`を付けた場合だけshort / mediumのCPU実測を追加する。Final geometryのdensityやShape Fidelityをbenchmarkのために下げない。

状態: `SOFTWARE PASS`。AUTO threshold、短中長fixture、deterministic recommendation、optional CPU measurement、GPU falseを確認済み。実Windows CPU負荷、LAN、iPad / Apple Pencil / EasyCanvasのAUTO Gateは`IPAD REMOTE GATE PENDING`。

### 2026-09-03 — Remote Compute v0 Milestone 9: CPU engine boundary

Windows workerのFinalization実行を明示的な`HanaComputeEngine` interfaceへ接続した。v0の実体は`CpuJsHanaComputeEngine`（`hana-cpu-js-v0`）だけで、capabilityは`binaryMesh: true`、`cancellation: true`、`objectLevelFinalization: true`、`gpu: false`を固定する。将来のGPU engineを追加できる境界だけを用意し、GPU実装、WebGPU、CUDA、native iPadへの展開は行わない。engine経由の結果がshared Finalization Coreとbyte/value単位で一致することをテストした。Remote Compute v0のsoftware milestonesは完了し、iPad Pro / Apple Pencil / EasyCanvasでの実機Remote Gateは引き続き`IPAD REMOTE GATE PENDING`とする。

### 2026-09-03 — Remote Compute v0 Milestone 10: object-level finalization

既存のAuthoring Document identity / revisionを使い、Object単位のRemote jobを対象選択できるようにした。`HanaRemoteObjectCoordinator`はObjectごとに`documentRevision`、`objectRevision`、`objectGenerationId`（snapshotの`generationId`）、`algorithmVersion`を照合し、同一Objectの古いjobだけをcancelする。active / visible / background priorityとbounded concurrencyを維持し、別Objectのjobは継続する。`deriveHanaRemoteObjectDirtySet`はdirect dirty、依存Objectのdependent dirty、無関係なcleanを分離し、`HanaRemoteObjectResultRegistry`は全identity一致時だけpresentation-only resultを適用する。Authoring Document、Raw Gesture、Mesh authorityの境界は変更しない。

状態: `SOFTWARE PASS`。Stem / Connector / Flower依存、Petal / Surface Drawを含む独立Object fixture、同一Objectのstale拒否、A/B並列cancel、derived result独立適用をテスト済み。複数ObjectのiPad Remote Gateは`IPAD REMOTE GATE PENDING`。

### 2026-09-03 — Remote Compute v0 Milestone 11: Auto mode

AUTOのwork estimateを`hanaComputePolicy.ts`へ集約した。estimateはSmooth count、adaptive Material Sample count、bounds volume、estimated voxel count、local candidate count estimate、object / dependency countを重いField計算なしで決定論的に算出する。既存threshold（Material Samples `512`、estimated voxels `200,000`）は変更せず、軽いObjectはLocal、重いObjectはhealthyなWindows、unhealthy / unavailableまたはRemote failureはLocalへ選ぶ。直近healthを1秒cacheし、health回復後は再利用する。選択理由と最新generationのfallback理由をprogress / `lastDecision`へ記録し、古いgenerationをfallbackしない。

状態: `SOFTWARE PASS`。local / windows / unavailable、health cache、選択理由、Remote failureからの安全なLocal fallbackを確認済み。benchmarkはshort / medium / long、Flower、Small Cluster、Multiple Objects、Surface Drawのwork estimateを出力し、short / mediumのCPU実測を任意で行う。AUTOのiPad / Apple Pencil / EasyCanvas実機Gateは`IPAD REMOTE GATE PENDING`。

### 2026-09-03 — Remote Compute v0 Milestone 12: GPU extension boundary

`katachi.hana-compute-capability.v0`として、`engineId`、`algorithmVersion`、`executionKind`、`gpu`、cancel / object-level対応、supported snapshot / protocol versionを持つcapability contractを固定する。現在registryへ登録するengineは`cpu-js-v0`の`CpuJsHanaComputeEngine`だけで、未知engine IDは明示的に拒否する。Local / Windowsは同じPure Finalization Coreを使い、snapshot / protocol / algorithm compatibilityを事前およびresult適用時に確認する。CUDA、WebGPU、DirectCompute、Vulkan、GPU serverは実装していない。

状態: `SOFTWARE PASS`。engine capability、registry生成、未知engine拒否、version compatibility、Local / Windows numerical parityを確認済み。実機は`IPAD REMOTE GATE PENDING`。

## Observation

### 2026-09-01 — HANA-1A implementation start

HANA-0の実機データはEasyCanvas経由で`pointerType=pen`、2 strokes / 651 points、連続pressureを保持した。HANA-1AはそのPointerEvent取得を4 View shellへ接続するが、実機結果はこのshell上で再確認してから追記する。

### 2026-09-01 — HANA-1A EasyCanvas / Apple Pencil verification

`hana-1a-gesture-2026-09-01T11-20-42-032Z.json`を保存し、3 strokes / 988 pointsを確認した。全Strokeが`pointerType=pen`で、全点が0/1の二値ではないpressureを持ち、timeは各Stroke内で単調増加した。

- Frontの弱いStroke: 292 points、pressure `0.0185546875–0.052734375`、34 distinct values
- RightのStroke: 322 points、pressure `0.0546875–0.21484375`、98 distinct values
- Frontの強いStroke: 374 points、pressure `0.0810546875–0.2412109375`、111 distinct values

Top / Axome / Front / Right表示、one/four切替、列・行splitter、Top / Front / Rightのpan、Axome rotate、zoom、Viewport別mode、FrontとRightの別Stroke保持、Save JSON、Raw GestureとEditor Stateの分離を確認した。Draw前後でFront camera stateは不変で、Drawとcamera操作は競合しなかった。browser consoleのwarning/errorは0件だった。

作者は下段のFrontとRightへ描いた線が相互に連動しないことを観察した。これはHANA-1Aの欠陥ではなく、2D Viewport Gestureを別々に保つStop Gateどおりの挙動である。両Viewを一つの3D Strokeへ拘束する規則はHANA-1Bで初めて扱う。

### 2026-09-01 — HANA-1B implementation start

一本のRaw Gestureを距離ベースで32 control pointsへ決定論的にresampleし、初期平面上の共有`Stroke3D`を生成する。FrontはX/Z・Y固定、RightはY/Z・X固定、TopはX/Y・Z固定とした。各control pointは`sourceStroke`、0–1の`sourceT`、対応Raw sample区間、補間pressure、補間timeを保持する。編集は3D位置だけへ適用し、Raw Gestureとprovenanceは変更しない。

4 View表示は同じ`Stroke3D`を各cameraへ投影する。Front / Right / TopのEditではcontrol pointの背面軸を保持し、画面上の2軸だけを変更する。HANA-1Bは一本だけなので、生成後のDrawはClearまで無効にする。EasyCanvas / Apple PencilによるFront→Right Editの実機結果は確認後に追記する。

### 2026-09-01 — HANA-1B EasyCanvas / Apple Pencil verification

`hana-1b-document-2026-09-01T12-14-00-475Z.json`を保存し、HANA-1BのStop Gateを通過した。EasyCanvasでWindowsへ接続したApple Pencilから、Frontに`pointerType=pen`のRaw Gesture 1 stroke / 615 pointsを記録した。pressureは`0.1435546875–0.5703125`、241 distinct valuesで、615点すべてが0/1の二値ではなかった。timeは`0–3000.10000000149 ms`で単調増加した。

Front Draw終了時にY=0の初期平面上へ32 control pointsの共有`Stroke3D`を生成し、Top / Front / Right / Axomeへ同じデータを投影した。Right Editから4 control pointsへ奥行きを加え、Y範囲は`-3.3140803106425–4.15162277910253`になった。編集後もRaw Gestureの615 samples、pressure、time、stroke orderは保存され、全control pointが元Gestureへのprovenanceを保持した。JSONは`rawGestures`、`strokes3D`、`editorState`をtop-levelで分離している。browser consoleのwarning/errorは0件だった。

その前にSidecarを接続したMacへRDP経由で入力したデータでは`pointerType=mouse`、pressure一律`0.5`となった。この経路はHANA-1BのApple Pencil合格データには含めず、EasyCanvas→Windows Browserの直接経路だけを正本の実機結果とした。

### 2026-09-01 — HANA-1C implementation start

Raw Gesture → 32-point Control Strokeの境界はHANA-1Bから変更しない。Control Stroke間を、open centripetal Catmull-Rom、`alpha=0.5`、各区間8 samplesで補間する。32 controlsから249 smooth samplesを毎回再生成し、dense Centerlineは保存の正本にしない。各smooth sampleの`sourceT`、pressure、timeは隣接control provenanceから観察用に補間する。

Soft Editはcontrol index距離による固定presetとする。OFFは選択点のみ、LOWは前後2点へ`1 / 0.67 / 0.33`、MEDIUMは前後4点へ`1 / 0.8 / 0.6 / 0.4 / 0.2`を使う。FrontはX/Z、RightはY/Z、TopはX/Yだけへdeltaを配り、全対象点の固定軸を保持する。provenanceは現在位置ではなく元Gestureとの対応なので変更しない。

Stroke識別色はeditor presentationからStroke IDに決定論的に割り当て、document、Field、Geometry、Printへ含めない。Pressureはnumeric debugへ残すが、CenterlineやRaw Gestureの線幅には使わない。EasyCanvas / Apple PencilによるOFF / LOW / MEDIUM比較は実機確認後に追記する。

### 2026-09-02 — Non-destructive Smoothness refinement

Smoothnessを0.00–1.00のUI sliderとして追加した。Control Strokeのposition、Raw Gesture、provenance、pressure、timeは変更せず、固定4-pass relaxationから派生したpositionだけをCatmull-Romへ渡す。既存のcurve設定、32 controls、249 smooth samplesは維持し、旧documentのsmoothness欠落は0として扱う。EasyCanvas実機Gateで0.00–1.00を連続的に確認し、特定の最適値は固定せず、表現ごとに作者が選ぶパラメータとして残す。Smoothness 1も問題なく、HANA-1CはPASS / FROZENとなった。

### 2026-09-02 — HANA-2A Point Field Stem implementation

Smooth Centerlineから弧長方向にThickness基準のadaptive Material Samplesを再生成し、一定半径のsphere SDFを`blendK = radius * 0.5`でsmooth unionするPoint Fieldを追加した。Preview Surfaceは既存Katachiの`buildMeshFromField`をCPUで再利用し、当初はresolution 48の`Rebuild Surface`で生成した。Samples、Field、Preview MeshはJSON正本へ保存しない。HANA-2AはまだPASS / FROZENではなく、EasyCanvas実機Gateを保留している。

### 2026-09-02 — Surface-preserving Right Edit refinement

Surfaceを表示したままRightをMouse Editできるようにした。SurfaceまたはCenterline付近のpointer位置から投影Centerlineの最近傍parameterを求め、対応するControl Pointへ既存のOFF / LOW / MEDIUM Soft Editだけを適用する。Surface mesh vertexは編集・保存しない。drag中のPreview Surface再生成は約100ms throttle、mouseupではtimerをキャンセルして最終Rebuildする。Apple Pencilは引き続きDraw専用である。EasyCanvas実機Gateは未実施のため、HANA-2AはまだPASS / FROZENではない。

### 2026-09-02 — Live Surface Drawing refinement

Surface ONのApple Pencil Drawでは、Raw Gestureの増加から表示専用のprovisional Stroke3D、Smooth Centerline、Thickness-driven adaptive Material Samplesを決定論的に再生成する。Material ProxyはFinal Material Samplesを使わず、Smooth Centerlineを最大192本の半径一致cylinder segmentへ弧長再sampleして毎frame更新する。provisional SDFはresolution 24、約100ms throttleで低頻度に更新し、長尺ではProxyを優先して省略できる。pointerupではProxyを破棄し、既存のauthoritative 32-control pipelineからadaptive Material Samplesとresolution 48 Surfaceを即時に再生成する。provisional data、Samples、Field、MeshはHANA documentへ保存しない。Surface OFFではSurface計算とProxy更新を行わない。既存のSurface-preserving Right Mouse Editはresolution 48の最終Rebuild経路を維持する。

描画入力の取りこぼしと遅延を優先して防ぎ、SDF previewの約100ms遅延はProxyで視覚的に埋める。provisional SDF build durationのmin / median / maxをdebug datasetへ記録する。現時点でSDF buildがmain threadのpaintを塞ぐ場合もWorker化は行わず、計測結果とともにFOLLOW-UPへ記録する。Smoothness algorithmは変更せず、0.00–1.00の表現パラメータとして扱う方針を維持し、感覚的な改善は別FOLLOW-UP研究候補として分離する。EasyCanvas実機Gateはこのrefinement後に実施するため、HANA-2AはまだPASS / FROZENではない。

### 2026-09-02 — Smooth Live Material Preview refinement

前項のprovisional SDFが100ms間隔で段階的に見える問題に対し、provisional Smooth Centerlineから最大192本の半径ThicknessのInstanced Cylinder Segment Chainをpresentation-only Proxyとして追加した。ProxyはrequestAnimationFrameで更新し、SDF mesh buildの完了を待たずに現在のPencil位置へ追従する。低頻度resolution 24のprovisional SDFは補助表示として残し、pointerupではProxyを消して既存のauthoritative resolution 48 SDFへ切り替える。

ブラウザの長いpointer path smokeでは、pointerup前にProxy frameが25回、provisional SDFが3回生成され、Surface stateは`PREVIEW`だった。同環境でprovisional SDF build durationはmin 6.7ms / median 12.6ms / max 45.9msだった。これは環境依存の自動計測であり、実機paint阻害の判定はEasyCanvas Gateで行う。Worker / WebGPU / CUDA化は今回行わず、main-thread blockが実機で確認された場合のFOLLOW-UPとする。EasyCanvas実機Gateは未実施のため、HANA-2AはまだPASS / FROZENではない。

### 2026-09-02 — Long Stroke Scale Robustness refinement

Material Samplesの64点固定を廃止し、Smooth Centerlineのarc lengthとThicknessから`ceil(length / radius) + 1`でadaptive samplingする。長尺fixture（約68.33 units、radius 0.18）では381 samplesとなり、最大隣接spacingはradius以下を満たす。長尺の旧resolution 48抽出ではcross-sectionのgrid spacingがradiusを大きく超えてnegative nodeを拾えないため、requested resolution 48を保ったまま、grid stepが`radius * 0.9`以下になる最小effective resolutionだけを適用する。Samples、Point Field、Proxy、final Surfaceは同じadaptive sample layerを使う。

長尺描画中はRaw Gestureと毎frame bounded Material Proxyを優先し、final Material Sample countが256を超える場合はprovisional SDFを省略してpointerupのfinal SDFへ送る。Proxyの複雑度はStroke長やFinal Material Sample数に比例して増えず、最大192 segmentに抑える。この時点ではControl Stroke 32点とSmooth Centerline 249点を変更しない方針だったが、後続のRaw Gesture fidelity診断でHANA-2Aの正式pointerup生成だけgeometry-error bounded adaptiveへ改めた。HANA-1Cの32点履歴は変更しない。EasyCanvas再Gateは未実施のため、HANA-2AはまだPASS / FROZENではない。

### 2026-09-02 — Long Stroke Live Proxy Performance refinement

添付の約32.3秒 / 6956 Raw pointsをprefix replayし、変更前の工程別中央値（warm run 4回）を計測した。provisional Stroke生成は500 / 1000 / 2000 / 4000 / 6956 pointsで0.567 / 0.689 / 1.133 / 2.298 / 4.798ms、Smooth Centerlineは0.512 / 0.308 / 0.267 / 0.238 / 0.294ms、adaptive Material Samplesは0.337 / 0.363 / 0.263 / 0.361 / 0.834msだった。既存のMaterial Sampleをsphere instanceへ変換するCPU処理は0.181 / 0.064 / 0.075 / 0.114 / 0.387msだったため、長尺遅延の主因候補は1561前後のsphereを毎frame描画するLive presentation負荷と切り分けた。

Final geometryは従来どおりarc-length adaptive Material Samples（spacing <= radius）からSDFを生成する。Live ProxyはSmooth Centerlineから最大192 segmentだけを生成し、Instanced CylinderとしてrequestAnimationFrame更新する。Final sample densityとLive presentation densityを分離し、Proxy capacityは必要時だけ拡張する。pointerupではProxyを破棄し、dense adaptive Samplesからfinal SDFへ置換する。Worker化、WebGPU、CUDA化は今回行わない。

変更後の同じ6956-point prefix replayでは、6956 points時もMaterial Samples 1590に対してLive Proxyは192 segments、Centerline→Proxy segment sampling 0.094ms、cylinder transform更新0.035ms（warm median）だった。ブラウザ長尺smokeでは描画中もProxy 192 segments、Proxy update median 0.2ms、render提出median 0.6msを記録した。実機の持続fpsとPencil遅延はEasyCanvas Gateで確認する。

### 2026-09-02 — Raw Gesture fidelity / adaptive Control Stroke refinement

実機でRaw Gestureと最終Surfaceの形状差が大きかったため、添付`hana-1c-document-2026-09-02T05-58-26-907Z.json`を段階ごとに計測した。現在の32点固定ではRaw → Controlのmedian / p95 / maxが`0.2925 / 0.8746 / 1.3288`、radius `0.18`超過が`68.3%`だった。Raw → Smoothでも`0.2515 / 0.8476 / 1.4871`、超過`61.8%`であり、誤差は主にRaw → Controlで生じていた。Smooth → Material Samplesは`0.2523 / 0.8477 / 1.4871`とSmoothにほぼ一致し、下流のMaterial / SDF密度が軌跡を失わせた原因ではない。Surfaceには独立したcenterlineは存在せず、SDF primitiveの中心は各Material Sampleそのものなので、Material Samples → Surfaceのcenterline相当位置の位置差は構造上`0`である。これはSurface shellの厚みや抽出誤差を測る値ではない。

固定点数の比較（world unit、radius `0.18`）は次のとおりである。

| controls | Raw → Control median / p95 / max | Raw → Smooth median / p95 / max |
| ---: | ---: | ---: |
| 16 | 0.5233 / 1.5045 / 2.0183 | 0.4532 / 1.4203 / 2.0056 |
| 32 | 0.2925 / 0.8746 / 1.3288 | 0.2515 / 0.8476 / 1.4871 |
| 48 | 0.1868 / 0.5976 / 0.9979 | 0.1663 / 0.5730 / 1.0103 |
| 64 | 0.1503 / 0.5260 / 0.8324 | 0.1155 / 0.5098 / 0.8269 |
| 96 | 0.0763 / 0.3437 / 0.5392 | 0.0564 / 0.3204 / 0.5017 |
| 128 | 0.0441 / 0.2542 / 0.4014 | 0.0324 / 0.2242 / 0.3757 |

HANA-2Aの正式Draw終了時だけ、ordered geometry-error bounded fittingを使う。初期候補はRaw上の順序を保つchord fittingで、当初は`Thickness * 0.5`（default `0.09`）を使っていたが、現在はediting representationの固定`0.09` fidelity budgetへ分離した。Catmull-Rom後のSmooth Centerlineも同じ許容値を超える局所を追加分割し、両方の最大誤差が許容値内になるまで再評価する。Control Pointは選択されたRaw sampleそのものなので、`sourcePointStart = sourcePointEnd`、`sourceT`、pressure、time、orderを保持する。Raw Gesture、Control Stroke、Smooth Centerline、Material Samples、Field、Surface Meshのauthoritative / derived境界は変更しない。Material SamplesとSurface Meshは保存しない。

添付Gestureでの実装後結果は、Raw `2296` points / `11.836s`で`139` controls（初期126、Smooth refinement 13回）、Smooth `1105` samples、Material `634` samples。Raw → Controlは`0.0166 / 0.0598 / 0.0886`、Raw → Smoothは`0.0117 / 0.0526 / 0.0899`、Raw → Materialは`0.0128 / 0.0545 / 0.0892`で、radius超過は各段階0%だった。長尺fixtureのRaw `6956` points / `32.329s`では`318` controls、Smooth `2537` samples、Material `2335` samplesとなり、Raw → Controlは`0.0155 / 0.0605 / 0.0871`、Raw → Smoothは`0.0109 / 0.0497 / 0.0833`、Raw → Materialは`0.0103 / 0.0493 / 0.0833`、radius超過は0%だった。適応fitのCPU計測は同環境で約`97.7ms` / `220.4ms`（短尺 / 32秒fixture）で、pointerup時だけ実行する。描画中のprovisional Strokeは従来の軽量経路を維持し、Live Proxyの上限`192 segments`も変更しない。

診断用に`fidelityDiagnostics.ts`を追加し、Raw → Control / Smooth / Materialのpoint-to-polyline median / p95 / max、radius超過率、worst point indexを再現可能なpure functionとして切り出した。通常UIにはRaw、Control、Smooth、Samplesの既存表示とControl fitの要約を出し、Surface Meshを正本化するdebug overlayは追加していない。高誤差点の詳細はこの診断関数と保存JSONで確認する。

今回の結論は、添付Gestureでは32点固定が主因であり、Material Samples増加やSDF resolution増加だけでは失われた軌跡を復元できない、である。Catmull-Romの局所overshootはadaptive refinementで現fixture上はradius内へ抑えた。より大きなStrokeでのfit上限、Smoothness変更時の再評価、長尺pointerup CPU負荷はFOLLOW-UPとして残す。HANA-1Cの32点契約を変更したのではなく、HANA-2Aのauthoritative Control Stroke生成だけをgeometry-error boundedへ更新した。EasyCanvas実機Gateは未実施のため、HANA-2AはまだPASS / FROZENではない。

### 2026-09-02 — iPad 11-inch touch-first UI refinement

HANA-local UIをiPad Pro 11-inch + EasyCanvas操作基準へ調整した。HANAのbutton / toggle / viewport mode / Soft Edit / Draw・Edit / Surface・Samples・Centerline / Clear / Save JSON / Rebuild Surfaceは48px以上のhit area、主buttonは約48px高、control gapは8px以上を目標にする。Smoothness、Thickness、Surface stateの現在値は18–20px相当で表示し、range sliderは広いtrackと大きいthumbを持つ。Rebuild Surfaceはmanual/debug fallbackとしてsecondary表示に下げた。

起動時とClear後はSurface ON、Centerline ON、Samples OFFを既定とし、Surface ONのままPencil Drawを開始できる。Pencil = Draw、Mouse = refine / Edit / cameraの境界は維持する。4 Viewのworkspaceを主表示として残し、debug値は作者操作controlから分離した。iPad実機Gateは未実施のため、HANA-2AはまだPASS / FROZENではない。

### 2026-09-02 — Long Stroke Live upstream / pointerup profiling refinement

`hana-1c-document-2026-09-02T06-41-08-193Z.json`（Raw 6970 points、約32.285秒、保存済みControl 972点、Smooth 7769点、radius 0.18）を対象に、Live slowdownとpointerup freezeを別々に計測した。従来のLive経路はpointermoveごとにRaw Gesture全体を再度Stroke3Dへ変換し、さらにRaw overlayの全点描画とpressure集計も繰り返していた。これはProxyが192 segmentに制限されていても上流処理がRaw点数に比例する構造だった。

Live専用に、Rawを変更・保存せず新着点だけを追加するbounded working pathを追加した。弧長間引きと段階的compactで最大192点（pen-tip用tailを含め最大193点）に抑え、そこからprovisional Stroke3D、Smooth Centerline、Proxyを再生成する。Raw overlayは描画中だけincremental `Path2D`、pressure min/max/distinctもincremental集計とし、pointermove / requestAnimationFrameでRaw全配列を走査しない。Live preview Materialは最大256点のpresentation-only resample、長尺compact後はprovisional SDFを止めてProxyを優先する。Final authoritative pipelineのadaptive Material Samplesは無制限のspacing-driven密度を維持し、Control Strokeの形状忠実度を下げない。

同じ最新Rawをprefix replayしたwarm測定（各区間の中央値、単位ms）は次のとおり。`raw → live controls / Smooth / preview Material / Proxy`は`1000 → 166 / 1321 / 256 / 192`、`2000 → 137 / 1089 / 256 / 192`、`4000 → 132 / 1049 / 256 / 192`、`5500 → 147 / 1169 / 256 / 192`、`6970 → 106 / 841 / 256 / 192`となった。Live update totalは`1.049 / 0.944 / 1.068 / 0.862 / 1.061ms`、p95は`2.011 / 1.869 / 1.964 / 1.608 / 2.011ms`で、length-dependentな増加は見られなかった。実機の持続fps、paint遅延、長時間GCはEasyCanvas Gateで確認する。

pointerupは最新documentの実際の保存済みcountsでstage計測した。`6970 Raw → 972 Control（initial adaptive 957 + Smooth/overshoot refinement 15）→ 7769 Smooth → 7211 Material → effective resolution 131 → 123288 triangles → 1 component`である。現行の一回のhost測定はadaptive fit 444.9ms（initial selection 9.2ms、refinement 413.0ms）、Stroke3D materialization 2.1ms、Smooth 4.7ms、Material 34.0ms、Field preparation 24.2ms、mesh extraction 2195.6ms、component validation 512.1msだった。Field queryは全探索なら`77616 × 7211 = 559688976` sphere evaluations相当だが、Material Sampleの空間KD-treeで局所候補だけを評価し、同じsource orderを保ったうえで2521108 candidate evaluations（最大候補174）へ削減した。accelerated SDFとbrute-forceのfixture比較は`1e-6`以内で、trianglesは非空、componentは1だった。これはhost上の診断値であり、pointerup→READYの実機値ではない。

長尺Field診断でmesh抽出後に同じgridを再走査する重複負荷を避けるため、long authoritative Surfaceではcomponent validationを維持しつつnegative-grid scanをdebug表示上skipする。Surface Meshはauthoritativeにならず、Material Samples / Field / MeshはJSONへ保存しない。Control fidelity toleranceはmaterial Thicknessから分離し、editing representationの`0.09` budgetを使う。HANA-1Cの32-control契約は変更せず、HANA-2Aのauthoritative Draw終了時だけgeometry-error bounded Controlを使う。

FOLLOW-UPとして、長尺fit refinementのさらなる高速化、browser Long Task / GCの実機計測、Smoothness変更時のControl再fit、Worker化は残す。今回Worker、WebGPU、CUDA、Control数削減、Tolerance緩和、SKIN production変更は行っていない。実機再確認前なので、HANA-2AはまだPASS / FROZENではない。

### 2026-09-02 — Surface Mouse Edit latency / touch toggle refinement

Surface表示中のMouse Editでは、pointermoveごとにauthoritativeなadaptive Control Strokeへ既存のSoft Editを適用する境界を維持しながら、表示経路をbounded previewへ分離した。現在の編集済みControl Strokeから決定論的に最大128 controlを選び、preview Smooth Centerlineと最大256 Material Samplesを再生成する。Surface mesh vertexは編集せず、既存の最大192-segment Cylinder Proxyをこのpreview CenterlineからrequestAnimationFrameで更新する。pointermove中は既存Surface meshを一時的に隠し、pointerupでpreview proxyを破棄して、authoritative Smooth → adaptive Material → Field → resolution 48 Surfaceを一度だけ再生成する。

Nearest Centerline pickingは保存済みのauthoritative Centerlineを再利用する。Raw Gesture overlayはStrokeとviewport rectに結びつくcached `Path2D`を使い、長尺Raw全点の再走査をMouse Edit moveごとに行わない。debugにはnearest query、mousemove total、Control update、Soft Edit、preview Smooth、preview update、final Material、final Surfaceの各時間を記録する。Raw Gesture、Control provenance、pressure/time、Soft Editの固定軸制約、長尺Live Proxyの上限192 segment、Final geometry fidelityは変更しない。

最新の972-control / 7769-Smooth / 7211-Material fixtureをhostで比較すると、変更前のauthoritative Smooth + Material再生成は中央値31.46ms（Smooth 3.22ms、Material 30.28ms、最大47.07ms）だった。変更後のMouse Edit previewは最大128 controls → 1017 Smooth → 最大256 Materialで、同じ処理の中央値1.11ms、最大1.93ms（Smooth 0.29ms、preview Material 0.86ms）となった。browser smokeではmousemove total中央値0.80ms、最大1.10ms、preview Surface build countはMouse drag中に増加せず、既存SurfaceをpointermoveごとにSDF / mesh再生成しないことを確認した。pointerupではMaterialを一度だけauthoritativeへ戻し、Surfaceを最終再生成する。final Surface時間はmesh workloadとGPU環境に依存するため、debugの`final surface`へ記録する。

作者操作用のSurface / Centerline / Samplesはcheckboxを廃止し、項目全体を押せる48px以上のON / OFF buttonへ変更した。Surface ON、Centerline ON、Samples OFFの既定とApple Pencil = Draw、Mouse = refine / Edit / cameraの境界を維持する。Rebuild Surfaceは引き続きmanual/debug fallbackである。変更後のautomated testsとbuildは通過しているが、EasyCanvas実機でのSurface Mouse Edit追従、Right軸制約、long-stroke、touch target、browser smoke、console確認が残っているため、HANA-2AはまだPASS / FROZENではなく、commit / pushも行っていない。

### 2026-09-02 — Mouse Edit latest-pointer-wins / end-to-end latency refinement

高速Mouse Edit時の追従遅延に対し、mousemove handlerとvisual presentationを分離した。pointermoveではRawを変更せず、最新のclient position・`event.timeStamp`・handler時刻だけを保存する。既にEdit ProxyのrequestAnimationFrameが予約されている場合は追加frameを作らず、次のrAFで最新位置だけをauthoritative Control Strokeへ置換適用し、bounded previewを生成してからProxyをrenderする。中間pointer位置は表示しない。pointerup前に未処理の最新位置があれば最後に適用してから、Final Material / Field / Surfaceを一度だけ再生成する。

debug datasetには`eventTimestamp`、handler start/end、latest state update、rAF start、preview update end、render submissionの最後の時刻、入力queue latency、pointer events/sec、preview frames/sec、coalesced count、pending rAF、oldest pointer age、Long Task件数を記録する。latest-pointer-wins高速browser smokeでは179 pointer moves / 170.2 events/secに対して64 preview frames / 61.1 frames/sec、coalesced 116、queue latency中央値/最大0.0/0.2ms、input-to-render e2e中央値/最大4.2/13.1ms、render submission中央値/最大1.5/2.4msだった。Edit中のpreview Surface build countは増えず、Long Taskは0/0/0、console warning/errorは0件だった。これはhost/browser smoke値であり、EasyCanvas実機の入力queueとGPU presentationは再Gateで確認する。

Mouse drag開始時のControl Stroke位置を基準にし、各latest pointer位置のSoft Editを置換適用するため、coalescingによる近傍controlの累積変位を避ける。既存のOFF / LOW / MEDIUM falloff、Rightの固定X、Raw Gesture・provenance・pressure/time、adaptive Control fidelity、最大128 preview controls、最大256 preview samples、最大192 Live Proxy segments、Surface mesh非正本の境界は維持する。GC pauseは標準ページAPIから直接観測できないため、Long Taskとqueue ageを記録し、必要なら別FOLLOW-UPとする。

### 2026-09-02 — Mouse Edit session lifecycle diagnosis

高速Mouse Editが2回目以降に遅くなる実機症状を、同じSurfaceへの連続Edit sessionとして調査した。`HanaViewportRenderer.setPreviewSurface()`はSurface交換前に旧MeshをSceneから外し、旧BufferGeometry / Materialをdisposeする。`setMaterialProxy(null)`はProxyを削除せず、最大192 instanceの同一InstancedMeshを再利用する。Edit専用のpointer listenerやKD-treeは作成しておらず、nearest queryは既存のcached authoritative Centerlineを走査する。session listener countは0で、pointer/rAFは各session終了時にcancelし、pending latest pointerだけをflushしてからFinal rebuildする。

動的Scene resourceをdebugで数え、Browser smokeで11回連続Editした。各session前後で`scene objects = 6`、`Surface Mesh = 1`、`Proxy object = 1`、`BufferGeometry = 5`、`Material = 5`、`GPU geometry = 5`、`GPU texture = 0`が維持され、proxy capacityは192、pointerup後のproxy instance countは0だった。session #1–#11のMouse Edit previewはpointer moves 79、preview frames 10–16、input queue median 0.0ms、E2E median 2.2–3.4ms、E2E p95 3.1–12.7ms、render submission median 1.0–1.2msで、resource countやE2EにEdit回数に比例した増加は見られなかった。pointerup Final Surfaceは約508–781msの範囲で、単調増加ではなかった。Long Taskは各session 0/0/0、console warning/errorは0件だった。

したがって、今回のhost/browser連続sessionでは「EditするたびにSurface / Geometry / Material / Proxy / listener / indexが蓄積する」状態は再現しなかった。変更はこの生命周期計測とsession履歴のdebug可視化に限定し、authoritative geometryやcleanup方式は変更していない。実機で同じ症状が残る場合は、HANA内のresource countが安定したまま発生するGPU command queue / driver presentation、またはFinal Surface upload直後の実機固有の挙動を次のFOLLOW-UPとして切り分ける。HANA-2Aの実機Gateは未完了のため、PASS / FROZEN、commit、pushは行わない。

### 2026-09-02 — Surface Mouse Edit A/B lifecycle / presentation diagnosis

同じ長尺・複雑Surfaceに対して、Final Surface READY直後のEdit #2と、READY後5秒待機してからのEdit #2を比較した。hidden-control hit-test修正後のhost/browser測定では、READY直後のEdit #2がE2E median / p95 / max `3.25 / 3.9 / 11.0ms`、5秒待機後が `3.0 / 3.7 / 6.0ms`、rAF ageがそれぞれ `0.2 / 1.2 / 8.4ms`、`0.2 / 0.9 / 1.7ms`、render submissionが `0.9 / 1.1 / 1.1ms`、`0.9 / 1.5 / 1.5ms`だった。待機時間はReady-to-edit経過時間を約5秒増やしただけで、Edit previewの遅延を明確には改善しなかった。Final Surfaceの再生成時間は同じgeometry規模でも約933–1881msと揺れたため、GPU command queue / presentationまたはField / mesh workloadの実機依存性はFOLLOW-UPとして残す。

Surface ON / OFFも同じControl StrokeとSmooth Centerlineを使って比較した。Surface ONはE2E median / p95 / max `3.0 / 4.0 / 4.0ms`、render submission `0.9 / 1.0 / 1.0ms`、renderer render triangles `131064`、Surface OFFは `2.7 / 4.2 / 4.2ms`、`0.8 / 1.1 / 1.1ms`、`0` trianglesだった。CPU側の差は小さく、Surface OFFではSurface計算・Proxy描画を行わず、Control / Centerline previewだけを継続する。現行pickerはSurface Meshへのraycastではなく投影上のnearest queryなので、raycast時間とintersect mesh数は常に `0 / 0` と記録される。Right Viewの軸制約とSurface Mesh非正本の境界は維持する。

geometry countは、同じfixtureでEdit #0 / #1 / #2についてRaw `766`、Control `104`、Smooth `825`、effective resolution `236`、component `1`を維持した。Materialは `1041 → 1042 → 1045`、Surface trianglesは `65668 → 65632 → 74548`で、変化は各Editの意図した形状変形に伴うものであり、Edit sessionだけによる単調な肥大化ではなかった。resourceも各session前後でscene `6`、Surface Mesh `1`、Proxy `1`、BufferGeometry `5`、Material `5`、GPU geometry `5`、GPU texture `0`、Proxy capacity `192`で一定だった。旧Mesh / Geometry / Material、Proxy、listener、spatial index、preview cacheの蓄積は再現しなかった。

追加の最小修正として、Right Viewのnearest Control / Centerline候補から投影結果が非表示（背面・viewport外）の点を除外した。修正前は長尺SurfaceのEdit #2で背面のControlを選び、`view-plane-miss`となってpreviewが更新されない状態が発生していた。修正後は連続Editでreject `0`、nearest query / Control update / Soft Edit / preview / renderの処理が継続し、authoritative Control、Raw Gesture、provenance、pressure/time、adaptive fidelity、Live Proxy 192 capは変更していない。

結論として、resource leakおよび待機時間依存のGPU遅延はhost/browserでは再現せず、Surface ON/OFFでもCPU edit previewの大きな遅延は確認できなかった。今回確定したHANA側の問題は、長尺時に非表示Controlをhit-test候補へ含める編集状態遷移であり、最小修正を適用した。EasyCanvas実機でのend-to-end visual latency、FPS、GPU presentation、長尺再確認は未完了であり、HANA-2AはPASS / FROZENにせず停止する。

### 2026-09-02 — Edit presentation A/B diagnosis

Edit #2以降の実機遅延について、CPUやresource countではなく、Edit中に実際に提出される描画対象をA/Bで確認した。通常URLはB経路（`hide-final`）で、pointerdown時にFinal Surfaceを隠し、Edit Preview Proxyだけをprimary visualとしてrequestAnimationFrame更新する。診断用に`?editPresentation=final-visible`を指定するとA経路（Final Surfaceを残したままPreviewも表示）になる。どちらも同じauthoritative Control Strokeを更新し、pointerupでFinal Material / Field / Surfaceを再生成する。

ブラウザのEdit #1 / #2で、AはEdit中に`final visible / preview visible / draw 4 / 4`、Bは`final hidden / preview visible / draw 0 / 4`となった。AのFinal SurfaceはrenderOrder `0`、depthTest / depthWrite `true / true`、opacity `0.82`、BのEdit Preview ProxyはrenderOrder `1`、depthTest / depthWrite `true / false`、opacity `0.58`、8 instances / capacity 128だった。pointerup後は両経路ともFinal Surface visible、Preview hiddenへ戻る。Scene object ID、Final Surface ID、Proxy ID、camera near / far / positionもdatasetへ記録する。

短い同一fixtureのhost/browser測定では、AのE2E median / p95 / maxがEdit #1 `17.4 / 21.8 / 21.8ms`、Edit #2 `15.8 / 21.2 / 21.2ms`、Bがそれぞれ `16.0 / 17.0 / 17.0ms`、`16.8 / 21.2 / 21.2ms`だった。BはFinal Surface draw callを除くが、hostではEdit #2の大幅な改善までは再現しなかった。#1–#3と連続#10までのB操作で、Preview更新は継続し、scene `6`、Surface `1`、Proxy `1`、BufferGeometry `5`、Material `5`、GPU geometry `5`、texture `0`を維持した。連続操作の一部で約1秒のinput ageが観測されたが、CUA操作間隔による入力到着遅延であり、browser CPU処理またはresource accumulationの証拠とは扱わない。

したがって、Final Surface / Edit Preview presentation conflictは、HANAの通常経路ではすでにB仕様（Final hidden / Preview primary）として成立している。今回のrenderer telemetryはその事実を可視化するためのHANA-local診断追加であり、Raw Gesture、adaptive Control、tolerance `0.09`、Final Material density、Shape Fidelity、provenance、pressure/time/order、Live Proxy 192 capは変更していない。EasyCanvas実機でBがAより速いか、またはFinal Surfaceを完全に隠しても遅延が残るかは未確定なので、HANA-2AはPASS / FROZENにせず実機再確認前で停止する。

### 2026-09-02 — Mouse Edit visual alignment markers

実機での「OS cursor / HANA edit mapping / WebGL presentation」のどこに遅延が生じるかを直接比較するため、HANA-localの診断URLに3つのDOM markerを追加した。通常UIには常設せず、`?editMarkers=1`を付けたときだけ、Edit中にworkspace上へ表示する。赤い`P`は最新pointer event、青い`T`は現在選択中のControl Pointを同じviewport cameraで投影したEdit Target、緑の`X`はLive Proxy先端を同じ投影で示す。System PointerはOS cursorのまま測定する。

DOM pointer markerはpointermoveごとに描画せず、既存のlatest-pointer-wins状態を同じrequestAnimationFrameで読み、CSS transformだけを更新する。Edit TargetとProxy先端もWebGL meshを経由せず同じrAFでDOMへ反映する。pointerup後は3 markerを隠し、Final Surface visible / Preview hiddenの既存B仕様へ戻す。markerはauthoritative Control Stroke、Raw Gesture、adaptive fidelity、Soft Edit、Material density、Surface Meshを変更しない。

debugにはEdit sessionごとの`events / DOM marker frames / target marker frames / WebGL preview frames`、latest pointer / target / proxy-tipのworkspace座標、各markerとWebGL previewの最後のrAF timestampを保存する。`data-mouse-edit-diagnostic-markers`とsession historyからEdit #1〜#3を比較できる。診断URLは通常Bが`/hana.html?editMarkers=1`、Final Surfaceを残すA比較が`/hana.html?editPresentation=final-visible&editMarkers=1`で、PCの通常MouseとEasyCanvasの双方から同じページを使う。

実機の判定は、OS cursorを基準に、赤P・青T・緑Xが同じframeで追従しているか、WebGL Previewだけが遅れるかを観察する。P / Tまで遅ければHANAのmapping/state、Pだけ遅ければbrowser compositor、OS cursor自体が遅ければEasyCanvas / OS input経路、P/T/Xが速くWebGLだけ遅ければThree.js / GPU presentationを候補とする。実機のCase A/B/C/D判定は未実施のため、HANA-2AはまだPASS / FROZENではなく、commit / pushも行わない。

### 2026-09-03 — T-to-X pipeline diagnosis

P / Edit Target / Proxy tipの診断で、PとTは速く、Xだけが遅いという実機観察を受け、Edit中のT→X経路を段階計測できるようにした。`mouse edit pipeline`には、同一rAFの入力時刻、Target座標、Control update、bounded Control preview、Smooth preview、Material preview、Proxy segment生成、Proxy matrix更新、DOM上のProxy tip、render submissionを記録し、T→Xの経過時間を表示する。

診断A/Bとして、通常の`?editMarkers=1`は既存のbounded Edit Preview → Proxy経路、`?editMarkers=1&editProxy=direct`はSmooth / Material / bounded previewを通らずauthoritative Edit Targetから1 segmentだけをProxyへ渡す経路とした。Direct経路は原因切り分け専用で、製品のauthoritative geometry、Raw Gesture、adaptive Control、Soft Edit、Final Material、Shape Fidelity、provenance、pressure/time/order、Live Proxy 192 capを変更しない。実機のEdit #1 / #2 / #3 / #10によるT→X比較は未実施で、原因は未確定のままHANA-2AをFAIL / hardware recheck pendingとして停止する。

### 2026-09-03 — HANA startup recovery

WebGL contextを取得できないブラウザでもThree.js renderer初期化でページ全体を停止しないよう、HANA-local rendererをno-op fallbackへ切り替えた。これによりviewport chrome、2D Raw Gesture、Pencil入力、診断UIは初期化を継続する。3D Surface自体はWebGL対応ブラウザで確認する。Apple Pencilは既存StrokeがないFront / Right / Topでinteraction modeに関係なくDrawへ入り、MouseのEdit / Camera経路は変更しない。復旧後のWebGL対応ブラウザでFrontテストStrokeを描き、Raw 9、Control 2、Smooth 9、Material 48、Surface READY / 3600 trianglesを確認した。これは起動復旧の確認であり、HANA-2Aのhardware Gate、PASS / FROZEN、commit / pushは未実施のまま継続する。

### 2026-09-03 — Surface Mouse Edit repeated-session observation

同じSurfaceに対する実機追加確認では、Edit #1は速く、pointerup後のEdit #2は開始直後に一瞬だけ引っかかり、その後は明確に大きな遅延が続いた。これは入力開始時の一過性の引っかかりと、Edit session中の継続的なVisual Preview遅延を分けて記録する。既存のresource count診断ではsession蓄積は再現しておらず、今回も原因は未確定である。T / Edit Targetは速く、X / Proxyが遅いという前回観察と合わせ、T→bounded preview→Proxy→render presentationの実機測定を継続する。HANA-2AはFAIL / hardware recheck pendingのままで、Raw Gesture、adaptive Control、Final Material、Shape Fidelity、provenance、pressure/time/order、Live Proxy 192 cap、SKIN、次Phaseは変更しない。

### 2026-09-03 — T-to-X revision trace and direct Proxy A/B preparation

T / Edit TargetからX / Proxyまでの遅延箇所を同一rAF内で照合できるよう、Edit sessionごとにpointer revisionを発行し、Target、bounded Control、Smooth、Material、Proxy、Renderが消費したrevisionを最大120フレームのリングバッファへ記録する診断を追加した。診断表示にはsession、frame、各revision、同一rAF判定、既存の段階別durationを出し、session historyと`data-mouse-edit-pipeline`から取得できる。中間pointer位置を表示する経路やauthoritative dataは追加していない。

既存のA/B経路も維持し、通常の`?editMarkers=1`はbounded preview経路、`?editMarkers=1&editProxy=direct`はauthoritative Edit Targetから再利用Proxyへ1 segmentだけを渡す直接経路である。browser smokeではbounded経路が各frameで`ptr/T/C/S/M/X/R`を同じrevisionとして記録し、direct経路は`ptr/T/X/R`を同じrevisionとして記録した。これは診断経路の成立確認であり、P / T / Xの実機速度判定ではない。HANA-2AはFAIL / hardware recheck pendingのまま、Raw Gesture、adaptive Control、Soft Edit、Final density、Shape Fidelity、provenance、pressure/time/order、Live Proxy 192 cap、SKIN、次Phaseを変更せず停止する。

### 2026-09-03 — Final Surface finalization state and cooperative extraction refinement

pointerup後の遅延をInteractive Edit（P / T / X）から分離するため、Final Surfaceの要求から次フレーム表示までをHANA-localのgeneration traceとして記録するようにした。各traceは`documentRevision`、`editSessionId`、`finalRequestId`、`finalGenerationId`、`lastCompletedGenerationId`、`lastAppliedGenerationId`、`finalizationState`、`finalizeReason`を持ち、`IDLE`、`EDITING`、`FINAL_REQUESTED`、`FINAL_BUILDING`、`FINAL_CPU_READY`、`FINAL_UPLOAD_SUBMITTED`、`FINAL_PRESENTED`を区別する。pointerup、Proxy freeze、Smooth、Material、KD-tree、Field、Mesh、BufferGeometry、Upload、最初のrender、次のrAF、Final presented、READYのtimestampと、request/start/CPU completion/upload/apply/stale discardのcountをdatasetへ保存する。

Final traceのcountsにはRaw / Control / refinement-added / Smooth / Material、Field bounds、grid X/Y/Z、voxel count、effective resolution、KD-tree candidate平均・最大、triangle / component、position / normal / index / field / candidate / KD-treeの概算byte数を記録する。Chromiumで`performance.memory`が提供される場合はCPU build直後、upload直後、READY後500ms / 2000msのheapも記録する。renderer側ではBufferGeometry、BufferAttribute、normal生成、position / normal / index bufferの計測値を取得する。通常経路に`gl.finish()`や強制GCは追加していない。

診断用query parameterとして`finalProfile=normal`（通常のCPU→Geometry→GPU→presentation）、`finalProfile=skip`（Final SurfaceなしでProxyを維持）、`finalProfile=cpu-only`（Field / Mesh / validationまででrendererを更新しない）、`finalProfile=upload-only`（診断cacheのmeshを使いSDF / KD-tree / meshingを省略してupload経路だけを測る）を追加した。upload-only cacheとProxyは診断用であり、JSONのauthoritative dataには保存しない。通常のFinal pipelineは変更せず、adaptive Control、tolerance `0.09`、dense Material Samples、Shape Fidelity、provenance、pressure/time/order、Live Proxy `192` capを維持する。

Browser smokeでは通常profileのdrawが`request 1 / start 1 / CPU complete 1 / upload 1 / apply 1`、Edit後がgeneration `2`の単一完了となり、console warning/errorは0件だった。skip / cpu-only / upload-onlyも各々Surface生成なし・CPUのみ・uploadのみの状態を確認した。実機ではMouse drag中は遅延せず、pointerup直後に停止し、Surface OFFでは停止しないことを確認したため、今回の最小修正として通常FinalのField / SDF / mesh計算内容を変更せず、Z slice単位で`buildPointFieldMeshCooperative`へ分割し、slice間をbrowserへyieldする経路を追加した。pointerup handlerはpreviewを表示したまま戻り、通常profileではFinal生成中に旧Finalを隠し、完了後の次のrAFでProxyを消して新Finalを表示する。短いbrowser smokeではpointerup handler 6.7ms、最終Surface READYまで476.5msを記録し、同期メッシュと協調メッシュの結果一致テストも通過した。これはhost/browser確認であり、EasyCanvas実機のEdit #1〜#10およびpointerup→READYの再確認は未実施である。HANA-2AはFAIL / hardware recheck pending、PASS / FROZENなし、commit / pushなしで停止する。長尺Final生成のWorker化はFOLLOW-UPとして記録する。

### 2026-09-03 — Repeated Edit finalization cancellation refinement

実機では協調Final後に遅延が大幅に軽減した一方、連続してEditすると少しずつ遅くなる観察が残った。これは各Editのpointerupで開始した古いFinal生成が完了前に次のEditと並走する可能性があるため、次のEdit開始時にpending Final generationをHANA-localに無効化し、協調抽出を次のZ slice境界で停止するようにした。新しいFinal要求だけがField / SDF / mesh uploadへ進み、古い結果は適用せず履歴へstaleとして記録する。

この変更はFinalの解像度、adaptive Material Samples、Control Stroke、Shape Fidelity、provenance、pressure/time/order、Live Proxy `192` capを変更しない。同期抽出と協調抽出のmesh一致、およびsuperseded generationの停止テストを追加した。ブラウザSmokeはHANA tests 33件、TypeScript、Vite build、console warning/error 0で通過した。EasyCanvasでの連続Edit再確認は未実施のため、HANA-2AはFAIL / hardware recheck pendingのまま、PASS / FROZEN、commit / pushは行わない。

### 2026-09-03 — HANA-2A final real-device Gate / PASS / FROZEN

上記refinement後のEasyCanvas実機Gateを完了した。iPad Pro 11-inchへApple Pencilを接続し、EasyCanvas経由のWindows Browserで長尺Surfaceを複数回連続Editした結果、Edit回数による遅延の再蓄積はなく、Mouse Edit中のLive Proxyは滑らかに追従した。pointerup後も画面全体は長時間停止せず、Final Surfaceは毎回`READY`へ戻った。Final生成中の次Edit開始、古いFinal generationのキャンセル、古いSurfaceが後から割り込まないこと、最新EditだけがFinal Surfaceへ反映されることを確認した。通常URLでも診断URLでも正常に操作でき、Surface / Centerline / Samples toggle、Shape Fidelity、Right View軸制約、component、Surface連続性を確認した。

#### Frozen authoring hierarchy

```text
Raw Gesture
↓
Adaptive Control Stroke
↓
Smooth Centerline
↓
Dense Adaptive Material Samples
↓
Field / SDF
↓
Surface Mesh
```

- Raw Gestureは全点、pressure、time、order、provenanceを保持するauthoritative inputとする。
- Control Strokeはgeometry-error bounded adaptive representation、authoring tolerance `0.09`、Thickness非依存とする。Mouse Editのauthoritative representationである。
- Draw中のworking pathはbounded incrementalとし、Live Materialは最大256、Live Proxyは最大192 segmentsとする。長尺ではProxyを優先し、Raw Gesture全体を毎frame走査しない。
- Mouse Edit中はbounded Live Proxyをprimary visualとし、Final SDF / meshはpointermove中に再生成しない。pointerup後だけFinal Surfaceを生成し、Z slice単位の協調処理でUI応答を維持する。
- Final生成中はPreviewを維持し、新しいEdit開始時に古いFinal generationをキャンセルする。stale generationはupload / presentationせず、最新generationだけをSurfaceへ反映する。
- Finalはdense adaptive Material SamplesとKD-tree局所候補探索を使う。brute-forceとの差は`1e-6`以内とし、Shape Fidelityのための密度削減は行わない。
- Material / Field / Surface Meshはderived dataであり、JSONの正本には保存しない。
- Surface / Centerline / Samplesは全面toggle、touch target 48px、Surface default ON、Centerline default ON、Samples default OFFとする。Rebuild Surfaceはsecondary fallbackとする。

#### Known limitations

- 非常に長く高密度なGestureではFinal Surface生成に相応の時間を要するが、協調処理中もUIとLive Previewは応答する。
- 古いFinal generationはキャンセルされる。
- 長尺Live Drawing後半には軽微な追従低下が残る場合がある。
- adaptive Control密度に対し、Soft Editは現在も`±control count`基準である。Soft Editのarc-length化はFOLLOW-UPとする。
- 標準HANAテストコマンドで発生した環境固有の`uv_os_get_passwd ENOMEM`は実装FAILではない。
- Chrome起動オプション警告はHANA console errorではない。

#### Diagnostics retained

以下はHANA-local診断として残すが、通常URLへ影響しない。通常URLでは診断マーカー非表示、診断DOMによる操作阻害なし、通常UI正常を確認した。

- `?editMarkers=1`
- `?editProxy=direct`
- `?editPresentation=final-visible`
- Final generation / revision trace系診断

`editProxy=direct`、`editPresentation=final-visible`、DOM marker、generation traceは原因切り分け用で、authoritative geometryや通常操作の仕様ではない。

#### Final verification

```yaml
HANA tests: 33/33 PASS
TypeScript: PASS
Vite build: PASS
browser smoke: PASS
manifest JSON: PASS
diff check: PASS
console warning/error: 0
src/studies/skin diff: 0
```

## Hypothesis

Control pointsを操作ハンドル、centripetal Catmull-Rom Centerlineを再生成可能な表示として分け、局所的なindex falloffを使えば、Raw Gestureを失わず鋭い一点折れを減らせる。

## Related

- `docs/hana/direction.md`
- `docs/hana/HANA-0.md`
- `docs/hana/HANA-1.md`
- `src/studies/skin/multiViewport.ts` — layout / hit test / view labelsのみ限定利用
- `src/studies/skin/rhinoViewportControls.ts` — orthographic camera gesture計算のみ限定利用

## Next

- HANA-1CのEasyCanvas実機Gateとconsole確認は完了した。Smoothnessは0.00–1.00から表現ごとに作者が選び、特定の最適値は固定しない。
- HANA-2AのEasyCanvas実機Gateで、Surface ONのApple Pencil Draw中にprovisional Surfaceが追従し、pointerupでresolution 48のfinal Surfaceへ更新されること、Centerline → Samples → Field → Surfaceの関係、Thickness / Smoothness変更後のthrottle、Mouse Soft Edit後のstale追従を確認する。
- 長尺Live Proxy Gateで、30秒級のDraw中もProxyが最大192 segmentの連続形状として追従し、Pencil入力を遅延させないことを確認する。iPad 11-inchでは大きいhit area / 数値 / slider、Surface ONの起動、4 Viewの余裕も確認する。
- HANA-2AはPASS / FROZENとして停止する。次Phase、Flower、Gesture Material、Soft Edit再設計、Worker、WebGPU、CUDA、SKIN Bridgeへは進まない。

HANA-2AではUndo、Load、units、Axome直接編集、複数Stroke編集、Graph、pressure-based radius、Surface Draw、Silhouette Draw、Section Draw、Mesh export、STL、Print、Support、Web、`hana-taba`、CUDA、WebGPU、iPad Native、SKIN production連携を実装しない。adaptive Control Strokeの上限、Smoothnessの再fit、長尺pointerupのWorker化はFOLLOW-UPであり、今回のGateへ持ち込まない。

## HANA Authoring Stack v0 — iPad Interaction and Resume Durability

Current branch: `agent/hana-ipad-interaction-v0`
Base: HANA-2A frozen checkpoint
Status: SOFTWARE PASS / HARDWARE RECHECK PENDING

Platform target:

- iPad Pro 11-inch
- Apple Pencil through EasyCanvas
- Windows Browser

### M13–M19 implemented scope

- M13: compact left-pane, touch-first controls with 48px-class targets, readable Smoothness / Thickness values, and Surface ON / Centerline ON / Samples OFF defaults. `Rebuild Surface` remains a secondary fallback.
- M14–M15: bounded live-path profiling and latest-frame Pencil preview processing. Raw Gesture capture remains immediate and authoritative; provisional Control / Smooth / Material / Proxy work is driven from the bounded working path and is not saved.
- M16–M17: `visibilitychange`, `pagehide`, `pageshow`, `freeze`, `resume`, and WebGL context loss/restoration handling. A versioned `katachi.hana-recovery-checkpoint.v0` is saved to IndexedDB after completed authoring changes and lifecycle transitions. Invalid, incompatible, or mismatched checkpoints are rejected; recovery never makes a derived Mesh authoritative.
- M18: touch camera navigation, pinch zoom, pan, Front / Side / Top / Iso presets, Fit View, and Auto Rotate. Camera interactions stop Auto Rotate; Pencil remains Draw and Mouse remains the precise editing instrument.
- M19: integrated regression coverage for bounded profiling, checkpoint round-trip/validation, touch deltas, build, and HANA browser smoke.

The frozen authoring hierarchy remains:

```text
Raw Gesture
↓
Adaptive Control Stroke
↓
Smooth Centerline
↓
Dense Adaptive Material Samples
↓
Field / SDF
↓
Surface Mesh
```

Raw points, pressure, time, order, provenance, adaptive Control tolerance `0.09`, Shape Fidelity, dense Final Material density, Remote Compute v0, and Live Proxy maximum `192` are unchanged. IndexedDB stores only a cloned semantic authoring document plus recovery metadata; Material Samples, Field, Surface Mesh, and Live Proxy remain derived.

### Known limitations / follow-up

- Hardware recheck of the new iPad interaction and resume paths is pending; this branch must not be called hardware PASS / FROZEN until that gate is completed.
- A very long live gesture can still show a small late-stage preview reduction; the working path and Proxy remain bounded and Raw capture is preserved.
- Very dense Final Surface generation remains cooperative but can take noticeable time. Worker, WebGPU, CUDA, native iPad, and Service Worker work are out of scope.
- Soft Edit remains control-count based; arc-length Soft Edit is a follow-up.
- Browser and Chrome command-line warnings are not HANA console errors; environment-specific `uv_os_get_passwd ENOMEM` remains a test-environment follow-up.

## Raw Gesture Capture Integrity v0

The authoritative Raw Gesture capture path is separate from the bounded live-preview scheduler. Pointer and coalesced samples are appended immediately without rAF throttling, latest-only replacement, distance decimation, pressure filtering, time filtering, or Control tolerance. Every coalesced sample is retained, and the parent PointerEvent is added only when it is not already represented by the final coalesced sample. A strict capture boundary suppresses only exact adjacent duplicates matching pointer id, x, y, pressure, and timestamp; nearby samples and same-time samples with different values remain Raw data. Pointerup and pointercancel use the same capture path so the final received input is not omitted.

After a stroke, HANA-local Diagnostics can report Raw count, unique count, remaining and suppressed exact duplicates, median / p95 / maximum sample interval, intervals over 50ms and 100ms, maximum spatial jump, the largest gap with its endpoints, monotonic time, and parent/coalesced source counts. An observed gap is reported as `INPUT GAP`; HANA does not invent points or interpolate a missing author gesture. Raw Gesture remains authoritative and preserves pressure, time, order, and provenance; the bounded live path, Live Material limit, and Live Proxy limit remain independent derived presentation data.

The regression fixture covers parent/coalesced overlap, multiple coalesced samples, preview decoupling, strict exact deduplication, monotonic-time diagnostics, and no accidental proximity deduplication. The latest iPad hardware gate remains pending for confirming that long gaps are absent during slow and fast Apple Pencil loops; this software change does not freeze or alter HANA-2A's prior checkpoint.

## HANA Long-Stroke Main-Thread Starvation Diagnosis / Fix v0

This HANA-local refinement isolates and profiles the live Pencil path without changing the authoritative authoring hierarchy or final geometry. The development-only `liveIsolation` diagnostic selects five paths:

```text
A RAW ONLY
B RAW + CONTROL
C RAW + CONTROL + SMOOTH
D RAW + CONTROL + SMOOTH + LIVE PROXY
E FULL CURRENT LIVE PATH + RENDER
```

Raw Gesture capture remains synchronous and authoritative. Pointer and coalesced samples are appended immediately; the live path uses the existing incremental working representation and does not rescan or copy the full Raw Gesture on every frame. Live Control / Centerline / Material / Proxy data are derived presentation only. Live Proxy remains capped at 192 segments and the live working path remains bounded. Full Surface / SDF work is not part of modes A–D; Final Surface generation still uses the existing authoritative dense adaptive Material pipeline after pointerup.

The Diagnostics panel records per-mode stage timings for Pointer callback, Raw append, Control, Smooth, Material, Proxy, buffer / transform update, render, and total frame work. It also records growth checkpoints, processed Raw prefix, event-loop lag (median / p95 / max and >50 / >100ms counts), long-task counts observed during the live stroke only, and the largest Raw interval with the preceding live frame stages. Diagnostics refresh at most four times per second during a stroke, and no recovery checkpoint or JSON serialization is scheduled while Raw capture is active.

The FULL live Surface preview now uses the existing cooperative Z-slice mesher and rejects superseded preview generations, so only one provisional build can run at a time. A stale provisional result cannot replace a newer live state or run into pointerup Finalization. Synthetic long-stroke checks cover 100 / 500 / 1000 / 2000 / 5000 / 10000 Raw-point prefixes, bounded live representation, endpoint retention, deterministic output, and the 192-segment Proxy cap. These checks are algorithmic invariants rather than strict CI timing thresholds. No Raw decimation, invented point interpolation, tolerance relaxation, Control coarsening, Material density reduction, or Shape Fidelity reduction was introduced.

### Software status

```yaml
Status: SOFTWARE PASS / HARDWARE RECHECK PENDING
Platform:
  - iPad Pro 11-inch
  - Apple Pencil
  - EasyCanvas
  - Windows Browser
HANA-2A: PASS / FROZEN baseline unchanged
SKIN production: unchanged
```

The iPad slow / fast / continuous long-stroke gate remains pending for this refinement. If RAW ONLY also shows long input gaps, the result must be treated as browser / iPad input supply evidence; HANA must not invent points or change geometry algorithms to conceal it. Worker, WebGPU, CUDA, Remote Compute redesign, Flower, and SKIN integration remain out of scope.
