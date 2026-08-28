# SKIN Graph中心・作者制作工程 再設計案 v0

- Date: 2026-08-26
- Study: skin
- Status: **G00 Sol High review passed / author acceptance and each implementation task remain separate**
- Scope: SKIN全体の制作工程（BaseからPrint Runまで）
- Implementation approval: **not granted by this document**
- Print approval: false
- Supersedes: なし。`skin-author-workflow-handoff-20260826.md`への再設計案であり、作者確認までは旧仕様を削除しない

## 1. この文書の目的

作者が作りたい作品は変えず、SKIN全体の制作工程を、最終mesh中心ではなくGraph中心に組み直す。
狙いは次の三つである。

1. 作品の表面構造と内部構造を、印刷用サポートと混ぜずに作者が操作・比較できること
2. 編集のたびに最終meshを作り直して全面診断する現在の重い経路を減らすこと
3. meshを正本にせず、再現可能な作者操作から必要な時だけArtwork Print Geometryを導出すること

これは実装指示書ではない。作者が工程の意味を確認し、別レビュワーがデータ境界・診断の証拠能力・
保存互換性を検査できるようにするための設計書である。

## 2. 作者が追加した中心思想

作者原文:

> 一つ個人的な仮説としていまメッシュで計算しているからものすごく時間がかかっているけどSDFとかで計算したら早くならない？
> どこかの段階でメッシュ化が必要なのはわかるけど

> 僕が作りたいものは変わらないけれど全体の工程は見直してみてほしい
> Graphを取り入れることで今時間をかけている診断も簡素化できるように思う

作者が示した構造:

~~~text
          Metaball / SDF
         （仮想的な母体）
             ↙     ↘

    Surface Graph     Interior Graph
    表層構造          内部支持構造
         ↓                ↓
    SKIN形状    ← 接続 →  Struts / lattice

                 ↓
            Print Geometry
~~~

この図から、次を設計の前提として読む。

- Metaball / SDFは作品の最終出力ではなく、SurfaceとInteriorが生まれ、接続されるための仮想的な母体である
- Surface GraphとInterior Graphは上下関係ではなく、同じ母体から生まれる二つの作品構造である
- Interior Graphは印刷後に外すサポートではなく、作品として残るStruts / latticeである
- Artwork Print Geometryは両Graphとその接続を作者が確認した後に導出する
- したがって、編集途中の正本を最終meshに置く必要はない

## 3. 変えないもの

- 現時点での作品の形状としての物理的ゴールは、作者原文で「一体性」「印刷できる」である
- 作者が作りたいSKINの意味、表面パターン、内部構造、実と虚の関係
- 形状は作者またはCodexがソフトを操作して作り、形状データを外から勝手に注入しない
- 同じSeed、設定、操作履歴から同じ像を再現する
- Internal Structureは作品として残る
- removable print supportは印刷後に外す別物である
- 最終的な印刷判断にはArtwork Print Geometry、Print Job Assembly、Slice／実機の証拠が必要である
- 元STLをBaseにする場合、作者判断なしにMetaballへ近似して元形状を変えない

## 4. 新しい表現の境界

### 4.1 Typed Graph Core

Surface、Interior、将来のBaseで共有するのは、Graphの意味ではなく最低限の管理契約である。

- stable identityとrevision
- provenance: author / generated、生成元、algorithm version、入力fingerprint
- lifecycle: candidate / confirmed / rejected / stale
- node / edgeの追加、更新、削除、差分
- deterministic serializationとfingerprint
- confirmed snapshotを自動上書きしない所有権

Graph Coreの上に意味の違うTyped Graphを置く。

- `BaseSkeletonEdge`: 母体を作る中心線／枝。Geometryではない
- `SurfaceRelationEdge`: 表面要素の接触意図／関係。太さを持つstrutではない
- `InteriorStrutEdge`: 作品として実体化する半径付きstrut
- `ArtworkConnection`: Surface node / regionとInterior node / edge途中を結ぶTyped Relation

これらを一種類の`SpatialEdge`へ押し込まない。共通Coreはidentity、履歴、保存、fingerprintを共有し、
edgeの意味とGraph→Geometry規則はTyped Graph側が所有する。

### 4.2 Future Base / Skeleton Graph

将来的に、動物的・枝分かれした母体形状を作るため、Base / Skeleton GraphからVirtual Motherを生成できるようにする。

~~~text
Base / Skeleton Graph
          ↓
Metaball / SDF Virtual Mother
          ↓
Surface Graph / Interior Graph
~~~

これは今回のG00〜G02では実装しない。ただしGraph Core、stable ID、serialization、fingerprint、Geometry Realization Specは
Future Base Graphを追加できる契約にし、Surface以降だけへ固定しない。

### 4.3 Virtual Mother

作者が形を作る場。Baseの種類ごとに入口は違ってよい。

- Metaball / SDF Base: 場そのものを持つ
- S1 Recipe Base: レシピと操作履歴から場を再生する
- STL Base: 元STLを正本として保持し、距離・内外・法線を問い合わせるadapterを作る

STL Baseのadapterは、元STLを別形状へ置換するものではない。source bytes、SHA-256、単位、scale、向き、
空間indexを保持したまま、Graph生成と診断へ同じ問い合わせ契約を提供する。非水密、法線不整合、符号不確実なSTLに備え、
`signedDistanceAvailable`、`insideConfidence`、`normalReliability`をcapabilityとして返し、不確実な診断はfail-closedにする。

Virtual Motherそのものは常に非出力の生成場とする。窓／殻モードで母体由来の殻を作品として残す場合は、
`Mother Shell Component`をderiveし、作者確認後にSurface Graphの作品要素へ昇格させる。

~~~text
Virtual Mother → Mother Shell Component候補 → 作者確認 → Surface Graph / Artwork Graph
~~~

### 4.4 Surface Graph

表面を構成する作者単位と、その関係を表すGraph。

- node候補: 花、リング、コイン、閉パッチなど、作者が選択・移動・拡縮できる表面要素
- edge候補: 接触、重なり、近接、意図的な接続
- node属性: `authorElementId`、要素種類、配置frame、作者設定、生成元、現在の母体fingerprint
- edge属性: relation種類、lifecycle（proposed / confirmed / rejected）、作者確認履歴

推奨案では、Surface Graphは三角形頂点を並べたdense mesh graphではない。作者が見て編集できる表面構造の
semantic graphとする。dense graphにすると、meshをGraphと呼び換えるだけになり、安定IDと軽い診断を得られない。

Surface relationのcomponent診断は`confirmed` edgeだけを使う。`proposed`は候補表示、`rejected`は再提案抑止の作者判断として
保持する。最短距離、重なり量、接触強度など位置変更で古くなる数値はGraph正本へ固定せず、入力fingerprint付き診断cacheへ置く。

Surface identityは三層に分ける。

- `authorElementId`: 作者が置いた花・リング・閉パッチの継続ID。Paintと作者編集の主対象
- `patchInstanceId`: `(patchSetRevision, patchId)`。その生成回の実体参照
- `realizationId`: SDF / mesh / proxyへ実体化した導出GeometryのID

再packで新しく生成された要素へ旧`authorElementId`を自動流用しない。直接編集で同じ作者要素が継続する場合だけIDを維持し、
現在の`patchInstanceId`への対応はfingerprint付きmappingとする。

### 4.5 Surface Evaluation Proxy

semantic Surface Graphを正本に保ったまま、element内の局所法線や下向き領域を観察する診断用導出物。

- Virtual Mother / STL adapter上のsample位置、法線、局所frame
- semantic element local座標
- projection confidenceと入力fingerprint
- final meshより軽い有限sample。作者要素のidentityには使わない

`Semantic Surface Graph → Surface Evaluation Proxy → Artwork Print Geometry`の順にし、Proxyをdense Graph正本へ昇格しない。

### 4.6 Interior Graph

作品として残る内部構造のTyped Graph layer。単独で工程の最終出力にせず、Structural Integration Generatorが
Artwork Graphへ追加する構成要素として扱う。

- node: 内部点、Surfaceへの接続点、junction
- edge: Dry Web / Voronoi Edge / Internal Columnsなどのstrut
- 属性: stable ID、半径、方式、Seed、生成設定、作者編集、接続先Surface node

既存の`InternalStructureGraph`はこの考えに近い。生成結果を再現できるSeed＋設定と、作者が行った直接編集を区別する。
直接編集を許す場合、その編集操作は正本へ入る。

### 4.7 Artwork Connections

Surface GraphとInterior Graphの接続を、近さから毎回推測するだけでなく明示的な関係として扱う。

- Surface node / regionからInterior node / edge途中へのTyped Relation
- 接触予定点、接触半径、許容差
- 自動提案か、Support Paint 1による作者指定か
- 現在のVirtual MotherとGraphに対するfingerprint

この接続関係が、現行の「危険面ごとに全Internal edgeを探す」処理を軽くする中心になる。

### 4.8 Artwork Graph

`Surface Graph + Interior Graph + Artwork Connections`を、作者が確認する作品構造のsnapshotとして扱う。
これはPrint Geometryではないが、どの表面要素がどの内部構造へつながるかを再現できる。作者が確認した時点の
node、edge、connection、座標、半径、stable IDは、Seed＋生成設定だけに還元せず`.fkei`の作品正本として保存する。
生成規則の将来変更後も、確認した作品を同じGraphとして開ける必要があるためである。

Artwork Graphは状態を持つ。

- `surfaceDraft`: Surface layerはあるがInterior / Connectionsは未生成
- `integrationCandidate`: Structural Integration Generatorが一体化経路を提案したcandidate revision
- `integratedConfirmed`: 作者がInterior、Connections、太さ、経路を確認した作品Graph snapshot

### 4.9 Dry Web / Structural Integration Generator Contract

Dry Webは`Interior Graph Generator`より広い。表面パターンを内部構造と接続し、離れたSurface要素を構造的につなぎ、
作品全体を一体化して印刷可能な構造へ近づける現在のStructural Integration Generatorである。

入力:

- semantic Surface Graphとrelationの作者状態
- Virtual Mother / STL adapterへの距離、内外、法線問い合わせ
- printer、material、線径、積層角度などの印刷条件。removable support geometryは含めない
- Support Paint / 作者が指定した接続target
- 現在のConfirmed Artwork Graphとprovenance

出力はInterior Graph単体ではなく`Integrated Artwork Graph Candidate Revision`である。

- Interior nodes / strut edges
- Surface→InteriorおよびSurface region→Interior edge途中のArtwork Connections
- 離れたSurface要素間を一体化する内部path
- 必要な半径、junction、経路のcandidate
- 入力fingerprint、generator version、未接続／未解決facts

Dry Webには二つの役割がある。

- 形態的役割: 内部に見える作品構造を作る
- 構造的役割: Surface要素を内部経路でつなぎ、作品の一体性と印刷可能性へ近づける

GeneratorはConfirmed Artwork Graphを直接上書きしない。段階5でcandidate diffを作者が採用・拒否し、
`integratedConfirmed`へ昇格させる。将来のVoronoi / Grid / Future Generatorも同じ入出力契約を実装できる。

### 4.10 Geometry Realization Spec

同じArtwork Graphから同じGeometryを再現するため、Graph snapshotと別に次を正本として保存し、
Artwork Print Geometry fingerprintの依存対象にする。

- geometry generator version
- Surface要素とMother Shell Componentの実体化方式
- Interior edgeの断面・半径規則
- node junctionの接合方式
- blend / union方式
- Virtual Motherによるclip規則
- sampling bounds、resolution、iso threshold
- units、数値tolerance

Graphが同じでもRealization Specが違えば融合、穴、水密性、一体性は変わる。実際に印刷したbytesを残すことと、
通常の作品再編集で同じGeometryを再生成できることの両方を必要とする。

### 4.11 Artwork Print Geometry

作者確認済みArtwork GraphとVirtual Motherから導出する、製造用の有限表現。

- SurfaceとInteriorを合成した作品mesh
- removable print supportを含まない作品部分だけのSTL / 3MF component

通常のpreview / diagnosis用Artwork Print Geometryは導出物であり、作者の形の正本ではない。ただし実際に
Slice／印刷へ渡した固定bytesは、hashだけでなくbytes自体をPrint Runの不変証拠として保持する。

### 4.12 Print Support Geometry / Print Job Assembly

- Print Support Geometry: 正規段階8で作る、印刷後に外すsupportだけの有限表現
- Print Job Assembly: `Artwork Print Geometry + Print Support Geometry + printer placement / profile`

三者はfingerprint、履歴所有者、表示、書き出しを分離する。段階7の作品一体性を、removable supportを足して
見かけ上一つになった状態で合格させない。

## 5. 作者から見たSKINの正規制作工程 8段階

この8段階をUIと制作記録の最上位に置く。技術的な診断、Paint、cache、fingerprint、Worker処理は各段階の
サブ工程としてぶら下げ、作者の制作工程を細分化しすぎない。

作者の重要な整理:

> 3で内部構造そのものを作るわけではない

> SurfaceもInteriorもConnectionも載せられる共通の作品Graphを用意する

> BaseはMetaballのまま。Artwork Graphを先に成立させる。Base Graph化は後

### 1. Base Shape

- 現在はMetaball / SDFを使う
- S1 Recipe / STL入口も同じBase段階に置く
- Future Base / Skeleton Graphは設計上閉ざさないが、現在は実装しない
- Virtual Motherは非出力。殻を作品化する時はMother Shell Component候補を段階3へ渡す

### 2. Surface Pattern

- 花、リング、コイン、閉パッチなどを表面へ割り当てる
- 表面／内側などの配置基準、実と虚、選択、移動、拡縮、回転、複製を作者操作として記録する
- この段階ではGraphの内部構造も最終meshも作らない

### 3. Artwork Graph化

SurfaceもInteriorもConnectionも載せられる共通の作品Graph containerを成立させる。

~~~text
Artwork Graph
├─ Surface nodes / Surface relation edges
├─ Interior nodes / Interior strut edges       # この時点では空でよい
└─ Artwork Connections                         # この時点では空でよい
~~~

- Surface Patternをsemantic Surface nodeへ変換する
- Surface relation候補を`proposed`として作り、作者が`confirmed` / `rejected`を選ぶ
- Mother Shell Componentを残す場合はSurface nodeへ昇格する
- typed Graphの意味は維持し、SurfaceRelationEdgeとInteriorStrutEdgeを同じedge型にしない
- 内部構造そのものはまだ作らない

### 4. Dry Web / Structural Integration

Surface Graphを読み、内部経路とConnectionsによって作品全体を一体化へ近づけるgenerator段階。

~~~text
Artwork Graph
   ↑
   ├─ Dry Web Generator
   ├─ Voronoi Generator
   ├─ Grid Generator
   └─ Future Generator
~~~

- 入力はSurface Graph、Virtual Mother、印刷条件、作者targetである
- 現在はDry Webを中心に、Interior node / edge、SurfaceへのConnections、離れたSurface要素を結ぶ内部pathを生成する
- 出力はInterior Graph単体ではなく`Integrated Artwork Graph Candidate Revision`である
- 形態として見える内部構造と、一体性を作る構造経路の両方を扱う
- Support Paintはgenerator targetを作者が指定する補助手段としてここへ置く
- 生成完了後に停止し、Geometry化、exact diagnosis、removable supportを自動開始しない
- Confirmed Graphを直接上書きせず、Candidateとの差分を段階5で作者が採否する

### 5. Integrated Artwork Graph調整

- Surface / Interior node、relation / strut edge、connection、太さ、密度、junction、integration pathを編集する
- proposed / confirmed / rejected、generated / pinned / manually editedを区別する
- Surfaceだけ／Interiorだけ／Connectionsだけ／全Artwork Graphを切り替えて観察する
- Support Paintの追加・除外・Auto、Paint Undo / Redoもこの調整に属する

Graph screeningは独立した制作工程にしない。調整中のリアルタイム補助表示として次を示す。

- 接続切れ、孤立component、未接続target
- 長すぎるedge、細すぎるedge、積層角度risk
- 低confidence Paint投影、過小な接続予定半径

これらは印刷合格ではなく、Graphを直すための軽いscreeningである。

### 6. Geometry / Mesh化

作者確認済みArtwork GraphとGeometry Realization Specから、有限太さを持つArtwork Print Geometryを明示生成する。

- SDF / analytic primitive / STL adapterを同じsampling境界へ渡す
- Surface、Interior、Connectionsを作品meshへ実体化する
- 数秒を超える処理は段階、processed / total、経過時間、最終応答、cancel状態を表示する
- 上流変更やgenerator選択だけで自動再実行しない
- 旧Geometryは消さず、fingerprint不一致の「古い結果」とする

### 7. 作品形状診断

段階6で作ったArtwork Print Geometryをexact evidenceとして確認する。

- removable supportを除いた作品部分の一体性、actual connected component、接続部の融合
- 薄肉、穴、閉塞、水密性、非多様体、退化面
- actual Surface angle、積層性、bridge、layer continuity
- 現行Internal Print Gateの線径／voxel数、anchor、floating component、積層不能node / edge
- Graph screeningとactual Geometryの差

問題をInteriorで直す場合は段階4〜6へ戻る。Print Supportで支える作者判断は段階8へ送る。
Graph screeningだけで「一体性」「印刷できる」を達成したと宣言しない。

### 8. Print Support

作品とは別の、印刷後に外すsupportを明示生成する。

- Branching support、Vertical support、object lift / cradle、tip / trunk、shared foot / raft
- Artwork Graphへ含めず、Print Support Graph / Geometryとして別state、fingerprint、履歴、書き出しを持つ
- SDF / voxelとSliceは閉じ込め／外部到達性のscreeningであり、removal proofではない
- 実際に取り出せることの最終証拠はPrint Runでの実物除去観察とする

`Interior Graph ≠ removable print support`を全工程の不変条件とする。

### 8段階の外側 — Print Evidence

Slice、printer / material / profile、STL / 3MF / G-codeの固定bytesとhash、実印刷、support除去、失敗と観察は
作品制作段階ではなくPrint Evidence / Print Runとして追記する。段階8から自動で印刷承認へ進まない。

### 旧1〜10 UIとの移行対応

| 旧工程 | 新しい正規工程 |
|---|---|
| 1 Base | 1 Base Shape |
| 2 Surface composition / 3 Filled Shape | 2 Surface Pattern |
| 4 Surface mesh generation | 3 Artwork Graph化へ置換。meshは6へ移動 |
| 5 Surface diagnosis / 6 Support Paint 1 | 4〜5のgenerator入力・リアルタイム補助へ移動 |
| 7 Internal Structure | 4 Dry Web生成＋5 Graph調整 |
| 8 Combined diagnosis / Paint 2 | 6 Geometry化＋7 作品形状診断。修正は4〜6へ戻す |
| 9 Removable support | 8 Print Support |
| 10 Print validation / Print Runs | 8段階外側のPrint Evidence |

## 6. 診断をどこまでGraphで簡素化できるか

| 問い | Graph / Virtual Motherで先に確認 | Artwork Print Geometry / Sliceまで必要 |
|---|---|---|
| Surface要素が孤立していないか | Surface Graphのcomponent | mesh離散化後の微小分離 |
| SurfaceとInteriorが接続予定か | Artwork Connections | 実meshでの融合・接触面積 |
| Interior edgeの角度・長さ・半径 | Interior Graphで正確に計算可能 | 押出幅・layer離散化の成立 |
| Surfaceの下向き候補 | SDF gradient / STL法線をGraph点でsample | 全actual faceの面積と局所角度 |
| targetから内部構造へpathがあるか | Graph traversal | 実形状が途中で途切れないか |
| 細い／長いstrutがあるか | edge属性でscreening | mesh voxel幅、実Slice path |
| 作品内の空間が外部へ開くか | SDF / voxel flood fillでscreening | Sliceで再screeningし、Print Runの実物除去で確認 |
| watertight / manifoldか | 不可 | final meshが必要 |
| air start / bridge / layer continuity | 粗い予測のみ | Sliceが必要 |
| 印刷成功・強度 | 不可 | 実機印刷・破壊試験が必要 |

Graph診断はmesh診断を偽装して置き換えるものではない。作者が形を作る途中の反復を軽くし、重い証拠を取る回数を
減らすためのscreeningである。各表示は「Graph screening」「Exact mesh」「Slice」「Print Run」の証拠段階を明記する。

既存研究には、同じ44 Surface patchに対してライブのGraph近似が44 component、最終mesh実測が22 componentとなった例がある。
また窓版では殻が2 componentへ分断された。Graphは早い観察には使えるが、smooth booleanとsampling後のcomponent数の正本は
Artwork Print Geometryで確認する。

## 7. 現行266.5秒診断の読み直し

作者実機の事実:

- Surface最終解像度128
- Dry node 64,937 / Dry edge 63,603
- 付加前未支援14.0% → 付加後未支援1.3%
- 自動再診断 約266.5秒
- 計算中は99%表示が続き、停止か稼働中か判別できなかった

現行`surfaceAngleDiagnosis.ts`は、危険faceのcentroidごとに`internalGraphReachesPoint()`を呼び、
そのたびに全nodeのMapを再構築してInternal Graphの全edgeを線形走査する。今回の表示値を上限として読むと、
約99,235 target × 63,603 edge、最大約63億回のpoint-segment距離判定に、targetごとのnode Map構築が加わり得る。

したがって、遅さを「meshだから」だけで説明しない。安全な改善順は次である。

1. 一回のdiagnosisにつきnode MapとInternal edgeの3D空間indexを一度だけ作り、同じ距離式で近傍edgeだけ調べる。
   edge半径、contact tolerance、point radius、欠損endpoint、zero-length edgeを含む全件走査との完全一致testを持つ
2. Surface Graph targetとInterior Graphの接続を一度確定し、Graph編集後はpath / edge属性だけ再診断する
3. Surfaceの局所法線とinside / outsideはVirtual Motherへ問い合わせ、Graph段階ではmesh化しない
4. 正規段階6だけfinal meshを生成し、段階7でGraph screeningとの差分をexact evidenceとして確認する
5. 外部到達性はSDF / voxel版を比較実験し、Slice結果と一致する範囲を確認してから採用する

既存のSKIN形状生成はすでにmode-dependent composite SDFを使い、Interior Graphもanalytic strutとして最終fieldへ合成できる。
全面SDF書き直しより、Surface Graphの明示と現行総当たりの除去を先に行う方が小さく検証できる。

### 証拠の追跡

- `E-COMPONENT-20260713`: [README「完了条件3の実測」](../README.md)に、同じ44 patchでライブ近似44 component、
  resolution 64のmesh実測22 componentを記録。窓版の殻が2 componentになった観察も同じ実測節にある
- `E-DIAG-266S-20260826`: 作者実機スクリーンショット
  `/Users/atsushisato/Desktop/スクリーンショット 2026-08-26 22.09.50.png`から転記。LAN origin、Surface 128、
  Dry node / edge、14.0%→1.3%、266.5秒を読める。ユーザー所有の未Git証拠であり、shape fingerprintとcommitは未固定
- `E-CODE-FE-20260826`: 現在の未コミットworking treeの`surfaceAngleDiagnosis.ts`で、
  `diagnoseSurfaceAnglePositions()`→`internalGraphReachesPoint()`がtargetごとにnode Mapを再構築し全edgeを走査することを確認。
  baselineは`8d3df2f8af10f9e2abc33a32e2be49e6adedbc37`以後の未コミット状態

G02 benchmarkを研究証拠に昇格する時は、fixture、input fingerprint、algorithm version、commit、machine、実時間を
Git管理されたnoteへ残す。未固定の作者スクリーンショットだけを性能合格の根拠にしない。

## 8. 正本、導出物、cache

### .fkeiへ必ず保存する正本

- Base source: Metaball / S1 Recipe / 元STL bytesとmetadata
- Virtual Motherを再生する操作履歴と作者設定
- Surface要素、stable ID、作者による配置・編集操作
- Surface node identity scopeとして`(patchSetRevision, patchId)`を保持する。再pack後の同じ数値IDを同一要素とみなさない
- 作者確認済みArtwork Graph snapshotのnode / edge / connection、座標、半径、stable ID
- Support Paint v1の元stroke（bbox正規化座標、半径、法線）を保持する
- Support Paint 1 / 2のGraph target投影と作者確認snapshot（特定生成algorithm名へ固定しない）
- Interior Graph生成の方式、Seed、設定
- 作者が行ったInterior node / edge直接編集
- SurfaceとInteriorの接続に対する作者上書き
- removable print supportの作者設定、Paint、手編集
- context-aware Undo / Redoの各操作journal
- Print Runのartifact hash、printer profile、結果、観察

### fingerprint付き導出物

- 自動生成Surface Graph edge候補
- 作者確認前の自動生成Interior Graph候補
- Artwork Connectionsの自動提案
- Graph diagnosis
- SDF / voxel field cache
- 通常のpreview / diagnosis用Artwork Print Geometry mesh
- removable print support geometry
- Slice preview / validation report

作者がGraphを確認または直接編集した場合、確認時snapshotと編集操作を正本へ昇格する。Seed＋設定＋algorithm versionも
併記し、Graphそのものと生成過程の両方を残す。cache不一致は削除せず「古い結果」にする。
実際にSlice／印刷へ使ったArtwork Print Geometry、Print Support Geometry、Print Job Assemblyの固定bytesはcacheではなく、
Print Runの不変artifactとして保持する。

### 再生成と作者編集のmerge

確認済みGraphをgenerator再実行で直接上書きしない。

~~~text
再生成
  ↓
Candidate Graph Revision
  ↓  現在のConfirmed Graphとの差分表示
作者が追加・置換・拒否を選ぶ
  ↓
新しいConfirmed Snapshot
~~~

node / edge / relationは少なくとも`generated`、`pinned`、`manuallyMoved`、`manuallyAdded`、`manuallyDeleted`の
provenance / author stateを持つ。作者が削除したedgeを自動復活させず、移動したnodeを候補生成で黙って戻さない。
確認前candidateは導出物、確認済みsnapshotと採否判断は正本である。

## 9. 既存保存形式との互換方針

- 現在のShape Recipe / historyを破壊変更しない
- 既存`patches`を初期Surface Graph nodeへadapterし、`patchSetRevision`とpatch IDの組でidentityを維持する
- 既存`InternalStructureGraph`を初期Interior Graphへadapterする
- Support Paint v1の元strokeは置換せず保持し、現在の幾何anchorからSurface Graph targetへの投影を導出物として追加する。
  作者が投影を確認した時だけmapping snapshotを正本へ加える
- 既存Surface diagnosis / ledger / mesh cacheは、旧algorithm versionの導出結果として読めるようにする
- `.fkei` Open / Saveは現在placeholderで既存project payloadはまだないため、初版schemaを定義する。既存Shape Recipe v1、
  Support Paint v1、Print Profileのimport adapterを別々に持ち、Graph sectionとround-tripを一taskへ混ぜない
- 既存history entryを後からowner別journalへ分割しない。旧entryは従来順で再生し、新しいGraph / Paint 2 / Print Support操作から
  ownerを明示してcontext-aware Undo / Redoへroutingする
- 任意cacheが無い、WebCryptoが無い、LAN HTTPである、という理由で正本を開けなくしない
- Graph化を理由に元STL、古い診断、作者履歴を自動削除しない

## 10. 状態と進捗表示

各重い処理は共通して次を持つ。

- `not started`
- `running`: 段階名、processed / total、経過時間、Worker数、最終heartbeatからの秒数
- `waiting for worker`: heartbeatが一定時間無いが、cancelは受け付ける
- `cancel requested`: 受付済みであることを表示
- `finalizing`: Worker結果を画面状態へ採用中
- `completed`: 結果要約、入力fingerprint、実時間
- `stale`: 上流変更で現在入力と一致しない旧結果
- `failed`: 失敗段階と再試行条件

結果受領前の待機を99%固定で表現しない。Graph生成完了、exact mesh生成完了、diagnosis完了を一つのprogressへ混ぜない。

## 11. P0 / P1 / P2

### P0 — 意味と状態の混線

- Interior Graphをremovable print supportとして扱わない
- 診断と同時にtree / scaffoldを生成しない
- Graph生成完了とexact diagnosis完了を別状態にする
- 旧Task04Kの最終mesh中心の再配線は、この設計の作者確認まで進めない
- Artwork Print Geometry未生成のGraph screeningを「印刷合格」と表示しない

### P1 — 正本と互換性

- stable Surface node IDとPaint再投影の契約
- Graphの自動生成部分と作者直接編集部分の所有権
- `.fkei`初版schema、legacy adapterと古い結果保持
- context-aware Undo / RedoをShape、Graph generator input / adjustment、exact diagnosis correction、Print Supportへroutingする境界
- STL Base sourceを失わないadapter

### P2 — 性能と証拠の精度

- Internal edge空間index
- SDF gradient screeningとexact mesh法線の差
- voxel外部到達性とSlice除去経路の差
- Graph previewの大規模描画上限
- Windows / MBAのWorker数とcache可否による実測差

## 12. 30分単位の移行案

各taskは実shapeを勝手に生成せず、作者がソフトを操作して確認できる地点で止める。

1. **G00 設計書レビュー**: 本文の意味、作者向け8段階、typed Graph境界を確認。実装なし
2. **G01a Graph Core契約**: identity、revision、provenance、lifecycle、serializationを型とfixtureだけで定義
3. **G01b Graph facts表示**: 既存patch / Internal graphから読取専用factsを表示。形状と保存を変更しない
4. **G02a 高速化契約＋fixture**: node Map / edge indexを一度だけ作る純粋関数と旧全件走査の完全一致test
5. **G02b runtime＋benchmark**: Workerへ接続し、合成benchmarkと証拠noteを提示。実作品診断は作者操作まで実行しない
6. **G03a Surface identity adapter**: authorElement / patchInstance / realization IDをfixtureで分離
7. **G03b Surface relation候補**: proposed / confirmed / rejectedの純粋stateとcomponent test
8. **G03c Surface Graph表示**: 接続候補と確定接続を色分け表示。Geometryと保存は未変更
9. **G03d Artwork Graph container**: surfaceDraft / integrationCandidate / integratedConfirmedの空slotとstate fixture
10. **G04a Evaluation Proxy契約**: local座標、Mother位置・法線、confidenceのfixture
11. **G04b Graph assist表示**: confirmed component、弱い接続、edge角度を段階5の補助として表示。独立診断工程にしない
12. **G05a Paint読取投影**: 元Support Paint v1を変えず、Surface Graph target対応とconfidenceを表示
13. **G05b Paint mapping永続化**: 作者確認snapshotだけを新sectionへ保存し、旧stroke round-tripを確認
14. **G06a Structural Integration契約**: Surface Graph＋Mother＋印刷条件→Integrated Artwork Graph Candidateのfixture
15. **G06b Artwork Connection型**: Surface node / region→Interior node / edge途中のTyped Relationとfixture
16. **G06c Candidate差分**: integrationCandidateとintegratedConfirmedの差分、採否、手編集保護を純粋stateで確認
17. **G06d Dry Web UI**: Interior path、未接続target、候補／確定／拒否を表示。Geometry化は開始しない
18. **G07a WORKFLOW shell**: 作者向け8段階を表示し、未実装を灰色にする。state routingは変えない
19. **G07b WORKFLOW state routing**: Graph生成／補助表示／古い結果を新工程へ接続する
20. **G08a Realization Spec schema**: generator、junction、blend、clip、sampling、unitsを型とfixtureで固定
21. **G08b Artwork Geometry pure fixture**: 同じGraph＋Specから同じfingerprint／mesh factsを得る
22. **G08c Artwork Geometry明示UI**: 正規段階6だけで作品meshを生成し、独立progressを表示
23. **G08d Exact gate**: 正規段階7へ一体性、mesh診断、現行Internal Print Gateを接続し、段階8をfail-closedにする
24. **G09a Exact correction state**: Graphへ戻す／Print Supportへ送るroutingを純粋stateで確認
25. **G09b Exact correction UI loop**: 正規段階7から4〜6への戻りと古い結果を表示
26. **G09c Print Support state**: removable supportを別state / fingerprintへ分離
27. **G09d Print Support export**: Artwork / Support / Job Assemblyの書き出し境界をfixtureで確認
28. **G10 SDF reachability比較**: 小fixtureでvoxel／mesh／Slice screeningを並べ、実物除去以外をproofと呼ばない
29. **G11a .fkei schema**: manifest、正本、任意cache、Print Run artifactの配置だけ定義
30. **G11b empty / recipe round-trip**: 空projectと現行Shape Recipe v1を無変更往復
31. **G11c Paint / Profile adapters**: Support Paint v1とPrint Profileを別々にimport test
32. **G11d Confirmed Graph保存**: snapshot、Realization Spec、採否履歴をround-trip
33. **G11e cache omission**: diagnosis / mesh cacheなしでも正本が開くことを確認

G02a / G02bは設計変更と独立して先行可能だが、実作品の最終診断は実行しない。G03以降も、作者が指定した小taskだけを
個別に実装し、各回の目視確認地点で停止する。この設計レビュー通過を一括実装の承認として扱わない。

## 13. この設計書で決めていないこと

- Surface Graphの自動edge生成algorithm
- Graph screeningの合格閾値
- SDF / voxel解像度
- Support Paint 1 / 2の最終保存schema
- 複数Interior Graph layer
- Graph node / edgeの直接編集UI
- printer固有の最終合格条件

## 14. G00で採用した設計判断

**Surface Graphを「作者が配置した花・リング・閉パッチとその接続関係」とするか、Surface全体を細かく分割した
dense graphとするか。**

G00では前者のsemantic Surface Graphを採用する。局所法線とelement内の下向き領域はSurface Evaluation Proxyへ分離し、
dense graphを正本にしない。

**仮想的な母体はArtwork Print Geometryに一切残らないのか、それとも「形態が実」の窓／殻モードでは母体の殻が作品材料として
残るのか。**

Virtual Motherそのものは常に非出力の生成場とする。窓／殻モードではMother Shell Componentを候補としてderiveし、
作者確認後にSurface Graph / Artwork Graphへ昇格させる。これにより母体の意味を保ったまま殻を作品材料にできる。

## 15. レビュワーへの依頼

実装・ファイル変更・生成・Sliceをせず、次を確認する。

1. SKIN全体の作者向け8段階と、その外側のPrint Evidenceまでが欠けずに接続しているか
2. Surface Graph / Interior Graph / Artwork Connections / Print Supportの意味が混線していないか
3. Graphでscreeningできる問いと、mesh / Sliceが必要な問いを過大に主張していないか
4. 現行Shape Recipe、Support Paint v1、InternalStructureGraph、cache / ledgerを非破壊で移行できるか
5. 266.5秒診断の原因分析とG02の順序が妥当か
6. 作者判断が必要な問いを増やしすぎていないか
7. 30分taskが各回作者の目視確認地点で止まるか

## 16. G00再レビュー結果

2026-08-26、Sol Highによる読み取り専用の再レビューは`ship`、blocking findingなしだった。

- 作者向け8段階と、その外側のPrint Evidence、旧1〜10工程からの移行対応が接続している
- 段階3はtyped Artwork Graph containerだけを成立させ、Interiorを生成しない
- 段階4のDry WebはStructural Integration Generatorとして、Interior path、Artwork Connection、半径／経路を含む
  `Integrated Artwork Graph Candidate Revision`を生成する
- Candidateは作者の採否なしにConfirmed Graphを上書きしない
- Graph screening、exact mesh、Slice、Print Runの証拠能力、および作品として残るInteriorとremovable supportが分離されている
- 現行`InternalStructureGraph`、Support Paint v1 anchors、全edge走査、`.fkei` placeholderという実装事実と整合する

この結果は設計契約のレビュー通過であり、実装、形状生成、出力または印刷承認ではない。
