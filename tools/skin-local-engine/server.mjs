import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import {
  EVALUATE_CONTAINMENT_ALGORITHM,
  PERSISTENT_BINARY_TRANSPORT,
  PERSISTENT_JSON_TRANSPORT,
} from "./compiled-executable-adapter.mjs";
import { probeWindowsCapability } from "./probe-windows-capability.mjs";
import { PersistentCudaWorker } from "./persistent-cuda-worker.mjs";
import {
  BROWSER_HELPER_BINARY_MEDIA_TYPE,
  validateCompactBinaryRequestEnvelope,
} from "./compact-binary-transport.mjs";
import {
  SHADOW_SESSION_PARAMETER_BYTES,
  SHADOW_SESSION_PARAMETER_MEDIA_TYPE,
  ShadowGeometrySessionCache,
} from "./shadow-session-cache.mjs";

export const FIXED_HOST = "127.0.0.1";
export const FIXED_PORT = 47658;
export const ENGINE_VERSION = "0.5.0-shadow-session-cache";
// 250k deterministic containment samples serialize to roughly 35 MiB. Keep the
// request bounded while allowing the advertised sample ceiling to be exercised.
export const MAXIMUM_JOB_BYTES = 48 * 1024 * 1024;
export const MAXIMUM_CONTAINMENT_SAMPLES = 250_000;
export const REVIEW_ORIGIN_ENVIRONMENT_VARIABLE = "KATACHI_SHADOW_REVIEW_ORIGIN";

const BASE_ALLOWED_ORIGINS = [
  "https://katachi.a-8c3.workers.dev",
  "http://localhost:5174",
  "https://localhost:5174",
  "http://127.0.0.1:5174",
  "https://127.0.0.1:5174",
];
const REVIEW_WORKERS_DEV_HOST_PATTERN = /^katachi-cuda-review-[a-z0-9]+(?:-[a-z0-9]+)*\.a-8c3\.workers\.dev$/;

export function validateConfiguredReviewOrigin(value) {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || value.includes("*")) {
    throw new TypeError(`${REVIEW_ORIGIN_ENVIRONMENT_VARIABLE} must be one exact HTTPS origin`);
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(`${REVIEW_ORIGIN_ENVIRONMENT_VARIABLE} must be a valid URL`);
  }
  if (parsed.origin !== value
    || parsed.protocol !== "https:"
    || !REVIEW_WORKERS_DEV_HOST_PATTERN.test(parsed.hostname)) {
    throw new TypeError(
      `${REVIEW_ORIGIN_ENVIRONMENT_VARIABLE} must be an exact katachi-cuda-review workers.dev origin`,
    );
  }
  return value;
}

function createAllowedOrigins(reviewOrigin) {
  const allowedOrigins = new Set(BASE_ALLOWED_ORIGINS);
  const validatedReviewOrigin = validateConfiguredReviewOrigin(reviewOrigin);
  if (validatedReviewOrigin) allowedOrigins.add(validatedReviewOrigin);
  return allowedOrigins;
}

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
      browserHelperTransports: ["application/json", BROWSER_HELPER_BINARY_MEDIA_TYPE],
      preferredBrowserHelperTransport: BROWSER_HELPER_BINARY_MEDIA_TYPE,
      shadowSessionCache: {
        volatile: true,
        persistedToProject: false,
        maximumSessions: 4,
      },
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
      maximumShadowSessions: 4,
    },
  };
}

function corsHeadersForAllowedOrigins(allowedOrigins, origin) {
  return origin && allowedOrigins.has(origin) ? {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": [
      "Content-Type",
      "X-Katachi-Geometry-Prototype",
      "X-Katachi-Client-Request-Id",
      "X-Katachi-Project-Fingerprint",
      "X-Katachi-Algorithm-Contract",
      "X-Katachi-Shadow-Session-Id",
    ].join(", "),
    "Access-Control-Expose-Headers": [
      "X-Katachi-Job-Id",
      "X-Katachi-Cuda-Engine-Version",
      "X-Katachi-Artifact-Sha256",
      "X-Katachi-Shadow",
      "X-Katachi-Production-Applied",
      "X-Katachi-Helper-Decode-Ms",
      "X-Katachi-Worker-Roundtrip-Ms",
      "X-Katachi-Worker-Total-Ms",
      "X-Katachi-Helper-Response-Encode-Ms",
      "X-Katachi-Response-Bytes",
      "X-Katachi-Shadow-Session-Id",
      "X-Katachi-Geometry-Fingerprint",
      "X-Katachi-Session-Cache-Hit",
    ].join(", "),
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  } : { Vary: "Origin" };
}

function privateNetworkCorsHeadersForAllowedOrigins(allowedOrigins, request, origin) {
  return request.headers["access-control-request-private-network"] === "true"
    && origin
    && allowedOrigins.has(origin)
    ? { "Access-Control-Allow-Private-Network": "true" }
    : {};
}

function sendJsonForAllowedOrigins(allowedOrigins, response, status, value, origin, extraHeaders = {}) {
  const encodeStart = performance.now();
  const payload = `${JSON.stringify(value)}\n`;
  const encodeMilliseconds = performance.now() - encodeStart;
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(Buffer.byteLength(payload)),
    "Cache-Control": "no-store",
    "X-Katachi-Helper-Response-Encode-Ms": encodeMilliseconds.toFixed(6),
    "X-Katachi-Response-Bytes": String(Buffer.byteLength(payload)),
    ...corsHeadersForAllowedOrigins(allowedOrigins, origin),
    ...extraHeaders,
  });
  response.end(payload);
}

function failForAllowedOrigins(allowedOrigins, response, status, code, detail, origin) {
  sendJsonForAllowedOrigins(allowedOrigins, response, status, { error: { code, detail } }, origin);
}

function readBoundedJson(request) {
  const readStart = performance.now();
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
        const readMilliseconds = performance.now() - readStart;
        const parseStart = performance.now();
        const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        resolve({
          value,
          byteLength,
          readMilliseconds,
          parseMilliseconds: performance.now() - parseStart,
        });
      } catch {
        reject(Object.assign(new Error("job body is not valid JSON"), { code: "invalid_json" }));
      }
    });
    request.on("error", reject);
  });
}

function readBoundedBuffer(request, maximumBytes = MAXIMUM_JOB_BYTES) {
  const start = performance.now();
  return new Promise((resolve, reject) => {
    const chunks = [];
    let byteLength = 0;
    let rejected = false;
    request.on("data", (chunk) => {
      byteLength += chunk.length;
      if (byteLength > maximumBytes) {
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
      resolve({
        payload: Buffer.concat(chunks, byteLength),
        readMilliseconds: performance.now() - start,
      });
    });
    request.on("error", reject);
  });
}

function requiredIdentityHeader(request, name, maximumLength = 512) {
  const value = request.headers[name];
  if (typeof value !== "string" || value.trim() === "" || value.length > maximumLength) {
    throw Object.assign(new Error(`missing or invalid ${name} header`), { code: "invalid_identity_header" });
  }
  return value;
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
  runPackedContainment,
  shadowSessionCache,
  workerTransport = PERSISTENT_JSON_TRANSPORT,
  expectedHostHeader = `${FIXED_HOST}:${FIXED_PORT}`,
  reviewOrigin,
} = {}) {
  const allowedOrigins = createAllowedOrigins(reviewOrigin);
  const corsHeaders = (origin) => corsHeadersForAllowedOrigins(allowedOrigins, origin);
  const privateNetworkCorsHeaders = (request, origin) => (
    privateNetworkCorsHeadersForAllowedOrigins(allowedOrigins, request, origin)
  );
  const sendJson = (...args) => sendJsonForAllowedOrigins(allowedOrigins, ...args);
  const fail = (...args) => failForAllowedOrigins(allowedOrigins, ...args);

  const capabilities = createCapabilitiesDocument(probe, { workerTransport });
  const jobs = new Map();
  const worker = persistentWorker ?? new PersistentCudaWorker();
  const executeContainment = runContainment
    ?? ((request) => worker.evaluate(request, { transport: workerTransport }));
  const executePackedContainment = runPackedContainment
    ?? ((payload, options) => worker.evaluatePackedBinary(payload, options));
  const sessionCache = shadowSessionCache ?? new ShadowGeometrySessionCache();
  const pendingJobs = [];
  let drainingJobs = false;

  function sendPackedCandidate(response, origin, executed, {
    clientRequestId,
    projectFingerprint,
    helperDecodeMilliseconds,
    extraHeaders = {},
  }) {
    const responseEncodeStart = performance.now();
    const headers = {
      "Content-Type": BROWSER_HELPER_BINARY_MEDIA_TYPE,
      "Content-Length": String(executed.payload.length),
      "Cache-Control": "no-store",
      "X-Katachi-Job-Id": randomUUID(),
      "X-Katachi-Client-Request-Id": clientRequestId,
      "X-Katachi-Project-Fingerprint": projectFingerprint,
      "X-Katachi-Cuda-Engine-Version": executed.capabilities.engineVersion,
      "X-Katachi-Artifact-Sha256": executed.artifactSha256,
      "X-Katachi-Shadow": "true",
      "X-Katachi-Production-Applied": "false",
      "X-Katachi-Helper-Decode-Ms": helperDecodeMilliseconds.toFixed(6),
      "X-Katachi-Worker-Roundtrip-Ms": executed.adapterTiming.workerRoundTripMilliseconds.toFixed(6),
      "X-Katachi-Worker-Total-Ms": executed.adapterTiming.totalMilliseconds.toFixed(6),
      "X-Katachi-Helper-Response-Encode-Ms": (performance.now() - responseEncodeStart).toFixed(6),
      ...corsHeaders(origin),
      ...extraHeaders,
    };
    response.writeHead(200, headers);
    response.end(executed.payload);
  }

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
    if (origin && !allowedOrigins.has(origin)) {
      fail(response, 403, "origin_rejected", "request Origin is not allowlisted", origin);
      return;
    }
    const url = new URL(request.url ?? "/", `http://${FIXED_HOST}:${FIXED_PORT}`);
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        ...corsHeaders(origin),
        ...privateNetworkCorsHeaders(request, origin),
      });
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
      else sendJson(response, 200, statusRecord(job), origin, job.helperDecodeMilliseconds === undefined ? {} : {
        "X-Katachi-Helper-Decode-Ms": job.helperDecodeMilliseconds.toFixed(6),
      });
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
      if (!origin || !allowedOrigins.has(origin)) {
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
      let decodedRequest;
      try {
        decodedRequest = await readBoundedJson(request);
        jobRequest = validatePrototypeRequest(decodedRequest.value);
      } catch (error) {
        fail(response, error.code === "job_too_large" ? 413 : 400, error.code ?? "invalid_job", error.message, origin);
        return;
      }
      const job = {
        jobId: randomUUID(),
        clientRequestId: jobRequest.clientRequestId,
        status: "queued",
        helperDecodeMilliseconds: decodedRequest.readMilliseconds + decodedRequest.parseMilliseconds,
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
    if (request.method === "POST" && url.pathname === "/v1/shadow-sessions") {
      if (!origin || !allowedOrigins.has(origin)) {
        fail(response, 403, "origin_required", "mutation requests require an allowlisted Origin", origin);
        return;
      }
      if (request.headers["x-katachi-geometry-prototype"] !== "shadow-only-v1") {
        fail(response, 400, "shadow_header_required", "missing shadow-only prototype header", origin);
        return;
      }
      if (String(request.headers["content-type"] ?? "").toLowerCase() !== BROWSER_HELPER_BINARY_MEDIA_TYPE) {
        fail(response, 415, "binary_content_type_required", `session upload requires ${BROWSER_HELPER_BINARY_MEDIA_TYPE}`, origin);
        return;
      }
      if (!probe.cudaBackend.available) {
        fail(response, 503, probe.cudaBackend.reasonCode ?? "cuda_unavailable", "CUDA adapter is unavailable", origin);
        return;
      }
      const controller = new AbortController();
      request.once("aborted", () => controller.abort());
      response.once("close", () => {
        if (!response.writableEnded) controller.abort();
      });
      let clientRequestId;
      let projectFingerprint;
      let binaryRequest;
      let envelope;
      try {
        clientRequestId = requiredIdentityHeader(request, "x-katachi-client-request-id", 256);
        projectFingerprint = requiredIdentityHeader(request, "x-katachi-project-fingerprint");
        if (requiredIdentityHeader(request, "x-katachi-algorithm-contract") !== EVALUATE_CONTAINMENT_ALGORITHM) {
          throw Object.assign(new Error("session upload uses an unsupported algorithm contract"), {
            code: "invalid_job_contract",
          });
        }
        binaryRequest = await readBoundedBuffer(request);
        envelope = validateCompactBinaryRequestEnvelope(binaryRequest.payload, {
          maximumSamples: MAXIMUM_CONTAINMENT_SAMPLES,
        });
      } catch (error) {
        fail(response, error.code === "job_too_large" ? 413 : 400,
          error.code ?? "invalid_shadow_session", error.message, origin);
        return;
      }
      try {
        const executed = await executePackedContainment(binaryRequest.payload, { signal: controller.signal });
        const session = sessionCache.create(binaryRequest.payload, {
          projectFingerprint,
          algorithmContract: EVALUATE_CONTAINMENT_ALGORITHM,
          envelope,
        });
        sendPackedCandidate(response, origin, executed, {
          clientRequestId,
          projectFingerprint,
          helperDecodeMilliseconds: binaryRequest.readMilliseconds + envelope.validationMilliseconds,
          extraHeaders: {
            "X-Katachi-Shadow-Session-Id": session.sessionId,
            "X-Katachi-Geometry-Fingerprint": session.geometryFingerprint.toString("hex").toUpperCase(),
            "X-Katachi-Session-Cache-Hit": "false",
          },
        });
      } catch (error) {
        fail(response, error.code === "cuda_job_canceled" ? 499 : 502,
          error.code ?? "cuda_candidate_failed",
          error instanceof Error ? error.message : String(error), origin);
      }
      return;
    }
    const shadowSessionEvaluateMatch = /^\/v1\/shadow-sessions\/([^/]+)\/evaluate$/.exec(url.pathname);
    if (request.method === "POST" && shadowSessionEvaluateMatch) {
      if (!origin || !allowedOrigins.has(origin)) {
        fail(response, 403, "origin_required", "mutation requests require an allowlisted Origin", origin);
        return;
      }
      if (request.headers["x-katachi-geometry-prototype"] !== "shadow-only-v1") {
        fail(response, 400, "shadow_header_required", "missing shadow-only prototype header", origin);
        return;
      }
      if (String(request.headers["content-type"] ?? "").toLowerCase() !== SHADOW_SESSION_PARAMETER_MEDIA_TYPE) {
        fail(response, 415, "session_parameter_content_type_required",
          `session repeat requires ${SHADOW_SESSION_PARAMETER_MEDIA_TYPE}`, origin);
        return;
      }
      if (!probe.cudaBackend.available) {
        fail(response, 503, probe.cudaBackend.reasonCode ?? "cuda_unavailable", "CUDA adapter is unavailable", origin);
        return;
      }
      const controller = new AbortController();
      request.once("aborted", () => controller.abort());
      response.once("close", () => {
        if (!response.writableEnded) controller.abort();
      });
      const decodeStart = performance.now();
      let clientRequestId;
      let projectFingerprint;
      let sessionId;
      let session;
      let jobPayload;
      let parameterRequest;
      let helperDecodeMilliseconds;
      try {
        sessionId = decodeURIComponent(shadowSessionEvaluateMatch[1]);
        if (requiredIdentityHeader(request, "x-katachi-shadow-session-id") !== sessionId) {
          throw Object.assign(new Error("shadow session header does not match route identity"), {
            code: "stale_shadow_session",
          });
        }
        clientRequestId = requiredIdentityHeader(request, "x-katachi-client-request-id", 256);
        projectFingerprint = requiredIdentityHeader(request, "x-katachi-project-fingerprint");
        const algorithmContract = requiredIdentityHeader(request, "x-katachi-algorithm-contract");
        session = sessionCache.resolve(sessionId, { projectFingerprint, algorithmContract });
        parameterRequest = await readBoundedBuffer(request, SHADOW_SESSION_PARAMETER_BYTES);
        jobPayload = sessionCache.createJobPayload(session, parameterRequest.payload);
        helperDecodeMilliseconds = performance.now() - decodeStart;
      } catch (error) {
        const status = error.code === "shadow_session_not_found" ? 404
          : error.code === "stale_shadow_session" ? 409
            : error.code === "job_too_large" ? 413 : 400;
        fail(response, status, error.code ?? "invalid_shadow_session", error.message, origin);
        return;
      }
      try {
        const executed = await executePackedContainment(jobPayload.payload, { signal: controller.signal });
        sendPackedCandidate(response, origin, executed, {
          clientRequestId,
          projectFingerprint,
          helperDecodeMilliseconds,
          extraHeaders: {
            "X-Katachi-Shadow-Session-Id": session.sessionId,
            "X-Katachi-Geometry-Fingerprint": session.geometryFingerprint.toString("hex").toUpperCase(),
            "X-Katachi-Session-Cache-Hit": "true",
          },
        });
      } catch (error) {
        fail(response, error.code === "cuda_job_canceled" ? 499 : 502,
          error.code ?? "cuda_candidate_failed",
          error instanceof Error ? error.message : String(error), origin);
      }
      return;
    }
    const shadowSessionDeleteMatch = /^\/v1\/shadow-sessions\/([^/]+)$/.exec(url.pathname);
    if (request.method === "DELETE" && shadowSessionDeleteMatch) {
      if (!origin || !allowedOrigins.has(origin)) {
        fail(response, 403, "origin_required", "mutation requests require an allowlisted Origin", origin);
        return;
      }
      if (request.headers["x-katachi-geometry-prototype"] !== "shadow-only-v1") {
        fail(response, 400, "shadow_header_required", "missing shadow-only prototype header", origin);
        return;
      }
      const sessionId = decodeURIComponent(shadowSessionDeleteMatch[1]);
      if (!sessionCache.delete(sessionId)) {
        fail(response, 404, "shadow_session_not_found", "shadow geometry session is absent or expired", origin);
      } else {
        sendJson(response, 200, {
          contract: "katachi.geometry-shadow-session-release.v1",
          sessionId,
          released: true,
          shadow: true,
          productionApplied: false,
        }, origin);
      }
      return;
    }
    if (request.method === "POST" && url.pathname === "/v1/evaluate-containment-binary") {
      if (!origin || !allowedOrigins.has(origin)) {
        fail(response, 403, "origin_required", "mutation requests require an allowlisted Origin", origin);
        return;
      }
      if (request.headers["x-katachi-geometry-prototype"] !== "shadow-only-v1") {
        fail(response, 400, "shadow_header_required", "missing shadow-only prototype header", origin);
        return;
      }
      if (String(request.headers["content-type"] ?? "").toLowerCase() !== BROWSER_HELPER_BINARY_MEDIA_TYPE) {
        fail(response, 415, "binary_content_type_required", `binary jobs require ${BROWSER_HELPER_BINARY_MEDIA_TYPE}`, origin);
        return;
      }
      if (!probe.cudaBackend.available) {
        fail(response, 503, probe.cudaBackend.reasonCode ?? "cuda_unavailable", "CUDA adapter is unavailable", origin);
        return;
      }
      const controller = new AbortController();
      request.once("aborted", () => controller.abort());
      response.once("close", () => {
        if (!response.writableEnded) controller.abort();
      });
      let clientRequestId;
      let projectFingerprint;
      let binaryRequest;
      let envelope;
      try {
        clientRequestId = requiredIdentityHeader(request, "x-katachi-client-request-id", 256);
        projectFingerprint = requiredIdentityHeader(request, "x-katachi-project-fingerprint");
        if (requiredIdentityHeader(request, "x-katachi-algorithm-contract") !== EVALUATE_CONTAINMENT_ALGORITHM) {
          throw Object.assign(new Error("binary request uses an unsupported algorithm contract"), {
            code: "invalid_job_contract",
          });
        }
        binaryRequest = await readBoundedBuffer(request);
        envelope = validateCompactBinaryRequestEnvelope(binaryRequest.payload, {
          maximumSamples: MAXIMUM_CONTAINMENT_SAMPLES,
        });
      } catch (error) {
        fail(response, error.code === "job_too_large" ? 413 : 400, error.code ?? "invalid_binary_job", error.message, origin);
        return;
      }
      try {
        const executed = await executePackedContainment(binaryRequest.payload, { signal: controller.signal });
        sendPackedCandidate(response, origin, executed, {
          clientRequestId,
          projectFingerprint,
          helperDecodeMilliseconds: binaryRequest.readMilliseconds + envelope.validationMilliseconds,
        });
      } catch (error) {
        fail(response, error.code === "cuda_job_canceled" ? 499 : 502,
          error.code ?? "cuda_candidate_failed",
          error instanceof Error ? error.message : String(error), origin);
      }
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
  const reviewOrigin = validateConfiguredReviewOrigin(process.env[REVIEW_ORIGIN_ENVIRONMENT_VARIABLE]);
  const server = createLocalEngineServer({ probe, reviewOrigin });
  server.listen(FIXED_PORT, FIXED_HOST, () => {
    const state = probe.cudaBackend.available ? "CUDA adapter available" : `CUDA unavailable: ${probe.cudaBackend.reasonCode}`;
    const reviewState = reviewOrigin ? `; exact review origin ${reviewOrigin}` : "; review origin disabled";
    process.stdout.write(
      `Katachi shadow GeometryEngine listening on http://${FIXED_HOST}:${FIXED_PORT}/v1 (${state}${reviewState})\n`,
    );
  });
}
