# Instrument — 制作の入口

Katachi の三層（Study / Library / Instrument）のうち **Instrument** の置き場所。

**ここは Study ではない。** Study manifest を持たないし、生成原理も持たない。
Library と Study の成果を束ねて、作者が制作へ使うための面である。
`AGENTS.md` §1「道具は研究の堆積物」に従い、先回りして作り込まない。

## 現在あるもの

### `launcher/` — Study 一覧（`studies.html`）

12の生成原理へ入る一つの入口。**入口だけ**を持ち、Study 本体を統合しない。

- 表示順は **研究順**（`researchOrder`）。統合の順でも優劣でも完成度でもない
- 各カード: 代表像 / 研究順 / 表示名 / 生成原理の一文 / purpose tag / 開くリンク
- launcher が import するカタログ module は `src/lib/studies.ts`。ただし
  **これはデータの正本ではなく、正本への写像である**:
  - **id / 表示名 / status の正本** = 各 Study の `manifest.json`
  - **生成原理（principle）の正本** = 各 Study README の Question
  - `src/lib/studies.ts` = launcher が読むためにそれを写したもの
  - カタログの自動テスト（`npm run test:studies`）は
    **写しと正本の drift を検出するもの**であって、写しを正本に昇格させるものではない
- **version はカタログへ複製していない**。手入力の二重正本を作らないため
  （各 Study の `manifest.json` が唯一の正本）
- 画面の Version / UpdatedAt は `Katachi package v<version> · launcher updated <date>` の
  2つを別概念として出す。package version は `package.json` から import して読み、
  launcher の更新日は `launcher/main.ts` の `LAUNCHER_UPDATED_AT` 1箇所だけで定義する。
  **更新規則: launcher の表示・情報構造・catalog の読み方を変えたらこの日付を上げる。
  Study 側の変更では上げない。** launcher 独自の semver も `toolVersion` も作らない
- 見た目は T18 の紙白・墨・hairline token（`src/styles/base.css`）だけを使う。
  新しい design system を作らず、satw.jp の Studies と同じ静かな画像カードで並べる
- 代表像は `public/studies/<study-id>.png`。同じ 16:10 の観察窓として揃え、
  画像自体を完成作品のように扱わず「その段階で何が見えていたか」の標本にする

## 意図的にやっていないこと

作者判断 Q4「最初の Instrument は Study launcher だけ」に従い、次は**入れていない**:

- 保存物（STL / recipe / provenance）の管理
- Optimizer の診断結果の統合（境界を一文で述べ、埋め込まない）
- search / filter / sort
- thumbnail の自動更新（現時点では、残すと判断した代表像を意図的に差し替える）

root `/` は Hikari の入口、Cloud Sculpt は `/cloud-sculpt`、launcher は
`/studies` として分ける。同じ Cloud Sculpt 実装内で KATACHI / HIKARI の場と視点を共有しつつ、
一覧から開いた最初の画面が保存済みの表示状態に奪われないよう入口URLで固定する。

**各 Study の `ui.ts` にある nav-row は今回一切変更していない。**
完全 N×N を正式契約にするか launcher を正本にするかは未決であり、
埋めると決めた形に縛られる。作者が launcher を実際に使ってから、別タスクで
「Study一覧へ」を足すのか、前/次を足すのか、既存 nav を縮小するのかを決める。

## Observation（2026-08-09）

- 作者確認で「雲をこねる」カードが保存済みHikari表示へ開く混線が判明した。
  カードの行き先を `/cloud-sculpt` へ変更し、root `/` はHikariの入口として明示的に分けた
- 作者の確認を受け、一覧の背景を紙白 `#fbfbf9` から純白へ変更した。
  Void Packing の代表像も初期形状ではなく、空隙へ実際に充填した状態へ差し替える
- 作者の「今までの各段階の形状スタディをwebサイトで見れるようにしたい」を受け、
  文字だけの研究順一覧から、12段階の代表像を同じ比率で並べる画像カードへ変更した
- 一覧の順序・生成原理の一文・purpose tag は従来の catalog をそのまま使う。
  見た目の一覧化のために別の分類や完成度を発明していない
- satw.jp `/studies/` の紙白・余白・画像カードを基準にしつつ、各カードに研究順の番号を残した。
  これにより「何があるか」と「どの問いの後に生まれたか」を同時に見渡せる
- 代表像は各 Study の現在の既定状態を 16:10 で採取した静的画像。
  生成画面を iframe や動画で12枚同時起動せず、一覧を静かな標本棚として保った
- `npm run test:studies` 19件が通過。12 Study の正本との一致、12リンク、
  12枚の代表像の実在を確認した。Cloud Sculpt入口の分離後は16 entryでビルドする
- 実画面でデスクトップ2列・スマートフォン1列を確認し、最新の「花を詰める」カードから
  実リンクで `flower-packing-spike.html` が開くことを確認した
- 見た目の変更のため、T18 の手順どおり作者の視覚確認前には公開していない

## Observation（2026-07-26）

- `studies.html` を10番目の vite entry として追加し、**10 entry の本番ビルドが成功**
  （既存9 entry は維持、出力パスの衝突なし）
- 実ブラウザ（`http://localhost:5174/studies.html`）で、**9リンクすべてを実座標
  クリック**して対象 Study が開くことを確認した。クリック前に9リンク全部の
  `document.elementFromPoint` が当該 `<a>` を返すこと（＝どれも他の要素に
  覆われていないこと）も測った。各遷移のあとブラウザの戻るで launcher へ戻れることも確認
- root `/` が従来どおり cloud-sculpt（`Katachi — 雲をこねる`）であることを確認
- mobile 幅（375×812）で横スクロールが出ず、9リンクのどれも
  タイトルと重ならず、ヒットテストも通ることを確認。
  なお mobile プリセットのスクリーンショットは暗く写るが、
  `getComputedStyle(document.body)` は `rgb(251,251,249)` / `rgb(28,28,26)`、
  `color-scheme: light` で、実際の描画は紙白のまま（スクリーンショットの見た目だけで
  判断しないこと）
- console error なし
- カタログの自動テスト15件（`npm run test:studies`）。既存の
  `test:interior-growth` 122件・`test:partition` 102件に退行なし

### 公開確認（2026-07-26、`npm run deploy` 実行後）

`https://katachi.a-8c3.workers.dev/`（Cloudflare Workers、静的アセット配信）で確認した。

- `/studies.html` が配信される。**Workers 側で `/studies` へ正規化される**
  （拡張子なしURL）。相対 href はそのまま解決するのでリンクは壊れない
- 公開画面で9リンクすべてが `elementFromPoint` のヒットテストを通る
- 9つの href をすべて実際に fetch し、**全て HTTP 200** で、
  期待どおりの `<title>` が返ることを確認した
- そのうち `interior-growth` は公開画面で**実座標クリック**して遷移し、
  canvas が立ち上がることまで確認した
  （9リンク全部の実座標クリックはローカルで実施済み）
- **root `/` が従来どおり cloud-sculpt**（`Katachi — 雲をこねる`）
- console error なし

### 補正 R5-2（2026-07-26、公開後の独立監査を受けて）

上の初回 Observation は残す。**そのとき公開したものには次の3点が欠けていた。**

1. **画面に Version / UpdatedAt が無かった**（`.version-row` 0件）。launcher は Study では
   ないが、それは版表示を省いてよい理由にならない。ルート `AGENTS.md` の UI共通ルール、
   `docs/project-standards.md`、`docs/ui-guidelines.md`、「スクリーンショットだけで版が
   分かる」という運用規則に反していた
2. **9リンクの accessible name が全て `開く →` で区別できなかった**。見た目では行に
   所属して見えるが、支援技術や名前で操作する経路ではどの Study なのか分からない
3. **上の「カタログの正本は `src/lib/studies.ts`」という書き方が、データの正本まで
   `studies.ts` であるように読めた。** コードとテストの契約は「manifest / README Question が
   正本、`studies.ts` はその写像」である。この README の「現在あるもの」節を訂正した

直したこと（launcher 以外の production code は触っていない）:

- タイトル直後へ `Katachi package v0.1.0 · launcher updated 2026-07-26` を `.version-row` で表示。
  package version は `package.json` から import、更新日は `LAUNCHER_UPDATED_AT` の1箇所のみ。
  `createVersionRow()` は使わず class だけ共有した（`v0.1.0 · updated …` では何の版か読めず、
  launcher に出せるのは package の版だから）
- 各リンクへ `aria-label="<和名> (<英名>) を開く"` と `data-study-id`。見た目の `開く →` は維持
- catalog へ version / updatedAt は**追加していない**。Study manifest も新設していない

検証（2026-07-26）:

- `npm run test:studies` **17件全通**（15→17。catalog の
  version / updatedAt 不在を明示的に固定する assertion を既存テストへ追加し、
  「launcher が package version を import で読み、リテラルを焼き込んでいない」
  「更新日の定義が1箇所だけで、独自 semver を発明していない」の2件を新規追加）。
  この2件目は実際に**自分の書いたコメント内の版番号リテラルを検出して落ちた**ので、
  コメントの書き方を直した
- `npx tsc --noEmit` clean / `npm run build` **10 entry 維持** / `git diff --check` clean
- `test:interior-growth` 122件・`test:partition` 102件は再実行していない。
  今回の変更は launcher と catalog テストだけで、共通コード（`src/styles/base.css` 等）へ
  触れていないため（補正指示 §3 が明示的に許可している再利用）
- ビルド出力に package.json 本体は入っていない（version だけが tree-shake されている）
- deploy 差分は3ファイルのみ（`/studies.html` と launcher の js / css）。
  root と9 Study の出力は1バイトも変わっていない
- 公開 `https://katachi.a-8c3.workers.dev/studies`（Version ID
  `7f1797d6-954b-48e2-a5a4-9807a2fc99bc`）で確認: 版行が1件表示され
  スクリーンショットに写る / 9リンクの accessible name が9件すべて一意
  （計算後の a11y tree でも解決を確認）/ 9リンクすべて `elementFromPoint` を通る /
  `泡のセル` を**実座標クリック**して `/foam` へ遷移し canvas 起動 /
  root `/` は従来どおり cloud-sculpt / mobile 375幅で横スクロール0・版行1行・重なりなし /
  console error なし
- なお最初の公開確認では古い bundle hash が返ったが、これは**ブラウザ側のキャッシュ**で、
  配信側は `cache: 'no-store'` の再取得で新版を返していた（強制再読込後に上記を確認）
