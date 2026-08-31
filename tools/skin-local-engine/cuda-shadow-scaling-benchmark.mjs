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
import { runCompiledContainment } from "./compiled-executable-adapter.mjs";
import { probeWindowsCapability } from "./probe-windows-capability.mjs";
import {
  createLocalEngineServer,
  FIXED_HOST,
  FIXED_PORT,
  MAXIMUM_CONTAINMENT_SAMPLES,
  MAXIMUM_JOB_BYTES,
} from "./server.mjs";

const SAMPLE_SIZES = [5, 32_768, 100_000, 250_000];
const WARM_RUNS = 5;
const PRODUCTION_ORIGIN = "https://katachi.a-8c3.workers.dev";
const fixtureUrl = new URL("./fixtures/containment-v1.json", import.meta.url);
const baseFixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
const outputArgument = process.argv.find((argument) => argument.startsWith("--output="));
const outputPath = outputArgument?.slice("--output=".length);

if (process.platform !== "win32") {
  process.stdout.write(`${JSON.stringify({
    contract: "katachi.cuda-shadow-scaling-benchmark.v1",
    skipped: true,
    reason: "windows_required",
  })}\n`);
  process.exit(0);
}

function deterministicSamples(sampleCount) {
  if (sampleCount === baseFixture.input.samples.length) {
    return structuredClone(baseFixture.input.samples);
  }
  const side = Math.ceil(Math.cbrt(sampleCount));
  const samples = new Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    const x = index % side;
    const y = Math.floor(index / side) % side;
    const z = Math.floor(index / (side * side));
    samples[index] = {
      sampleId: `bench-${index}`,
      edgeId: `edge-${index % 257}`,
      position: {
        x: -2.6 + (5.2 * x) / (side - 1),
        y: -2.6 + (5.2 * y) / (side - 1),
        z: -2.6 + (5.2 * z) / (side - 1),
      },
      radius: 0.04 + (index % 7) * 0.01,
    };
  }
  return samples;
}

function requestForSize(sampleCount) {
  return validateEvaluateContainmentJobRequest({
    ...structuredClone(baseFixture),
    clientRequestId: `cuda-shadow-scaling-${sampleCount}`,
    projectFingerprint: `sha256:katachi-cuda-shadow-scaling-${sampleCount}-v1`,
    quality: { purpose: "shadow-scaling-benchmark", benchmarkIterations: 1 },
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

class InstrumentedLocalClient extends WindowsLocalGeometryEngineClient {
  probeMilliseconds = 0;
  helperRoundTripMilliseconds = 0;

  async probeCapabilities() {
    const start = performance.now();
    try {
      return await super.probeCapabilities();
    } finally {
      this.probeMilliseconds = performance.now() - start;
    }
  }

  async evaluateContainment(request) {
    const start = performance.now();
    try {
      return await super.evaluateContainment(request);
    } finally {
      this.helperRoundTripMilliseconds = performance.now() - start;
    }
  }
}

function assertMatchedOutcome(request, outcome) {
  assert.equal(outcome.candidateStatus, "candidate_matched", outcome.fallback?.detail);
  assert.equal(outcome.comparison?.matched, true);
  assert.equal(outcome.comparison?.missingSampleIds.length, 0);
  assert.equal(outcome.comparison?.discreteMismatchSampleIds.length, 0);
  assert.equal(outcome.authoritative.backend.backendKind, "web");
  assert.equal(outcome.authoritative.shadow, true);
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
  assert.equal(candidate.result.samples.length, request.input.samples.length);
  assert.equal(outcome.authoritative.result.samples.length, request.input.samples.length);
  for (let index = 0; index < request.input.samples.length; index += 1) {
    const expected = request.input.samples[index];
    const authoritative = outcome.authoritative.result.samples[index];
    const actual = candidate.result.samples[index];
    assert.equal(actual.sampleId, expected.sampleId, `sample identity mismatch at ${index}`);
    assert.equal(actual.edgeId, expected.edgeId, `edge identity mismatch at ${index}`);
    assert.equal(actual.classification, authoritative.classification,
      `classification mismatch at ${index}`);
    assert.equal(Number.isFinite(actual.baseSignedDistance), true);
    assert.equal(Number.isFinite(actual.radiusAdjustedMargin), true);
    assert.equal(Number.isFinite(actual.radiusClearance), true);
  }
  assert.ok(outcome.comparison.maximumAbsoluteMarginDelta <= outcome.comparison.marginTolerance);
  return candidate;
}

function numericStats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  const middle = Math.floor(sorted.length / 2);
  return {
    mean: sum / sorted.length,
    median: sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle],
    minimum: sorted[0],
    maximum: sorted.at(-1),
  };
}

const timingKeys = [
  "shadowPathEndToEndMilliseconds",
  "capabilityProbeMilliseconds",
  "clientHelperRoundTripMilliseconds",
  "helperJobMilliseconds",
  "adapterTotalMilliseconds",
  "capabilityInspectionMilliseconds",
  "adapterRequestSerializeMilliseconds",
  "executableProcessMilliseconds",
  "executableEndToEndMilliseconds",
  "cudaSetupContextPtxMilliseconds",
  "cudaTransferAllocationResidualMilliseconds",
  "cudaKernelMilliseconds",
  "processProtocolResidualMilliseconds",
  "adapterResultParseMilliseconds",
  "adapterResultValidationMilliseconds",
  "clientTransportPollJsonValidationResidualMilliseconds",
];

function summarizeWarmRuns(runs) {
  return Object.fromEntries(timingKeys.map((key) => [
    key,
    numericStats(runs.map((run) => run.timing[key])),
  ]));
}

const probe = probeWindowsCapability();
assert.equal(probe.cudaBackend.available, true, probe.cudaBackend.reasonCode);
assert.equal(probe.compiledExecutable.capabilities.device.name, EXPECTED_CUDA_DEVICE_NAME);
assert.equal(probe.compiledExecutable.artifactSha256, EXPECTED_CUDA_EXECUTABLE_SHA256);
assert.equal(probe.compiledExecutable.capabilities.precisionMode, "float32");
assert.equal(probe.compiledExecutable.capabilities.shadow, true);
assert.equal(probe.compiledExecutable.capabilities.productionApplied, false);

const helperMeasurements = new Map();
const server = createLocalEngineServer({
  probe,
  runContainment(request) {
    const start = performance.now();
    const executed = runCompiledContainment(request);
    helperMeasurements.set(request.clientRequestId, {
      helperJobMilliseconds: performance.now() - start,
      adapterTiming: executed.adapterTiming,
    });
    return executed;
  },
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(FIXED_PORT, FIXED_HOST, resolve);
});

const report = {
  contract: "katachi.cuda-shadow-scaling-benchmark.v1",
  recordedAt: new Date().toISOString(),
  environment: {
    deviceName: probe.compiledExecutable.capabilities.device.name,
    precisionMode: probe.compiledExecutable.capabilities.precisionMode,
    driverVersion: probe.driver.driverVersion,
    cudaRuntimeReported: probe.driver.cudaRuntimeReported,
    artifactSha256: probe.compiledExecutable.artifactSha256,
    helperEndpoint: `http://${FIXED_HOST}:${FIXED_PORT}/v1`,
    maximumJobBytes: MAXIMUM_JOB_BYTES,
    maximumContainmentSamples: MAXIMUM_CONTAINMENT_SAMPLES,
  },
  policy: {
    authoritativeBackend: "web",
    candidateBackend: "cuda",
    shadow: true,
    productionApplied: false,
  },
  methodology: {
    sampleSizes: SAMPLE_SIZES,
    firstRunsPerSize: 1,
    warmRunsPerSize: WARM_RUNS,
    benchmarkIterationsPerExecutable: 1,
    firstRunDefinition: "first job for this sample size in this benchmark session",
    warmRunDefinition: "five immediately subsequent jobs; every job still launches a fresh process, CUDA context, and PTX module",
    transferTimingLimitation: "The reviewed hash-pinned executable combines sample allocation, H-to-D, event setup, D-to-H, and synchronization in the executable residual; transfer directions are not separately instrumented.",
  },
  sizes: [],
};

try {
  for (const sampleCount of SAMPLE_SIZES) {
    const baseRequest = requestForSize(sampleCount);
    const fixtureSerializationStart = performance.now();
    const serializedFixture = JSON.stringify(baseRequest);
    const fixtureSerializeMilliseconds = performance.now() - fixtureSerializationStart;
    const requestBytes = Buffer.byteLength(serializedFixture);
    assert.ok(requestBytes <= MAXIMUM_JOB_BYTES,
      `${sampleCount} sample fixture (${requestBytes} bytes) exceeds helper request limit`);
    const runs = [];
    for (let runIndex = 0; runIndex <= WARM_RUNS; runIndex += 1) {
      const request = {
        ...baseRequest,
        clientRequestId: `cuda-shadow-scaling-${sampleCount}-run-${runIndex + 1}`,
      };
      const localClient = new InstrumentedLocalClient({ fetch: productionFetch });
      const shadowStart = performance.now();
      const outcome = await evaluateContainmentShadow(request, {
        preferWindowsCuda: true,
        localClient,
        comparisonMarginTolerance: request.input.boundaryTolerance,
      });
      const shadowPathEndToEndMilliseconds = performance.now() - shadowStart;
      const candidate = assertMatchedOutcome(request, outcome);
      const helper = helperMeasurements.get(request.clientRequestId);
      assert.ok(helper, "helper measurement missing for completed CUDA job");
      const cudaTiming = candidate.backend.timing;
      assert.ok(cudaTiming);
      const adapter = helper.adapterTiming;
      const cudaTransferAllocationResidualMilliseconds = Math.max(
        0,
        cudaTiming.endToEndMilliseconds
          - cudaTiming.setupMilliseconds
          - cudaTiming.kernelTotalMilliseconds,
      );
      const processProtocolResidualMilliseconds = Math.max(
        0,
        adapter.executableProcessMilliseconds - cudaTiming.endToEndMilliseconds,
      );
      const clientTransportPollJsonValidationResidualMilliseconds = Math.max(
        0,
        localClient.helperRoundTripMilliseconds - helper.helperJobMilliseconds,
      );
      const run = {
        run: runIndex + 1,
        phase: runIndex === 0 ? "first" : "warm",
        timing: {
          shadowPathEndToEndMilliseconds,
          capabilityProbeMilliseconds: localClient.probeMilliseconds,
          clientHelperRoundTripMilliseconds: localClient.helperRoundTripMilliseconds,
          helperJobMilliseconds: helper.helperJobMilliseconds,
          adapterTotalMilliseconds: adapter.totalMilliseconds,
          capabilityInspectionMilliseconds: adapter.capabilityInspectionMilliseconds,
          adapterRequestSerializeMilliseconds: adapter.requestSerializeMilliseconds,
          executableProcessMilliseconds: adapter.executableProcessMilliseconds,
          executableEndToEndMilliseconds: cudaTiming.endToEndMilliseconds,
          cudaSetupContextPtxMilliseconds: cudaTiming.setupMilliseconds,
          cudaTransferAllocationResidualMilliseconds,
          cudaKernelMilliseconds: cudaTiming.kernelTotalMilliseconds,
          processProtocolResidualMilliseconds,
          adapterResultParseMilliseconds: adapter.resultParseMilliseconds,
          adapterResultValidationMilliseconds: adapter.resultValidationMilliseconds,
          clientTransportPollJsonValidationResidualMilliseconds,
        },
        bytes: {
          request: adapter.requestBytes,
          executableResult: adapter.resultBytes,
        },
        comparison: {
          matched: outcome.comparison.matched,
          missingSampleCount: outcome.comparison.missingSampleIds.length,
          discreteMismatchSampleCount: outcome.comparison.discreteMismatchSampleIds.length,
          maximumAbsoluteMarginDelta: outcome.comparison.maximumAbsoluteMarginDelta,
          marginTolerance: outcome.comparison.marginTolerance,
        },
        authoritativeBackend: outcome.authoritative.backend.backendKind,
        candidateBackend: candidate.backend.backendKind,
        shadow: outcome.shadowOnly,
        productionApplied: outcome.productionApplied,
      };
      runs.push(run);
      process.stdout.write(
        `${sampleCount} samples ${run.phase} ${run.run}: `
        + `client=${localClient.helperRoundTripMilliseconds.toFixed(3)} ms `
        + `helper=${helper.helperJobMilliseconds.toFixed(3)} ms `
        + `exe=${cudaTiming.endToEndMilliseconds.toFixed(3)} ms `
        + `kernel=${cudaTiming.kernelTotalMilliseconds.toFixed(6)} ms `
        + `margin=${outcome.comparison.maximumAbsoluteMarginDelta}\n`,
      );
    }
    const warmRuns = runs.filter((run) => run.phase === "warm");
    report.sizes.push({
      sampleCount,
      deterministicFixture: {
        requestBytes,
        initialSerializeMilliseconds: fixtureSerializeMilliseconds,
      },
      first: runs[0],
      warm: {
        runCount: warmRuns.length,
        timing: summarizeWarmRuns(warmRuns),
        maximumAbsoluteMarginDelta: Math.max(
          ...warmRuns.map((run) => run.comparison.maximumAbsoluteMarginDelta),
        ),
        allMatched: warmRuns.every((run) => run.comparison.matched),
      },
      runs,
    });
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}

if (outputPath) {
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}
process.stdout.write(`${JSON.stringify({
  contract: report.contract,
  outputPath: outputPath ?? null,
  policy: report.policy,
  sizes: report.sizes.map((size) => ({
    sampleCount: size.sampleCount,
    requestBytes: size.deterministicFixture.requestBytes,
    firstClientMilliseconds: size.first.timing.clientHelperRoundTripMilliseconds,
    warmClientMedianMilliseconds: size.warm.timing.clientHelperRoundTripMilliseconds.median,
    warmHelperMedianMilliseconds: size.warm.timing.helperJobMilliseconds.median,
    warmExecutableMedianMilliseconds: size.warm.timing.executableEndToEndMilliseconds.median,
    warmKernelMedianMilliseconds: size.warm.timing.cudaKernelMilliseconds.median,
    maximumAbsoluteMarginDelta: Math.max(
      size.first.comparison.maximumAbsoluteMarginDelta,
      size.warm.maximumAbsoluteMarginDelta,
    ),
    allMatched: size.first.comparison.matched && size.warm.allMatched,
  })),
}, null, 2)}\n`);
