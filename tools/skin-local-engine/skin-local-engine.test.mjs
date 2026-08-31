import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EVALUATE_CONTAINMENT_ALGORITHM,
  EXECUTABLE_CAPABILITIES_CONTRACT,
  EXECUTABLE_RESULT_CONTRACT,
  EXPECTED_CUDA_DEVICE_NAME,
  EXPECTED_COMPILED_EXECUTABLE_SHA256,
  inspectCompiledEngine,
  validateExecutableCapabilities,
  validateExecutableResult,
} from "./compiled-executable-adapter.mjs";
import {
  parseNvidiaSmiSummary,
  probeWindowsCapability,
} from "./probe-windows-capability.mjs";
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
  });
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
