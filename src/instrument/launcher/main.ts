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
//   - 既存 Study の URL を変えない。redirect も追加しない
//   - 各 `ui.ts` の nav-row を今回は一切触らない
//     （完全 N×N を正式契約にするかは未決。launcher が正本として使えるかを
//      作者が実際に使って確かめてから、別タスクで決める）
//   - search / filter / sort、framework 導入をしない
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
const LAUNCHER_UPDATED_AT = "2026-08-11";

const HIKARI_URL = "https://hikari.a-8c3.workers.dev/";

const app = document.getElementById("app")!;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderStudyCard(entry: StudyCatalogEntry): HTMLLIElement {
  const item = el("li", "study-item");

  // カード全体を一つの実リンクにする。画像だけ／文字だけでリンク先が分かれる
  // 状態を作らず、マウス・キーボード・タッチのどこからでも同じ Study を開く。
  const card = el("a", "study-card");
  card.href = entry.href;
  card.setAttribute("aria-label", `${entry.titleJa} (${entry.titleEn}) を開く`);
  card.dataset.studyId = entry.id;

  const frame = el("div", "study-frame");
  const image = document.createElement("img");
  image.src = `./studies/${entry.id}.png`;
  image.alt = `${entry.titleJa} — ${entry.titleEn} の画面`;
  image.loading = entry.researchOrder <= 4 ? "eager" : "lazy";
  image.decoding = "async";
  frame.appendChild(image);
  frame.appendChild(el("span", "study-order", String(entry.researchOrder).padStart(2, "0")));
  card.appendChild(frame);

  const main = el("div", "study-main");
  const name = el("h2", "study-name");
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
  main.appendChild(el("div", "study-open", "Study を開く →"));
  card.appendChild(main);
  item.appendChild(card);

  return item;
}

function render(): void {
  app.textContent = "";

  app.appendChild(el("h1", "launcher-title", "Katachi"));

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
      "完成した形ではなく、形が生まれる途中を一段ずつ観察する。" +
        "生成原理ごとに立てた Study を研究の順に並べている。",
    ),
  );

  app.appendChild(el("div", "launcher-section-label", "形状 Study — 研究順"));

  const list = el("ul", "study-list");
  const ordered = [...STUDY_CATALOG].sort((a, b) => a.researchOrder - b.researchOrder);
  for (const entry of ordered) list.appendChild(renderStudyCard(entry));
  app.appendChild(list);

  // Hikari は形状生成の Study ではなく、Katachi で作った形へ光を通して観察する
  // 独立アプリ。研究順の番号を付けず、ShapeAsset / Hikari case の受け渡し境界を
  // 保ったまま外部の観察面として案内する。
  app.appendChild(el("div", "launcher-section-label", "光を観察する"));
  const hikariLink = el("a", "hikari-link");
  hikariLink.href = HIKARI_URL;
  hikariLink.target = "_blank";
  hikariLink.rel = "noopener noreferrer";
  hikariLink.setAttribute("aria-label", "Hikari — 光とかたち を新しいタブで開く");
  hikariLink.appendChild(el("span", "hikari-link-title", "Hikari — 光とかたち"));
  hikariLink.appendChild(
    el(
      "span",
      "hikari-link-description",
      "Katachiで保存した共有Hikari caseを開き、光・影・透過光・コースティクスを別の画面で観察する。",
    ),
  );
  hikariLink.appendChild(el("span", "hikari-link-open", "Hikariを開く ↗"));
  app.appendChild(hikariLink);

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
