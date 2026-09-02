import assert from "node:assert/strict";
import { resolveReplaySeed, seededRandom } from "./replaySeed.ts";

assert.deepEqual(resolveReplaySeed("12345"), { seed: 12345, fixed: true });
assert.deepEqual(resolveReplaySeed("0"), { seed: 1, fixed: true });
assert.equal(resolveReplaySeed("not-a-seed").fixed, false);
const first = seededRandom(12345);
const second = seededRandom(12345);
assert.deepEqual([first(), first(), first()], [second(), second(), second()]);
assert.notEqual(seededRandom(12345)(), seededRandom(54321)());
console.log("skin concept movies v3 replay seed tests passed");
