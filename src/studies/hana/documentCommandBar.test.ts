import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HANA_DOCUMENT_COMMANDS, renderHanaDocumentCommandBar } from "./authoringLayout.ts";

const sourceUrl = (name: string): string => new URL(`./${name}`, import.meta.url);

test("document commands keep the fixed Top Pane order", () => {
  assert.deepEqual(
    HANA_DOCUMENT_COMMANDS.map((command) => command.id),
    ["new-document", "save-document", "load-document", "export-document", "undo-document", "redo-document", "clear-document"],
  );
  const bar = renderHanaDocumentCommandBar();
  const positions = HANA_DOCUMENT_COMMANDS.map((command) => bar.indexOf(`id="${command.id}"`));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
});

test("document command bar lives in the top application pane, not in the left rail", () => {
  const main = readFileSync(sourceUrl("main.ts"), "utf8");
  const topPaneOpen = main.indexOf('id="hana-top-pane"');
  const leftRailOpen = main.indexOf('class="hana-left-rail"');
  const leftUpperOpen = main.indexOf('id="hana-left-upper"');
  assert.ok(topPaneOpen >= 0 && leftRailOpen >= 0 && leftUpperOpen >= 0);
  assert.ok(topPaneOpen < leftRailOpen);
  // The bar is rendered from the shared helper inside the top pane template.
  const renderCall = main.indexOf("renderHanaDocumentCommandBar()");
  assert.ok(renderCall > topPaneOpen && renderCall < leftRailOpen);
  // No document command button id remains inside the left upper pane markup.
  const leftUpperClose = main.indexOf('id="left-pane-splitter"');
  const leftUpperMarkup = main.slice(leftUpperOpen, leftUpperClose);
  for (const command of HANA_DOCUMENT_COMMANDS) {
    assert.equal(leftUpperMarkup.includes(`id="${command.id}"`), false);
  }
});

test("top pane keeps the command bar on one row", () => {
  const css = readFileSync(sourceUrl("style.css"), "utf8");
  const topPaneRule = css.slice(css.indexOf(".hana-top-pane .hana-document-command-bar"));
  assert.ok(topPaneRule.includes("flex-wrap: nowrap"));
  assert.ok(topPaneRule.includes("overflow-x: auto"));
  assert.ok(css.includes("grid-column: 1 / -1"));
});
