export interface ScreenPoint {
  x: number;
  y: number;
}

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface OpeningLabelLayoutOptions {
  viewportWidth: number;
  viewportHeight: number;
  labelWidth?: number;
  labelHeight?: number;
  inset?: number;
  gap?: number;
  subjectRect?: ScreenRect | null;
  obstacleRects?: readonly ScreenRect[];
}

function overlaps(a: ScreenRect, b: ScreenRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function labelRect(point: ScreenPoint, width: number, height: number): ScreenRect {
  return {
    left: point.x - width * 0.5,
    top: point.y - height * 0.5,
    right: point.x + width * 0.5,
    bottom: point.y + height * 0.5,
  };
}

function axisSlots(start: number, end: number, step: number): number[] {
  if (end < start) return [];
  const count = Math.max(1, Math.floor((end - start) / step) + 1);
  if (count === 1) return [(start + end) * 0.5];
  return Array.from({ length: count }, (_, index) => start + ((end - start) * index) / (count - 1));
}

/**
 * Place annotation cards on the viewport perimeter and assign each opening
 * to the nearest unused card. Cards that would cover the projected form are
 * discarded first; the full perimeter remains as a bounded fallback for a
 * zoomed-in form with no completely clear margin.
 */
export function layoutOpeningLabelsOutside(
  anchors: readonly ScreenPoint[],
  options: OpeningLabelLayoutOptions,
): ScreenPoint[] {
  const width = options.labelWidth ?? 126;
  const height = options.labelHeight ?? 50;
  const inset = options.inset ?? 8;
  const gap = options.gap ?? 6;
  const halfW = width * 0.5;
  const halfH = height * 0.5;
  const minX = inset + halfW;
  const maxX = Math.max(minX, options.viewportWidth - inset - halfW);
  const minY = inset + halfH;
  const maxY = Math.max(minY, options.viewportHeight - inset - halfH);
  const horizontal = axisSlots(minX, maxX, width + gap);
  // Start vertical cards below the top-row card and end above the bottom row
  // so corner cards never overlap one another.
  const vertical = axisSlots(minY + height + gap, maxY - height - gap, height + gap);
  const allSlots: ScreenPoint[] = [
    ...horizontal.map((x) => ({ x, y: minY })),
    ...vertical.map((y) => ({ x: maxX, y })),
    ...horizontal.slice().reverse().map((x) => ({ x, y: maxY })),
    ...vertical.slice().reverse().map((y) => ({ x: minX, y })),
  ];
  const expandedSubject = options.subjectRect ? {
    left: options.subjectRect.left - gap,
    top: options.subjectRect.top - gap,
    right: options.subjectRect.right + gap,
    bottom: options.subjectRect.bottom + gap,
  } : null;
  // Persistent controls are a hard exclusion. The projected form is a soft
  // exclusion because a perspective AABB can substantially overestimate the
  // visible silhouette; clear-form slots are always consumed first, then the
  // remaining perimeter is used without ever covering Undo/view controls.
  const hardObstacles = options.obstacleRects ?? [];
  const hardClearSlots = hardObstacles.length > 0
    ? allSlots.filter((slot) => hardObstacles.every((obstacle) => !overlaps(labelRect(slot, width, height), obstacle)))
    : allSlots;
  const available = hardClearSlots.length >= anchors.length ? hardClearSlots.slice() : allSlots.slice();
  const result: ScreenPoint[] = [];
  for (const anchor of anchors) {
    if (available.length === 0) {
      result.push({
        x: Math.max(minX, Math.min(maxX, anchor.x)),
        y: Math.max(minY, Math.min(maxY, anchor.y)),
      });
      continue;
    }
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let index = 0; index < available.length; index++) {
      const slot = available[index];
      const dx = slot.x - anchor.x;
      const dy = slot.y - anchor.y;
      const coversProjectedForm = expandedSubject
        ? overlaps(labelRect(slot, width, height), expandedSubject)
        : false;
      const distance = dx * dx + dy * dy + (coversProjectedForm ? 1e9 : 0);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    result.push(available.splice(bestIndex, 1)[0]);
  }
  return result;
}
