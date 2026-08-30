import assert from "node:assert/strict";
import {
  SKIN_REBUILD_STAGE_CLASSIFICATION,
  SKIN_REBUILD_TEST_CLASSIFICATION,
  SKIN_REBUILD_WORKFLOW_INVENTORY,
} from "./workflowInventory.ts";

const currentStages = new Set<string>(SKIN_REBUILD_STAGE_CLASSIFICATION.current);
const futureStages = new Set<string>(SKIN_REBUILD_STAGE_CLASSIFICATION.future);
assert.equal([...currentStages].filter((id) => futureStages.has(id)).length, 0);
assert.deepEqual([...currentStages], ["skin-stage-1", "skin-stage-2", "skin-stage-6", "skin-stage-7", "skin-stage-8"]);
assert.deepEqual([...futureStages], ["skin-stage-3", "skin-stage-4", "skin-stage-5"]);

const inventory = new Map(SKIN_REBUILD_WORKFLOW_INVENTORY.map((item) => [item.id, item.classification]));
assert.equal(inventory.get("base-shape"), "current");
assert.equal(inventory.get("surface-pattern"), "current");
assert.equal(inventory.get("fkei-project"), "current");
assert.equal(inventory.get("mesh-final-validation-export"), "current");
assert.equal(inventory.get("graph-dryweb-spider-network"), "future");
assert.equal(inventory.get("auxiliary-frozen-research"), "legacy");

const classifiedTests = Object.values(SKIN_REBUILD_TEST_CLASSIFICATION).flat();
assert.equal(classifiedTests.length, new Set(classifiedTests).size, "permanent, migration and legacy test contracts must be disjoint");
assert.ok(SKIN_REBUILD_TEST_CLASSIFICATION.permanent.includes("fkei"));
assert.ok(SKIN_REBUILD_TEST_CLASSIFICATION.migration.includes("workflow-phase-navigator"));
assert.ok(SKIN_REBUILD_TEST_CLASSIFICATION.legacy.includes("original-skin-json-ui"));

console.log("SKIN REBUILD workflow inventory tests passed");
