# S-interior-growth — 内部から育つネットワーク (Phase 0 / Phase 1A / Stage 1A.1)

## Question

`docs/sonnet-instruction-20260724-katachi-interior-growth-stage1.md`
（全体計画: `Optimizer/docs/katachi-optimizer-interior-growth-multipart-structure-plan-20260724.md`）:

> 合成hostの内部で、Kumoに似た3D生成場に沿ってcoinまたはring unitが育ち、造形制約を有効にした場合は
> 各unitがbuild plateまたは親unitへ連続して支持される候補だけを採用する、新しい自己完結Studyを作る。

作者の観察（全体計画 §1）: Katachi ⇔ Optimizerを通した実印刷サンプルは形状として造形できる一方、
内部サポートは残る。この Study が問うのは:

- **生成の向き**を変えるだけで（host内部にKumo的な場を置き、coin/ringの連続体を下から育てる）、
  内部サポート危険域は減らせるか
- field-only（制約なし）/ coin-constrained / ring-constrained の3候補を、同じhost・同じseedで
  並べて比較したとき、その差は数字と体積として読めるか

**「サポート不要」「印刷可能」は問わない。** この段階で確かめるのは、生成場と造形制約の関係を
作者が比較できるかどうかだけである（全体計画 §8「成功の定義」）。

## Setup

`src/studies/interior-growth/` に自己完結。`interior-growth.html` から起動 (`npm run dev` → 通常
`http://localhost:5174`)。

- **host**（`field.ts`）: box / sphere / waisted（中央にくびれ）の3つの純粋SDFフィクスチャ。
  `hostSdf(id, x, y, z) < 0` を内部とする。3つとも**符号は正しいが正確な距離場ではない近似SDF**
  （skin/field.ts の shellSdf と同じ近似の流儀）。build plate は build axis に沿った host最下点の
  接平面（`buildPlateOffset`）
- **GrowthField**（`field.ts` の `growthDirection`）: Kumoのコードはコピーせず、位置のみに依存する
  決定論的な純粋関数として書いた。`lift`（build axis方向バイアス）・`drift`（決定論的サインハッシュ
  ノイズによる水平方向の偏り）・`cohesion`（既存networkの水平重心へ寄る弱いバイアス）の合成。
  `branching`（分岐数）・`voidBias`（意図的skip確率）は方向ではなく生成カウントを制御する
- **Growth walk**（`growth.ts` の `growNetwork`）:
  1. rootをbuild plate近傍からrejection samplingで選ぶ（浮いたrootを作らない、host内外判定つき）
  2. rootからBFSで子unitを育てる。子候補の位置は `growthDirection` + 分岐ごとのランダム回転
     （`rotateVector`、build axis周り）
  3. 候補ごとに §7 の6ルール（field-onlyはルール1のみ、coin/ring constrainedは全ルール）を評価し、
     採用/棄却を判定。棄却は理由別に件数化し、不合格候補の点群自体は保持しない（§7の指示どおり）
  4. `variant`（`"field-only" | "coin-constrained" | "ring-constrained"`）は同じ乱数seedから同じ
     root/child候補位置列を辿るが、幾何生成（coin vs ring の点群構築）が異なるため、3候補の候補
     **位置**列そのものは一致しない（coinの副点散らしがRNGを消費し、ringは自前のseed文字列から
     独立に生成するため）。3候補は「同じ制約設定で何が育つか」の比較であり、「同じ候補列に制約だけ
     掛けた差分」ではない — この設計判断はREADMEにのみ明記し、UIでは主張しない
- **coin/ring 点群**（`growth.ts`）: coinは中心点+副点3〜7個をheading（成長方向）に垂直な接平面へ
  散らした「もう一つのBall[]」（S-skin のcoinと同じ精神、コピーはしていない — surface projectionが
  無い分、素の平面散布）。ringは S-rings の `generateRingBalls`/`rotateVector` をコピーせず import
  （S-pack/S-skinと同じ前例）
- **6ルール**（`growth.ts` の `evaluateCandidate`）:
  1. host内部 or 許容誤差内（`unit最大半径 × 0.25`）— 超えたら`host-exterior`棄却、許容内なら
     `clipFieldUnits`として記録（完全なboolean intersectionクリップは未実装、Nextへ）
  2. rootはbuild plateへの接触許容誤差内（`unit最大半径 × 0.6`）
  3. root以外は既存acceptedをparentに持つ — **構造的に常に真**（候補は必ず特定のparentから生成
     されるため、ルールとしての判定コードは無い。growth.test.ts でparent chain健全性を検証）
  4. parentとの実体field重なり（点ペアの最短距離がゼロ以下）
  5. build axis方向の上昇量に対する横方向移動量が、作者入力の
     `maxLateralAdvancePerLayerMm / layerHeightMm` から導いた許容範囲内
  6. unit自身の側方外接半径（粗い代理指標）が`maxUnsupportedSpanMm`以内
  - ring追加ルール: axisがbuild axisに対し20°未満（≈水平ring）なら棄却。ring自身のノード列の
    最大連続高度差が`maxUnsupportedSpanMm`を超えたら`ring-discontinuous-support`棄却
    （独立した新しい許容値を発明せず、既存の入力値を流用した簡易判定 — 仮決め）
- **Void/reachability**（`growth.ts` の `analyzeVoids`/`sampleVoidCellCenters`）: host bounds を
  resolution³のグリッドでsolid/void/exteriorへ分類し、void cellが6方向の隣接（面連結のみ、対角は
  含まない）で外部（host外 or グリッド境界）へ到達できるかをflood fillで判定。coarse Monte
  Carlo的近似であり、正確な体積積分ではない（UIとprovenanceの両方に明記）
- **メッシュ・保存ゲート**（`meshExport.ts`）: `cloud-sculpt/meshExport.ts` の
  `buildMeshFromField`・`rescaleMeshResult`・`orientMeshForSavedStl`・`inspectSavedStlTopology`を
  再利用（コピーしない）。canonical scale は host自身の bounds から一度だけ導出
  (`canonicalScaleMmPerUnit`) し、3候補すべてで共有 — 各候補固有のbboxから独立にスケールを
  導かない（§7の指示どおり、S-skin のA/B gate-correction と同じ `rescaleMeshResult` パターン）
- **比較UI**（`renderer.ts`/`ui.ts`）: **1個のTHREE.PerspectiveCamera + OrbitControls**を、
  1枚のcanvasの3つのscissor viewportへ共有レンダリングする方式で「同一camera/同一Scale」を構造的に
  保証した（3つ独立カメラを同期させる方式は採らなかった）。表示はraymarch GLSLではなく
  `THREE.InstancedMesh`のビーズ表示（S-skinのビーズ表示と同じ精神、コピーはしていない）—
  3パネル同時のuniform予算を新たに設計する重さを避け、accept/reject/voidという構造情報を
  smooth-minでブレンドせずそのまま見せる方が今回の比較の主眼に合うと判断した（仮決め、Nextへ）
- **技術選定**: vite + three.js + 素のTypeScript。既存Studyと同水準

### 実装上の既知の単純化（正直な記録、AGENTS §6）

- host外clipは**完全なboolean intersectionではなく、小さな許容誤差内は受理・それ以外は棄却**。
  §5が求める「厳密なintersection」は次段の課題（Next参照）
- unitサイズ・詰める強さの一部（`unitRadius`・`ringNodeCount`・`ringTubeR`・`maxUnits`・
  `rootTarget`）は指示書のGrowthParams型スケッチに無い追加フィールド。指示書自身が
  「既存型に合わせて調整してよい」と明記しており、形とサイズを一切指定せずに growth を
  実装することはできないため追加した
- メッシュ解像度は64固定（UIに露出せず）。Phase 1Bで露出を検討
- ring-discontinuous-support は独立した新しい許容値を発明せず、`maxUnsupportedSpanMm`を
  再利用した簡易判定 — 専用のスライサー相当検証ではない

## Observation

**2026-07-24（自動テスト）**: `growth.test.ts`（19件、tsx実行）で以下を実測確認—
同一seed/params/host/variantでの結果完全一致、非rootの全unitの有効parent、全unitのroot到達性、
浮いたroot棄却（`root-not-on-plate`）、host外候補の棄却（`host-exterior`）と許容誤差内clipの記録、
制約未入力時のconstrained生成拒否（`throws`）とfield-only生成の許容、横張り出し超過棄却、
無支持span超過棄却、水平ring棄却（`ring-horizontal`）、決定論的に構成した1セル厚シェルによる
closed void（4×4×4=64セル、1成分）とexterior-connected voidの正しい分離、recipe
export→import→replay完全一致、良好に接続されたcoin-constrained候補のメッシュが保存後topology
ゲート（境界閉0・非多様体辺0・退化三角形0）に合格、SHA-256の決定性、growNetworkが入力
envelope/paramsを一切変更しないこと。

**2026-07-24（実ブラウザ検証、isolated Chrome port 5185、実座標クリック/PointerEvent）**:
実装直後の初回検証で3件の実装バグを発見・修理した（いずれも生成アルゴリズム自体ではなく
表示/レイアウトの不具合、詳細はNext横の「見つけて直したバグ」参照）。修理後、host=box・
layerHeightMm=0.2・maxLateralAdvancePerLayerMm=0.5・maxUnsupportedSpanMm=20・
targetLongestMm=80・既定GrowthParams（seed既定値、lift0.6/drift0.3/cohesion0.4/branching0.35/
voidBias0.3/unitRadius0.14/rootTarget5/maxUnits400）で「3候補生成」を実行し、以下を実測:

| | Field only | Coin constrained | Ring constrained |
|---|---|---|---|
| accepted | 400（上限到達） | 400（上限到達） | 4 |
| root数 | 5 | 5 | 3 |
| edge数 | 395 | 395 | 1 |
| degree min/med/max | 0/1.0/2 | 0/1.0/2 | 0/0.0/1 |
| host占有率（grid近似） | 3.7% | 4.0% | 0.1% |
| closed void数 | 0 | 0 | 0 |
| rejected合計 | 192 | 232 | 124 |
| └ host外 | 1 | 4 | 29 |
| └ root未接地 | 0 | 40 | 89 |
| └ parent非接触 | 0 | 0 | 0 |
| └ 水平ring | — | — | 2 |
| └ voidBiasによる意図的skip | 191 | 188 | 4 |
| 保存後topologyゲート | 合格 | 合格 | 合格 |

Ring constrainedのaccepted数がCoinより大幅に少ないのは正直な観測であり、バグではない —
ring-horizontal棄却（軸がbuild axisに対し20°未満で棄却）とroot-not-on-plate棄却が
支配的で、rootの大部分がbuild plate接触の粗い許容誤差（`maxR*0.6`）を満たせずに棄却され続けた。
ring候補の生成密度がcoinよりずっと低いことは、この段階でのring形状の幾何的制約（§7の
node-plane接触閾値が非常に狭い）を裏付ける実測であり、Nextに残す。

比較画面の一周（host選択→制約入力→GrowthParams調整→3候補生成→rejected/void表示切替→
metric table→STL保存→provenance保存→recipe書き出し→host切替でwaisted/sphereへ）を実座標
クリックで確認し、console errorなし。既存8ページ（index/gravity/sag/mpm/foam/rings/pack/skin）
すべてナビゲーション追加後もconsole errorなしを確認した。`npm run build`（9ページ）・
`npm run test:interior-growth`（19件）・`npm run test:partition`（既存62件）すべて合格、
`git diff --check`両リポジトリで問題なし。

**見つけて直したバグ（実装中の発見、AGENTS §3の実座標検証がなければ見逃していた）**:

1. **STEP_FACTOR誤設定**（growth.ts）: 初期値1.7ではcoin/ringどちらの候補もparentの実体fieldに
   一度も触れず、constrained variantが常にaccepted=root数のまま（edge=0）だった。coinの
   anchor-anchor接触条件（`step<=1.1*unitRadius`）とringのnode-node接触条件
   （`step<=0.56*unitRadius`、位相不一致でさらに厳しい）から逆算し0.5へ修正。
2. **InstancedMeshのfrustum culling**（renderer.ts）: `unitsMesh`のデフォルトbounding sphere
   （ジオメトリ自身の半径1、ローカル原点基準）が実際のinstance分布を反映せず、host全体に
   広がる大量のacceptedユニットが丸ごとカリングされ、画面上は空に見えた（rejected/void用の
   InstancedMeshは同じ問題を踏んでいなかった理由は未確認、`frustumCulled=false`で解決）。
   count・position・colorはすべて正しく書き込まれていたことをデバッグハンドル
   （`window.__interiorGrowth`）で確認済み。
3. **パネルのDOM構造**（main.ts）: `#viewport`の兄弟として素の`<div>`（panelHost）を挟んだ結果、
   内側の`.panel`がflexの高さ制約を受けずコンテンツ分だけ伸び、あふれた分が`#app`自身の
   （非表示だが`scrollIntoView`ではスクロール可能な）`overflow:hidden`へ流出し、
   canvasごと画面外へ押し出されることがあった。`.panel`を`#app`の直接の子にし、DOM構造を
   既存Study（rings/skin等の`#viewport` + `.panel`兄弟構成）と一致させて解決。

未確認（Next）: 実CoinSRF/実STLホストへの適用（Phase 1B）、実スライサーでのサポート生成量の
独立確認、ring形状の生成密度改善。

### Optimizer同条件診断（2026-07-24、Optimizer 0.8.2、`--quick`、scale=1.0）

保存後topologyゲートに合格した3候補STL（上記と同一の生成条件、targetLongestMm=80）を
`uv run python -m optimizer check <stl> --scale 1 --quick` で個別に診断した。Optimizerの入力
（STLファイル自体）は変更していない。

| | Field only | Coin constrained | Ring constrained |
|---|---|---|---|
| watertight | True | True | True |
| 境界辺/非多様体辺 | 0/0 | 0/0 | 0/0 |
| bbox (mm) | — | 74.64 × 34.76 × 82.66 | 73.1 × 8.16 × 47.13 |
| 独立シェル数 | 5 | 5 | 18 |
| 最小肉厚 推定 (min/p05, mm) | 6.05 / 8.91 | 8.03 / 9.98 | 0.153 / 1.30 |
| 内部オーバーハング | 0.00% | 0.00% | 0.00% |
| 外面オーバーハング | 21.09% | 17.26% | 14.36% |
| 合計オーバーハング | 21.09% | 17.26% | 14.36% |

正直な記録: 3候補とも「内部オーバーハング0%」だが、これは各候補が薄いunit群の集合であり、
Optimizerの可視性レイが内部に閉じ込められた大きな空洞を検出していないことを意味するだけで、
**「内部サポートが不要」を意味しない**——unit間の接続部（rule 4の点ペア接触）自体は
Optimizerの独立診断の対象になっておらず、狭い首やunit単体の縁は「外面」に分類されている
可能性が高い。Ring constrainedは最小肉厚が0.15mmと極端に薄く（管太さ`unitRadius*ringTubeR`
がそのままcanonicalScaleで拡大された結果）、実際のFDM印刷では単体でも成立しない可能性が高い
——これも「支持risk」とは別の、単純な肉厚不足の指摘であり、混同しない。独立シェル数
（5〜18）は、accepted unitがsmooth-minでどこまで融合したかの実測であり、edge数（395等）が
示す「ネットワークとして繋がっている」こととは異なる指標であることも明記する
（edgeはunit中心間の論理的な親子関係、シェル数はメッシュ化後の実際の幾何的連結性）。
実スライサーのサポート生成量は未検証（作者が独立に確認する対象、§12の指示どおり）。

## Observation（Stage 1A.1 追記、2026-07-25）

作者がPhase 1A画面を実際に試用したフィードバック
（`Optimizer/docs/sonnet-instruction-20260724-katachi-interior-growth-author-feedback.md`）を反映した。
作者コメント原文の要約（Hypothesisとは区別する）:

1. 3Dプリンター基準ならまずステージサイズのプリセットが必要（Bambu Lab A1 / A1 miniから選びたい）
2. 作者が数値変更してよいと感じるのは`layer height`と`support threshold angle`であり、
   `lateral`と`span`を直接変更するのはズレている
3. 既定状態で最下端から上端まで形が育ってほしい。現状は成長範囲が小さすぎて形状評価ができない

### 実装した変更

- **Printer preset**（`field.ts`の`PRINTER_PRESETS`）: Bambu Lab A1（256×256×256mm）/
  A1 mini（180×180×180mm、両方とも2026-07-24に公式スペックページで確認済み、`source:"official"`）/
  Custom（作者入力、`source:"author"`）。build volumeのみを保持し、材料・ノズル・実効造形限界等は
  決め打ちしない
- **host fit**（`fitHostToBuildVolume`）: hostをbuild volumeの各軸90%（`STUDY_MARGIN_FRACTION=0.1`、
  Katachi側の仮の余白と明記）以内へ、3軸同時に収まる一様スケールでfitする。3フィクスチャとも
  buildAxis以外の2軸で断面対称なため、Wm/D割り当てを気にせず厳密にfitできる
- **`FabricationEnvelope`の再定義**: `layerHeightMm`（作者入力）+ `supportThresholdAngleDeg`（作者入力、
  0°=plateに平行な下面・90°=垂直壁というKatachi独自の局所近似規約、特定スライサーと同一とは
  断定しない）+ `derivedMaxLateralAdvancePerLayerMm`（`layerHeightMm/tan(angle)`から常に自動再計算、
  読み取り専用）。`maxUnsupportedSpanMm`は作者入力から完全に撤去し、rule 6は`unitRadius`の定数倍
  （`UNSUPPORTED_SPAN_FACTOR=3.0`、仮決め）から導く内部derived値に置き換えた
- **主画面の入力整理**（`ui.ts`）: 主画面はPrinter→Host shape→Layer height→Support threshold angle→
  生成ボタンの順のみ。seed以下のGrowthParams・root目標数・旧targetLongestMmは初期状態で閉じた
  「研究用詳細」`<details>`へ移した（削除はしていない）
- **2段階growth**（`growth.ts`のPhase A/B）: Phase Aはbuild plate rootから host上端方向へ、決定論的な
  DFS+backtracking（各ノードで14方位の候補を試し尽くしたら1つ戻る）で連続する1本のprimary pathを
  先に育てる。ring向けの水平ring除外ルールと構造的に衝突しないよう、primary pathの基準headingは
  種類ごとに異なるtilt角を持つ（coin=4°・ring=28°、どちらもring自身の`MIN_RING_TILT_RAD`(20°)の
  判定と矛盾しない値を実測で選んだ）。Phase Aが確定した`primaryPathUnitIds`・`heightCoverage`・
  `topReached`はPhase B（既存のBFS分岐/fill、`branching`パラメータに応じた枝を追加）が何をしても
  変更されない（`growth.test.ts`で検証）
- **自動budget**（`computeAutoBudget`）: `maxUnits`を`GrowthParams`から完全に削除し、
  `ceil(hostHeight/step) + 安全余裕20` + Phase B用のbranch予算（3倍、仮決め）から都度計算する
- **height coverage表示**: `(到達最大投影 - build plate投影)/(host上端投影 - build plate投影)`を
  0.95以上で`topReached`とし、3候補それぞれをmetric tableと常時表示の要約テーブル（accepted /
  rejected合計 / height coverage / top reached）の両方に出した
- **3D画面**（`renderer.ts`）: build volumeのwireframe boxをbuild plate上に正しく接地して描画、
  上端到達ライン（0.95閾値の高さの半透明平面、`topReached`に応じて濃さが変わる）、成長の最下点
  （橙）・最高点（緑）マーカーを追加
- **legacy recipe migration**（`history.ts`）: 旧shapeの`envelope`（`maxLateralAdvancePerLayerMm`等の
  null許容3フィールド）を検出し、非nullだった場合は`atan(layerHeight/lateral)`で角度を厳密に
  復元、null（Phase 1A既定の未入力状態）だった場合は新既定値（30°・0.2mm）を採用する。旧
  `setTargetLongestMm`操作は対応する概念が無いため削除する（legacyMigrated=trueとして記録）。
  `generateCandidates`に保存された旧GrowthResultにも同じenvelope migrationを適用し、
  `primaryPathUnitIds`等の新フィールドが無ければ空/0/falseで正直に補完する

### 実測

- 既定状態（Printer=A1 mini・Host=box・Layer height=0.2mm・Support threshold angle=30°・
  GrowthParams既定値）で「3候補生成」を実行した結果、**Field only/Coin/Ring全てheight coverage
  約98.7-99.0%でtop reached**（自動テスト・実ブラウザ両方で確認）。sphereでも全candidate
  0.95以上に到達。waistedは全候補実際に到達した（0.981-0.994、必須ではないが実測として記録）。
  実ブラウザのスクリーンショットで3パネルとも根本（橙root）から緑の上端到達ラインまで連続する
  塔状の構造が見え、数値（height coverage%・top reached）と視覚の両方で確認した（AGENTS §6
  「スクリーンショットだけで断定しない」の実践）
- support threshold angleを60°（derived lateral 0.231mm/layer相当）まで厳しくしても、既定の
  box hostでは3候補ともtop reachedを維持した
- 実座標クリックで、Printer切替→Host切替→Layer height変更→angle変更→3候補生成→printer再切替→
  STL/provenance保存、の一連を確認し、console errorなし
- **見つけて直したバグ**: `onLayerHeightChange`/`onSupportThresholdAngleChange`（main.ts）が
  `derivedMaxLateralAdvancePerLayerMm`を再計算せずに古い値のままenvelopeへ書き込んでいた
  （state自体は`layerHeightMm`/`supportThresholdAngleDeg`を正しく更新するが、rule 5が実際に
  使うderived値が古いまま固まる、という実害のあるバグ）。実ブラウザでlayer height/angleを
  変更し`window.__interiorGrowth`でstateを直接確認する検証で発見・修理した
- sphere hostでcoin-constrainedのheight coverageが0.945-0.948に留まる問題を2段階で調整した:
  ① root接地判定の許容誤差が狭すぎ、球の曲面近傍でroot候補がほぼ見つからなくなる場合があった
  （`maxR*0.6`→`maxR*2.0`、pre-filterの`plateBand`も`unitRadius*2.5`→`*4`に拡大）。
  ② primary pathのtilt角を全形状一律35°にしていたため、coinには不要な横方向ロスが生じていた
  （coin=4°・ring=28°へ分離）。両方の調整後、box/sphereとも全候補0.95以上を安定して達成した

自動テスト（`growth.test.ts`、36件）・`npm run build`（9ページ）・`npm run test:partition`
（既存62件、無退行）・`git diff --check`（両repo）すべて合格。

## Observation（Support Backbone + Surface Colonization 追記、2026-07-25）

`Optimizer/docs/katachi-interior-growth-surface-coverage-plan-20260725.md`
（S1=測定のみ→S2=coverage-directed growth→S3=ring分布モード（未実装）→
S4=Fabrication Plan（未実装））のS1+S2部分を実装した。

### 並行実装の発見とCodex連携での裁定

実装中、`src/studies/interior-growth/` に自分が書いていない
`surfaceCoverage.ts`/`surfaceCoverage.test.ts`/`measureS1.ts`
（ファイル名から別プロセス — measureS1.tsが書き出すレポート名
`antigravity-report-*` から推測——による、同じ設計書への独立実装）が
ほぼ同時刻に存在することを発見した。git状態を確認したところ
`growth.ts`/`field.ts`自体は衝突しておらず（自分の変更のみが残っていた）、
別実装は`surfaceCoverage.ts`という別名の下で共存していた。

`codex exec`（`~/.local/bin/codex`、対話なしのCLI呼び出し）で両実装の
設計差分を直接尋ねたところ、次の裁定を得た:

- サンプリング: 別実装の「固定件数N・面積比例CDF・seed付きRNG」を採用
  （自分の当初案は三角形ごとに1点=重心だったが、mesh解像度に依存し
  coverage境界が三角形をまたぐとaliasingしやすいと指摘された）
- covered判定: どちらもそのままでは不十分——別実装のsmooth-min blend判定は
  隣接するring/coin材質を融合してしまい§5の「ringの穴をcoveredとして
  数えない」に反するリスクがある一方、自分の生の球判定はring node間の
  tube表面を過小評価する（隣接node球が重ならない場合、間の実材質を
  見落とす）。両方の指摘を反映し、reachable-unit-id集合を先に確定した上で
  ring材質をnode間の先細りcapsule union（tube近似）、coin材質を生の球union
  として判定する設計へ統合した
- 到達性判定のバグ: 自分の`findCoveringUnit`が配列順で最初に当たった
  unitだけを見ており、それがunreachableでも後続のreachable unitを
  調べていなかった（regression testとしてgrowth.test.ts末尾に追加済み）

この裁定に基づき`coverage.ts`を全面的に書き直した。別実装
（`surfaceCoverage.ts`等）は削除せず現状のまま残している（他プロセスの
成果物を無断で削除しない、というセッション内の一貫方針）。

**追記（2026-07-25、後日整理）**: 並行実装から得た設計知見（面積比例CDF
サンプリング等）は上記のとおり`coverage.ts`へ統合済みだったが、
`surfaceCoverage.ts`/`surfaceCoverage.test.ts`/`measureS1.ts`の3ファイル
自体は残ったままだった。その後、これらのファイルの作者であるAntigravity
自身の指示（`Optimizer/docs/antigravity-correction-20260725-surface-coverage-cleanup.md`）
により3ファイルは削除され、`package.json`の`test:interior-growth`から
`surfaceCoverage.test.ts`を、`tsconfig.json`のexcludeから`measureS1.ts`を
それぞれ外した。**正本は`coverage.ts`のみ**（並行実装ファイルは現存しない）。
production挙動は`coverage.ts`が統合された`growth.test.ts`（50件）と
実ブラウザ値でのみ評価する。`Optimizer/docs/antigravity-report-20260725-
interior-growth-surface-coverage-s1.md`が示す測定値は当時のhistorical
measurementであり、現在のUI/production挙動の正本値ではない（同レポート
冒頭に追記済み）。

### S1: `coverage.ts`

- `buildCoverageReferenceSamples`: host SDFから**一度だけ**参照mesh
  （resolution=48）を作り、triangle面積に比例したCDF逆変換で固定4000点を
  seed付きRNGで抽出。生成meshの表面積ではなくhost自身の目標境界面
  （§1の要求どおり）
- covered判定（§3.2）: reachable-unit-id集合をまず確定し、probe点
  （sample点をinward法線へ`unitRadius*0.5`だけ押し込んだ点）が
  reachable unitのいずれかの材質（coin=生の球union、ring=node間tapered
  capsule union）に入るかを判定。分母（`totalWeight`）は常に参照mesh
  全体で、到達不能面を黙って除外しない（§3.3）
- `GrowthMetrics`/`CandidateProvenance`へtargetSurfaceCoverage・
  measuredSurfaceCoverage・coverageGap・covered/no-material/unreachable
  sample数・probe depth・coverage stop reason・reference mesh条件
  （resolution/sampleCount/seed）を追加。summarizeMetricsが
  voidと同じ「都度再計算、二重管理しない」規約でcoverageも毎回
  result.unitsから再計算する

### S2: coverage-directed colonization（growth.ts の `growSurfaceColonization`）

Phase 1A/Stage 1A.1の無方向branch/fillを完全に置き換えた（Phase Aの
primary pathは変更していない）。実装中に測定で見つけた6件の実バグ
（詳細はgrowth.ts冒頭のコメント）:

1. 目標へ直線的に向かうheadingが、rule 5の`tan(supportThresholdAngleDeg)`
   による横:縦比の上限を守っていなかった——目標が既存unitの高さと
   近い（≒横方向が主）場合、fan全体が毎回rejectされていた
2. 「farthest uncovered」を毎回選び直す設計が、対称形状の対辺2箇所を
   往復するだけで1つの目標にも到達できない振動を起こしていた
3. Phase Aの`autoBudget.totalBudget`は表面被覆目標ではなく主幹の長さ用に
   設計されており、target=50%でも常にbudget切れで数%止まりだった
4. 候補centerをhost境界上の生sample点へ直接向けていたため、centerが
   境界に近すぎて自身の点群が境界を突き抜けhost-exterior棄却が支配的
   だった（sampleをunit半径ぶんinward normalへ押し込んだ点を目標にして解決）
5. 親unit選択が高さを考慮しておらず、目標より高い位置にある既存unitを
   親に選ぶと（rule 5は正の上昇時のみ有意な横移動を許す）どのazimuthでも
   絶対に届かなかった——親候補を「目標以下の高さ」優先に変更
6. 「詰まった」判定カウンタが成功ステップも数えてしまい、遠い目標へ
   到達するのに必要な多数の小さな成功ステップの途中で
   target-attempt上限・global plateau上限の両方が誤発火していた
   （consecutive-rejectionのみを数えるよう修正、加えて別途
   distance-stagnation判定を追加——見かけ上acceptされ続けていても
   実際には目標への距離が縮まっていないケースを検出するため）

さらに性能面: 修正6までの状態でbox host・既定target(50%)の
`generateCandidates()`全体（3候補のgrowNetwork + buildCandidateMesh）が
**140秒**かかることを実ブラウザ検証中に発見した（メインスレッドが
その間完全にブロックされ、自動化ツールからもタブが応答不能になった）。
内訳を計測したところ、smooth-min blendされた800unit超のfieldに対する
`buildCandidateMesh`（marching tetrahedra、resolution=64、
cloud-sculpt側の共有実装を変更せず流用）が25〜44秒/候補と支配的だった。
`COLONIZATION_BUDGET_SAFETY_FACTOR`（4→1.5）と`COLONIZATION_BUDGET_HARD_CAP`
（1500→500）を引き下げ、全体を約31秒（growNetworkは1.5秒未満/候補）へ
短縮した——到達可能coverageの上限を犠牲にした明示的なtrade-offであり、
コードコメントに理由を残した。

### 実測（既定Printer=A1 mini・Host=box/sphere/waisted・target=50%）

| | Field only | Coin constrained | Ring constrained |
|---|---|---|---|
| box: accepted / measured coverage | 339 / 10.5% | 344 / 4.9% | 349 / 2.4% |
| sphere: accepted / measured coverage | 258 / 4.8% | 263 / 1.8% | 264 / 1.2% |
| waisted: accepted / measured coverage | 256 / 5.3% | 262 / 1.4% | 264 / 3.1% |
| stop reason（全て） | candidate-budget-exhausted | 同左 | 同左 |
| height coverage / top reached | 全候補 0.978〜0.994 / reached | | |

**正直な記録**: target=50%に対し実測coverageは全host・全variantで
大きく届いていない（2〜11%程度）。field-onlyはhost足元全体に広がる
分岐構造を実際に作れており（§10の「一本柱ではない」という定性的な
成功条件は満たす）、coin/ring-constrainedはsupport角度制約下で
横方向への到達が本質的に難しく、この単純化されたgreedy実装
（§4.1のフル多項スコア・§4.2のfrontier/spatial-hash最適化は未実装、
budget/性能の都合で単純な「farthest uncovered点への直線+azimuth fan」
に留めた）では50%という既定目標に届かない。これは隠されたバグではなく、
`coverageGap`/`coverageStopReason`が常に正直に表示する設計上の限界として
記録する。§10「表面を全部埋めることが成功ではない」という設計書自身の
基準に照らせば、coverage測定自体の正しさ・build-plate支持経路の
非破壊・host表面への分布（field-onlyで顕著）・到達不能の正直な報告、
という条件は満たしているが、「指定coverageの達成」自体は満たしていない。

### UI/3D表示

- 「造形表現 — Target surface occupancy」を`layer height`/`support angle`
  とは別セクションとして新設。25/50/75%ボタン+Custom（%入力）、既定50%
- 常時表示テーブルへ surface target%/measured%/gap%/停止理由を追加、
  詳細metric tableへcovered/uncovered/unreachable sample数・probe depthを追加
- 3D表示: coverage sample（緑=covered/暗い灰=uncovered、4000点、既定OFF
  ——常時表示すると形本体が読みにくくなるため作者が選んで見る設計。
  §6が挙げる「現在の目標」（黄）は生成完了後には残らない一過性の
  loop内状態であり実装していない——正直な省略として明記する

### 実ブラウザ検証

`http://localhost:5174/interior-growth.html`（実座標クリック、
`window.__interiorGrowth`で数値を読み取りスクリーンショットのみに
頼らず確認）: Target=50%（既定）で3候補生成→約35秒で完了→
metric tableのsurface target/measured/gap/停止理由が`state`の
生データと一致することを確認→coverage sample表示トグルを実座標
クリックで有効化し緑/暗い灰の点群がhost全体に表示されることを確認
（field-onlyパネルは目視でも足元全体へ広がる構造、coin/ringパネルは
ほぼ垂直な柱、という定性的な差もcoverage%の実測と整合）→Custom
target入力の表示切替を確認。console error無し。

自動テスト`growth.test.ts`（50件、Task#24のS1テスト7件+Task#28のS2
growth-behavior テスト7件を含む）・`npx tsc -p tsconfig.json --noEmit`
（自分が書いたファイルはエラーなし。当時`measureS1.ts`は別プロセスの
成果物で`node:fs`型定義が無くエラーのままだったが、後日の重複整理で
同ファイル自体が削除され解消した——上記「後日整理」の追記参照）・
`npx vite build`（9ページ、正常終了）すべて確認した。

## Observation（S2.1 coverage attainment、2026-07-25）

`Optimizer/docs/sonnet-instruction-20260725-katachi-interior-growth-s2-1-
coverage-attainment.md`。前段（S2）で実測coverage 1〜11%だった状態から、
「単にunit数やbudgetを増やす」のではなく、build plateから連続支持された
一体形状を保ちながら未被覆面を減らす候補を評価・選択する原理を実装した。

### 変えた形状原理

- **§5.1 region**: 4000 surface sampleを、host bounds上の決定論的な
  一様gridセル（1セルあたり平均14点、`colonization.ts`の
  `computeSurfaceRegions`）へ集約。targetは1点ではなくregion単位で選び、
  build-axis高さ帯8本のquota（`bandTargetCount`）で1つの帯に集中しない
  ようにした
- **§5.2 reachability cone**: 既存rule 5自体（`allowedLateral =
  verticalRise/tan(angle)`）を、frontierからtarget aim pointまでの
  多段階到達可能性の事前フィルタへ一般化（`coneReachable`）。高価な
  候補生成の前に、現在のsupport角度では幾何的に絶対到達できない
  frontier-target組を除外する
- **実バグ発見**: このcone式を導出する過程で、S2の`colonizeTiltRad`が
  buildAxisからの最大有効tilt角を`supportThresholdAngleDeg - margin`
  （既定30°で約27°）と誤って計算していたことが判明した。rule 5の式を
  直接再導出すると、正しい上限は`90° - supportThresholdAngleDeg -
  margin`（既定30°で約57°）——ほぼ2倍の有効コーンをS2は使い損ねていた。
  6段階の角度（10/20/30/45/60/80°）で数値検証した上で修正した
  （`growth.test.ts`にも回帰テストを追加）
- **§5.3 plate-connected base（"plate-walk"）**: 現frontierのどれも
  target regionへcone到達不能な場合、新しい孤立rootを置くのではなく、
  既存unitのうち最も低いものから、ほぼ水平（既定でunit半径の8%だけ
  buildAxis方向へ上昇）な小さな一歩をbuild plate沿いに刻む。rule 5自身の
  浅い上昇時の許容量が自然にこの一歩の長さを制限するため、
  「build plate上のbaseを広げる」ことが、既存のparent接触ルール（rule 4）
  だけで——新しい特別な接続判定を作らずに——実現できる。グラフ上も
  メッシュ上も、常に既存材質へ接続されたまま育つ（構造的に単一
  component、§8 item 9で検証）
- **§5.4 approach / spread**: 遠い（step長の2.5倍超）場合はtarget方向
  azimuth±狭いfanで近づき、近い場合はtarget方向から「近傍の既coveredな
  sample方向を差し引いた」azimuth±広いfanへ切り替える（完全な局所接平面
  幾何ではなく、既存の検証済みtilt-coneを再利用した近似——正直な単純化
  として明記する）
- **§5.5 multi-term score**: 各step-fraction tierで合格した候補**全部**
  を評価し、最初に見つかった1個ではなく最高scoreの候補を採用する。score
  はcoverage gain・追加材質量・rule5/6余裕度への近さ・既coveredとの重複・
  経路長・host境界近さの6項を正規化して合成（`colonization.ts`の
  `computeCandidateScore`、weightはStudy仮値でUIへ出さない）。coverage
  gainがゼロの候補は、target距離が実際に縮む経路構築中間unitとしてのみ
  採用する
- **§5.6 spatial hash + 増分coverage**: `coverage.ts`のcanonical
  `computeSurfaceCoverage`をfull recomputeするのは20 accepted unitごと
  （ドリフト検査用）と最終確定時のみ。それ以外は、候補の点群近傍の
  reference sampleだけをspatial hash（`colonization.ts`の
  `SpatialHash`）で引いて増分gainを見積もる。**最終的に保存される
  measuredSurfaceCoverageは常にfull recomputeの値**（§3の不変条件どおり、
  増分値をそのまま保存したことはない）

### baseline → after（既定Printer=A1 mini・既定layer height/angle・既定seed、
### coin-constrained抜粋、host×target）

| host | target | baseline measured | after measured | after stopReason |
|---|---|---|---|---|
| box | 25% | 3.00% | 3.77% | candidate-budget-exhausted |
| box | 50% | 4.87% | 5.37% | candidate-budget-exhausted |
| sphere | 25% | 1.40% | 5.57% | candidate-budget-exhausted |
| sphere | 50% | 1.82% | 7.45% | candidate-budget-exhausted |
| waisted | 25% | 1.43% | 4.53% | candidate-budget-exhausted |
| waisted | 50% | 1.43% | 4.88% | candidate-budget-exhausted |

field-only・ring-constrained・75%targetを含む全27行の完全な
baseline/after表は`docs/`ではなくこのセッションの一時測定ファイルに
残っており、この場ではcoin-constrained・主要2 targetのみ抜粋する
（sphere ring-constrainedは0%/25%/50%/75%いずれも1.20%で変化なし——
sphere+ring特有のcone/角度制約の重なりで、このセッションの改善が
一切効かなかった正直な観測）。

一度、`COLONIZATION_BUDGET_SAFETY_FACTOR`を1.5→4・`HARD_CAP`を500→1200へ
増やして再測定したところ、box coin 25%は8.52%（budget増加前の約2.3倍）
まで伸びたが、3候補合計の生成時間が約77秒（growth自体は速い——mesh生成
がunit数に対して重い）となり、指示書§13の明示的禁止事項
「main threadをさらに長く止める」に直接抵触するため、この変更は
**revertした**。coverage率とUI応答性のこの直接的トレードオフは、
Gate D（Worker化）を先に解決しない限り解消できない、という正直な
限界として記録する。

### 最低合格matrix（§7.1）に対する判定

**未達。** target 25%でbox/sphere/waisted全host 23%以上、という最低条件
に対し、実測は3.77%/5.57%/4.53%——約5〜6倍不足している。したがって
**この回でS2.1を「完了」とは報告しない**（指示書§14「最低合格matrixに
届かなければ、正直に未完了として返す」のとおり）。

支配的な限界（診断のため一時的に計測、コードには残していない）:
zero-gain accepted unit数が全acceptedの50〜70%を占め、その大半は
「approach」モード——遠いregionへ複数stepかけて近づく途中の、
まだcoverageに寄与しない移動——だった。host表面には約180〜290個の
小さなregionがあり、それぞれに主幹から複数stepの「到達コスト」が
かかる一方、budget（実質数百unit、mesh生成performanceの制約で
これ以上大きくできない——Gate D未解決）はその到達コストを数十region分
しか賄えない。search radiusを広げてapproach経路上のたまたま近い
別regionへ副次的にgainを与える案も検討したが、convexなhost（box/
sphere）では、frontierからhost境界上の遠い点へ向かう経路の大部分は
host内部の空間を通るため、途中でどのsampleにも近づかない——これは
探索の非効率ではなく、物理的に材質がtarget地点へ到達するまでcoverage
に寄与できないという、現実のFDM支持材の制約を素直に反映した結果だと
判断し、この案は採らなかった。

**Gate D（応答性）は未実装**。段階別時間計測・Worker化・進捗表示・
cancelはこの回では着手できなかった——時間的制約による正直な未完了で
あり、隠していない。現状、既定budgetでの3候補生成は実測約28秒
（各候補のgrowth自体は1秒未満で、mesh生成が候補あたり8〜9秒と大半を
占める）——S2round末の140秒からは改善したが、指示書自身が「数秒を
超える処理はKatachi共通UI規約に反する」と明記する基準は依然満たして
いない。

## Observation（独立監査による構造・探索・互換性の修正、2026-07-25）

`Optimizer/docs/sonnet-correction-20260725-katachi-interior-growth-s2-1-
audit-fixes.md`。独立監査が既定条件（Printer=A1 mini・box・coin-
constrained・target 25%・rootTarget=5既定値）で実測し、以下を発見:

- **保存後mesh connectedComponents=3**（自分の再現では4）——`rootCount:
  rootTarget:5, rootCount:5, accepted:200`。`saveGateOk:true`のまま
  複数部品のSTLを通常保存できていた
- scoreの実スケール不整合: coverage gain項が候補あたり0.0005〜0.002なのに
  対し、material penalty項が約0.116（自分の再現でも一致）
- 旧S2 recipeの読み込みで`algorithmVersion`等が`undefined`のまま
  （`primaryPathUnitIds`存在チェックがS2時代の結果を「既に新形式」と
  誤判定していた）

### 修正（C1〜C6、指定順序で実施・全gate通過を確認）

- **C1 一体形状の保証**: Phase A後の独立追加root生成ループを削除
  （`rootTarget`は現在no-op、field.tsに理由を明記）。graph rootは常に1つ。
  `plateContactCount`をrootCountと区別する新metricとして追加
  （この`plateContactCount`は2026-07-25のO2監査修正で削除した。計算時点が
  connected baseより前で、判定も重心ベースだった — 下の「2つのプレート指標を
  分けた経緯」を参照）。
  `evaluateSaveGate`が`connectedComponents !== 1`を不合格にするよう修正
  （合成2部品meshでの回帰テスト追加）
- **C2 support-angle計算の正本化**: `allowedLateralForStepMm`
  （field.ts）を単一の共有関数とし、rule 5・reachability cone・score risk
  項すべてがこれを呼ぶ。**実バグ発見**: 旧`colonizeTiltRad`が最大有効tilt角を
  `angle-margin`（既定30°で約27°）と誤計算していた。rule 5式を再導出すると
  正しい上限は`90°-angle-margin`（既定30°で約57°）——ほぼ2倍の有効コーンを
  使い損ねていた（6角度で数値検証）。coneも単一continuous式ではなく、
  実際のstep数で積算するroute-level統合へ変更（§4.1「小さい正のriseでは
  1layer分のlateral allowanceを使える」を反映、hard excludeではなく
  priorityの楽観的推定に限定）。build-axis単調性: 負のriseは新設した
  `negative-rise-rejected`理由で常時拒否
- **C3 plate-walkの連鎖化**: region単位の`RegionRouteState`
  （frontierUnitId/acceptedPathUnitIds等）を導入し、frontierを毎回
  「全unit中最も低いもの」に戻すのではなく、直前に採用したchildへ更新する
  ——真に`root→child1→child2→child3`と連鎖するようになった
- **C4 scoreの値域修正**: 直接gain>0の候補を常にgain=0の経路構築候補より
  優先する二段階選択を導入。coverage gain項の分母をhost全面積から
  候補の局所探索面積（`estimateMarginalGain`の新規`localSearchWeight`）へ
  変更し、他項と比較可能な値域にした
- **C5 recipe/provenance互換性**: `algorithmVersion`の**不在**でS2時代の
  結果を検出（`primaryPathUnitIds`の存在チェックは誤検出の原因だった
  ——S2時代の結果は既にこれを持っていた）。未測定のS2.1診断値
  （regionCount等）はnullへ（0捏造しない）、UIは「未記録」表示。
  `scoreWeights`は生成時点のスナップショットとしてGrowthResultへ保存し、
  現在のglobal constantから書き出さないよう修正
- **C6 テスト修正**: 常に真になる`=== false || true`パターンを削除し
  実際の境界値で検証。C1の回帰テストはrootTarget:1へ弱めず、既定値
  （5）のままbox/sphere/waisted全hostで検証
- **C7（Worker化・進捗表示・cancel）は未着手**——時間的制約による正直な
  未完了。既定budgetでの3候補生成は実測約28秒（mesh生成が支配的）

### 実測差分（coin-constrained抜粋、独立監査と同条件）

| host | target | 監査前 measured | 監査後 measured | 監査後 stopReason |
|---|---|---|---|---|
| box | 25% | 3.77% | 2.85% | host-boundary-blocked |
| sphere | 25% | 5.57% | 6.40% | candidate-budget-exhausted |
| sphere | 75% | 8.75% | 13.57% | candidate-budget-exhausted |
| waisted | 25% | 4.53% | 6.98% | candidate-budget-exhausted |

正直な記録: box host（coin/ring-constrained）はC1修正後、全target
（25/50/75%）で同一の低い値に張り付き`host-boundary-blocked`で早期停止
する——独立root除去でPhase Aの単一主幹だけが起点になった影響と見られる。
一方sphere/waisted、特にring-constrainedは大きく改善した
（sphere ring 75%: 1.20%→19.42%）。**最低合格matrix（coin target 25%で
box/sphere/waisted全host23%以上）は依然未達**（実測2.85%/6.40%/6.98%）。

実ブラウザ検証（`http://localhost:5174/interior-growth.html`、実座標
クリック）: Printer切替・Host切替・target25%切替・3候補生成を実座標で
確認し、`window.__interiorGrowth`のstateとmetric table表示の一致を確認。
sphere host・target25%生成で`rootCount:1`を3候補すべてで確認。**新たな
発見**: ring-constrained候補で保存ボタンが無効化され、理由表示に
「connected component数8」と出た——C1が意図通り機能し、graph上は
`rootCount:1`でも mesh smooth-min blendの融合が弱いring形状特有の
未解決課題を正直に検出した（今回のスコープ外、Next参照）。処理中は
メインスレッドが応答しないことも確認した（Gate D未着手の予期された結果）。

## Observation（O2 Connected Base + Multi-source Upward Colonization、2026-07-25）

`Optimizer/docs/opus-instruction-20260725-katachi-interior-growth-connected-multisource.md`。
この回は「前担当の続き」ではなく、まず**独立診断（Phase O1）**を行い、指定coverageへ
届かない原因がアルゴリズムの局所バグなのか成長原理そのものなのかを判定してから
実装した。以下はすべて実測であり、仮説はHypothesis節と混ぜない。

### O1 独立診断（コード変更前、既定条件: A1 mini / layer 0.2mm / angle 30° / 既定seed / coin-constrained / target 25%）

前担当の報告値を再現できた（box 2.85% / sphere 6.40% / waisted 6.98%）。
その上で、accepted unitを「何の仕事で採用されたか」で分類して測った:

| role | box | sphere | waisted | 1unitあたり被覆sample数 |
|---|---|---|---|---|
| primary-path | 49 (36%) | 55 (26%) | 59 (27%) | 0.27–0.39 |
| surface-approach | 59 (43%) | 121 (57%) | 125 (57%) | 0.82–0.97 |
| surface-spread | 28 (20%) | 35 (17%) | 35 (16%) | **1.54–3.91** |
| connected base | 0 | 0 | 0 | — |

さらに、成長ループを完全に外し、参照表面へ理想配置したcoinだけで
「1 unitが実際に覆える面積」を測った（`0.5×unitRadius`の深さ、間隔0.18）:
**0.026 field²/unit（≈4.4 sample/unit）**。πr²=0.0616の**42%**でしかない。

この3つの数字から、中心主幹方式のcostを次のように結論した:

1. **surface-spreadは他のroleの4〜14倍productive**なのに、budgetの16〜20%しか
   与えられていない。旧実装はregionのaim sampleが覆われた時点でregionを捨て、
   次に「未被覆重みが最大のregion」をhostのどこからでも選び直すため、
   approach costを何度も払い直していた（approachがbudgetの43〜57%）。
2. **`host-exterior`が全hostで最大の棄却理由**（box 2890 / sphere 5114 / waisted 7059）で、
   boxが2.85%で`host-boundary-blocked`に張り付く直接原因だった。旧"spread"モードは
   headingを**build axis周りの固定azimuth fan**で作っていた。垂直な壁に対しては
   fanの大半が壁を突き抜ける方向を向く。
3. 前担当が「実装済み」と記述していた**plate-connected base（plate-walk）は
   実際には1 unitも生成していなかった**。boxでは2番目に低いunitが既に0.23 field
   上にあり、baseは点のままだった。

**判定**: 依頼書§4の中心仮説（Connected Base + Multi-source）は**boxについては正しい**が、
測定上の主因ではなかった。主因は「表面へ到達した後、表面に沿って進めないこと」である。
したがって採用した原理は**Connected Base + Multi-source Upward Colonization に
§6.4の実接平面spreadを主軸として組み合わせたもの**とし、優先順位は測定に従って
(1) 接平面spread (2) budget式の実測補正 (3) connected base / multi-source とした。

### 実装した形状原理と、それぞれの実測根拠

- **rule 2b — build plate上のunitはoverhang規則を免除**（`evaluateCandidate`）。
  これが無いとconnected baseは「作りにくい」のではなく**構造的に禁止**されている:
  板沿いのstepはbuild axisから約90°で、rule 5の上限は`90° − supportThresholdAngleDeg`
  （既定30°で57°）なので、水平stepは必ず`lateral-advance-exceeded`になる。
  前回のplate-walkもこの回の最初の実装も、baseが0 unitだったのはこれが理由。
  免除範囲は狭く限定した（板に接する候補のみ、overhangに関する2規則のみ。
  rule 1のhost内包とrule 6のspanはそのまま適用）
- **§6.4 実local tangent plane**（`colonization.ts`の`localTangentBasis`）。
  最近傍参照sampleの法線から接平面を実際に作り、**法線周りに**fanを振る。
  build axis周りのfanは廃止した
- **深さは「押す方向」ではなく「設定値」**。coverage probe shellは
  `0.5×unitRadius`にあるので、そこを保つ。最初は一定の内向きbiasにしたところ
  box 2.85%→**0.40%**と大幅に悪化した（frontierが毎step沈み、何も覆えない
  深さで表面を這う。395 unit中344がzero-gain）
- **coinの向きをstep方向から分離**。表面近傍ではcoin面を局所接平面に一致させる
  （heading = 外向き法線）。ringはbuild axis基準の自前規則があるため従来どおり
- **§6.2 region到達コスト**（`estimateRouteUnitCost`）: Euclid距離ではなく
  「必要な上昇量・横移動・support角度から導いた推定unit数」。目標が下にあれば
  Infinity（rule 5は下降を許さない）
- **§6.2 traversability項**（`isSurfaceTraversable`）: 外向き法線とbuild axisの
  なす角をαとすると、接平面内でbuild axisに最も近い方向は`|90°−α|`。これが
  tilt cone内でなければ**その表面は沿って進めない**。既定30°ではsphereの
  y=−0.626以下（面積の23%）がこれに該当する。この項が無いと、sphereは
  「近くて安い」底のcapに全budgetを注ぎ込み、全spread unitが高さ0.17以下
  （host高さ2.3）に留まって6〜7%で停止した
- **budget式の補正**: 旧式は必要unit数を`目標面積 / πr²`としていた。実測の
  理想配置歩留まりはπr²の**42%**、経路overheadまで含めた実効歩留まりは
  **13〜22%**。この2.4〜7倍の過小評価が、どれだけ上手く育てても目標に
  届かない構造的原因だった。overhead係数は実測最悪値（4.5）を採る。
  `target-reached`で停止するので、早く届いたhostに余剰budgetの害は無い
  （boxは上限900に対し436 unitで停止）

### 実装中に測定で見つけて直したbug

1. **zero-gain traversal stepがstall counterをreset**していた。regionを
   完全被覆できない場合frontierが永久に解放されず、sphereは底のcapを
   飽和させた後、残り全budgetをそこの徘徊に使った
2. **traversal上限をapproach/trunkにも適用**していた。approachは本質的に
   zero-gainであり、sphereの赤道は軸から約19 step。10 stepで打ち切られ、
   sphereは底のcapから出られなかった
3. **region routeが割当launch pointのsubtreeをhard filter**していた。
   sphereのlaunch point 38個は全て底のcap内にあるため、上部regionが
   低いbase unitからしか出発できなかった（soft preferenceへ変更）
4. **step tierの早期return**: 最初にacceptedが出たtierで打ち切っていたため、
   full stepのzero-gain候補が、短いstepなら被覆できた候補を締め出していた
   （sphere 10.4%→6.6%の原因）
5. **plateau counterがacceptedのroute stepも数えて**いた
6. **abandoned regionを二度と再考しない**設計だった。regionを捨てる理由は
   「その時点でfrontierが別の場所にある」等の一時的なものなのに永続化していた
   （sphereはbudgetを1/3残したまま22.85%で停止していた）
7. **rootが接地tolerance帯の上端に着地しうる**（box実測: 板から0.1586、
   tolerance 0.1581）。rule 5は下降を許さないので、rootの高さがそのまま
   形の下限になる。boxの底面は表面積の1/6であり、これを失う。
   root samplingを「最初に受理された候補」から「受理された中で最も低い候補」へ変更

### 採用しなかった案（いずれも実測で悪化したため）

- **接続部へのanchor material追加**（§7が明示的に許可している手段）:
  sphere ringのcomponentが1→4、coverageが7.95%→6.00%へ悪化した。
  anchorはcoverage測定上のmaterialでもあるため、anchorを置く判断そのものが
  探索経路を変えてしまう
- **rule 4に最小overlap深さを要求**: ring componentは改善せず（13/9/21）、
  sphere ringは1→9へ悪化した
- **export resolutionの引き上げ**: box ringは64→160でcomponent 27→26と
  ほとんど動かない。resolution起因ではない

### 実測（既定条件、target 25%、同一seedで再現確認済み）

| host | variant | coverage | 停止理由 | units | graph root | region launch候補 | 実プレート接触 | height cov | 保存後component | 保存ゲート |
|---|---|---|---|---|---|---|---|---|---|---|
| box | field-only | 23.10% | target-reached | 530 | 1 | 2 | 24 | 0.992 | 1 | 合格 |
| box | coin | **23.05%** | target-reached | 436 | 1 | 110 | 128 | 0.992 | 1 | 合格 |
| box | ring | 18.30% | host-boundary-blocked | 547 | 1 | 1 | 193 | 0.978 | 27 | **不合格** |
| sphere | field-only | 23.10% | target-reached | 486 | 1 | 2 | 12 | 0.998 | 1 | 合格 |
| sphere | coin | **23.02%** | target-reached | 625 | 1 | 96 | 98 | 0.998 | 1 | 合格 |
| sphere | ring | 7.95% | host-boundary-blocked | 288 | 1 | 1 | 0 | 0.966 | 1 | 合格 |
| waisted | field-only | 23.03% | target-reached | 444 | 1 | 2 | 18 | 0.999 | 1 | 合格 |
| waisted | coin | **23.00%** | target-reached | 349 | 1 | 94 | 101 | 0.999 | 1 | 合格 |
| waisted | ring | 19.10% | host-boundary-blocked | 561 | 1 | 1 | 156 | 0.958 | 18 | **不合格** |

**最低合格matrix（coin-constrained、target 25%で全host 23%以上）: 達成**
（2.85%→23.05% / 6.40%→23.02% / 6.98%→23.00%）。
`target-reached`以外を成功として報告していない。

#### 2つのプレート指標を分けた経緯（2026-07-25、O2監査修正 P2）

**前回このtableの110 / 96 / 94を「plate contact」という名前で載せたのは誤りだった。**
あの数字は `launchPointCount`、すなわち **region割り当てのlaunch候補**であり、
材質がプレートに届いていることを検証した数ではない。候補の選び方は
「unitの**重心**がプレート面から自分の半径由来の帯の中にあるか」という粗い判定
（`isUnitNearPlate`）で、独立監査はこの集合の中に正の隙間を持つunitを実際に見つけている
（最大 box 3.630mm / sphere 5.922mm / waisted 3.322mm）。UIも
`graph root / plate contact` の1行で root と launch候補を並べており、
表示名と実体が一致していなかった。

さらに旧 `plateContactCount` は connected base を作る前に計算されていたため、
3 hostとも 2 になっていた。この名前は残さず削除し、次の3つを別の値として扱う。

| 指標 | 定義 | 測る時点 |
|---|---|---|
| `rootCount` | `parentId === null` のunit数（graph上の根） | 常に1 |
| `actualPlateContactCount` | unit自身の**材質最下端**とプレート面の距離をcanonical scaleでmm換算し、**layer height（既定0.2mm）以内**のもの | **全成長段階の後**（connected base を含む） |
| `launchPointCount` | near-plate判定で選ばれたregion launch**候補**数 | Stage 2（region割り当て時） |

許容差は unit半径ではなく layer height に由来させている。材質最下端は
`unitFieldElements`（coinは球、ringは先細りcapsule）から取る — 先細りcapsuleは
両端球の凸包なので、両端の (投影 − 半径) の最小値が厳密な最下端になる。

base unit自身の実測clearance（負 = プレート面以下）:

| host | base unit数 | clearance 最小 | clearance 最大 |
|---|---|---|---|
| box | 108 | −2.938mm | **−0.154mm** |
| sphere | 94 | −2.381mm | **+0.047mm** |
| waisted | 92 | −2.276mm | **−0.108mm** |

sphereの +0.047mm も既定 layer height 0.2mm の中に収まっている。つまり
connected base の原理そのものが否定されたわけではなく、崩れていたのは
**指標の定義・計算時点・表示名**である。

ここから言えるのはこれだけである。「材質最下端がプレート面から1 layer以内にある
unitがこれだけ数えられた」。support不要とも印刷可能とも言えない。実機での定着・
接着・剥離は測っていない。

※ **前回このtableの `waisted / ring` 行に書いた 19.43% / 542 unit は転記ミスだった。**
正しくは 19.10% / 561 unit（監査修正の再測定・最終コードでの再々測定・
`o2-ring3`実行の3回とも一致、同一seedで決定論的）。19.43% / 542 は、§7の
「接続部へのanchor material追加」を試した実験中の値であり、その実験は測定で
悪化したため採用せず revert したのに、tableの行だけそのまま残っていた。
box ring・sphere ringは元から正しい。今回の監査修正は成長側を一切触っていない
（coin 3 hostの23.05 / 23.02 / 23.00%とrootCount 1は完全に一致）。

#### P2で新たに測れたこと（いずれも今回は直さず、数値として残す）

指標をmm基準にしたことで、これまで見えていなかった3つのずれが**測れるように**なった。
いずれも成長側を触る修正になるため、監査指示書§0「この監査修正を別の探索仕事へ
広げないこと」に従い今回は直していない。

1. **rule 2b の免除帯は「接触」より約10倍広い。** build plate上のunitに
   overhang規則を免除する rule 2b の帯は、実測で 1.8〜2.2mm 相当
   （`maxR * 0.35` をcanonical scaleでmm換算した値）。一方「実プレート接触」は
   1 layer = 0.2mm。したがって下降stepを許されたunitのうち
   box 10 / sphere 50 / waisted 12 個は、最大 +2.05mm 浮いている。
   自動テストはこのずれを「rule 2b自身の帯の中には必ず収まる」ことと
   「2.5mmを超えない」ことで固定し、黙って通さないようにした
2. **保存meshはbuild plateより下へ出る。** 実測 box −1.041mm / sphere −1.128mm /
   waisted −0.814mm。原因はmesh化に使うsmooth-min blend（blendKは
   canonical scaleで2.8〜3.4mm）で、プレート上の材質から等値面が外へ膨らむため。
   スライサーはプレート下を切るのが普通だが、この Study がそれを代弁はしない。
   テストは「0である」ではなく「blendKの範囲に収まる」で固定した
3. **`launchPointCount` は最終unit集合に対する数ではない。** 成長途中
   （baseを作った後・spread前）のsnapshotである。最終unit集合に対して
   同じnear-plate判定をかけると box 148 / sphere 195 / waisted 124 になり、
   `actualPlateContactCount`（128 / 98 / 101）はその**部分集合**である
   （実測: 材質接触なのにnear-plateでないunitは3 hostとも0個）。
   box で launch候補110 < 実接触128 になるのはこのためで、矛盾ではなく
   測る時点の違いである

用途別内訳（coin-constrained、O1との比較）:

| role | box 前→後 | sphere 前→後 | waisted 前→後 |
|---|---|---|---|
| primary-path | 49 → 51 | 55 → 57 | 59 → 59 |
| connected base | 0 → 108 | 0 → 94 | 0 → 92 |
| upward trunk | — → 0 | — → 37 | — → 0 |
| surface-approach | 59 → 6 | 121 → 78 | 125 → 0 |
| surface-spread | 28 → 270 | 35 → 358 | 35 → 197 |

approachがbudgetの43〜57%から0〜13%へ下がり、spreadが16〜20%から56〜73%へ
上がった。これが数字の実体である。

### 性能（O4 §9）

`unitsPointsSdf`をunit point spatial index経由に置き換えた
（`createUnitsFieldSampler`）。marching tetrahedraは resolution³点で場を評価し、
厳密版は毎点で全unitの全pointを走査していた。

| | O1時点 | O2時点 |
|---|---|---|
| box mesh生成 | 3325ms（137 unit） | 1014ms（397 unit） |
| sphere mesh生成 | 4692ms（212 unit） | 525ms（300 unit） |
| waisted mesh生成 | 3390ms（220 unit） | 551ms（296 unit） |

unit数あたりでは約10倍速い。**export resolutionは64のまま下げていない**
（§9の禁止事項）。索引版は「場が0付近ではSDFに一致し、遠方は打ち切る」近似で、
自動テストで厳密版との符号一致と誤差上限を検証している。

### 応答性（O4 / Gate D）— 実ブラウザ実測

`growth.worker.ts` + `growthWorkerProtocol.ts`。`http://localhost:5174/interior-growth.html`で
実座標クリック（`document.elementFromPoint`でヒットテストしてから`left_click`）:

- target 25%ボタン → `state.params.targetSurfaceCoverage` が 0.5→0.25 になることを確認
- 3候補生成 → 生成中に`javascript_tool`から**0msで応答**、進捗表示
  「生成中 2/3（Coin）: メッシュ生成 — 経過 8.9 秒」、中止ボタン表示、生成ボタン無効
- 「生成を中止」を実座標クリック → 「生成を中止しました（結果は反映していません）」、
  `state.results`は直前の3件のまま（中止したrunの結果は反映されない）
- 再生成 → box coin 23.05% / root 1 / region launch候補 110 / component 1 / 保存ゲート合格
  （この110は当時「plate contact」と表示していた値。実プレート接触は別指標で、
  再測定では128 — 上の「2つのプレート指標を分けた経緯」を参照）。
  UIの表示値と`window.__interiorGrowth.getState()`の生データが一致

**Worker化で計算が速くなったとは報告しない。** 実処理時間はブラウザ実測で
3候補合計24.4秒（growth 15.5s / mesh 8.9s、実時間27.7秒）。O1時点の約28秒と
同程度であり、変わったのは「その間main threadが応答するか」だけである
（O1時点はタブが自動化ツールからも到達不能だった）。

### 未解決（正直な記録）

- **ring-constrainedはbox/waistedで保存後meshが18〜27 componentになり、
  通常保存できない**。保存ゲートは正しく拒否している（§7の
  「multi-componentを通常保存可能へ戻さない」は満たしている）。
  切り分け済み: (a) 親子の材質は全ペアで実際に重なっている（最薄で−0.0105、
  材質unionは連結）、(b) export resolutionを64→160にしても27→26でほぼ不変、
  (c) 空間indexではない（厳密版でも28 component）。
  ring自身のnode球は互いに接していない（間隔0.107 vs 半径和0.078）という
  実測に基づき、mesh場をcoverage側と同じ**capsule chain**へ揃えた
  （これによりsphere ringはcomponent 1で保存可能になった）が、box/waistedは
  未解決のまま残る。§7自身が「Ring coverage改善はcoin 25%達成後でよい」と
  しているため、ここで打ち切って正直に記録する
- **host fitのmarginとunit半径の関係**: `STUDY_MARGIN_FRACTION=0.1`は
  host bboxを162mm（180mmのbuild volumeに対し片側9mm）にするが、
  表面まで実際に被覆すると生成materialはhost境界から約1 unit半径ぶん外へ出る。
  既定`unitRadius=0.14`では余裕5.7〜7.2mmで収まるが、`0.18`にすると
  box実測184.2mmでbuild volumeを超え保存ゲートが（正しく）拒否する。
  marginをunit半径から導く方が筋が良い（Next）
- recipe読み込み時のmesh再構築だけは今もmain threadで動く（生成はWorker経由）
- 実スライサーでのサポート生成量、実CoinSRF/実STL hostは引き続き対象外

### Observation（O2監査修正 P1 — 生成中の入力変更で古い結果が混入する、2026-07-25）

`Optimizer/docs/opus-correction-20260725-katachi-interior-growth-worker-state-and-plate-metrics.md` §1。
独立監査が実クリックで再現した不具合:

1. host = box、target = 25%、「3候補生成」を押す
2. Worker生成中に host = sphere を押す
3. 完了表示が `合計accepted 1513 unit`（= boxの 530+436+547）。
   sphereの既定は 486+625+288 = 1399。boxで作ったmesh/gateがsphere選択状態の
   保存ボタンに付いていた

**根本原因**: Workerの結果を `requestId` だけで守っていた。requestIdは
「別のrun」を区別するが、**そのrunがどの条件で始まったか**は何も表さない。
だから生成中に入力を変えてもrunは生き残り、その結果が新しい別の状態へ入った。

**修正は2つで、両方必要**（片方だけでは不十分）:

- **A. 条件を変えたcallbackがactive runを無効化する。** 値を history/state へ
  記録する**前**に `invalidateActiveRun()` を呼び、Workerをterminateする。
  対象: printer preset / custom build volume / host / build axis / layer height /
  support threshold angle / target surface coverage / GrowthParams / seed /
  unit kind / clear / recipe import（`.then`の中でも再度）。
  表示は「生成条件が変わったため、実行中の生成を中止しました。新しい条件で
  再生成してください。」
- **B. 結果受理時にcontextを照合する。** request開始時の入力snapshotを
  `generationContext.ts` の決定論的keyへ落とし、message受理の直前に
  現在stateから作り直したkeyと比較する。不一致ならmessage全体を破棄し、
  `state.results` / `meshCache` / `provenanceCache` / renderer / save gate /
  historyのいずれも触らない。**一度入れてから消す、はしない。**

Aだけだと「今後追加されるcallbackが必ず呼んでくれる」という約束に依存する。
Bだけだと不要になったrunが最後まで計算を続ける。だから両方入れた。

context keyに含めるfield（`generationContext.ts`）: hostId / printerPresetId /
buildVolumeMm / envelope全field（buildAxis・layerHeightMm・
supportThresholdAngleDeg・derivedMaxLateralAdvancePerLayerMm）/ params全field
（seed・unitKind・lift・drift・cohesion・branching・voidBias・unitRadius・
ringNodeCount・ringTubeR・rootTarget・targetSurfaceCoverage）/
canonicalScaleMmPerUnit / variants / meshResolution / blendK。
`JSON.stringify`ではなく手書きの連結にしている — stringifyの出力はkeyの挿入順に
依存し、既定値から作ったstateとrecipe replayで作ったstateが構造的に同じでも
別文字列になりうるため。

provenanceも request snapshot（printer / fit / meshResolution / blendK）から
組み立てるようにした。結果到着時のlive stateから取り直さない。

**実ブラウザ再試験（修正後、実座標クリック）**: box / 25% で生成開始 →
生成中に sphere へ切替 → 「生成条件が変わったため、実行中の生成を中止しました」
が表示され、`state.results` は 0 件のまま（boxの1513 unitはsphere状態へ入らない）
→ 改めて sphere / 25% で生成 → coin 23.02% / accepted 625 / graph root 1 /
実プレート接触 98 / launch候補 96 / component 1 / 保存ゲート合格。
UI表示と `window.__interiorGrowth.getState()` の生データが一致。console errorなし。

### Observation（P2.1 / P2.2 — plate支持と保存面、2026-07-25）

`Optimizer/docs/sonnet-correction-20260725-katachi-interior-growth-plate-support-and-export-plane.md`。
**前回この2件を「測ってREADMEに未解決として書いた」で終わらせたのは誤りだった。**
発見した不具合を、テストの合格条件を緩める形で受け入れていた（rule 2bは
「自分の半径帯に収まる」、保存meshは「blendK以内なら合格」）。どちらも
「見つけた問題を別の要件に置き換える」ことであり、直すのが正しい。

#### まず、前回の測定値そのものが間違っていた

前回「保存meshがbuild plateより 0.8〜1.1mm 下へ出る」と報告したが、
あの数値は**軸と単位を両方間違えていた**。テストが読んでいた `v.z` は3 hostとも
build軸ではなく**横方向**の座標で、しかも field単位の値をmmとして報告していた。
同じ量を再現すると box −1.0519 / sphere −1.0785 / waisted −0.8455 **field単位**で、
前回の数字と一致する。build軸に沿った実際のはみ出しは:

| host | 前回報告（誤） | 実際（build軸・mm） |
|---|---|---|
| box | −1.041mm | **−4.372mm** |
| sphere | −1.128mm | **−3.259mm** |
| waisted | −0.814mm | **−3.216mm** |

**実害は報告値の3〜4倍だった。** 監査指示書の表もこの誤った値を引き継いでいる。
（横方向の −0.85〜−1.05 field は blend が host壁の外へ膨らんでいる別の事象で、
plate とは無関係。今回のスコープ外として残す。）

#### P2.1 — rule 2b を実プレート接触基準へ揃えた

rule 2b は `lowestPointClearance <= maxR * 0.35` で plate支持を判定していた。
既定サイズではこれは **1.8〜2.2mm** の浮きを許す — layer height 0.2mm の約10倍で、
同名の指標 `actualPlateContactCount` の定義とも一致しない。実測では
下降stepを許された **box 10 / sphere 50 / waisted 12** 個のunitが最大 **2.047mm**
浮いたまま、negative-rise と overhang cone の両方を免除されていた。
プレートに届いていないのだから「build plateが支える」という根拠がない。

判定を `actualPlateContactCount` と同じ規約へ統一した。純粋helperを1つにまとめ、
candidate評価とaccepted後のmetricが別実装にならないようにした:

- `lowestMaterialField(kind, points, buildAxis)` — 実材質最下端（coinは球、
  ringは先細りcapsuleの端点。coin/ringで同じ定義を共有）
- `plateClearanceMm(lowestField, plateOffset, scaleMmPerUnit)` — canonical scaleでmm換算
- `isOnPlateMm(clearanceMm, layerHeightMm)` — 許容する正のclearanceは最大1 layer

`PLATE_SUPPORT_CLEARANCE_FACTOR = 0.35` は rule 2b から撤去した。粗い
near-plate規約（`isUnitNearPlate`、launch候補の選定用）と、overhang免除の
実接触規約を混ぜない。

**接触許容帯は広げていない。** coverageは維持できた:

| host | 修正前 | 修正後 | 1 layer以上浮いたplate支持免除unit |
|---|---|---|---|
| box | 23.05% | **23.02%** | 10 → **0** |
| sphere | 23.02% | **23.12%** | 50 → **0** |
| waisted | 23.00% | **23.03%** | 12 → **0** |

3 hostとも `target-reached`。テスト閾値は下げていない。

※ `field-only` は `constraintsActive === false` で、rule 2bを含むsupport規則の
判定に入る前に受理される（§3の比較軸として無制約baselineであり続けるため）。
したがって field-only の下降unitは「plate支持を免除された」ものではなく
「support規則の対象外」である。混同しないこと。

#### P2.2 — 保存形状を build plate 平面で切った

最終material fieldを、build plateのhalf-spaceと**hard `Math.max`**で交差させてから
mesh化する（smooth blendではない — 目的は平らな底面）。half-spaceは
`plateOffset - dot(p, buildAxis)` として buildAxis と plateOffset から作り、
build軸 x/y/z すべてで動く（+Yへhard-codeしていない）。完成meshを平行移動して
最低値を0にする方法は採っていない（host/build volumeとの位置関係が変わり
上端超過を生むため）。sampling boundsはplate平面を含むよう保証した。

| host | 修正前（build軸・mm） | 修正後 | plate平面上の頂点数 | component | 保存ゲート |
|---|---|---|---|---|---|
| box coin | −4.372mm | **0.0000mm** | 13552 | 1 | 合格 |
| sphere coin | −3.259mm | **0.0000mm** | 4863 | 1 | 合格 |
| waisted coin | −3.216mm | **0.0000mm** | 5219 | 1 | 合格 |

**平らな底面が実際にできていること**を頂点数で確認している（材質を削っただけなら
「はみ出しが無い」条件は満たしても plate平面上に頂点は残らない）。平行移動して
いない証拠として、上端座標は修正前後で同一（box coin 169.956）で、
bboxの高さだけ元のはみ出し分だけ縮んでいる。watertight・winding・
component 1・build volume gate はすべて維持。

保存ゲートに build plate境界を追加した。最低build軸座標が
`-epsilonMm` を下回れば不合格、理由に実測値と許容値を明示する。
`epsilonMm = min(layerHeight / 4, 0.05mm)` = 既定 **0.05mm** — mesh離散化由来の
小さい値に限り、blendK全体を許容差にはしない。provenanceへ
`savedLowestBuildAxisMm` / `savedPlateBoundaryEpsilonMm` /
`savedPlateContactVertexCount` を記録する。mesh側のclipとgate側の検出の両方を
行い、片方だけに依存しない。

ここで言えるのはこれだけである。「保存した形状がbuild plate平面より下へ出ていない」。
定着するとも、support不要とも、印刷可能とも言えない。plate平面での切断は
幾何的な操作であり、実機の一層目の挙動を測ったものではない。

#### ring-constrained（今回のスコープ外、変化あり）

rule 2bの変更でringのcoverageとcomponent数も動いた（box 18.30%→12.52% / comp 27→10、
sphere 7.95%→7.95% / comp 1→3、waisted 19.10%→13.60% / comp 18→5）。
保存ゲートは3 hostとも引き続き正しく拒否している。ring多componentは未解決のまま。

### Observation（R2 — SHA-256 の Library 昇格、2026-07-26）

`Optimizer/docs/sonnet-instruction-20260726-katachi-r1-r2-library-first-extraction.md`。
作者が Gate A で Q1（`src/lib` を正式 Library とする）を承認したことを受け、
**Library 昇格の最初の実例**として `sha256Hex` だけを共通化した。

- 正本は **`src/lib/hash.ts`** になった。このStudyの `meshExport.ts` は
  実装を持たず、`import` したうえで `export { sha256Hex }` で再exportしている
  （一行の `export ... from` は local binding を作らず、同ファイル内の
  `saveCandidateStl` が呼べなくなるため、import と export を分けた）。
  既存の import path `import { sha256Hex } from "./meshExport.ts"` は壊していない
- 移行の**同一性を実測**した。移行前の2実装（skin の `ArrayBuffer | string` 版と
  このStudyの `ArrayBuffer` 版）を再現し、空入力・`"abc"`・非ASCII文字列・
  0x00を含むbytes・200,000 bytes を含む9ケースで比較した結果、
  **全ケースで出力が一致**（byte-identical）
- 実ブラウザ（`http://localhost:5174/interior-growth.html`、実座標クリック）で
  box・target 25% を生成 → coin **23.02% / 435 unit / 保存ゲート合格**（移行前と同じ）→
  「STL保存」を実座標クリックし、`coin-constrained: STL保存完了 (SHA-256 020c54280a49…)`
  を確認。保存された 4,410,484 bytes の mesh を Library 経由と旧 import path 経由の
  両方で hash して**同値**、いずれも lowercase 64文字 hex。console error なし
- 自動テスト: `growth.test.ts` に既知値テストを6件追加した（空入力・`"abc"` は
  公開されている標準 SHA-256 の既知値を直書き。**同じ実装で期待値を作らない**）。
  `npm run test:interior-growth` 106件 → **112件**、`npm run test:partition` 102件、
  `npx tsc --noEmit`、`npm run build`（9ページ）すべて合格

version は据え置き（v0.5.0）。version の対応規則は R0 Author decision **Q8** で
「意味を文書で固定してから」と決まっており、まだ migration を実装していないため、
ここで新しい採番規則を作らない。

### Observation（R3 — 保存座標系を provenance へ残した、2026-07-26）

`Optimizer/docs/sonnet-instruction-20260726-katachi-r3-saved-frame-provenance.md`。
作者が Gate A で Q2（raw STL を維持し、print-ready 変換は Optimizer へ任せる）を
承認したことを受けて実施。**geometry は一切動かしていない。**

追加したのは `CandidateProvenance.savedFrame` の4項目:

| field | 内容 |
|---|---|
| `coordinateUnit` | `"mm"`（保存mesh は `rescaleMeshResult` 適用済み） |
| `upAxis` | `envelope.buildAxis` を保存mesh自身のframeで表す `{axis, sign}` |
| `platePlane.coordinateMm` | build plate の**保存STL自身の軸座標** |
| `toPrintReady` | `applied:false` + `directionToPositiveZ` + `translationAfterRotationMm` |

plate 座標は `plateReference.plateOffsetFieldUnits × scaleMmPerUnit` から毎回導出し、
sign は**1回だけ**掛けている（`meshLowestBuildAxisMm` が二重適用を避けているのと同じ理由）。
定数として焼き込んでいない。既定（+Y / box / A1 mini）で実測 **−81mm**。

#### Optimizer `orient` との対応 — 一致する所としない所を実測した

指示書§7 の「語彙が似ているだけなら同一と書かない」に従い、
Optimizer の `src/optimizer/transform.py` を読み、実際に走らせて比較した。

**一致する**:

- `directionToPositiveZ` ⟷ Optimizer `direction_to_positive_z`。どちらも
  「元frameのどの方向が回転後に +Z になるか」を、正規化3成分ベクトルで、
  **符号を反転せずに**持つ。buildAxis=+Y なら両方 `[0,1,0]`
- 平行移動が回転の**後**に、回転後frameで効くという順序

**一致しない（同一と書かなかった点）**:

1. **平行移動の定義が違う。** Katachi は「**plate 面**を z=0 へ」。Optimizer の
   `translation_mm` は「**mesh の最小Z**を z=0 へ」（`mesh.bounds[0,2]`）。
   両者が同じ数になるのは mesh の最下点が plate に接しているときだけ。
   Katachi は保存前に plate half-space で hard clip しているため既定 fixture では
   接しており（`savedPlateContactVertexCount` > 0）、実際に一致する。
   これは**fixture の性質であって契約ではない** — 最下点が plate より 10mm 上にある
   mesh では Katachi 側 +81 に対し Optimizer は +71 になることを実測で確認した。
   この一致条件そのものを自動テストで固定した
2. **回転は方向だけでは決まらない。** up 軸を +Z へ送る回転には Z 周りの自由度が残る。
   Optimizer が実際に選ぶのは最短弧回転では**なく**、+Y の場合
   `[[0,0,-1],[-1,0,0],[0,1,0]]`（最短弧に −90° の Z 回転が乗る）。
   したがってこの field が指定しているのは **up 軸だけ**で、水平面内の向きは
   指定していない。**行列は持たせなかった** — 持たせると Optimizer が選ばない
   azimuth を「変換」と称することになるため
3. Optimizer の `translation_mm` は「入力STLの座標単位」で、mm であることは
   同ツールの前提による。Katachi のこの値は実際に mm。数値は一致しても保証が違う

上記2点は型の doc comment と provenance の `limits` にも書いた。

#### 不変条件の実測

STL の bytes と SHA-256 が provenance 生成の前後で**同一**であることを、
実際に encode して hash する自動テストで固定した。
`savedLowestBuildAxisMm` / `savedPlateContactVertexCount` も不変。
provenance JSON 自体は field 追加により変わる（STL hash と provenance hash は別物）。

`npm run test:interior-growth` **121件**（R3 の必須9件 + 一致条件を固定する1件を追加）、
`npm run test:partition` 102件、`npx tsc --noEmit`、`npm run build`（9ページ）すべて合格。
version は据え置き（Q8 未決定のため新しい採番規則を作らない）。

> **訂正（2026-07-26）** — 直前の「必須9件 + 一致条件を固定する1件」という書き方は、
> 算術上10件に読めるのに総数が 112 → 121（+9）で、数が合わない。実際の構成は
> **必須9項目を 8 test function で検証**（`§6-4` と `§6-5` は
> `"§6-4 & §6-5: 記録された回転で up が +Z へ、平行移動で plate が z=0 へ"` の
> 1関数に統合してある）＋ **一致条件を固定する1関数** ＝ **計9 test function**
> であり、これが 112 → 121 の内訳。上の記述は経緯として残し、ここで数え方だけを直す。

#### 補正（savedFrame を不明時に fail closed させた、2026-07-26）

`Optimizer/docs/sonnet-correction-20260726-katachi-r3-saved-frame-fail-closed.md` §2.1 / §2.2。
`deriveSavedFrame` は `mesh.plateReference` が無いとき `+Y / plate = 0` を既定値として
使っていたため、根拠の無い保存座標系をもっともらしい provenance として書き出せた。
現在は **fail closed** — `plateReference` が無ければ既定値を推測せず throw し、
`buildProvenance` もそれを握りつぶさず伝播させる（savedFrame の無い provenance を出さない）。
`meshLowestBuildAxisMm` と `countPlateContactVertices` の既存 fallback は
**意図的にそのまま**（今回の対象外。synthetic fixture が依存している）。
通常経路の値は変わっていない — 既定（+Y / box / A1 mini）の `savedFrame` は
**−81mm**、`directionToPositiveZ` `[0,1,0]`、`translationAfterRotationMm` `[0,0,81]` のまま。
この fail-closed 回帰テストを追加した後の実測総数は
`npm run test:interior-growth` **122件**。

### Observation（P2.3 — ring-constrained 保存mesh多componentの原因分離、2026-07-26）

**production の挙動は一切変えていない。** 追加したのは診断専用の測定モジュール
（`ringFusionDiagnosis.ts`、production から import されない）と回帰テスト6件だけである。
成長規則・材質場・plate clip・mesh解像度・保存ゲートはどれも触っていない。

#### 固定fixture（すべてコードから読んだ値）

Printer=Bambu Lab A1 mini / layer 0.2mm / support angle 30° / target surface coverage 25% /
seed `katachi-interior-growth` / variant `ring-constrained` / mesh resolution 64 /
`blendK = unitRadius * 0.3 = 0.042` / `unitRadius 0.14` / `ringNodeCount 8` / `ringTubeR 0.28`。

#### 段階別 connected components（実測）

| host | graph | pre-clip exact | pre-clip indexed | post-clip exact | post-clip indexed | 保存mesh | STL再読込 |
|---|---:|---:|---:|---:|---:|---:|---:|
| box | 1 | 9 | 10 | 9 | 10 | **10** | 10 |
| sphere | 1 | 3 | 3 | 3 | 3 | **3** | 3 |
| waisted | 1 | 5 | 5 | 5 | 5 | **5** | 5 |

保存mesh列は 2026-07-25 の実測（box 10 / sphere 3 / waisted 5）と一致する。
graph はどのhostも1 componentで、全unitがrootへ到達する（box 353 / sphere 288 / waisted 371 unit）。

#### 原因から除外できたもの

- **plate clipは原因ではない。** pre-clipのcomponent数が post-clipと**同数**である（3 hostすべて）。
  plate切断で失われた接続は**0**。「sphereは以前1で、plate対応後に3になった」という仮説は
  この測定で**否定**された
- **ring材質モデルは原因ではない。** 単体ring・root ring・root+childのunionは、
  pre-clipもpost-clipも**すべて1 component**（3 hostすべて）
- **空間indexはboxで10のうち1件だけ。** exactとindexedが違うのは box のみ（9 vs 10）で、
  差は24三角形・符号付き体積 0.0031mm³ の1片。sphere / waistedは完全一致。
  zero isosurface近傍の符号不一致は3 hostとも「exact場が0から0.0027以内」の刃先だけ

#### 特定した機構: blendが作る衛星材質（blend lobe）

小片の頂点上で、同じunion場を `blendK → 0`（hard min）で評価した:

| host | 小片 | hard unionの内側にある頂点 | hard場の範囲(field) |
|---|---|---:|---|
| box | rank 1〜9 | 18/1068 (1.7%)、他は **0%** | +0.0028 〜 +0.0325 |
| sphere | rank 1〜2 | **0%** | +0.0115 〜 +0.0287 |
| waisted | rank 1〜4 | **0%** | +0.0061 〜 +0.0330 |

つまり小片は**どのunitの材質でもない**。要素どうしが実際には触れていない隙間に
smooth blendが作り出した材質であり、hard unionでは +0.2〜2.7mm 外側にある。
符号付き体積はすべて**正**（0.003〜496mm³）なので、閉じた空洞の内壁ではなく実体のある材質片である。
主componentは 265,113〜551,871mm³ で、小片はその 0.0000006〜0.09% にすぎない。

親子接続そのものは健全だった。各小片の近傍unitの親子ペアを個別にmesh化すると、
pre-clip・post-clipとも**1 component**で、capsule同士は −1.2〜−6.4mm 深く貫入している。
Rule 4 が点球距離を見ているという語彙差は実在するが、**今回の多componentの原因ではない**。

#### 測定中に自分で見つけて直した測定側の誤り（記録）

1. **neck幅proxyが「非重なり」と「完全包含」の両方で0を返していた。** 二球交差円の半径は
   `h2 <= 0` で0になるが、それは離れている場合と一方が他方を包含している場合の**正反対の2ケース**で
   起きる。gap −6.3mm（tube半径3.2mmを超える貫入）で「neck 0」と読めてしまい、
   薄い首だと誤読しかけた。`neckState: "separated" | "lens" | "contained"` を返し、
   交差円が存在しない場合は `null`（0ではない）を返すよう直した
2. **小片の所有unitを三角形重心で判定したのは無効だった。** 重心は blend後の等値面**上**にあり、
   smooth unionの零面は各要素自身の零面より外側に膨らむため、「単体unitのSDF ≤ 0」は
   測定ではなく構造上ほぼ成立しない。内部点プローブへ替えたが、
   **それも非凸形状には無効**だった（sphereの主component自身が頂点平均で場が正になる）。
   最終的に有効だったのは、頂点上で hard union と blend unionを比較する上記の方法である
3. nearest-unitマッピングによる「破断エッジ」列挙は**信頼できない**。sphereはcomponentが3なのに
   破断エッジ0件を返し、boxでは親と子が両方rank 0なのに中間のunitだけrank 1に割り当てられた

#### 原因分類

指示書 §3.5 の A〜F では **E（複数原因）**。ただし支配的な機構は A〜D の語彙に無く、
上記「blendが作る衛星材質」である。boxのみ D（indexed近似）が10のうち1件を追加している。

#### production修正をしていない理由

§4 が用意する修正はA（plate）・B（junction neck）・D（meshing離散化）向けであり、
測定した機構はそのどれでもない。この機構に効くのは blend の扱いを変えることだが、
`blendK` は coin-constrained と field-only も含む**全variantの形状原理**であり、
§5 が「coin-constrained / field-onlyの形状原理を巻き込まない」を禁止事項に挙げている。
§6 の「判断が曖昧なら修正を戻し、診断成果だけを残す」に従い、**診断だけを残した**。

#### 無退行

`npm run test:interior-growth` **128件**（既存122 + P2.3の6件）、`test:partition` **102件**
（41+50+11）、`test:studies` **17件**、`npx tsc --noEmit` と `tsc -p tsconfig.test.json` clean、
`npm run build` **10 entry**、`git diff --check` clean（Katachi / Optimizer両方）。
coin-constrained・field-only・保存ゲート・plate clip・provenance / recipe は未変更。
**出荷bundleは変わっていない**（`dist/assets/interiorGrowth-B5SmHLPX.js` のcontent hashが
P2.3着手前のビルドと同一。診断モジュールはproduction entryから到達せず、bundleに含まれない）。
したがってdeployは実質no-opであり、実行していない——実ブラウザ再確認も行っていない
（変わっていないものを確認しても新しい情報が出ないため。未実施として明記する）。

### Observation（P2.3 独立監査補正 — 「blend衛星材質」は仮説へ差し戻す、2026-07-27）

上のP2.3 Observationの数表・経緯は**そのまま残す**。段階別component数（box 10 / sphere 3 /
waisted 5 と各段階）は独立監査でも妥当と確認された。**取り消すのは結論の強さだけ**である。

#### 何が証明不足だったか

1. **表面頂点だけでは「内部にhard材質が無い」を証明できない。** 前回の結論は小componentの
   **表面頂点**でhard union（`blendK→0`）を評価し、正だったことに基づいていた。しかし
   smooth-minの零面はhard unionの零面より**外へ膨らむ**ので、内部にhard材質を確実に含む
   正常なcomponentでも、表面頂点は全部hard unionの外になり得る。
   「表面頂点の0%がhard-negative」と「component内部のhard-negative体積が0」は別の命題である。
   小片が24三角形なら差は小さいが、boxのrank 1は356三角形・約496mm³・build軸 6.7〜19.0mm あり、
   この差は無視できない。**README自身が重心・頂点平均による内部probeを無効と記録しながら、
   最終結論はまた表面頂点だけに依存していた**
2. **pre/postのcomponent数一致は、componentの同一性を証明しない。** intersectionは
   componentを分割することも、plateより下のcomponentを丸ごと消すこともできる。
   両方が同時に起きれば総数は変わらない。「plate切断で失われた接続は0」は総数だけを根拠にした
   強すぎる言い方だった
3. **符号付き体積は診断結果に保存されていなかった。** READMEは「符号付き体積はすべて正」と
   書いたが、`ComponentStat` が持つのは `Math.abs(...)` の `volumeProxyMm3` だけで、
   符号は捨てられていた。テストも「すべて正」を固定していなかった
4. **subsetの1 componentは、production解像度での接続を証明しない。** `measureSubsetComponents`
   はsubset専用の小さいboundsを同じresolutionでmesh化するため、絶対stepがfull candidateより
   細かい。「親子pairがsubsetで1 componentだから junctionは健全」は強すぎる。
   capsuleが解析上貫入していることと、production mesherがそのneckを解像できることは別の命題である
5. **headlineテストの範囲が主張より狭かった。** P2.3-6 は waisted のみ・resolution 40・
   rank 1のみ・表面頂点hard-negative率 <25% だったのに、READMEは3 host・resolution 64・
   全非最大component・0〜1.7% を断定していた

#### したがって

**「小片はblendだけが作った衛星材質である」は、確定した原因から仮説へ差し戻す。**
体積内部の証拠で再測定するまで、確定した観測は次に限る。

- 段階別component数（維持）
- 非最大componentの**表面頂点**がhard unionの表面より外側にあること（観測として有効）
- 単体ring・root+childが**それぞれのsubset条件で**1 componentであること
- plate clipについては「現在観測している非最大componentはplate面から離れており、
  plate clipがこれらを新規生成した証拠はない」まで（「失われた接続は0」とは言わない）

exact fieldにも存在する8個の非最大component（box）と、indexedだけが追加する1個は、
今後も**別の母集団として扱う**。`maxAbsExactAtDisagreement <= 0.01` は差が小さいという記録であって、
component topologyの一致証明ではない。

#### 再測定（体積内部のhard-overlap、2026-07-27）

**旧判定が実際に誤判定することをsynthetic fixtureで再現した。** 半径0.6の hard 球2個を
gap 0.2 で置き blendK 2.0 で融合した closed component（7,720三角形、winding一致）は、
**表面頂点23,160点のうち hard union の内側が0点（0.0000%）**、最も深い頂点でも hard SDF は
**+0.0399**。旧判定（内側率 <25% なら「どのunitの材質でもない」）はこの
「hard材質で満たされたcomponent」に対して発火する。一方、体積測定は同じcomponentに対し
N=16で hard-negative **128 cell（0.615mm³）**、N=26で **856 cell（0.989mm³）** を検出した
（真値 2×(4/3)π0.6³ = 1.81mm³ へ、除外bandが縮むにつれ近づく）。
純粋な blend-only lobe（blended −0.40 / hard +0.10 の位置）も旧判定は**同じく 0.0%** を返す。
**正反対の2ケースに対して旧判定の出力が同一である**ことが、この判定が無効だった理由である。

無効な理由自体も測定した: `smoothMin(a,b,k) <= min(a,b)` なので blended <= hard が常に成り立ち、
blended=0 の頂点では hard >= 0 になる。3 hostの8,000格子点で `blended > hard` は**0点**だった。

測定方法: componentごとに (1) そのcomponentの三角形だけで閉鎖性・windingを先に確認、
(2) 自分のbboxを最長辺あたり固定cell数で分割、(3) `buildInsideTester`（共有Library の
ray-parity point-in-mesh）でinside判定、(4) inside cellで hard union を評価し
`hard < -ε` / `|hard| <= ε` / `hard > +ε` に三分（ε = cell対角の半分。曖昧bandは判定から除外し
別集計）、(5) 2水準の格子密度で測り、食い違えば非収束として扱う。

**保存meshの非最大component（実測、両密度で収束）**

| host | 非最大component | inside cellのhard-negative | 判定 |
|---|---|---|---|
| box | rank 1〜9（9個） | 全rankで **0**（N=20 / N=32とも） | blend-only lobe |
| sphere | rank 1〜2（2個） | **0** | blend-only lobe |
| waisted | rank 1〜4（4個） | **0** | blend-only lobe |

- **体積の証拠でblend-only lobeと確定: 15個**（box 9 / sphere 2 / waisted 4、両密度で収束）
- **hard材質を含むcomponent: 0個**
- **判定不能: 4個**
  - **3 hostの最大component**（=主要部そのもの）。この格子密度ではcellが約5〜8mmで、
    内部で見つかる最深のhard SDFが約 −0.04 field（≈ −3.5mm）しかないため、
    **inside cellの100%が曖昧band**に落ちる（box 833/833・3455/3455、sphere 519/519・2209/2209、
    waisted 495/495・1913/1913）。測定器は推測せず非解決と報告する。解くには最長辺あたり
    N≳100 が要る
  - **box rank 1 の exact post-clip 版**（513.643mm³、6.6〜19.0mm）。N=20で hard-negative 0・
    曖昧22、N=32で **hard-negative 1 cell（0.090mm³）**・曖昧39。**密度間で食い違うため判定不能。**
    保存mesh側の対応componentも内部最小hard SDFが負（−0.0007 → −0.0043、ただしε内）。
    **boxの最大の衛星片は hard union の境界上にあり、この証拠ではblend-onlyと断定できない**

#### plate clipのcomponent対応（総数ではなく同一性）

総数は3 hostすべてで保存されるが、**同一性は保存されない**。ただし変化は**最大componentだけ**に
限られ、衛星片は全てbyte一致で生き残った（box exact 8/9がhash一致、waisted exact 4/5 など）。
最大componentの変化は box −1,768三角形 / −13,345.3mm³ / 軸min +4.530mm など。
消えたcomponentも新規に現れたcomponentも**無い**。
したがって「これらの小片をplate clipが新規生成した証拠はない」とは言えるが、
**「plate切断で失われた接続は0」という前回の言い方は撤回する**——総数一致からその推論は成り立たない
（2→2のまま片方が分割され片方が消えるfixtureで、同一性matcherが検出することを回帰で固定した）。

#### 符号付き体積についての撤回

**前回の「符号付き体積はすべて正なので、空洞の内壁ではなく実体のある材質片である」は撤回する。**
測っていたのは形状ではなく `orientMeshForSavedStl` の効果だった。実測:

- 外向きshell **+8mm³** / 同じshellを反転 **−8mm³** / 空洞内壁 **−1mm³** / 外殻+空洞壁 **+7mm³**
- **空洞内壁と反転shellは同じ符号**になる。符号はorientationを区別するだけで、
  solid か void かの区別には**ならない**（それには containment 判定が要る）
- `buildCandidateMesh` の最終段 `orientMeshForSavedStl` は符号付き体積が負のcomponentを反転する。
  空洞壁は **+1** になり、実際に同じ衛星片が stage mesh では負（box exact rank 1 = −513.643mm³、
  waisted exact rank 1 = −555.947mm³）、保存meshでは正（box rank 1 = +495.888mm³）と読めた

よって**保存mesh出力の符号を「正だから実体」と読んではならない**。診断側は符号を
（`signedVolumeProxyMm3` と `absoluteVolumeProxyMm3` に分けて）保持し、符号が意味を持つ段階を
型のコメントに明記した。

#### subset — production相当stepでの再確認

前回のsubset行はproductionより **2.4〜2.7倍細かいstep**だった。production相当stepを
subset boundsから導いて測り直すと、親子pairは3 hostとも pre/post clip 両方で**1 component**のまま
（box res20 = 1.013倍、sphere res18 = 1.003倍、waisted res17 = 1.029倍）。
この主張は補正後も生き残ったが、以後は**2行（fine / production相当）を常に併記**する。

#### hard union meshとpopulationの分離

同じbounds・同じresolutionで `blendK→0` のfull meshを作ると、component数は
**box 27 / sphere 12 / waisted 20**（smoothは10 / 3 / 5）。**どのhard componentも、
その体積の大半がsmooth rank 0（最大component）に入る**（表面頂点ではなく体積で対応づけた）。

- **boxでindexedだけが追加する1個は rank 7**（24三角形・0.003mm³・bbox 0.36mm・5.2〜5.5mm）。
  両密度でhard材質なし。exact fieldにも在る8個とは**別母集団として測った**
  （7個がblend-only、1個 = exact rank 1 が上記の判定不能）
- **waistedは exact/indexed とも5個だが、対応づけの最悪距離が 65.763mm** ある。
  exact rank 1 は 555.9mm³（5.7〜17.7mm）、保存/indexed rank 1 は 66.2mm³（8.7〜14.9mm）。
  **総数は一致するのに、どのcomponentが存在するかで両fieldが食い違っている。**
  原因とは呼ばない。測定された未解決の糸として残す

### Observation（P2.4 — 材質合成policyの比較、**未採用**、2026-07-27）

**production変更ゼロ。** 4つのpolicyを同じ`GrowthResult`へ適用して比較しただけである。
どれも1 componentに届かず、本命のP3は全hostで現行より悪化した。

#### policy × host（既定fixture、resolution 64、saved mesh component数）

| policy | box | sphere | waisted | exact/indexed identity | 追加体積(box) | 最大外向き(box) | coverage差(3host) |
|---|---:|---:|---:|---|---:|---:|---|
| P0 現行 flat smooth | **10** | **3** | **5** | **不一致**（worst 0.5486 / 0.0624 / **65.7625**mm） | 166,342mm³ | 3.318mm | 1.575 / 2.025 / 1.775pp |
| P1 hard union | 27 | 12 | 20 | 一致（0.0000mm、byte一致 27/12/20） | 0mm³ | 2.271mm | 0.000pp |
| P2 縮小flat blend | 25 | 8 | 22 | 不一致（0.319 / 0.189 / 0.178mm） | 12,169mm³ | 2.196mm | 0.100 / 0.075 / 0.100pp |
| P3 graph-local | **28** | **9** | **20** | 一致（0.0000mm、byte一致 28/9/20） | 14,952mm³ | 2.271mm | 0.075 / 0.100 / 0.025pp |

sphereではP1とP3が**plate接触を失う**（接触頂点0、最低build軸座標 +0.5738mm）。
現行のflat blendはプレート到達も担っていた。

#### なぜP3が効かなかったか

P3のbaseはhard union（単体で27/12/20に割れる）で、そこへparent-child edgeだけの局所jointを足す。
実測ではjointは**何も再融合しなかった**（box 27→28、waisted 20→20）。

理由はjointの実測値にある。sphereで**287 joint、capsule間gapは最小 −0.0845 / 中央 −0.0680 /
最大 −0.0101 と全て負**——**親子ペアは既に全て貫入しており、そこは最初から切れていない**。
`kJoint = 0.042`（= production blendK）、rInner 0.0774〜0.0860、rOuter 0.1194〜0.1280。

#### 全edge分類（§3.3、3 host全edge、production相当step）

| host | edge数 | not-in-contact | neck未解像 | **接触・production stepで解像** | 未分類 |
|---|---:|---:|---:|---:|---:|
| box | 352 | **0** | **0** | **352** | 0 |
| sphere | 287 | **0** | **0** | **287** | 0 |
| waisted | 370 | **0** | **0** | **370** | 0 |

**親子接触は1本も壊れていない。** ではhard unionはどこで割れるのか——**ring自身の中**である。

| mesh | host | **WITHIN-ring**（1 unitが複数componentに跨る） | BETWEEN parent-child（切れたedge） |
|---|---|---|---|
| hard union | box 27comp | **53 unit**（最大4分割、余剰66片） | 9 edge（全て「接触・解像済み」） |
| hard union | sphere 12comp | **8 unit**（最大3分割、余剰9片） | 2 edge |
| hard union | waisted 20comp | **49 unit**（最大4分割、余剰58片） | 16 edge |
| 現行 smooth | box 10comp | **18 unit**（余剰18片） | 4 edge（全て「接触・解像済み」） |

機構を示す比が同じ測定にある: **tube直径 / production step = box 1.753〜2.239、
sphere 1.612〜2.028、waisted 1.528〜1.914**。ring の管は production grid で**2 step未満の太さ**しかない。
その太さでは marching-tetrahedra が grid の位相次第で管を分断する。

これは **P2.3が「ring材質モデルは無罪」とした判断の訂正**でもある。あの判定は
**単体ringをsubsetの細かいstepで**測っていた。production gridの中では18〜53個のringが分裂している。
前回の監査が指摘した「subsetはproduction解像度の証明にならない」が、そのまま再現した。

#### 現行の材質合成は順序依存である（§3.1）

**3 hostすべてで `order-dependent = true`。** unit順・element順を変えるだけで、
同じ`GrowthResult`から別の形が出る。

- box: component数が **9 / 10 / 11** と揺れる（exact/indexed両方）。component identityは
  どの順序でも保存されず（0 identical、9〜10 changed、現れる/消えるcomponentあり）、
  対応距離は最大 **145.9mm**、場の最大差 0.0066
- 対照として natural/natural は当然一致（差0、identity保存）

polynomial smooth-minは二項演算で、flatな逐次適用はcomponent topologyに対して順序不変ではない。
**現在保存される形は、unitとelementの反復順に依存している。**
P1とP3はhard minで合成するため順序非依存で、exact/indexed identityも完全一致する
（waistedの65.7625mm差はflat blend固有の症状で、hard base + 順序非依存jointでは消える）。

#### 結論: P2.4は未採用

§7の採用ゲートは3 hostすべてで `exact = indexed = saved = STL = 1 component` を要求する。
P0/P1/P2/P3のどれも満たさない。P3は現行より悪化するため、**production変更を残さない**。

得られたものは負の結果だけではない:

- 分断の支配的機構は**parent-child junctionではなくring内部**であり、**管が2 step未満**という
  解像の問題である。局所jointを設計し直しても同じ場所には届かない
- 現行のflat blendは衛星片を作る一方で、**分断したring片を貼り合わせ、plate到達も作っている**。
  片方だけ取り除く設計はこの4 policyの範囲では成立しない
- **現行合成の順序依存**は今回新たに見つかった、production側の実在の問題である

### Observation（P2.5 — tube undersampling仮説を**棄却**し、多componentの正体を特定、2026-07-27）

**production変更ゼロ・deployなし。** 追加したのは診断専用モジュールと回帰テストだけである。

#### dense resolution sweep（order-independent hard union、64→160、全て完走）

| host | res 64 | 80 | 96 | 112 | 128 | 160 | tube/step (res160) |
|---|---:|---:|---:|---:|---:|---:|---|
| box | 27 | 35 | 35 | 51 | 52 | **70** | 4.376〜5.625 |
| sphere | 12 | 14 | 21 | 22 | 30 | **39** | 4.025〜5.174 |
| waisted | 20 | 32 | 37 | 31 | 50 | **60** | 3.805〜4.892 |

**解像度を上げるほどcomponent数が増える。** WITHIN-ring分裂数も単調に減らない
（box 53→57→62→48→67→36）。§3.4の5条件のうち4つが不合格:

1. WITHIN-ring分裂の単調減少 — **不合格**
2. ある比以上で3 hostとも1 component — **不合格**（逆に増える）
3. 8 grid phaseで1 component — **不合格**。そもそも位相(0,0,0)で1に到達しない。
   なお位相だけでcomponent数は動く（res 64 sphere: 12 / 8 / 10 / 4 / 10 / 5 / 14 / 8 と**3.5倍**の振れ）
4. 順序非依存 — **合格**（hard unionなので当然。exact/indexedもres 64で27/12/20一致）
5. plate接触の回復 — **不合格**（sphereは全解像度で接触頂点0）

**tube undersamplingは原因ではない。** 孤立した合成ringは `cellsAcrossTube = 1.878` から
8 phaseすべてで1 componentになる。実candidateはres 160で4.0〜4.4 cellsに達しているのに最悪値を示す。
READMEの「4 cellsあれば十分」という仮説はこの実測で否定された。

#### 破断位置（D2）

破断は**弧長に比例して分布**しており、node近傍率（60.5〜84.4%）は帰無値（約73%）とほぼ一致する。
中間segmentでの破断も両解像度で15〜31%ある。grid corner距離の中央値は約0.48〜0.51 step
（最大0.866）で一様。**node近傍のfilletで解ける形ではない。**

#### 特定した正体: 多componentは「分離した破片」ではなく「内部空洞の内壁」

`orientMeshForSavedStl` を通す**前**の符号付き体積で分類した（この段階でのみ符号が意味を持つことは
P2.3監査補正で確立済み）。**筆者が独立に再測定して確認した値**:

| mesh | host | components | 符号が正（外向き固体境界） | 符号が負（空洞内壁） | 小片中心の場 |
|---|---|---:|---:|---:|---|
| hard union | box | 27 | **1** | 26 | +0.012 / +0.019 / +0.013 |
| hard union | sphere | 12 | **1** | 11 | — |
| hard union | waisted | 20 | **1** | 19 | +0.019 / +0.022 / +0.018 |
| **現行 production smooth** | box | 10 | **1** | 9 | +0.0245 / +0.0123 / +0.0048 |
| **現行 production smooth** | sphere | 3 | **1** | 2 | +0.0035 / +0.0008 |
| **現行 production smooth** | waisted | 5 | **1** | 4 | +0.0186 / +0.0049 / +0.0059 |

外向き固体境界は**どのhost・どのfieldでも厳密に1つ**。残りは全て負＝空洞の内壁で、
その中心の場は正（＝非材質）である。**分離した固体島は全18行で0個・合計0.00mm³。**

材質側からも独立に確認された。capsule pairの重なり証明（重なる標本対は証明、離れている場合は
上界のみ）で連結性を挟むと、**box / sphere / waistedとも component bracket は [1, 1]**、
parent-child edgeで重なりが証明できないものは **0 / 352・0 / 287・0 / 370**。

**したがって `ring-constrained` の保存meshは最初から1つの連続した固体であり、
多componentの正体は内部に閉じ込められた空洞の内壁である。**
保存ゲートが読む `computeConnectedComponentsWithKey` は**面の殻**を数えており、
「一体であること」と「内部空洞が無いこと」を区別していない。
解像度を上げるほど小さな空洞が解像されるので数が増える——sweepの挙動と完全に整合する。

これはP2.3〜P2.4の解釈をまとめて訂正する。特に**筆者はP2.3で空洞仮説を立てながら、
「符号付き体積が正だから実体」という理由で棄却していた**。その符号は
`orientMeshForSavedStl` が反転させた後の値で、判断材料にならないものだった（P2.3監査補正参照）。
仮説は正しく、棄却の理由が誤っていた。

#### 作者判断へ返す点

保存ゲートの `connectedComponents === 1` は、**内部空洞を持つ一体形状を拒否する**。
このStudyは既に `analyzeVoids` で閉じた空洞を別途測っている。
「一体（monolithic）」の定義を面の殻数のままにするか、固体成分数と内部空洞数へ分けるかは
**production変更であり作者判断**なので、この診断タスクでは触っていない（§9.4「save gateを緩めない」）。

### Observation（P2.6 Phase C1 — 局所field probe、T2接続前で停止、2026-07-27）

P2.5で「surface shell数」と「solid component数」を分ける必要が分かったため、
Float32保存座標のshell containment treeを、production未接続の診断モジュール
`solidTopology.ts`として実装した。分類はsigned volumeではなく、複数の代表点を
共有`buildInsideTester`へ入れた包含深度のparityで行う。

監査で、containment用の深い代表点とその鏡像をfield照合にも流用すると、薄いmaterial
layerを飛び越えて次のvoidへ着地し、両側positiveになり得ることが分かった。field照合は
別測定へ分け、面積が大きく互いに離れた最低3 triangleから、実際のsource grid stepの
0.125 / 0.25 / 0.5 / 1.0 / 1.5倍だけ局所probeするようにした。shell vertex上の
`|field|`はp50 / p90 / p99 / maxを記録し、判定に使うp90以内は不確定とする。
結果は `agrees` / `inconclusive` / `contradicts` / `field-inconsistent-shell` の4状態で、
不確定を「照合済み」と表示しない。

手作りfixture 18件（cube、cavity、別固体、depth 3 nesting、順序・winding・平行移動、
open/intersect、厚壁・薄壁、深い鏡像が次のvoidへ飛ぶ回帰、両側positiveの疑似shell、
band内不確定、真の向き矛盾）を先に通した後、同じ既定条件・resolution 64を再測定した。

| host | surface shell | solid component | closed cavity | ambiguous | field: agree / inconclusive / contradict / inconsistent |
|---|---:|---:|---:|---:|---:|
| box | 10 | **1** | 7 | **2** | 4 / 4 / 0 / 2 |
| sphere | 3 | **1** | 2 | 0 | 1 / 2 / 0 / 0 |
| waisted | 5 | **1** | 4 | 0 | 2 / 3 / 0 / 0 |

3 hostともsolid componentは1である。ただしboxの2 shellは、clean / closed / manifold /
winding-consistentでcontainmentはdepth 1に揃う一方、複数の局所triangleで両側とも
誤差帯外positiveとなり、実fieldのlocal zero boundaryとして説明できなかった。
空洞へ丸めず`field-inconsistent-shell`としてambiguousのままにした。sphereの旧判定不能
shellはcontainment上cavityへ解けたがfieldはinconclusiveで、field-confirmedとはしていない。
従来予想のbox 9 cavity / sphere 2 cavity / waisted 4 cavityは合格条件にしていない。

このため、指示どおり **T2 cavity-aware orientation、T3 save gate、UI、provenance、
recipeへは接続していない**。既存の通常保存はpositive-all orientationと旧gateのままである。
先行して共有`orientMeshForSavedStl`へ入っていたT2用optionは、挙動を使わなくても
interior-growth bundleを `B5SmHLPX` から `jHKUtuhH` へ変えることを実測したため外した。
再build後は公開版と同じ `interiorGrowth-B5SmHLPX.js`（SHA-256
`b4f01c096da3fbeb111e17d930f93cb6467e8340db9d1f750c254ad1c2a36b45`）へ戻った。
既存coin fixtureのpositive-all STLは固定headerでSHA-256
`2fdb88fed42dafad875087be4ad0a44b6bb2a1e606257187e321c358197996c4`
を回帰テストへ固定した。従来のテストはprovenance作成前後の相対比較だけで、固定SHAは無かった。
Katachiへの統合時にSTLの80-byte headerが旧名`Yohaku`から`Katachi`へ変わったため、
形状・三角形列を変えず、現在の固定SHAを
`df21e364535605da6e0ad13b502a1b2bee9f70323c53c09749e89fac2cb0c794`へ更新した。

自動テストは既存160件＋固定SHA 1件＋C1 41件＝**202件全通**。production import graphに
`solidTopology.ts`は到達せず、公開bundleが一致するためdeployと新UI確認は行っていない。
公開版では既定25%を実座標で再生成しcoin 435 unit / measured 23.0%を再確認したが、
ブラウザから2回目のdownload結果を取得できなかったため、公開STLの完全SHA比較は未確認。

### Observation（P2.6 Phase C2 + 保存mesh形状表示、2026-07-27）

C1で残ったboxのambiguous 2 shellを、marching tetrahedraの発生元cube /
tetrahedron / 4 cornerのFloat32 field値まで追跡した。診断側で再構築した全triangleは
productionの`buildMeshFromField`とgeometryが全件一致し、ambiguous shellの48面と24面も
すべて発生元tetraへ対応した。どのtetraもcornerは正負混在し、線形補間fieldのtriangle
centroid値は最大でも絶対値`1.20e-16`だった。一方、同じcentroidで元の非線形fieldを
再評価すると次の結果になった。

| box shell | triangle | 誤差帯外の材質centroid | 誤差帯外のvoid centroid | ±0.125 stepが両側void | 材質/void境界を確認 | C2分類 |
|---|---:|---:|---:|---:|---:|---|
| #3 | 48 | 0 | 16 | 4 | 0 | 判定不能 |
| #7 | 24 | 0 | 3 | 1 | 0 | 判定不能 |

source cornerにはnegativeがあるが、生成面そのものでは誤差帯外のnegative材質や
材質/void境界を確認できなかった。ただし全triangleで元fieldの両側positiveを確認できた
わけでもないため、`field-inconsistent interpolation shell`へも`cavity wall`へも丸めず、
**判定不能のまま**にした。したがってT2 cavity-aware orientationとT3 save gate語彙変更は
引き続き未接続で、Ringの通常保存拒否も従来どおりである。

作者が次の形状判断をできるよう、3比較viewportへ「保存予定meshの表面（ON）／生成単位の
構造（OFF）」を追加した。ONは再meshingせず、Workerが保存ゲートへ渡したものと同じ
triangle配列を描画する。既定は表面表示で、輪郭を隠していたrejected / void overlayと
top-reached planeは既定で非表示にした（必要なら個別に再表示できる）。3画面上端には
Field only / Coin / Ringのラベルを常時表示する。これは**形状観察の追加だけ**で、
growth、mesh生成、STL bytes、保存ゲート、provenance、recipeを変更しない。

## Hypothesis

- **P2.5の方向（未検証）**: 分断がtube/step比に支配されるなら、効くのは
  (a) 保存meshのresolutionをtube直径あたり4 step以上確保できる値にする、
  (b) `ringTubeR` を上げる、(c) 合成を順序非依存にしたうえでring内部だけを確実に繋ぐ、
  のいずれかである。いずれもcoin-constrained / field-onlyへの影響と、
  「resolutionを上げて1 componentに見せる」ことの禁止（P2.4指示書§5.4）との整理が要る。**今回は測っていない**
- **P2.3の機構に対する見立て（監査により仮説へ差し戻し、2026-07-27）**: 小片がblendだけの
  産物である可能性は依然あるが、**体積内部のhard-overlap測定で確認するまで確定としない**
- **P2.3の機構に対する見立て（未検証）**: 親子ringのcapsuleが −1.2〜−6.4mm 深く貫入しているなら、
  実接続はblendに依存していない可能性がある。その場合 `blendK` を下げれば衛星材質は消え、
  接続は保たれるかもしれない。ただしこれは3 variant共通の形状原理を変える話であり、
  今回は**測っていない**。検証するなら、blendKを下げたときの (a) 3 hostのcomponent数、
  (b) coin-constrainedのfingerprint・coverage・保存gate、(c) 表面の見え方を
  同時に測る独立タスクが必要である
- 上の古い `Next` 項目にある「smooth-min blendがring形状のnode間を十分に融合しない」という
  表現は、**符号が逆だった可能性がある**。今回の実測では blend は融合に失敗しているのではなく、
  触れていない要素間に**余分な材質を作っている**。歴史的記録として上の記述は残す
- root近傍から育てる支持連続性の強制（ルール2〜4）と、ring向けの水平面除外（ring-horizontal）が、
  少なくとも「明らかに無理な」候補（浮いたroot・水平ring・急激な横張り出し）を機械的に排除する
  ことで、field-only（制約なし）と比較したときのvoid構造・material volumeに観測可能な差を作る
  ————ただし「その差がスライサーのサポート必要量を減らす」かどうかは**未検証**であり、この
  Studyの範囲外（実スライサー検証はPhase 1B以降、作者が独立に確認する）

## Related

- `cloud-sculpt`（field.ts の smoothMin/ballSdf/fieldSdf、meshExport.ts のmarching tetrahedra基盤を再利用）
- `rings`（generateRingBalls/rotateVector/vCrossを再利用）
- `pack`（void/host合成field、greedy growthの設計precedent）
- `skin`（保存後topologyゲート・canonical scale・rescaleMeshResultのgate-correctionパターン）
- Optimizer: `docs/internal-support-free-adjustment-next.md`（内部サポート診断の既存軸）、
  `docs/katachi-optimizer-interior-growth-multipart-structure-plan-20260724.md`（全体計画）

## Next

> **現在の状態（2026-07-25 時点、下の古い項目より優先）**
>
> 以下は上のObservationで解決済み。古い記述は経緯として残してあるので、
> 矛盾する場合はここを正とする。
> - coin-constrained target 25% の最低合格matrix: **達成**（23.02 / 23.12 / 23.03%、
>   3 hostとも `target-reached`）— O2 Observation参照
> - Gate D（Worker化・進捗・cancel・stale result破棄）: **実装済み** — O2 / P1 Observation参照
> - plate指標の意味分離（rootCount / actualPlateContactCount / launchPointCount）: **実装済み**
> - rule 2b を実プレート接触（1 layer）基準へ統一: **実装済み**（1 layer以上浮いた
>   plate支持免除unitは3 hostとも0）
> - 保存形状のbuild plate平面での切断と保存ゲート: **実装済み**（保存STLの最低
>   build軸座標 0.0000mm、実バイナリ再読込で確認）
>
> **いま開いている糸**
> - **ring-constrained の保存後mesh多component**（box 10 / sphere 3 / waisted 5）。
>   保存ゲートは正しく拒否している。**2026-07-26 の P2.3 診断で機構を特定した**（下の
>   P2.3 Observation が正本）: plate clipは無罪（pre-clipが同数）、ring材質モデルも無罪
>   （単体ring・root+childは1 component）、空間indexはboxで10のうち1件のみ。
>   小片の**表面頂点**はhard union（blendK→0）の表面より +0.2〜2.7mm 外側にあり、
>   主componentの 0.09% 以下の大きさである。
>   2026-07-27 の独立監査で表面頂点による証明を棄却し、**体積内部のhard-overlapで再測定した**
>   （P2.3独立監査補正 Observation が正本）。結果: 保存meshの非最大component **15個は
>   両密度で hard-negative 0 に収束し blend-only lobe と確定**、hard材質を含むものは **0個**、
>   **判定不能が4個**（3 hostの最大component＝格子密度不足、および box rank 1 のexact版＝
>   密度間で食い違い、hard境界上）。「符号が正だから実体」は撤回（`orientMeshForSavedStl` の
>   効果を測っていた）。plate clipは同一性で見ると最大componentだけを変え、衛星片は全て
>   byte一致で残る——ただし「失われた接続は0」という言い方は総数からは導けないため撤回。
>   修正は未実施——効くとすれば全variant共通の `blendK` の扱いであり、
>   coin-constrained / field-only を巻き込むため独立タスクが必要
> - **blendが host壁の外へ膨らむ**（横方向に約 −0.85〜−1.05 field）。plateは
>   切ったが、host境界の外側へのはみ出しは未処理
> - **`STUDY_MARGIN_FRACTION`（10%）が unit半径と独立**。`unitRadius=0.18` では
>   box実測184.2mmでbuild volumeを超え保存ゲートが拒否する。marginをunit半径
>   から導く方が筋が良い
> - recipe読み込み時のmesh再構築のみ今もmain thread
> - 実スライサーでのサポート生成量・実CoinSRF/実STL hostは引き続き対象外


- 実CoinSRF/実STLホストへの適用（S1/S-skin recipeからのhost field復元、Phase 1B）
- host外clipを完全なboolean intersectionへ置き換える（現状は許容誤差内受理/超過棄却の単純化）
- メッシュ解像度・詰める強さのUI露出、field-onlyのunit sizeパラメータの分離検討
- ring-discontinuous-supportの専用許容値（現状はmaxUnsupportedSpanMmの流用）
- **S2.1 coverage attainmentは独立監査の修正後も未達**
  （`Optimizer/docs/sonnet-correction-20260725-katachi-interior-growth-s2-1-audit-fixes.md`
  §7.1・§10の最低合格matrix: target25%でbox/sphere/waisted全host23%以上——実測は
  2.85%/6.40%/6.98%。sphere/waistedは監査前から大きく改善したが、box
  coin/ring-constrainedはPhase Aの単一主幹1本からの到達コストで早期に
  host-boundary-blockedへ張り付く。詳細は本ファイルのObservation参照）
- **Gate D（Worker化・段階別進捗表示・cancel）が未着手** — 監査の修正順序
  自体が「C1〜C6が全て通ってからC7へ」と明記しており、今回はC1〜C6のみで
  時間切れ。既定budgetでの3候補生成は実測約28秒（mesh生成が支配的）
- **box hostの単一主幹到達コスト問題**: C1で独立root除去した結果、box
  coin/ringは1本の主幹だけが起点になり、遠いregionへの到達が
  target値に関わらず早期に頭打ちする。複数のPhase A主幹
  （`rootTarget`は現状no-op）をS2.1のregion割当と連携させ、各主幹が
  近いregion群だけを担当するよう空間分割する、という方向性が有力候補
- **ring-constrained候補のmesh fusion不足**: 実ブラウザ検証で発見
  ——graph上は`rootCount:1`でも、smooth-min blendがring形状のnode間を
  十分に融合せず`connectedComponents`が複数になるケースを確認
  （C1の保存ゲートが正しく検出・拒否した）。coin/blendK調整や
  ring材質モデル自体の見直しが必要、今回のスコープ外
- **Gate D（応答性）は未着手**: 段階別時間計測・Worker化・進捗/経過時間表示・cancel。
  既定budgetでの3候補生成は実測約28秒（mesh生成が候補あたり8〜9秒と支配的）——
  指示書の「数秒を超える処理はKatachi共通UI規約に反する」という基準を満たしていない
- **§8自動テスト20項目のうち未着手のもの**: 16-18（recipe round-trip一式への
  algorithmVersion/weights/curveの保存——現状metrics経由でprovenanceには出るが
  recipe自体のserialize/history.ts側の型には未反映、旧recipeのmigration設計も未着手）
- S3（ring分布モード: 均等分散/clustered/build-axis gradient）・S4（Fabrication Plan:
  monolithic/partitioned/assembled派生、分割後coverage再測定）は設計書自身が将来段階と
  明記しており未実装。S2.1（coverage attainment）が先——この回も未達のため引き続き先送り
- 実CoinSRF/実STLホストでの3水準（25/50/75%）比較実制作（§9、このStudyの自動化範囲外）
- 実ブラウザ操作確認・Optimizer同条件診断・作者承認（この回のReport参照）
