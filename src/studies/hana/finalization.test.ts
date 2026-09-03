import assert from "node:assert/strict";
import test from "node:test";

import {
  createHanaFinalizationTrace,
  transitionHanaFinalization,
} from "./finalization.ts";

test("HANA finalization trace has explicit generation identity and timestamps", () => {
  const trace = createHanaFinalizationTrace({
    documentRevision: 4,
    editSessionId: 2,
    finalRequestId: 7,
    finalGenerationId: 7,
    finalizeReason: "mouse-edit-pointerup",
    finalProfile: "normal",
    pointerUpTimestamp: 10,
  });
  assert.equal(trace.state, "FINAL_REQUESTED");
  assert.equal(trace.timestamps.tPointerUp, 10);
  assert.equal(trace.timestamps.tFinalBuildStart, null);
  assert.equal(trace.documentRevision, 4);
  assert.equal(trace.finalGenerationId, 7);
});

test("HANA finalization transitions are deterministic and non-destructive", () => {
  const original = createHanaFinalizationTrace({
    documentRevision: 1,
    editSessionId: 0,
    finalRequestId: 1,
    finalGenerationId: 1,
    finalizeReason: "draw-pointerup",
    finalProfile: "cpu-only",
    pointerUpTimestamp: 20,
  });
  const building = transitionHanaFinalization(original, "FINAL_BUILDING", 21);
  const cpuReady = transitionHanaFinalization(building, "FINAL_CPU_READY", 22);
  const presented = transitionHanaFinalization(cpuReady, "FINAL_PRESENTED", 24);

  assert.equal(original.state, "FINAL_REQUESTED");
  assert.equal(original.timestamps.tFinalBuildStart, null);
  assert.equal(building.timestamps.tFinalBuildStart, 21);
  assert.equal(cpuReady.timestamps.tMeshReady, 22);
  assert.equal(presented.timestamps.tFinalPresented, 24);
  assert.equal(presented.finalProfile, "cpu-only");
});
