import assert from "node:assert/strict";
import { formatDirection, optimizerAccessMessage, summarizeOptimizerReport } from "./printPreparation.ts";

const summary = summarizeOptimizerReport({
  topology: { watertight: true },
  shells: { count: 2 },
  bounding_box_mm: { extents: [80, 55, 32] },
  wall_thickness_estimate: { p05_mm: 1.24 },
  overhang_estimate: { internal_potential_ratio: 0.08, potential_ratio: 0.19 },
  orientation_scan: { best: [{ direction: [0, -1, 0], internal_potential_ratio: 0.02 }] },
});

assert.equal(summary.watertight, true);
assert.equal(summary.shellCount, 2);
assert.deepEqual(summary.sizeMm, [80, 55, 32]);
assert.equal(summary.wallP05Mm, 1.24);
assert.equal(summary.internalOverhangRatio, 0.08);
assert.equal(summary.bestInternalOverhangRatio, 0.02);
assert.equal(formatDirection(summary.bestDirection), "−Y");
function assertThrowsWithText(run: () => unknown, expected: string): void {
  try {
    run();
    throw new Error(`test did not throw: ${expected}`);
  } catch (error) {
    assert.ok(error instanceof Error && error.message.includes(expected) && !error.message.startsWith("test did not throw:"));
  }
}
assertThrowsWithText(() => summarizeOptimizerReport({}), "不完全");
assertThrowsWithText(() => summarizeOptimizerReport({
  topology: {}, shells: {}, bounding_box_mm: { extents: [1, 2] }, overhang_estimate: {},
}), "寸法");

assert.equal(optimizerAccessMessage({ protocol: "http:", hostname: "localhost" }), null);
assert.equal(optimizerAccessMessage({ protocol: "http:", hostname: "127.0.0.1" }), null);
assert.match(optimizerAccessMessage({ protocol: "https:", hostname: "katachi.a-8c3.workers.dev" }) ?? "", /localhost:5174/);

console.log("print preparation tests: 12 passed");
