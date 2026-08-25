export const VIEWPORT_CLIP_AXES = ["x", "y", "z"] as const;
export type ViewportClipAxis = typeof VIEWPORT_CLIP_AXES[number];
export type ViewportClipDirection = 1 | -1;

export interface ViewportClipRange {
  min: number;
  max: number;
}

export type ViewportClippingBounds = Record<ViewportClipAxis, ViewportClipRange>;

export interface ViewportClipAxisState {
  enabled: boolean;
  position: number;
  direction: ViewportClipDirection;
}

export type ViewportClippingState = Record<ViewportClipAxis, ViewportClipAxisState>;

export type ViewportClippingAction =
  | { type: "toggle"; axis: ViewportClipAxis; enabled: boolean }
  | { type: "position"; axis: ViewportClipAxis; position: number }
  | { type: "flip"; axis: ViewportClipAxis }
  | { type: "reset-axis"; axis: ViewportClipAxis }
  | { type: "disable-all" }
  | { type: "reset-all" };

function finiteRange(range: ViewportClipRange): ViewportClipRange {
  if (!Number.isFinite(range.min) || !Number.isFinite(range.max)) return { min: 0, max: 0 };
  return range.min <= range.max ? { ...range } : { min: range.max, max: range.min };
}

export function normalizeViewportClippingBounds(bounds: ViewportClippingBounds): ViewportClippingBounds {
  return {
    x: finiteRange(bounds.x),
    y: finiteRange(bounds.y),
    z: finiteRange(bounds.z),
  };
}

export function viewportClipMidpoint(range: ViewportClipRange): number {
  return (range.min + range.max) * 0.5;
}

export function createViewportClippingState(
  bounds?: ViewportClippingBounds | null,
): ViewportClippingState {
  const normalized = bounds ? normalizeViewportClippingBounds(bounds) : {
    x: { min: 0, max: 0 },
    y: { min: 0, max: 0 },
    z: { min: 0, max: 0 },
  };
  return {
    x: { enabled: false, position: viewportClipMidpoint(normalized.x), direction: 1 },
    y: { enabled: false, position: viewportClipMidpoint(normalized.y), direction: 1 },
    z: { enabled: false, position: viewportClipMidpoint(normalized.z), direction: 1 },
  };
}

function clampToRange(value: number, range: ViewportClipRange): number {
  if (!Number.isFinite(value)) return viewportClipMidpoint(range);
  return Math.min(range.max, Math.max(range.min, value));
}

export function rebaseViewportClippingState(
  state: ViewportClippingState,
  previousBounds: ViewportClippingBounds | null,
  nextBounds: ViewportClippingBounds,
): ViewportClippingState {
  const next = normalizeViewportClippingBounds(nextBounds);
  if (!previousBounds) return createViewportClippingState(next);
  const previous = normalizeViewportClippingBounds(previousBounds);
  return Object.fromEntries(VIEWPORT_CLIP_AXES.map((axis) => {
    const oldRange = previous[axis];
    const newRange = next[axis];
    const oldSpan = oldRange.max - oldRange.min;
    const fraction = oldSpan > 1e-12
      ? (state[axis].position - oldRange.min) / oldSpan
      : 0.5;
    const position = newRange.min + Math.min(1, Math.max(0, fraction)) * (newRange.max - newRange.min);
    return [axis, { ...state[axis], position: clampToRange(position, newRange) }];
  })) as ViewportClippingState;
}

export function reduceViewportClippingState(
  state: ViewportClippingState,
  bounds: ViewportClippingBounds,
  action: ViewportClippingAction,
): ViewportClippingState {
  const normalized = normalizeViewportClippingBounds(bounds);
  if (action.type === "disable-all") {
    return Object.fromEntries(VIEWPORT_CLIP_AXES.map((axis) => [
      axis, { ...state[axis], enabled: false },
    ])) as ViewportClippingState;
  }
  if (action.type === "reset-all") return createViewportClippingState(normalized);
  const axis = action.axis;
  const next = { ...state, [axis]: { ...state[axis] } };
  if (action.type === "toggle") next[axis].enabled = action.enabled;
  if (action.type === "position") next[axis].position = clampToRange(action.position, normalized[axis]);
  if (action.type === "flip") next[axis].direction = next[axis].direction === 1 ? -1 : 1;
  if (action.type === "reset-axis") {
    next[axis] = {
      enabled: false,
      position: viewportClipMidpoint(normalized[axis]),
      direction: 1,
    };
  }
  return next;
}

export function viewportPointVisible(
  point: { x: number; y: number; z: number },
  state: ViewportClippingState | null,
  epsilon = 1e-7,
): boolean {
  if (!state) return true;
  for (const axis of VIEWPORT_CLIP_AXES) {
    const clip = state[axis];
    if (!clip.enabled) continue;
    if (clip.direction * (point[axis] - clip.position) < -epsilon) return false;
  }
  return true;
}

export function viewportClippingToObjectUnits(
  stateMm: ViewportClippingState,
  scaleMmPerUnit: number,
): ViewportClippingState {
  if (!(scaleMmPerUnit > 0) || !Number.isFinite(scaleMmPerUnit)) {
    return createViewportClippingState();
  }
  return Object.fromEntries(VIEWPORT_CLIP_AXES.map((axis) => [
    axis,
    { ...stateMm[axis], position: stateMm[axis].position / scaleMmPerUnit },
  ])) as ViewportClippingState;
}

export function activeViewportClipAxisCount(state: ViewportClippingState): number {
  return VIEWPORT_CLIP_AXES.filter((axis) => state[axis].enabled).length;
}
