# HANA — Gesture to Flower Study

## Question

作者のApple Pencil Gestureを正本として保ったまま、一本の2D Gestureを共有3D Strokeへ派生し、別の正投影Viewportから奥行きを編集できるか。

HANA-1Bで問うのは、Front / Right / Topのいずれかで描いた一本を初期平面上の`Stroke3D`へ変換し、4 Viewへ同じデータを投影し、別Viewから編集できるかだけである。Strokeを太らせる問いは後工程へ送る。

## Setup

```text
npm install
npm run dev
```

`http://localhost:5174/hana.html` をWindowsブラウザで開く。EasyCanvasでiPadを接続し、FrontをDrawにして一本描く。生成後はRightまたはTopのEditでcontrol pointをドラッグする。

この確認に使ったWindows環境では、5174がOSのTCP除外範囲に含まれていたため、検証時だけ次の予約外portを使った。Katachiの既定port設定は変更していない。

```text
npx vite --host 127.0.0.1 --port 5480 --strictPort
```

- Draw: PointerEventのRaw Gestureを記録し、終了時に初期平面上の共有`Stroke3D`を生成する。camera操作は止める。
- Edit: control pointをドラッグすると、そのViewで見える2軸だけを変更する。空白ドラッグはcamera操作に使う。
- View: Axomeのcamera操作に使う。Axome Draw/EditはHANA-1Bの対象外。
- Wheel: zoom
- Drag: Top / Front / Rightではpan、Axomeではrotate
- Shift + drag: Axomeでもpan
- Save JSON: `rawGestures`、`strokes3D`、`editorState`を別のtop-level fieldで保存する
- Clear: 一本目を消し、新しいRaw Gestureを描ける状態へ戻す。HANA-1Bは同時に一本だけを扱う。

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

## Hypothesis

Raw Gestureを不変の作者入力として固定し、編集可能な派生Strokeだけを各正投影Viewの2軸拘束で更新すれば、元のpressure/timeを失わず一本の空間線を作れる。

## Related

- `docs/hana/direction.md`
- `docs/hana/HANA-0.md`
- `docs/hana/HANA-1.md`
- `src/studies/skin/multiViewport.ts` — layout / hit test / view labelsのみ限定利用
- `src/studies/skin/rhinoViewportControls.ts` — orthographic camera gesture計算のみ限定利用

## Next

- 32点の固定control budgetが作者の編集感覚に十分かをHANA-1C前に判断する。
- 一点編集で鋭い折れが生じるため、Soft Editまたは局所補間が必要かを別TASKで決める。
- HANA-1Bは共有3D Strokeの証明で停止し、Stem / Fieldへ進まない。

HANA-1Bでは複数Stroke、Graph、Stemの太さ、Field / SDF、Mesh、Flower Head、`hana-taba`、SKIN production連携を実装しない。
