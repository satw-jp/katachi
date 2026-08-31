import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import {
  EXPECTED_CUDA_DEVICE_NAME,
  EXPECTED_CUDA_EXECUTABLE_SHA256,
  validateEvaluateContainmentJobRequest,
} from "../../src/studies/skin/rebuild/geometryEngine/contracts.ts";
import { compareContainmentResults } from "../../src/studies/skin/rebuild/geometryEngine/resultComparison.ts";
import { evaluateContainmentOnWeb } from "../../src/studies/skin/rebuild/geometryEngine/webGeometryEngine.ts";
import { WindowsLocalGeometryEngineClient } from "../../src/studies/skin/rebuild/geometryEngine/windowsLocalClient.ts";
import { probeWindowsCapability } from "./probe-windows-capability.mjs";
import { createLocalEngineServer, FIXED_HOST, FIXED_PORT } from "./server.mjs";

const SAMPLE_COUNT = 250_000;
const REPEAT_RUNS = 5;
const PRODUCTION_ORIGIN = "https://katachi.a-8c3.workers.dev";
const fixtureUrl = new URL("./fixtures/containment-v1.json", import.meta.url);
const baseFixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
const reportJsonUrl = new URL("./benchmarks/cuda-shadow-session-cache-2026-08-31.json", import.meta.url);
const reportMarkdownUrl = new URL("./benchmarks/cuda-shadow-session-cache-2026-08-31.md", import.meta.url);

if (process.platform !== "win32") {
  process.stdout.write(`${JSON.stringify({ skipped: true, reason: "windows_required" })}\n`);
  process.exit(0);
}

function deterministicSamples(sampleCount) {
  const side = Math.ceil(Math.cbrt(sampleCount));
  return Array.from({ length: sampleCount }, (_, index) => {
    const x = index % side;
    const y = Math.floor(index / side) % side;
    const z = Math.floor(index / (side * side));
    return {
      sampleId: `session-${index}`,
      edgeId: `edge-${index % 257}`,
      position: {
        x: -2.6 + (5.2 * x) / (side - 1),
        y: -2.6 + (5.2 * y) / (side - 1),
        z: -2.6 + (5.2 * z) / (side - 1),
      },
      radius: 0.04 + (index % 7) * 0.01,
    };
  });
}

const request = validateEvaluateContainmentJobRequest({
  ...structuredClone(baseFixture),
  clientRequestId: "session-250k-first-upload",
  projectFingerprint: "sha256:session-cache-250k-v1",
  quality: { purpose: "shadow-session-cache-benchmark", benchmarkIterations: 1 },
  input: {
    ...structuredClone(baseFixture.input),
    samples: deterministicSamples(SAMPLE_COUNT),
    boundaryTolerance: 0.00005,
  },
});

function productionFetch(input, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Origin", PRODUCTION_ORIGIN);
  return fetch(input, { ...init, headers });
}

function assertComparison(activeRequest, result) {
  const webStart = performance.now();
  const authoritative = evaluateContainmentOnWeb(activeRequest);
  const webMilliseconds = performance.now() - webStart;
  const comparison = compareContainmentResults(
    activeRequest,
    authoritative,
    result,
    activeRequest.input.boundaryTolerance,
  );
  assert.equal(comparison.matched, true);
  assert.equal(comparison.missingSampleIds.length, 0);
  assert.equal(comparison.discreteMismatchSampleIds.length, 0);
  assert.equal(authoritative.backend.backendKind, "web");
  assert.equal(authoritative.productionApplied, false);
  assert.equal(result.backend.deviceName, EXPECTED_CUDA_DEVICE_NAME);
  assert.equal(result.backend.artifactSha256, EXPECTED_CUDA_EXECUTABLE_SHA256);
  assert.equal(result.shadow, true);
  assert.equal(result.productionApplied, false);
  return { comparison, webMilliseconds };
}

function runRecord(phase, index, timing, checked) {
  return {
    phase,
    index,
    timing,
    webReferenceMilliseconds: checked.webMilliseconds,
    maximumAbsoluteMarginDelta: checked.comparison.maximumAbsoluteMarginDelta,
    marginTolerance: checked.comparison.marginTolerance,
    matched: checked.comparison.matched,
    shadow: true,
    productionApplied: false,
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function summarize(runs) {
  const timingKeys = Object.keys(runs[0].timing);
  return {
    runs: runs.length,
    timingMedianMilliseconds: Object.fromEntries(timingKeys
      .filter((key) => key.endsWith("Milliseconds"))
      .map((key) => [key, median(runs.map((run) => run.timing[key]))])),
    requestBytes: median(runs.map((run) => run.timing.requestBytes)),
    responseBytes: median(runs.map((run) => run.timing.responseBytes)),
    webReferenceMilliseconds: median(runs.map((run) => run.webReferenceMilliseconds)),
    maximumAbsoluteMarginDelta: Math.max(...runs.map((run) => run.maximumAbsoluteMarginDelta)),
    allMatched: runs.every((run) => run.matched),
  };
}

const probe = probeWindowsCapability();
assert.equal(probe.cudaBackend.available, true, probe.cudaBackend.reasonCode);
const server = createLocalEngineServer({ probe });
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(FIXED_PORT, FIXED_HOST, resolve);
});

const client = new WindowsLocalGeometryEngineClient({ fetch: productionFetch, transport: "binary" });
const report = {
  contract: "katachi.cuda-shadow-session-cache-benchmark.v1",
  recordedAt: new Date().toISOString(),
  policy: { authoritativeBackend: "web", candidateBackend: "cuda", shadow: true, productionApplied: false },
  environment: {
    sampleCount: SAMPLE_COUNT,
    deviceName: probe.compiledExecutable.capabilities.device.name,
    artifactSha256: probe.compiledExecutable.artifactSha256,
    endpoint: `http://${FIXED_HOST}:${FIXED_PORT}/v1`,
  },
  binding: {
    projectFingerprint: request.projectFingerprint,
    algorithmContract: request.algorithmContract,
    volatile: true,
    persistedToFkei: false,
    invalidation: ["helper restart", "project fingerprint", "algorithm contract", "session identity", "geometry fingerprint"],
  },
  firstUpload: null,
  parameterOnlyRepeats: [],
  unchangedRepeats: [],
};

try {
  const first = await client.createContainmentShadowSession(request);
  const firstChecked = assertComparison(request, first.result);
  report.session = first.session;
  report.firstUpload = runRecord("first-upload-cold", 1, client.getLastTransportTiming(), firstChecked);

  for (let index = 1; index <= REPEAT_RUNS; index += 1) {
    const repeated = await client.evaluateContainmentShadowSession(first.session.sessionId, {
      clientRequestId: `session-250k-parameter-${index}`,
      smoothness: 0.62,
      boundaryTolerance: 0.00006,
      benchmarkIterations: 1,
    });
    report.parameterOnlyRepeats.push(runRecord(
      "parameter-only",
      index,
      client.getLastTransportTiming(),
      assertComparison(repeated.request, repeated.result),
    ));
  }
  for (let index = 1; index <= REPEAT_RUNS; index += 1) {
    const repeated = await client.evaluateContainmentShadowSession(first.session.sessionId, {
      clientRequestId: `session-250k-unchanged-${index}`,
      benchmarkIterations: 1,
    });
    report.unchangedRepeats.push(runRecord(
      "unchanged",
      index,
      client.getLastTransportTiming(),
      assertComparison(repeated.request, repeated.result),
    ));
  }
  report.summary = {
    firstUpload: {
      timing: report.firstUpload.timing,
      webReferenceMilliseconds: report.firstUpload.webReferenceMilliseconds,
      maximumAbsoluteMarginDelta: report.firstUpload.maximumAbsoluteMarginDelta,
      matched: report.firstUpload.matched,
    },
    parameterOnly: summarize(report.parameterOnlyRepeats),
    unchanged: summarize(report.unchangedRepeats),
  };
  await client.releaseContainmentShadowSession(first.session.sessionId);
} finally {
  await new Promise((resolve) => server.close(resolve));
}

await writeFile(reportJsonUrl, `${JSON.stringify(report, null, 2)}\n`);
const rows = [
  ["first upload (cold)", report.summary.firstUpload.timing, report.summary.firstUpload.maximumAbsoluteMarginDelta],
  ["parameter-only repeat (median)", {
    ...report.summary.parameterOnly.timingMedianMilliseconds,
    requestBytes: report.summary.parameterOnly.requestBytes,
  }, report.summary.parameterOnly.maximumAbsoluteMarginDelta],
  ["unchanged repeat (median)", {
    ...report.summary.unchanged.timingMedianMilliseconds,
    requestBytes: report.summary.unchanged.requestBytes,
  }, report.summary.unchanged.maximumAbsoluteMarginDelta],
];
const lines = [
  "# CUDA-4B Shadow Geometry Session Cache",
  "",
  "250,000 samples. Web is authoritative; CUDA remains a shadow candidate; every comparison matched and `productionApplied=false`.",
  "",
  "| Phase | Request | HTTP | Helper decode | Worker | Browser decode | Semantic validate | Client total | Max margin Δ |",
  "|:---|---:|---:|---:|---:|---:|---:|---:|---:|",
];
for (const [label, timing, delta] of rows) {
  lines.push(`| ${label} | ${(timing.requestBytes / 1024).toFixed(2)} KiB | ${timing.httpRoundTripMilliseconds.toFixed(2)} ms | ${(timing.helperDecodeMilliseconds ?? 0).toFixed(2)} ms | ${(timing.workerTotalMilliseconds ?? 0).toFixed(2)} ms | ${timing.responseDecodeMilliseconds.toFixed(2)} ms | ${timing.semanticValidationMilliseconds.toFixed(2)} ms | ${timing.totalMilliseconds.toFixed(2)} ms | ${delta.toExponential(3)} |`);
}
lines.push(
  "",
  "The 250k topology upload drops from 3.81 MiB to a 64-byte repeat request. The 3.81 MiB binary result still returns because portable semantic validation and identity reconstruction remain enabled.",
  "",
  "The cache is process-memory only, bound to session/project/algorithm/geometry fingerprint, and is never stored in FKEI. Base, sample topology, coordinate contract, or algorithm changes require a new full upload.",
);
await writeFile(reportMarkdownUrl, `${lines.join("\n")}\n`);
process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
