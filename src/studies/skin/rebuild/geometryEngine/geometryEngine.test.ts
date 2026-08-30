import assert from "node:assert/strict";
import {
  EVALUATE_CONTAINMENT_ALGORITHM,
  GEOMETRY_CAPABILITIES_CONTRACT,
  GEOMETRY_ENGINE_API_BASE,
  GEOMETRY_JOB_RESULT_CONTRACT,
  GEOMETRY_PROTOCOL,
  createEvaluateContainmentJob,
  type EvaluateContainmentJobRequest,
  type EvaluateContainmentJobResult,
  type GeometryEngineCapabilities,
  validateEvaluateContainmentJobRequest,
} from "./contracts.ts";
import { evaluateContainmentShadow } from "./shadowEvaluateContainment.ts";
import { evaluateContainmentOnWeb } from "./webGeometryEngine.ts";
import { WindowsLocalGeometryEngineClient } from "./windowsLocalClient.ts";

function request(): EvaluateContainmentJobRequest {
  return createEvaluateContainmentJob({
    clientRequestId: "containment-fixture-1",
    projectFingerprint: "sha256:fixture-project",
    coordinateContract: {
      frame: "object",
      unitsPerMillimeter: 0.1,
      handedness: "right",
      buildAxis: "+z",
    },
    quality: { purpose: "shadow-conformance" },
    input: {
      base: {
        kind: "metaball-smooth-union",
        contractVersion: 1,
        balls: [{ id: 1, x: 0, y: 0, z: 0, r: 2 }],
        smoothness: 0.6,
      },
      boundaryTolerance: 1e-6,
      samples: [
        { sampleId: "s-inside", edgeId: "edge-a", position: { x: 0, y: 0, z: 0 }, radius: 0.5 },
        { sampleId: "s-boundary", edgeId: "edge-a", position: { x: 1.8, y: 0, z: 0 }, radius: 0.2 },
        { sampleId: "s-outside", edgeId: "edge-b", position: { x: 1.9, y: 0, z: 0 }, radius: 0.2 },
      ],
    },
  });
}

function capabilities(cudaAvailable: boolean): GeometryEngineCapabilities {
  return {
    contract: GEOMETRY_CAPABILITIES_CONTRACT,
    protocol: GEOMETRY_PROTOCOL,
    engine: { id: "test-helper", version: "test" },
    endpoint: { host: "127.0.0.1", port: 47658, apiBase: "/v1" },
    backends: [{
      backendId: "test-cuda",
      kind: "cuda",
      status: cudaAvailable ? "available" : "unavailable",
      deviceName: "NVIDIA GeForce RTX 3080",
      precisionModes: cudaAvailable ? ["float32"] : [],
      ...(cudaAvailable ? {} : { reasonCode: "compiled_executable_absent" }),
    }],
    operations: cudaAvailable ? [{
      operation: "evaluateContainment",
      algorithmContracts: [EVALUATE_CONTAINMENT_ALGORITHM],
      backendIds: ["test-cuda"],
    }] : [],
    limits: { maximumJobBytes: 1024, maximumContainmentSamples: 100 },
  };
}

function cudaCandidate(
  job: EvaluateContainmentJobRequest,
  mutate?: (candidate: EvaluateContainmentJobResult) => void,
): EvaluateContainmentJobResult {
  const web = evaluateContainmentOnWeb(job);
  const candidate: EvaluateContainmentJobResult = {
    ...structuredClone(web),
    contract: GEOMETRY_JOB_RESULT_CONTRACT,
    jobId: "native-job-1",
    backend: {
      backendId: "test-cuda",
      backendKind: "cuda",
      engineVersion: "test-cuda-1",
      deviceName: "NVIDIA GeForce RTX 3080",
      precisionMode: "float32",
    },
  };
  mutate?.(candidate);
  return candidate;
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const fixture = request();
const web = evaluateContainmentOnWeb(fixture);
assert.deepEqual(
  web.result.samples.map((sample) => sample.classification),
  ["inside", "boundary", "outside"],
);
assert.deepEqual(web.result.summary.outsideSampleIds, ["s-outside"]);
assert.deepEqual(web.result.summary.outsideEdgeIds, ["edge-b"]);
assert.equal(web.result.summary.contained, false);
assert.equal(web.shadow, true);
assert.equal(web.productionApplied, false);

const invalid = structuredClone(fixture);
invalid.input.samples[0].position.x = Number.NaN;
assert.throws(
  () => validateEvaluateContainmentJobRequest(invalid),
  /must be a finite number/,
  "non-finite geometry must fail before transport",
);
const emptyBase = structuredClone(fixture);
emptyBase.input.base.balls = [];
assert.throws(
  () => validateEvaluateContainmentJobRequest(emptyBase),
  /must not be empty/,
  "containment requests require an explicit Base",
);

const probeCalls: string[] = [];
const probeClient = new WindowsLocalGeometryEngineClient({
  fetch: async (input) => {
    probeCalls.push(String(input));
    return jsonResponse(capabilities(true));
  },
});
const probe = await probeClient.probeCapabilities();
assert.equal(probe.available, true);
assert.deepEqual(probeCalls, [`${GEOMETRY_ENGINE_API_BASE}/capabilities`], "client must probe one fixed endpoint");

const absentClient = new WindowsLocalGeometryEngineClient({
  fetch: async () => { throw new TypeError("connect ECONNREFUSED"); },
  probeTimeoutMs: 10,
});
const absent = await evaluateContainmentShadow(fixture, {
  preferWindowsCuda: true,
  localClient: absentClient,
});
assert.equal(absent.candidateStatus, "helper_unavailable");
assert.equal(absent.fallback?.code, "helper_unreachable");
assert.deepEqual(absent.authoritative.result, web.result, "helper absence must preserve Web facts");

let unavailableCalls = 0;
const unavailableClient = new WindowsLocalGeometryEngineClient({
  fetch: async () => {
    unavailableCalls++;
    return jsonResponse(capabilities(false));
  },
});
const unavailable = await evaluateContainmentShadow(fixture, {
  preferWindowsCuda: true,
  localClient: unavailableClient,
});
assert.equal(unavailable.candidateStatus, "cuda_unavailable");
assert.equal(unavailable.fallback?.code, "compiled_executable_absent");
assert.equal(unavailableCalls, 1, "CUDA-unavailable capability must not submit a job");

function candidateClient(candidate: EvaluateContainmentJobResult): WindowsLocalGeometryEngineClient {
  let call = 0;
  return new WindowsLocalGeometryEngineClient({
    pollIntervalMs: 0,
    fetch: async (input) => {
      call++;
      if (call === 1) return jsonResponse(capabilities(true));
      if (call === 2) {
        assert.equal(String(input), `${GEOMETRY_ENGINE_API_BASE}/jobs`);
        return jsonResponse({
          contract: "katachi.geometry-job-accepted.v1",
          jobId: "native-job-1",
          clientRequestId: fixture.clientRequestId,
          status: "queued",
        }, 202);
      }
      return jsonResponse({
        contract: "katachi.geometry-job-status.v1",
        jobId: "native-job-1",
        clientRequestId: fixture.clientRequestId,
        status: "completed",
        result: candidate,
      });
    },
  });
}

const matched = await evaluateContainmentShadow(fixture, {
  preferWindowsCuda: true,
  localClient: candidateClient(cudaCandidate(fixture)),
  comparisonMarginTolerance: 1e-5,
});
assert.equal(matched.candidateStatus, "candidate_matched");
assert.equal(matched.comparison?.matched, true);
assert.equal(matched.productionApplied, false);
assert.equal(matched.authoritative.backend.backendKind, "web");

const mismatchedCandidate = cudaCandidate(fixture, (candidate) => {
  candidate.result.samples[0].classification = "outside";
});
const mismatched = await evaluateContainmentShadow(fixture, {
  preferWindowsCuda: true,
  localClient: candidateClient(mismatchedCandidate),
});
assert.equal(mismatched.candidateStatus, "candidate_mismatched");
assert.deepEqual(mismatched.comparison?.discreteMismatchSampleIds, ["s-inside"]);
assert.equal(mismatched.authoritative.result.samples[0].classification, "inside");
assert.equal(mismatched.productionApplied, false);

console.log("geometryEngine shadow contract tests passed");
