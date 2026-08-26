/**
 * Small, UI-independent ownership ledger for the shared heavy-computation
 * shelf.  A newer operation becomes visible without orphaning an older one;
 * when the visible operation ends, the newest still-running predecessor is
 * revealed deterministically.
 */

export interface HeavyComputationOperation {
  id: number;
  label: string;
}

export interface HeavyComputationProgressSnapshot {
  detail: string;
  progress: number;
  estimated: boolean;
}

/**
 * UI-independent progress state used by the shared heavy-computation shelf.
 * Callers decide whether to render the snapshot; state updates themselves are
 * never visibility-gated so a hidden predecessor can resume with its latest
 * observed progress when it becomes visible again.
 */
export class HeavyComputationProgressState {
  private currentProgress = 0;
  private currentDetail = "準備中…";
  private estimated = false;
  private smoothStartProgress = 0;
  private smoothCap = 0;
  private smoothing = false;

  snapshot(): HeavyComputationProgressSnapshot {
    return {
      detail: this.currentDetail,
      progress: this.currentProgress,
      estimated: this.estimated,
    };
  }

  update(detail: string, progress?: number): void {
    this.currentDetail = detail;
    if (progress !== undefined && Number.isFinite(progress)) {
      this.currentProgress = Math.max(this.currentProgress, clampProgress(progress));
    }
  }

  updateActual(detail: string, progress: number): void {
    this.stopSmoothing();
    this.estimated = false;
    this.currentDetail = detail;
    if (Number.isFinite(progress)) {
      this.currentProgress = Math.max(this.currentProgress, clampProgress(progress));
    }
  }

  smoothTo(cap: number): boolean {
    const nextCap = Math.max(this.currentProgress, Math.min(99, cap));
    if (nextCap <= this.currentProgress) return false;
    this.estimated = true;
    this.smoothStartProgress = this.currentProgress;
    this.smoothCap = nextCap;
    this.smoothing = true;
    return true;
  }

  advanceSmoothing(fraction: number): boolean {
    if (!this.smoothing) return true;
    const boundedFraction = Math.max(0, Math.min(1, fraction));
    this.currentProgress = Math.max(
      this.currentProgress,
      this.smoothStartProgress + (this.smoothCap - this.smoothStartProgress) * boundedFraction,
    );
    if (boundedFraction >= 1) this.smoothing = false;
    return boundedFraction >= 1;
  }

  stopSmoothing(): void {
    this.smoothing = false;
  }
}

function clampProgress(progress: number): number {
  return Math.max(0, Math.min(100, progress));
}

export class HeavyComputationLifecycle {
  private nextId = 0;
  private visibleId: number | null = null;
  private readonly running = new Map<number, HeavyComputationOperation>();

  begin(label: string): HeavyComputationOperation {
    const operation = { id: ++this.nextId, label };
    this.running.set(operation.id, operation);
    this.visibleId = operation.id;
    return operation;
  }

  isVisible(operation: HeavyComputationOperation | number): boolean {
    const id = typeof operation === "number" ? operation : operation.id;
    return this.visibleId === id && this.running.has(id);
  }

  current(): HeavyComputationOperation | null {
    return this.visibleId === null ? null : this.running.get(this.visibleId) ?? null;
  }

  finish(operation: HeavyComputationOperation | number): HeavyComputationOperation | null {
    const id = typeof operation === "number" ? operation : operation.id;
    if (!this.running.delete(id)) return this.current();
    if (this.visibleId === id) {
      const runningOperations = Array.from(this.running.values());
      const predecessor = runningOperations[runningOperations.length - 1] ?? null;
      this.visibleId = predecessor?.id ?? null;
    }
    return this.current();
  }

  runningCount(): number {
    return this.running.size;
  }
}

/**
 * Guard shared by Worker callbacks before they touch any run state.  Some
 * legacy protocols carry no request id or generation on progress/error
 * messages; null/undefined means that the corresponding closure value is the
 * request identity, while the exact Worker and current generation still must
 * match.
 */
export function isCurrentWorkerRun<T>(
  worker: T,
  activeWorker: T | null,
  expectedRequestId: number | null,
  messageRequestId: number | undefined,
  expectedGeneration: number,
  currentGeneration: number,
  messageGeneration?: number,
): boolean {
  return worker === activeWorker
    && (expectedRequestId === null || messageRequestId === expectedRequestId)
    && expectedGeneration === currentGeneration
    && (messageGeneration === undefined || messageGeneration === expectedGeneration);
}
