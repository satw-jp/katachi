import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const MAIN = readFileSync(join(ROOT, "src/instrument/launcher/main.ts"), "utf8");
const STYLE = readFileSync(join(ROOT, "src/instrument/launcher/style.css"), "utf8");

test("launcher links the standalone Hikari observation app outside Study order", () => {
  assert.match(MAIN, /const HIKARI_URL = "https:\/\/hikari\.a-8c3\.workers\.dev\/"/);
  assert.match(MAIN, /"光を観察する"/);
  assert.match(MAIN, /Katachiで保存した共有Hikari case/);
  assert.match(MAIN, /hikariLink\.target = "_blank"/);
  assert.match(MAIN, /hikariLink\.rel = "noopener noreferrer"/);
  assert.doesNotMatch(MAIN, /dataset\.studyId = [^;]*HIKARI_URL/);
});

test("Hikari entry follows launcher layout and mobile collapse", () => {
  assert.match(STYLE, /\.hikari-link\s*\{[^}]*display:\s*grid/s);
  assert.match(STYLE, /@media \(max-width: 42rem\)[\s\S]*\.hikari-link\s*\{[^}]*grid-template-columns:\s*1fr/s);
});

test("launcher update date records the Hikari boundary addition", () => {
  assert.match(MAIN, /const LAUNCHER_UPDATED_AT = "2026-08-11"/);
});
