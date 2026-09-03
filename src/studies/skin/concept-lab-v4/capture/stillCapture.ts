import { captureFileName } from "./fileName.ts";
import { createCaptureManifest, downloadBlob, serializeCaptureManifest, type CaptureManifest } from "./captureManifest.ts";
import type { ConceptRuntime } from "../runtime/conceptRuntime.ts";

export interface StillCaptureOptions {
  readonly width: number;
  readonly height: number;
  readonly includeManifest: boolean;
  readonly gitCommit?: string;
}

export interface StillCaptureResult {
  readonly blob: Blob;
  readonly manifest: CaptureManifest | null;
  readonly filename: string;
}

export async function saveStillCapture(runtime: ConceptRuntime, options: StillCaptureOptions): Promise<StillCaptureResult> {
  const state = runtime.captureState();
  const blob = await runtime.surface.capturePng(options.width, options.height);
  const filename = captureFileName(state.concept, state.palette, state.seed, state.timeMs, options.width, options.height, "png");
  downloadBlob(blob, filename);
  const manifest = options.includeManifest ? createCaptureManifest(runtime, options.width, options.height, options.gitCommit) : null;
  if (manifest) downloadBlob(new Blob([serializeCaptureManifest(manifest)], { type: "application/json" }), filename.replace(/\.png$/, ".json"));
  return { blob, manifest, filename };
}
