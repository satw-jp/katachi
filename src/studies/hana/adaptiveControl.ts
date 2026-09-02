import type { HanaStrokePoint, HanaViewportStroke } from "./gesture.ts";
import { sampleSmoothCenterline } from "./smoothCenterline.ts";
import {
  deriveStroke3DFromRawIndices,
  HANA_CURVE_SETTINGS,
  type HanaStroke3D,
  type HanaVector3,
} from "./stroke3d.ts";

/** Editing fidelity budget, independent of the material Thickness radius. */
export const HANA_ADAPTIVE_CONTROL_TOLERANCE = 0.09;
/** Safety ceiling for pathological input; normal HANA strokes remain below it. */
export const HANA_ADAPTIVE_CONTROL_MAX_POINTS = 1024;

export interface HanaAdaptiveControlFitOptions {
  tolerance: number;
  smoothness?: number;
  maxControlPoints?: number;
}

export interface HanaAdaptiveControlFitResult {
  indices: number[];
  initialControlCount: number;
  refinementIterations: number;
  tolerance: number;
  maxControlDeviation: number;
  maxSmoothDeviation: number;
  smoothToleranceMet: boolean;
  initialSelectionMilliseconds: number;
  refinementMilliseconds: number;
}

interface Deviation {
  pointIndex: number;
  distance: number;
}

function normalizedTolerance(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : Number.EPSILON;
}

function normalizedSmoothness(value: number | undefined): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value as number)) : 0;
}

function distancePointToSegment(point: HanaVector3, from: HanaVector3, to: HanaVector3): number {
  const direction = {
    x: to.x - from.x,
    y: to.y - from.y,
    z: to.z - from.z,
  };
  const offset = {
    x: point.x - from.x,
    y: point.y - from.y,
    z: point.z - from.z,
  };
  const lengthSquared = direction.x ** 2 + direction.y ** 2 + direction.z ** 2;
  const amount = lengthSquared > Number.EPSILON
    ? Math.max(0, Math.min(1, (
      offset.x * direction.x
      + offset.y * direction.y
      + offset.z * direction.z
    ) / lengthSquared))
    : 0;
  return Math.hypot(
    point.x - (from.x + direction.x * amount),
    point.y - (from.y + direction.y * amount),
    point.z - (from.z + direction.z * amount),
  );
}

function maxChordDeviation(
  points: readonly HanaVector3[],
  indices: readonly number[],
): Deviation {
  if (points.length === 0 || indices.length < 2) {
    return { pointIndex: 0, distance: 0 };
  }
  let segmentIndex = 0;
  let maximum: Deviation = { pointIndex: 0, distance: 0 };
  for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
    while (
      segmentIndex < indices.length - 2
      && pointIndex > indices[segmentIndex + 1]
    ) segmentIndex += 1;
    const distance = distancePointToSegment(
      points[pointIndex],
      points[indices[segmentIndex]],
      points[indices[segmentIndex + 1]],
    );
    if (distance > maximum.distance) maximum = { pointIndex, distance };
  }
  return maximum;
}

function maxSmoothDeviation(
  points: readonly HanaVector3[],
  indices: readonly number[],
  smooth: readonly HanaVector3[],
): Deviation {
  if (points.length === 0 || indices.length < 2 || smooth.length < 2) {
    return { pointIndex: 0, distance: 0 };
  }
  const samplesPerSegment = HANA_CURVE_SETTINGS.samplesPerSegment;
  let controlSegment = 0;
  let maximum: Deviation = { pointIndex: 0, distance: 0 };
  for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
    while (
      controlSegment < indices.length - 2
      && pointIndex > indices[controlSegment + 1]
    ) controlSegment += 1;
    const firstSmoothSegment = Math.max(0, (controlSegment - 1) * samplesPerSegment);
    const lastSmoothSegment = Math.min(
      smooth.length - 2,
      (controlSegment + 2) * samplesPerSegment,
    );
    let distance = Number.POSITIVE_INFINITY;
    for (let smoothSegment = firstSmoothSegment; smoothSegment <= lastSmoothSegment; smoothSegment += 1) {
      distance = Math.min(
        distance,
        distancePointToSegment(points[pointIndex], smooth[smoothSegment], smooth[smoothSegment + 1]),
      );
    }
    if (distance > maximum.distance) maximum = { pointIndex, distance };
  }
  return maximum;
}

/**
 * Ordered geometry-error fitting. Each accepted control is an original Raw
 * sample, so the fitter keeps gesture order and can carry exact provenance.
 */
export function selectGeometryBoundedControlIndices(
  points: readonly HanaVector3[],
  tolerance: number,
  maxControlPoints = HANA_ADAPTIVE_CONTROL_MAX_POINTS,
): number[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [0];
  const limit = Math.max(2, Math.trunc(maxControlPoints));
  const selected = new Set<number>([0, points.length - 1]);
  const ranges: Array<[number, number]> = [[0, points.length - 1]];
  const normalized = normalizedTolerance(tolerance);
  while (ranges.length > 0 && selected.size < limit) {
    const [start, end] = ranges.pop() as [number, number];
    if (end <= start + 1) continue;
    let maximum: Deviation = { pointIndex: start + 1, distance: 0 };
    for (let pointIndex = start + 1; pointIndex < end; pointIndex += 1) {
      const distance = distancePointToSegment(points[pointIndex], points[start], points[end]);
      if (distance > maximum.distance) maximum = { pointIndex, distance };
    }
    if (maximum.distance <= normalized) continue;
    selected.add(maximum.pointIndex);
    ranges.push([start, maximum.pointIndex], [maximum.pointIndex, end]);
  }
  return [...selected].sort((a, b) => a - b);
}

function rawWorldPoints(
  points: readonly HanaStrokePoint[],
  pointToWorld: (point: HanaStrokePoint) => HanaVector3,
): HanaVector3[] {
  return points.map((point) => pointToWorld(point));
}

function rawArcLengths(points: readonly HanaStrokePoint[]): number[] {
  const cumulative = [0];
  for (let index = 1; index < points.length; index += 1) {
    cumulative.push(cumulative[index - 1] + Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].y - points[index - 1].y,
    ));
  }
  return cumulative;
}

export function fitAdaptiveControlIndices(
  rawGesture: HanaViewportStroke,
  pointToWorld: (point: HanaStrokePoint) => HanaVector3,
  options: HanaAdaptiveControlFitOptions,
): HanaAdaptiveControlFitResult {
  const tolerance = normalizedTolerance(options.tolerance);
  const maxControlPoints = Math.max(
    2,
    Math.trunc(options.maxControlPoints ?? HANA_ADAPTIVE_CONTROL_MAX_POINTS),
  );
  const worldPoints = rawWorldPoints(rawGesture.points, pointToWorld);
  const rawCumulativeDistances = rawArcLengths(rawGesture.points);
  const initialSelectionStarted = performance.now();
  let indices = selectGeometryBoundedControlIndices(worldPoints, tolerance, maxControlPoints);
  const initialSelectionMilliseconds = performance.now() - initialSelectionStarted;
  const initialControlCount = indices.length;
  let refinementIterations = 0;
  let maxControl = maxChordDeviation(worldPoints, indices);
  let maxSmooth = { pointIndex: 0, distance: 0 };

  const refinementStarted = performance.now();
  while (indices.length < maxControlPoints) {
    const candidate = deriveStroke3DFromRawIndices(rawGesture, pointToWorld, indices, rawCumulativeDistances);
    candidate.curve.smoothness = normalizedSmoothness(options.smoothness);
    const smooth = sampleSmoothCenterline(candidate).map((sample) => sample.position);
    maxControl = maxChordDeviation(worldPoints, indices);
    maxSmooth = maxSmoothDeviation(worldPoints, indices, smooth);
    if (Math.max(maxControl.distance, maxSmooth.distance) <= tolerance) break;
    const nextIndex = maxSmooth.distance > maxControl.distance
      ? maxSmooth.pointIndex
      : maxControl.pointIndex;
    if (indices.includes(nextIndex)) break;
    indices = [...indices, nextIndex].sort((a, b) => a - b);
    refinementIterations += 1;
  }
  const refinementMilliseconds = performance.now() - refinementStarted;

  maxControl = maxChordDeviation(worldPoints, indices);
  const finalStroke = deriveStroke3DFromRawIndices(rawGesture, pointToWorld, indices, rawCumulativeDistances);
  finalStroke.curve.smoothness = normalizedSmoothness(options.smoothness);
  maxSmooth = maxSmoothDeviation(
    worldPoints,
    indices,
    sampleSmoothCenterline(finalStroke).map((sample) => sample.position),
  );
  return {
    indices,
    initialControlCount,
    refinementIterations,
    tolerance,
    maxControlDeviation: maxControl.distance,
    maxSmoothDeviation: maxSmooth.distance,
    smoothToleranceMet: maxSmooth.distance <= tolerance,
    initialSelectionMilliseconds,
    refinementMilliseconds,
  };
}

export function deriveAdaptiveStroke3D(
  rawGesture: HanaViewportStroke,
  pointToWorld: (point: HanaStrokePoint) => HanaVector3,
  options: HanaAdaptiveControlFitOptions,
): HanaStroke3D {
  const fit = fitAdaptiveControlIndices(rawGesture, pointToWorld, options);
  const stroke = deriveStroke3DFromRawIndices(rawGesture, pointToWorld, fit.indices);
  stroke.curve.smoothness = normalizedSmoothness(options.smoothness);
  return stroke;
}
