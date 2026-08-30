import assert from "node:assert/strict";
import {
  SKIN_REBUILD_WORKFLOW_PHASES,
  moveSkinRebuildWorkflowPhase,
} from "./workflowPhaseNavigator.ts";

assert.deepEqual(
  SKIN_REBUILD_WORKFLOW_PHASES.map((phase) => phase.label),
  ["BASE SHAPE", "SURFACE PATTERN", "NETWORK", "PRINT / EXPORT"],
);
assert.deepEqual(
  SKIN_REBUILD_WORKFLOW_PHASES.map((phase) => phase.targetId),
  ["skin-stage-1", "skin-stage-2", "skin-stage-3", "skin-stage-6"],
  "the four-phase navigator must focus existing authoring stages without rebuilding their controls",
);
assert.equal(moveSkinRebuildWorkflowPhase(0, -1), 0);
assert.equal(moveSkinRebuildWorkflowPhase(0, 1), 1);
assert.equal(moveSkinRebuildWorkflowPhase(2, 1), 3);
assert.equal(moveSkinRebuildWorkflowPhase(3, 1), 3);

console.log("SKIN REBUILD workflow phase navigator tests passed");
