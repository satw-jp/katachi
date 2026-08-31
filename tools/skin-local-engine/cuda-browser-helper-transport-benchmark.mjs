import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import {
  EXPECTED_CUDA_DEVICE_NAME,
  EXPECTED_CUDA_EXECUTABLE_SHA256,
  validateEvaluateContainmentJobRequest,
} from "../../src/studies/skin/rebuild/geometryEngine/contracts.ts";
import { evaluateContainmentShadow } from "../../src/studies/skin/rebuild/geometryEngine/shadowEvaluateContainment.ts";
import { WindowsLocalGeometryEngineClient } from "../../src/studies/skin/rebuild/geometryEngine/windowsLocalClient.ts";
import { PERSISTENT_BINARY_TRANSPORT } from "./compiled-executable-adapter.mjs";
import { PersistentCudaWorker } from "./persistent-cuda-worker.mjs";
import { probeWindowsCapability } from "./probe-windows-capability.mjs";
import { createLocalEngineServer, FIXED_HOST, FIXED_PORT } from "./server.mjs";

const SAMPLE_SIZES = [32_768, 100_000, 250_000];
const MEASURED_RUNS = 3;
const PRODUCTION_ORIGIN = "https://katachi.a-8c3.workers.dev";
const fixtureUrl = new URL("./fixtures/containment-v1.json", import.meta.url);
const baseFixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
const reportJsonUrl = new URL("./benchmarks/cuda-browser-helper-transport-2026-08-31.json", import.meta.url);
const reportMarkdownUrl = new URL("./benchmarks/cuda-browser-helper-transport-2026-08-31.md", import.meta.url);

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
      sampleId: `outer-${sampleCount}-${index}`,
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

function requestForSize(sampleCount) {
  return validateEvaluateContainmentJobRequest({
    ...structuredClone(baseFixture),
    clientRequestId: `browser-helper-${sampleCount}`,
    projectFingerprint: `sha256:browser-helper-${sampleCount}-v1`,
    quality: { purpose: "browser-helper-transport-benchmark", benchmarkIterations: 1 },
    input: {
      ...structuredClone(baseFixture.input),
      samples: deterministicSamples(sampleCount),
      boundaryTolerance: 0.00005,
    },
  });
}

function productionFetch(input, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Origin", PRODUCTION_ORIGIN);
  return fetch(input, { ...init, headers });
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function summarize(runs) {
  const timingKeys = Object.keys(runs[0].timing);
  return {
    runCount: runs.length,
    timingMedianMilliseconds: Object.fromEntries(timingKeys.map((key) => [
      key,
      median(runs.map((run) => run.timing[key])),
    ])),
    requestBytes: median(runs.map((run) => run.bytes.request)),
    responseBytes: median(runs.map((run) => run.bytes.response)),
    maximumAbsoluteMarginDelta: Math.max(...runs.map((run) => run.maximumAbsoluteMarginDelta)),
    allMatched: runs.every((run) => run.matched),
  };
}

function assertMatched(request, outcome) {
  assert.equal(outcome.candidateStatus, "candidate_matched", outcome.fallback?.detail);
  assert.equal(outcome.comparison?.matched, true);
  assert.equal(outcome.comparison?.missingSampleIds.length, 0);
  assert.equal(outcome.comparison?.discreteMismatchSampleIds.length, 0);
  assert.equal(outcome.authoritative.backend.backendKind, "web");
  assert.equal(outcome.authoritative.productionApplied, false);
  assert.equal(outcome.shadowOnly, true);
  assert.equal(outcome.productionApplied, false);
  assert.ok(outcome.candidate);
  assert.equal(outcome.candidate.backend.deviceName, EXPECTED_CUDA_DEVICE_NAME);
  assert.equal(outcome.candidate.backend.artifactSha256, EXPECTED_CUDA_EXECUTABLE_SHA256);
  assert.equal(outcome.candidate.shadow, true);
  assert.equal(outcome.candidate.productionApplied, false);
  for (let index = 0; index < request.input.samples.length; index += 1) {
    const identity = request.input.samples[index];
    const web = outcome.authoritative.result.samples[index];
    const cuda = outcome.candidate.result.samples[index];
    assert.equal(cuda.sampleId, identity.sampleId);
    assert.equal(cuda.edgeId, identity.edgeId);
    assert.equal(cuda.classification, web.classification);
    assert.equal(Number.isFinite(cuda.radiusAdjustedMargin), true);
  }
}

async function executeRun(baseRequest, sampleCount, transport, phase, index) {
  const request = {
    ...baseRequest,
    clientRequestId: `browser-helper-${sampleCount}-${transport}-${phase}-${index}`,
  };
  const client = new WindowsLocalGeometryEngineClient({
    fetch: productionFetch,
    pollIntervalMs: 0,
    transport,
  });
  const fullStart = performance.now();
  const outcome = await evaluateContainmentShadow(request, {
    preferWindowsCuda: true,
    localClient: client,
    comparisonMarginTolerance: request.input.boundaryTolerance,
  });
  const fullApplicationMilliseconds = performance.now() - fullStart;
  assertMatched(request, outcome);
  const clientTiming = client.getLastTransportTiming();
  assert.ok(clientTiming);
  assert.equal(clientTiming.transport, transport);
  const cudaTiming = outcome.candidate.backend.timing;
  assert.ok(cudaTiming);
  const helperKnown = (clientTiming.helperDecodeMilliseconds ?? 0)
    + (clientTiming.workerTotalMilliseconds ?? 0)
    + (clientTiming.helperResponseEncodeMilliseconds ?? 0);
  return {
    phase,
    index,
    transport,
    timing: {
      requestEncoding: clientTiming.requestEncodingMilliseconds,
      httpRoundTrip: clientTiming.httpRoundTripMilliseconds,
      helperDecode: clientTiming.helperDecodeMilliseconds ?? 0,
      worker: clientTiming.workerTotalMilliseconds ?? 0,
      workerRoundTrip: clientTiming.workerRoundTripMilliseconds ?? 0,
      helperResponseEncode: clientTiming.helperResponseEncodeMilliseconds ?? 0,
      browserResponseDecode: clientTiming.responseDecodeMilliseconds,
      semanticValidation: clientTiming.semanticValidationMilliseconds,
      clientTotal: clientTiming.totalMilliseconds,
      fullApplication: fullApplicationMilliseconds,
      httpAndProtocolResidual: Math.max(0, clientTiming.httpRoundTripMilliseconds - helperKnown),
      cudaEndToEnd: cudaTiming.endToEndMilliseconds,
      cudaKernel: cudaTiming.kernelAverageMilliseconds,
      webAuthoritative: outcome.authoritative.backend.timing?.endToEndMilliseconds ?? 0,
    },
    bytes: {
      request: clientTiming.requestBytes,
      response: clientTiming.responseBytes,
    },
    matched: outcome.comparison.matched,
    maximumAbsoluteMarginDelta: outcome.comparison.maximumAbsoluteMarginDelta,
    marginTolerance: outcome.comparison.marginTolerance,
    shadow: outcome.shadowOnly,
    productionApplied: outcome.productionApplied,
  };
}

const probe = probeWindowsCapability();
assert.equal(probe.cudaBackend.available, true, probe.cudaBackend.reasonCode);
const worker = new PersistentCudaWorker({ defaultTransport: PERSISTENT_BINARY_TRANSPORT });
const server = createLocalEngineServer({
  probe,
  persistentWorker: worker,
  workerTransport: PERSISTENT_BINARY_TRANSPORT,
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(FIXED_PORT, FIXED_HOST, resolve);
});

const report = {
  contract: "katachi.cuda-browser-helper-transport-benchmark.v1",
  recordedAt: new Date().toISOString(),
  policy: { authoritativeBackend: "web", candidateBackend: "cuda", shadow: true, productionApplied: false },
  environment: {
    deviceName: probe.compiledExecutable.capabilities.device.name,
    artifactSha256: probe.compiledExecutable.artifactSha256,
    endpoint: `http://${FIXED_HOST}:${FIXED_PORT}/v1`,
    workerTransport: PERSISTENT_BINARY_TRANSPORT,
  },
  methodology: {
    sampleSizes: SAMPLE_SIZES,
    warmupRuns: 1,
    measuredRuns: MEASURED_RUNS,
    jsonRoute: "/v1/jobs (reference)",
    binaryRoute: "/v1/evaluate-containment-binary (performance candidate)",
    comparison: "every run validates ordered sample/edge identity, exact classification, finite margins, and tolerance against authoritative Web",
  },
  sizes: [],
};

try {
  for (const sampleCount of SAMPLE_SIZES) {
    const request = requestForSize(sampleCount);
    const warmup = [];
    for (const transport of ["json", "binary"]) {
      warmup.push(await executeRun(request, sampleCount, transport, "warmup", 0));
    }
    const runs = { json: [], binary: [] };
    for (let index = 1; index <= MEASURED_RUNS; index += 1) {
      for (const transport of index % 2 === 0 ? ["binary", "json"] : ["json", "binary"]) {
        runs[transport].push(await executeRun(request, sampleCount, transport, "measured", index));
      }
    }
    report.sizes.push({
      sampleCount,
      warmup,
      runs,
      summary: { json: summarize(runs.json), binary: summarize(runs.binary) },
    });
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}

await writeFile(reportJsonUrl, `${JSON.stringify(report, null, 2)}\n`);
const lines = [
  "# CUDA-4A Browser / Helper Transport Benchmark",
  "",
  "Web remains authoritative. CUDA is a shadow candidate only; `productionApplied=false` for every run.",
  "",
  "| Samples | Transport | Encode | HTTP | Helper decode | Worker | Helper encode | Browser decode | Semantic validate | Client total | Full path | Request | Response | Max margin Δ |",
  "|---:|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
];
for (const size of report.sizes) {
  for (const transport of ["json", "binary"]) {
    const summary = size.summary[transport];
    const timing = summary.timingMedianMilliseconds;
    lines.push(`| ${size.sampleCount.toLocaleString("en-US")} | ${transport} | ${timing.requestEncoding.toFixed(2)} ms | ${timing.httpRoundTrip.toFixed(2)} ms | ${timing.helperDecode.toFixed(2)} ms | ${timing.worker.toFixed(2)} ms | ${timing.helperResponseEncode.toFixed(2)} ms | ${timing.browserResponseDecode.toFixed(2)} ms | ${timing.semanticValidation.toFixed(2)} ms | ${timing.clientTotal.toFixed(2)} ms | ${timing.fullApplication.toFixed(2)} ms | ${(summary.requestBytes / 1024 / 1024).toFixed(2)} MiB | ${(summary.responseBytes / 1024 / 1024).toFixed(2)} MiB | ${summary.maximumAbsoluteMarginDelta.toExponential(3)} |`);
  }
}
lines.push("", "Both routes use the same persistent CUDA context and compact worker transport. JSON remains the reference/debug route.");
await writeFile(reportMarkdownUrl, `${lines.join("\n")}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
