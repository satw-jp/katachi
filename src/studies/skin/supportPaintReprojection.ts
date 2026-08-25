import { normalizeSupportPaintPoint, validateSupportPaint, type SupportPaintSite, type SupportPaintV1 } from "./supportPaint.ts";

export interface SupportPaintReprojectionFacts {
  resolution: number;
  supportSiteCount: number;
  affectedInsideCount: number;
  affectedOutsideCount: number;
  affectedAutoCount: number;
  manualOverrideCount: number;
  oppositeNormalCount: number;
  outsideStoredRegionCount: number;
  regionMatch: boolean;
}

function unit(normal: SupportPaintSite["normal"]): { x: number; y: number; z: number } | null {
  if (!normal) return null;
  const length = Math.hypot(normal.xMm, normal.yMm, normal.zMm);
  return length > 1e-9 ? { x: normal.xMm / length, y: normal.yMm / length, z: normal.zMm / length } : null;
}

export function supportPaintReprojectionFacts(input: {
  resolution: number;
  sites: readonly SupportPaintSite[];
  supportPaint: SupportPaintV1;
  frame: { centerMm: { x: number; y: number; z: number }; longestMm: number };
}): SupportPaintReprojectionFacts {
  const paint = validateSupportPaint(input.supportPaint);
  const strokeByOrder = new Map(paint.strokes.map((stroke) => [stroke.order, stroke]));
  let affectedInsideCount = 0;
  let affectedOutsideCount = 0;
  let affectedAutoCount = 0;
  let manualOverrideCount = 0;
  let oppositeNormalCount = 0;
  let outsideStoredRegionCount = 0;
  for (const site of input.sites) {
    if (site.manuallyOverridden) manualOverrideCount++;
    if (site.supportPaintStrokeOrder === undefined) continue;
    const stroke = strokeByOrder.get(site.supportPaintStrokeOrder);
    const normal = unit(site.normal);
    if (!stroke || !normal || !site.positionMm) {
      outsideStoredRegionCount++;
      continue;
    }
    const dot = normal.x * stroke.surfaceNormal.x + normal.y * stroke.surfaceNormal.y + normal.z * stroke.surfaceNormal.z;
    if (dot < stroke.normalCosineThreshold) oppositeNormalCount++;
    const point = normalizeSupportPaintPoint(site.positionMm, input.frame);
    const distance = Math.hypot(
      point.x - stroke.centerNormalized.x,
      point.y - stroke.centerNormalized.y,
      point.z - stroke.centerNormalized.z,
    );
    if (distance > stroke.radiusNormalized + 1e-6) outsideStoredRegionCount++;
    if (stroke.mode === "auto") affectedAutoCount++;
    else if (site.classification === "inside") affectedInsideCount++;
    else if (site.classification === "outside") affectedOutsideCount++;
  }
  return {
    resolution: Math.round(input.resolution),
    supportSiteCount: input.sites.length,
    affectedInsideCount,
    affectedOutsideCount,
    affectedAutoCount,
    manualOverrideCount,
    oppositeNormalCount,
    outsideStoredRegionCount,
    regionMatch: oppositeNormalCount === 0 && outsideStoredRegionCount === 0,
  };
}
