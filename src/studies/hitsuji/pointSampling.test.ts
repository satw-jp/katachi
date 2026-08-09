import assert from "node:assert/strict";
import { shouldDisplayPoint } from "./pointSampling.ts";

const indices = Array.from({ length: 10_000 }, (_, index) => index);
const selected = (fraction: number, seed = 260304) =>
  indices.filter((index) => shouldDisplayPoint(index, seed, fraction));

assert.equal(selected(0).length, 0, "0% must hide every point");
assert.equal(selected(1).length, indices.length, "100% must keep every point");

const quarter = selected(0.25);
assert.ok(quarter.length > 2300 && quarter.length < 2700, "25% must produce a representative quarter sample");

const half = new Set(selected(0.5));
assert.ok(quarter.every((index) => half.has(index)), "lower fractions must remain subsets of higher fractions");
assert.deepEqual(selected(0.25), quarter, "the same Seed and fraction must reproduce the same point set");
assert.notDeepEqual(selected(0.25, 7), quarter, "changing Seed must change the displayed sample");

console.log("6 passed — hitsuji point sampling");
