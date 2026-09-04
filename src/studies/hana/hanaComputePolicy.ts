import type { HanaComputeHealth } from "./computeBackend.ts";
import type { HanaFinalizationSnapshotV0 } from "./finalizationCore.ts";

export const HANA_AUTO_THRESHOLDS = {
  materialSamplesForWindows: 512,
  estimatedVoxelsForWindows: 200_000,
} as const;

export interface HanaComputeWorkEstimate {
  controls: number;
  smooth: number;
  materialSamples: number;
  boundsVolume: number;
  estimatedVoxels: number;
  candidateCountEstimate: number;
  objectCount: number;
  dependencyCount: number;
}

export interface HanaComputeEstimateContext {
  objectCount?: number;
  dependencyCount?: number;
}

export type HanaAutoComputeChoice = "local" | "windows";

export interface HanaAutoComputeDecision {
  choice: HanaAutoComputeChoice;
  reason: string;
  healthStatus: HanaComputeHealth["status"];
  estimate: HanaComputeWorkEstimate;
}

function boundsFor(snapshot: HanaFinalizationSnapshotV0) {
  if (snapshot.boundsHint) return snapshot.boundsHint;
  const first = snapshot.controls[0]?.position ?? { x: 0, y: 0, z: 0 };
  const bounds = { min: { ...first }, max: { ...first } };
  for (const control of snapshot.controls.slice(1)) {
    bounds.min.x = Math.min(bounds.min.x, control.position.x);
    bounds.min.y = Math.min(bounds.min.y, control.position.y);
    bounds.min.z = Math.min(bounds.min.z, control.position.z);
    bounds.max.x = Math.max(bounds.max.x, control.position.x);
    bounds.max.y = Math.max(bounds.max.y, control.position.y);
    bounds.max.z = Math.max(bounds.max.z, control.position.z);
  }
  return bounds;
}

/** Lightweight, deterministic work estimate; no Field or SDF evaluation occurs. */
export function estimateHanaComputeWork(
  snapshot: HanaFinalizationSnapshotV0,
  context: HanaComputeEstimateContext = {},
): HanaComputeWorkEstimate {
  const controls = snapshot.controls.length;
  const smooth = controls <= 1
    ? controls
    : (controls - 1) * Math.max(1, Math.trunc(snapshot.curveSettings.samplesPerSegment)) + 1;
  let length = 0;
  for (let index = 1; index < controls; index += 1) {
    const from = snapshot.controls[index - 1].position;
    const to = snapshot.controls[index].position;
    length += Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  }
  const radius = Math.max(Number.EPSILON, snapshot.materialSettings.baseRadius);
  const materialSamples = controls === 0 ? 0 : Math.max(2, Math.ceil(length / radius) + 1);
  const bounds = boundsFor(snapshot);
  const padding = radius * 2;
  const width = Math.max(radius * 2, bounds.max.x - bounds.min.x + padding);
  const height = Math.max(radius * 2, bounds.max.y - bounds.min.y + padding);
  const depth = Math.max(radius * 2, bounds.max.z - bounds.min.z + padding);
  const boundsVolume = width * height * depth;
  const longest = Math.max(radius * 2, length + radius * 2);
  const resolution = Math.max(48, Math.ceil(longest / Math.max(radius * 0.9, Number.EPSILON)));
  const estimatedVoxels = Number.isSafeInteger((resolution + 1) ** 3)
    ? (resolution + 1) ** 3
    : Number.MAX_SAFE_INTEGER;
  const candidateCountEstimate = Math.min(
    Number.MAX_SAFE_INTEGER,
    materialSamples * 27,
  );
  return {
    controls,
    smooth,
    materialSamples,
    boundsVolume,
    estimatedVoxels,
    candidateCountEstimate,
    objectCount: Math.max(1, Math.trunc(context.objectCount ?? 1)),
    dependencyCount: Math.max(0, Math.trunc(context.dependencyCount ?? 0)),
  };
}

export function chooseHanaAutoCompute(
  snapshot: HanaFinalizationSnapshotV0,
  health: HanaComputeHealth,
  context: HanaComputeEstimateContext = {},
): HanaAutoComputeDecision {
  const estimate = estimateHanaComputeWork(snapshot, context);
  if (health.status !== "ready") {
    return {
      choice: "local",
      reason: `AUTO chose LOCAL · reason: remote unavailable (${health.reason ?? health.status})`,
      healthStatus: health.status,
      estimate,
    };
  }
  const heavy = estimate.materialSamples >= HANA_AUTO_THRESHOLDS.materialSamplesForWindows
    || estimate.estimatedVoxels >= HANA_AUTO_THRESHOLDS.estimatedVoxelsForWindows;
  return {
    choice: heavy ? "windows" : "local",
    reason: heavy
      ? "AUTO chose REMOTE · reason: estimated voxel/sample workload above threshold"
      : "AUTO chose LOCAL · reason: estimated work below threshold",
    healthStatus: health.status,
    estimate,
  };
}

