import type { HanaSmoothCenterlinePoint } from "./smoothCenterline.ts";
import type { HanaVector3 } from "./stroke3d.ts";

export const HANA_LIVE_PROXY_MAX_SEGMENTS = 192;

export interface HanaLiveProxySegment {
  start: HanaVector3;
  end: HanaVector3;
  radius: number;
}

function normalizedRadius(radius: number): number {
  return Number.isFinite(radius) && radius > 0 ? radius : 0.18;
}

function arcLengths(centerline: readonly HanaSmoothCenterlinePoint[]): number[] {
  const cumulative = [0];
  for (let index = 1; index < centerline.length; index += 1) {
    const from = centerline[index - 1].position;
    const to = centerline[index].position;
    cumulative.push(cumulative[index - 1] + Math.hypot(
      to.x - from.x,
      to.y - from.y,
      to.z - from.z,
    ));
  }
  return cumulative;
}

function positionAtDistance(
  centerline: readonly HanaSmoothCenterlinePoint[],
  cumulative: readonly number[],
  distance: number,
): HanaVector3 {
  if (centerline.length === 0) return { x: 0, y: 0, z: 0 };
  if (centerline.length === 1) return { ...centerline[0].position };
  const totalLength = cumulative[cumulative.length - 1];
  if (totalLength <= Number.EPSILON) return { ...centerline[0].position };
  const target = Math.max(0, Math.min(totalLength, distance));
  let end = 1;
  while (end < cumulative.length - 1 && cumulative[end] < target) end += 1;
  const start = end - 1;
  const segmentLength = cumulative[end] - cumulative[start];
  const amount = segmentLength > Number.EPSILON
    ? (target - cumulative[start]) / segmentLength
    : 0;
  const from = centerline[start].position;
  const to = centerline[end].position;
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
    z: from.z + (to.z - from.z) * amount,
  };
}

/**
 * Presentation-only bounded capsule/cylinder segments from the derived Centerline.
 * It deliberately does not use final Material Samples or enter the HANA document.
 */
export function sampleLiveProxySegments(
  centerline: readonly HanaSmoothCenterlinePoint[],
  radius: number,
  maxSegments = HANA_LIVE_PROXY_MAX_SEGMENTS,
): HanaLiveProxySegment[] {
  if (centerline.length < 2) return [];
  const cumulative = arcLengths(centerline);
  const requestedMax = Number.isFinite(maxSegments) ? Math.floor(maxSegments) : HANA_LIVE_PROXY_MAX_SEGMENTS;
  const segmentCount = Math.min(
    centerline.length - 1,
    Math.max(1, requestedMax),
  );
  const totalLength = cumulative[cumulative.length - 1];
  const normalized = normalizedRadius(radius);
  return Array.from({ length: segmentCount }, (_, index) => ({
    start: positionAtDistance(centerline, cumulative, totalLength * index / segmentCount),
    end: positionAtDistance(centerline, cumulative, totalLength * (index + 1) / segmentCount),
    radius: normalized,
  }));
}
