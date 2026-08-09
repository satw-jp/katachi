# FIGURE-GROUND-SPIKE — 同じ場の二相を横並びに見る

状態: **Flower Packing の観察を止めずに並行検討。まだ実装着手しない。**

参照: [Figure / Ground Duality](../architecture/katachi-figure-ground-duality-20260809.md)

## Question

同じ scalar field と有限領域から A/B 二相を同時に見たとき、片方を「穴」、片方を「本体」と固定せず、
図と地が反転する一つの形として理解できるか。

## First comparison

左右で field / seed / iso / domain を完全に共有する。

- Left: `phase A = f(x) <= iso`
- Right: `phase B = f(x) >= iso` within the same finite domain
- Optional center overlay: shared `interface = f(x) = iso`

最初の field は既存の球場または軽い sampled field を使う。共有STLは目標の質感と位相の参照像であり、
初回 Spike の入力メッシュにはしない。

## Controls

- Seed
- Iso level
- Observation domain size
- Field scale / feature size
- A / B / Interface overlay
- Rotate both views together

## Diagnostics

- field identity / hash
- iso value
- finite-domain bounds
- A/B volume fraction
- interface area（概算でよい）
- connected component count for each phase
- derived mesh resolution and conversion error

## Completion gate

1. A と B が同じ field 由来であることを一画面で確認できる
2. 片側のパラメータだけがずれる操作を作らない
3. domain の外を無限の complement と誤認させない
4. phase swap が法線反転ではなく、領域選択の反転になっている
5. 作者が「穴と表面のどちらも等価に見えるか」を判断できる比較画像を残す
6. 手応えが出た場合だけ Snapshot の phase contract を実装する
