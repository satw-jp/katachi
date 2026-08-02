# Katachi 版契約 — 同じ「version」で呼ばれている別概念の分離

作成日: 2026-07-26
種別: 版契約（docs-only、番号は一切変更しない）
対象: `/Users/atsushisato/Projects/active/Katachi`（9 Study + launcher + `src/lib/`）
関連文書: [katachi-optimizer-boundary-20260725.md](katachi-optimizer-boundary-20260725.md) /
[katachi-reorganization-plan-20260725.md](katachi-reorganization-plan-20260725.md) /
[katachi-dependency-duplication-map-20260725.md](katachi-dependency-duplication-map-20260725.md)

記法（前提文書と同じ）: **Observed**（コード・ファイルから確認した事実。`path:line` を併記）/
**Inferred**（複数の事実から導いた解釈）/ **Proposed**（将来の案。実装していない）/
**Author decision**（作者が選ぶ事項）/ **未確認**（調べたが確定していない）。

---

## 0. この文書の位置

Gate A で作者が Q8 の推奨案（**package version と各 Study version を別管理し、連動させない**）を
承認済みである。この文書はその承認を受けて、**番号を上げる作業ではなく、意味・正本・更新条件を
固定するもの**である。数値の変更は一件も含まない。

R1〜R3 と R5 は実装・公開済みであり、R5 補正後の公開 Version ID は
`7f1797d6-954b-48e2-a5a4-9807a2fc99bc` である。次に production 実装を増やす前に、
**同じ「version」という語で呼ばれている 9 個の別概念を先に分ける**、というのがこの文書の位置づけである。

**Observed（この文書が埋める空白の範囲）** — 上位の共通標準は「画面のどこに Version / UpdatedAt を
出すか」だけを定めている。`/Users/atsushisato/Projects/docs/project-standards.md:25-33` は表示位置と
「手入力しかない場合は更新ルールを README に残す」ことを求め、
`/Users/atsushisato/Projects/docs/ui-guidelines.md:44-49` は画面内の位置を求め、
`/Users/atsushisato/Projects/AGENTS.md:49` は「Version と UpdatedAt を表示する」と書いている。
**いずれも version が何を意味するかの意味論を定義していない。** したがって本文書は既存規則と
矛盾せず、空いていた側（意味・正本・更新条件）を埋める。

唯一の接点は `project-standards.md:28`「`UpdatedAt` は最終更新やビルド時刻を表示する」である。
これは選択肢を並べた規定であり、Katachi は**そのうち「最終更新」の側を選ぶ**（§3）。
選択の範囲内であって、上位規則への違反ではない。

**Inferred** — AGENTS.md §1「正直な計算 / 分からないものを分かった顔で表示しない」を版表示にも
適用すると、「v0.1.0」という一つの文字列が何の版なのか読めない状態は、それ自体が不正直な表示である。
launcher が共有 `createVersionRow()` を使わず文言を明示的に組んでいるのは、この判断が
すでにコード側に一度現れた例である（`src/instrument/launcher/main.ts:93-95` のコメント）。

---

## 1. 用語表（9概念）

| 概念 | 何を識別するか | 正本（path付き） | 何を契機に変わるか | 何を契機にしても自動では変わらないか | 過去値との比較方法 |
|---|---|---|---|---|---|
| package version | Katachi 全体の公開アプリ／配布物の版ラベル | `package.json:4` | 作者が明示した release task | Study 更新・docs 変更・deploy・launcher 変更 | 文字列比較（SemVer 順序は宣言しない、§2） |
| Study manifest version（+`updatedAt` / `revisits`） | その Study 固有の研究・道具の節目 | 各 `src/studies/<name>/manifest.json:5`（`updatedAt` は `:7`） | 作者が「Study の節目」と承認したとき | package version の変更・他 Study の更新・共有 Library 内部移動のみの変更 | `revisits` 配列の追記履歴（append-only、§3） |
| recipe formatVersion | recipe JSON の読み書き構造と互換性 | 各 Study の serializer / parser（共有封筒は `src/lib/recipe.ts:2`） | 旧構造を現 parser が意味を保って読めず、明示 migration が必要になったとき | optional field 追加・既定値追加・構造検出 migration | 現状は比較していない（§4 Observed） |
| algorithmVersion | 同じ入力から結果を作る生成アルゴリズムの意味 | `src/studies/interior-growth/growth.ts:914`（現行）／`:916`（旧値の識別用） | 受理・score・接続・探索規則が変わり、同 seed/params でも意味の異なる結果になるとき | 単なる高速化（byte / 意味が同じ場合）・UI 変更・package 変更 | 保存済み結果の `algorithmVersion` 文字列の一致（§5） |
| provenance の版 | 生成物 1 件を作った道具側の識別 | interior-growth: `src/studies/interior-growth/meshExport.ts:397`（独立定数）／skin: `src/studies/skin/main.ts:1064`（manifest への参照） | interior-growth: 手で定数を書き換えたとき／skin: manifest の `version` を上げたとき | interior-growth は manifest 更新では変わらない（`0.2.0` のまま） | 保存済み JSON 内の値の直接比較（意味が 2 Study で揃っていない、§6） |
| launcher updated date | launcher 面の更新日 | `src/instrument/launcher/main.ts:35` | launcher の表示・情報構造・catalog の読み方が変わったとき | Study 本体だけの変更・package version の変更 | 日付比較（launcher 独自 semver は作らない、§7） |
| Cloudflare deployment Version ID | 公開インフラが発行する deployment identity | Cloudflare 側（リポジトリ内に正本を持たない） | deploy を実行したとき（同一 source の再 deploy でも新規発行） | source を変えないこと・version 番号を上げないこと | ID の一致／不一致のみ。ファイル互換性は表さない（§8） |
| SHA-256 | 保存された exact bytes の同一性 | `src/lib/hash.ts:34-40`（算出）／保存先は各 provenance フィールド | hash 対象の bytes が 1 byte でも変わったとき | version 番号の上げ下げそのもの | hex 文字列の完全一致。version ではない（§9） |
| STL / OBJ header branding | 生成ファイルの producer note / branding | `src/studies/cloud-sculpt/meshExport.ts:811`（STL）／`:792`（OBJ） | 作者がブランド文字列を変更したとき（Q9、未決） | version 番号の変更 | 文字列比較。変更すると geometry 同一でも SHA-256 が変わる（§10） |

**Inferred** — 表の 9 行のうち、**SemVer 形式の `x.y.z` を名乗っているのは 3 行だけ**
（package version / Study manifest version / interior-growth の provenance `toolVersion`）であり、
残り 6 行は整数リテラル・命名文字列・日付・UUID・hex・ブランド文字列である。
「version」という一語がこの 6 行まで覆っていたことが、混同の原因である。

---

## 2. package version

**契約**

- package version は **Katachi 全体の公開アプリ／配布物の版ラベル**である。個々の Study の
  研究進捗を表す数値ではない。
- 正本は `package.json` の `version` フィールド 1 箇所のみ。他のどのファイルもこの値を複製しない。
- Study version との間に**数式的な対応も自動連動も無い**。「最大の Study version を採る」
  「Study 数を minor に入れる」といった規則は存在せず、作らない。
- Study の更新・docs の変更・deploy のたびには**自動で上げない**。
- 上げるのは**作者が明示した release task のときだけ**である。
- 未承認の SemVer 閾値を発明しない。「破壊的変更だから major」等の判定基準は、この文書では
  決めていない（§12）。
- launcher は package version を import して表示するが、値を**複製しない**。

**Observed**

| 事実 | 引用元 |
|---|---|
| `"version": "0.1.0"` | `package.json:4` |
| launcher は import 経由でのみ読む | `src/instrument/launcher/main.ts:24` — `import { version as packageVersion } from "../../../package.json";` |
| 表示文字列は launcher が独自に組む | `src/instrument/launcher/main.ts:101` — `` `Katachi package v${packageVersion} · launcher updated ${LAUNCHER_UPDATED_AT}` `` |
| リテラル焼き込みをテストが禁止 | `src/lib/studies.test.ts:202-223` — package.json の実値が引用符付きで launcher ソースに含まれないことを assert する（テスト名: 「launcher reads the package version by import, not by hand-copied literal」） |
| root README は Q8 承認を記録し、意味・正本・更新条件を本文書へ委ねている | `README.md:27-30` |

**Observed（連動の不在を示す偶然の一致）** — `foam` / `gravity` / `rings` の manifest version は
`0.1.0` であり（`src/studies/foam/manifest.json:5`, `src/studies/gravity/manifest.json:5`,
`src/studies/rings/manifest.json:5`）、package version の `0.1.0` と文字列として一致する。
これは意味的連動ではなく、当該 3 Study が初版から上がっていないことによる**偶然の一致**である
（他 6 Study は 0.2.0〜0.13.0 とばらばら、§3 の表）。

**Inferred** — `studies.test.ts` の禁止テストが存在することは、二重正本の危険が過去に一度
自覚されたことを示す。この文書はその判断を文章側に固定するだけであり、テストを変更しない。

---

## 3. Study manifest version / updatedAt / revisits

**契約**

- Study manifest の `version` は、**その Study 固有の研究・道具の節目**を識別する。
- 正本は各 `src/studies/<name>/manifest.json` である。root `README.md` の表や
  `docs/architecture/` の記述は導出物であり、正本ではない。
- package version とは独立である。package version を上げても Study version は動かず、
  逆も動かない。
- **他 Study の更新では変えない。** 9 Study は互いに独立した番号空間を持つ。
- 共有 Library への内部移動だけで、その Study の**観察可能な振る舞いが同じなら自動では上げない**。
- 上げるのは、作者が「これはこの Study の節目である」と承認したときだけである。
- 現在の `x.y.z` という形から**厳密な SemVer 互換性を推測しない**。番号は節目の通し番号として
  読み、「0.13.0 は 0.12.x と後方互換」等を意味しない。
- `updatedAt` は **その Study へ反映された変更の日付**である。build 時刻でも deploy 時刻でもない。
- version を上げない revisit であっても、**作者向けの表示・操作・生成結果・記録契約が変わったなら
  `updatedAt` は更新候補**である。
- 過去の `updatedAt` の値は今回まとめて直さない。
- `revisits` は **append-only の実測・変更記録**である。version 番号の代用ではなく、
  過去の Observation を書き換えない。

**Observed（実測値、2026-07-26 時点）**

| Study | version | updatedAt | revisits 件数 | status | 引用元 |
|---|---|---|---:|---|---|
| cloud-sculpt | 0.2.0 | 2026-07-17 | 10 | active | `src/studies/cloud-sculpt/manifest.json:5,7,16` |
| gravity | 0.1.0 | 2026-07-17 | 6 | active | `src/studies/gravity/manifest.json:5,7,16` |
| sag | 0.2.0 | 2026-07-17 | 7 | active | `src/studies/sag/manifest.json:5,7,17` |
| mpm | 0.3.0 | 2026-07-17 | 10 | active | `src/studies/mpm/manifest.json:5,7,24` |
| foam | 0.1.0 | 2026-07-17 | 6 | active | `src/studies/foam/manifest.json:5,7,18` |
| rings | 0.1.0 | 2026-07-17 | 7 | active | `src/studies/rings/manifest.json:5,7,22` |
| pack | 0.4.0 | 2026-07-17 | 9 | active | `src/studies/pack/manifest.json:5,7,40` |
| skin | 0.13.0 | 2026-07-20 | 22 | active | `src/studies/skin/manifest.json:5,7,36` |
| interior-growth | 0.5.0 | 2026-07-25 | 11 | active | `src/studies/interior-growth/manifest.json:5,7,35` |

**Observed（画面表示の共有形式）** — 9 Study すべてが共有 `createVersionRow(version, updatedAt)` を
使い、出力形式は `` `v${version} · updated ${updatedAt}` `` である
（`src/lib/ui/version.ts:4`）。呼出は
`cloud-sculpt/ui.ts:124`, `gravity/ui.ts:110`, `sag/ui.ts:117`, `mpm/ui.ts:158`,
`foam/ui.ts:105`, `rings/ui.ts:98`, `pack/ui.ts:184`, `skin/ui.ts:234`,
`interior-growth/ui.ts:567`（すべて `src/studies/` 配下）。
launcher はこの関数を使わない（§7）。

**Observed（既知の drift、この文書では直さない）** — `interior-growth` の manifest `title` に
一時状態の但し書きが残っている:
`src/studies/interior-growth/manifest.json:3` は
`"内部から育つネットワーク (Interior Growth, S2.1 audit-fix — 構造修正済み・coverage最低合格は依然未達)"`
であり、他 8 件の `名前 (English name)` という形から外れている。この矛盾は
`README.md:32-35` に既に注記されており、記録の誤りではなく**正確に記録された既知の drift** である。
**この文書ではこれを修正しない**（§12 に未決事項として残す）。

**Observed（他文書の行番号 drift）** — `docs/architecture/katachi-optimizer-boundary-20260725.md:117`
は interior-growth の `TOOL_VERSION` を `meshExport.ts:394` と引用しているが、現在のソースでは
`:397` である（§6）。既存文書の引用行が実ファイルからずれている実例であり、
**この文書はどの数値も既存 docs から写さず、実ファイルから取っている**。

---

## 4. recipe formatVersion

**契約**

- `formatVersion` は **recipe JSON の読み書き構造と互換性**を識別する。
- Study version でもなく、algorithm version でもない。3 つは別の番号空間である。
- 現在の正本は**各 Study の serializer / parser 実装**である。単一の中央定義は存在しない。
- optional field の追加・既定値の導入・構造検出による migration で旧 recipe を安全に読めるなら、
  **機械的には上げない**。
- 旧構造を現在の parser が意味を保って読めず、明示 migration が必要になる変更のときに
  更新を検討する。
- 上げるときは、**parser が旧 version をどう扱うかをテストで固定する**。番号だけ上げて
  分岐を書かない、という上げ方をしない。
- `studyId` は version ではなく**所属識別子**である。`exportedAt` は**生成時刻**であり版ではない。

**Observed（共有封筒を通す Study は 2 つだけ）** — 共有封筒 `src/lib/recipe.ts` を使うのは
**cloud-sculpt と interior-growth の 2 Study のみ**である。残り 7 Study は同形の envelope 型を
自前で定義している（例: `src/studies/gravity/history.ts:32`, `src/studies/skin/history.ts:62`）。
foam のシリアライザ関数名は `serializeFoamRecipe` であり
（`src/studies/foam/history.ts:104`）、他が使う `serializeRecipe` という命名から外れている。

**Observed（重要 — import 側は formatVersion を一度も検証していない）** — `formatVersion` は
export 時にリテラル `1` として書き込まれ、型フィールドとしても宣言されているが、
**リポジトリ内のどの import 経路もこの値を何かと比較していない**。
`rg -n 'formatVersion' src/` の結果は、型宣言 `formatVersion: 1;` と書込 `formatVersion: 1,` の
2 種のみで、読み取り・比較・分岐は 1 件も存在しない
（宣言: `src/lib/recipe.ts:2`, `src/studies/skin/history.ts:62`, `src/studies/gravity/history.ts:32` ほか。
書込: `src/lib/recipe.ts:14`, `src/studies/foam/history.ts:106`, `src/studies/skin/history.ts:200` ほか）。
共有 parser は構造だけを見る:

```
export function parseRecipeEntries<Entry>(text: string): Entry[] {
  const data = JSON.parse(text) as Partial<RecipeEnvelope<string, Entry>> | Entry[];
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.entries)) return data.entries;
  throw new Error("認識できないレシピ形式です（entries 配列が見つかりません）");
}
```
（`src/lib/recipe.ts:27-32`。関数コメント `:22-26` が
「Study/version validation stays deliberately outside this shared structural parser」と明記）

**したがって、現在の `formatVersion` は実質 label であり、互換性の実効ゲートではない。**
recipe 互換性は完全に、構造検出（structure detection）と optional field の既定値化
（optional-field defaulting）だけで成立している。これは欠陥の告発ではなく、
**この番号を上げても、上げるだけでは何も起きない**という運用上の事実の記録である。

**Observed（formatVersion を 1 のまま構造検出／既定値で移行している実例）**

**(a) 全 Study 共通 — bare 配列 vs wrapped envelope の構造判定**

上に引用した `src/lib/recipe.ts:27-32` がそれである。`data.formatVersion` も `data.studyId` も
参照されない。同一パターンが各 Study の自前 parser にも複製されている
（例: `src/studies/gravity/history.ts:135-140`, `src/studies/skin/history.ts:208-213`）。

**(b) interior-growth — キーの不在で旧 envelope 形状を検出**

```
function isLegacyEnvelope(raw: unknown): raw is LegacyEnvelopeShape {
  return !!raw && typeof raw === "object" && !("supportThresholdAngleDeg" in raw);
}
```
（`src/studies/interior-growth/history.ts:132-134`）

さらに `src/studies/interior-growth/history.ts:177` の
`const hasS21Fields = "algorithmVersion" in (raw as object);` が `algorithmVersion` キーの不在で
S2.1 未満の結果を検出し、`:222` の `algorithmVersion: "legacy-pre-s2.1",` でバックフィルする。
この間 `formatVersion` は `1` のままである。同ファイルのコメント `:118-122` が理由を明記している:
「no separate schema-version field was ever added to the shared RecipeEnvelope wrapper」。

**(c) skin — `shape` フィールド欠落を `"coin"` に既定**

```
// shape fallback (?? "coin") keeps pre-T11 recipes (recorded before
// Patch had a `shape` field) replayable without change.
state.patches = op.args.patches.map((p) => ({
  id: p.id,
  shape: p.shape ?? "coin",
  points: p.points.map((pt) => ({ ...pt })),
}));
```
（`src/studies/skin/history.ts:126-131`。同パターンが `addPatch` 側 `:138` にも）

**Observed（mpm の意図的なクロス Study 書き出し）** — `src/studies/mpm/history.ts:176-182` の
`serializeFrozenAsS1Recipe` は `studyId: "cloud-sculpt"` を書き出す（`:181`）。
コメント `:175`「Export the latest frozen result in S1's own recipe format」により意図的と読める。
`studyId` が version ではなく所属識別子であることの実例である。
**Observed（2026-07-26 実測）**: この書き出しを S1 経由で読み込む**自動テストは存在しない**。
リポジトリの test source は5ファイルだけで（`rg --files src -g '*.test.ts'` の実測）、
`serializeFrozenAsS1Recipe`（呼出は `src/studies/mpm/main.ts:427`, `:479`）を通るものは1件も無い。往復確認は mpm manifest の revisit note が記録する手作業である。

---

## 5. algorithmVersion

**契約**

- `algorithmVersion` は **同じ入力から結果を作る生成アルゴリズムの意味**を識別する。
- UI の版でも、package version でも、recipe envelope の版でもない。
- **deterministic replay や旧結果の意味を区別する必要がある Study でだけ持つ。**
- 受理条件・score・接続規則・探索規則が変わり、**同じ seed / params でも意味の異なる結果を
  生む**場合に更新候補となる。
- 単なる高速化で出力 byte も意味も同じなら、自動では変えない。
- **全 Study へ空の抽象化として一括導入しない。** 2 Study 目に実需が出るまで昇格させない
  （AGENTS.md §1「道具は研究の堆積物」）。

**Observed**

| 定数 / 値 | 引用元 | 現在の役割 |
|---|---|---|
| `O2_ALGORITHM_VERSION = "connected-base-multisource-o2"` | `src/studies/interior-growth/growth.ts:914` | 現行。全書込箇所がこの値を使う（`growth.ts:1125`, `growth.ts:1929`） |
| `S21_ALGORITHM_VERSION = "surface-colonization-s2.1"` | `src/studies/interior-growth/growth.ts:916` | **書込には使われていない。** 直前のコメント `:915`「Kept exported for provenance/tests that need to recognise the previous algorithm's own results.」の通り、旧結果を識別するためだけに残っている |
| `"legacy-pre-s2.1"` | `src/studies/interior-growth/history.ts:222` | S2.1 未満の結果へのバックフィル値 |

**Observed（格納先）** — 値は recipe と provenance の両方に載る。recipe 側は
`generateCandidates` op 内の `GrowthResult`（`src/studies/interior-growth/history.ts:258-268`）、
provenance 側は `GrowthMetrics`（`src/studies/interior-growth/growth.ts:2702` の interface フィールド、
`:2783` で `result.algorithmVersion` からコピー）が `CandidateProvenance.metrics`
（`src/studies/interior-growth/meshExport.ts:361` 付近）として間接的に埋め込まれる形である。

**Observed（他 8 Study には存在しない）** — `algorithmVersion` という語は interior-growth 以外の
どの Study のソースにも 1 件も出現しない（cloud-sculpt / gravity / sag / mpm / foam / rings /
pack / skin。`rg` で確認済み）。

**Inferred** — したがって algorithmVersion は「9 Study の共通契約」ではなく、
「1 Study が必要に応じて持った局所的な識別子」である。この非対称は現時点で正しい状態であり、
揃えることを目的に他 8 Study へ導入しない。

---

## 6. provenance の版

### 6.1 Observed — 2 Study で意味が揃っていない

隠さず記録する。同じ「provenance 内の道具の version」という役割に対して、
**正本の所在が異なる 2 つの設計が併存している。**

| Study | 実体 | 引用元 | 正本の所在 |
|---|---|---|---|
| interior-growth | `const TOOL_VERSION = "0.2.0";` → `toolVersion: TOOL_VERSION,`（書込 `:569`、型宣言 `:330`） | `src/studies/interior-growth/meshExport.ts:397` | **ソースコード中の独立したハードコード定数。** manifest の `0.5.0`（`src/studies/interior-growth/manifest.json:5`）とは別物であり、manifest を更新しても動かない |
| skin | `tool: { name: "Katachi S-skin", version: manifest.version, updatedAt: manifest.updatedAt },` | `src/studies/skin/main.ts:1064` | **manifest version への生きた参照。** `manifest` は `src/studies/skin/main.ts:17` の `import manifest from "./manifest.json";`。manifest の `version` を上げれば次回書き出しに即座に反映される |

**未確認** — interior-growth の `TOOL_VERSION` が `0.2.0` のまま manifest の `0.5.0` と乖離している
経緯、および「いつこの定数を上げるべきか」の運用ルールは、コードにもコメントにも見当たらない。
`docs/architecture/katachi-optimizer-boundary-20260725.md:281` に未決事項として記載があるだけであり、
本文書もこれを未決のまま引き継ぐ。

**Inferred** — この 2 設計の差は、生成物どうしを比較するときに実害を生む。同じ日に書き出した
2 つの provenance JSON を見ても、片方の version は Study の節目を指し、もう片方は
「誰かが最後に定数を書き換えた時点」を指す。どちらも `version` という名前で並ぶ。

### 6.2 Proposed（未実装）— 目標語彙

**以下は将来の語彙案であり、実装していない。** 現在のどのファイルもこの形をしていない。

| Proposed field | 意味 | 対応する現在の概念 |
|---|---|---|
| `provenanceFormatVersion` | provenance JSON 自身の構造の版 | 現在存在しない |
| `studyId` | どの Study が作ったか | Study manifest の `id` |
| `studyVersion` | その Study の節目（§3） | Study manifest の `version` |
| `packageVersion` | Katachi 配布物の版（§2）。producer app version が必要な場合だけ | `package.json:4` |
| `algorithmVersion` | 生成規則の意味（§5）。**その Study が持つ場合だけ** | interior-growth のみ |
| `generatedAt` | 生成時刻 | interior-growth `generatedAt`（`meshExport.ts:330` 付近の interface）／skin `generatedAt`（`main.ts:1063`） |

**このタスクで明示的にしないこと**

- field の追加・rename・migration を**実装しない**。
- 既存の `toolVersion` を「最初から同じ意味だった」ことに**しない**。それは
  interior-growth のハードコード定数であり、上表の `studyVersion` でも `packageVersion` でもない。
- 過去に書き出された provenance を**書き換えない**。
- 既存値は **legacy producer tag** として扱い、比較条件を限定する。`toolVersion` の一致は
  「同じ Study の同じ節目で作られた」ことを意味しない。
- production 移行は**独立した指示書にする**。この文書は語彙を並べるところで止まる。

---

## 7. launcher updated date

**契約**

- launcher updated date は **launcher 面の更新日**である。package version でも Study version でもない。
- launcher の**表示・情報構造・catalog の読み方**が変わったときに更新する。
- **Study 本体だけの変更では更新しない。** 各 Study の版は各 `manifest.json` が正本である。
- **launcher 独自の semver は作らない。** 持つのは更新日だけである。

**Observed**

| 事実 | 引用元 |
|---|---|
| `const LAUNCHER_UPDATED_AT = "2026-07-26";` | `src/instrument/launcher/main.ts:35` |
| 更新規則がソースのコメントに既に書かれている | `src/instrument/launcher/main.ts:30-34` — 「launcher の表示・情報構造・catalog の読み方を変えたらこの日付を上げる。Study 側の変更では上げない…launcher 独自の semver は作らない。持つのは更新日だけ。」 |
| 共有 `createVersionRow()` を意図的に使わない | `src/instrument/launcher/main.ts:93-95` のコメント — 「`createVersionRow()` をそのまま使うと `v0.1.0 · updated …` になり、何の版なのかが読めない」。CSS クラス `"version-row"` だけを共有し、文言は独自に組む（`:101`） |
| 定義箇所が 1 箇所であることをテストが固定 | `src/lib/studies.test.ts:225-235` — `LAUNCHER_UPDATED_AT` の定義が正確に 1 件、日付リテラルも 1 件のみであることを assert |

**Inferred** — この節の契約は新規発明ではなく、すでにソースコメントとテストとして存在する規則を
文書側へ写したものである。したがってコードを変更する必要がない。

---

## 8. Cloudflare deployment Version ID

**契約**

- deployment Version ID は **公開インフラが発行する deployment identity** である。
- package / Study / recipe / provenance のどの version でもない。リポジトリ内に正本を持たない。
- **deploy ごとに変わる。** 同じ source を再 deploy しても新しい ID が発行される。
- 公開状態の追跡（今どの deploy が出ているか）には使える。
- **ファイル互換性を表さない。** ID が違うことは recipe や STL の互換性が変わったことを意味せず、
  ID が同じことは生成結果が同じであることを保証しない。
- この ID を package version や Study version へ写さない。

**Observed** — R5 補正後の最新公開 Version ID は `7f1797d6-954b-48e2-a5a4-9807a2fc99bc` である
（Cloudflare の deployment 一覧から取得。リポジトリ内には記録されていない）。

**Inferred** — この ID は「作者が今ブラウザで見ている画面がどの deploy か」を突き合わせるための
値である。AGENTS.md §3 終了時 5 の公開確認（https://katachi.a-8c3.workers.dev/ での確認）で
参照する対象であり、版契約の側の番号ではない。

---

## 9. SHA-256

**契約**

- SHA-256 は **exact bytes の同一性**であって version ではない。順序も大小もない。
- geometry が同じでも STL header が変われば hash は変わる（§10）。
- version が同じでも保存内容が違えば hash は違う。
- **recipe の hash / STL の hash / provenance の hash を混同しない。** 何の bytes を取ったかを
  常に併記する。
- hash が一致することは「同じ bytes」を意味するだけであり、「同じ意味の形」を意味しない。

**Observed（算出関数）**

```
export async function sha256Hex(data: ArrayBuffer | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```
（`src/lib/hash.ts:34-40`。R2 で skin と interior-growth の private 実装 2 件を Library へ統合した
経緯がコメント `:1-21` に記録されている）

**Observed（何の bytes を hash して、どこへ保存しているか）**

| 呼出箇所 | hash 対象 | 保存先 |
|---|---|---|
| `src/studies/skin/main.ts:1046` — `sha256Hex(bytesA)` / `sha256Hex(bytesB)` | partition A / B 片の **STL バイナリ**（同行で `encodeBinaryStl` から生成） | `outputStl.partA.sha256` / `outputStl.partB.sha256`（`src/studies/skin/main.ts:1054-1061` の `outputStl` 経由で provenance JSON へ、`:1083`） |
| `src/studies/skin/main.ts:1200` — `sha256Hex(text)` | インポートした **recipe ファイルのテキスト全体**（バイナリではなく文字列） | `importedRecipeSha256`（宣言 `:118`）→ `inputRecipe: { filename, sha256 }`（`src/studies/skin/main.ts:1082`） |
| `src/studies/interior-growth/meshExport.ts:640` — `sha256Hex(buffer)` | 保存対象 **STL のバイナリ**（`saveCandidateStl` 内） | 戻り値が `src/studies/interior-growth/main.ts:394` で `provenance.savedStlSha256 = sha256` として代入（型宣言 `meshExport.ts:391`、初期値 `null` は `:604`） |

**Observed** — 3 件のうち skin の `inputRecipe.sha256` だけが**テキスト**の hash であり、
残り 2 件は STL バイナリの hash である。理由は `src/lib/hash.ts:26-29` のコメントに明記されている。
同じ `sha256` という field 名で並ぶが、対象の種類が違う。

---

## 10. STL / OBJ header

**契約**

- STL / OBJ の header 文字列は **branding / producer note** であって版契約ではない。
- 変更すると **geometry が同じでも bytes が変わり、SHA-256 が変わる**（§9）。したがって
  header の変更は「表示だけの変更」ではない。
- header 文字列に version 番号を埋め込む設計を、この文書では採らない（未検討）。

**Observed**

| 実体 | 引用元 |
|---|---|
| STL バイナリ先頭 84 byte ヘッダ: `` `Yohaku Cloud Sculpt ${name}`.slice(0, 80) `` | `src/studies/cloud-sculpt/meshExport.ts:811`（`encodeBinaryStl` 内、`:808-` ） |
| OBJ テキストのコメントヘッダ: `"# Yohaku Cloud Sculpt OBJ"` | `src/studies/cloud-sculpt/meshExport.ts:792`（`encodeObj` 内。続く 2 行は `` `# triangles ${...}` ``（`:793`）と `` `# scale ${...} mm/source-unit` ``（`:794`）） |

**Observed（唯一の実装を他 Study が import している）** — この `encodeBinaryStl` / `encodeObj` は
cloud-sculpt にある唯一の実装であり、以下が独自ヘッダを持たずそのまま再利用している:
foam（`src/studies/foam/meshExport.ts:13` import, `:57` 呼出）、
rings（`src/studies/rings/meshExport.ts:18`, `:71`）、
pack（`src/studies/pack/meshExport.ts:34`, `:184`）、
skin（`src/studies/skin/meshExport.ts:23`, `:132`）、
interior-growth（`src/studies/interior-growth/meshExport.ts:11` import、再エクスポート `:622` 経由で
`saveCandidateStl` などが使用）。
mpm は STL の **export をしない**（import のみ、`src/studies/mpm/stlImport.ts`。同ファイル `:65-66` の
コメントが cloud-sculpt の `encodeBinaryStl` と同じレイアウトを前提にパーサーを書いていることを明記）。
**Observed（呼出元の全数、実測 2026-07-26）** — `rg -n "encodeBinaryStl" src/`（テスト除外）で
数えると、実際に呼び出しているのは **6 Study** である: cloud-sculpt 自身
（`src/studies/cloud-sculpt/meshExport.ts:862`）、foam（`:57`）、rings（`:71`）、pack（`:184`）、
skin（`src/studies/skin/meshExport.ts:132` と `src/studies/skin/main.ts:1044-1045` の partition 2 部品）、
interior-growth（`src/studies/interior-growth/meshExport.ts:639`）。
**gravity と sag は STL を一切書き出さない**（両 Study に `meshExport.ts` が無く、
`src/studies/gravity/` `src/studies/sag/` 内に `encodeBinaryStl` の呼出も STL 書き出しコードも
存在しない。sag は README でのみ STL に言及する）。mpm は import のみ。

**Inferred（先行文書との数の差）** — 「`encodeBinaryStl` は7 Studyが共有する」と読める箇所が
先行文書に4つある: `katachi-reorganization-plan-20260725.md:148`（STL/OBJ ヘッダ行）・`:216`
（STL 書き出しの Study 数）・`:330`（§7.4 制作段階の表、mpm を列挙）・
`katachi-dependency-duplication-map-20260725.md:449`（drift 行10）。上の実測では **6 Study** である。
差の1件は mpm を書き出し側に数えたことによると読める（mpm は `stlImport.ts` で読むだけ）。
先行文書の記述はその時点の記録として残し、各該当箇所には日付つき Follow-up を置いた。
**Q9 の production 影響範囲は 6 Study として数える。**
なお `katachi-optimizer-boundary-20260725.md:115` の形式表は初版から「Katachi 6 Study」であり、
先行文書のうちこの1件だけは最初から実測と一致していた。

**Observed（素朴な grep が7に見える理由）** — `rg -n "encodeBinaryStl" src --glob '*.ts'` には
`src/studies/interior-growth/growth.test.ts:2025`, `:2032` の**テスト呼出**も含まれる。
production 影響範囲を数えるときはこれを除く。

**Author decision（この文書の範囲外）**

- **Q9 は引き続き独立した作者判断**である。この文書では `Yohaku Cloud Sculpt` を変更しない。
- **Q8 を文書化したことは Q9 変更の自動承認ではない。** 版の語を分けたことと、
  ブランド文字列を変えることは別の決定である。

---

## 11. 更新判断表

行 = 変更イベント、列 = 各概念。表の語は §2〜§8 の契約と同じ意味で使う。

| 変更イベント | package | Study manifest version | updatedAt / revisits | recipe formatVersion | algorithmVersion | provenance schema | launcher date | deployment ID |
|---|---|---|---|---|---|---|---|---|
| architecture docs のみ | 自動変更なし | 自動変更なし | 自動変更なし | 自動変更なし | 自動変更なし | 自動変更なし | 自動変更なし | 自動変更なし（deploy しない） |
| launcher の文言・情報構造の変更 | 自動変更なし（release 時のみ） | 自動変更なし | 自動変更なし | 自動変更なし | 自動変更なし | 自動変更なし | **更新** | deploy 時に新規 |
| Study の UI だけの変更 | 自動変更なし（release 時のみ） | 作者判断 | **更新候補**（作者向け表示が変わったため） | 自動変更なし | 自動変更なし | 自動変更なし | 自動変更なし | deploy 時に新規 |
| 生成 algorithm の変更（同 seed で意味の異なる結果） | 自動変更なし（release 時のみ） | 作者判断（節目なら上げる） | **更新候補** | 自動変更なし（構造が同じなら） | **更新候補** | 自動変更なし（field を増やさない限り） | 自動変更なし | deploy 時に新規 |
| recipe の互換追加（optional field / 既定値） | 自動変更なし（release 時のみ） | 作者判断 | **更新候補** | 自動変更なし（構造検出／既定値で読めるなら） | 自動変更なし | 自動変更なし | 自動変更なし | deploy 時に新規 |
| recipe の破壊的変更（明示 migration が必要） | 自動変更なし（release 時のみ） | 作者判断 | **更新候補**（記録契約が変わったため） | **更新候補**（＋旧 version の扱いをテストで固定） | 自動変更なし | 作者判断 | 自動変更なし | deploy 時に新規 |
| provenance field の追加 | 自動変更なし（release 時のみ） | 作者判断 | **更新候補**（記録契約が変わったため） | 自動変更なし | 自動変更なし | **更新候補**（Proposed 語彙は §6.2、未実装） | 自動変更なし | deploy 時に新規 |
| 同じ source を再 deploy | 自動変更なし | 自動変更なし | 自動変更なし | 自動変更なし | 自動変更なし | 自動変更なし | 自動変更なし | **deploy 時に新規** |

**この表は判断の出発点であって自動化規則ではない。** 「更新候補」は作者へ提示する項目であり、
AI が自律的に番号を書き換える許可ではない。「作者判断」は判断そのものを作者へ返す。

また、**「どれかを変更したら全部を同時に上げる」という対応規則は作らない。** 9 概念は独立した
番号空間であり、同時に動くことに意味はない。同時に上げれば、後から「何が変わったから
どの番号が動いたのか」を読み取れなくなる。

---

## 12. 未決事項

この文書は以下を**決めていない**。決めたふりをしない。

| 未決事項 | 開いたままにする理由 |
|---|---|
| package version の major / minor / patch 基準 | 作者が明示していない。未承認の SemVer 閾値を発明しないため（§2）。次の release task で作者が決める |
| Study version の major / minor / patch 基準 | 現在の 9 Study の番号（0.1.0〜0.13.0）は節目の通し番号として付いており、遡って基準を当てはめると過去の値の意味を書き換えることになる（§13） |
| provenance 語彙の production 統一 | §6.2 は Proposed のみ。field 追加・rename・migration を実装していない。2 Study の意味の差は現状のまま残っており、移行は独立した指示書が必要 |
| Q9（STL / OBJ ヘッダのブランド文字列） | 独立した作者判断であり、Q8 の文書化はその承認ではない（§10）。変更すると geometry 同一でも SHA-256 が変わるという副作用も未検討 |
| interior-growth manifest `title` の drift 修正 | 既知の drift として `README.md:32-35` と本文書 §3 に記録済み。修正は Study 側の変更にあたり、この docs-only タスクの範囲外 |
| ~~gravity / sag の `encodeBinaryStl` 呼出箇所~~ → **解消（2026-07-26 実測）** | 両 Study は STL を書き出さない。呼出元は 6 Study で全数確定した（§10 Observed）。先行文書の「7 Study」との差も §10 に記録した |
| interior-growth `TOOL_VERSION` が `0.2.0` のまま乖離している経緯 | **未確認**（§6.1）。コードにもコメントにも運用ルールが無く、`katachi-optimizer-boundary-20260725.md:281` にも未決として残っている |
| ~~mpm の `serializeFrozenAsS1Recipe` 出力を S1 が読むテストの有無~~ → **解消（2026-07-26 実測）** | **自動テストは存在しない。** リポジトリの test source は**5ファイル**（`src/lib/studies.test.ts`、`src/studies/interior-growth/growth.test.ts`、`src/studies/skin/` の3件 = `partition` / `partitionTutorial` / `coinBulge`）で、`serializeFrozenAsS1Recipe`（`src/studies/mpm/history.ts:176`、呼出は `main.ts:427` と `:479`）を通るものは1件も無い。`src/studies/mpm/manifest.json` の revisit note が記録している往復確認は**ブラウザでの手作業**である。この cross-Study 書き出しは自動退行検知の外にある |

---

## 13. この文書が主張していないこと

- **番号の意味を遡って再定義しない。** 現在 9 Study に付いている 0.1.0〜0.13.0 という値が、
  §3 の契約に従って付けられたことにはしない。契約は今日以降の判断に適用される。
- **過去の保存物が現在の契約に従っていたことにしない。** すでに書き出された recipe / STL /
  provenance JSON の中の version 値は、当時の実装が書いた値そのままであり、
  §6.2 の Proposed 語彙で解釈できるとは主張しない。
- **SemVer 準拠を宣言しない。** `x.y.z` という形の 3 概念（package / Study manifest /
  interior-growth の `toolVersion`）について、SemVer の互換性保証を名乗らない。
  major / minor / patch の基準は未決である（§12）。
- **この文書だけで version を上げる権限は生じない。** 番号を上げるのは作者の承認による。
  §11 の「更新候補」は提示であって実行許可ではない。
- **現在の `formatVersion` が互換性を保証していると主張しない。** §4 の Observed のとおり、
  import 側は値を検証していない。実効的な互換性は構造検出と既定値化が担っている。
- **9 概念を将来統合すべきだと主張しない。** 分けたのは意味を読めるようにするためであり、
  統合の前提を作るためではない。
