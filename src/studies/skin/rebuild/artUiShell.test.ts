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
assert.match(source, /PLAY FORMATION/);
assert.match(source, /formationAction\.append\(formationDescriptor, formationButton\)/);
assert.match(source, /BACK TO INDEX/);
assert.match(source, /onNetworkFormationBackToIndex/);
assert.match(source, /formationStudyArchive/);
assert.match(source, /onNetworkFormationReplay/);
assert.match(source, /formationReplay\.hidden = state !== "stable"/);
assert.match(source, /NETWORK STABLE/);
assert.match(source, /app\.classList\.toggle\("is-network-formation"/);
assert.match(source, /networkFormationStudies/);
assert.match(source, /initialNetworkFormationStudyId/);
assert.match(source, /skin-network-formation-study/);
assert.match(source, /skin-network-formation-study-navigation/);
assert.match(source, /skin-network-formation-works-toggle/);
assert.match(source, /studyId\?: string/);
assert.match(source, /input\.type = "radio"/);
assert.match(source, /onNetworkFormationRequest\?\.\(selectedFormationStudyId\)/);
assert.match(source, /formationExit\.focus/);
assert.match(source, /formationButton\.focus/);
assert.doesNotMatch(source, /formation-study-card|formation-viewport-grid/);

console.log("SKIN ART UI shell tests passed");
