import type {
  HanaRemoteObjectJob,
} from "./remoteObjectCoordinator.ts";
import type { HanaFinalizationResultV0 } from "./finalizationCore.ts";

/** Presentation-only result store; it never becomes Authoring Document state. */
export class HanaRemoteObjectResultRegistry {
  private readonly results = new Map<string, HanaFinalizationResultV0>();

  apply(job: HanaRemoteObjectJob, result: HanaFinalizationResultV0): boolean {
    const snapshot = job.snapshot;
    const compatible = result.requestId === snapshot.requestId
      && result.documentRevision === snapshot.documentRevision
      && result.objectId === snapshot.objectId
      && result.objectRevision === snapshot.objectRevision
      && result.generationId === snapshot.generationId
      && result.algorithmVersion === snapshot.algorithmVersion;
    if (!compatible) return false;
    this.results.set(job.objectId, result);
    return true;
  }

  get(objectId: string): HanaFinalizationResultV0 | undefined {
    return this.results.get(objectId);
  }

  has(objectId: string): boolean {
    return this.results.has(objectId);
  }

  remove(objectId: string): void {
    this.results.delete(objectId);
  }

  clear(): void {
    this.results.clear();
  }
}

