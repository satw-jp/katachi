# Hikari Light Layers / Visual Art Render — 設計仕様書

Status: conditionally approved; mandatory review corrections incorporated
Current stage status, dependencies, and acceptance authority: [`master-plan.md`](master-plan.md). This document remains the detailed ART design contract.
UpdatedAt: 2026-08-02  
SpecRevision: 2
Implementation: not started

## 1. この文書の目的

Hikariで観察している透明体は、同じ形でも、形・カメラ・光源の相対関係が動くことで、
反射、透過、屈折、内部反射、集光、影が絶えず変化する。本仕様は、その変化を完成した一枚の
レンダリングへ早く畳み込まず、**形が光へ与えた作用ごとのレイヤー**として取り出し、
画面全体の環境映像へ再構成するための契約を定める。

同じ作品設定を二つの実行環境で共有する。

- M4 MacBook Air: 軽く、長時間安定するリアルタイム観察と作品構成
- RTX3080級GPU: 同じ時間・同じSeed・同じ構図を高解像度の連番画像へ定着

本仕様は実装指示ではなく、作者レビューのための設計基準である。2026-08-02の条件付き承認レビューを受け、
transport domain、共有台帳、temporal checkpoint、決定論の範囲をRevision 2で修正した。
末尾にはレビュー判断と、実装前に作るR0.5契約を記録する。UI・保存形式・現行光学処理はまだ変更しない。

## 2. 作品としての中心命題

> 形を拡大して見せるのではなく、形を動的に観察することで生じ続ける光の現象を、
> 画面全体の新しい環境として見せる。

背景のVisual Artは任意の装飾映像ではない。前景で今まさに回転している形、同じ光源、同じ内包、
同じ背景風景から発生した光学イベントを原因別に受け取り、別の時間・空間表現へ展開したものである。

HikariはBlenderの造形・仕上げ能力と競争しない。Hikari固有の役割は、同じ形の周囲を動くことと、
その運動から光景が絶えず生まれる因果関係を、リアルタイムに経験し保存できることである。

## 3. 目標と非目標

### 3.1 目標

1. 一度の共有光学計算からView／Receiverのdomainと経路属性を取り出し、原因別表示層を派生する。
2. 形・カメラ・光源の運動とレイヤー変化を同一の時間軸で結ぶ。
3. レイヤーへ個別の空間・時間・色エフェクトを適用し、全面映像へ再構成する。
4. 実際の形と影を前景に残し、背後へ同じ形由来のVisual Artを置けるようにする。
5. M4 MBAで最低30fpsを長時間維持する適応品質を持つ。
6. RTX3080級GPUで1080p、4K、将来はタイル分割8Kの連番を決定論的に出力する。
7. 完成合成だけでなく、原因別レイヤーと再現情報を保存する。

### 3.2 非目標

- Blender、DaVinci Resolve、After Effectsの代わりとなる一般映像編集機能
- 初期段階での完全なスペクトルレンダリング、偏光、波動光学、回折、干渉
- RealtimeとFinalのピクセル完全一致
- 全エフェクトをノードエディタとして自由接続すること
- M4 MBAで4K最終品質をリアルタイム表示すること
- 影を濃くしたり到達光を増やしたりして、物理量と表示量の区別を失うこと

## 4. 用語

- **Physical Source**: domain、terminal event、path属性を保持する合成前データ。排他的レイヤーとは限らない。
- **Display Layer**: Physical Sourceを抽出・派生して単独表示できるbuffer。
- **Art Layer**: Display Layerへ表示変換を施したもの。配置や時間は変えてよい。
- **Beauty**: Art Layer、実形状、影、地面を最終合成した表示または出力。
- **Observation Clock**: リアルタイムと連番出力が共有する作品時間。
- **Render Job**: 作品状態、時間軸、品質、出力条件を固定した再開可能なレンダリング指定。
- **Redistribution**: レイヤー内の光量を空間的に移動すること。総量を維持する処理と表示増幅を区別する。

## 5. 表示モード

### 5.1 NATURAL / 形態観察

現行Naturalを基準表示として残す。

- 実際の透明体と内包
- 背景または環境映像
- 地面／受光面
- 影、透過光、集光
- OrbitControlsと自動回転

このモードは、Visual Artが何から生まれたかを確認する基準であり、表現レイヤーで置き換えない。

### 5.2 PHENOMENON / 光景全面表示

形を画面から外し、形によって変換された現象だけを全画面へ展開する。

これはNatural画像の拡大ではない。受光面、光路方向、表面イベント、時間差などを、
選択したProjectionによって画面座標へ再配置する。

### 5.3 ENVIRONMENT COMPOSITE / 環境合成

作品の主画面候補。

```text
背景: 形から発生したArt Layersの全面光景
前景: 同じ時刻に実際に回転する透明体と内包
接地: 物理的な影と到達光
任意: 入射源となった作者撮影の風景映像
```

背景と前景は別映像を同期再生するのではなく、同じObservation Clockと同じOpticalSceneを読む。

### 5.4 DEBUG LAYERS / 検証表示

作品表示ではない。各domain source、派生Display Layer、共有台帳、マスク、経路属性をfalse colorで確認する。
Art Layerの魅力ではなく、原因分類の正しさとエネルギーの出所を検証する。

## 6. Optical Eventとdomain分類

View側で観測するradianceとReceiverへ到達するfluxは、同じ種類の量ではない。
Revision 2では「4つの排他的Physical Layer」を正本にせず、次のdomain・terminal event・path属性を正本とする。

### 6.1 View Domain

| id | terminal event | 意味 |
|---|---|---|
| `viewSurfaceReflection` | reflection | 外側表面で反射し、カメラへ捕捉されたradiance |
| `viewTransmission` | transmission | 形へ入り、最終的に外へ透過してカメラへ捕捉されたradiance |

### 6.2 Receiver Domain

| id | terminal event | 意味 |
|---|---|---|
| `receiverDelivery` | receiver hit | 受光面へ実際に到達したRGB flux |

View DomainとReceiver Domainを無加工のまま足して「総光量」と呼ばない。それぞれのdomainで集積・検証し、
Beautyでは明示したtone mappingとcomposite ruleによって画面上で重ねる。

### 6.3 Path Attributes

一つの経路は複数イベントを含むため、内部反射を排他的terminal layerにしない。

```ts
interface OpticalPathAttributes {
  internalBounceCount: number;
  hadInternalReflection: boolean;
  opticalPathLength: number;
  exitDirection: [number, number, number] | null;
  mediumIds: string[];
  inclusionIds: string[];
}
```

作品UI上の「内部反射」は、例えば次の派生表示層として作る。

```text
viewInternalReflection = viewTransmission where hadInternalReflection == true
receiverAfterInternalReflection = receiverDelivery where hadInternalReflection == true
```

同じ経路を`viewTransmission`と派生`viewInternalReflection`へ重ねて表示することは許すが、
それを物理的な光量の排他的分割とは呼ばない。

### 6.4 Diagnostics

| id | 意味 |
|---|---|
| `shadowCoverage` | 光源サンプルが遮られた割合。scalar maskでありRGB光量ではない |
| `absorbed` | 媒体内で吸収されたreceiver transport量 |
| `escaped` | receiver以外へ出た量 |
| `rejected` | containmentや無効経路として拒否された量 |
| `unresolved` | event上限などで解決できなかった量 |

補助バッファ:

- object mask / inclusion mask
- linear depth
- geometric normal
- screen motion vector
- receiver UV and receiver identity
- path attributesの可視化buffer

### 6.5 初期の4表示層

M4 MBAで最初に同時表示する作品上の表示層は次の4つとする。

1. `viewSurfaceReflection`
2. `viewTransmission`
3. `viewInternalReflection`（path属性から作る派生層）
4. `receiverDelivery`

`shadowCoverage`は前景の物理的な影または合成マスクとして使い、暗いRGB絵を別生成しない。
`absorbed`、`rejected`、`unresolved`は最初はDebug／音への入力候補とし、黒い装飾として足さない。

### 6.6 共有transport台帳

保存則を確認する単位は個別レイヤーではなく、同じframeの共有transport全体とする。
View radianceとReceiver fluxは次元が異なるため、同じ構造に記録しても互いを加算してclosureを主張しない。

```ts
type Vec3 = [number, number, number];

interface FrameTransportLedger {
  receiver: {
    emittedFluxRgb: Vec3;
    deliveredFluxRgb: Vec3;
    absorbedFluxRgb: Vec3;
    escapedFluxRgb: Vec3;
    rejectedFluxRgb: Vec3;
    unresolvedFluxRgb: Vec3;
  };
  view: {
    capturedRadianceIntegralRgb: Vec3;
    sampleWeight: number;
  };
}

interface LayerStats {
  capturedRgb: Vec3;
  domain: "view" | "receiver";
  derivedFrom?: string;
  redistributed: boolean;
  displayGain: number;
}
```

- receiver transportのclosureは`FrameTransportLedger.receiver`だけで確認する。
- 派生層は`derivedFrom`を持ち、source/emitted量を複製しない。
- Art処理が総量を保存する場合は`redistributed=true`と記録する。
- 表示上のgain、threshold、色変換で値を増幅する場合は`displayGain`として記録する。
- Beautyの明るさを物理的な光量と誤認させない。NaturalとDebugではgainを無効化できる。
- 影を濃くして光が増えたように見せる処理と、到達光を別の場所へ再配置する処理を区別する。

## 7. Art Layer処理

初期段階では自由なノードエディタを作らず、各Display Layerに同じ小さな処理列を持たせる。

```text
Physical Source -> Display Layer
  -> Projection
  -> Spatial Treatment
  -> Temporal Treatment
  -> Color Treatment
  -> Layer Composite
```

### 7.1 Projection

`screen`  
: 現在の画面位置を使う。前景との因果関係が最も読みやすい。

`receiver`  
: 受光面UVを全画面へ展開する。地面に生じた光を風景として扱う。

`direction`  
: 出射方向を画面座標へ写す。屈折や内部反射を流れとして見る。

`surface-unfold`  
: 将来候補。表面イベントを安定した形状座標へほどく。初期実装には含めない。

最初の作品候補は`receiverDelivery=receiver`、`viewSurfaceReflection`と`viewTransmission`、
そこから派生する`viewInternalReflection`を`screen`へ置く。`direction`はR2の観察後に追加判断する。

### 7.2 Spatial Treatment

- energy-normalized blur / diffusion
- direction fieldに沿う短距離advection
- edge / ridge extraction
- scale-preserving displacement
- point / fog / ribbon presentation
- layer-local cropではなく、正規化座標による全面配置

### 7.3 Temporal Treatment

- exponential feedback
- fixed-duration trail
- layer delay
- decay / settle
- frame-to-frame advection

時間処理は実フレーム時間ではなくObservation Clockの`deltaTime`を使う。
停止時に背景が静まるか、蓄積を保持するかはプリセットで明示する。

### 7.4 Color Treatment

- linear exposure
- white balance
- layer tint
- luminance-to-palette mapping
- limited dispersion accent

Physical SourceのRGBと表示色を別に保持する。作者の風景映像から抽出した色をpaletteとして使う場合も、
元の光量統計は上書きしない。

## 8. 動きと時間

### 8.1 一つの作品時間

RealtimeとFinalは同じ時刻評価関数を使う。

```ts
interface ObservationTime {
  timeSeconds: number;
  frameIndex?: number;
  sampleIndex?: number;
  deltaSeconds: number;
}
```

Finalでは必ず次で時間を決める。

```text
timeSeconds = frameIndex / fps
```

処理速度、画面の実fps、`requestAnimationFrame`の揺れを作品時間へ混ぜない。

停止操作は次の三つを分ける。

| 操作 | Observation Clock | 形／光学入力 | Art temporal state |
|---|---|---|---|
| `object-motion-hold` | 進む | poseだけ固定 | 進む |
| `timeline-pause` | 停止 | 停止 | 完全停止 |
| `hold-input-continue-effect` | 進む | 最後の光学入力を固定 | settle / feedbackを継続 |

UIの「停止」はどの操作かを明示し、暗黙にClockと形を同時停止しない。

### 8.2 動かせるもの

- object rotation / whole-object pose
- camera orbit
- light direction or sun time
- inclusion-local transform
- background media time
- Art Layer parameter timeline

初期作品では、**形の回転を主運動**とする。カメラ回転と形回転を同時に使えるが、
どちらが現象変化の原因か読めなくなるため、既定プリセットでは片方だけを動かす。

### 8.3 背景風景映像

作者撮影の風景は三つの役割を区別する。

1. `visibleBackdrop`: そのまま見える背景
2. `opticalEnvironment`: 反射・透過がサンプリングする入射環境
3. `artPaletteSource`: Art Layerの色または時間変化の参照

初期実装は1と、現在可能な範囲の2を使う。3は後続。役割を暗黙に兼用しない。

Finalでは動画の通常再生時刻へ依存せず、source fpsと開始offsetから取得frameを固定する。

```text
mediaFrame = floor((mediaStartSeconds + timeSeconds) * sourceFps)
```

可変fps素材は事前に固定fpsへ変換するか、timestamp tableをasset manifestへ保存する。

## 9. 共有レンダリング構造

### 9.1 原則

現象ごとに別のray traceを実行しない。一つの光路計算がイベント分類を出力し、
複数の低解像度ターゲットへ振り分ける。

```text
ShapeSource + OpticalScene + ObservationTime
                |
                v
        Shared optical events
                |
        +---------------+----------------+
        v               v                v
    View Domain     Receiver Domain   Path Attributes
  reflection/transmission   delivery   bounce/path/exit
        |               |                |
        +---------------+----------------+
                v
       derived Display Layers
                v
          Art Layer passes
                v
 Natural / Phenomenon / Environment Composite
```

### 9.2 CPU読み戻し

リアルタイム表示中はGPU textureをCPUへ読み戻さない。統計は既存の小さな集計値、
または低頻度の明示的な診断だけにする。画像の`readPixels`は連番保存時に限定する。

### 9.3 RealtimeとProgressive

- Realtime: 現在の近似を使い、動きに追従する。
- Progressive/Final: より深い境界経路、サンプル蓄積、固定フレーム評価を許可する。
- 二つは同じLayer ID、色空間、時間、保存契約を使う。
- ピクセル一致ではなく、同じ原因層が同じ方向へ変化することを求める。

## 10. M4 MacBook Air性能仕様

M4 MBAはファンレスであるため、短時間の最大fpsではなく持続性能を基準にする。

### 10.1 Preview既定値（初期目標）

| 項目 | 既定目標 |
|---|---:|
| 表示 | 30fps以上、可能なら前景60fps |
| 光学レイヤー更新 | 15–30Hz |
| Art Layer内部解像度 | 512–768px長辺、上限1024px |
| 同時作品層 | 4 |
| texture format | 原則RGBA16F、非HDR補助はR8/RG16F |
| realtime内部反射 | 現行上限から開始し、適応的に削減 |
| CPU image readback | 0回/frame |

### 10.2 適応品質の順序

33.3ms/frameを継続して超えた場合、作品構図を変えにくい順で負荷を下げる。

1. 光学レイヤー更新頻度
2. レイヤー内部解像度
3. samples/update
4. temporal effect精度
5. 内部反射上限

前景の形、回転速度、カメラ、Beautyの画面解像度を最初に落とさない。
品質が回復しても即座に上げず、ヒステリシスを持たせる。

### 10.3 持続性能受け入れ条件

- M4 MBAでEnvironment Compositeを20分連続実行する。
- 既定作品でp95 frame timeが33.3ms以下、または適応後30fpsを維持する。
- 熱による性能低下後も操作を失わず、品質段階だけが下がる。
- memoryが継続的に増加しない。
- 自動回転、停止、再開でfeedback bufferが破損しない。
- 内包数が上限へ増えても、固まらず明示的に品質を下げる。

## 11. RTX3080 Final Render仕様

### 11.1 目的

M4で決めた作品を別の見え方へ作り直すのではなく、同じRender Jobを高解像度・高サンプルで定着する。

### 11.2 初期Final profile

| 項目 | 初期値 |
|---|---:|
| 解像度 | 1920×1080 / 3840×2160 |
| fps | 24 / 30 / 60 |
| sampling | 256–4096 spp相当を選択 |
| boundary event上限 | 4–8を品質設定で選択 |
| color | linear HDR内部処理 |
| 出力 | PNG連番を第一実装 |
| 再開 | 未完了frameから再開 |

数値は品質保証ではない。固定ケースでノイズ、経路未解決、layer flux、Naturalとの差を記録する。

### 11.3 連番を正本とする

直接H.264/HEVCへエンコードしない。最初の正本はフレーム連番とRender Jobである。

```text
project-name/
  render-job.json
  render-progress.json
  assets.json
  beauty/frame_000000.png
  beauty/frame_000001.png
  layers/view-reflection/frame_000000.png
  layers/view-transmission/frame_000000.png
  layers/view-internal-derived/frame_000000.png
  layers/receiver-delivery/frame_000000.png
  masks/shadow/frame_000000.png
  metadata/frame_000000.json
  temporal-checkpoints/checkpoint_000600.bin
  temporal-checkpoints/checkpoint_001200.bin
```

途中停止しても、完了済みframeの設定hashが一致する場合だけ続きから再開する。
動画化、音との同期、最終色調整は外部編集ソフトへ渡す。

temporal feedbackやframe-to-frame advectionを使うframeは直前までの状態を必要とする。
Render Jobは次のどちらかのresume policyを必ず持つ。

1. `replay-from-start`: 出力を省略しながらframe 0から状態だけを再計算する
2. `nearest-checkpoint`: 直前のcheckpointから状態を復元して再計算する

長尺Finalの既定は`nearest-checkpoint`とし、初期checkpoint間隔は600 frameを候補とする。
checkpointはfeedback、advection、delay bufferとその解像度、色空間、state hashを含む。

### 11.4 出力形式の段階

1. PNG 8bit Beauty: 実装確認
2. PNG 16bit Beauty + selected layers: 最初の作品出力
3. OpenEXR half-float multilayerまたはレイヤー別EXR: 後続候補

OpenEXRはブラウザ依存・保存帯域・追加依存を評価してから導入する。最初の作品をEXR実装待ちにしない。

Beauty PNGはtone mappingと出力色空間を適用した表示画像としてよい。Physical SourceまたはDisplay Layerを
PNG 16bitへ保存する場合は、frame metadataへ次を必ず記録する。

- source color space / transfer function
- linear rangeとnormalization scale
- exposure適用の有無と値
- clampした最小／最大値とclipped pixel count
- 復元時に掛けるRGB scale

このmetadata無しのPNG 16bitを、再利用可能な物理層とは呼ばない。

### 11.5 高解像度とタイル

4Kで単一bufferが安定しない場合、overlap付きタイルへ分ける。

- 光学計算はタイルfrustumで決定論的に評価する。
- spatial blurだけなら必要な余白を各タイルへ付ける。
- temporal feedback／advection stateはタイルごとに独立させない。原則として光学入力だけをタイル化し、
  結合したfull-frame sourceへ時間処理を適用する。
- full-frame temporal stateがGPUメモリへ収まらない場合は、全体状態を共有できるout-of-core設計を別途承認する。
- crop後に結合しても継ぎ目が出ないことを固定画像で検証する。
- 8Kはタイル実装後の目標であり、初期受け入れ条件にしない。

## 12. Render Job保存契約

`.hkr`の編集可能な作品状態を利用し、その上に映像と出力指定を追加する。
既存`.hkr`を破壊せず、versionedな`artRender`セクションまたは別のRender Jobとして持つ。

```ts
interface HikariArtRenderJob {
  format: "hikari-art-render";
  formatVersion: 1;
  sourceDocumentHash: string;
  sourceViewId: string;
  opticalSceneRevision: string;
  jobSeed: string;
  assets: {
    id: string;
    path: string;
    contentHash: string;
    role: "shape" | "inclusion" | "backdrop" | "opticalEnvironment" | "palette";
    sourceFps?: number;
    frameTimestamps?: number[];
  }[];
  timeline: {
    durationSeconds: number;
    fps: 24 | 30 | 60;
    objectMotion: MotionTrack;
    cameraMotion: MotionTrack;
    lightMotion?: MotionTrack;
    mediaStartSeconds?: number;
  };
  layers: LayerRecipe[];
  composite: CompositeRecipe;
  quality: PreviewQuality | FinalQuality;
  temporal: {
    resumePolicy: "replay-from-start" | "nearest-checkpoint";
    checkpointIntervalFrames: number;
    temporalStateHash: string;
  };
  output: OutputRecipe;
}
```

必須条件:

- 乱数は文字列連結や加算ではなく、型付きtupleのhashから決定する。

```ts
randomSeed = hash64(
  jobSeed,
  frameIndex,
  pixelX,
  pixelY,
  sampleIndex,
  sampleDimension,
  layerId,
);
```

- 配列順やGPU処理時間からSeedを作らない。
- カメラ、形、内包、背景映像の時刻を同じtimelineから評価する。
- Art effectの半径・速度は固定pixelだけでなく、正規化画面寸法または作品単位で保存する。
- Render JobはHikari version、commit、backend、既知の近似を記録する。
- 背景動画、環境画像、形状、内包、palette sourceはasset manifestのcontent hashで固定する。
- 再開時はdocument、assets、quality、temporal stateのhashが一致しなければ同じ出力先へ続けない。
- adaptive qualityを使ったPreview記録は、品質段階と変更frameをquality historyへ残す。

### 12.1 決定論の保証範囲

| 条件 | 要求 |
|---|---|
| 同じHikari commit・同じbackend・同じquality profile | frame pixelまたは規定hash一致 |
| 同じGPU familyでもdriver／browserが異なる | 許容差内のpixel差とLayerStats一致 |
| M4とRTX、または異なるbackend | pixel一致を要求せず、固定ケースの構造・統計・flux許容差を要求 |

「同じRender Job」だけを根拠に、異なるGPU間のbit-identicalを主張しない。

## 13. UI仕様

### 13.1 通常UI

上位切替:

```text
NATURAL | PHENOMENON | ENVIRONMENT
```

作品編集時だけ開く項目:

- Layer visibility / solo
- Projection
- intensity / display gain
- spatial spread
- temporal persistence
- palette / tint
- foreground object / receiver / shadow visibility

Naturalの既存光学操作と混ぜて一つの長いパネルにしない。

### 13.2 展示表示

- UIを完全に隠すfullscreen
- 自動回転の開始／停止
- 作品プリセットの読み込み
- backend、適応品質、エラーは隠れたdiagnostic overlayで確認可能
- 入力が無い場合も一定時間後に壊れず循環する

### 13.3 Render Queue

```text
PROFILE       RTX FINAL
RESOLUTION    3840 × 2160
FPS           30
DURATION      02:00
FRAMES        0–3599
SAMPLES       512 / frame
OUTPUT        Beauty + 4 Layers + Shadow
STATUS        816 / 3600
ACTION        Start / Pause / Resume / Cancel
```

Cancelは完了済みフレームを削除しない。設定が変わった場合、同じ出力先へ暗黙に続きを書かない。

## 14. 実装段階

### R0 — 仕様レビュー

- 条件付き承認レビューを受け、Revision 2でdomain分類、共有台帳、checkpoint、決定論を修正した。
- production変更なし。

### R0.5 — Optical Event Contract

- BODY / CPU receiver / WebGPU receiverの現行経路を棚卸しする。
- View／Receiverのtransport domainを定義する。
- terminal eventとpath historyを定義する。
- backendごとに出せる属性／出せない属性を表にする。
- 共通`OpticalEvent`型と、欠損属性を推測せず表す方法を決める。
- 固定ケースで、同じ経路がbackendごとにどこまで同じ分類になるかを測る。

Exit: productionの4bufferを作る前に、型、backend capability matrix、固定ケース、未解決属性がレビュー可能である。

### R1 — Optical Eventの計測表示

- 一つの共有光学結果からViewの2 source、Receiverの1 source、path attributes、shadow maskを出す。
- path属性から`viewInternalReflection`を派生し、4つのDisplay Layerを単独表示する。
- DEBUG LAYERSでdomain、terminal event、共有台帳、派生元を確認する。
- Art effectはまだ最小限。

R1は美しい4枚を作る段階ではない。光の出来事を誤分類せず観察可能にする計測器を作る段階である。
反射が作品層として弱い、receiverだけが面白い、内部反射の取得が不安定という結果も有効なObservationとする。

### R2 — PHENOMENON

- receiverとscreen Projectionを実装する。
- blur、feedback、色変換を一種類ずつ実装する。
- 形の自動回転で全面光景が連続変化する。

### R3 — ENVIRONMENT COMPOSITE

- 全面背景の上へ、同時刻の形と影を合成する。
- 作者撮影の背景動画をvisibleBackdrop / opticalEnvironmentとして接続する。
- UI非表示の展示表示を追加する。

### R4 — M4持続性能

- adaptive qualityと品質表示を実装する。
- 20分持続試験とメモリ監査を行う。
- 性能不足を作品層の削除ではなく、更新頻度・内部解像度の調整で解決する。

### R5 — Deterministic Sequence

- Observation Clockをframe固定評価できるようにする。
- 最初の技術成果物として1080p PNG 8bit Beauty連番を実装する。
- temporal checkpoint、停止、再開、asset manifest、Render Job保存を実装する。
- 同じframeを二度出力しhashまたはpixel差が一致することを確認する。

### R6 — RTX Final

- 最初の作品用masterとしてPNG 16bit Beauty + selected layersを接続する。
- 4K、追加samples、深い経路、レイヤー別連番を接続する。
- Windows RTX3080 Chromeで長尺ジョブを試す。
- 必要ならブラウザUIと同じRender Jobを読む専用local rendererを後続で作る。

### R7 — HDR / Tile / Finishing Bridge

- PNG 16bit、OpenEXR、overlap付きtileを必要性順に追加する。
- ffmpegまたは編集ソフト向けの読み込み手順を文書化する。

## 15. 受け入れ条件

### 15.1 因果関係

- 同じ形を回転すると、NaturalとArt Layersが同じ時刻に変化する。
- `object-motion-hold`は時計を進めたままposeだけ固定する。
- `timeline-pause`は時計、光学入力、temporal stateを同時に停止する。
- `hold-input-continue-effect`は入力を固定し、時間処理だけを規定どおりsettleまたは保持する。
- 背景Artを非表示にすると、前景の形と物理的な影がNatural基準と一致する。
- 別の形を読み込むと、同じエフェクト設定でも異なる光景になる。

### 15.2 物理層

- Viewの2 source、Receiverの1 source、path attributesは別traceではなく一つの共有イベント系列から生成される。
- 内部反射表示は`hadInternalReflection`から作る派生層であり、排他的terminal layerとして二重計上しない。
- View radianceとReceiver fluxを無加工で加算しない。
- 保存則は個別LayerStatsではなく共有`FrameTransportLedger.receiver`で確認する。
- `receiverDelivery`のredistribution前後でRGB fluxが許容誤差内に保たれる。
- `shadowCoverage`をRGB光量として加算しない。
- 未解決経路と吸収量を成功した内部反射として分類しない。

### 15.3 表現

- PHENOMENONはNatural画像の単純な拡大ではない。
- ENVIRONMENT背景と前景形状が同じObservation Clockを読む。
- UIを隠した状態で画面全体が一つの作品として成立する。
- 低解像度Art Layerが拡大されたpixel画像として見えず、時間的・空間的処理の意図として見える。

### 15.4 性能と出力

- M4 MBAで既定作品が20分安定する。
- RTX Finalで同じRender Jobを1080pと4Kへ出せる。
- 同じcommit・backend・quality profileでは同じframeが規定hashまたはpixel一致になる。
- 異なるGPU／backend間ではbit一致を要求せず、固定ケースの許容差とLayerStatsを満たす。
- temporal effectを含む途中停止後、最初からのreplayまたは一致するcheckpointから再開できる。
- asset content hashが変わったRender Jobは再開を拒否する。
- Beautyと個別レイヤーが同じframe番号・時間・色管理を共有する。

## 16. 既知のリスク

1. 現行BODY、CPU receiver、WebGPU receiverの経路ロジックが並行実装であり、Layer分類が漂流する可能性。
2. Realtimeの内部反射近似では、Finalと同じLayerへ分類できない未解決経路がある。
3. temporal feedbackは低解像度を魅力へ変えられる一方、物理変化を隠す危険がある。
4. ブラウザから数千枚を保存する場合、File System Access API、容量、権限、再開方法に制約がある。
5. PNG 16bitとEXRはブラウザ標準だけでは完結しない可能性がある。
6. 4K multilayerはGPUメモリだけでなく、保存帯域とディスク容量が支配的になる。
7. 背景動画を光学環境へ使う場合、動画デコード時刻とFinal frame時刻の決定論性を確認する必要がある。
8. temporal checkpointの容量と保存頻度が、長尺4K作品では大きなI/O負荷になる。
9. PNG 16bit Physical Sourceのnormalization metadataを欠くと、後工程で光量を復元できない。

## 17. 作者レビューの決定記録

2026-08-02の条件付き承認レビューをRevision 2へ反映した。選択は次で固定する。

| 項目 | 決定 | 仕様への反映 |
|---|---|---|
| Q1 主画面 | A | ENVIRONMENT COMPOSITEを作品の主画面とする |
| Q2 初期表示層 | Aを修正 | 4表示層は維持し、内部正本はView／Receiver domainとpath属性へ分ける |
| Q3 光量 | A | Physical Sourceを保存し、Artでは記録されたdisplay gainを許す |
| Q4 回転 | A | 形が回転し、既定カメラは固定する |
| Q5 Projection | A | 最初はreceiver + screen。directionとsurface-unfoldは後続 |
| Q6 成果物 | B → A | R5でPNG 8bit Beauty技術成果物、R6でPNG 16bit Beauty + selected layers作品master |
| Q7 Final入口 | A | Windows Chrome Render Queueから開始し、保存／再開が破綻した場合だけ専用rendererへ移行 |
| Q8 背景風景 | A | visibleBackdrop + opticalEnvironment。Finalではasset hashとsource frameを固定 |
| Q9 品質低下 | A | 展示時は自動適応し、品質変更履歴を保存する |

この決定でQ1〜Q9のblocking choiceは解消した。ただしproduction実装開始にはR0.5の
Optical Event Contractレビューが必要である。

## 18. 次に作る実装指示書

次に独立タスク化するのはR1ではなく、**R0.5 Optical Event Contract**である。
R0.5ではproduction bufferやArt effectを追加せず、次を証明する。

1. BODY / CPU receiver / WebGPU receiverの現在のイベントと欠損属性を列挙できる。
2. View radianceとReceiver fluxが別domainとして型に現れる。
3. terminal eventとpath historyを同じ列挙値で混同しない。
4. 内部反射を`hadInternalReflection`と`internalBounceCount`で表せる。
5. backend capability matrixが、取得できない属性を推測値で埋めない。
6. 固定ケースで共通分類とbackend固有差を測定できる。

R0.5の型と固定ケースをレビューした後、R1を「4枚の映像を作る段階」ではなく、
**光の出来事を誤分類せず観察可能にする計測器**として実装する。
R1のObservationを見てから、どのDisplay Layerに作品としての可能性があるかを作者が選び、R2の表現を決める。
