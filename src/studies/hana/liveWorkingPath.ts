import type { HanaStrokePoint } from "./gesture.ts";
import type { HanaStroke3DSourceSample, HanaVector3 } from "./stroke3d.ts";

/** Hard bound for the live upstream representation, independent of Raw size. */
export const HANA_LIVE_WORKING_MAX_POINTS = 192;
/** Initial screen-to-world-independent spacing; compaction raises it as needed. */
export const HANA_LIVE_WORKING_INITIAL_SPACING = 0.08;

interface HanaLiveWorkingSample {
  point: HanaStrokePoint;
  position: HanaVector3;
  sourcePointStart: number;
  sourcePointEnd: number;
  distance: number;
}

export interface HanaLiveWorkingPath {
  samples: HanaLiveWorkingSample[];
  tail: HanaLiveWorkingSample | null;
  lastPosition: HanaVector3;
  totalDistance: number;
  spacing: number;
  maxPoints: number;
}

function clonePoint(point: HanaStrokePoint): HanaStrokePoint {
  return { ...point };
}

function cloneVector(position: HanaVector3): HanaVector3 {
  return { ...position };
}

function distanceBetween(from: HanaVector3, to: HanaVector3): number {
  return Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
}

function interpolatePoint(
  from: HanaStrokePoint,
  to: HanaStrokePoint,
  amount: number,
): HanaStrokePoint {
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
    pressure: from.pressure + (to.pressure - from.pressure) * amount,
    time: from.time + (to.time - from.time) * amount,
  };
}

function interpolateVector(
  from: HanaVector3,
  to: HanaVector3,
  amount: number,
): HanaVector3 {
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
    z: from.z + (to.z - from.z) * amount,
  };
}

function sampleAtDistance(
  samples: readonly HanaLiveWorkingSample[],
  distance: number,
): HanaLiveWorkingSample {
  if (samples.length === 1) {
    return { ...samples[0], point: clonePoint(samples[0].point), position: cloneVector(samples[0].position) };
  }
  const target = Math.max(samples[0].distance, Math.min(samples[samples.length - 1].distance, distance));
  let end = 1;
  while (end < samples.length - 1 && samples[end].distance < target) end += 1;
  const start = end - 1;
  const span = samples[end].distance - samples[start].distance;
  const amount = span > Number.EPSILON
    ? (target - samples[start].distance) / span
    : 0;
  const from = samples[start];
  const to = samples[end];
  return {
    point: interpolatePoint(from.point, to.point, amount),
    position: interpolateVector(from.position, to.position, amount),
    sourcePointStart: from.sourcePointStart,
    sourcePointEnd: to.sourcePointEnd,
    distance: target,
  };
}

function compact(path: HanaLiveWorkingPath): void {
  if (path.samples.length < path.maxPoints) return;
  const targetCount = Math.max(2, Math.floor(path.maxPoints / 2));
  const startDistance = path.samples[0].distance;
  const endDistance = path.samples[path.samples.length - 1].distance;
  path.samples = Array.from({ length: targetCount }, (_, index) => sampleAtDistance(
    path.samples,
    startDistance + (endDistance - startDistance) * index / (targetCount - 1),
  ));
  path.spacing *= 2;
}

export function createLiveWorkingPath(
  point: HanaStrokePoint,
  position: HanaVector3,
  sourcePoint = 0,
  options: { maxPoints?: number; initialSpacing?: number } = {},
): HanaLiveWorkingPath {
  const sample: HanaLiveWorkingSample = {
    point: clonePoint(point),
    position: cloneVector(position),
    sourcePointStart: Math.max(0, Math.trunc(sourcePoint)),
    sourcePointEnd: Math.max(0, Math.trunc(sourcePoint)),
    distance: 0,
  };
  return {
    samples: [sample],
    tail: null,
    lastPosition: cloneVector(position),
    totalDistance: 0,
    spacing: Number.isFinite(options.initialSpacing) && (options.initialSpacing ?? 0) > 0
      ? options.initialSpacing as number
      : HANA_LIVE_WORKING_INITIAL_SPACING,
    maxPoints: Math.max(2, Math.trunc(options.maxPoints ?? HANA_LIVE_WORKING_MAX_POINTS)),
  };
}

/**
 * Append one newly captured Raw point without scanning the existing gesture.
 * Accepted samples are compacted geometrically when the live bound is full;
 * the current tail is always retained for pen-tip responsiveness.
 */
export function appendLiveWorkingPoint(
  path: HanaLiveWorkingPath,
  point: HanaStrokePoint,
  position: HanaVector3,
  sourcePoint: number,
): void {
  const nextPosition = cloneVector(position);
  path.totalDistance += distanceBetween(path.lastPosition, nextPosition);
  path.lastPosition = nextPosition;
  const next: HanaLiveWorkingSample = {
    point: clonePoint(point),
    position: nextPosition,
    sourcePointStart: Math.max(0, Math.trunc(sourcePoint)),
    sourcePointEnd: Math.max(0, Math.trunc(sourcePoint)),
    distance: path.totalDistance,
  };
  path.tail = next;
  const lastAccepted = path.samples[path.samples.length - 1];
  if (!lastAccepted || distanceBetween(lastAccepted.position, next.position) >= path.spacing) {
    path.samples.push(next);
    path.tail = null;
    compact(path);
  }
}

export function liveWorkingStrokeSamples(
  path: HanaLiveWorkingPath,
): HanaStroke3DSourceSample[] {
  const samples = [...path.samples];
  const last = samples[samples.length - 1];
  if (path.tail && (!last || path.tail.sourcePointEnd !== last.sourcePointEnd || path.tail.distance > last.distance + Number.EPSILON)) {
    samples.push(path.tail);
  }
  const total = Math.max(path.totalDistance, Number.EPSILON);
  return samples.map((sample) => ({
    point: clonePoint(sample.point),
    sourceT: Math.max(0, Math.min(1, sample.distance / total)),
    sourcePointStart: sample.sourcePointStart,
    sourcePointEnd: sample.sourcePointEnd,
  }));
}
