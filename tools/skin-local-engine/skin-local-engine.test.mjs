import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EVALUATE_CONTAINMENT_ALGORITHM,
  EXECUTABLE_CAPABILITIES_CONTRACT,
  EXECUTABLE_RESULT_CONTRACT,
  EXPECTED_CUDA_DEVICE_NAME,
  EXPECTED_COMPILED_EXECUTABLE_SHA256,
  PERSISTENT_BINARY_TRANSPORT,
  PERSISTENT_JSON_TRANSPORT,
  inspectCompiledEngine,
  validateExecutableCapabilities,
  validateExecutableResult,
} from "./compiled-executable-adapter.mjs";
import {
  parseNvidiaSmiSummary,
  probeWindowsCapability,
} from "./probe-windows-capability.mjs";
import {
  BROWSER_HELPER_BINARY_MEDIA_TYPE,
  COMPACT_BINARY_RESPONSE_HEADER_BYTES,
  encodeCompactBinaryRequest,
} from "./compact-binary-transport.mjs";
import {
  MAXIMUM_CONTAINMENT_SAMPLES,
  MAXIMUM_JOB_BYTES,
  createCapabilitiesDocument,
  createLocalEngineServer,
} from "./server.mjs";

test("nvidia-smi parsing does not confuse driver support with a compiler", () => {
  assert.deepEqual(
    parseNvidiaSmiSummary("Driver Version: 595.95    CUDA Version: 13.2"),
    { driverVersion: "595.95", cudaRuntimeReported: "13.2" },
  );
});

test("Windows probe keeps CUDA unavailable when the driver exists but the compiled adapter is absent", () => {
  const run = (command, args = []) => {
    if (command === "nvidia-smi.exe" && args.length === 0) {
      return { status: 0, stdout: "Driver Version: 595.95 CUDA Version: 13.2", stderr: "" };
    }
    if (command === "nvidia-smi.exe") {
      return { status: 0, stdout: "NVIDIA GeForce RTX 3080\n", stderr: "" };
    }
    return { status: 1, stdout: "", stderr: "not found" };
  };
  const probe = probeWindowsCapability({
    platform: "win32",
    run,
    compiledInspection: {
      available: false,
      reasonCode: "compiled_executable_absent",
      executablePath: "fixed-test-path.exe",
    },
  });
  assert.equal(probe.driver.available, true);
  assert.equal(probe.driver.deviceNames[0], "NVIDIA GeForce RTX 3080");
  assert.equal(probe.toolchain.nvcc.available, false);
  assert.equal(probe.cudaBackend.available, false);
  assert.equal(probe.cudaBackend.reasonCode, "compiled_executable_absent");
  const capabilities = createCapabilitiesDocument(probe);
  assert.equal(capabilities.backends[0].status, "unavailable");
  assert.deepEqual(capabilities.operations, []);
  assert.deepEqual(capabilities.policy, {
    executionMode: "shadow-only",
    authoritativeBackend: "web",
    productionApplied: false,
    workerLifecycle: "persistent",
    workerTransport: PERSISTENT_JSON_TRANSPORT,
    workerTransports: [PERSISTENT_JSON_TRANSPORT, PERSISTENT_BINARY_TRANSPORT],
    browserHelperTransports: ["application/json", BROWSER_HELPER_BINARY_MEDIA_TYPE],
    preferredBrowserHelperTransport: BROWSER_HELPER_BINARY_MEDIA_TYPE,
  });
});

test("binary browser/helper route preserves identity and shadow-only response headers", async (context) => {
  const executableCapabilities = {
    contract: EXECUTABLE_CAPABILITIES_CONTRACT,
    executableProtocol: 1,
    engineVersion: "test-binary",
    precisionMode: "float32",
    device: { name: EXPECTED_CUDA_DEVICE_NAME },
    algorithmContracts: [EVALUATE_CONTAINMENT_ALGORITHM],
    shadow: true,
    productionApplied: false,
    workerTransports: [PERSISTENT_JSON_TRANSPORT, PERSISTENT_BINARY_TRANSPORT],
  };
  const probe = {
    compiledExecutable: {
      available: true,
      capabilities: executableCapabilities,
      artifactSha256: EXPECTED_COMPILED_EXECUTABLE_SHA256,
    },
    cudaBackend: { available: true },
  };
  const job = {
    protocol: { major: 1, minor: 0 },
    operation: "evaluateContainment",
    algorithmContract: EVALUATE_CONTAINMENT_ALGORITHM,
    clientRequestId: "binary-route-fixture",
    projectFingerprint: "sha256:binary-route",
    coordinateContract: {
      frame: "object",
      unitsPerMillimeter: 0.1,
      handedness: "right",
      buildAxis: "+z",
    },
    quality: {},
    input: {
      base: {
        kind: "metaball-smooth-union",
        contractVersion: 1,
        balls: [{ id: 1, x: 0, y: 0, z: 0, r: 2 }],
        smoothness: 0.6,
      },
      samples: [{
        sampleId: "sample-1",
        edgeId: "edge-1",
        position: { x: 0, y: 0, z: 0 },
        radius: 0.5,
      }],
      boundaryTolerance: 1e-6,
    },
    artifacts: [],
  };
  const encoded = encodeCompactBinaryRequest(job);
  const binaryResult = Buffer.alloc(COMPACT_BINARY_RESPONSE_HEADER_BYTES + 16);
  binaryResult.write("KBR1", 0, "ascii");
  binaryResult.writeUInt16LE(1, 4);
  binaryResult.writeUInt16LE(1, 6);
  binaryResult.writeUInt32LE(COMPACT_BINARY_RESPONSE_HEADER_BYTES, 8);
  encoded.identityFingerprint.copy(binaryResult, 16);
  binaryResult.writeUInt32LE(1, 48);
  binaryResult.writeUInt32LE(1, 52);
  binaryResult.writeUInt32LE(COMPACT_BINARY_RESPONSE_HEADER_BYTES, 56);
  binaryResult.writeUInt32LE(binaryResult.length, 60);
  for (const offset of [64, 72, 80, 88, 96, 104, 112, 120, 152, 160]) {
    binaryResult.writeDoubleLE(0, offset);
  }
  binaryResult.writeFloatLE(-2, COMPACT_BINARY_RESPONSE_HEADER_BYTES);
  binaryResult.writeFloatLE(-1.5, COMPACT_BINARY_RESPONSE_HEADER_BYTES + 4);
  binaryResult.writeFloatLE(1.5, COMPACT_BINARY_RESPONSE_HEADER_BYTES + 8);
  binaryResult.writeUInt32LE(0, COMPACT_BINARY_RESPONSE_HEADER_BYTES + 12);

  const server = createLocalEngineServer({
    probe,
    expectedHostHeader: null,
    runContainment: () => { throw new Error("JSON execution was not expected"); },
    runPackedContainment: async (payload) => {
      assert.deepEqual(payload, encoded.payload);
      return {
        payload: binaryResult,
        capabilities: executableCapabilities,
        artifactSha256: EXPECTED_COMPILED_EXECUTABLE_SHA256,
        adapterTiming: {
          totalMilliseconds: 1,
          workerRoundTripMilliseconds: 0.5,
        },
      };
    },
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(`http://127.0.0.1:${address.port}/v1/evaluate-containment-binary`, {
    method: "POST",
    headers: {
      "Content-Type": BROWSER_HELPER_BINARY_MEDIA_TYPE,
      Origin: "http://127.0.0.1:5174",
      "X-Katachi-Geometry-Prototype": "shadow-only-v1",
      "X-Katachi-Client-Request-Id": job.clientRequestId,
      "X-Katachi-Project-Fingerprint": job.projectFingerprint,
      "X-Katachi-Algorithm-Contract": job.algorithmContract,
    },
    body: encoded.payload,
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), BROWSER_HELPER_BINARY_MEDIA_TYPE);
  assert.equal(response.headers.get("x-katachi-shadow"), "true");
  assert.equal(response.headers.get("x-katachi-production-applied"), "false");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), binaryResult);
});

test("compiled adapter rejects a non-shadow or non-RTX capability document", () => {
  const capabilities = {
    contract: EXECUTABLE_CAPABILITIES_CONTRACT,
    executableProtocol: 1,
    engineVersion: "test",
    precisionMode: "float32",
    device: { name: EXPECTED_CUDA_DEVICE_NAME },
    algorithmContracts: [EVALUATE_CONTAINMENT_ALGORITHM],
    shadow: true,
    productionApplied: false,
    workerTransports: [PERSISTENT_JSON_TRANSPORT, PERSISTENT_BINARY_TRANSPORT],
  };
  assert.equal(validateExecutableCapabilities(capabilities), capabilities);
  assert.throws(
    () => validateExecutableCapabilities({ ...capabilities, shadow: false }),
    /shadow-only/,
  );
  assert.throws(
    () => validateExecutableCapabilities({
      ...capabilities,
      device: { name: "NVIDIA GeForce RTX 4090" },
    }),
    /RTX 3080/,
  );
});

test("compiled adapter reports a missing fixed executable without launching anything", () => {
  const inspection = inspectCompiledEngine({
    platform: "win32",
    executablePath: "Z:\\path-that-does-not-exist\\katachi-containment-cuda.exe",
  });
  assert.equal(inspection.available, false);
  assert.equal(inspection.reasonCode, "compiled_executable_absent");
});

test("compiled adapter rejects a binary whose reviewed SHA-256 does not match", () => {
  let spawned = false;
  const inspection = inspectCompiledEngine({
    platform: "win32",
    executablePath: "C:\\fixed\\katachi-containment-cuda.exe",
    existsSyncImpl: () => true,
    readFileSyncImpl: () => Buffer.from("tampered"),
    spawnSyncImpl: () => { spawned = true; },
  });
  assert.equal(inspection.available, false);
  assert.equal(inspection.reasonCode, "compiled_executable_hash_mismatch");
  assert.notEqual(inspection.artifactSha256, EXPECTED_COMPILED_EXECUTABLE_SHA256);
  assert.equal(spawned, false, "a mismatched binary must not be launched");
});

test("compiled result validator freezes request and sample identity", () => {
  const request = {
    clientRequestId: "request-1",
    projectFingerprint: "sha256:fixture",
    input: {
      samples: [{ sampleId: "sample-1", edgeId: "edge-1" }],
    },
  };
  const result = {
    contract: EXECUTABLE_RESULT_CONTRACT,
    clientRequestId: request.clientRequestId,
    projectFingerprint: request.projectFingerprint,
    algorithmContract: EVALUATE_CONTAINMENT_ALGORITHM,
    shadow: true,
    productionApplied: false,
    samples: [{
      sampleId: "sample-1",
      edgeId: "edge-1",
      baseSignedDistance: -0.4,
      radiusAdjustedMargin: -0.2,
      radiusClearance: 0.2,
      classification: "inside",
    }],
    summary: { contained: true },
    timingMilliseconds: 0.1,
    timing: {
      endToEndMilliseconds: 0.1,
      setupMilliseconds: 0.05,
      kernelTotalMilliseconds: 0.01,
      kernelAverageMilliseconds: 0.01,
      iterations: 1,
    },
  };
  assert.equal(validateExecutableResult(result, request), result);
  assert.throws(
    () => validateExecutableResult({ ...result, projectFingerprint: "stale" }, request),
    /identity does not match/,
  );
  assert.throws(
    () => validateExecutableResult({ ...result, productionApplied: true }, request),
    /identity does not match/,
  );
});

test("loopback helper exposes unavailable capabilities and rejects unauthored mutation origins", async (context) => {
  const probe = {
    compiledExecutable: { available: false, reasonCode: "compiled_executable_absent" },
    cudaBackend: { available: false, reasonCode: "compiled_executable_absent" },
  };
  const server = createLocalEngineServer({ probe, expectedHostHeader: null });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const capabilityResponse = await fetch(`${base}/v1/capabilities`);
  assert.equal(capabilityResponse.status, 200);
  const capabilities = await capabilityResponse.json();
  assert.equal(capabilities.endpoint.host, "127.0.0.1");
  assert.equal(capabilities.endpoint.port, 47658);
  assert.equal(capabilities.backends[0].status, "unavailable");
  const mutationResponse = await fetch(`${base}/v1/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Katachi-Geometry-Prototype": "shadow-only-v1",
    },
    body: "{}",
  });
  assert.equal(mutationResponse.status, 403);
  const allowedDevelopmentOriginResponse = await fetch(`${base}/v1/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "http://127.0.0.1:5174",
      "X-Katachi-Geometry-Prototype": "shadow-only-v1",
    },
    body: "{}",
  });
  assert.equal(allowedDevelopmentOriginResponse.status, 503,
    "the fixed Katachi development origin must pass CORS before CUDA availability is checked");
});

test("fixed Host restriction rejects an alternate authority", async (context) => {
  const probe = {
    compiledExecutable: { available: false, reasonCode: "compiled_executable_absent" },
    cudaBackend: { available: false, reasonCode: "compiled_executable_absent" },
  };
  const server = createLocalEngineServer({ probe });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(`http://127.0.0.1:${address.port}/v1/capabilities`);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "host_rejected");
});

test("allowlisted public origin receives scoped private-network preflight headers", async (context) => {
  const probe = {
    compiledExecutable: { available: false, reasonCode: "compiled_executable_absent" },
    cudaBackend: { available: false, reasonCode: "compiled_executable_absent" },
  };
  const server = createLocalEngineServer({ probe, expectedHostHeader: null });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(`http://127.0.0.1:${address.port}/v1/evaluate-containment-binary`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://katachi.a-8c3.workers.dev",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": [
        "content-type",
        "x-katachi-geometry-prototype",
        "x-katachi-client-request-id",
        "x-katachi-project-fingerprint",
        "x-katachi-algorithm-contract",
      ].join(","),
      "Access-Control-Request-Private-Network": "true",
    },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://katachi.a-8c3.workers.dev");
  assert.equal(response.headers.get("access-control-allow-private-network"), "true");
  assert.match(response.headers.get("access-control-allow-headers"), /X-Katachi-Project-Fingerprint/);
});

test("shadow header, sample limit and body limit remain fail-closed", async (context) => {
  const executableCapabilities = {
    contract: EXECUTABLE_CAPABILITIES_CONTRACT,
    executableProtocol: 1,
    engineVersion: "test",
    precisionMode: "float32",
    device: { name: EXPECTED_CUDA_DEVICE_NAME },
    algorithmContracts: [EVALUATE_CONTAINMENT_ALGORITHM],
    shadow: true,
    productionApplied: false,
    workerTransports: [PERSISTENT_JSON_TRANSPORT, PERSISTENT_BINARY_TRANSPORT],
  };
  const probe = {
    compiledExecutable: { available: true, capabilities: executableCapabilities },
    cudaBackend: { available: true },
  };
  const server = createLocalEngineServer({
    probe,
    runContainment: () => { throw new Error("invalid requests must not launch CUDA"); },
    expectedHostHeader: null,
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/v1/jobs`;
  const origin = "https://katachi.a-8c3.workers.dev";
  const missingHeader = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: "{}",
  });
  assert.equal(missingHeader.status, 400);
  assert.equal((await missingHeader.json()).error.code, "shadow_header_required");

  const guardedHeaders = {
    "Content-Type": "application/json",
    Origin: origin,
    "X-Katachi-Geometry-Prototype": "shadow-only-v1",
  };
  const tooManySamples = await fetch(url, {
    method: "POST",
    headers: guardedHeaders,
    body: JSON.stringify({
      protocol: { major: 1, minor: 0 },
      operation: "evaluateContainment",
      algorithmContract: EVALUATE_CONTAINMENT_ALGORITHM,
      clientRequestId: "too-many",
      projectFingerprint: "sha256:test",
      input: {
        base: { kind: "metaball-smooth-union", contractVersion: 1, balls: [] },
        samples: Array(MAXIMUM_CONTAINMENT_SAMPLES + 1).fill(null),
      },
      artifacts: [],
    }),
  });
  assert.equal(tooManySamples.status, 400);
  assert.equal((await tooManySamples.json()).error.code, "invalid_job_contract");

  const tooLarge = await fetch(url, {
    method: "POST",
    headers: guardedHeaders,
    body: JSON.stringify({ padding: "x".repeat(MAXIMUM_JOB_BYTES) }),
  });
  assert.equal(tooLarge.status, 413);
  assert.equal((await tooLarge.json()).error.code, "job_too_large");
});

test("helper keeps later work queued and cancels it before persistent worker execution", async (context) => {
  const executableCapabilities = {
    contract: EXECUTABLE_CAPABILITIES_CONTRACT,
    executableProtocol: 1,
    engineVersion: "test-persistent",
    precisionMode: "float32",
    device: { name: EXPECTED_CUDA_DEVICE_NAME },
    algorithmContracts: [EVALUATE_CONTAINMENT_ALGORITHM],
    shadow: true,
    productionApplied: false,
    workerTransports: [PERSISTENT_JSON_TRANSPORT, PERSISTENT_BINARY_TRANSPORT],
  };
  const probe = {
    compiledExecutable: {
      available: true,
      capabilities: executableCapabilities,
      artifactSha256: EXPECTED_COMPILED_EXECUTABLE_SHA256,
    },
    cudaBackend: { available: true },
  };
  let releaseFirst;
  let firstStarted;
  const firstStartedPromise = new Promise((resolve) => { firstStarted = resolve; });
  const firstHold = new Promise((resolve) => { releaseFirst = resolve; });
  let invocationCount = 0;
  const server = createLocalEngineServer({
    probe,
    expectedHostHeader: null,
    runContainment: async () => {
      invocationCount += 1;
      if (invocationCount === 1) {
        firstStarted();
        await firstHold;
      }
      return {
        capabilities: executableCapabilities,
        artifactSha256: EXPECTED_COMPILED_EXECUTABLE_SHA256,
        adapterTiming: { persistentProcess: true },
        result: {
          samples: [],
          summary: {
            contained: true,
            checkedSampleCount: 0,
            outsideSampleIds: [],
            outsideEdgeIds: [],
            maximumExcess: 0,
            maximumExcessMm: 0,
            minimumClearance: 0,
          },
          timing: {
            endToEndMilliseconds: 0,
            setupMilliseconds: 0,
            kernelTotalMilliseconds: 0,
            kernelAverageMilliseconds: 0,
            iterations: 1,
          },
        },
      };
    },
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/v1`;
  const headers = {
    "Content-Type": "application/json",
    Origin: "https://katachi.a-8c3.workers.dev",
    "X-Katachi-Geometry-Prototype": "shadow-only-v1",
  };
  const request = (id) => ({
    protocol: { major: 1, minor: 0 },
    operation: "evaluateContainment",
    algorithmContract: EVALUATE_CONTAINMENT_ALGORITHM,
    clientRequestId: id,
    projectFingerprint: `sha256:${id}`,
    input: {
      base: { kind: "metaball-smooth-union", contractVersion: 1, balls: [] },
      samples: [],
    },
    artifacts: [],
  });
  const firstAccepted = await (await fetch(`${base}/jobs`, {
    method: "POST",
    headers,
    body: JSON.stringify(request("queue-first")),
  })).json();
  await firstStartedPromise;
  const secondAccepted = await (await fetch(`${base}/jobs`, {
    method: "POST",
    headers,
    body: JSON.stringify(request("queue-second")),
  })).json();
  const canceled = await (await fetch(`${base}/jobs/${secondAccepted.jobId}`, {
    method: "DELETE",
    headers: { Origin: headers.Origin },
  })).json();
  assert.equal(canceled.status, "canceled");
  releaseFirst();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(invocationCount, 1, "canceled queued job must not enter the worker");
  assert.equal(typeof firstAccepted.jobId, "string");
});
