export interface ScreenPoint2 {
  x: number;
  y: number;
}

export interface NormalizedScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function normalizedScreenRect(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): NormalizedScreenRect {
  return {
    left: Math.min(startX, endX),
    top: Math.min(startY, endY),
    right: Math.max(startX, endX),
    bottom: Math.max(startY, endY),
  };
}

function pointInRect(point: ScreenPoint2, rect: NormalizedScreenRect): boolean {
  return point.x >= rect.left && point.x <= rect.right
    && point.y >= rect.top && point.y <= rect.bottom;
}

function orientation(a: ScreenPoint2, b: ScreenPoint2, c: ScreenPoint2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(point: ScreenPoint2, start: ScreenPoint2, end: ScreenPoint2): boolean {
  const epsilon = 1e-7;
  return Math.abs(orientation(start, end, point)) <= epsilon
    && point.x >= Math.min(start.x, end.x) - epsilon
    && point.x <= Math.max(start.x, end.x) + epsilon
    && point.y >= Math.min(start.y, end.y) - epsilon
    && point.y <= Math.max(start.y, end.y) + epsilon;
}

function segmentsIntersect(a: ScreenPoint2, b: ScreenPoint2, c: ScreenPoint2, d: ScreenPoint2): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0))
    && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) return true;
  return pointOnSegment(c, a, b) || pointOnSegment(d, a, b)
    || pointOnSegment(a, c, d) || pointOnSegment(b, c, d);
}

function pointInTriangle(point: ScreenPoint2, triangle: readonly [ScreenPoint2, ScreenPoint2, ScreenPoint2]): boolean {
  const [a, b, c] = triangle;
  const first = orientation(a, b, point);
  const second = orientation(b, c, point);
  const third = orientation(c, a, point);
  const hasNegative = first < 0 || second < 0 || third < 0;
  const hasPositive = first > 0 || second > 0 || third > 0;
  return !(hasNegative && hasPositive);
}

/** Inclusive 2D overlap. A red triangle is selected when any part of its
 * visible projection enters the marquee, not only when a sparse pointer path
 * happens to cross its centre. */
export function screenTriangleIntersectsRect(
  triangle: readonly [ScreenPoint2, ScreenPoint2, ScreenPoint2],
  rect: NormalizedScreenRect,
): boolean {
  if (triangle.some((point) => pointInRect(point, rect))) return true;
  const corners: [ScreenPoint2, ScreenPoint2, ScreenPoint2, ScreenPoint2] = [
    { x: rect.left, y: rect.top },
    { x: rect.right, y: rect.top },
    { x: rect.right, y: rect.bottom },
    { x: rect.left, y: rect.bottom },
  ];
  if (corners.some((point) => pointInTriangle(point, triangle))) return true;
  const triangleEdges: Array<[ScreenPoint2, ScreenPoint2]> = [
    [triangle[0], triangle[1]],
    [triangle[1], triangle[2]],
    [triangle[2], triangle[0]],
  ];
  const rectEdges: Array<[ScreenPoint2, ScreenPoint2]> = [
    [corners[0], corners[1]],
    [corners[1], corners[2]],
    [corners[2], corners[3]],
    [corners[3], corners[0]],
  ];
  return triangleEdges.some(([start, end]) =>
    rectEdges.some(([rectStart, rectEnd]) => segmentsIntersect(start, end, rectStart, rectEnd)));
}
