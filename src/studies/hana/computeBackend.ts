import {
  computeHanaFinalization,
  type HanaComputeCancellation,
  type HanaFinalizationResultV0,
  type HanaFinalizationSnapshotV0,
} from "./finalizationCore.ts";
import {
  decodeHanaFinalizationResult,
  serializeHanaFinalizationRequest,
} from "./computeProtocol.ts";

export type HanaComputeMode = "local" | "windows" | "auto";

export interface HanaComputeCapabilities {
  engine: "cpu-js-v0";
  binaryMesh: boolean;
  cancellation: boolean;
  objectLevelFinalization: boolean;
  gpu: false;
}

export interface HanaComputeHealth {
  status: "ready" | "unavailable" | "busy" | "error";
  protocolVersion: string;
  algorithmVersion: string;
  engine: string;
  workerCount: number;
  activeJobs: number;
  queuedJobs: number;
  uptime: number;
  reason?: string;
}

export interface HanaComputeProgress {
  phase: "local" | "remote" | "fallback";
  stage: string;
  fraction: number;
}

export interface HanaComputeFinalizeOptions {
  signal: AbortSignal;
  onProgress?: (progress: HanaComputeProgress) => void;
}

export interface HanaComputeBackend {
  readonly id: string;
  readonly capabilities: HanaComputeCapabilities;
  healthCheck(): Promise<HanaComputeHealth>;
  finalize(snapshot: HanaFinalizationSnapshotV0, options: HanaComputeFinalizeOptions): Promise<HanaFinalizationResultV0>;
  cancel?(snapshot: HanaFinalizationSnapshotV0): Promise<void>;
}

export const HANA_COMPUTE_CAPABILITIES: HanaComputeCapabilities = {
  engine: "cpu-js-v0",
  binaryMesh: true,
  cancellation: true,
  objectLevelFinalization: true,
  gpu: false,
};

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("Compute request was aborted", "AbortError");
}

function cancellationFor(signal: AbortSignal): HanaComputeCancellation {
  return { isCancelled: () => signal.aborted };
}

export class LocalHanaComputeBackend implements HanaComputeBackend {
  readonly id = "local";
  readonly capabilities = HANA_COMPUTE_CAPABILITIES;

  async healthCheck(): Promise<HanaComputeHealth> {
    return {
      status: "ready",
      protocolVersion: "katachi.hana-compute-wire.v0",
      algorithmVersion: "hana-cpu-js-v0",
      engine: this.capabilities.engine,
      workerCount: 0,
      activeJobs: 0,
      queuedJobs: 0,
      uptime: 0,
    };
  }

  async finalize(snapshot: HanaFinalizationSnapshotV0, options: HanaComputeFinalizeOptions): Promise<HanaFinalizationResultV0> {
    throwIfAborted(options.signal);
    options.onProgress?.({ phase: "local", stage: "compute", fraction: 0 });
    const result = await computeHanaFinalization(snapshot, cancellationFor(options.signal));
    throwIfAborted(options.signal);
    options.onProgress?.({ phase: "local", stage: "ready", fraction: 1 });
    return result;
  }
}

export interface WindowsHanaComputeBackendOptions {
  endpoint?: string;
  requestTimeoutMilliseconds?: number;
  strict?: boolean;
}

export class WindowsHanaComputeBackend implements HanaComputeBackend {
  readonly id = "windows";
  readonly capabilities = HANA_COMPUTE_CAPABILITIES;
  private readonly endpoint: string;
  private readonly requestTimeoutMilliseconds: number;
  readonly strict: boolean;

  constructor(options: WindowsHanaComputeBackendOptions = {}) {
    this.endpoint = (options.endpoint ?? "/api/hana-compute/v0").replace(/\/$/, "");
    this.requestTimeoutMilliseconds = Math.max(1000, Math.trunc(options.requestTimeoutMilliseconds ?? 120_000));
    this.strict = options.strict ?? false;
  }

  async healthCheck(): Promise<HanaComputeHealth> {
    try {
      const response = await fetch(`${this.endpoint}/health`, { cache: "no-store" });
      if (!response.ok) return { ...this.unavailableHealth(), status: response.status === 429 ? "busy" : "error", reason: `HTTP ${response.status}` };
      return await response.json() as HanaComputeHealth;
    } catch (error) {
      return { ...this.unavailableHealth(), reason: error instanceof Error ? error.message : "unavailable" };
    }
  }

  private unavailableHealth(): HanaComputeHealth {
    return {
      status: "unavailable",
      protocolVersion: "katachi.hana-compute-wire.v0",
      algorithmVersion: "hana-cpu-js-v0",
      engine: this.capabilities.engine,
      workerCount: 0,
      activeJobs: 0,
      queuedJobs: 0,
      uptime: 0,
    };
  }

  async finalize(snapshot: HanaFinalizationSnapshotV0, options: HanaComputeFinalizeOptions): Promise<HanaFinalizationResultV0> {
    throwIfAborted(options.signal);
    const timeout = new AbortController();
    const timer = window.setTimeout(() => timeout.abort(), this.requestTimeoutMilliseconds);
    const abort = () => timeout.abort();
    options.signal.addEventListener("abort", abort, { once: true });
    try {
      options.onProgress?.({ phase: "remote", stage: "submitted", fraction: 0 });
      const response = await fetch(`${this.endpoint}/finalize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: serializeHanaFinalizationRequest(snapshot),
        signal: timeout.signal,
      });
      if (!response.ok) throw new Error(`Remote Finalization HTTP ${response.status}`);
      const result = decodeHanaFinalizationResult(await response.arrayBuffer());
      if (result.requestId !== snapshot.requestId
        || result.documentRevision !== snapshot.documentRevision
        || result.objectId !== snapshot.objectId
        || result.objectRevision !== snapshot.objectRevision
        || result.generationId !== snapshot.generationId
        || result.algorithmVersion !== snapshot.algorithmVersion) {
        throw new Error("Remote Finalization result identity is stale or incompatible");
      }
      options.onProgress?.({ phase: "remote", stage: "ready", fraction: 1 });
      return result;
    } finally {
      window.clearTimeout(timer);
      options.signal.removeEventListener("abort", abort);
    }
  }

  async cancel(snapshot: HanaFinalizationSnapshotV0): Promise<void> {
    try {
      await fetch(`${this.endpoint}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: snapshot.requestId,
          documentRevision: snapshot.documentRevision,
          objectId: snapshot.objectId,
          objectRevision: snapshot.objectRevision,
          generationId: snapshot.generationId,
        }),
      });
    } catch {
      // Cancellation is best effort; the revision gate still rejects stale results.
    }
  }
}

export interface HanaComputeWorkEstimate {
  controls: number;
  smooth: number;
  materialSamples: number;
  estimatedVoxels: number;
}

export const HANA_AUTO_THRESHOLDS = {
  materialSamplesForWindows: 512,
  estimatedVoxelsForWindows: 200_000,
} as const;

export function estimateHanaComputeWork(snapshot: HanaFinalizationSnapshotV0): HanaComputeWorkEstimate {
  const smooth = snapshot.controls.length <= 1
    ? snapshot.controls.length
    : (snapshot.controls.length - 1) * Math.max(1, Math.trunc(snapshot.curveSettings.samplesPerSegment)) + 1;
  let length = 0;
  for (let index = 1; index < snapshot.controls.length; index += 1) {
    const from = snapshot.controls[index - 1].position;
    const to = snapshot.controls[index].position;
    length += Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  }
  const radius = Math.max(Number.EPSILON, snapshot.materialSettings.baseRadius);
  const materialSamples = snapshot.controls.length === 0 ? 0 : Math.max(2, Math.ceil(length / radius) + 1);
  const longest = Math.max(radius * 2, length + radius * 2);
  const resolution = Math.max(48, Math.ceil(longest / Math.max(radius * 0.9, Number.EPSILON)));
  const estimatedVoxels = (resolution + 1) ** 3;
  return { controls: snapshot.controls.length, smooth, materialSamples, estimatedVoxels };
}

export interface AutoHanaComputeBackendOptions {
  windows: WindowsHanaComputeBackend;
  local?: LocalHanaComputeBackend;
}

export class AutoHanaComputeBackend implements HanaComputeBackend {
  readonly id = "auto";
  readonly capabilities = HANA_COMPUTE_CAPABILITIES;
  private readonly local: LocalHanaComputeBackend;
  private readonly windows: WindowsHanaComputeBackend;

  constructor(options: AutoHanaComputeBackendOptions) {
    this.local = options.local ?? new LocalHanaComputeBackend();
    this.windows = options.windows;
  }

  async healthCheck(): Promise<HanaComputeHealth> {
    return this.windows.healthCheck();
  }

  private shouldUseWindows(snapshot: HanaFinalizationSnapshotV0, health: HanaComputeHealth): boolean {
    const estimate = estimateHanaComputeWork(snapshot);
    return health.status === "ready"
      && (estimate.materialSamples >= HANA_AUTO_THRESHOLDS.materialSamplesForWindows
        || estimate.estimatedVoxels >= HANA_AUTO_THRESHOLDS.estimatedVoxelsForWindows);
  }

  async finalize(snapshot: HanaFinalizationSnapshotV0, options: HanaComputeFinalizeOptions): Promise<HanaFinalizationResultV0> {
    const health = await this.windows.healthCheck();
    if (!this.shouldUseWindows(snapshot, health)) return this.local.finalize(snapshot, options);
    try {
      return await this.windows.finalize(snapshot, options);
    } catch (error) {
      if (this.windows.strict) throw error;
      options.onProgress?.({ phase: "fallback", stage: error instanceof Error ? error.message : "remote failure", fraction: 0 });
      return this.local.finalize(snapshot, options);
    }
  }

  async cancel(snapshot: HanaFinalizationSnapshotV0): Promise<void> {
    await this.windows.cancel?.(snapshot);
  }
}

export function createHanaComputeBackend(
  mode: HanaComputeMode,
  options: { endpoint?: string; strict?: boolean } = {},
): HanaComputeBackend {
  const local = new LocalHanaComputeBackend();
  const windows = new WindowsHanaComputeBackend({ endpoint: options.endpoint, strict: options.strict });
  if (mode === "local") return local;
  if (mode === "windows") return windows;
  return new AutoHanaComputeBackend({ local, windows });
}
