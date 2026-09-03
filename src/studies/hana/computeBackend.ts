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
import {
  chooseHanaAutoCompute,
  type HanaAutoComputeDecision,
} from "./hanaComputePolicy.ts";

export { HANA_AUTO_THRESHOLDS, estimateHanaComputeWork } from "./hanaComputePolicy.ts";
export type { HanaComputeWorkEstimate } from "./hanaComputePolicy.ts";

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
    const timer = setTimeout(() => timeout.abort(), this.requestTimeoutMilliseconds);
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
      clearTimeout(timer);
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

/** Windows mode still has a safe Local fallback unless strict mode is requested. */
export class WindowsWithLocalFallbackBackend implements HanaComputeBackend {
  readonly id = "windows";
  readonly capabilities = HANA_COMPUTE_CAPABILITIES;
  private readonly remote: WindowsHanaComputeBackend;
  private readonly local: LocalHanaComputeBackend;

  constructor(
    remote: WindowsHanaComputeBackend,
    local: LocalHanaComputeBackend = new LocalHanaComputeBackend(),
  ) {
    this.remote = remote;
    this.local = local;
  }

  healthCheck(): Promise<HanaComputeHealth> {
    return this.remote.healthCheck();
  }

  async finalize(snapshot: HanaFinalizationSnapshotV0, options: HanaComputeFinalizeOptions): Promise<HanaFinalizationResultV0> {
    try {
      return await this.remote.finalize(snapshot, options);
    } catch (error) {
      if (this.remote.strict) throw error;
      options.onProgress?.({ phase: "fallback", stage: error instanceof Error ? error.message : "remote failure", fraction: 0 });
      return this.local.finalize(snapshot, options);
    }
  }

  cancel(snapshot: HanaFinalizationSnapshotV0): Promise<void> {
    return this.remote.cancel(snapshot);
  }
}

export interface AutoHanaComputeBackendOptions {
  windows: HanaAutoRemoteBackend;
  local?: LocalHanaComputeBackend;
  healthCacheMilliseconds?: number;
}

export interface HanaAutoRemoteBackend extends HanaComputeBackend {
  readonly strict: boolean;
}

export class AutoHanaComputeBackend implements HanaComputeBackend {
  readonly id = "auto";
  readonly capabilities = HANA_COMPUTE_CAPABILITIES;
  private readonly local: LocalHanaComputeBackend;
  private readonly windows: HanaAutoRemoteBackend;
  private readonly healthCacheMilliseconds: number;
  private cachedHealth: { value: HanaComputeHealth; checkedAt: number } | null = null;
  lastDecision: HanaAutoComputeDecision | null = null;

  constructor(options: AutoHanaComputeBackendOptions) {
    this.local = options.local ?? new LocalHanaComputeBackend();
    this.windows = options.windows;
    this.healthCacheMilliseconds = Math.max(0, Math.trunc(options.healthCacheMilliseconds ?? 1_000));
  }

  private async recentHealth(): Promise<HanaComputeHealth> {
    const now = Date.now();
    if (this.cachedHealth && now - this.cachedHealth.checkedAt <= this.healthCacheMilliseconds) return this.cachedHealth.value;
    const value = await this.windows.healthCheck();
    this.cachedHealth = { value, checkedAt: Date.now() };
    return value;
  }

  async healthCheck(): Promise<HanaComputeHealth> {
    return this.recentHealth();
  }

  async finalize(snapshot: HanaFinalizationSnapshotV0, options: HanaComputeFinalizeOptions): Promise<HanaFinalizationResultV0> {
    const health = await this.recentHealth();
    const decision = chooseHanaAutoCompute(snapshot, health);
    this.lastDecision = decision;
    options.onProgress?.({
      phase: decision.choice === "windows" ? "remote" : "local",
      stage: decision.reason,
      fraction: 0,
    });
    if (decision.choice === "local") return this.local.finalize(snapshot, options);
    try {
      return await this.windows.finalize(snapshot, options);
    } catch (error) {
      if (this.windows.strict) throw error;
      const reason = error instanceof Error ? error.message : "remote failure";
      options.onProgress?.({ phase: "fallback", stage: `AUTO fallback LOCAL · reason: ${reason}`, fraction: 0 });
      this.cachedHealth = {
        value: { ...health, status: "error", reason },
        checkedAt: Date.now(),
      };
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
  if (mode === "windows") return options.strict ? windows : new WindowsWithLocalFallbackBackend(windows, local);
  return new AutoHanaComputeBackend({ local, windows });
}
