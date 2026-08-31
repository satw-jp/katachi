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
import { PersistentCudaWorker } from "./persistent-cuda-worker.mjs";
import { probeWindowsCapability } from "./probe-windows-capability.mjs";
import {
  createLocalEngineServer,
  FIXED_HOST,
  FIXED_PORT,
  MAXIMUM_CONTAINMENT_SAMPLES,
  MAXIMUM_JOB_BYTES,
} from "./server.mjs";

const sizesArgument = process.argv.find((argument) => argument.startsWith("--sizes="));
const SAMPLE_SIZES = sizesArgument
  ? sizesArgument.slice("--sizes=".length).split(",").map((value) => Number.parseInt(value, 10))
  : [5, 32_768, 100_000, 250_000];
if (SAMPLE_SIZES.some((value) => ![5, 32_768, 100_000, 250_000].includes(value))) {
  throw new Error("--sizes must contain only 5,32768,100000,250000");
}
const WARM_RUNS = 10;
const PRODUCTION_ORIGIN = "https://katachi.a-8c3.workers.dev";
const fixtureUrl = new URL("./fixtures/containment-v1.json", import.meta.url);
const baseFixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
const outputArgument = process.argv.find((argument) => argument.startsWith("--output="));
const outputPath = outputArgument?.slice("--output=".length);

if (process.platform !== "win32") {
  process.stdout.write(`${JSON.stringify({
    contract: "katachi.cuda-persistent-json-benchmark.v1",
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
  "workerStartupMilliseconds",
  "workerInitializationMilliseconds",
  "adapterRequestSerializeMilliseconds",
  "workerRoundTripMilliseconds",
  "executableEndToEndMilliseconds",
  "cudaSetupMilliseconds",
  "cudaContextInitializationMilliseconds",
  "cudaBufferPreparationMilliseconds",
  "cudaHostToDeviceMilliseconds",
  "cudaKernelMilliseconds",
  "cudaDeviceToHostMilliseconds",
  "workerJsonProtocolResidualMilliseconds",
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
const persistentWorker = new PersistentCudaWorker();
const server = createLocalEngineServer({
  probe,
  persistentWorker,
  async runContainment(request) {
    const start = performance.now();
    const executed = await persistentWorker.evaluate(request);
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
  contract: "katachi.cuda-persistent-json-benchmark.v1",
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
    baselineCommit: "e185df3f32b88c84a3b4a45e703cbfa7e34aea4a",
    sampleSizes: SAMPLE_SIZES,
    firstRunsPerSize: 1,
    warmRunsPerSize: WARM_RUNS,
    benchmarkIterationsPerExecutable: 1,
    firstRunDefinition: "first job after explicitly terminating the worker for this sample size; includes process start, context creation, and PTX JIT",
    warmRunDefinition: "ten immediately subsequent jobs in the same process, context, module, and kernel function",
    transport: "length-framed-json-v1",
  },
  sizes: [],
};

try {
  for (const sampleCount of SAMPLE_SIZES) {
    await persistentWorker.terminateWorker();
    const baseRequest = requestForSize(sampleCount);
    const fixtureSerializationStart = performance.now();
    const serializedFixture = JSON.stringify(baseRequest);
    const fixtureSerializeMilliseconds = performance.now() - fixtureSerializationStart;
    const requestBytes = Buffer.byteLength(serializedFixture);
    assert.ok(requestBytes <= MAXIMUM_JOB_BYTES,
      `${sampleCount} sample fixture (${requestBytes} bytes) exceeds helper request limit`);
    const runs = [];
    for (let runIndex = 0; runIndex <= WARM_RUNS; runIndex += 1) {
      await (async () => {
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
      const workerJsonProtocolResidualMilliseconds = Math.max(
        0,
        adapter.workerRoundTripMilliseconds - cudaTiming.endToEndMilliseconds,
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
          workerStartupMilliseconds: adapter.workerStartupMilliseconds,
          workerInitializationMilliseconds: adapter.workerInitializationMilliseconds,
          adapterRequestSerializeMilliseconds: adapter.requestSerializeMilliseconds,
          workerRoundTripMilliseconds: adapter.workerRoundTripMilliseconds,
          executableEndToEndMilliseconds: cudaTiming.endToEndMilliseconds,
          cudaSetupMilliseconds: cudaTiming.setupMilliseconds,
          cudaContextInitializationMilliseconds: cudaTiming.contextInitializationMilliseconds,
          cudaBufferPreparationMilliseconds: cudaTiming.bufferPreparationMilliseconds,
          cudaHostToDeviceMilliseconds: cudaTiming.hostToDeviceMilliseconds,
          cudaKernelMilliseconds: cudaTiming.kernelTotalMilliseconds,
          cudaDeviceToHostMilliseconds: cudaTiming.deviceToHostMilliseconds,
          workerJsonProtocolResidualMilliseconds,
          adapterResultParseMilliseconds: adapter.resultParseMilliseconds,
          adapterResultValidationMilliseconds: adapter.resultValidationMilliseconds,
          clientTransportPollJsonValidationResidualMilliseconds,
        },
        bytes: {
          request: adapter.requestBytes,
          executableResult: adapter.resultBytes,
          requestFrame: adapter.requestFrameBytes,
          resultFrame: adapter.resultFrameBytes,
        },
        worker: {
          pid: adapter.workerPid,
          generation: adapter.workerGeneration,
          requestIndex: adapter.workerRequestIndex,
          persistentProcess: adapter.persistentProcess,
          contextReused: cudaTiming.contextReused,
          moduleReused: cudaTiming.moduleReused,
          functionReused: cudaTiming.functionReused,
          ballBufferReused: cudaTiming.ballBufferReused,
          sampleBufferReused: cudaTiming.sampleBufferReused,
          outputBufferReused: cudaTiming.outputBufferReused,
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
      assert.equal(run.worker.persistentProcess, true);
      assert.equal(run.worker.contextReused, true);
      assert.equal(run.worker.moduleReused, true);
      assert.equal(run.worker.functionReused, true);
      if (runIndex > 0) {
        assert.equal(run.worker.pid, runs[0].worker.pid, "warm jobs must reuse the worker process");
        assert.equal(run.worker.generation, runs[0].worker.generation,
          "warm jobs must reuse the worker generation");
        assert.equal(adapter.workerStartupMilliseconds, 0);
        assert.equal(run.worker.ballBufferReused, true);
        assert.equal(run.worker.sampleBufferReused, true);
        assert.equal(run.worker.outputBufferReused, true);
      }
      runs.push(run);
      process.stdout.write(
        `${sampleCount} samples ${run.phase} ${run.run}: `
        + `client=${localClient.helperRoundTripMilliseconds.toFixed(3)} ms `
        + `helper=${helper.helperJobMilliseconds.toFixed(3)} ms `
        + `worker=${adapter.workerRoundTripMilliseconds.toFixed(3)} ms `
        + `exe=${cudaTiming.endToEndMilliseconds.toFixed(3)} ms `
        + `kernel=${cudaTiming.kernelTotalMilliseconds.toFixed(6)} ms `
        + `margin=${outcome.comparison.maximumAbsoluteMarginDelta}\n`,
      );
      })();
      globalThis.gc?.();
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
    firstWorkerStartupMilliseconds: size.first.timing.workerStartupMilliseconds,
    warmClientMedianMilliseconds: size.warm.timing.clientHelperRoundTripMilliseconds.median,
    warmHelperMedianMilliseconds: size.warm.timing.helperJobMilliseconds.median,
    warmWorkerRoundTripMedianMilliseconds: size.warm.timing.workerRoundTripMilliseconds.median,
    warmExecutableMedianMilliseconds: size.warm.timing.executableEndToEndMilliseconds.median,
    warmKernelMedianMilliseconds: size.warm.timing.cudaKernelMilliseconds.median,
    maximumAbsoluteMarginDelta: Math.max(
      size.first.comparison.maximumAbsoluteMarginDelta,
      size.warm.maximumAbsoluteMarginDelta,
    ),
    allMatched: size.first.comparison.matched && size.warm.allMatched,
  })),
}, null, 2)}\n`);
