import assert from "node:assert/strict";
import { resolveVisualStudyId, VISUAL_STUDIES, VISUAL_STUDY_IDS, visualStudyChoice } from "./catalog.ts";

assert.equal(VISUAL_STUDIES.length, 8);
assert.equal(new Set(VISUAL_STUDY_IDS).size, 8);
assert.equal(resolveVisualStudyId("shadow"), "shadow");
assert.equal(resolveVisualStudyId("unknown"), "field");
assert.equal(visualStudyChoice("matter").number, "08");
assert.deepEqual(VISUAL_STUDIES.map((study) => study.title), [
  "FIELD", "DUST", "MUTUAL SUPPORT", "VOLUME", "PERMANENT / CHANGING", "SCAN", "HAND REMAINS", "SUPPORT BECOMES FORM",
]);
assert.match(visualStudyChoice("residue").question, /hesitation/i);
assert.match(visualStudyChoice("growth").question, /support/i);
assert.match(visualStudyChoice("shadow").question, /light/i);
assert.match(visualStudyChoice("matter").question, /flower/i);
console.log("skin visual studies catalog tests passed");
