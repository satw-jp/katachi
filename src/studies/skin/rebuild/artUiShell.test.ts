import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SKIN_ART_UI_PHASES, skinArtUiPhaseIndexForStage } from "./artUiShell.ts";

assert.deepEqual(
  SKIN_ART_UI_PHASES.map((phase) => phase.label),
  ["BASE SHAPE", "SURFACE PATTERN", "NETWORK", "PRINT / EXPORT"],
);
assert.deepEqual(
  SKIN_ART_UI_PHASES.map((phase) => phase.targetId),
  ["skin-stage-1", "skin-stage-2", "skin-stage-3", "skin-stage-6"],
  "the art shell must focus the existing authoring stages",
);
assert.deepEqual(
  SKIN_ART_UI_PHASES.flatMap((phase) => phase.stageIds),
  Array.from({ length: 8 }, (_, index) => `skin-stage-${index + 1}`),
  "every existing authoring stage must appear exactly once in the four artwork phases",
);
assert.equal(skinArtUiPhaseIndexForStage("skin-stage-1"), 0);
assert.equal(skinArtUiPhaseIndexForStage("skin-stage-5"), 2);
assert.equal(skinArtUiPhaseIndexForStage("skin-stage-8"), 3);
assert.equal(skinArtUiPhaseIndexForStage("unknown-stage"), null);

const source = readFileSync(fileURLToPath(new URL("./artUiShell.ts", import.meta.url)), "utf8");
for (const selector of [
  "#skin-project-open",
  "#skin-project-save",
  "#skin-project-undo",
  "#skin-project-redo",
]) assert.ok(source.includes(selector), `art shell must reuse ${selector}`);
for (const forbiddenImport of ["./model.ts", "./fkei.ts", "../renderer.ts"]) {
  assert.ok(!source.includes(forbiddenImport), `presentation shell must not import ${forbiddenImport}`);
}
assert.match(source, /target\?\.scrollIntoView/);
assert.match(source, /stage\.hidden = !activeStageIds\.has\(stageId\)/);
assert.match(source, /Research controls, diagnostics and retained experiments/);
assert.match(source, /Start Network Formation presentation/);
assert.match(source, /NETWORK STABLE/);
assert.match(source, /app\.classList\.toggle\("is-network-formation"/);

console.log("SKIN ART UI shell tests passed");
