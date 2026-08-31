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
import {
  PERSISTENT_BINARY_TRANSPORT,
  PERSISTENT_JSON_TRANSPORT,
} from "./compiled-executable-adapter.mjs";
import { PersistentCudaWorker } from "./persistent-cuda-worker.mjs";
import { probeWindowsCapability } from "./probe-windows-capability.mjs";
import {
  createLocalEngineServer,
  FIXED_HOST,
  FIXED_PORT,
  MAXIMUM_CONTAINMENT_SAMPLES,
  MAXIMUM_JOB_BYTES,
} from "./server.mjs";

const validSizes = [32_768, 100_000, 250_000];
const sizesArgument = process.argv.find((argument) => argument.startsWith("--sizes="));
const SAMPLE_SIZES = sizesArgument
  ? sizesArgument.slice("--sizes=".length).split(",").map((value) => Number.parseInt(value, 10))
  : validSizes;
if (SAMPLE_SIZES.some((value) => !validSizes.includes(value))) {
  throw new Error("--sizes must contain only 32768,100000,250000");
}
const RUNS_PER_TRANSPORT = 5;
const PRODUCTION_ORIGIN = "https://katachi.a-8c3.workers.dev";
const outputArgument = process.argv.find((argument) => argument.startsWith("--output="));
const outputPath = outputArgument?.slice("--output=".length);
const fixtureUrl = new URL("./fixtures/containment-v1.json", import.meta.url);
const baseFixture = JSON.parse(await readFile(fixtureUrl, "utf8"));

if (process.platform !== "win32") {
  process.stdout.write(`${JSON.stringify({
    contract: "katachi.cuda-persistent-transport-benchmark.v1",
    skipped: true,
    reason: "windows_required",
  })}\n`);
  process.exit(0);
}

function deterministicSamples(sampleCount) {
  const side = Math.ceil(Math.cbrt(sampleCount));
  return Array.from({ length: sampleCount }, (_, index) => {
    const x = index % side;
    const y = Math.floor(index / side) % side;
    const z = Math.floor(index / (side * side));
    return {
      sampleId: `bench-${index}`,
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
    clientRequestId: `cuda-shadow-transport-${sampleCount}`,
    projectFingerprint: `sha256:katachi-cuda-shadow-transport-${sampleCount}-v1`,
    quality: { purpose: "shadow-transport-benchmark", benchmarkIterations: 1 },
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
  helperRoundTripMilliseconds = 0;

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
  const candidate = outcome.candidate;
  assert.ok(candidate);
  assert.equal(candidate.backend.backendKind, "cuda");
  assert.equal(candidate.backend.deviceName, EXPECTED_CUDA_DEVICE_NAME);
  assert.equal(candidate.backend.precisionMode, "float32");
  assert.equal(candidate.backend.artifactSha256, EXPECTED_CUDA_EXECUTABLE_SHA256);
  assert.equal(candidate.shadow, true);
  assert.equal(candidate.productionApplied, false);
  assert.equal(candidate.result.samples.length, request.input.samples.length);
  for (let index = 0; index < request.input.samples.length; index += 1) {
    const expected = request.input.samples[index];
    const web = outcome.authoritative.result.samples[index];
    const cuda = candidate.result.samples[index];
    assert.equal(cuda.sampleId, expected.sampleId, `sample identity mismatch at ${index}`);
    assert.equal(cuda.edgeId, expected.edgeId, `edge identity mismatch at ${index}`);
    assert.equal(cuda.classification, web.classification, `classification mismatch at ${index}`);
    assert.equal(Number.isFinite(cuda.baseSignedDistance), true);
    assert.equal(Number.isFinite(cuda.radiusAdjustedMargin), true);
    assert.equal(Number.isFinite(cuda.radiusClearance), true);
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
  "clientHelperRoundTripMilliseconds",
  "helperJobMilliseconds",
  "adapterTotalMilliseconds",
  "requestEncodeMilliseconds",
  "requestIdentityHashMilliseconds",
  "requestPayloadBuildMilliseconds",
  "workerRoundTripMilliseconds",
  "nativeRequestDecodeMilliseconds",
  "cudaEndToEndMilliseconds",
  "cudaHostToDeviceMilliseconds",
  "cudaKernelMilliseconds",
  "cudaDeviceToHostMilliseconds",
  "nativeResponseEncodeMilliseconds",
  "workerProtocolResidualMilliseconds",
  "resultDecodeMilliseconds",
  "resultValidationMilliseconds",
  "outerHttpJsonResidualMilliseconds",
];

function summarize(runs) {
  return {
    runCount: runs.length,
    timing: Object.fromEntries(timingKeys.map((key) => [
      key,
      numericStats(runs.map((run) => run.timing[key])),
    ])),
    requestBytes: numericStats(runs.map((run) => run.bytes.request)),
    resultBytes: numericStats(runs.map((run) => run.bytes.result)),
    maximumAbsoluteMarginDelta: Math.max(...runs.map((run) => run.comparison.maximumAbsoluteMarginDelta)),
    allMatched: runs.every((run) => run.comparison.matched),
  };
}

const probe = probeWindowsCapability();
assert.equal(probe.cudaBackend.available, true, probe.cudaBackend.reasonCode);
assert.equal(probe.compiledExecutable.capabilities.device.name, EXPECTED_CUDA_DEVICE_NAME);
assert.equal(probe.compiledExecutable.artifactSha256, EXPECTED_CUDA_EXECUTABLE_SHA256);
assert.ok(probe.compiledExecutable.capabilities.workerTransports.includes(PERSISTENT_JSON_TRANSPORT));
assert.ok(probe.compiledExecutable.capabilities.workerTransports.includes(PERSISTENT_BINARY_TRANSPORT));

const persistentWorker = new PersistentCudaWorker();
const helperMeasurements = new Map();
let selectedTransport = PERSISTENT_JSON_TRANSPORT;
const server = createLocalEngineServer({
  probe,
  persistentWorker,
  async runContainment(request) {
    const transport = selectedTransport;
    const start = performance.now();
    const executed = await persistentWorker.evaluate(request, { transport });
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
  contract: "katachi.cuda-persistent-transport-benchmark.v1",
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
  protocol: {
    outerGeometryEngineTransport: "JSON HTTP (unchanged portable semantic contract)",
    framing: "KCF1 16-byte little-endian length frame",
    json: PERSISTENT_JSON_TRANSPORT,
    binary: PERSISTENT_BINARY_TRANSPORT,
    binaryRequest: "96-byte KCB1 header; SHA-256 identity fingerprint; unit/coordinate metadata; counts/offsets; packed ball/sample float32x4",
    binaryResponse: "176-byte KBR1 header; echoed identity fingerprint; reuse/timing/capacity metadata; packed float32 distance/margin/clearance + uint32 classification",
    identityMapping: "ordered host-side sampleId/edgeId table; strings never cross the worker boundary in binary mode",
  },
  methodology: {
    persistentJsonCommit: "f0b37e35e2a767d77edf42eb41d6505f1d7e2826",
    sampleSizes: SAMPLE_SIZES,
    warmupRunsPerTransport: 1,
    measuredRunsPerTransport: RUNS_PER_TRANSPORT,
    benchmarkIterationsPerExecutable: 1,
    comparison: "every warmup and measured run checked ordered sample/edge identity, exact classification, finite values, and margin tolerance against Web",
    lifecycle: "JSON and binary alternate in the same worker PID/generation/context for each size",
  },
  sizes: [],
};

async function executeRun(baseRequest, sampleCount, transport, phase, runIndex) {
  selectedTransport = transport;
  const tag = transport === PERSISTENT_JSON_TRANSPORT ? "json" : "binary";
  const request = {
    ...baseRequest,
    clientRequestId: `cuda-shadow-transport-${sampleCount}-${tag}-${phase}-${runIndex}`,
  };
  const client = new InstrumentedLocalClient({ fetch: productionFetch });
  const shadowStart = performance.now();
  const outcome = await evaluateContainmentShadow(request, {
    preferWindowsCuda: true,
    localClient: client,
    comparisonMarginTolerance: request.input.boundaryTolerance,
  });
  const shadowPathEndToEndMilliseconds = performance.now() - shadowStart;
  const candidate = assertMatchedOutcome(request, outcome);
  const helper = helperMeasurements.get(request.clientRequestId);
  helperMeasurements.delete(request.clientRequestId);
  assert.ok(helper, "helper timing is missing");
  const adapter = helper.adapterTiming;
  const cuda = candidate.backend.timing;
  assert.equal(adapter.transport, transport);
  const nativeRequestDecodeMilliseconds = cuda.nativeRequestDecodeMilliseconds ?? 0;
  const nativeResponseEncodeMilliseconds = cuda.nativeResponseEncodeMilliseconds ?? 0;
  return {
    phase,
    run: runIndex,
    transport,
    timing: {
      shadowPathEndToEndMilliseconds,
      clientHelperRoundTripMilliseconds: client.helperRoundTripMilliseconds,
      helperJobMilliseconds: helper.helperJobMilliseconds,
      adapterTotalMilliseconds: adapter.totalMilliseconds,
      requestEncodeMilliseconds: adapter.requestEncodeMilliseconds,
      requestIdentityHashMilliseconds: adapter.requestIdentityHashMilliseconds,
      requestPayloadBuildMilliseconds: adapter.requestPayloadBuildMilliseconds,
      workerRoundTripMilliseconds: adapter.workerRoundTripMilliseconds,
      nativeRequestDecodeMilliseconds,
      cudaEndToEndMilliseconds: cuda.endToEndMilliseconds,
      cudaHostToDeviceMilliseconds: cuda.hostToDeviceMilliseconds,
      cudaKernelMilliseconds: cuda.kernelTotalMilliseconds,
      cudaDeviceToHostMilliseconds: cuda.deviceToHostMilliseconds,
      nativeResponseEncodeMilliseconds,
      workerProtocolResidualMilliseconds: Math.max(
        0,
        adapter.workerRoundTripMilliseconds
          - cuda.endToEndMilliseconds
          - nativeRequestDecodeMilliseconds
          - nativeResponseEncodeMilliseconds,
      ),
      resultDecodeMilliseconds: adapter.resultDecodeMilliseconds,
      resultValidationMilliseconds: adapter.resultValidationMilliseconds,
      outerHttpJsonResidualMilliseconds: Math.max(
        0,
        client.helperRoundTripMilliseconds - helper.helperJobMilliseconds,
      ),
    },
    bytes: {
      request: adapter.requestBytes,
      requestFrame: adapter.requestFrameBytes,
      result: adapter.resultBytes,
      resultFrame: adapter.resultFrameBytes,
    },
    worker: {
      pid: adapter.workerPid,
      generation: adapter.workerGeneration,
      requestIndex: adapter.workerRequestIndex,
      contextReused: cuda.contextReused,
      moduleReused: cuda.moduleReused,
      functionReused: cuda.functionReused,
      ballBufferReused: cuda.ballBufferReused,
      sampleBufferReused: cuda.sampleBufferReused,
      outputBufferReused: cuda.outputBufferReused,
    },
    comparison: {
      matched: outcome.comparison.matched,
      maximumAbsoluteMarginDelta: outcome.comparison.maximumAbsoluteMarginDelta,
      marginTolerance: outcome.comparison.marginTolerance,
      missingSampleCount: outcome.comparison.missingSampleIds.length,
      discreteMismatchSampleCount: outcome.comparison.discreteMismatchSampleIds.length,
    },
    authoritativeBackend: outcome.authoritative.backend.backendKind,
    candidateBackend: candidate.backend.backendKind,
    shadow: outcome.shadowOnly,
    productionApplied: outcome.productionApplied,
  };
}

try {
  for (const sampleCount of SAMPLE_SIZES) {
    await persistentWorker.terminateWorker();
    const baseRequest = requestForSize(sampleCount);
    const outerRequestBytes = Buffer.byteLength(JSON.stringify(baseRequest));
    assert.ok(outerRequestBytes <= MAXIMUM_JOB_BYTES);
    const warmups = [];
    warmups.push(await executeRun(baseRequest, sampleCount, PERSISTENT_JSON_TRANSPORT, "warmup", 1));
    globalThis.gc?.();
    warmups.push(await executeRun(baseRequest, sampleCount, PERSISTENT_BINARY_TRANSPORT, "warmup", 1));
    globalThis.gc?.();
    const pid = warmups[0].worker.pid;
    const generation = warmups[0].worker.generation;
    assert.equal(warmups[1].worker.pid, pid);
    assert.equal(warmups[1].worker.generation, generation);
    const runs = { [PERSISTENT_JSON_TRANSPORT]: [], [PERSISTENT_BINARY_TRANSPORT]: [] };
    for (let pair = 0; pair < RUNS_PER_TRANSPORT; pair += 1) {
      const order = pair % 2 === 0
        ? [PERSISTENT_JSON_TRANSPORT, PERSISTENT_BINARY_TRANSPORT]
        : [PERSISTENT_BINARY_TRANSPORT, PERSISTENT_JSON_TRANSPORT];
      for (const transport of order) {
        const run = await executeRun(baseRequest, sampleCount, transport, "measured", pair + 1);
        assert.equal(run.worker.pid, pid);
        assert.equal(run.worker.generation, generation);
        assert.equal(run.worker.contextReused, true);
        assert.equal(run.worker.moduleReused, true);
        assert.equal(run.worker.functionReused, true);
        assert.equal(run.worker.ballBufferReused, true);
        assert.equal(run.worker.sampleBufferReused, true);
        assert.equal(run.worker.outputBufferReused, true);
        runs[transport].push(run);
        process.stdout.write(
          `${sampleCount} ${transport} ${pair + 1}: `
          + `client=${run.timing.clientHelperRoundTripMilliseconds.toFixed(3)} ms `
          + `helper=${run.timing.helperJobMilliseconds.toFixed(3)} ms `
          + `worker=${run.timing.workerRoundTripMilliseconds.toFixed(3)} ms `
          + `cuda=${run.timing.cudaEndToEndMilliseconds.toFixed(3)} ms `
          + `kernel=${run.timing.cudaKernelMilliseconds.toFixed(6)} ms\n`,
        );
        globalThis.gc?.();
      }
    }
    report.sizes.push({
      sampleCount,
      outerRequestBytes,
      worker: { pid, generation },
      warmups,
      transports: {
        [PERSISTENT_JSON_TRANSPORT]: summarize(runs[PERSISTENT_JSON_TRANSPORT]),
        [PERSISTENT_BINARY_TRANSPORT]: summarize(runs[PERSISTENT_BINARY_TRANSPORT]),
      },
      runs,
    });
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}

if (outputPath) await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({
  contract: report.contract,
  outputPath: outputPath ?? null,
  policy: report.policy,
  sizes: report.sizes.map((size) => ({
    sampleCount: size.sampleCount,
    json: {
      clientMedianMilliseconds: size.transports[PERSISTENT_JSON_TRANSPORT].timing.clientHelperRoundTripMilliseconds.median,
      helperMedianMilliseconds: size.transports[PERSISTENT_JSON_TRANSPORT].timing.helperJobMilliseconds.median,
      workerMedianMilliseconds: size.transports[PERSISTENT_JSON_TRANSPORT].timing.workerRoundTripMilliseconds.median,
      requestBytes: size.transports[PERSISTENT_JSON_TRANSPORT].requestBytes.median,
      resultBytes: size.transports[PERSISTENT_JSON_TRANSPORT].resultBytes.median,
    },
    binary: {
      clientMedianMilliseconds: size.transports[PERSISTENT_BINARY_TRANSPORT].timing.clientHelperRoundTripMilliseconds.median,
      helperMedianMilliseconds: size.transports[PERSISTENT_BINARY_TRANSPORT].timing.helperJobMilliseconds.median,
      workerMedianMilliseconds: size.transports[PERSISTENT_BINARY_TRANSPORT].timing.workerRoundTripMilliseconds.median,
      requestBytes: size.transports[PERSISTENT_BINARY_TRANSPORT].requestBytes.median,
      resultBytes: size.transports[PERSISTENT_BINARY_TRANSPORT].resultBytes.median,
    },
    maximumAbsoluteMarginDelta: Math.max(
      size.transports[PERSISTENT_JSON_TRANSPORT].maximumAbsoluteMarginDelta,
      size.transports[PERSISTENT_BINARY_TRANSPORT].maximumAbsoluteMarginDelta,
    ),
    allMatched: size.transports[PERSISTENT_JSON_TRANSPORT].allMatched
      && size.transports[PERSISTENT_BINARY_TRANSPORT].allMatched,
  })),
}, null, 2)}\n`);
