/** Rhino-style drag range selection over projected Stroke polylines. */

export type HanaRangeDirection = "window" | "crossing";

export interface HanaRangePoint {
  x: number;
  y: number;
}

export interface HanaRangeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  direction: HanaRangeDirection;
}

/**
 * Normalize a drag into a selection rectangle. Left-to-right drags select
 * WINDOW (fully enclosed Strokes only); right-to-left drags select CROSSING
 * (enclosed or intersecting Strokes), matching Rhino.
 */
export function normalizeHanaRangeRect(start: HanaRangePoint, current: HanaRangePoint): HanaRangeRect {
  return {
    left: Math.min(start.x, current.x),
    top: Math.min(start.y, current.y),
    right: Math.max(start.x, current.x),
    bottom: Math.max(start.y, current.y),
    direction: current.x >= start.x ? "window" : "crossing",
  };
}

export function hanaRangeRectSize(rect: HanaRangeRect): { width: number; height: number } {
  return { width: rect.right - rect.left, height: rect.bottom - rect.top };
}

export function isHanaRangePointInRect(point: HanaRangePoint, rect: HanaRangeRect): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

function orientation(a: HanaRangePoint, b: HanaRangePoint, c: HanaRangePoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: HanaRangePoint, b: HanaRangePoint, c: HanaRangePoint): boolean {
  return Math.min(a.x, c.x) <= b.x && b.x <= Math.max(a.x, c.x)
    && Math.min(a.y, c.y) <= b.y && b.y <= Math.max(a.y, c.y);
}

export function hanaRangeSegmentsIntersect(
  p1: HanaRangePoint,
  p2: HanaRangePoint,
  p3: HanaRangePoint,
  p4: HanaRangePoint,
): boolean {
  const d1 = orientation(p3, p4, p1);
  const d2 = orientation(p3, p4, p2);
  const d3 = orientation(p1, p2, p3);
  const d4 = orientation(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  if (d1 === 0 && onSegment(p3, p1, p4)) return true;
  if (d2 === 0 && onSegment(p3, p2, p4)) return true;
  if (d3 === 0 && onSegment(p1, p3, p2)) return true;
  if (d4 === 0 && onSegment(p1, p4, p2)) return true;
  return false;
}

/** True when a polyline segment touches the rectangle border or interior. */
export function hanaRangeSegmentTouchesRect(
  a: HanaRangePoint,
  b: HanaRangePoint,
  rect: HanaRangeRect,
): boolean {
  if (isHanaRangePointInRect(a, rect) || isHanaRangePointInRect(b, rect)) return true;
  const corners: HanaRangePoint[] = [
    { x: rect.left, y: rect.top },
    { x: rect.right, y: rect.top },
    { x: rect.right, y: rect.bottom },
    { x: rect.left, y: rect.bottom },
  ];
  for (let index = 0; index < corners.length; index += 1) {
    if (hanaRangeSegmentsIntersect(a, b, corners[index], corners[(index + 1) % corners.length])) return true;
  }
  return false;
}

export interface HanaRangeStroke {
  id: string;
  polyline: HanaRangePoint[];
}

/**
 * Select Stroke objects (never the Surface Mesh) from their projected 2D
 * polylines. WINDOW keeps Strokes fully inside the rectangle; CROSSING keeps
 * Strokes with a point inside or a segment touching the rectangle. Per-point
 * testing avoids bounding-box false positives on long diagonal Strokes.
 */
export function selectHanaStrokesInRange(
  strokes: readonly HanaRangeStroke[],
  rect: HanaRangeRect,
): string[] {
  const selected: string[] = [];
  for (const stroke of strokes) {
    if (stroke.polyline.length === 0) continue;
    if (rect.direction === "window") {
      if (stroke.polyline.every((point) => isHanaRangePointInRect(point, rect))) selected.push(stroke.id);
      continue;
    }
    let hit = stroke.polyline.some((point) => isHanaRangePointInRect(point, rect));
    for (let index = 0; !hit && index + 1 < stroke.polyline.length; index += 1) {
      hit = hanaRangeSegmentTouchesRect(stroke.polyline[index], stroke.polyline[index + 1], rect);
    }
    if (hit) selected.push(stroke.id);
  }
  return selected;
}

/**
 * Merge a range hit set into the selection. A plain range replaces the set;
 * Shift (or the touch fallback) adds to it. Shift+click toggle-off stays
 * exclusive to tap selection.
 */
export function mergeHanaRangeSelection(input: {
  current: readonly string[];
  hits: readonly string[];
  additive: boolean;
}): string[] {
  if (!input.additive) return [...input.hits];
  const merged = [...input.current];
  for (const id of input.hits) {
    if (!merged.includes(id)) merged.push(id);
  }
  return merged;
}
