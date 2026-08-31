import assert from "node:assert/strict";
import { buildSkinRebuildProject } from "../model.ts";
import { evaluateContainmentOnWeb } from "./webGeometryEngine.ts";
import { createSkinRebuildContainmentRequest } from "./skinRebuildShadowRuntime.ts";

const { project } = buildSkinRebuildProject();
const first = await createSkinRebuildContainmentRequest(project);
const second = await createSkinRebuildContainmentRequest(project);

assert.equal(first.facts.targetLongestMm, 120);
assert.equal(first.facts.hostBallCount, 12);
assert.equal(first.facts.latticeNodeCount, 306);
assert.equal(first.facts.latticeEdgeCount, 325);
assert.equal(first.facts.sampleCount, 8_159);
assert.equal(first.request.input.samples.length, first.facts.sampleCount);
assert.equal(first.request.projectFingerprint, second.request.projectFingerprint);
assert.notEqual(first.request.clientRequestId, second.request.clientRequestId);
assert.equal(new Set(first.request.input.samples.map((sample) => sample.sampleId)).size, first.facts.sampleCount);
assert.deepEqual(
  first.request.input.samples.map((sample) => sample.edgeId),
  second.request.input.samples.map((sample) => sample.edgeId),
  "stable input order must preserve edge identity across observations",
);

const web = evaluateContainmentOnWeb(first.request);
assert.equal(web.backend.backendKind, "web");
assert.equal(web.result.samples.length, first.facts.sampleCount);
assert.equal(web.shadow, true);
assert.equal(web.productionApplied, false);

console.log("SKIN REBUILD production shadow request tests passed", JSON.stringify(first.facts));
