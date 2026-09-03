import type * as THREE from "three";

export type CameraMotionKind =
  | "hold"
  | "drift"
  | "dolly"
  | "orbit"
  | "target-shift"
  | "pass-through"
  | "retreat"
  | "macro-track";

export type CameraEasing = "linear" | "ease-in-out" | "slow-arrival" | "hesitate" | "accelerate" | "drift";
export type CameraMode = "AUTO" | "STILL" | "DRIFT" | "EXPLORE";
export type CameraTemporalState = "moving" | "slowing" | "holding" | "looking" | "crossing" | "departing";

export interface CameraPose {
  readonly position: THREE.Vector3;
  readonly target: THREE.Vector3;
  readonly fov: number;
  readonly roll: number;
  readonly focusDistance: number;
  readonly focusBias: number;
}

export interface CameraSegment {
  readonly id: string;
  readonly startTime: number;
  readonly duration: number;
  readonly kind: CameraMotionKind;
  readonly from: CameraPose;
  readonly to: CameraPose;
  readonly easing: CameraEasing;
  readonly holdFraction?: number;
  readonly parallaxStrength?: number;
  readonly focusTransition?: number;
}

export interface CameraScore {
  readonly id: string;
  readonly duration: number;
  readonly segments: readonly CameraSegment[];
  sample(timeSeconds: number): CameraPose;
  temporalState(timeSeconds: number): CameraTemporalState;
}

export interface CameraParameters {
  readonly cameraMode: CameraMode;
  readonly cameraMotion: number;
  readonly orbit: number;
  readonly dolly: number;
  readonly targetDrift: number;
  readonly passThrough: number;
  readonly cameraHold: number;
  readonly cameraRoll: number;
  readonly fovBreath: number;
  readonly parallax: number;
}

export interface CameraAnchor {
  readonly id: string;
  readonly position: THREE.Vector3;
  readonly target: THREE.Vector3;
  readonly importance: number;
  readonly kind: "motif" | "junction" | "support" | "void" | "wound" | "repair" | "dense-region" | "edge" | "center";
  readonly radius: number;
}

export interface CameraVisualState {
  readonly focusDistance: number;
  readonly focusBias: number;
  readonly velocity: number;
  readonly angularVelocity: number;
  readonly enteringDepth: number;
  readonly temporalState: CameraTemporalState;
}

export interface ForegroundIntrusion {
  readonly anchor: THREE.Vector3;
  readonly type: "gaussian" | "fog" | "ribbon" | "hairline" | "pigment";
  readonly cameraDistance: number;
  readonly scale: number;
  readonly start: number;
  readonly duration: number;
}
