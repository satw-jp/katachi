// ---------------------------------------------------------------------------
// Instrument — Study launcher (R5, Optimizer/docs/sonnet-instruction-20260726-
// katachi-r5-minimal-launcher.md §4).
//
// これは Study ではない。生成原理へ入る**入口**であり、Study 本体を統合しない。
// 作者判断 Q4「最初の Instrument は Study launcher だけ」に従い、保存物管理も
// Optimizer 連携も入れない。「道具は研究の堆積物」（AGENTS.md §1）。
//
// 意図的にやらないこと（§5 / §10）:
//   - root `index.html` を launcher にしない。`/` は今までどおり cloud-sculpt
//   - 既存9 Study の URL を変えない。redirect も追加しない
//   - 9つの `ui.ts` の nav-row を今回は一切触らない。66/72 の不足も埋めない
//     （完全 N×N を正式契約にするかは未決。launcher が正本として使えるかを
//      作者が実際に使って確かめてから、別タスクで決める）
//   - search / filter / sort、thumbnail 生成、framework 導入をしない
//
// 表示順は researchOrder（研究順）。これは統合順でも優劣でも完成度でもない。
// ---------------------------------------------------------------------------

import { STUDY_CATALOG, type StudyCatalogEntry } from "../../lib/studies.ts";
// 版表示のためだけに package.json の version を読む。この値をここへ打ち直すと
// 二重正本になり、package.json を上げたときに画面だけ黙って古くなる（補正指示 §2.1）。
// 版番号のリテラルをこのファイルへ書かないことは studies.test.ts で固定している。
import { version as packageVersion } from "../../../package.json";
import "./style.css";

/**
 * この launcher 画面自体を最後に更新した日。**Instrument 側のこの1箇所だけ**で
 * 定義する（補正指示 §2.1）。
 *
 * 更新規則: launcher の表示・情報構造・catalog の読み方を変えたらこの日付を上げる。
 * Study の追加で一覧を変えた場合は上げる（各 Study の版は各 `manifest.json` が正本）。
 * launcher 独自の semver は作らない。持つのは更新日だけ。
 */
const LAUNCHER_UPDATED_AT = "2026-08-09";

const app = document.getElementById("app")!;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderStudyRow(entry: StudyCatalogEntry): HTMLLIElement {
  const row = el("li", "study-row");

  row.appendChild(el("div", "study-order", String(entry.researchOrder)));

  const main = el("div", "study-main");
  const name = el("div", "study-name");
  name.appendChild(document.createTextNode(entry.titleJa));
  name.appendChild(el("span", "study-name-en", entry.titleEn));
  if (entry.status !== "active") {
    name.appendChild(el("span", "study-paused", `（${entry.status}）`));
  }
  main.appendChild(name);

  main.appendChild(el("p", "study-principle", entry.principle));

  if (entry.purposeTags.length > 0) {
    const tags = el("ul", "study-tags");
    for (const tag of entry.purposeTags) tags.appendChild(el("li", "study-tag", tag));
    main.appendChild(tags);
  }
  row.appendChild(main);

  // 実リンク。合成clickではなく実際の <a href> なので、ブラウザの戻るも効く。
  const actions = el("div", "study-actions");
  const open = el("a", "study-open", "開く →");
  open.href = entry.href;
  // 見た目は全行「開く →」で揃えるが、accessible name は Study ごとに固有にする。
  // 同じ名前が並ぶと、支援技術や名前で操作する経路ではどの Study のリンクなのか
  // 区別できない（補正指示 §2.2）。
  open.setAttribute("aria-label", `${entry.titleJa} (${entry.titleEn}) を開く`);
  // 実ブラウザ検証を座標や並び順だけに依存させないための手がかり。
  open.dataset.studyId = entry.id;
  actions.appendChild(open);

  // Hikari は別の生成原理ではなく cloud-sculpt の同じ場を見る実験面なので、
  // catalog の12番目へ偽装せず、元Studyの補助入口としてだけ置く。
  if (entry.id === "cloud-sculpt") {
    const hikariOpen = el(
      "a",
      "study-open study-open-experimental",
      "Hikari · 厚みの光（実験）→",
    );
    hikariOpen.href = "index.html?lightDrawing=1";
    hikariOpen.setAttribute("aria-label", "Hikari 厚みの光（実験）を開く");
    hikariOpen.dataset.studyVariant = "hikari-light-drawing-experimental";
    actions.appendChild(hikariOpen);
  }

  row.appendChild(actions);

  return row;
}

function render(): void {
  app.textContent = "";

  app.appendChild(el("h1", "launcher-title", "Katachi — Study 一覧"));

  // Version / UpdatedAt。ルート AGENTS.md の UI共通ルール、
  // docs/project-standards.md、docs/ui-guidelines.md が全画面へ要求する。
  // launcher は Study ではないが、それは版表示を省いてよい理由にならない。
  // 「スクリーンショットだけで版が分かる」ため、タイトル直後に置く。
  //
  // `createVersionRow()` をそのまま使うと `v0.1.0 · updated …` になり、何の版なのかが
  // 読めない（launcher は Study manifest を持たないので、ここに出せるのは *package* の
  // 版であり、launcher の更新日はそれとは別概念である）。class だけ共有して
  // 文言は明示的に組む（補正指示 §2.1）。
  app.appendChild(
    el(
      "div",
      "version-row",
      `Katachi package v${packageVersion} · launcher updated ${LAUNCHER_UPDATED_AT}`,
    ),
  );

  app.appendChild(
    el(
      "p",
      "launcher-lede",
      "かたちの「二つの余白」を主題に、生成原理ごとに一つずつ Study を立てている。" +
        "下は研究の順に並べたもので、統合の順でも優劣でも完成度でもない。",
    ),
  );

  app.appendChild(el("div", "launcher-section-label", "Studies（研究順）"));

  const list = el("ul", "study-list");
  const ordered = [...STUDY_CATALOG].sort((a, b) => a.researchOrder - b.researchOrder);
  for (const entry of ordered) list.appendChild(renderStudyRow(entry));
  app.appendChild(list);

  // §4「Optimizer を launcher 内へ埋め込まない」。境界を一文で述べるだけ。
  app.appendChild(el("div", "launcher-section-label", "保存したあと"));
  app.appendChild(
    el(
      "p",
      "launcher-note",
      "Katachi が書き出した STL の独立診断と、別ファイルへの変換は Optimizer が担当する。" +
        "Katachi 側は生成原理と作者の意図を正本として持ち、保存形状は raw 座標のまま残す。",
    ),
  );
  app.appendChild(
    el(
      "p",
      "launcher-note",
      "この画面は Study への入口だけを持つ。各 Study の Question・Setup・Observation は " +
        "それぞれの README が正本。",
    ),
  );
}

render();
