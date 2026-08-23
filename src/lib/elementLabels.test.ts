import assert from "node:assert/strict";
import { elementDisplayName, elementLabelDepthOpacity, matchesElementSearch, representativeElements } from "./elementLabels.ts";

assert.equal(elementDisplayName("surface", "flower", 7), "S・花 007");
assert.equal(elementDisplayName("surface", "flatRing", 1234), "S・平リング 1234");
assert.equal(elementDisplayName("interior", "coin", 18, "coin-constrained"), "I-C・コイン 018");
assert.equal(elementDisplayName("interior", "ring", 2, "ring-constrained"), "I-R・リング 002");
assert.equal(matchesElementSearch("I-C・コイン 001", 1, "I-C 001"), true);
assert.equal(matchesElementSearch("I-C・コイン 025", 25, "コイン 25"), true);
assert.equal(matchesElementSearch("S・花 025", 25, "花 025"), true);
assert.equal(matchesElementSearch("I-C・コイン 025", 25, "リング 25"), false);

const items = Array.from({ length: 100 }, (_, id) => ({ id }));
const sampled = representativeElements(items, 8, 55);
assert.equal(sampled.length, 8);
assert.equal(sampled[0].id, 55, "the selected element is always labeled first");
assert.ok(sampled.some((item) => item.id === 0), "the sample spans the start of the result");
assert.ok(sampled.some((item) => item.id === 99), "the sample spans the end of the result");
assert.equal(new Set(sampled.map((item) => item.id)).size, sampled.length, "labels never duplicate an element");
assert.deepEqual(representativeElements(items.slice(0, 3), 8), items.slice(0, 3), "small results show every element");
assert.deepEqual(representativeElements(items, 0), [], "zero limit disables labels");
assert.equal(elementLabelDepthOpacity(2, 2, 10), 1, "front labels stay fully opaque");
assert.ok(Math.abs(elementLabelDepthOpacity(10, 2, 10) - 0.3) < 1e-12, "back labels become clearly translucent");
assert.equal(elementLabelDepthOpacity(10, 2, 10, true), 1, "the selected back label remains readable");

console.log("element-label tests passed (18 assertions)");
