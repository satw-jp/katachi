# Katachi Composition Core — 基本語彙と Hikari 境界（2026-08-09）

状態: **方向を採用、実装は PACK-SPIKE の観察後**。

この文書は、Flower の表面パッキングを一機能として作るのではなく、今後の Scatter / Attach /
Aggregate / Grow / WFC まで同じ言葉で扱うための設計判断を残す。既存 Study や Hikari の実装を
この時点で移動・統合するものではない。

Katachi の既存不変則も維持する。特に、**場が第一級で、メッシュは導出物**であること、
同じ seed と同じ生成経路から同じ結果を再現できること、Study で必要になったものだけを
Library / Core へ昇格することは変えない。

---

## 1. 採用する六つの基本語彙

```text
Shape Definition
       │
       ▼
Motif Definition
       │
       ▼
Placement Domain
       │
       ▼
Composition Operator
       │
       ▼
Instance Set
       │
       ▼
Realize / Deform / Merge
       │
       ▼
Immutable Geometry Snapshot
       │
══════ Katachi / Hikari boundary ══════
       │
       ▼
Hikari Adapter → Hikari Scene → Optics / Render
```

基本語彙は次の六つとする。

1. `ShapeDefinition`
2. `MotifDefinition`
3. `PlacementDomain`
4. `CompositionOperator`
5. `InstanceSet`
6. `GeometrySnapshot`

Flower は中核そのものではなく、次の一例になる。

```text
Motif = Flower
Domain = Surface
Operator = Pack
```

---

## 2. Shape と Motif と Instance を分ける

### ShapeDefinition

`ShapeDefinition` は形の正本への参照である。Katachi では場が第一級なので、ここを
`Mesh` 専用にはしない。SDF、サンプル場、手続き形状、メッシュを表現種別つきで参照できる形にする。

```ts
interface ShapeDefinition {
  id: string;
  revision: string;
  representation: ShapeRepresentation;
  bounds: Bounds3;
  localFrame: Frame3;
}
```

`ShapeRepresentation` の最初の実装種別は PACK-SPIKE の実需で決める。将来候補を先にすべて
実装しない。

### MotifDefinition

`MotifDefinition` は繰り返し配置できる「単位」の定義である。同じ形を千回配置しても、
形状本体は一つだけ持つ。

```ts
interface MotifDefinition {
  id: string;
  shapeRef: string;
  localFrame: Frame3;
  pivot: Vec3;
  bounds: Bounds3;
  collisionProxies: readonly CollisionProxy[];
  parameters: Readonly<Record<string, unknown>>;
}
```

### MotifInstance

`MotifInstance` は一個ごとの置かれ方であり、Motif 本体とは別物である。

```ts
interface MotifInstance {
  id: string;
  motifId: string;
  transform: Transform3;
  parameterOverrides: Readonly<Record<string, unknown>>;
}
```

この分離により、`FlowerGeometry × 1 + Transform × 1000` を保ったまま、後段で必要な時だけ
実体化できる。

---

## 3. PlacementDomain は位置ではなく配置 Frame を返す

配置先を Pack の内部へ埋め込まない。平面、曲面、体積、曲線、点群、メッシュ領域を
同じ契約で扱う。

```ts
type PlacementDomainKind =
  | "plane"
  | "surface"
  | "volume"
  | "curve"
  | "point-set"
  | "mesh-region";

interface DomainSample {
  position: Vec3;
  frame: Frame3; // tangentX / tangentY / normal を含む直交基底
  domainCoordinates?: readonly number[];
}

interface PlacementDomain {
  id: string;
  revision: string;
  kind: PlacementDomainKind;
  bounds: Bounds3;
  sample(request: DomainSampleRequest): DomainSample | null;
  contains?(point: Vec3): boolean;
  project?(point: Vec3): DomainSample | null;
}
```

曲面で「花がどちらを向くか」を後付けの例外にしない。Normal だけでなく接線二軸を含む Frame を
Domain の観測結果として返す。`Align to Surface`、`Random Rotation`、`Follow Curvature`、
`Follow Field`、`Global Up` は、この Frame をどう解釈するかという配置方針になる。

Domain が返すのは**観測可能な局所座標系**であり、最終的な向きを一意に強制するものではない。

---

## 4. CompositionOperator の共通出力は InstanceSet

巨大な `CompositionEngine.pack()` に機能を足し続けない。Engine は Operator の登録と実行だけを
担当し、各原理は共通契約を実装する。

```ts
interface CompositionOperator<P> {
  readonly type: string;
  readonly version: string;
  execute(input: {
    motifs: readonly MotifDefinition[];
    domain: PlacementDomain;
    parameters: P;
    seed: number;
  }): CompositionResult;
}

interface InstanceSet {
  id: string;
  motifRefs: readonly string[];
  instances: readonly MotifInstance[];
}

interface CompositionResult {
  instanceSet: InstanceSet;
  diagnostics: CompositionDiagnostics;
  provenance: GenerationProvenance;
}
```

```text
Pack ───────┐
Scatter ────┤
Attach ─────┼→ InstanceSet
Aggregate ──┤
Grow ───────┤
WFC ────────┘
```

`InstanceSet` はまだ結合メッシュではない。配置結果を比較・保存・再実行するための軽い正本である。

---

## 5. Collision Proxy、精度、Gap

Collision Proxy は形状本体と分離し、複数解像度を持てるようにする。

| Level | 例 | 役割 |
|---|---|---|
| L0 | Bounding sphere | 最速の粗い探索 |
| L1 | Multi-sphere | Flower の凹凸を残す標準候補 |
| L2 | Convex hull | より正確な外形 |
| L3 | Simplified mesh | 必要な場合だけ使う高精度近似 |

作者向け UI は solver 名を並べず、たとえば `Fast / Balanced / Accurate` として観察結果の精度を
選べる形がよい。ただし、どの Proxy を使ったかは診断と保存結果に必ず残す。

`Gap` / `Clearance` は solver 固有のつまみにしない。

```text
Physical collision proxy
        + clearance inflation
        → effective collision proxy
        → solver
```

こうすれば Pack と Aggregate で Gap の意味が変わらない。Gap は「物理的な形の外側に確保する
余白」であり、使用単位と Proxy revision を生成記録へ保存する。

Kangaroo は PACK-SPIKE の比較・試作 backend として使用してよいが、Core contract に Kangaroo 固有の
型や用語を入れない。Kangaroo → Katachi 独自 solver → GPU solver と置換できる中立データを保つ。

---

## 6. Diagnostics は結果の一部

Packing は「見た目上置けた」だけでは完了しない。未解決の衝突や領域外の個体を結果と一緒に返す。

```ts
interface CompositionDiagnostics {
  convergence: "converged" | "partial" | "failed";
  iterations: number;
  collisionCount: number;
  maxPenetration: number;
  outsideCount: number;
  warnings: readonly string[];
}
```

UI では専門的な全情報を常時見せる必要はない。主表示は、たとえば
`120 motifs / 未解決の衝突 2` とし、詳細を診断欄で開けるようにする。

---

## 7. Deform の前後と Proxy の対応を曖昧にしない

次の二つは意味が違う。

```text
Flower → Stretch → Pack  = 伸びた形で衝突判定して詰める
Flower → Pack → Stretch  = 詰めたあと変形し、衝突が再発しうる
```

したがって、少なくとも次を区別する。

- `PreCompositionTransform`: Composition 前に Shape と Proxy の両方へ反映
- `PostCompositionDeform`: Composition 後に InstanceSet を実体化して変形

すべての Collision Proxy は、対応する `shapeRevision` と `deformationStage` を持つ。後段変形後の
衝突が未検証なら、Geometry Snapshot の診断にその事実を残す。

---

## 8. Immutable Geometry Snapshot と再現性 Contract

Hikari は「現在編集中の Katachi」を直接覗かない。不変な Snapshot を読む。

```ts
interface GeometrySnapshot {
  snapshotId: string;
  revision: string;
  contentHash: string;
  createdFrom: GenerationProvenance;

  // 場を正本にできる Katachi のため、mesh 専用にはしない。
  shapeRefs: readonly SnapshotShapeRef[];
  instances: readonly MotifInstance[];
  materialSlots: readonly string[];
  objectIds: readonly string[];
  semanticTags: readonly string[];
  diagnostics: SnapshotDiagnostics;
}
```

`meshRefs` だけに限定すると、現在の Cloud Sculpt の SDF を一度メッシュへ劣化させてから Hikari へ
渡すことになる。そのため `shapeRefs` は、保存可能な field / procedural / mesh 表現を明示する。
Hikari Adapter が対応できない表現を受けた場合は、黙って近似せず、変換方法と誤差を診断へ残す。

再現性は seed だけでは足りない。各生成段階は生成経路を保存する。

```ts
interface GenerationNodeRecord {
  type: string;
  version: string;
  implementation?: { id: string; version: string };
  parameters: Readonly<Record<string, unknown>>;
  seed?: number;
  inputHashes: readonly string[];
}

interface GenerationProvenance {
  graphVersion: string;
  nodes: readonly GenerationNodeRecord[];
  rootHash: string;
}
```

アルゴリズム更新後も、同じ結果を復元できるか、旧実装が必要か、再現不能なら何が違うかを正直に
判定できることが目的である。

Snapshot の利用モードは将来、次の二つを選べるようにする。

- `Live Link`: Katachi が新しい Snapshot revision を発行するたび Hikari が追随
- `Pinned`: 特定の `snapshotId` / `contentHash` を固定して観察

Live Link も「可変オブジェクトの共有」ではなく、短命な不変 Snapshot が連続して届くものとして扱う。

---

## 9. Hikari 境界

Katachi の Snapshot に `IOR`、`absorption`、`transmission`、`caustics`、`opticalTags` を入れない。

```text
GeometrySnapshot
    shape / instances / transforms / material slots / ids / semantic tags
        ↓
HikariAdapter
        ↓
HikariScene
    optical material / medium / light / receiver / render settings
```

`materialSlots` は光学値ではなく、下流が意味を割り当てるための中立な境界名である。
`semanticTags` も `inside`, `shell`, `support-candidate` のような形態側の意味に限る。

現在の Hikari 正本は `OpticalScene` 内に Shape と OpticalMaterial を同居させている。この文書はそれを
直ちに壊す移行指示ではない。最初の Hikari Adapter が必要になった段階で、既存の ShapeSource を
adapter 出力として包み、保存済み Hikari case の後方互換を保ちながら境界を移す。

---

## 10. 既存 Study との対応

| 既存の実体 | 新語彙での読み方 | 今すぐ行うこと |
|---|---|---|
| Cloud Sculpt の球場 | `ShapeDefinition` の一種 | 移動しない |
| rings の `RingGroup` | Motif / unit の先行例 | PACK-SPIKE 後に契約差を観察 |
| pack の球・雲 unit | Motif と Proxy が混在した先行例 | 書き換えない |
| skin の表面アンカーと Frame | PlacementDomain の先行例 | Frame の不足を観察 |
| interior-growth の coin/ring unit | Operator 入力と Instance の先行例 | 共通化を急がない |
| Hikari の ShapeSource / OpticalScene | Adapter 後の下流契約 | Hikari 正本側で段階移行 |

この対応表は、既存コードを新しい名前に一括改名するための表ではない。PACK-SPIKE と二つ目の実需で
共通Contractの最小形が確定してから、既存の先行例を一つずつ adapter で接続する。

---

## 11. 実装順

```text
PACK-SPIKE（捨ててよい観察）
    ↓
CORE-0
    ↓
MOTIF-0 / DOMAIN-0 / INSTANCE-0
    ↓
COMPOSE-0 / PACK-0
    ↓
SNAPSHOT-0
    ↓
HIKARI-BRIDGE-0
```

1. **PACK-SPIKE**: 3〜4球の Flower と multi-sphere proxy を実際に詰め、単球との違いを並べて見る。
   コードは捨ててよい。まず「面白いか」「衝突の違いが見えるか」を作者が判断する。
2. **CORE-0**: Spike で実際に必要だった最小の型だけを固定する。
3. **MOTIF / DOMAIN / INSTANCE-0**: Flower 固有情報を外し、別 Motif・別 Domain でも同じ契約を通す。
4. **COMPOSE / PACK-0**: Operator 登録、実行、Diagnostics、保存を実装する。
5. **SNAPSHOT-0**: 不変性、hash、生成経路、Pinned 復元を検証する。
6. **HIKARI-BRIDGE-0**: 光学値を Katachi へ逆流させず、Snapshot を現行 Hikari Scene へ変換する。

PACK-SPIKE の具体的な観察条件は
[PACK-SPIKE — Flower multi-sphere packing](../tasks/PACK-SPIKE-flower.md) に分ける。

---

## 12. この段階でやらないこと

- 六語彙の全型を先に実装する
- 既存 Pack / Skin / Rings / Interior Growth を一括で移行する
- Kangaroo を Katachi の必須依存または保存形式にする
- Proxy の L0〜L3 をすべて実装する
- Post-Deform 後の衝突解消を自動で発明する
- Hikari の光学値を Geometry Snapshot に保存する
- 保存済み recipe / Hikari case の互換性を壊す

最初の判断材料は、Flower が画面に並び、単球 proxy と multi-sphere proxy の差を同条件で比較できる
ことである。抽象化の完成度ではない。

---

## 13. 追記: Figure / Ground は Composition と別の軸

2026-08-09 に作者から、Blender で調整した `samples/katachi_260808.stl` とともに次の方向が加わった。

> ここでは丸い穴が開くよりも図と地が反転するような穴が本体なのか表面が本体なのか、
> どちらの形状も等価に扱うような状況を目指している

これは Flower の `Motif + Pack + Rigid/Soft` を置き換える話ではない。Flower は「単位をどう配置し、
互いにどう応答させるか」という Composition の研究であり、Figure / Ground は「場のどちらの相を
本体と呼ぶか」という ShapeDefinition より手前の研究である。二つは直交する軸として並行させる。

場を第一級とする既存方針に合わせ、当面は次の読み方を採る。

```text
Scalar field + finite observation domain
                 │
                 ├─ phase A: f(x) <= iso
                 ├─ interface: f(x) = iso
                 └─ phase B: f(x) >= iso
```

`surface = shape` と固定せず、Surface は二相の境界として扱う。相の反転はメッシュの法線反転ではなく、
同じ場・同じ iso・同じ有限領域に対する phase selection の変更である。詳しい観察と最小 Spike は
[Figure / Ground Duality](katachi-figure-ground-duality-20260809.md) に分ける。
