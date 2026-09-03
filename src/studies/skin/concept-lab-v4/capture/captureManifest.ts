import type { PaletteName } from "../conceptTypes.ts";
import type { ParameterValue } from "../parameterStore.ts";
import type { CameraState } from "../runtime/renderSurface.ts";
import type { CameraManifestState } from "../camera/cameraManifest.ts";

export interface CaptureManifest {
  readonly schemaVersion: 1;
  readonly concept: string;
  readonly sourceFingerprint: string;
  readonly seed: number;
  readonly timeMs: number;
  readonly palette: PaletteName;
  readonly parameters: Record<string, ParameterValue>;
  readonly camera: CameraState | CameraManifestState;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly gitCommit: string;
}

export interface CaptureStateSource {
  captureState(): {
    concept: string;
    seed: number;
    timeMs: number;
    palette: PaletteName;
    parameters: Record<string, ParameterValue>;
    camera: CameraState;
  };
  sourceFingerprint(): string;
  cameraManifest?(): CameraManifestState | null;
}

export function createCaptureManifest(source: CaptureStateSource, width: number, height: number, gitCommit = "unknown"): CaptureManifest {
  const state = source.captureState();
  return {
    schemaVersion: 1,
    concept: state.concept,
    sourceFingerprint: source.sourceFingerprint(),
    seed: state.seed,
    timeMs: Math.round(state.timeMs),
    palette: state.palette,
    parameters: { ...state.parameters },
    camera: source.cameraManifest?.() ?? { ...state.camera },
    viewport: { width, height },
    gitCommit,
  };
}

export function serializeCaptureManifest(manifest: CaptureManifest): string {
  return JSON.stringify(manifest, null, 2);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
