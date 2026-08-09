# Hikari Afterglow / 光の残光 設計 R0

作成日: 2026-08-03  
状態: 設計案・未実装  
対象: Hikari Flowの時間軌跡、発光、ブルーム  
並行対象: OPT-1（旧R1 Optical Observation）

## 1. 結論

この表現はHikariへ導入できる。RTX 3080なら十分に現実的だが、最初からRTX 3080専用にはしない。まず軽量設定を測り、一般環境では厳しい場合だけ高性能GPU向け実験機能へ絞る。

OPT-1と安全に並行するため、次を固定する。

1. 機能名は **Afterglow / 光の残光** とする。
2. receiver上の物理的な **Optical Light Drawing / 光の筆跡** とは別機能にする。
3. Natural Beauty、BODY shader、receiver、`FrameTransportLedger`、WebGPU 28-float payloadを変更しない。
4. 初期状態はoffとし、off時はGPU target、shader、履歴bufferを作らない。
5. 新規ファイルだけで作れるA1・A2はOPT-1と並行可能。本体renderer／UIへ接続するA3は関連するOPT-1 stageのGO後に行う。
6. BIKINIのコードは移植せず、表現原理だけをHikari向けに独自実装する。

## 2. 表現の原理

Afterglowは「光る筆で空間に線を描き、その線が時間とともに消える」仕組みである。

```text
Flow粒子の現在位置
  ↓ 一定時間または一定距離ごとに記録
過去位置の列（3D軌跡）
  ↓ 古い位置ほど暗く・細く描く
HDRの発光線
  ↓ 明るい部分の周囲を低解像度でぼかす
Bloom
  ↓ 前フレームの光を短時間だけ残す
Afterglow
```

時間減衰は次の考え方を使う。

```text
今回の残光 = 前回の残光 × exp(-経過秒 / 減衰時間) + 今回の発光
```

「毎フレーム何%消す」方式ではなく秒を使うため、30、60、120 fpsで消える時間が大きく変わらない。

### 2.1 二種類の履歴

| 履歴 | 意味 | 保存先 | camera移動時 |
|---|---|---|---|
| 3D軌跡 | 粒子が空間のどこを通ったか | 座標ring buffer | 正しい位置から見直せる |
| 画面残光 | 画面上に光がどれだけ残ったか | HDR texture | そのままだと画面に貼り付く |

主記憶は3D軌跡とする。画面残光は線を滑らかにする短い余韻だけに使う。cameraが動いた時は画面残光だけをresetし、3D軌跡は残す。

## 3. Optical Light Drawingとの境界

Hikariの「光の筆跡」には二つの意味があるため、データと名前を分ける。

| 項目 | Optical Light Drawing | Afterglow |
|---|---|---|
| 意味 | 形がreceiver上に生む物理的な集光 | Flowの動きが生む時間表現 |
| 入力 | ray hit、receiver deposit | particle position |
| 正しさ | 光学的な因果を守る | 見た目と時間感覚を優先 |
| 履歴 | optical accumulation | 3D trajectory + short feedback |
| OPT-1との関係 | 観測対象 | OPT-1外の独立Art Layer |

禁止事項:

- Afterglowをreceiver hitや光学energyとして記録しない。
- receiverの不足をAfterglowで補って光学結果に見せない。
- OPT-1のlayer、availability、ledgerへAfterglowを追加しない。
- Naturalの回帰基準画像へAfterglowを混ぜない。

## 4. 現在のtrailsとの差

現在の`hikari.ts`の`trails`は、過去の位置を保存していない。shader内で現在位置から見かけ上の尾を作り、加算合成した線分を描いている。

Afterglowでは次を追加する。

- 実際に曲がった過去の3D軌跡
- 秒単位で一定な時間減衰
- HDRの明るい芯
- bloomによる柔らかいhalo
- 前フレームを使う短い残光

既存`points / trails / density`は初版で削除しない。Afterglowと比較でき、いつでも既存表示へ戻せる状態を保つ。

## 5. 目標と非目標

### 5.1 目標

- Flowの運動が空間に描かれた発光線として読める。
- 芯、halo、自然な時間減衰を持つ。
- 30 / 60 / 120 fpsで同じ秒数後の長さと明るさが概ね一致する。
- cameraを回しても3D軌跡が空間内に留まる。
- off時のNatural、OPT-1、保存、書出し、操作感を変えない。
- RTX 3080では高密度・長い尾のHigh profileを選べる。

### 5.2 非目標

- path tracing、volume scattering、causticsの再実装
- OPT-1 observation layerへの追加
- BODY shader、receiver、transport契約の変更
- BIKINI / Blenderコードの流用
- 初版でのWebGPU compute化
- 初版での`.hkr`保存形式変更
- 初版でのKatachi feedback接続
- 既存trailsの即時削除

## 6. 推奨構成

```text
Flow particles
    │ 現在の3D位置
    ▼
AfterglowTrajectoryStore
    │ 粒子ごとの固定長ring buffer
    ▼
Trail Emission Pass
    │ HDRの明るい芯
    ▼
Temporal Feedback Pass ◀── 前フレームHDR
    │ 秒ベースで減衰
    ▼
Bloom Pyramid
    │ 低解像度で抽出・ぼかし・拡大
    ▼
Afterglow Composite
    │ Flow表示へ加算
    ▼
既存画面

OPT-1 Optical Observation ── 完全に別経路
Natural Beauty ───────────── off時は不変
```

### 6.1 軌跡データ

初版はCPU上の固定長`Float32Array` ring bufferを使う。粒子ごとのobjectや配列を毎frame作らない。

1 sampleの目安:

```text
position.xyz   12 bytes
age/time         4 bytes
intensity        4 bytes
width            4 bytes
optional data    8 bytes
合計目安        32 bytes
```

記録条件は毎frame固定ではなく、次のどちらかを満たした時とする。

- 前回sampleから一定時間が経過した。
- 前回sampleから一定距離以上動いた。

静止中の重複sampleを抑え、速い動きでは線が途切れにくくなる。上限を超えたら最古sampleを上書きし、動作中にbufferを伸長しない。

| profile | 粒子数 | 履歴/粒子 | 最大sample | 軌跡memory目安 |
|---|---:|---:|---:|---:|
| Compatible | 2,000 | 24 | 48,000 | 約1.5 MB |
| Standard | 5,000 | 32 | 160,000 | 約5.1 MB |
| RTX 3080 High | 8,000 | 64 | 512,000 | 約16.4 MB |

### 6.2 発光線

発光は8-bit画面へ直接描かず、`RGBA16F`のHDR targetへ描く。これにより芯を白く保ったまま、周囲だけをbloomで広げられる。

初版は実装が単純なline segment方式を使う。品質不足が確認された場合だけcamera-facing ribbonへ拡張する。

- core: 細く、明るい線
- halo source: coreより弱く、bloomへ渡す成分
- age: 古いほど指数的に弱める
- head: 現在位置付近だけ少し強める

### 6.3 Temporal feedback

HDR履歴textureを2枚用意し、readとwriteを毎frame交換するping-pong方式とする。

```text
historyNext = historyPrev × exp(-dt / decaySeconds) + emissionCurrent
```

制約:

- bloom後の画像をhistoryへ戻さない。ぼけとenergyが増殖するため。
- `dt`をclampし、長時間停止後は画面履歴をresetする。
- emissionが0なら必ず暗くなり続けることをtestする。
- camera revision変更時は画面履歴だけをresetする。

### 6.4 Bloom

画面全体をfull-resolutionで何度もぼかさず、低解像度pyramidで作る。

1. HDRから明るい部分をsoft thresholdで抽出する。
2. 1/2、1/4、1/8へ縮小する。
3. 各段を少ないsample数でぼかす。
4. 拡大しながら足し戻す。
5. coreとhaloを最後に合成する。

RTX 3080 Highでは段数とsample数を増やせるが、基本構造は共通にする。

### 6.5 GPU / shader

初版は既存Flowと接続しやすいWebGL2とする。

| pass | 入力 | 出力 | 役割 |
|---|---|---|---|
| Trail emission | trajectory buffer | HDR emission | age・幅・強度を反映した線 |
| Temporal feedback | 前履歴 + emission | 次履歴 | 秒ベース減衰 |
| Bright extract | 次履歴 | half-res texture | bloom対象抽出 |
| Downsample / blur | bloom levels | bloom levels | halo生成 |
| Composite | core + bloom | Flow output | 最終加算 |

WebGPU computeへ移すのは、測定でCPU更新やdraw callが明確なbottleneckになった場合だけとする。OPT-1のWebGPU optics bufferとは共有しない。

## 7. Reset規則

### 7.1 3D軌跡と画面履歴をreset

- shape revision
- Flow seed
- 粒子数・spawn方式
- Afterglow profile
- trajectory format / shader version
- featureをoffからonへ戻した時

### 7.2 画面履歴だけreset

- cameraの位置・回転・projection
- canvas resize / pixel ratio
- tab復帰などの大きな時間飛び
- HDR target再生成

通常の粒子移動、bloom強度の小調整、panel開閉ではresetしない。

## 8. OPT-1と衝突させない境界

### 8.1 並行中に新規作成してよいファイル

```text
src/studies/cloud-sculpt/afterglow/
  types.ts
  trajectoryStore.ts
  trajectoryGeometry.ts
  shaders.ts
  bloomPyramid.ts
  afterglowRenderer.ts
  lifecycle.ts

tests/hikari/afterglow/
  trajectoryStore.test.ts
  decay.test.ts
  lifecycle.test.ts
  shaderContract.test.ts
```

A1・A2ではproduction runtimeへimportしない。moduleの契約、計算、resource lifecycleだけを実装・検証する。

### 8.2 OPT-1のGO後にだけ触れる統合点

- Flow particle positionをAfterglowへ渡すadapter 1か所
- render loopから`update()` / `render()`を呼ぶhook 1か所
- Flow UIのAfterglow section 1か所

OPT-1が変更中の`renderer.ts`、`shaders.ts`、`main.ts`、`ui.ts`へ並行して直接差分を作らない。統合commitは、対象ファイルを含むOPT-1 stageがGOになった新baselineから作る。

### 8.3 変更禁止

- `OpticalScene`と光学event taxonomy
- `FrameTransportLedger`のclosure
- WebGPU result payload v1 / 28-float layout
- receiver fieldのdeposit、sample、march
- BODY Natural shader出力
- OPT-1のMRT attachment、availability、path code
- `?debugLayers=1`とDEBUG LAYERS UI
- `.hkr`、Render Job、PNG/EXR、manifest version

### 8.4 作業・commit境界

- OPT-1作業treeへ混ぜず、別branch / worktreeを使う。
- 各段階を独立commitにする。
- OPT-1の未commit差分をbaselineにしない。
- 双方が触れる統合点は片方ずつreviewする。

## 9. 実装段階

### GLOW-A0 — 設計固定

本書をreviewし、名称、境界、profile、非目標を確定する。コード変更なし。

### GLOW-A1 — 軌跡contractとCPU store

新規`afterglow/`とtestだけを追加し、runtimeへ接続しない。

- 固定長ring buffer
- time / distance sampling
- age計算
- reset reason
- profile別capacity
- dispose / 再初期化

完了条件:

- 30 / 60 / 120 fps相当入力で時間長が一致する。
- allocationが上限を超えて増えない。
- OPT-1 / Natural production file差分が0。

### GLOW-A2 — 独立描画harness

Afterglow専用の検証画面またはoffscreen harnessでemission、feedback、bloomを確認する。Hikari本体へは表示しない。

完了条件:

- emission停止後に単調に暗くなる。
- bloomをfeedbackへ戻していない。
- resize / camera revision / disposeでresource leakがない。
- CompatibleとRTX 3080 Highを切り替えられる。

### GLOW-A3 — Flowへのflag付き統合

関連OPT-1 stageのGO後、最小hookだけを追加する。

暫定flag:

```text
?afterglow=1
```

flagなしではGPU resourceを作らない。可能ならdynamic importとし、通常起動の初期costも避ける。

完了条件:

- flag offでtarget 0、shader compile 0、animation update 0。
- flag offのNatural pixel regressionがOPT-1基準内。
- `?debugLayers=1`との併用でtarget/stateを壊さない。
- 既存`points / trails / density`へ戻せる。

### GLOW-A4 — 品質・性能調整

| profile | emission解像度 | bloom段数 | 想定 |
|---|---|---:|---|
| Compatible | 1/2 | 3 | M4を含む一般環境 |
| Standard | 1/2 | 4 | discrete GPU |
| RTX 3080 High | 1/2、実測後にfull候補 | 5 | 高密度・長い尾 |

負荷を下げる順序:

1. bloom段数を減らす。
2. emission / history解像度を下げる。
3. 1粒子の履歴数を減らす。
4. 粒子数を減らす。
5. それでも不足する環境ではoffにする。

### GLOW-A5 — 作者の見た目判定

同じ形・seedで次を比較する。

- 既存trails
- Compatible / Standard / RTX 3080 High
- feedbackなし / あり
- bloom弱 / 中 / 強

作者が「形の運動を読める」「白く潰れない」「光の線に見える」と判断した時だけ通常UI候補へ進める。

## 10. UI案

Flow内に閉じた`Afterglow / 光の残光` sectionを置く。OpticsやDEBUG LAYERSには置かない。

| 表示名 | 内部意味 |
|---|---|
| 軌跡の長さ | 3D履歴秒数 / sample capacity |
| 消える時間 | feedback decay seconds |
| 光の広がり | bloom radius / level weights |
| 明るさ | emission intensity |

profile、芯の太さ、頭の強さ、thresholdはAdvancedへ置く。保存形式への追加は初版では行わない。

## 11. 性能・memory予算

実測前の設計上限:

| 項目 | Standard目標 | RTX 3080 High目標 |
|---|---:|---:|
| effect GPU time p95 | 4 ms以下 | 4 ms以下 at 2560×1440 |
| trajectory memory | 8 MB以下 | 24 MB以下 |
| effect用GPU memory | 64 MB以下 | 128 MB以下 |
| 表示目標 | 30 fps以上 | 60 fps以上 |
| 連続確認 | 3分 | 5分 |

`RGBA16F` full HD textureは1枚約16.6 MBである。2枚のfull-resolution履歴で約33 MBになるため、初期設定はhalf-resolutionを基本とする。half-resolutionの履歴2枚は合計約8.3 MBになる。

判断:

- M4でCompatibleが成立: 通常機能として継続。
- M4では厳しいがRTX 3080で安定: 高性能GPU向け実験機能として継続。
- RTX 3080でも時間、memory、白飛びを制御できない: 統合を見送る。

## 12. Testと回帰gate

### 12.1 数値・lifecycle

- ring bufferの順序、wrap、capacity固定
- ageの単調増加と寿命後の除外
- 30 / 60 / 120 fps入力の減衰量一致
- emission 0でhistory luminanceが単調減少
- `NaN`、`Infinity`、負輝度なし
- time jump、resize、camera revisionのreset
- profile変更時の旧resource dispose
- ping-pong targetの同時read/write禁止
- bloom textureをhistory入力にしない
- viewport、scissor、target、autoClearの復元
- off時target 0、shader compile 0、listener 0

### 12.2 Hikari統合回帰

- `npm run test:hikari`
- build
- OPT-1 fixed cases
- Natural safe 0 / safe 1 pixel比較
- receiver fieldの数値・coverage不変
- WebGPU 28-float fixture不変
- `.hkr` round-trip不変
- flag offのDOMとperformance不変
- `?afterglow=1&debugLayers=1`併用

### 12.3 見た目

- 静止後、設定時間で線が消える。
- 高速運動で線が途切れすぎない。
- camera回転時に残像が画面へ貼り付かない。
- 芯とhaloを判別できる。
- 長時間表示で画面全体が白くならない。
- 効果なしより形の輪郭やFlow方向が読みやすい。

## 13. Riskと停止条件

| risk | 対策 | 停止条件 |
|---|---|---|
| energy増殖 | bloomをfeedbackへ戻さない、単調減衰test | emission停止後も明るくなる |
| camera smear | camera revisionでscreen history reset | resetしても貼り付く |
| frame依存 | 秒ベース減衰 | 30/120 fps差が目立つ |
| GPU負荷 | half-res、bloom pyramid、profile | RTX 3080でも予算超過 |
| memory leak | ownership明示、dispose test | 5分で増加が止まらない |
| OPT-1 conflict | 新規file先行、統合commit分離 | OPT-1契約変更が必要 |
| 用語混同 | Afterglow名称、UI分離 | receiverへの混入が必要 |
| API混在 | WebGL/WebGPU buffer非共有 | 毎frame readbackが必要 |

## 14. GO / NO-GO

### GO

- Flow専用の独立layerとして成立する。
- off時にNatural、OPT-1、receiver、保存、書出しの差がない。
- 28-float payloadとledgerを変更しない。
- camera、resize、停止・再開で破綻しない。
- 少なくともRTX 3080 Highで性能予算を満たす。
- Compatibleの結果または明確なoff fallbackがある。
- 作者比較で既存trailsより導入価値がある。

### NO-GO

- BODY Natural shaderやreceiver depositの変更が必要。
- OPT-1契約へArt layerを混ぜる必要がある。
- offでもGPU resourceやpixel差が残る。
- energy増殖やcamera smearを制御できない。
- RTX 3080でも性能・memory予算を満たさない。
- 見た目が既存trailsとほぼ同じで複雑さだけが増える。

## 15. 次の実装指示

次にコードへ進む場合は **GLOW-A1だけ**を実装する。

1. OPT-1の現在のHEAD、作業tree、進行stageを確認する。
2. cleanな別branch / worktreeを作る。
3. `afterglow/types.ts`、`trajectoryStore.ts`と対応testだけを新規作成する。
4. production fileへimportしない。
5. test、build、差分、allocation上限を報告する。
6. 独立reviewでGOになるまでGLOW-A2へ進まない。

この境界なら、OPT-1が光学観測の正しさを固めている横で、Afterglowは時間軌跡の土台だけを安全に作れる。
