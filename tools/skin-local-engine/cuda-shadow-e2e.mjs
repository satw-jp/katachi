import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import {
  EXPECTED_CUDA_DEVICE_NAME,
  EXPECTED_CUDA_EXECUTABLE_SHA256,
  validateEvaluateContainmentJobRequest,
} from "../../src/studies/skin/rebuild/geometryEngine/contracts.ts";
import { evaluateContainmentShadow } from "../../src/studies/skin/rebuild/geometryEngine/shadowEvaluateContainment.ts";
import { WindowsLocalGeometryEngineClient } from "../../src/studies/skin/rebuild/geometryEngine/windowsLocalClient.ts";
import { probeWindowsCapability } from "./probe-windows-capability.mjs";
import {
  createLocalEngineServer,
  FIXED_HOST,
  FIXED_PORT,
} from "./server.mjs";

const PRODUCTION_ORIGIN = "https://katachi.a-8c3.workers.dev";
const fixtureUrl = new URL("./fixtures/containment-v1.json", import.meta.url);
const request = validateEvaluateContainmentJobRequest(
  JSON.parse(await readFile(fixtureUrl, "utf8")),
);
if (process.platform !== "win32") {
  process.stdout.write(`${JSON.stringify({
    contract: "katachi.cuda-shadow-e2e-report.v1",
    skipped: true,
    reason: "windows_required",
  })}\n`);
  process.exit(0);
}
const probe = probeWindowsCapability();

assert.equal(probe.cudaBackend.available, true, probe.cudaBackend.reasonCode);
assert.equal(probe.compiledExecutable.capabilities.device.name, EXPECTED_CUDA_DEVICE_NAME);
assert.equal(probe.compiledExecutable.artifactSha256, EXPECTED_CUDA_EXECUTABLE_SHA256);
assert.equal(probe.compiledExecutable.capabilities.precisionMode, "float32");
assert.equal(probe.compiledExecutable.capabilities.shadow, true);
assert.equal(probe.compiledExecutable.capabilities.productionApplied, false);

const server = createLocalEngineServer({ probe });
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(FIXED_PORT, FIXED_HOST, resolve);
});

try {
  const localClient = new WindowsLocalGeometryEngineClient({
    fetch: async (input, init = {}) => {
      const headers = new Headers(init.headers);
      headers.set("Origin", PRODUCTION_ORIGIN);
      return fetch(input, { ...init, headers });
    },
  });
  const capabilitiesProbe = await localClient.probeCapabilities();
  assert.equal(capabilitiesProbe.available, true);
  if (!capabilitiesProbe.available) throw new Error(capabilitiesProbe.detail);
  assert.deepEqual(capabilitiesProbe.capabilities.policy, {
    executionMode: "shadow-only",
    authoritativeBackend: "web",
    productionApplied: false,
    workerLifecycle: "persistent",
    workerTransport: "length-framed-json-v1",
    workerTransports: ["length-framed-json-v1", "compact-binary-v1"],
    browserHelperTransports: [
      "application/json",
      "application/vnd.katachi.geometry-binary-v1",
    ],
    preferredBrowserHelperTransport: "application/vnd.katachi.geometry-binary-v1",
    shadowSessionCache: {
      volatile: true,
      persistedToProject: false,
      maximumSessions: 4,
    },
  });
  assert.equal(localClient.supportsCudaContainment(capabilitiesProbe.capabilities), true);

  const endToEndStart = performance.now();
  const outcome = await evaluateContainmentShadow(request, {
    preferWindowsCuda: true,
    localClient,
    comparisonMarginTolerance: request.input.boundaryTolerance,
  });
  const endToEndMilliseconds = performance.now() - endToEndStart;

  assert.equal(outcome.candidateStatus, "candidate_matched", outcome.fallback?.detail);
  assert.equal(outcome.comparison?.matched, true);
  assert.equal(outcome.authoritative.backend.backendKind, "web");
  assert.equal(outcome.authoritative.productionApplied, false);
  assert.equal(outcome.shadowOnly, true);
  assert.equal(outcome.productionApplied, false);
  assert.ok(outcome.candidate);
  const candidate = outcome.candidate;
  assert.equal(candidate.backend.backendKind, "cuda");
  assert.equal(candidate.backend.deviceName, EXPECTED_CUDA_DEVICE_NAME);
  assert.equal(candidate.backend.precisionMode, "float32");
  assert.equal(candidate.backend.artifactSha256, EXPECTED_CUDA_EXECUTABLE_SHA256);
  assert.equal(candidate.shadow, true);
  assert.equal(candidate.productionApplied, false);
  assert.deepEqual(
    candidate.result.samples.map(({ sampleId, edgeId }) => ({ sampleId, edgeId })),
    request.input.samples.map(({ sampleId, edgeId }) => ({ sampleId, edgeId })),
  );
  assert.deepEqual(
    candidate.result.samples.map(({ classification }) => classification),
    ["inside", "inside", "boundary", "outside", "inside"],
  );
  for (const sample of candidate.result.samples) {
    assert.equal(Number.isFinite(sample.baseSignedDistance), true);
    assert.equal(Number.isFinite(sample.radiusAdjustedMargin), true);
    assert.equal(Number.isFinite(sample.radiusClearance), true);
  }
  const timing = candidate.backend.timing;
  assert.ok(timing);
  assert.equal(Number.isFinite(timing.kernelAverageMilliseconds), true);
  assert.equal(Number.isFinite(timing.endToEndMilliseconds), true);

  process.stdout.write(`${JSON.stringify({
    contract: "katachi.cuda-shadow-e2e-report.v1",
    matched: outcome.comparison.matched,
    authoritativeBackend: outcome.authoritative.backend.backendKind,
    candidateBackend: candidate.backend.backendKind,
    deviceName: candidate.backend.deviceName,
    precisionMode: candidate.backend.precisionMode,
    sampleCount: candidate.result.samples.length,
    maximumAbsoluteMarginDelta: outcome.comparison.maximumAbsoluteMarginDelta,
    marginTolerance: outcome.comparison.marginTolerance,
    endToEndMilliseconds,
    cudaExecutableEndToEndMilliseconds: timing.endToEndMilliseconds,
    cudaKernelAverageMilliseconds: timing.kernelAverageMilliseconds,
    browserHelperTransport: localClient.getLastTransportTiming(),
    shadow: outcome.shadowOnly,
    productionApplied: outcome.productionApplied,
  }, null, 2)}\n`);
} finally {
  await new Promise((resolve) => server.close(resolve));
}
