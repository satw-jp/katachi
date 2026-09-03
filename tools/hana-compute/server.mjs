import { createServer } from "node:http";
import { cpus } from "node:os";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import {
  HANA_FINALIZATION_ALGORITHM_VERSION,
  parseHanaFinalizationSnapshot,
} from "../../src/studies/hana/finalizationCore.ts";
import { HANA_COMPUTE_PROTOCOL_VERSION } from "../../src/studies/hana/computeProtocol.ts";
import { HANA_CPU_ENGINE_CAPABILITIES } from "../../src/studies/hana/computeEngine.ts";

const DEFAULT_PORT = 5483;
const REQUEST_LIMIT_BYTES = 2 * 1024 * 1024;
const OUTPUT_LIMIT_BYTES = 64 * 1024 * 1024;
const QUEUE_LIMIT = 8;
const WORKER_LIMIT = 4;
const startedAt = Date.now();

function configuredPort() {
  const value = Number(process.env.HANA_COMPUTE_PORT ?? DEFAULT_PORT);
  if (!Number.isInteger(value) || value < 0 || value > 65535) throw new Error("HANA_COMPUTE_PORT must be an integer between 0 and 65535");
  return value;
}

function configuredWorkerCount() {
  const requested = Number(process.env.HANA_COMPUTE_WORKERS ?? 0);
  if (Number.isInteger(requested) && requested > 0) return Math.min(WORKER_LIMIT, requested);
  const logical = typeof cpus === "function" ? cpus().length : 2;
  return Math.max(1, Math.min(WORKER_LIMIT, logical - 1));
}

function jsonResponse(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body) });
  response.end(body);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > REQUEST_LIMIT_BYTES) throw new Error("request body exceeds the 2 MiB limit");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function identityMatches(snapshot, body) {
  return body && body.requestId === snapshot.requestId
    && body.documentRevision === snapshot.documentRevision
    && body.objectId === snapshot.objectId
    && body.objectRevision === snapshot.objectRevision
    && body.generationId === snapshot.generationId;
}

export function createHanaComputeServer(options = {}) {
  const workerCount = Math.max(1, Math.min(WORKER_LIMIT, options.workerCount ?? configuredWorkerCount()));
  const queueLimit = Math.max(1, Math.min(QUEUE_LIMIT, options.queueLimit ?? QUEUE_LIMIT));
  const outputLimit = Math.max(1024, Math.min(OUTPUT_LIMIT_BYTES, options.outputLimit ?? OUTPUT_LIMIT_BYTES));
  const workerUrl = new URL("./worker.mjs", import.meta.url);
  const slots = [];
  const queue = [];
  const jobs = new Map();

  function activeCount() {
    return slots.filter((slot) => slot.job !== null).length;
  }

  function sendJobError(job, status, message) {
    if (job.responded) return;
    job.responded = true;
    jsonResponse(job.response, status, { error: message, requestId: job.requestId });
  }

  function finishSlot(slot) {
    slot.job = null;
    dispatch();
  }

  function handleWorkerMessage(slot, message) {
    const job = slot.job;
    if (!job || message?.requestId !== job.requestId) return;
    if (message.type === "result") {
      const buffer = message.buffer;
      if (!(buffer instanceof ArrayBuffer) || buffer.byteLength > outputLimit) {
        sendJobError(job, 413, "mesh output exceeds the configured limit");
      } else if (job.cancelled) {
        sendJobError(job, 409, "compute request was cancelled");
      } else {
        job.responded = true;
        job.response.writeHead(200, {
          "content-type": "application/octet-stream",
          "content-length": buffer.byteLength,
          "x-hana-compute-protocol": HANA_COMPUTE_PROTOCOL_VERSION,
          "x-hana-compute-algorithm": HANA_FINALIZATION_ALGORITHM_VERSION,
        });
        job.response.end(Buffer.from(buffer));
      }
      jobs.delete(job.requestId);
      finishSlot(slot);
    } else if (message.type === "cancelled") {
      sendJobError(job, 409, "compute request was cancelled");
      jobs.delete(job.requestId);
      finishSlot(slot);
    } else if (message.type === "error") {
      if (job.cancelled || message.message === "HANA_FINALIZATION_CANCELLED") sendJobError(job, 409, "compute request was cancelled");
      else sendJobError(job, 422, message.message || "HANA compute failed");
      jobs.delete(job.requestId);
      finishSlot(slot);
    }
  }

  function spawnWorker(slot) {
    const worker = new Worker(workerUrl, { execArgv: ["--experimental-strip-types"] });
    slot.worker = worker;
    worker.on("message", (message) => handleWorkerMessage(slot, message));
    worker.on("error", (error) => {
      const job = slot.job;
      if (job) {
        sendJobError(job, 503, `compute worker failed: ${error.message}`);
        jobs.delete(job.requestId);
      }
      slot.job = null;
    });
    worker.on("exit", (code) => {
      if (slot.worker !== worker) return;
      const job = slot.job;
      if (job) {
        sendJobError(job, 503, `compute worker exited with code ${code}`);
        jobs.delete(job.requestId);
      }
      slot.job = null;
      if (!serverClosed) {
        spawnWorker(slot);
        dispatch();
      }
    });
  }

  function dispatch() {
    for (const slot of slots) {
      if (slot.job || queue.length === 0) continue;
      let job = queue.shift();
      while (job?.cancelled && queue.length > 0) {
        sendJobError(job, 409, "compute request was cancelled");
        jobs.delete(job.requestId);
        job = queue.shift();
      }
      if (!job) continue;
      if (job.cancelled) {
        sendJobError(job, 409, "compute request was cancelled");
        jobs.delete(job.requestId);
        continue;
      }
      slot.job = job;
      slot.worker.postMessage({ type: "finalize", requestId: job.requestId, snapshot: job.snapshot });
    }
  }

  for (let index = 0; index < workerCount; index += 1) {
    const slot = { worker: null, job: null };
    slots.push(slot);
    spawnWorker(slot);
  }

  async function handleFinalize(request, response) {
    let snapshot;
    try {
      snapshot = parseHanaFinalizationSnapshot(JSON.parse(await readBody(request)));
    } catch (error) {
      jsonResponse(response, 400, { error: error instanceof Error ? error.message : "malformed finalization snapshot" });
      return;
    }
    if (jobs.has(snapshot.requestId)) {
      jsonResponse(response, 409, { error: "requestId is already active", requestId: snapshot.requestId });
      return;
    }
    if (queue.length + activeCount() >= queueLimit + workerCount) {
      jsonResponse(response, 429, { error: "compute queue is full" });
      return;
    }
    const job = { request: request, response, snapshot, requestId: snapshot.requestId, cancelled: false, responded: false };
    jobs.set(job.requestId, job);
    queue.push(job);
    dispatch();
  }

  async function handleCancel(request, response) {
    let body;
    try {
      body = JSON.parse(await readBody(request));
    } catch (error) {
      jsonResponse(response, 400, { error: error instanceof Error ? error.message : "malformed cancellation body" });
      return;
    }
    const requestId = typeof body.requestId === "string" ? body.requestId : "";
    const job = jobs.get(requestId);
    if (!job || !identityMatches(job.snapshot, body)) {
      jsonResponse(response, 404, { cancelled: false, requestId });
      return;
    }
    job.cancelled = true;
    const slot = slots.find((candidate) => candidate.job === job);
    if (slot) slot.worker.postMessage({ type: "cancel", requestId });
    jsonResponse(response, 200, { cancelled: true, requestId });
    dispatch();
  }

  let serverClosed = false;
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/api/hana-compute/v0/health") {
        const active = activeCount();
        jsonResponse(response, 200, {
          status: queue.length > 0 ? "busy" : "ready",
          protocolVersion: HANA_COMPUTE_PROTOCOL_VERSION,
          algorithmVersion: HANA_CPU_ENGINE_CAPABILITIES.algorithmVersion,
          engine: HANA_CPU_ENGINE_CAPABILITIES.engineId,
          workerCount,
          activeJobs: active,
          queuedJobs: queue.length,
          uptime: Math.max(0, (Date.now() - startedAt) / 1000),
          capabilityVersion: HANA_CPU_ENGINE_CAPABILITIES.capabilityVersion,
          snapshotVersion: HANA_CPU_ENGINE_CAPABILITIES.supportedSnapshotVersion,
          executionKind: HANA_CPU_ENGINE_CAPABILITIES.executionKind,
          gpu: HANA_CPU_ENGINE_CAPABILITIES.gpu,
          supportsCancellation: HANA_CPU_ENGINE_CAPABILITIES.supportsCancellation,
          supportsObjectLevel: HANA_CPU_ENGINE_CAPABILITIES.supportsObjectLevel,
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/hana-compute/v0/capabilities") {
        jsonResponse(response, 200, HANA_CPU_ENGINE_CAPABILITIES);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/hana-compute/v0/finalize") {
        await handleFinalize(request, response);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/hana-compute/v0/cancel") {
        await handleCancel(request, response);
        return;
      }
      jsonResponse(response, 404, { error: "not found" });
    } catch (error) {
      if (!response.headersSent) jsonResponse(response, 500, { error: error instanceof Error ? error.message : "HANA compute server error" });
      else response.destroy();
    }
  });

  return {
    server,
    workerCount,
    listen(port = configuredPort()) {
      return new Promise((resolve, reject) => {
        const onError = (error) => { server.off("listening", onListening); reject(error); };
        const onListening = () => { server.off("error", onError); resolve(server.address()); };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, "127.0.0.1");
      });
    },
    async close() {
      serverClosed = true;
      for (const slot of slots) await slot.worker.terminate();
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let instance;
  try {
    instance = createHanaComputeServer();
    const address = await instance.listen();
    console.log(`HANA compute listening: http://127.0.0.1:${address.port}`);
    console.log(`HANA compute workers: ${instance.workerCount} · engine cpu-js-v0 · gpu false`);
  } catch (error) {
    console.error(`HANA compute failed to start: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  }
  const shutdown = async () => {
    if (instance) await instance.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
