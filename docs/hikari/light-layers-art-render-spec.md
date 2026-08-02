# Hikari Light Layers / Visual Art Render — 設計仕様書

Status: proposal for author review  
UpdatedAt: 2026-08-02  
Implementation: not started

## 1. この文書の目的

Hikariで観察している透明体は、同じ形でも、形・カメラ・光源の相対関係が動くことで、
反射、透過、屈折、内部反射、集光、影が絶えず変化する。本仕様は、その変化を完成した一枚の
レンダリングへ早く畳み込まず、**形が光へ与えた作用ごとのレイヤー**として取り出し、
画面全体の環境映像へ再構成するための契約を定める。

同じ作品設定を二つの実行環境で共有する。

- M4 MacBook Air: 軽く、長時間安定するリアルタイム観察と作品構成
- RTX3080級GPU: 同じ時間・同じSeed・同じ構図を高解像度の連番画像へ定着

本仕様は実装指示ではなく、作者レビューのための設計基準である。未決事項は末尾に分離し、
承認前にUI・保存形式・現行光学処理を変更しない。

## 2. 作品としての中心命題

> 形を拡大して見せるのではなく、形を動的に観察することで生じ続ける光の現象を、
> 画面全体の新しい環境として見せる。

背景のVisual Artは任意の装飾映像ではない。前景で今まさに回転している形、同じ光源、同じ内包、
同じ背景風景から発生した光学イベントを原因別に受け取り、別の時間・空間表現へ展開したものである。

HikariはBlenderの造形・仕上げ能力と競争しない。Hikari固有の役割は、同じ形の周囲を動くことと、
その運動から光景が絶えず生まれる因果関係を、リアルタイムに経験し保存できることである。

## 3. 目標と非目標

### 3.1 目標

1. 一度の共有光学計算から現象を原因別レイヤーへ振り分ける。
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

- **Physical Layer**: 光学イベントを原因別に集積した、合成前の線形HDRデータ。
- **Art Layer**: Physical Layerへ表示変換を施したもの。配置や時間は変えてよい。
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

作品表示ではない。各Physical Layer、総光量、マスク、経路分類をfalse colorで確認する。
Art Layerの魅力ではなく、原因分類の正しさとエネルギーの出所を検証する。

## 6. Physical Layerの初期分類

初期実装は、見た目ではなく**最後に何が起きたか／どの経路を通ったか**で分類する。
一つの光路が複数イベントを含む場合、イベント履歴を持ち、出力規則で主レイヤーと補助属性を決める。

| id | 現象 | 初期の意味 | RGB加算層 |
|---|---|---|---|
| `surfaceReflection` | 表面反射 | 外側表面で反射して視点または環境へ向かう光 | yes |
| `transmittedRefraction` | 透過・屈折 | 形へ入り、方向または色を変えて外へ出た光 | yes |
| `internalReflection` | 内部反射・TIR | 内部で1回以上反射してから見える／届く光 | yes |
| `receiverDelivery` | 到達・集光 | 受光面へ実際に到達したRGB flux | yes |
| `receiverNonArrival` | 非到達 | 吸収、境界拒否、未解決経路などで届かなかった量 | no; diagnostic |
| `shadowCoverage` | 遮蔽 | 光源サンプルが遮られた割合 | no; scalar mask |
| `absorption` | 吸収 | 入射量と出射／到達量の差 | no; diagnostic |

補助バッファ:

- object mask / inclusion mask
- linear depth
- geometric normal
- screen motion vector
- world-space exit direction
- optical path length
- bounce count
- medium id / inclusion id
- receiver UV and receiver identity

### 6.1 初期作品層

M4 MBAで最初に同時表示する作品層は次の4つに限定する。

1. `surfaceReflection`
2. `transmittedRefraction`
3. `internalReflection`
4. `receiverDelivery`

`shadowCoverage`は前景の物理的な影または合成マスクとして使い、暗いRGB絵を別生成しない。
`receiverNonArrival`と`absorption`は最初はDebug／音への入力候補とし、黒い装飾として足さない。

### 6.2 エネルギー契約

Physical Layerには、少なくとも次を記録する。

```ts
interface PhysicalLayerStats {
  sourceFluxRgb: [number, number, number];
  capturedFluxRgb: [number, number, number];
  rejectedFluxRgb: [number, number, number];
  unresolvedFluxRgb: [number, number, number];
}
```

- Physical Layer生成段階では、既存receiver transportのエネルギー台帳を破らない。
- Art処理が総量を保存する場合は`redistributed`と記録する。
- 表示上のgain、threshold、色変換で値を増幅する場合は`displayGain`として記録する。
- Beautyの明るさを物理的な光量と誤認させない。NaturalとDebugではgainを無効化できる。
- 影を濃くして光が増えたように見せる処理と、到達光を別の場所へ再配置する処理を区別する。

## 7. Art Layer処理

初期段階では自由なノードエディタを作らず、各Physical Layerに同じ小さな処理列を持たせる。

```text
Physical Layer
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

最初の作品候補は`receiverDelivery=receiver`、反射・屈折・内部反射=`screen`または`direction`とする。

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

Physical RGBと表示色を別に保持する。作者の風景映像から抽出した色をpaletteとして使う場合も、
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
        +-------+-------+-------+
        v       v       v       v
      reflect refract internal receiver
        |       |       |       |
        +-------+-------+-------+
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
  beauty/frame_000000.png
  beauty/frame_000001.png
  layers/reflection/frame_000000.png
  layers/refraction/frame_000000.png
  layers/internal/frame_000000.png
  layers/receiver/frame_000000.png
  masks/shadow/frame_000000.png
  metadata/frame_000000.json
```

途中停止しても、完了済みframeの設定hashが一致する場合だけ続きから再開する。
動画化、音との同期、最終色調整は外部編集ソフトへ渡す。

### 11.4 出力形式の段階

1. PNG 8bit Beauty: 実装確認
2. PNG 16bit Beauty + selected layers: 最初の作品出力
3. OpenEXR half-float multilayerまたはレイヤー別EXR: 後続候補

OpenEXRはブラウザ依存・保存帯域・追加依存を評価してから導入する。最初の作品をEXR実装待ちにしない。

### 11.5 高解像度とタイル

4Kで単一bufferが安定しない場合、overlap付きタイルへ分ける。

- 光学計算はタイルfrustumで決定論的に評価する。
- blur、advection、feedbackに必要な余白を各タイルへ付ける。
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
  seed: number;
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
  output: OutputRecipe;
}
```

必須条件:

- 乱数は`seed + frameIndex + sampleIndex + layerId`から決定する。
- 配列順やGPU処理時間からSeedを作らない。
- カメラ、形、内包、背景映像の時刻を同じtimelineから評価する。
- Art effectの半径・速度は固定pixelだけでなく、正規化画面寸法または作品単位で保存する。
- Render JobはHikari version、commit、backend、既知の近似を記録する。

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

- 本文書のLayer分類、三表示モード、M4基準、Final出力、未決事項を作者がレビューする。
- production変更なし。

### R1 — Physical Layerの可視化

- 一つの共有光学結果から4作品層とshadow maskを出す。
- DEBUG LAYERSで分類とfluxを確認する。
- Art effectはまだ最小限。

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
- 1080p PNG Beauty連番、停止、再開、Render Job保存を実装する。
- 同じframeを二度出力しhashまたはpixel差が一致することを確認する。

### R6 — RTX Final

- 4K、追加samples、深い経路、レイヤー別連番を接続する。
- Windows RTX3080 Chromeで長尺ジョブを試す。
- 必要ならブラウザUIと同じRender Jobを読む専用local rendererを後続で作る。

### R7 — HDR / Tile / Finishing Bridge

- PNG 16bit、OpenEXR、overlap付きtileを必要性順に追加する。
- ffmpegまたは編集ソフト向けの読み込み手順を文書化する。

## 15. 受け入れ条件

### 15.1 因果関係

- 同じ形を回転すると、NaturalとArt Layersが同じ時刻に変化する。
- 形を止めると、入力が固定され、時間処理だけが規定どおりsettleまたは保持する。
- 背景Artを非表示にすると、前景の形と物理的な影がNatural基準と一致する。
- 別の形を読み込むと、同じエフェクト設定でも異なる光景になる。

### 15.2 物理層

- 4作品層は別traceではなく一つの共有イベント系列から生成される。
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
- 同じSeed、frame、sample設定の再出力が決定論的である。
- 途中停止後、未完了frameから再開できる。
- Beautyと個別レイヤーが同じframe番号・時間・色管理を共有する。

## 16. 既知のリスク

1. 現行BODY、CPU receiver、WebGPU receiverの経路ロジックが並行実装であり、Layer分類が漂流する可能性。
2. Realtimeの内部反射近似では、Finalと同じLayerへ分類できない未解決経路がある。
3. temporal feedbackは低解像度を魅力へ変えられる一方、物理変化を隠す危険がある。
4. ブラウザから数千枚を保存する場合、File System Access API、容量、権限、再開方法に制約がある。
5. PNG 16bitとEXRはブラウザ標準だけでは完結しない可能性がある。
6. 4K multilayerはGPUメモリだけでなく、保存帯域とディスク容量が支配的になる。
7. 背景動画を光学環境へ使う場合、動画デコード時刻とFinal frame時刻の決定論性を確認する必要がある。

## 17. 作者レビューで決める項目

推奨案を先に示す。未回答でも実装へ進めない項目は`BLOCKING`とする。

### Q1 — 作品の主画面 `BLOCKING`

- A. ENVIRONMENT COMPOSITEを主画面にする（推奨）
- B. PHENOMENON全面を主画面にする
- C. 両方を同格にする

### Q2 — 初期Physical Layer `BLOCKING`

- A. 反射／透過屈折／内部反射／到達光の4層（推奨）
- B. 最初から吸収と非到達も作品層にする
- C. さらに少なく、屈折／内部反射／到達光の3層から始める

### Q3 — Art Layerの光量

- A. Physicalは保存し、Artでは明示的なdisplay gainを許す（推奨）
- B. Artでも常にflux保存を強制する
- C. 物理量表示を作品モードから完全に外す

### Q4 — 回転の主語 `BLOCKING`

- A. 形が回転し、カメラは原則固定（推奨）
- B. カメラが周回し、形は固定
- C. 両方を常に動かす

### Q5 — 最初のProjection

- A. receiver + screen（推奨）
- B. directionを最初から含める
- C. surface-unfoldを優先する

### Q6 — 最初の高解像度成果物

- A. PNG 16bit Beauty + 4レイヤー連番（推奨）
- B. PNG 8bit Beautyだけを先に完成させる
- C. OpenEXRまで待つ

### Q7 — Final rendererの入口

- A. まずWindows Chrome内のRender Queue（推奨）
- B. 最初から専用ローカルレンダラー
- C. Blenderへレイヤーデータを渡してレンダリング

### Q8 — 背景風景の初期役割

- A. visibleBackdrop + opticalEnvironment（推奨）
- B. visibleBackdropだけ
- C. Art paletteまで最初から接続する

### Q9 — 展示時の品質低下

- A. 自動適応し、隠れたoverlayで状態確認（推奨）
- B. 品質固定で、性能不足時はfps低下を許す
- C. 作品ごとに固定した軽量presetだけを使う

## 18. レビュー後に作る最初の実装指示書

レビュー後はR1だけを独立タスク化する。R1では全面アート表現を完成させようとせず、
次を証明する。

1. 現行形状と自動回転を壊さない。
2. 一度の共有計算から4つの原因別bufferが得られる。
3. 各bufferを単独表示できる。
4. receiver fluxとshadow coverageを混同しない。
5. M4 MBAでNaturalの操作性を大きく悪化させない。

R1の証拠を見てから、どのレイヤーに作品としての可能性があるかを作者が選び、R2の表現を決める。

