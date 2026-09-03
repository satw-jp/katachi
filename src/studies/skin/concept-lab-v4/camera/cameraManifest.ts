import type { CameraMode } from "./cameraTypes.ts";

export interface CameraManifestState {
  readonly mode: CameraMode;
  readonly scoreId: string;
  readonly scoreSeed: number;
  readonly timeMs: number;
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly fov: number;
  readonly roll: number;
  readonly focusDistance: number;
  readonly focusBias: number;
}
