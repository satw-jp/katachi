import assert from "node:assert/strict";
import {
  buildStage6ComponentExportSelection,
  stage6ComponentSelectionTriangleCount,
} from "./stage6ComponentExportSelection.ts";

const positions = Float32Array.from({ length: 36 }, (_, index) => index + 0.25);
const normals = Float32Array.from({ length: 36 }, (_, index) => 100 + index);
const componentIds = Int32Array.from([0, 1, 0, 2]);
const originalPositions = positions.slice();
const originalNormals = normals.slice();

const selected = buildStage6ComponentExportSelection(
  positions,
  normals,
  componentIds,
  new Set([0, 2]),
);
assert.deepEqual(selected.componentIds, [0, 2]);
assert.equal(selected.triangleCount, 3);
assert.deepEqual(Array.from(selected.positions), [
  ...positions.slice(0, 9),
  ...positions.slice(18, 27),
  ...positions.slice(27, 36),
]);
assert.deepEqual(Array.from(selected.normals), [
  ...normals.slice(0, 9),
  ...normals.slice(18, 27),
  ...normals.slice(27, 36),
]);
assert.equal(stage6ComponentSelectionTriangleCount(componentIds, new Set([1])), 1);
assert.deepEqual(positions, originalPositions, "selection must not mutate source positions");
assert.deepEqual(normals, originalNormals, "selection must not mutate source normals");
assert.throws(
  () => buildStage6ComponentExportSelection(positions, normals, componentIds, new Set()),
  /at least one kept component/,
);

console.log("Stage 6 component export selection tests passed");
