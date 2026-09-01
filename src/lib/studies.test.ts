// ---------------------------------------------------------------------------
// Study catalog coverage (R5-1).
// Run: npx tsx src/lib/studies.test.ts
//
// この catalog は正本ではなく写像なので、定数を読み上げるだけのテストには
// 意味がない。ここではファイルシステム（`src/studies/*/manifest.json` と
// repo root の `*.html`）を実際に読み、catalog がずれたら落ちるようにする。
// No test framework (AGENTS.md §5 — same style as skin/partition.test.ts).
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { STUDY_CATALOG, type StudyCatalogEntry } from "./studies.ts";

let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const STUDIES_DIR = join(REPO_ROOT, "src", "studies");

/** `src/studies/` 直下のディレクトリ名 = 実在する Study の集合（正本）。 */
function readStudyDirs(): string[] {
  return readdirSync(STUDIES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

interface StudyManifest {
  id?: unknown;
  title?: unknown;
  status?: unknown;
}

function readManifest(id: string): StudyManifest {
  const path = join(STUDIES_DIR, id, "manifest.json");
  return JSON.parse(readFileSync(path, "utf8")) as StudyManifest;
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

// --- 一意性 ----------------------------------------------------------------

test("catalog ids are unique", () => {
  const ids = STUDY_CATALOG.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate id in ${ids.join(", ")}`);
});

test("catalog hrefs are unique", () => {
  const hrefs = STUDY_CATALOG.map((s) => s.href);
  assert.equal(new Set(hrefs).size, hrefs.length, `duplicate href in ${hrefs.join(", ")}`);
});

// --- 14 Study が過不足なく載っている -----------------------------------------

test("catalog has exactly 14 entries", () => {
  assert.equal(STUDY_CATALOG.length, 14);
});

test("catalog ids match the directories under src/studies/", () => {
  const dirs = readStudyDirs();
  assert.equal(dirs.length, 14, `expected 14 study dirs, found ${dirs.length}: ${dirs.join(", ")}`);
  assert.deepEqual(sorted(STUDY_CATALOG.map((s) => s.id)), dirs);
});

// --- researchOrder ---------------------------------------------------------

test("researchOrder is unique", () => {
  const orders = STUDY_CATALOG.map((s) => s.researchOrder);
  assert.equal(new Set(orders).size, orders.length, `duplicate researchOrder in ${orders.join(", ")}`);
});

test("researchOrder is exactly 1..14 with no gaps", () => {
  const orders = [...STUDY_CATALOG.map((s) => s.researchOrder)].sort((a, b) => a - b);
  assert.deepEqual(orders, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
});

test("researchOrder follows the recorded research flow", () => {
  const byOrder = [...STUDY_CATALOG].sort((a, b) => a.researchOrder - b.researchOrder);
  assert.deepEqual(
    byOrder.map((s) => s.id),
    [
      "cloud-sculpt",
      "gravity",
      "sag",
      "mpm",
      "foam",
      "rings",
      "pack",
      "skin",
      "interior-growth",
      "hitsuji",
      "tangle",
      "flower-packing-spike",
      "flower-core-network",
      "hana",
    ],
  );
});

// --- href が実在する HTML entry を指している ----------------------------------

test("every href points at a real .html file at the repo root", () => {
  for (const s of STUDY_CATALOG) {
    assert.match(s.href, /^[a-z0-9-]+\.html$/, `${s.id}: href must be a bare root filename`);
    assert.ok(existsSync(join(REPO_ROOT, s.href)), `${s.id}: missing ${s.href} at repo root`);
  }
});

test("every Study uses its own <id>.html entry", () => {
  for (const s of STUDY_CATALOG) {
    const expected = `${s.id}.html`;
    assert.equal(s.href, expected, `${s.id}: unexpected href`);
  }
});

test("Hikari root and Cloud Sculpt entry select different initial workspaces", () => {
  const hikariEntry = readFileSync(join(REPO_ROOT, "index.html"), "utf8");
  const cloudEntry = readFileSync(join(REPO_ROOT, "cloud-sculpt.html"), "utf8");
  assert.match(hikariEntry, /<html lang="ja" data-entry-view="hikari">/);
  assert.match(cloudEntry, /<html lang="ja" data-entry-view="katachi">/);
});

test("every catalog entry has a representative image for the launcher", () => {
  for (const s of STUDY_CATALOG) {
    const imagePath = join(REPO_ROOT, "public", "studies", `${s.id}.png`);
    assert.ok(existsSync(imagePath), `${s.id}: missing public/studies/${s.id}.png`);
  }
});

// --- manifest との照合（manifest が正本） --------------------------------------

test("every catalog id has a manifest.json whose id agrees", () => {
  for (const s of STUDY_CATALOG) {
    const m = readManifest(s.id);
    assert.equal(m.id, s.id, `${s.id}: manifest id mismatch`);
  }
});

test("titleJa and titleEn both appear in the manifest title", () => {
  for (const s of STUDY_CATALOG) {
    const m = readManifest(s.id);
    assert.equal(typeof m.title, "string", `${s.id}: manifest title must be a string`);
    const title = m.title as string;
    assert.ok(s.titleJa.length > 0, `${s.id}: titleJa is empty`);
    assert.ok(s.titleEn.length > 0, `${s.id}: titleEn is empty`);
    assert.ok(title.includes(s.titleJa), `${s.id}: manifest title "${title}" lacks "${s.titleJa}"`);
    assert.ok(title.includes(s.titleEn), `${s.id}: manifest title "${title}" lacks "${s.titleEn}"`);
  }
});

test("status agrees with the manifest and is active|paused", () => {
  for (const s of STUDY_CATALOG) {
    const m = readManifest(s.id);
    assert.ok(
      s.status === "active" || s.status === "paused",
      `${s.id}: status must be active|paused`,
    );
    assert.equal(m.status, s.status, `${s.id}: manifest status mismatch`);
  }
});

// --- 表示テキストの最低条件 ----------------------------------------------------

test("principle is non-empty and a single line", () => {
  for (const s of STUDY_CATALOG) {
    assert.ok(s.principle.trim().length > 0, `${s.id}: principle is empty`);
    assert.equal(s.principle, s.principle.trim(), `${s.id}: principle has leading/trailing space`);
    assert.ok(!/[\r\n]/.test(s.principle), `${s.id}: principle must be a single line`);
  }
});

test("purposeTags is non-empty, and every tag is a non-empty unique string", () => {
  for (const s of STUDY_CATALOG) {
    assert.ok(s.purposeTags.length > 0, `${s.id}: purposeTags is empty`);
    for (const tag of s.purposeTags) {
      assert.equal(typeof tag, "string", `${s.id}: tag must be a string`);
      assert.ok(tag.trim().length > 0, `${s.id}: empty tag`);
    }
    assert.equal(
      new Set(s.purposeTags).size,
      s.purposeTags.length,
      `${s.id}: duplicate tag in ${s.purposeTags.join(", ")}`,
    );
  }
});

test("catalog carries no hand-copied version / updatedAt (manifest stays the sole source)", () => {
  for (const s of STUDY_CATALOG) {
    const entry = s as StudyCatalogEntry & Record<string, unknown>;
    // R5-2: 画面へ版表示を足したが、その値を catalog へ複製してはいけない。
    // 複製すると manifest と手入力の二重正本になる。
    assert.equal("version" in entry, false, `${s.id}: catalog must not carry version`);
    assert.equal("updatedAt" in entry, false, `${s.id}: catalog must not carry updatedAt`);
    const keys = Object.keys(entry).sort();
    assert.deepEqual(keys, [
      "href",
      "id",
      "principle",
      "purposeTags",
      "researchOrder",
      "status",
      "titleEn",
      "titleJa",
    ]);
  }
});

// --- launcher の版表示（R5-2） ----------------------------------------------
//
// DOM 要件（行が見えること・9リンクの accessible name が一意なこと）は実ブラウザで
// 確認する。ここで自動化できるのは「二重正本を作っていない」という構造の側だけ。

const LAUNCHER_MAIN = join(REPO_ROOT, "src", "instrument", "launcher", "main.ts");

test("launcher reads the package version by import, not by hand-copied literal", () => {
  const src = readFileSync(LAUNCHER_MAIN, "utf8");

  assert.match(
    src,
    /import \{ version as packageVersion \} from "\.\.\/\.\.\/\.\.\/package\.json";/,
    "launcher must import version from package.json",
  );

  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
    version?: unknown;
  };
  assert.equal(typeof pkg.version, "string");

  // package.json の実値がソースへ焼き込まれていないこと。コメント中の例示も
  // 引用符付きなら許容しない（"0.1.0" と書いた瞬間に二重正本になる）。
  assert.equal(
    src.includes(`"${pkg.version as string}"`),
    false,
    `launcher must not hard-code the package version ("${pkg.version as string}")`,
  );
});

test("launcher defines its updated date in exactly one place, with no invented semver", () => {
  const src = readFileSync(LAUNCHER_MAIN, "utf8");

  const defs = src.match(/const LAUNCHER_UPDATED_AT = "\d{4}-\d{2}-\d{2}";/g) ?? [];
  assert.equal(defs.length, 1, "LAUNCHER_UPDATED_AT must be defined exactly once");

  // 日付リテラルもこの1箇所だけ。
  const dates = src.match(/"\d{4}-\d{2}-\d{2}"/g) ?? [];
  assert.equal(dates.length, 1, "the launcher updated date must appear exactly once");

  // launcher 独自の semver / toolVersion を発明していないこと（禁止 §5）。
  assert.equal(/LAUNCHER_VERSION|toolVersion/.test(src), false);
  assert.equal(/"\d+\.\d+\.\d+"/.test(src), false, "no semver literal in the launcher");
});

console.log(`\n${passed} passed`);
if (process.exitCode) {
  console.error("SOME TESTS FAILED");
} else {
  console.log("ALL TESTS PASSED");
}
