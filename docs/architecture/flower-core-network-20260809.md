# Flower Core Network — 花芯を細くつなぐ自己支持ネットワーク（2026-08-09）

状態: **別 Study `flower-core-network` としてD1比較・D2全球mesh・粗い支持推定まで実装（2026-08-09）。D3実スライサーとD4実物は未確認。**

候補 Study 名: `flower-core-network` / 表示名: **花芯をつなぐ**

## 1. 作者の問い

> 花芯同士をなるべく細く繋いで内部にサポートが発生しないような形状について考えたい
>
> 必要であれば別研究へ移行してよい
>
> まずは考えてみて

続く指示:

> 設計してみて

現在の Flower Packing のレース殻は、すべての花弁・花芯を少しずつ太らせて隣の花へ融合する。そのため
一体meshにはできるが、花の輪郭が互いに溶け、充填率を上げるほど一つずつの花を追いにくくなる。

次の研究では、花本体は可能な限り変えず、**花芯の裏側だけから細い枝を伸ばして全体を一部品にする**。
外側からは個々の花が見え、内側からは葉脈・骨・籠のようなネットワークが見える状態を目指す。

## 2. なぜ Flower Packing から分けるか

Flower Packing が答える問いは次である。

```text
どの花を / どこへ / どの向きで / どれだけ詰めるか
```

Flower Core Network が答える問いは異なる。

```text
配置済みの花芯のどれとどれを / どんな経路と断面でつなぐと
花を崩さず一体になり / 指定した造形方向でサポートの必要を減らせるか
```

後者では `造形方向 / 積層ピッチ / 許容オーバーハング / 許容ブリッジ / 最小線幅` が第一級になる。
これらを Packing のつまみに混ぜると、配置の観察と製造制約の観察が混線する。したがって別 Study とし、
Packing の固定した一状態を入力として受け取る。

既存の「花全体を融合するレース殻」は削除せず、比較対象として残す。

## 3. 最初に固定する意味

### 「サポート不要」は形だけの性質ではない

同じ形でも、造形方向・方式・材料・ノズル・積層ピッチ・スライサー設定でサポート判定が変わる。
したがって画面は `support-free` と断定しない。表示するのは次の推定に限定する。

- 下層から支えられていない開始領域の数
- 許容角を超える下面の推定面積
- 下層支持のない連続距離（推定ブリッジ長）
- 接続の最小太さ
- 一体成分数とmeshの閉面性

最終的な `内部サポート 0` の確認は、作者が実際のスライサーへSTLを渡した段階で行う。
実機での成立は、さらにその後の印刷観察で記録する。

### 最初の方式

初回は FDM を仮定するが、値は未校正の観察初期値として扱う。

| 項目 | 観察初期値 | 意味 |
|---|---:|---|
| nozzle | 0.4 mm | 仮の線幅基準。実機profileではない |
| layer height | 0.2 mm | 層支持推定の刻み |
| connector middle | 1.2 mm | 枝中央の仮太さ |
| connector root | 1.8 mm | 花芯へ入る根元の仮太さ |
| overhang limit | 45° | 危険面を色分けする仮閾値 |
| bridge limit | 8 mm | 下層支持なし距離の仮閾値 |

レジン、粉末焼結、別ノズルでは同じ結論を使わない。

## 4. 目指す見た目

```text
外側             花弁    花芯    花弁
                  \       ●       /
                           │  根元は少し太い
表面の少し内側             ╲
                             ╲____ 細い枝 ____╱
内側                                 ╲__ Y字 / 閉ループ
```

- 花弁同士は融合させない
- 枝は花芯の正面ではなく、裏側から始める
- 枝は球の中心を横切らず、配置面の少し内側を通る
- 根元は滑らかに太く、中央部だけを細くする
- 最短の木構造だけで終わらず、小さな輪を作って切断時の孤立を減らす
- 外から枝が目立ちすぎないことと、内側から新しい形として読めることを同時に観察する

## 5. 最初に並べる三形

同じ花、同じ7花パッチ、同じ接続関係を使い、経路だけを変えて比較する。7花は中央1個と周囲6個で、
Y字分岐と輪の両方を最小画面で観察できるため選ぶ。全球への適用はこの後に行う。

### A. Shortest chord — 最短直線

花芯の裏側を直線で結ぶ。材料量と経路長の下限を知る対照群。

- 長所: 最も短く、細さが見えやすい
- 弱点: 水平に近い橋、内部を横切る枝、唐突な根元が増えやすい
- 役割: 採用候補というより、他案が何を改善したかを見る基準

### B. Surface vein — 表面に沿う葉脈

配置面から一定の深さだけ内側に入り、その曲面に沿って花芯を結ぶ。

- 長所: 外から隠れやすく、内側が籠・葉脈として読める
- 弱点: 造形方向を考えないと、球の上半分と下半分で危険面が反転する
- 観察: 花と骨格が別の層として読めるか

### C. Build arch — 造形方向へ持ち上がるアーチ（第一候補）

表面に沿う枝の中点を造形方向へ持ち上げ、両側の花芯から頂部へ育つ二本の曲線として結ぶ。

- 長所: 真横の棒を減らせる。枝が植物の分岐やアーチに近づく
- 弱点: 持ち上げすぎると外側から見え、花の空きを横切る
- 観察: 支柱ではなく形の一部に見えるか

初回は三案を残し、Cを自動的な正解にはしない。

## 6. 入力契約

新 Study は Packing の可変オブジェクトを直接覗かない。右側で固定した配置から、次の中立データを受け取る。

```ts
interface FlowerCoreNode {
  instanceId: number;
  coreCenter: Vec3;
  coreRadius: number;
  surfaceNormal: Vec3;
  tangentX: Vec3;
  tangentY: Vec3;
}

interface FlowerCoreNetworkInput {
  sourceSnapshotId: string;
  sourceContentHash: string;
  flowerDefinitionRevision: string;
  nodes: readonly FlowerCoreNode[];
  physicalScale: {
    mmPerShapeUnit: number;
    source: "measured" | "chosen-at-export" | "unknown";
  };
  buildDirection: Vec3;
}
```

`mmPerShapeUnit` が `unknown` なら、形の比較は続けられるが、線幅・層・ブリッジの製造診断は無効にし、
「寸法未確定」と表示する。

初回は `showCore=true` のFlowerだけを扱う。花芯なしの環へ架空の中心点を挿入しない。花芯なしを扱う場合は、
別の観察を経て `attachment anchor` の意味を決める。

## 7. 接続グラフ

### 7.1 候補辺

各花芯から近い5個を候補とする。同じ辺を二重に持たず、`instanceId` で決定的に並べる。
球面では最初に弦長を使い、任意曲面の測地距離への一般化は実需が出てから行う。

### 7.2 一体性と輪

1. 候補辺から最小全域木を作り、全花芯が一群になる最低条件を作る
2. 次に、次数1の端点を優先して短い辺を加える
3. 平均次数がおよそ3、または指定した `loop amount` に達したら止める
4. 枝同士が意図せず交差する候補は避ける。交差を許す場合は明示的な接合点へ変換する

最小全域木だけなら材料量は少ないが、一か所の破断で大きな部分が分離する。輪を増やすと材料は増えるが、
内側の形と経路の冗長性が生まれる。強度を保証する値ではなく、比較可能な構造指標として扱う。

### 7.3 辺の費用

```text
edge cost =
  path length
  + supportRiskWeight × 推定支持リスク
  + visibilityWeight  × 外側からの露出
  + crossingWeight    × 他の枝との交差
```

同費用なら `小さいinstanceId → 大きいinstanceId` の順で選び、同じ入力から同じグラフを再現する。

## 8. 枝の形

### 8.1 根元

花芯中心 `p` と外向き法線 `n` から、枝の開始点を次で置く。

```text
root = p - n × rootInset
```

枝は花芯の裏側へ入り、花弁へは接続しない。根元付近だけ局所的にsmooth unionし、別の花弁や近い枝を
全体smooth-minで偶発的に溶かさない。

### 8.2 経路

三案は同じ `CoreEdge` を異なる曲線へrealizeする。

```ts
interface CoreEdge {
  a: number;
  b: number;
  strategy: "shortest-chord" | "surface-vein" | "build-arch";
  controlPoints: readonly Vec3[];
  middleDiameterMm: number;
  rootDiameterMm: number;
}
```

Build arch は、表面内側の中点を造形方向へ `archRise` だけ動かした頂点を持つ二本の二次Bezierとして始める。
ただし全制御点を `innerDepthMin .. innerDepthMax` の帯へclampし、枝が花の外へ飛び出した場合は診断する。

### 8.3 太さ

太さは一様にしない。

```text
花芯 ━━━ 根元太さ ━━╸ 中央の細さ ╺━━ 根元太さ ━━━ 花芯
```

- `rootDiameter`: 接続開始部の太さ
- `middleDiameter`: 見かけの細さを決める値
- `rootBlendLength`: 太さが移る距離

「なるべく細く」は、まず製造profileの最小値を下限にする。荷重に対して安全な細さはこの Study だけでは
判定できないため、強度値として表示しない。

## 9. 断面

初回は円と菱形を比較し、第一候補を造形方向へ向けた菱形とする。

円形チューブは見慣れた枝になるが、横向きの下面が急に始まる。菱形は最下点から層ごとに幅が増えるため、
水平な底面を持たない。

曲線接線を `t`、造形方向を曲線直交面へ射影した上方向を `u`、横方向を `s=t×u` とする。

```text
菱形断面: |dot(q, s)| / halfWidth + |dot(q, u)| / halfHeight <= 1
```

曲線が造形方向とほぼ平行で `u` が不定になる場所は、前のframeを平行移動してねじれを防ぐ。

将来の雫形は、菱形の目視後に必要なら追加する。初回から断面種を増やしすぎない。

## 10. 場とmesh

正本は次の履歴である。

```text
Packing Snapshot
  → Core node extraction
  → Candidate graph
  → Edge selection
  → Route realization
  → Cross-section sweep field
  → Local union at cores
  → Derived manufacturing mesh
```

- 花fieldはPackingで固定したrevisionを読む
- 枝はcurve sweep fieldとして作る
- 根元だけ花芯fieldへ局所合成する
- meshは全球の花fieldと枝fieldを一度にsampleして導出する
- 出力前に一成分、閉面、non-manifold、縮尺を検査する

枝が交差する場合、見た目だけ交差しているのか、一体化した接合なのかを曖昧にしない。初回は交差を避け、
将来、交差を一つの分岐に昇格する操作を別にする。

## 11. サポート必要量の推定

面法線の角度だけでは、下に別の枝がある場合や両端で支えられたbridgeを区別できない。したがって
二段階で表示する。

### 11.1 速い色表示

mesh三角形の法線と造形方向から、閾値を超える下面を赤くする。これは形を比較する即時計器であり、
サポート量そのものではない。

### 11.2 層支持推定

物理寸法を持つmeshを造形方向へ `layerHeight` ごとにsliceし、新しい層の占有領域が前層の許容範囲へ
重なるか調べる。

- 前層に重ならず新しく始まる領域 → `unsupported starts`
- 前層支持なしで両端へ続く領域 → `bridge candidate`
- 許容距離を超える連続bridge → `long bridge`
- 前層支持なしの総面積 / 体積 → `estimated support risk`

表示名には必ず `推定` を付ける。実際のスライサー結果と一致しない場合は、どの条件でずれたかを
Observationへ残し、推定器を校正する。

## 12. 診断

```ts
interface CoreNetworkDiagnostics {
  graphComponents: number;
  meshComponents: number;
  edgeCount: number;
  cycleRank: number;
  minimumDegree: number;
  maximumEdgeLengthMm: number | null;
  materialVolumeMm3: number | null;
  minimumConnectorDiameterMm: number | null;
  watertight: boolean;
  openEdges: number;
  nonManifoldEdges: number;
  unsupportedStartsEstimate: number | null;
  riskyDownFacingAreaMm2: number | null;
  maximumUnsupportedSpanMm: number | null;
  warnings: readonly string[];
}
```

STL保存の最低ゲート:

1. graphが一群
2. 保存meshが一成分
3. open edge / non-manifold edgeが0
4. 接続径が指定下限以上
5. 物理縮尺が確定

このゲートを通っても「サポート不要」「壊れない」とは表示しない。層支持推定と実スライサー確認を別に残す。

## 13. 最初の画面

### 比較面

```text
同じ7花パッチ・同じgraph

最短直線              表面に沿う葉脈           造形方向アーチ
[外 / 内 / 横]         [外 / 内 / 横]           [外 / 内 / 横]
```

外・内・横は同時表示または一括切替にし、各案で別のカメラ状態にならないよう同期する。

### 最初に見せる操作

- 枝中央の細さ
- 根元の太さ
- 表面から内側へ入る深さ
- アーチの高さ
- 輪の量
- 造形方向
- 円 / 菱形

プリンタprofile、mesh解像度、層診断の詳細は折りたたむ。

### 常時表示する値

- 一体 / 分離
- 枝の本数と輪の数
- 材料量の相対差
- 最小接続径
- 危険下面の推定
- 最長の支持なし距離

## 14. 作者の目視判断点

最初のチェックポイントで作者が判断するのは次である。

1. 外から見て花が一つずつ残っているか
2. 枝が後付けの支柱に見えるか、内側の形に見えるか
3. 細い中央と太い根元の移行が自然か
4. 内側のネットワーク自体に存在感があるか
5. アーチが花間の空きを壊していないか
6. 菱形断面の角が造形上の理由として読めるか、単なる尖りに見えるか

数値が良い案を自動採用しない。外側と内側を作者が見てから全球へ進む。

## 15. 検証段階

| 段階 | 確認できること | まだ言えないこと |
|---|---|---|
| D0 設計 | 入出力・比較・診断の意味 | 形の見た目 |
| D1 7花プレビュー | 花と枝の関係、三案の差 | meshの閉面、実製造 |
| D2 全球mesh | 一体成分、閉面、最小径 | スライサーのサポート0 |
| D3 slicer | 指定profileでの内部サポート量 | 印刷成功、強度 |
| D4 実物 | 印刷可否、除去性、触感、破断位置 | 別材料・別scaleへの一般化 |

実物印刷と破壊は作者が行う。AIは推定と記録を行い、安全を断言しない。

## 16. 実装境界

実装開始時に次の自己完結Studyを作る。

```text
src/studies/flower-core-network/
  README.md
  manifest.json
  defaults.ts       観察初期値と意味
  graph.ts          候補辺・一体化・輪の追加
  routes.ts         shortest / vein / arch
  crossSection.ts   round / diamond
  field.ts          curve sweepとcore局所合成
  diagnostics.ts    graph / mesh / layer-support推定
  renderer.ts
  ui.ts
  main.ts
  flowerCoreNetwork.test.ts
  notes/
```

HTML entry、Study catalog、代表画像はD1の実画面と同時に追加する。空のStudyを先にlauncherへ載せない。

Flower定義と配置InstanceSetは、この時点で二つ目のStudyから必要になる。実装時に両Studyから中立に
読める最小契約だけをLibrary候補へ抽出し、solverやFlower専用UIまでは共通化しない。

外部依存は追加しない。グラフ、Bezier、sweep field、mesh検査は現在のTypeScriptと既存mesh導出関数で作る。

## 17. 再現性と保存

保存するrecipeには次を含める。

- source packing snapshot id / content hash
- Flower definition revision
- Core node抽出version
- graph strategy / weights / selected edges
- route strategy / control points
- build direction
- physical scale provenance
- cross-section / diameter profile
- layer-support estimate parameters
- mesh resolutionと導出version

同じSnapshotとrecipeから同じ枝・同じ診断が再現されることを自動検査する。

## 18. Hikari境界

Hikariへ光学値は渡さない。Geometry Snapshotでは、必要なら次の形態タグを持つ。

- `flower-body`
- `core-network`
- `network-root`
- `manufacturing-risk-estimate`

`buildDirection` と診断は生成来歴であり、光学材料ではない。Hikari実装はこのStudyのために変更しない。

## 19. 最初の実装順

1. Packingの固定結果から7花パッチとcore nodeを決定的に取り出す
2. 同一graphを作り、三つの経路を線で表示する
3. 外 / 内 / 横の同期比較と作者の目視
4. 選んだ経路だけcurve sweep fieldへする
5. 花芯根元へ局所合成し、7花で一成分・閉面を検査する
6. 全球へ拡張する
7. 層支持推定を加え、実スライサー結果で校正する

D1まではSTLを出さない。線の比較で経路の意味が伝わってからmesh化する。

## 20. 開いている問い

- 枝は外から完全に隠すべきか、隙間から少し見えた方が形に厚みが出るか
- 中央の細さは全枝で同じか、長い枝ほど太くするか
- 輪の量は強度のためだけか、内側の形を作る操作として見せるか
- 全球一体のまま内部サポート0が難しい場合、形を変えるか、上下分割を別案として許すか
- FDM以外の造形方式をいつ比較対象へ入れるか
