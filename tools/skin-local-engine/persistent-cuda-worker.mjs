import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import {
  FIXED_COMPILED_EXECUTABLE,
  PERSISTENT_JSON_TRANSPORT,
  inspectCompiledEngine,
  validateExecutableCapabilities,
  validateExecutableResult,
} from "./compiled-executable-adapter.mjs";

export const FRAME_PROTOCOL_VERSION = 1;
export const FRAME_KIND_READY = 0;
export const FRAME_KIND_JSON_REQUEST = 1;
export const FRAME_KIND_JSON_RESPONSE = 2;
export const FRAME_KIND_ERROR = 255;
export const MAXIMUM_WORKER_FRAME_BYTES = 64 * 1024 * 1024;

const FRAME_HEADER_BYTES = 16;
const FRAME_MAGIC = Buffer.from("KCF1", "ascii");

function workerError(code, detail) {
  const error = new Error(detail);
  error.code = code;
  return error;
}

export function encodeWorkerFrame(kind, payload) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  if (body.length > MAXIMUM_WORKER_FRAME_BYTES) {
    throw workerError("cuda_worker_frame_too_large", "worker frame exceeds the fixed size limit");
  }
  const header = Buffer.alloc(FRAME_HEADER_BYTES);
  FRAME_MAGIC.copy(header, 0);
  header.writeUInt16LE(FRAME_PROTOCOL_VERSION, 4);
  header.writeUInt16LE(kind, 6);
  header.writeBigUInt64LE(BigInt(body.length), 8);
  return Buffer.concat([header, body], FRAME_HEADER_BYTES + body.length);
}

export class PersistentCudaWorker {
  constructor({
    executablePath = FIXED_COMPILED_EXECUTABLE,
    spawnImpl = spawn,
    inspectImpl = inspectCompiledEngine,
    startupTimeoutMilliseconds = 5_000,
    requestTimeoutMilliseconds = 30_000,
  } = {}) {
    this.executablePath = executablePath;
    this.spawnImpl = spawnImpl;
    this.inspectImpl = inspectImpl;
    this.startupTimeoutMilliseconds = startupTimeoutMilliseconds;
    this.requestTimeoutMilliseconds = requestTimeoutMilliseconds;
    this.child = null;
    this.capabilities = null;
    this.artifactSha256 = null;
    this.ready = null;
    this.stdoutChunks = [];
    this.stdoutBytes = 0;
    this.pendingFrameHeader = null;
    this.frames = [];
    this.frameWaiter = null;
    this.stderr = "";
    this.generation = 0;
    this.requestIndex = 0;
    this.closed = false;
    this.tail = Promise.resolve();
  }

  evaluate(request, { signal } = {}) {
    const scheduled = this.tail.then(() => {
      if (signal?.aborted) {
        throw workerError("cuda_job_canceled", "CUDA job was canceled before worker execution");
      }
      return this.#evaluateSerial(request);
    });
    this.tail = scheduled.catch(() => {});
    return scheduled;
  }

  diagnostics() {
    return {
      running: Boolean(this.child && this.child.exitCode === null),
      pid: this.child?.pid ?? null,
      generation: this.generation,
      requestIndex: this.requestIndex,
      transport: PERSISTENT_JSON_TRANSPORT,
      initializationMilliseconds: this.ready?.initializationMilliseconds ?? null,
    };
  }

  async terminateWorker() {
    const child = this.child;
    this.#rejectFrame(workerError("cuda_worker_crashed", "persistent CUDA worker was terminated"));
    this.child = null;
    this.ready = null;
    this.capabilities = null;
    this.artifactSha256 = null;
    this.stdoutChunks = [];
    this.stdoutBytes = 0;
    this.pendingFrameHeader = null;
    this.frames = [];
    if (!child || child.exitCode !== null) return;
    await new Promise((resolve) => {
      child.once("exit", resolve);
      child.kill();
      setTimeout(resolve, 2_000).unref();
    });
  }

  async close() {
    this.closed = true;
    await this.terminateWorker();
  }

  async #evaluateSerial(request) {
    if (this.closed) throw workerError("cuda_worker_closed", "persistent CUDA worker is closed");
    const adapterStart = performance.now();
    const workerStart = await this.#ensureWorker();
    const requestSerializeStart = performance.now();
    const serializedRequest = JSON.stringify(request);
    const requestSerializeMilliseconds = performance.now() - requestSerializeStart;
    const requestFrame = encodeWorkerFrame(FRAME_KIND_JSON_REQUEST, serializedRequest);
    const responseWait = this.#nextFrame(this.requestTimeoutMilliseconds, "CUDA worker response");
    const workerRoundTripStart = performance.now();
    try {
      await new Promise((resolve, reject) => {
        this.child.stdin.write(requestFrame, (error) => error ? reject(error) : resolve());
      });
    } catch (error) {
      responseWait.catch(() => {});
      await this.terminateWorker();
      throw workerError("cuda_worker_write_failed", error instanceof Error ? error.message : String(error));
    }
    let responseFrame;
    try {
      responseFrame = await responseWait;
    } catch (error) {
      await this.terminateWorker();
      throw error;
    }
    const workerRoundTripMilliseconds = performance.now() - workerRoundTripStart;
    if (responseFrame.kind === FRAME_KIND_ERROR) {
      let detail = responseFrame.payload.toString("utf8");
      try {
        detail = JSON.parse(detail).detail ?? detail;
      } catch {
        // Keep the bounded raw worker detail.
      }
      await this.terminateWorker();
      throw workerError("cuda_worker_request_failed", detail);
    }
    if (responseFrame.kind !== FRAME_KIND_JSON_RESPONSE) {
      await this.terminateWorker();
      throw workerError("cuda_worker_malformed_response", `unexpected worker frame kind ${responseFrame.kind}`);
    }
    const resultParseStart = performance.now();
    let parsedResult;
    try {
      parsedResult = JSON.parse(responseFrame.payload.toString("utf8"));
    } catch (error) {
      await this.terminateWorker();
      throw workerError("cuda_worker_malformed_response", error instanceof Error ? error.message : String(error));
    }
    const resultParseMilliseconds = performance.now() - resultParseStart;
    const resultValidationStart = performance.now();
    const result = validateExecutableResult(parsedResult, request);
    const resultValidationMilliseconds = performance.now() - resultValidationStart;
    this.requestIndex += 1;
    return {
      capabilities: this.capabilities,
      artifactSha256: this.artifactSha256,
      result,
      adapterTiming: {
        totalMilliseconds: performance.now() - adapterStart,
        workerStartupMilliseconds: workerStart.wallMilliseconds,
        workerInitializationMilliseconds: workerStart.initializationMilliseconds,
        requestSerializeMilliseconds,
        workerRoundTripMilliseconds,
        resultParseMilliseconds,
        resultValidationMilliseconds,
        requestBytes: Buffer.byteLength(serializedRequest),
        requestFrameBytes: requestFrame.length,
        resultBytes: responseFrame.payload.length,
        resultFrameBytes: FRAME_HEADER_BYTES + responseFrame.payload.length,
        persistentProcess: true,
        transport: PERSISTENT_JSON_TRANSPORT,
        workerPid: this.child.pid,
        workerGeneration: this.generation,
        workerRequestIndex: this.requestIndex,
      },
    };
  }

  async #ensureWorker() {
    if (this.child && this.child.exitCode === null && this.ready) {
      return { wallMilliseconds: 0, initializationMilliseconds: 0 };
    }
    const start = performance.now();
    const inspection = this.inspectImpl({ executablePath: this.executablePath });
    if (!inspection.available) {
      throw workerError(inspection.reasonCode, `CUDA worker unavailable: ${inspection.reasonCode}`);
    }
    const child = this.spawnImpl(this.executablePath, ["--worker-framed-json"], {
      windowsHide: true,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    this.capabilities = inspection.capabilities;
    this.artifactSha256 = inspection.artifactSha256;
    this.stdoutChunks = [];
    this.stdoutBytes = 0;
    this.pendingFrameHeader = null;
    this.frames = [];
    this.stderr = "";
    child.stdout.on("data", (chunk) => this.#consumeStdout(chunk));
    child.stderr.on("data", (chunk) => {
      this.stderr = `${this.stderr}${chunk.toString("utf8")}`.slice(-8_192);
    });
    child.once("error", (error) => this.#workerExited(child, null, null, error));
    child.once("exit", (code, signal) => this.#workerExited(child, code, signal));
    let readyFrame;
    try {
      readyFrame = await this.#nextFrame(this.startupTimeoutMilliseconds, "CUDA worker ready frame");
    } catch (error) {
      await this.terminateWorker();
      throw error;
    }
    if (readyFrame.kind !== FRAME_KIND_READY) {
      await this.terminateWorker();
      throw workerError("cuda_worker_malformed_ready", `unexpected ready frame kind ${readyFrame.kind}`);
    }
    let ready;
    try {
      ready = JSON.parse(readyFrame.payload.toString("utf8"));
      if (ready.contract !== "katachi.cuda-persistent-worker-ready.v1"
        || ready.transport !== PERSISTENT_JSON_TRANSPORT
        || ready.shadow !== true
        || ready.productionApplied !== false
        || !Number.isFinite(ready.initializationMilliseconds)) {
        throw new Error("invalid persistent worker ready contract");
      }
      validateExecutableCapabilities(ready.capabilities);
    } catch (error) {
      await this.terminateWorker();
      throw workerError("cuda_worker_malformed_ready", error instanceof Error ? error.message : String(error));
    }
    this.ready = ready;
    this.generation += 1;
    this.requestIndex = 0;
    return {
      wallMilliseconds: performance.now() - start,
      initializationMilliseconds: ready.initializationMilliseconds,
    };
  }

  #consumeStdout(chunk) {
    this.stdoutChunks.push(chunk);
    this.stdoutBytes += chunk.length;
    try {
      while (true) {
        if (!this.pendingFrameHeader) {
          if (this.stdoutBytes < FRAME_HEADER_BYTES) return;
          const header = this.#takeStdoutBytes(FRAME_HEADER_BYTES);
          if (!header.subarray(0, 4).equals(FRAME_MAGIC)) {
            throw workerError("cuda_worker_malformed_response", "invalid worker frame magic");
          }
          const version = header.readUInt16LE(4);
          if (version !== FRAME_PROTOCOL_VERSION) {
            throw workerError("cuda_worker_malformed_response", `unsupported worker frame version ${version}`);
          }
          const payloadBytesBig = header.readBigUInt64LE(8);
          if (payloadBytesBig > BigInt(MAXIMUM_WORKER_FRAME_BYTES)) {
            throw workerError("cuda_worker_malformed_response", "worker response exceeds frame limit");
          }
          this.pendingFrameHeader = {
            kind: header.readUInt16LE(6),
            payloadBytes: Number(payloadBytesBig),
          };
        }
        if (this.stdoutBytes < this.pendingFrameHeader.payloadBytes) return;
        const { kind, payloadBytes } = this.pendingFrameHeader;
        this.pendingFrameHeader = null;
        this.#deliverFrame({ kind, payload: this.#takeStdoutBytes(payloadBytes) });
      }
    } catch (error) {
      this.#rejectFrame(error);
      const child = this.child;
      this.child = null;
      child?.kill();
    }
  }

  #takeStdoutBytes(byteLength) {
    if (byteLength === 0) return Buffer.alloc(0);
    const parts = [];
    let remaining = byteLength;
    while (remaining > 0) {
      const chunk = this.stdoutChunks[0];
      if (chunk.length <= remaining) {
        parts.push(chunk);
        this.stdoutChunks.shift();
        remaining -= chunk.length;
      } else {
        parts.push(chunk.subarray(0, remaining));
        this.stdoutChunks[0] = chunk.subarray(remaining);
        remaining = 0;
      }
    }
    this.stdoutBytes -= byteLength;
    return parts.length === 1 ? parts[0] : Buffer.concat(parts, byteLength);
  }

  #deliverFrame(frame) {
    if (!this.frameWaiter) {
      this.frames.push(frame);
      return;
    }
    const waiter = this.frameWaiter;
    this.frameWaiter = null;
    clearTimeout(waiter.timer);
    waiter.resolve(frame);
  }

  #rejectFrame(error) {
    if (!this.frameWaiter) return;
    const waiter = this.frameWaiter;
    this.frameWaiter = null;
    clearTimeout(waiter.timer);
    waiter.reject(error);
  }

  #nextFrame(timeoutMilliseconds, label) {
    if (this.frames.length > 0) return Promise.resolve(this.frames.shift());
    if (this.frameWaiter) {
      return Promise.reject(workerError("cuda_worker_protocol_error", "multiple frame waiters are not allowed"));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.frameWaiter?.timer !== timer) return;
        this.frameWaiter = null;
        reject(workerError("cuda_worker_timeout", `${label} timed out`));
      }, timeoutMilliseconds);
      this.frameWaiter = { resolve, reject, timer };
    });
  }

  #workerExited(child, code, signal, cause) {
    if (this.child !== child) return;
    this.child = null;
    this.ready = null;
    const detail = cause instanceof Error
      ? cause.message
      : `persistent CUDA worker exited (code=${code}, signal=${signal})${this.stderr ? `: ${this.stderr.trim()}` : ""}`;
    this.#rejectFrame(workerError("cuda_worker_crashed", detail));
  }
}
