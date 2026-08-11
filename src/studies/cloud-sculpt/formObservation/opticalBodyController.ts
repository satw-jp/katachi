import type {
  FormGeometry,
  SamplingWorkerResponse,
  SupportedPointBudget,
} from "./contracts.ts";
import {
  DEFAULT_SAMPLING_VERSION,
  samplingIdentity,
} from "./surfaceSampling.ts";

export interface OpticalFormBodyRenderer {
  setOpticalFormBodyData(positions: Float32Array): void;
  clearOpticalFormBody(): void;
}

export interface OpticalFormBodyControllerOptions {
  readonly renderer: OpticalFormBodyRenderer;
  readonly pointBudget: SupportedPointBudget;
  readonly onStatus?: (status: string) => void;
}

/**
 * Query-local bridge from the existing FORM sampler to the orbiting Hikari
 * viewport. It never changes the represented SDF or schedules optical work.
 */
export class OpticalFormBodyController {
  private worker: Worker | null = null;
  private requestSequence = 0;
  private currentIdentity: string | null = null;
  private disposed = false;

  constructor(private readonly options: OpticalFormBodyControllerOptions) {}

  setGeometry(geometry: FormGeometry): void {
    if (this.disposed) return;
    const identity = samplingIdentity(
      geometry.contentHash,
      this.options.pointBudget,
      DEFAULT_SAMPLING_VERSION,
    );
    if (identity === this.currentIdentity) return;
    this.currentIdentity = identity;
    this.worker?.terminate();
    const worker = new Worker(new URL("./sampling.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker = worker;
    const requestId = `optical-form-body-${++this.requestSequence}`;
    this.options.onStatus?.(
      `FORM点描を生成中 · ${this.options.pointBudget.toLocaleString()}点`,
    );
    worker.onmessage = (event: MessageEvent<SamplingWorkerResponse>) => {
      if (this.disposed || worker !== this.worker) return;
      const message = event.data;
      if (message.requestId !== requestId) return;
      if (message.type === "progress") {
        this.options.onStatus?.(message.progress.message);
        return;
      }
      if (message.type === "error") {
        this.options.onStatus?.(`FORM点描を生成できません · ${message.error}`);
        worker.terminate();
        if (worker === this.worker) this.worker = null;
        return;
      }
      if (message.pointSet.positions.length !== message.pointSet.pointCount * 3) {
        this.options.onStatus?.("FORM点描の点数が一致しません");
        worker.terminate();
        if (worker === this.worker) this.worker = null;
        return;
      }
      this.options.renderer.setOpticalFormBodyData(message.pointSet.positions);
      this.options.onStatus?.(
        `FORM点描 · ${message.pointSet.pointCount.toLocaleString()}点 · ドラッグで回転`,
      );
      worker.terminate();
      if (worker === this.worker) this.worker = null;
    };
    worker.onerror = (event) => {
      if (this.disposed || worker !== this.worker) return;
      this.options.onStatus?.(`FORM点描Workerエラー · ${event.message}`);
      worker.terminate();
      this.worker = null;
    };
    worker.postMessage({
      type: "sample",
      requestId,
      geometry,
      pointBudget: this.options.pointBudget,
      samplingVersion: DEFAULT_SAMPLING_VERSION,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.worker?.terminate();
    this.worker = null;
    this.options.renderer.clearOpticalFormBody();
  }
}
