# HANA — Gesture to Flower Study

## Question

作者のApple Pencil Gestureを正本として保ったまま、32点のControl Strokeを滑らかな3D Centerlineとして表示し、正投影Viewportから気持ちよくSoft Editできるか。

HANA-1Cで問うのは、32 control pointsを編集の正本として維持しながら、open centripetal Catmull-Romによる派生CenterlineとOFF / LOW / MEDIUM Soft Editを成立させられるかだけである。Strokeを太らせる問いは後工程へ送る。

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
- View: Axomeのcamera操作に使う。Axome Draw/EditはHANA-1Cの対象外。
- Wheel: zoom
- Drag: Top / Front / Rightではpan、Axomeではrotate
- Shift + drag: Axomeでもpan
- Save JSON: `rawGestures`、curve設定を持つ`strokes3D`、Soft設定を持つ`editorState`を分離して保存する。dense Centerlineは保存しない。
- Clear: 一本目を消し、新しいRaw Gestureを描ける状態へ戻す。HANA-1CのStop Gateは一本だけを扱う。

### Pencil-first authoring

Apple Pencil is primarily a drawing instrument. Precise control-point editing is mouse-oriented. Future Pencil correction should prefer redraw / overdraw rather than point manipulation. HANA-1CではEdit modeのcontrol point操作をMouseに限定し、Redraw / Overdraw自体は実装しない。

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
- 次の物質化工程（Stem / Field等）は、このtaskでは開始しない。

HANA-1CではUndo、Load、units、Axome直接編集、adaptive resample、複数Stroke編集、Graph、Stemの太さ、Field / SDF、Mesh、Flower Head、`hana-taba`、SKIN production連携を実装しない。
