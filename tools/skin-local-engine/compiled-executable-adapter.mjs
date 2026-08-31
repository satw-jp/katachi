import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const EXECUTABLE_CAPABILITIES_CONTRACT =
  "katachi.cuda-containment-executable-capabilities.v1";
export const EXECUTABLE_RESULT_CONTRACT =
  "katachi.cuda-containment-executable-result.v1";
export const EVALUATE_CONTAINMENT_ALGORITHM =
  "katachi.skin.evaluate-containment.metaball-radius.v1";
export const EXPECTED_CUDA_DEVICE_NAME = "NVIDIA GeForce RTX 3080";
export const EXPECTED_COMPILED_EXECUTABLE_SHA256 =
  "0AE5FA195E6FE9FE5831603E3AC075FFBCF1B0F174E3768273EDD578BE516726";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
export const FIXED_COMPILED_EXECUTABLE = join(
  moduleDirectory,
  "bin",
  "katachi-containment-cuda.exe",
);

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function nonEmpty(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function finite(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be finite`);
  }
  return value;
}

export function validateExecutableCapabilities(value) {
  const capabilities = object(value, "executable capabilities");
  if (capabilities.contract !== EXECUTABLE_CAPABILITIES_CONTRACT
    || capabilities.executableProtocol !== 1) {
    throw new Error("unsupported compiled executable capability contract");
  }
  if (!Array.isArray(capabilities.algorithmContracts)
    || !capabilities.algorithmContracts.includes(EVALUATE_CONTAINMENT_ALGORITHM)) {
    throw new Error("compiled executable does not support the containment contract");
  }
  const device = object(capabilities.device, "executable capabilities.device");
  if (nonEmpty(device.name, "executable capabilities.device.name") !== EXPECTED_CUDA_DEVICE_NAME) {
    throw new Error(`compiled executable must target ${EXPECTED_CUDA_DEVICE_NAME}`);
  }
  if (capabilities.precisionMode !== "float32") {
    throw new Error("compiled executable must advertise float32 precision");
  }
  if (capabilities.shadow !== true || capabilities.productionApplied !== false) {
    throw new Error("compiled executable must advertise shadow-only execution");
  }
  nonEmpty(capabilities.engineVersion, "executable capabilities.engineVersion");
  return capabilities;
}

export function inspectCompiledEngine({
  executablePath = FIXED_COMPILED_EXECUTABLE,
  platform = process.platform,
  existsSyncImpl = existsSync,
  readFileSyncImpl = readFileSync,
  spawnSyncImpl = spawnSync,
} = {}) {
  if (platform !== "win32") {
    return { available: false, reasonCode: "windows_required", executablePath };
  }
  if (!existsSyncImpl(executablePath)) {
    return { available: false, reasonCode: "compiled_executable_absent", executablePath };
  }
  let artifactSha256;
  try {
    artifactSha256 = createHash("sha256")
      .update(readFileSyncImpl(executablePath))
      .digest("hex")
      .toUpperCase();
  } catch (error) {
    return {
      available: false,
      reasonCode: "compiled_executable_hash_failed",
      detail: error instanceof Error ? error.message : String(error),
      executablePath,
    };
  }
  if (artifactSha256 !== EXPECTED_COMPILED_EXECUTABLE_SHA256) {
    return {
      available: false,
      reasonCode: "compiled_executable_hash_mismatch",
      detail: `expected reviewed SHA-256 ${EXPECTED_COMPILED_EXECUTABLE_SHA256}, received ${artifactSha256}`,
      executablePath,
      artifactSha256,
    };
  }
  const child = spawnSyncImpl(executablePath, ["--capabilities-json"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 2_000,
    maxBuffer: 1024 * 1024,
    shell: false,
  });
  if (child.error || child.status !== 0) {
    return {
      available: false,
      reasonCode: child.error?.code === "ETIMEDOUT"
        ? "compiled_executable_probe_timeout"
        : "compiled_executable_probe_failed",
      detail: child.error?.message ?? String(child.stderr ?? "").trim(),
      executablePath,
    };
  }
  try {
    const capabilities = validateExecutableCapabilities(JSON.parse(child.stdout));
    return { available: true, executablePath, artifactSha256, capabilities };
  } catch (error) {
    return {
      available: false,
      reasonCode: "compiled_executable_invalid_capabilities",
      detail: error instanceof Error ? error.message : String(error),
      executablePath,
    };
  }
}

export function validateExecutableResult(value, request) {
  const result = object(value, "compiled executable result");
  if (result.contract !== EXECUTABLE_RESULT_CONTRACT
    || result.clientRequestId !== request.clientRequestId
    || result.projectFingerprint !== request.projectFingerprint
    || result.algorithmContract !== EVALUATE_CONTAINMENT_ALGORITHM
    || result.shadow !== true
    || result.productionApplied !== false) {
    throw new Error("compiled executable result identity does not match the submitted job");
  }
  if (!Array.isArray(result.samples) || result.samples.length !== request.input.samples.length) {
    throw new Error("compiled executable result sample count mismatch");
  }
  const expected = new Map(request.input.samples.map((sample) => [sample.sampleId, sample.edgeId]));
  for (const [index, candidate] of result.samples.entries()) {
    const sample = object(candidate, `compiled executable result.samples[${index}]`);
    const sampleId = nonEmpty(sample.sampleId, `compiled result sample ${index} id`);
    if (expected.get(sampleId) !== sample.edgeId) {
      throw new Error(`compiled result sample ${sampleId} has unexpected edge identity`);
    }
    expected.delete(sampleId);
    finite(sample.baseSignedDistance, `compiled result sample ${sampleId} signed distance`);
    finite(sample.radiusAdjustedMargin, `compiled result sample ${sampleId} margin`);
    finite(sample.radiusClearance, `compiled result sample ${sampleId} clearance`);
    if (!["inside", "outside", "boundary", "unknown"].includes(sample.classification)) {
      throw new Error(`compiled result sample ${sampleId} has invalid classification`);
    }
  }
  if (expected.size !== 0) throw new Error("compiled result omitted requested sample identities");
  object(result.summary, "compiled executable result.summary");
  finite(result.timingMilliseconds, "compiled executable result.timingMilliseconds");
  const timing = object(result.timing, "compiled executable result.timing");
  finite(timing.endToEndMilliseconds, "compiled executable result.timing.endToEndMilliseconds");
  finite(timing.setupMilliseconds, "compiled executable result.timing.setupMilliseconds");
  finite(timing.kernelTotalMilliseconds, "compiled executable result.timing.kernelTotalMilliseconds");
  finite(timing.kernelAverageMilliseconds, "compiled executable result.timing.kernelAverageMilliseconds");
  if (!Number.isInteger(timing.iterations) || timing.iterations < 1) {
    throw new Error("compiled executable result.timing.iterations must be a positive integer");
  }
  return result;
}

export function runCompiledContainment(request, {
  executablePath = FIXED_COMPILED_EXECUTABLE,
  spawnSyncImpl = spawnSync,
  timeoutMilliseconds = 30_000,
} = {}) {
  const inspection = inspectCompiledEngine({ executablePath, spawnSyncImpl });
  if (!inspection.available) {
    const error = new Error(`CUDA adapter unavailable: ${inspection.reasonCode}`);
    error.code = inspection.reasonCode;
    throw error;
  }
  const child = spawnSyncImpl(executablePath, ["--evaluate-containment-json"], {
    input: JSON.stringify(request),
    encoding: "utf8",
    windowsHide: true,
    timeout: timeoutMilliseconds,
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
  });
  if (child.error || child.status !== 0) {
    const error = new Error(child.error?.message ?? String(child.stderr ?? "compiled CUDA job failed").trim());
    error.code = child.error?.code === "ETIMEDOUT" ? "cuda_job_timeout" : "cuda_job_failed";
    throw error;
  }
  return {
    capabilities: inspection.capabilities,
    artifactSha256: inspection.artifactSha256,
    result: validateExecutableResult(JSON.parse(child.stdout), request),
  };
}
