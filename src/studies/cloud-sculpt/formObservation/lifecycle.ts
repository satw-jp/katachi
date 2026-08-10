export interface TerminableWorker { terminate(): void; }

/** Deterministic request gate: a late Worker reply can never replace newer/last-good data. */
export class SamplingLifecycle<T> {
  private revision = 0;
  private worker: TerminableWorker | null = null;
  private successful: T | null = null;

  begin(worker: TerminableWorker): number {
    this.worker?.terminate();
    this.worker = worker;
    this.revision += 1;
    return this.revision;
  }
  isCurrent(request: number): boolean { return request === this.revision; }
  complete(request: number, value: T): boolean {
    if (!this.isCurrent(request)) return false;
    this.worker?.terminate(); this.worker = null; this.successful = value;
    return true;
  }
  fail(request: number): boolean {
    if (!this.isCurrent(request)) return false;
    this.worker?.terminate(); this.worker = null;
    return true;
  }
  /** A cache hit is a new display decision, so any older Worker must become stale. */
  replaceWithCached(value: T): void { this.cancel(); this.successful = value; }
  cancel(): void { this.worker?.terminate(); this.worker = null; this.revision += 1; }
  get lastSuccessful(): T | null { return this.successful; }
  get workerActive(): boolean { return this.worker !== null; }
}
