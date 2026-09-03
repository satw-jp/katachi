import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

const ui = source("./ui.ts");
const main = source("./main.ts");

const resultToolsStart = ui.indexOf("const resultTools = document.createElement(\"details\")");
const resultToolsEnd = ui.indexOf("root.appendChild(resultTools)", resultToolsStart);
assert.ok(resultToolsStart >= 0 && resultToolsEnd > resultToolsStart, "graph screening result tools remain present");
const resultToolsSource = ui.slice(resultToolsStart, resultToolsEnd);

assert.match(ui, /surfaceAuthoringPanel\.id = "skin-surface-pattern-authoring"/);
assert.match(ui, /surfaceAuthoringPanel\.dataset\.role = "current-authoring-workflow"/);
assert.match(ui, /surfaceAuthoringPanel\.append\([\s\S]{0,700}manualRow,[\s\S]{0,700}deletePatchBtn,[\s\S]{0,700}selectionInfo/);
assert.match(ui, /stage2\.body\.append\(surfaceResultStatus, surfaceAuthoringPanel\)/);
assert.doesNotMatch(resultToolsSource, /manualRow|manualRadiusBuilt\.row|manual-surface-edit|deletePatchBtn|selectionInfo/,
  "manual Surface Pattern controls must not fall back into collapsed graph screening");
assert.match(resultToolsSource, /gaugesPanel/);
assert.match(resultToolsSource, /linkingPanel/);

// The UI restoration must continue to use the authoring state/history path;
// temporary mesh, graph screening, and Stage 8 support are not an alternate
// source of truth for Surface Pattern edits.
assert.match(main, /onToggleAddPatchMode: \(active\)/);
assert.match(main, /record\(history, state, "addPatch"/);
assert.match(main, /record\(history, state, "editPatch"/);
assert.match(main, /record\(history, state, "removePatch"/);
assert.match(main, /function redoLastOperation\(\)/);
assert.match(main, /redoHistoryEntry\(history, entry\)/);
assert.match(main, /canShapeRedo/);

console.log("Surface Pattern authoring workflow contract tests passed");
