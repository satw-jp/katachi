import assert from "node:assert/strict";
import { skinRebuildStage5BProgressPercent } from "./stage5bReinforcementWorkerProtocol.ts";

const routingStart = skinRebuildStage5BProgressPercent(0, 2, {
  phase: "routing",
  completedContactCount: 0,
  contactCount: 10,
  candidateIndex: 0,
  candidateCount: 20,
});
const routingMiddle = skinRebuildStage5BProgressPercent(0, 2, {
  phase: "routing",
  completedContactCount: 5,
  contactCount: 10,
  candidateIndex: 10,
  candidateCount: 20,
});
const secondRegion = skinRebuildStage5BProgressPercent(1, 2, {
  phase: "routing",
  completedContactCount: 0,
  contactCount: 10,
  candidateIndex: 0,
  candidateCount: 20,
});
const complete = skinRebuildStage5BProgressPercent(1, 2, {
  phase: "complete",
  completedContactCount: 10,
  contactCount: 10,
  candidateIndex: 0,
  candidateCount: 0,
});

assert.ok(routingStart >= 1);
assert.ok(routingMiddle > routingStart && routingMiddle < 50);
assert.equal(secondRegion, 50);
assert.equal(complete, 100);
console.log("skin-rebuild Stage 5B worker protocol tests passed");
