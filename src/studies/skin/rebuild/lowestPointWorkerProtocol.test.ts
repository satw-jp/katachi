import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chooseSkinRebuildLowestWorkerCount,
  skinRebuildLowestProgressPercent,
} from "./lowestPointWorkerProtocol.ts";
import { stage6MeshProgressPercent, type Stage6MeshProgressPhase } from "./stage6MeshProgress.ts";

test("lowest-point extraction keeps the UI core and caps slice workers", () => {
  assert.equal(chooseSkinRebuildLowestWorkerCount(1), 1);
  assert.equal(chooseSkinRebuildLowestWorkerCount(2), 2);
  assert.equal(chooseSkinRebuildLowestWorkerCount(8), 7);
  assert.equal(chooseSkinRebuildLowestWorkerCount(20), 16);
  assert.equal(chooseSkinRebuildLowestWorkerCount(32), 16);
  assert.equal(chooseSkinRebuildLowestWorkerCount(undefined), 3);
});

test("bottom-pane progress remains monotonic across worker phases", () => {
  const values = [
    skinRebuildLowestProgressPercent("mesh", 0, 8),
    skinRebuildLowestProgressPercent("mesh", 4, 8),
    skinRebuildLowestProgressPercent("mesh", 8, 8),
    skinRebuildLowestProgressPercent("orientation", 0, 1),
    skinRebuildLowestProgressPercent("attribution", 50, 100),
    skinRebuildLowestProgressPercent("reachability", 1, 2),
    skinRebuildLowestProgressPercent("overhang", 1, 1),
    skinRebuildLowestProgressPercent("complete", 1, 1),
  ];
  assert.deepEqual(values, [...values].sort((left, right) => left - right));
  assert.equal(values[values.length - 1], 100);
});

test("Stage 6 reports actual phases instead of a smoothed 90/99 percent stall", () => {
  const phases: Stage6MeshProgressPhase[] = [
    "preparing", "sampling", "assembling", "topology", "components",
    "repair", "saved-topology", "printability", "encoding", "support", "complete",
  ];
  const values = phases.map((phase) => stage6MeshProgressPercent(phase, phase === "sampling" ? 16 : 1, 16));
  assert.deepEqual(values, [...values].sort((left, right) => left - right));
  assert.equal(stage6MeshProgressPercent("sampling", 0, 16), 4);
  assert.equal(stage6MeshProgressPercent("sampling", 8, 16), 37);
  assert.equal(values[values.length - 1], 100);
});

console.log("SKIN REBUILD lowest-point Worker protocol tests passed");
