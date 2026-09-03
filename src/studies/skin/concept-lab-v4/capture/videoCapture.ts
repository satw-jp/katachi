import type { ConceptRuntime } from "../runtime/conceptRuntime.ts";
import { downloadBlob } from "./captureManifest.ts";
import { captureFileName } from "./fileName.ts";
import { selectVideoMimeType } from "./mimeType.ts";

export interface VideoCaptureOptions {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly durationSeconds: number | "manual";
}

export interface VideoCaptureResult {
  readonly blob: Blob;
  readonly mimeType: string;
  readonly filename: string;
  readonly durationSeconds: number;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
}

export class VideoCaptureController {
  readonly promise: Promise<VideoCaptureResult>;
  private readonly duration: number | "manual";
  private recorder: MediaRecorder | null = null;
  private capture: ReturnType<ConceptRuntime["surface"]["createCaptureSurface"]> | null = null;
  private stream: MediaStream | null = null;
  private animationFrame = 0;
  private startedAt = 0;
  private stopped = false;
  private readonly chunks: Blob[] = [];

  constructor(
    private readonly runtime: ConceptRuntime,
    private readonly options: VideoCaptureOptions,
    private readonly onProgress: (seconds: number) => void = () => undefined,
  ) {
    this.duration = options.durationSeconds;
    this.promise = this.start();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    window.cancelAnimationFrame(this.animationFrame);
    if (this.recorder?.state === "recording") this.recorder.stop();
  }

  private start(): Promise<VideoCaptureResult> {
    return new Promise<VideoCaptureResult>((resolve, reject) => {
      if (typeof MediaRecorder === "undefined" || typeof HTMLCanvasElement.prototype.captureStream !== "function") {
        reject(new Error("WebM capture is not supported by this browser"));
        return;
      }
      const mimeType = selectVideoMimeType();
      if (!mimeType) {
        reject(new Error("No supported WebM codec was found"));
        return;
      }
      this.capture = this.runtime.surface.createCaptureSurface(this.options.width, this.options.height);
      this.stream = this.capture.canvas.captureStream(this.options.fps);
      try {
        this.recorder = new MediaRecorder(this.stream, { mimeType });
      } catch (error) {
        this.capture.dispose();
        this.capture = null;
        this.stream.getTracks().forEach((track) => track.stop());
        this.stream = null;
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      this.recorder.ondataavailable = (event) => { if (event.data.size > 0) this.chunks.push(event.data); };
      this.recorder.onerror = () => reject(new Error("WebM recorder failed"));
      this.recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: mimeType });
        const state = this.runtime.captureState();
        const durationSeconds = Math.max(0, (performance.now() - this.startedAt) / 1000);
        const filename = captureFileName(state.concept, state.palette, state.seed, state.timeMs, this.options.width, this.options.height, "webm");
        downloadBlob(blob, filename);
        this.capture?.dispose();
        this.capture = null;
        this.stream?.getTracks().forEach((track) => track.stop());
        this.stream = null;
        resolve({ blob, mimeType, filename, durationSeconds, width: this.options.width, height: this.options.height, fps: this.options.fps });
      };
      this.startedAt = performance.now();
      this.recorder.start(1_000);
      this.renderFrame();
      if (this.duration !== "manual") window.setTimeout(() => this.stop(), this.duration * 1_000);
    });
  }

  private readonly renderFrame = (): void => {
    if (this.stopped && this.recorder?.state !== "recording") return;
    const elapsed = (performance.now() - this.startedAt) / 1_000;
    this.onProgress(elapsed);
    this.capture?.render();
    this.animationFrame = window.requestAnimationFrame(this.renderFrame);
  };
}
