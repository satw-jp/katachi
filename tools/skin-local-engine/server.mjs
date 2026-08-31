import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  EVALUATE_CONTAINMENT_ALGORITHM,
  PERSISTENT_BINARY_TRANSPORT,
  PERSISTENT_JSON_TRANSPORT,
} from "./compiled-executable-adapter.mjs";
import { probeWindowsCapability } from "./probe-windows-capability.mjs";
import { PersistentCudaWorker } from "./persistent-cuda-worker.mjs";

export const FIXED_HOST = "127.0.0.1";
export const FIXED_PORT = 47658;
export const ENGINE_VERSION = "0.3.0-persistent-transport-shadow";
// 250k deterministic containment samples serialize to roughly 35 MiB. Keep the
// request bounded while allowing the advertised sample ceiling to be exercised.
export const MAXIMUM_JOB_BYTES = 48 * 1024 * 1024;
export const MAXIMUM_CONTAINMENT_SAMPLES = 250_000;

const ALLOWED_ORIGINS = new Set([
  "https://katachi.a-8c3.workers.dev",
  "http://localhost:5174",
  "https://localhost:5174",
  "http://127.0.0.1:5174",
  "https://127.0.0.1:5174",
]);

export function createCapabilitiesDocument(probe, {
  workerTransport = PERSISTENT_JSON_TRANSPORT,
} = {}) {
  const executable = probe.compiledExecutable;
  const backendAvailable = probe.cudaBackend.available === true;
  const backendId = "windows-cuda-containment-v1";
  return {
    contract: "katachi.geometry-engine-capabilities.v1",
    protocol: { major: 1, minor: 0 },
    engine: { id: "katachi-windows-loopback-shadow", version: ENGINE_VERSION },
    endpoint: { host: FIXED_HOST, port: FIXED_PORT, apiBase: "/v1" },
    policy: {
      executionMode: "shadow-only",
      authoritativeBackend: "web",
      productionApplied: false,
      workerLifecycle: "persistent",
      workerTransport,
      workerTransports: [PERSISTENT_JSON_TRANSPORT, PERSISTENT_BINARY_TRANSPORT],
    },
    backends: [{
      backendId,
      kind: "cuda",
      status: backendAvailable ? "available" : "unavailable",
      ...(executable.available ? { deviceName: executable.capabilities.device.name } : {}),
      ...(executable.available ? { artifactSha256: executable.artifactSha256 } : {}),
      precisionModes: executable.available ? [executable.capabilities.precisionMode] : [],
      ...(!backendAvailable ? { reasonCode: probe.cudaBackend.reasonCode } : {}),
    }],
    operations: backendAvailable ? [{
      operation: "evaluateContainment",
      algorithmContracts: [EVALUATE_CONTAINMENT_ALGORITHM],
      backendIds: [backendId],
    }] : [],
    limits: {
      maximumJobBytes: MAXIMUM_JOB_BYTES,
      maximumContainmentSamples: MAXIMUM_CONTAINMENT_SAMPLES,
    },
  };
}

function corsHeaders(origin) {
  return origin && ALLOWED_ORIGINS.has(origin) ? {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Katachi-Geometry-Prototype",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  } : { Vary: "Origin" };
}

function sendJson(response, status, value, origin) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...corsHeaders(origin),
  });
  response.end(`${JSON.stringify(value)}\n`);
}

function fail(response, status, code, detail, origin) {
  sendJson(response, status, { error: { code, detail } }, origin);
}

function readBoundedJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let byteLength = 0;
    let rejected = false;
    request.on("data", (chunk) => {
      byteLength += chunk.length;
      if (byteLength > MAXIMUM_JOB_BYTES) {
        if (!rejected) {
          rejected = true;
          reject(Object.assign(new Error("job body exceeds prototype limit"), { code: "job_too_large" }));
        }
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (rejected) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("job body is not valid JSON"), { code: "invalid_json" }));
      }
    });
    request.on("error", reject);
  });
}

function validatePrototypeRequest(value) {
  if (!value || typeof value !== "object"
    || value.protocol?.major !== 1
    || value.operation !== "evaluateContainment"
    || value.algorithmContract !== EVALUATE_CONTAINMENT_ALGORITHM
    || typeof value.clientRequestId !== "string"
    || typeof value.projectFingerprint !== "string"
    || !value.input || typeof value.input !== "object"
    || !Array.isArray(value.input.samples)
    || value.input.samples.length > MAXIMUM_CONTAINMENT_SAMPLES
    || value.input.base?.kind !== "metaball-smooth-union"
    || value.input.base?.contractVersion !== 1
    || !Array.isArray(value.input.base?.balls)
    || !Array.isArray(value.artifacts)
    || value.artifacts.length !== 0) {
    throw Object.assign(new Error("request does not match the shadow containment v1 schema"), {
      code: "invalid_job_contract",
    });
  }
  return value;
}

function statusRecord(job) {
  return {
    contract: "katachi.geometry-job-status.v1",
    jobId: job.jobId,
    clientRequestId: job.clientRequestId,
    status: job.status,
    ...(job.result ? { result: job.result } : {}),
    ...(job.error ? { error: job.error } : {}),
  };
}

function releasedRecord(job) {
  return {
    contract: "katachi.geometry-job-status.v1",
    jobId: job.jobId,
    clientRequestId: job.clientRequestId,
    status: job.status,
    released: true,
    ...(job.error ? { error: job.error } : {}),
  };
}

export function createLocalEngineServer({
  probe = probeWindowsCapability(),
  runContainment,
  persistentWorker,
  workerTransport = PERSISTENT_JSON_TRANSPORT,
  expectedHostHeader = `${FIXED_HOST}:${FIXED_PORT}`,
} = {}) {
  const capabilities = createCapabilitiesDocument(probe, { workerTransport });
  const jobs = new Map();
  const worker = persistentWorker ?? (runContainment ? null : new PersistentCudaWorker());
  const executeContainment = runContainment
    ?? ((request) => worker.evaluate(request, { transport: workerTransport }));
  const pendingJobs = [];
  let drainingJobs = false;

  async function drainJobs() {
    if (drainingJobs) return;
    drainingJobs = true;
    try {
      while (pendingJobs.length > 0) {
        const { job, jobRequest } = pendingJobs.shift();
        if (job.status === "canceled") continue;
        job.status = "running";
        try {
          const executed = await executeContainment(jobRequest);
          job.result = {
            contract: "katachi.geometry-job-result.v1",
            protocol: { major: 1, minor: 0 },
            status: "completed",
            shadow: true,
            productionApplied: false,
            jobId: job.jobId,
            clientRequestId: job.clientRequestId,
            operation: "evaluateContainment",
            algorithmContract: EVALUATE_CONTAINMENT_ALGORITHM,
            projectFingerprint: jobRequest.projectFingerprint,
            backend: {
              backendId: "windows-cuda-containment-v1",
              backendKind: "cuda",
              engineVersion: executed.capabilities.engineVersion,
              deviceName: executed.capabilities.device.name,
              precisionMode: executed.capabilities.precisionMode,
              artifactSha256: executed.artifactSha256,
              timing: executed.result.timing,
              adapterTiming: executed.adapterTiming,
            },
            warnings: [{
              code: "shadow_only",
              detail: "Candidate result is observational and cannot update production geometry.",
            }],
            result: {
              samples: executed.result.samples,
              summary: executed.result.summary,
            },
          };
          job.status = "completed";
        } catch (error) {
          job.status = "failed";
          job.error = {
            code: error.code ?? "compiled_executable_failed",
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      }
    } finally {
      drainingJobs = false;
    }
  }

  const server = createServer(async (request, response) => {
    const origin = typeof request.headers.origin === "string" ? request.headers.origin : undefined;
    if (expectedHostHeader !== null && request.headers.host !== expectedHostHeader) {
      fail(response, 400, "host_rejected", "request Host does not match the fixed loopback endpoint", origin);
      return;
    }
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      fail(response, 403, "origin_rejected", "request Origin is not allowlisted", origin);
      return;
    }
    const url = new URL(request.url ?? "/", `http://${FIXED_HOST}:${FIXED_PORT}`);
    if (request.method === "OPTIONS") {
      response.writeHead(204, corsHeaders(origin));
      response.end();
      return;
    }
    if (request.method === "GET" && url.pathname === "/v1/capabilities") {
      sendJson(response, 200, capabilities, origin);
      return;
    }
    const match = /^\/v1\/jobs\/([^/]+)$/.exec(url.pathname);
    if (request.method === "GET" && match) {
      const job = jobs.get(decodeURIComponent(match[1]));
      if (!job) fail(response, 404, "job_not_found", "unknown job id", origin);
      else sendJson(response, 200, statusRecord(job), origin);
      return;
    }
    if (request.method === "DELETE" && match) {
      const job = jobs.get(decodeURIComponent(match[1]));
      if (!job) {
        fail(response, 404, "job_not_found", "unknown job id", origin);
      } else if (job.status === "queued") {
        job.status = "canceled";
        job.error = { code: "canceled", detail: "job canceled before executable launch" };
        const record = releasedRecord(job);
        jobs.delete(job.jobId);
        sendJson(response, 200, record, origin);
      } else {
        const record = releasedRecord(job);
        if (job.status === "completed" || job.status === "failed" || job.status === "canceled") {
          jobs.delete(job.jobId);
        }
        sendJson(response, 200, record, origin);
      }
      return;
    }
    if (request.method === "POST" && url.pathname === "/v1/jobs") {
      if (!origin || !ALLOWED_ORIGINS.has(origin)) {
        fail(response, 403, "origin_required", "mutation requests require an allowlisted Origin", origin);
        return;
      }
      if (request.headers["x-katachi-geometry-prototype"] !== "shadow-only-v1") {
        fail(response, 400, "shadow_header_required", "missing shadow-only prototype header", origin);
        return;
      }
      if (!String(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
        fail(response, 415, "json_content_type_required", "jobs require application/json", origin);
        return;
      }
      if (!probe.cudaBackend.available) {
        fail(response, 503, probe.cudaBackend.reasonCode ?? "cuda_unavailable", "CUDA adapter is unavailable", origin);
        return;
      }
      let jobRequest;
      try {
        jobRequest = validatePrototypeRequest(await readBoundedJson(request));
      } catch (error) {
        fail(response, error.code === "job_too_large" ? 413 : 400, error.code ?? "invalid_job", error.message, origin);
        return;
      }
      const job = {
        jobId: randomUUID(),
        clientRequestId: jobRequest.clientRequestId,
        status: "queued",
      };
      jobs.set(job.jobId, job);
      sendJson(response, 202, {
        contract: "katachi.geometry-job-accepted.v1",
        jobId: job.jobId,
        clientRequestId: job.clientRequestId,
        status: "queued",
      }, origin);
      pendingJobs.push({ job, jobRequest });
      setImmediate(() => void drainJobs());
      return;
    }
    fail(response, 404, "not_found", "unknown prototype route", origin);
  });
  server.once("close", () => { void worker?.close(); });
  return server;
}

const invokedAsScript = process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedAsScript) {
  const probe = probeWindowsCapability();
  const server = createLocalEngineServer({ probe });
  server.listen(FIXED_PORT, FIXED_HOST, () => {
    const state = probe.cudaBackend.available ? "CUDA adapter available" : `CUDA unavailable: ${probe.cudaBackend.reasonCode}`;
    process.stdout.write(`Katachi shadow GeometryEngine listening on http://${FIXED_HOST}:${FIXED_PORT}/v1 (${state})\n`);
  });
}
