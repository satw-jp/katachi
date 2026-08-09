# PACK-SPIKE — Flower multi-sphere packing（捨ててよい観察）

対象: 実装モデル。着手前に STATEMENT → RESEARCH → AGENTS →
[Composition Core](../architecture/katachi-composition-core-20260809.md) → この文書の順で読む。

状態: **着手可。ただし本番 Core への昇格は禁止。**

---

## Question

> 3〜4球で作った Flower を表面へ詰めたとき、単球の当たり判定よりも
> multi-sphere collision の方が、単位同士の関係を観察する形として面白いか。

この Spike の目的は solver を完成させることではない。Flower の凸凹を衝突判定が覚えていることで、
配置にどんな違いが生まれるかを作者が見て判断できるようにすること。

---

## 比較するもの

同じ Flower、同じ Domain、同じ seed、同じ個数、同じ clearance で二つを横並びにする。

1. **L0 / Single sphere**: Flower 全体の外接球ひとつ
2. **L1 / Multi-sphere**: 花芯 + 3〜4枚の花弁を表す球群

Flower は高精細な花を目指さない。最小の形は次で十分。

```text
      ○
   ○  ●  ○
      ○

● = core sphere
○ = petal proxy sphere
```

描画形と collision proxy を分け、必要なら proxy を半透明または線で重ねて見られるようにする。

---

## Placement Domain

最初は二つだけでよい。

- `Plane`: 平面上への配置。solver 自体の違いを読みやすくする対照群
- `SphereSurface`: 球面上への配置。position + normal + tangent frame を実際に必要とする観察群

SphereSurface の Flower は局所 normal を外向きにする。normal 周りの回転は seed 由来とし、
同じ seed で再現する。

Plane / SphereSurface を一つの汎用 Domain framework に仕上げない。この Spike 内の小さな関数でよい。

---

## Solver

外部依存を追加せず、まず次の素朴な反復でよい。

1. seed 付き乱数で Domain 上に初期配置
2. proxy 球どうしの貫通量を求める
3. Domain の接平面方向へ互いを押し離す
4. Domain 外へ出た位置を射影で戻す
5. 規定回数または最大貫通量の閾値まで反復

Kangaroo 比較を後で行う場合も、Kangaroo 固有データを保存形式にしない。

---

## 操作

初見で触る主要操作は絞る。

- `Place again`（同じ seed なら同じ結果）
- `Seed`
- `Count`
- `Flower size`
- `Clearance`
- `Domain: Plane / Sphere`
- `Show proxies`

専門的な反復回数や tolerance は折りたたんだ診断欄へ置く。

---

## 計器

左右それぞれに、少なくとも次を表示する。

- 配置数
- 反復回数
- 未解決 collision 数
- 最大 penetration
- Domain 外の instance 数
- 使用 proxy（L0 / L1）
- seed

`Packed` と断言するのは、未解決 collision と outside がともに 0 の場合だけ。それ以外は
`部分的に配置` と表示する。

---

## 観察の保存

Spike でも、比較条件と結果を JSON で保存できるようにする。

```ts
interface FlowerPackingSpikeRecord {
  formatVersion: 1;
  studyId: "flower-packing-spike";
  algorithm: { type: "surface-relaxation"; version: string };
  seed: number;
  domain: "plane" | "sphere-surface";
  parameters: Record<string, number | boolean | string>;
  l0: { transforms: unknown[]; diagnostics: unknown };
  l1: { transforms: unknown[]; diagnostics: unknown };
  observation?: string;
}
```

型名と詳細構造は仮でよいが、左右の結果 Transform と Diagnostics を保存し、開き直して同じ比較を
再現できること。これをそのまま本番 `InstanceSet` 形式とは呼ばない。

---

## 実装場所

新しい自己完結 Study とする。

```text
src/studies/flower-packing-spike/
  README.md
  manifest.json
  ...Spike 固有コード
```

入口 HTML と launcher の追加は行ってよい。既存 Pack / Skin / Rings / Interior Growth と共有化せず、
既存 Study を変更しない。共有ファイルを使うための import はよいが、Spike の関数を既存 Study から
import させない。

---

## 完了条件

1. L0 と L1 が同じ条件で横並びになり、違いを一画面で比較できる
2. Plane と SphereSurface の両方で Flower が配置される
3. SphereSurface で各 Flower が局所 Frame に沿って外を向く
4. `Show proxies` で描画形と衝突近似の差を確認できる
5. collision / penetration / outside / iterations が左右別に表示される
6. 同じ seed + parameters で Transform と Diagnostics が再現する
7. JSON 保存→読込で同じ左右比較が戻る
8. 実座標クリックで主要操作を確認し、比較画面のスクリーンショットを残す
9. Study README の Observation と manifest revisits を更新する
10. `npm run build` と既存テストが通る

---

## 作者へ返す判断

実装者は「L1 の方が良い」と決めない。次の判断を比較画像と数値とともに作者へ返す。

- 単球では消える Flower 同士の噛み合い・隙間が、multi-sphere では見えるか
- その違いは面白いか、それとも単に散らかって見えるか
- SphereSurface で向きの流れが感じられるか
- Clearance を増減したとき、形の関係として意味のある変化が見えるか
- L1 の計算増加に見合う観察差があるか

手応えが無ければ Spike は残して終了してよい。手応えがあった場合だけ、実際に必要だった型を
`CORE-0` へ抽出する。
