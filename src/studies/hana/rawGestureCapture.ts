import type { HanaStrokePoint } from "./gesture.ts";

export type HanaRawCaptureSource = "parent-pointer-event" | "coalesced-event";

export interface HanaPointerSampleLike {
  pointerId: number;
  clientX: number;
  clientY: number;
  pressure: number;
  timeStamp: number;
}

export interface HanaRawPointerCandidate<T extends HanaPointerSampleLike = HanaPointerSampleLike> {
  event: T;
  source: HanaRawCaptureSource;
}

export interface HanaRawCaptureSourceCounts {
  parentPointerEvent: number;
  coalescedEvent: number;
}

export interface HanaRawGestureGap {
  fromIndex: number;
  toIndex: number;
  fromTime: number;
  toTime: number;
  deltaTime: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  distance: number;
}

export interface HanaRawGestureCaptureDiagnostics {
  sampleCount: number;
  uniqueSampleCount: number;
  exactDuplicateCount: number;
  suppressedExactDuplicateCount: number;
  medianSampleInterval: number;
  p95SampleInterval: number;
  maxSampleInterval: number;
  intervalOver50Milliseconds: number;
  intervalOver100Milliseconds: number;
  maxSpatialJump: number;
  largestGap: HanaRawGestureGap | null;
  monotonicTime: boolean;
  parentPointerSamples: number;
  coalescedSamples: number;
}

const EMPTY_SOURCE_COUNTS: HanaRawCaptureSourceCounts = {
  parentPointerEvent: 0,
  coalescedEvent: 0,
};

function sameNumber(left: number, right: number): boolean {
  return Object.is(left, right);
}

/** Exact identity is intentionally strict; nearby samples must remain Raw data. */
export function samePointerSample(left: HanaPointerSampleLike, right: HanaPointerSampleLike): boolean {
  return left.pointerId === right.pointerId
    && sameNumber(left.clientX, right.clientX)
    && sameNumber(left.clientY, right.clientY)
    && sameNumber(left.pressure, right.pressure)
    && sameNumber(left.timeStamp, right.timeStamp);
}

/**
 * Return all coalesced samples and the parent event when it is not already
 * represented by the final coalesced sample. No frame throttling happens here.
 */
export function collectPointerEventSamples<T extends HanaPointerSampleLike>(
  parent: T,
  coalesced: readonly T[],
): HanaRawPointerCandidate<T>[] {
  if (coalesced.length === 0) {
    return [{ event: parent, source: "parent-pointer-event" }];
  }
  const candidates: HanaRawPointerCandidate<T>[] = coalesced.map((event) => ({
    event,
    source: "coalesced-event",
  }));
  const finalCoalesced = candidates[candidates.length - 1]?.event;
  if (!finalCoalesced || !samePointerSample(finalCoalesced, parent)) {
    candidates.push({ event: parent, source: "parent-pointer-event" });
  }
  return candidates;
}

export interface HanaRawPointerDeduplicationResult<T extends HanaPointerSampleLike> {
  accepted: HanaRawPointerCandidate<T>[];
  lastCaptured: T | null;
  suppressedExactDuplicateCount: number;
}

/**
 * Remove only exact adjacent duplicates at the capture boundary. Keeping the
 * previous accepted event also removes overlap between successive coalesced
 * batches without applying proximity, pressure, or time decimation.
 */
export function dedupeExactPointerSamples<T extends HanaPointerSampleLike>(
  candidates: readonly HanaRawPointerCandidate<T>[],
  previous: T | null,
): HanaRawPointerDeduplicationResult<T> {
  const accepted: HanaRawPointerCandidate<T>[] = [];
  let lastCaptured = previous;
  let suppressedExactDuplicateCount = 0;
  for (const candidate of candidates) {
    if (lastCaptured && samePointerSample(lastCaptured, candidate.event)) {
      suppressedExactDuplicateCount += 1;
      continue;
    }
    accepted.push(candidate);
    lastCaptured = candidate.event;
  }
  return { accepted, lastCaptured, suppressedExactDuplicateCount };
}

function pointKey(point: HanaStrokePoint): string {
  return [point.x, point.y, point.pressure, point.time]
    .map((value) => (Object.is(value, -0) ? "-0" : String(value)))
    .join("|");
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function percentile95(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
}

function spatialDistance(from: HanaStrokePoint, to: HanaStrokePoint): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

export function summarizeRawGestureCapture(
  points: readonly HanaStrokePoint[],
  sourceCounts: HanaRawCaptureSourceCounts = EMPTY_SOURCE_COUNTS,
  suppressedExactDuplicateCount = 0,
): HanaRawGestureCaptureDiagnostics {
  const signatures = new Set<string>();
  const intervals: number[] = [];
  let exactDuplicateCount = 0;
  let monotonicTime = true;
  let maxSpatialJump = 0;
  let maxSampleInterval = 0;
  let largestGap: HanaRawGestureGap | null = null;

  points.forEach((point, index) => {
    const key = pointKey(point);
    if (signatures.has(key)) exactDuplicateCount += 1;
    signatures.add(key);
    if (index === 0) return;
    const previous = points[index - 1];
    const deltaTime = point.time - previous.time;
    if (!Number.isFinite(deltaTime) || deltaTime < 0) monotonicTime = false;
    const safeInterval = Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : 0;
    intervals.push(safeInterval);
    maxSampleInterval = Math.max(maxSampleInterval, safeInterval);
    const distance = spatialDistance(previous, point);
    maxSpatialJump = Math.max(maxSpatialJump, distance);
    if (!largestGap || safeInterval > largestGap.deltaTime) {
      largestGap = {
        fromIndex: index - 1,
        toIndex: index,
        fromTime: previous.time,
        toTime: point.time,
        deltaTime: safeInterval,
        fromX: previous.x,
        fromY: previous.y,
        toX: point.x,
        toY: point.y,
        distance,
      };
    }
  });

  return {
    sampleCount: points.length,
    uniqueSampleCount: signatures.size,
    exactDuplicateCount,
    suppressedExactDuplicateCount,
    medianSampleInterval: median(intervals),
    p95SampleInterval: percentile95(intervals),
    maxSampleInterval,
    intervalOver50Milliseconds: intervals.filter((value) => value > 50).length,
    intervalOver100Milliseconds: intervals.filter((value) => value > 100).length,
    maxSpatialJump,
    largestGap,
    monotonicTime,
    parentPointerSamples: sourceCounts.parentPointerEvent,
    coalescedSamples: sourceCounts.coalescedEvent,
  };
}
