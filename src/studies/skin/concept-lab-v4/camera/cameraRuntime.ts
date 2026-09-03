import * as THREE from "three";
import type { ParameterValue } from "../parameterStore.ts";
import type { ConceptSource } from "../sourceAdapter.ts";
import { buildConceptCameraScore } from "./scores/index.ts";
import type { CameraParameters, CameraPose, CameraVisualState, CameraMode } from "./cameraTypes.ts";
import type { RenderSurface, CameraState } from "../runtime/renderSurface.ts";

const DEFAULTS: CameraParameters = {
  cameraMode: "AUTO",
  cameraMotion: 1,
  orbit: 0.45,
  dolly: 0.8,
  targetDrift: 0.55,
  passThrough: 0.45,
  cameraHold: 0.45,
  cameraRoll: 0.035,
  fovBreath: 0.22,
  parallax: 0.55,
};

const numberParam = (parameters: Readonly<Record<string, ParameterValue>>, id: string, fallback: number): number => {
  const value = parameters[id];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

function modeParam(value: ParameterValue | undefined): CameraMode {
  return value === "STILL" || value === "DRIFT" || value === "EXPLORE" ? value : "AUTO";
}

export function cameraParameters(parameters: Readonly<Record<string, ParameterValue>>): CameraParameters {
  return {
    cameraMode: modeParam(parameters.cameraMode),
    cameraMotion: numberParam(parameters, "cameraMotion", DEFAULTS.cameraMotion),
    orbit: numberParam(parameters, "orbit", DEFAULTS.orbit),
    dolly: numberParam(parameters, "dolly", DEFAULTS.dolly),
    targetDrift: numberParam(parameters, "targetDrift", DEFAULTS.targetDrift),
    passThrough: numberParam(parameters, "passThrough", DEFAULTS.passThrough),
    cameraHold: numberParam(parameters, "cameraHold", DEFAULTS.cameraHold),
    cameraRoll: numberParam(parameters, "cameraRoll", DEFAULTS.cameraRoll),
    fovBreath: numberParam(parameters, "fovBreath", DEFAULTS.fovBreath),
    parallax: numberParam(parameters, "parallax", DEFAULTS.parallax),
  };
}

function direction(pose: CameraPose): THREE.Vector3 {
  return pose.target.clone().sub(pose.position).normalize();
}

export class CameraRuntime {
  private readonly surface: RenderSurface;
  private readonly source: ConceptSource;
  private conceptId: string;
  private seed: number;
  private params: CameraParameters;
  private score = buildConceptCameraScore("weight-of-hesitation", { fingerprint: "empty", nodes: [], edges: [], motifs: [], center: new THREE.Vector3() }, 1, DEFAULTS);
  private previousPose: CameraPose | null = null;
  private previousTime = 0;
  private currentPose: CameraPose | null = null;
  private currentVisual: CameraVisualState = { focusDistance: 6, focusBias: 0, velocity: 0, angularVelocity: 0, enteringDepth: 0, temporalState: "holding" };

  constructor(surface: RenderSurface, source: ConceptSource, conceptId: string, seed: number, parameters: Readonly<Record<string, ParameterValue>>) {
    this.surface = surface;
    this.source = source;
    this.conceptId = conceptId;
    this.seed = seed;
    this.params = cameraParameters(parameters);
    this.rebuildScore();
  }

  reset(conceptId: string, seed: number, parameters: Readonly<Record<string, ParameterValue>>): void {
    this.conceptId = conceptId;
    this.seed = seed;
    this.params = cameraParameters(parameters);
    this.previousPose = null;
    this.currentPose = null;
    this.previousTime = 0;
    this.rebuildScore();
  }

  setParameters(parameters: Readonly<Record<string, ParameterValue>>): void {
    const next = cameraParameters(parameters);
    const needsRebuild = next.cameraMode !== this.params.cameraMode || next.orbit !== this.params.orbit || next.dolly !== this.params.dolly || next.targetDrift !== this.params.targetDrift || next.passThrough !== this.params.passThrough || next.cameraHold !== this.params.cameraHold || next.cameraRoll !== this.params.cameraRoll || next.cameraMotion !== this.params.cameraMotion;
    this.params = next;
    if (needsRebuild) this.rebuildScore();
  }

  scoreId(): string { return this.score.id; }
  scoreDuration(): number { return this.score.duration; }
  currentVisualState(): CameraVisualState { return this.currentVisual; }

  update(timeSeconds: number): CameraVisualState {
    const sampleTime = this.sampleTime(timeSeconds);
    const scoredPose = this.params.cameraMode === "STILL" ? this.score.sample(0) : this.score.sample(sampleTime);
    const breath = Math.sin(sampleTime * 0.21 + this.seed * 0.00017) * this.params.fovBreath * 0.7;
    const targetDrift = new THREE.Vector3(
      Math.sin(sampleTime * 0.17 + this.seed * 0.00011) * this.params.targetDrift * 0.045,
      Math.cos(sampleTime * 0.13 + this.seed * 0.00009) * this.params.targetDrift * 0.035,
      Math.sin(sampleTime * 0.11 + this.seed * 0.00007) * this.params.targetDrift * 0.018,
    );
    const nextPose: CameraPose = {
      ...scoredPose,
      target: scoredPose.target.clone().add(targetDrift),
      fov: scoredPose.fov + breath,
    };
    const delta = Math.max(0.001, timeSeconds - this.previousTime);
    const velocity = this.previousPose ? this.previousPose.position.distanceTo(nextPose.position) / delta : 0;
    const angularVelocity = this.previousPose ? direction(this.previousPose).angleTo(direction(nextPose)) / delta : 0;
    this.surface.applyCameraPose(nextPose);
    this.currentPose = nextPose;
    this.currentVisual = {
      focusDistance: nextPose.focusDistance,
      focusBias: nextPose.focusBias,
      velocity: Math.min(4, velocity),
      angularVelocity: Math.min(2, angularVelocity),
      enteringDepth: THREE.MathUtils.clamp(1 - nextPose.focusDistance / 10, 0, 1),
      temporalState: this.score.temporalState(sampleTime),
    };
    this.previousPose = nextPose;
    this.previousTime = timeSeconds;
    return this.currentVisual;
  }

  linkState(): CameraState {
    const pose = this.currentPose ?? this.score.sample(0);
    return {
      x: pose.position.x,
      y: pose.position.y,
      z: pose.position.z,
      fov: pose.fov,
      target: [pose.target.x, pose.target.y, pose.target.z],
      roll: pose.roll,
      focusDistance: pose.focusDistance,
      focusBias: pose.focusBias,
      mode: this.params.cameraMode,
      scoreId: this.score.id,
      scoreSeed: this.seed,
    };
  }

  manifestState(timeMs: number): { mode: CameraMode; scoreId: string; scoreSeed: number; timeMs: number; position: [number, number, number]; target: [number, number, number]; fov: number; roll: number; focusDistance: number; focusBias: number } {
    const pose = this.currentPose ?? this.score.sample(this.sampleTime(timeMs / 1000));
    return { mode: this.params.cameraMode, scoreId: this.score.id, scoreSeed: this.seed, timeMs: Math.round(timeMs), position: [pose.position.x, pose.position.y, pose.position.z], target: [pose.target.x, pose.target.y, pose.target.z], fov: pose.fov, roll: pose.roll, focusDistance: pose.focusDistance, focusBias: pose.focusBias };
  }

  private sampleTime(timeSeconds: number): number {
    const motion = THREE.MathUtils.clamp(this.params.cameraMotion, 0, 2);
    const base = timeSeconds * (0.14 + motion * 0.86);
    if (this.params.cameraMode === "DRIFT") return base * 0.58;
    if (this.params.cameraMode === "EXPLORE") return base * 1.28;
    return base;
  }

  private rebuildScore(): void {
    this.score = buildConceptCameraScore(this.conceptId, this.source, this.seed, this.params);
  }
}
