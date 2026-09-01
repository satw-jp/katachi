# HANA — Gesture to Flower Study

## Question

作者のApple Pencil Gestureを正本として保ったまま、複数の正投影Viewportを持つ編集環境へ安全に受け渡せるか。

HANA-1Aで問うのは、Top / Axome / Front / Rightの4画面を見ながら、Apple Pencilの2D GestureをViewportごとに記録できるかだけである。2D Gestureを3D座標へ変換する問いはHANA-1Bへ送る。

## Setup

```text
npm install
npm run dev
```

`http://localhost:5174/hana.html` をWindowsブラウザで開く。EasyCanvasでiPadを接続し、FrontをDrawにして弱い線と強い線、RightをDrawにして1本の線を描く。

この確認に使ったWindows環境では、5174がOSのTCP除外範囲に含まれていたため、検証時だけ次の予約外portを使った。Katachiの既定port設定は変更していない。

```text
npx vite --host 127.0.0.1 --port 5480 --strictPort
```

- Draw: PointerEventのStrokeを記録する。camera操作は止める。
- Edit / View: cameraを操作する。Strokeは変更しない。
- Wheel: zoom
- Drag: Top / Front / Rightではpan、Axomeではrotate
- Shift + drag: Axomeでもpan
- Save JSON: Raw GestureとEditor Stateを別のtop-level fieldで保存する

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

## Hypothesis

先に4画面の操作感とDraw/cameraの排他を確認すれば、不足軸を決めるHANA-1Bの議論を、抽象的な座標設計ではなく作者の実際の手つきから始められる。

## Related

- `docs/hana/direction.md`
- `docs/hana/HANA-0.md`
- `docs/hana/HANA-1.md`
- `src/studies/skin/multiViewport.ts` — layout / hit test / view labelsのみ限定利用
- `src/studies/skin/rhinoViewportControls.ts` — orthographic camera gesture計算のみ限定利用

## Next

- FrontとRightの2D Gestureを、どの操作で「同じStroke」と宣言するかを決める。
- 先に描いたViewの不足軸を、次のViewが新規Strokeとして追加するのか、既存Strokeの編集拘束として更新するのかを決める。
- HANA-1Bでは2D Gesture → 3D plane上のStroke → 4 View共有表示だけを扱い、Stem / Fieldへ進まない。

HANA-1Aでは3D Stroke、Graph、resample、Stem、Field / SDF、Mesh、Flower Head、`hana-taba`、SKIN production連携を実装しない。
