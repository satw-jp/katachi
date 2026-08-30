import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EVALUATE_CONTAINMENT_ALGORITHM,
  EXECUTABLE_RESULT_CONTRACT,
  inspectCompiledEngine,
  validateExecutableResult,
} from "./compiled-executable-adapter.mjs";
import {
  parseNvidiaSmiSummary,
  probeWindowsCapability,
} from "./probe-windows-capability.mjs";
import {
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
});

test("compiled adapter reports a missing fixed executable without launching anything", () => {
  const inspection = inspectCompiledEngine({
    platform: "win32",
    executablePath: "Z:\\path-that-does-not-exist\\katachi-containment-cuda.exe",
  });
  assert.equal(inspection.available, false);
  assert.equal(inspection.reasonCode, "compiled_executable_absent");
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
  };
  assert.equal(validateExecutableResult(result, request), result);
  assert.throws(
    () => validateExecutableResult({ ...result, projectFingerprint: "stale" }, request),
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
