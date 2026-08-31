import assert from "node:assert/strict";
import { buildSkinRebuildProject } from "../model.ts";
import { evaluateContainmentOnWeb } from "./webGeometryEngine.ts";
import {
  createSkinRebuildContainmentRequest,
  SkinRebuildShadowObserver,
} from "./skinRebuildShadowRuntime.ts";
import { WindowsLocalGeometryEngineClient } from "./windowsLocalClient.ts";

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

let webOnlyFetchCalled = false;
const webOnlyObserver = new SkinRebuildShadowObserver({
  localClient: new WindowsLocalGeometryEngineClient({
    fetch: async () => {
      webOnlyFetchCalled = true;
      throw new TypeError("Web-only mode must not contact localhost");
    },
  }),
});
const webOnly = await webOnlyObserver.observe(project, false);
assert.equal(webOnlyFetchCalled, false);
assert.equal(webOnly.transportMode, "web-only");
assert.equal(webOnly.outcome.candidateStatus, "not_requested");
assert.equal(webOnly.outcome.authoritative.backend.backendKind, "web");
assert.equal(webOnly.outcome.productionApplied, false);

const helperMissing = await new SkinRebuildShadowObserver({
  localClient: new WindowsLocalGeometryEngineClient({
    fetch: async () => { throw new TypeError("helper absent"); },
    probeTimeoutMs: 20,
  }),
}).observe(project, true);
assert.equal(helperMissing.outcome.candidateStatus, "helper_unavailable");
assert.equal(helperMissing.outcome.authoritative.backend.backendKind, "web");
assert.equal(helperMissing.outcome.productionApplied, false);

console.log("SKIN REBUILD production shadow request tests passed", JSON.stringify(first.facts));
