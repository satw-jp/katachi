import assert from "node:assert/strict";
import type { Patch } from "./field.ts";
import { analyzePatchContacts, reinforceWeakPatchContacts } from "./contactStrength.ts";
import { createEmptyState, parseRecipe, record, replay, serializeRecipe } from "./history.ts";

function spherePatch(id: number, x: number, y: number, r = 1): Patch {
  return { id, shape: "flower", points: [{ x, y, z: 0, r }] };
}

function flowerPatch(id: number, centerX: number): Patch {
  return {
    id,
    shape: "flower",
    points: [-0.2, 0, 0.2].map((offset) => ({
      x: centerX + offset, y: 0, z: 0, r: 0.4, role: "motif" as const,
    })),
  };
}

const chain = [spherePatch(1, 0, 0), spherePatch(2, 2, 0), spherePatch(3, 4, 0), spherePatch(4, 10, 0)];
const report = analyzePatchContacts(chain, 3);
assert.equal(report.edgeCount, 2, "touching sphere pairs become motif-to-motif edges");
assert.equal(report.componentCount, 2, "an isolated motif remains its own connected component");
assert.deepEqual(report.counts, { zero: 1, one: 2, two: 1, threeOrMore: 0 }, "0/1/2/3+ buckets remain explicit");
assert.deepEqual(report.rows[1].partners, [1, 3], "partner ids are stable and sorted");

const square = [
  spherePatch(10, 0, 0), spherePatch(11, 2.16, 0),
  spherePatch(12, 0, 2.16), spherePatch(13, 2.16, 2.16),
];
const reinforced = reinforceWeakPatchContacts(square, { target: 2, maxGrowth: 0.1, overlap: 0.01 });
assert.ok(reinforced.before.rows.every((row) => row.count === 0), "positive clearances begin disconnected");
assert.ok(reinforced.after.rows.every((row) => row.count >= 2), "local nearest-pair growth reaches the requested square degree");
assert.equal(reinforced.unresolvedIds.length, 0, "resolved motifs are removed from the warning list");
assert.ok(reinforced.adjustedPointCount > 0, "the result reports exactly which realized points changed");
assert.ok(reinforced.maxAddition <= 0.1 + 1e-9, "no point exceeds the absolute per-point growth cap");
assert.deepEqual(square, [
  spherePatch(10, 0, 0), spherePatch(11, 2.16, 0),
  spherePatch(12, 0, 2.16), spherePatch(13, 2.16, 2.16),
], "the input patch set is never modified");

const repeated = reinforceWeakPatchContacts(square, { target: 2, maxGrowth: 0.1, overlap: 0.01 });
assert.deepEqual(repeated.patches, reinforced.patches, "same geometry and controls produce the same local reinforcement");
const idempotent = reinforceWeakPatchContacts(reinforced.patches, { target: 2, maxGrowth: 0.1, overlap: 0.01 });
assert.deepEqual(idempotent.patches, reinforced.patches, "reapplying the same cap cannot compound contact growth");

const tooFar = reinforceWeakPatchContacts([spherePatch(20, 0, 0), spherePatch(21, 2.5, 0)], {
  target: 1, maxGrowth: 0.1, overlap: 0.01,
});
assert.equal(tooFar.addedEdges, 0, "the cap never grows a long artificial connector");
assert.deepEqual(tooFar.unresolvedIds, [20, 21], "unreachable weak motifs stay explicit");

const wholeSource = [flowerPatch(30, 0), flowerPatch(31, 1.3)];
const whole = reinforceWeakPatchContacts(wholeSource, {
  target: 1,
  maxGrowth: 0.1,
  overlap: 0.01,
  mode: "wholeMotif",
  wholeScaleMax: 0.15,
});
assert.equal(whole.mode, "wholeMotif", "the result reports whole-motif reinforcement distinctly");
assert.equal(whole.after.edgeCount, 1, "whole-flower enlargement can close a reachable weak contact");
assert.equal(whole.adjustedPatchCount, 2, "both flowers participating in the new contact are enlarged as objects");
assert.equal(whole.adjustedPointCount, 6, "every petal/core proxy point is adjusted, not only the closest petal");
assert.ok(whole.patches.every((patch) => patch.points.every((point) => (point.contactScale ?? 0) > 0)), "uniform scale provenance is stored on every motif point");
assert.ok(whole.patches.every((patch) => patch.points.every((point) => point.r > 0.4)), "all realized flower components grow together");
assert.ok(whole.patches[0].points[0].x < -0.2 && whole.patches[0].points[2].x > 0.2, "petal placement expands about the flower centroid");
assert.ok(whole.maxAddition <= 0.15 + 1e-9, "whole-flower growth never exceeds its scale cap");
assert.deepEqual(wholeSource, [flowerPatch(30, 0), flowerPatch(31, 1.3)], "whole-flower reinforcement never mutates its input");
assert.deepEqual(
  reinforceWeakPatchContacts(whole.patches, {
    target: 1, maxGrowth: 0.1, overlap: 0.01, mode: "wholeMotif", wholeScaleMax: 0.15,
  }).patches,
  whole.patches,
  "reapplying whole-flower reinforcement does not compound an already satisfied contact",
);

const unreachableWhole = reinforceWeakPatchContacts([flowerPatch(40, 0), flowerPatch(41, 4)], {
  target: 1,
  maxGrowth: 0.1,
  overlap: 0.01,
  mode: "wholeMotif",
  wholeScaleMax: 0.15,
});
assert.equal(unreachableWhole.adjustedPatchCount, 2, "unreachable weak flowers still visibly enlarge as an authoring operation");
assert.equal(unreachableWhole.after.edgeCount, 0, "whole enlargement does not pretend a distant contact was achieved");
assert.deepEqual(unreachableWhole.unresolvedIds, [40, 41], "unreachable enlarged flowers remain explicitly unresolved");
assert.ok(unreachableWhole.patches.every((patch) => patch.points.every((point) => Math.abs((point.contactScale ?? 0) - 0.15) < 1e-9)), "unresolved flowers stop exactly at the selected whole-scale cap");

const state = createEmptyState();
const history: Parameters<typeof record>[0] = [];
record(history, state, "setSkinParam", { key: "contactTarget", value: 2 });
record(history, state, "setSkinParam", { key: "contactMaxGrowth", value: 0.1 });
record(history, state, "setSkinParam", { key: "contactOverlap", value: 0.01 });
record(history, state, "setSkinParam", { key: "contactReinforcementMode", value: "wholeMotif" });
record(history, state, "setSkinParam", { key: "contactWholeScaleMax", value: 0.15 });
record(history, state, "packPatches", { patches: whole.patches });
const restored = replay(parseRecipe(serializeRecipe(history)));
assert.equal(restored.skinParams.contactTarget, 2, "recipe preserves the contact target");
assert.equal(restored.skinParams.contactMaxGrowth, 0.1, "recipe preserves the local growth cap");
assert.equal(restored.skinParams.contactOverlap, 0.01, "recipe preserves requested overlap");
assert.equal(restored.skinParams.contactReinforcementMode, "wholeMotif", "recipe preserves the selected reinforcement method");
assert.equal(restored.skinParams.contactWholeScaleMax, 0.15, "recipe preserves the whole-flower scale cap");
assert.deepEqual(
  JSON.parse(JSON.stringify(restored.patches)),
  JSON.parse(JSON.stringify(whole.patches)),
  "recipe preserves realized whole-flower positions, radii, and contactScale exactly",
);

console.log("contact-strength tests passed (34 assertions)");
