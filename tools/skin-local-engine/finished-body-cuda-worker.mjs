import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import {
  decodeFinishedBodyGridResult,
  decodeFinishedBodySnapshotAck,
} from "./finished-body-shadow-transport.mjs";

const FRAME_HEADER_BYTES = 16;
const FRAME_READY = 0;
const FRAME_UPLOAD = 10;
const FRAME_ACCEPTED = 11;
const FRAME_GRID = 12;
const FRAME_RESULT = 13;
const FRAME_ERROR = 255;
const DEFAULT_EXECUTABLE = fileURLToPath(new URL("./bin/katachi-finished-body-sdf-cuda.exe", import.meta.url));

function workerError(code, detail) {
  return Object.assign(new Error(detail), { code });
}

function frame(kind, payload) {
  const header = Buffer.alloc(FRAME_HEADER_BYTES);
  header.write("KCF1", 0, "ascii");
  header.writeUInt16LE(1, 4);
  header.writeUInt16LE(kind, 6);
  header.writeBigUInt64LE(BigInt(payload.length), 8);
  return Buffer.concat([header, payload]);
}

export class PersistentFinishedBodyCudaWorker {
  constructor({
    executablePath = process.env.KATACHI_FINISHED_BODY_CUDA_EXECUTABLE ?? DEFAULT_EXECUTABLE,
    timeoutMilliseconds = 60_000,
    spawnImpl = spawn,
  } = {}) {
    this.executablePath = executablePath;
    this.timeoutMilliseconds = timeoutMilliseconds;
    this.spawnImpl = spawnImpl;
    this.child = null;
    this.ready = null;
    this.chunks = [];
    this.bytes = 0;
    this.frames = [];
    this.waiter = null;
    this.queue = Promise.resolve();
  }

  async uploadSnapshot(payload, fingerprint) {
    return this.#serial(async () => {
      const workerStart = await this.#ensureWorker();
      const started = performance.now();
      const response = await this.#exchange(FRAME_UPLOAD, payload, FRAME_ACCEPTED);
      return {
        ...decodeFinishedBodySnapshotAck(response.payload, fingerprint),
        workerStartupMilliseconds: workerStart.wallMilliseconds,
        workerInitializationMilliseconds: workerStart.initializationMilliseconds,
        workerRoundTripMilliseconds: performance.now() - started,
        workerPid: this.child.pid,
        deviceName: this.ready.deviceName,
        shadow: true,
        productionApplied: false,
      };
    });
  }

  async evaluateGrid(payload, fingerprint, sampleCount) {
    return this.#serial(async () => {
      const workerStart = await this.#ensureWorker();
      const started = performance.now();
      const response = await this.#exchange(FRAME_GRID, payload, FRAME_RESULT);
      const decoded = decodeFinishedBodyGridResult(response.payload, fingerprint, sampleCount);
      return {
        payload: response.payload,
        ...decoded,
        timing: {
          ...decoded.timing,
          workerStartupMilliseconds: workerStart.wallMilliseconds,
          workerInitializationMilliseconds: workerStart.initializationMilliseconds,
          workerRoundTripMilliseconds: performance.now() - started,
        },
        deviceName: this.ready.deviceName,
        shadow: true,
        productionApplied: false,
      };
    });
  }

  async close() {
    const child = this.child;
    this.child = null;
    this.ready = null;
    if (!child || child.exitCode !== null) return;
    child.stdin.end();
    await new Promise((resolve) => {
      const timer = setTimeout(() => { child.kill(); resolve(); }, 2_000);
      child.once("exit", () => { clearTimeout(timer); resolve(); });
    });
  }

  #serial(operation) {
    const result = this.queue.then(operation, operation);
    this.queue = result.catch(() => {});
    return result;
  }

  async #ensureWorker() {
    if (this.child && this.child.exitCode === null && this.ready) return { wallMilliseconds: 0, initializationMilliseconds: 0 };
    if (!existsSync(this.executablePath)) throw workerError("finished_body_worker_missing", `missing fixed Finished BODY worker: ${this.executablePath}`);
    const started = performance.now();
    const child = this.spawnImpl(this.executablePath, [], { windowsHide: true, shell: false, stdio: ["pipe", "pipe", "pipe"] });
    this.child = child;
    this.chunks = [];
    this.bytes = 0;
    this.frames = [];
    let stderr = "";
    child.stdout.on("data", (chunk) => this.#consume(chunk));
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk.toString("utf8")}`.slice(-8192); });
    child.once("exit", (code) => {
      if (this.child !== child) return;
      this.child = null;
      this.ready = null;
      this.#reject(workerError("finished_body_worker_crashed", `worker exited ${code}: ${stderr}`));
    });
    const readyFrame = await this.#next();
    if (readyFrame.kind !== FRAME_READY) throw workerError("malformed_finished_body_worker_ready", "unexpected ready frame");
    const ready = JSON.parse(readyFrame.payload.toString("utf8"));
    if (ready.contract !== "katachi.cuda-finished-body-worker-ready.v1"
      || ready.shadow !== true || ready.productionApplied !== false
      || !Number.isFinite(ready.initializationMilliseconds)) {
      throw workerError("malformed_finished_body_worker_ready", "invalid ready contract");
    }
    this.ready = ready;
    return { wallMilliseconds: performance.now() - started, initializationMilliseconds: ready.initializationMilliseconds };
  }

  async #exchange(requestKind, payload, expectedKind) {
    const waiting = this.#next();
    await new Promise((resolve, reject) => this.child.stdin.write(frame(requestKind, payload), (error) => error ? reject(error) : resolve()));
    const response = await waiting;
    if (response.kind === FRAME_ERROR) {
      let detail = response.payload.toString("utf8");
      try { detail = JSON.parse(detail).detail ?? detail; } catch {}
      throw workerError("finished_body_worker_request_failed", detail);
    }
    if (response.kind !== expectedKind) throw workerError("malformed_finished_body_worker_response", `unexpected frame kind ${response.kind}`);
    return response;
  }

  #consume(chunk) {
    this.chunks.push(chunk);
    this.bytes += chunk.length;
    while (this.bytes >= FRAME_HEADER_BYTES) {
      const header = this.#peek(FRAME_HEADER_BYTES);
      if (!header.subarray(0, 4).equals(Buffer.from("KCF1")) || header.readUInt16LE(4) !== 1) {
        this.#reject(workerError("malformed_finished_body_worker_response", "invalid frame header"));
        return;
      }
      const payloadBytes = Number(header.readBigUInt64LE(8));
      if (this.bytes < FRAME_HEADER_BYTES + payloadBytes) return;
      this.#take(FRAME_HEADER_BYTES);
      this.#deliver({ kind: header.readUInt16LE(6), payload: this.#take(payloadBytes) });
    }
  }

  #peek(length) {
    return this.chunks[0].length >= length ? this.chunks[0].subarray(0, length) : Buffer.concat(this.chunks, this.bytes).subarray(0, length);
  }

  #take(length) {
    const parts = [];
    let remaining = length;
    while (remaining > 0) {
      const chunk = this.chunks[0];
      if (chunk.length <= remaining) { parts.push(chunk); this.chunks.shift(); remaining -= chunk.length; }
      else { parts.push(chunk.subarray(0, remaining)); this.chunks[0] = chunk.subarray(remaining); remaining = 0; }
    }
    this.bytes -= length;
    return parts.length === 1 ? parts[0] : Buffer.concat(parts, length);
  }

  #next() {
    if (this.frames.length) return Promise.resolve(this.frames.shift());
    if (this.waiter) return Promise.reject(workerError("finished_body_worker_protocol_error", "multiple waiters"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.waiter = null; reject(workerError("finished_body_worker_timeout", "worker response timed out")); }, this.timeoutMilliseconds);
      this.waiter = { resolve, reject, timer };
    });
  }

  #deliver(value) {
    if (!this.waiter) { this.frames.push(value); return; }
    const waiter = this.waiter; this.waiter = null; clearTimeout(waiter.timer); waiter.resolve(value);
  }

  #reject(error) {
    if (!this.waiter) return;
    const waiter = this.waiter; this.waiter = null; clearTimeout(waiter.timer); waiter.reject(error);
  }
}
