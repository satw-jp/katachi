import type {
  HanaComputeBackend,
  HanaComputeFinalizeOptions,
  HanaComputeProgress,
} from "./computeBackend.ts";
import type {
  HanaFinalizationResultV0,
  HanaFinalizationSnapshotV0,
} from "./finalizationCore.ts";

export type HanaRemoteObjectPriority = "active" | "visible" | "background";

export interface HanaRemoteObjectJob {
  objectId: string;
  snapshot: HanaFinalizationSnapshotV0;
  priority: HanaRemoteObjectPriority;
}

export interface HanaRemoteObjectIdentity {
  documentId: string;
  documentRevision: number;
  objectId: string;
  objectRevision: number;
  objectGenerationId: number;
  algorithmVersion: string;
}

export function identityForHanaRemoteObjectJob(job: HanaRemoteObjectJob): HanaRemoteObjectIdentity {
  return {
    documentId: job.snapshot.documentId,
    documentRevision: job.snapshot.documentRevision,
    objectId: job.snapshot.objectId,
    objectRevision: job.snapshot.objectRevision,
    objectGenerationId: job.snapshot.generationId,
    algorithmVersion: job.snapshot.algorithmVersion,
  };
}

export interface HanaRemoteObjectCoordinatorState {
  queued: number;
  active: number;
  completed: number;
  stale: number;
  failed: number;
  maxConcurrent: number;
}

export interface HanaRemoteObjectCoordinatorOptions {
  maxConcurrent?: number;
  onProgress?: (objectId: string, progress: HanaComputeProgress) => void;
  onResult?: (objectId: string, result: HanaFinalizationResultV0) => void;
  onError?: (objectId: string, error: unknown) => void;
  onStale?: (objectId: string, generationId: number) => void;
}

interface QueuedJob extends HanaRemoteObjectJob {
  sequence: number;
}

interface ActiveJob extends QueuedJob {
  controller: AbortController;
}

const priorityRank: Record<HanaRemoteObjectPriority, number> = {
  active: 0,
  visible: 1,
  background: 2,
};

function compareJobs(left: QueuedJob, right: QueuedJob): number {
  return priorityRank[left.priority] - priorityRank[right.priority] || left.sequence - right.sequence;
}

/**
 * Coordinates independent object snapshots without owning the HANA document.
 * It is intentionally backend-agnostic so local, Windows, and Auto all share
 * the same latest-only object lifecycle.
 */
export class HanaRemoteObjectCoordinator {
  private readonly backend: HanaComputeBackend;
  private readonly maxConcurrent: number;
  private readonly onProgress?: HanaRemoteObjectCoordinatorOptions["onProgress"];
  private readonly onResult?: HanaRemoteObjectCoordinatorOptions["onResult"];
  private readonly onError?: HanaRemoteObjectCoordinatorOptions["onError"];
  private readonly onStale?: HanaRemoteObjectCoordinatorOptions["onStale"];
  private readonly queued = new Map<string, QueuedJob>();
  private readonly active = new Map<string, ActiveJob>();
  private sequence = 0;
  private completed = 0;
  private stale = 0;
  private failed = 0;
  private idleWaiters: Array<() => void> = [];

  constructor(
    backend: HanaComputeBackend,
    options: HanaRemoteObjectCoordinatorOptions = {},
  ) {
    this.backend = backend;
    this.maxConcurrent = Math.max(1, Math.min(8, Math.trunc(options.maxConcurrent ?? 2)));
    this.onProgress = options.onProgress;
    this.onResult = options.onResult;
    this.onError = options.onError;
    this.onStale = options.onStale;
  }

  enqueue(job: HanaRemoteObjectJob): void {
    const normalized: QueuedJob = { ...job, sequence: this.sequence += 1 };
    const previousActive = this.active.get(job.objectId);
    if (previousActive) {
      previousActive.controller.abort();
      void this.backend.cancel?.(previousActive.snapshot);
    }
    if (this.queued.has(job.objectId)) {
      this.queued.delete(job.objectId);
      this.stale += 1;
    }
    this.queued.set(job.objectId, normalized);
    this.pump();
  }

  cancel(objectId: string): void {
    const active = this.active.get(objectId);
    if (active) {
      active.controller.abort();
      void this.backend.cancel?.(active.snapshot);
    }
    if (this.queued.delete(objectId)) this.stale += 1;
    this.resolveIdleIfNeeded();
    this.pump();
  }

  cancelAll(): void {
    for (const objectId of [...this.queued.keys(), ...this.active.keys()]) this.cancel(objectId);
  }

  state(): HanaRemoteObjectCoordinatorState {
    return {
      queued: this.queued.size,
      active: this.active.size,
      completed: this.completed,
      stale: this.stale,
      failed: this.failed,
      maxConcurrent: this.maxConcurrent,
    };
  }

  async whenIdle(): Promise<void> {
    if (this.queued.size === 0 && this.active.size === 0) return;
    await new Promise<void>((resolve) => this.idleWaiters.push(resolve));
  }

  private resolveIdleIfNeeded(): void {
    if (this.queued.size !== 0 || this.active.size !== 0) return;
    const waiters = this.idleWaiters.splice(0);
    for (const resolve of waiters) resolve();
  }

  private pump(): void {
    while (this.active.size < this.maxConcurrent && this.queued.size > 0) {
      const next = [...this.queued.values()].sort(compareJobs)[0];
      if (!next) break;
      this.queued.delete(next.objectId);
      const controller = new AbortController();
      const active: ActiveJob = { ...next, controller };
      this.active.set(next.objectId, active);
      void this.run(active);
    }
    this.resolveIdleIfNeeded();
  }

  private async run(job: ActiveJob): Promise<void> {
    const options: HanaComputeFinalizeOptions = {
      signal: job.controller.signal,
      onProgress: (progress) => this.onProgress?.(job.objectId, progress),
    };
    try {
      const result = await this.backend.finalize(job.snapshot, options);
      const isLatest = this.active.get(job.objectId) === job
        && result.requestId === job.snapshot.requestId
        && result.documentRevision === job.snapshot.documentRevision
        && result.objectId === job.snapshot.objectId
        && result.objectRevision === job.snapshot.objectRevision
        && result.generationId === job.snapshot.generationId
        && result.algorithmVersion === job.snapshot.algorithmVersion
        && !job.controller.signal.aborted;
      if (!isLatest) {
        this.stale += 1;
        this.onStale?.(job.objectId, job.snapshot.generationId);
      } else {
        this.completed += 1;
        this.onResult?.(job.objectId, result);
      }
    } catch (error) {
      if (job.controller.signal.aborted) {
        this.stale += 1;
        this.onStale?.(job.objectId, job.snapshot.generationId);
      } else {
        this.failed += 1;
        this.onError?.(job.objectId, error);
      }
    } finally {
      if (this.active.get(job.objectId) === job) this.active.delete(job.objectId);
      this.pump();
    }
  }
}
