import assert from "node:assert/strict";
import test from "node:test";
import { createHanaAuthoringStudy } from "./authoringStudy.ts";
import {
  createHanaSmallCluster,
  parseHanaClusterPayload,
  selectHanaClusterObjects,
  serializeHanaCluster,
  serializeHanaClusterBridge,
} from "./authoringCluster.ts";

test("Small cluster creates three local Flower placements with branches and validated Bridge", () => {
  const cluster = createHanaSmallCluster(createHanaAuthoringStudy());
  assert.equal(cluster.flowers.length, 3);
  assert.equal(cluster.flowers.every((flower) => flower.petalStrokeIds.length === 5), true);
  assert.equal(cluster.graph.edges.filter((edge) => edge.role === "connector").length, 3);
  assert.equal(cluster.graph.edges.filter((edge) => edge.role === "petal").length, 15);
  assert.equal(cluster.bridgeValidation?.valid ?? true, true);
  assert.equal(cluster.materialObjects.filter((object) => object.kind === "flower").length, 3);
  assert.equal(cluster.registry.size, 10);
});

test("Cluster selection and save/load remain semantic and exclude derived objects", () => {
  const cluster = createHanaSmallCluster(createHanaAuthoringStudy());
  const selected = selectHanaClusterObjects(cluster, ["flower-2", "missing"]);
  assert.deepEqual(selected.selectedObjectIds, ["flower-2"]);
  const payload = parseHanaClusterPayload(serializeHanaCluster(cluster));
  assert.equal(payload.flowers.length, 3);
  assert.ok(!serializeHanaCluster(cluster).includes("materialObjects"));
  assert.ok(!serializeHanaClusterBridge(cluster).includes("surface"));
});
