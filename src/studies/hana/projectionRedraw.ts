import type { HanaStrokePoint, HanaViewDirection } from "./gesture.ts";
import type {
  HanaProjectionRedrawIntent,
  HanaStroke3D,
  HanaStroke3DControlPoint,
  HanaStrokeAxis,
  HanaVector3,
} from "./stroke3d.ts";

export const HANA_PROJECTION_REDRAW_AXES: Record<
  Exclude<HanaViewDirection, "axome">,
  { visible: readonly HanaStrokeAxis[]; inherited: HanaStrokeAxis }
> = {
  front: { visible: ["x", "z"], inherited: "y" },
  right: { visible: ["y", "z"], inherited: "x" },
  top: { visible: ["x", "y"], inherited: "z" },
};

export interface HanaProjectionRedrawViewPoint {
  x: number;
  y: number;
}

export interface HanaProjectionRedrawOptions {
  /** Project a redraw sample into the current view using any hidden-axis plane. */
  pointToWorld: (
    point: HanaStrokePoint,
    inheritedAxisValue: number,
    existingPosition: HanaVector3,
  ) => HanaVector3 | null;
  /** Optional screen projection used to make reverse-direction input endpoint-safe. */
  pointToView?: (position: HanaVector3) => HanaProjectionRedrawViewPoint | null;
}

export interface HanaProjectionRedrawResult {
  stroke: HanaStroke3D;
  reversed: boolean;
  visibleAxes: readonly HanaStrokeAxis[];
  inheritedAxis: HanaStrokeAxis;
  redrawParameters: number[];
}

function clonePosition(position: HanaVector3): HanaVector3 {
  return { x: position.x, y: position.y, z: position.z };
}

function cloneControlPoint(point: HanaStroke3DControlPoint): HanaStroke3DControlPoint {
  return {
    ...point,
    position: clonePosition(point.position),
    provenance: { ...point.provenance },
  };
}

function distance(a: HanaProjectionRedrawViewPoint, b: HanaProjectionRedrawViewPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function finitePoint(point: HanaStrokePoint): boolean {
  return Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && Number.isFinite(point.pressure)
    && Number.isFinite(point.time);
}

function cumulativePolylineLengths(points: readonly HanaStrokePoint[]): number[] {
  const cumulative = [0];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    cumulative.push(cumulative[index - 1] + Math.hypot(
      current.x - previous.x,
      current.y - previous.y,
    ));
  }
  return cumulative;
}

function sampleAtNormalizedLength(
  points: readonly HanaStrokePoint[],
  cumulative: readonly number[],
  totalLength: number,
  normalized: number,
): HanaStrokePoint {
  if (normalized <= 0) return { ...points[0] };
  if (normalized >= 1) return { ...points[points.length - 1] };
  const target = totalLength * normalized;
  let segment = 1;
  while (segment < cumulative.length - 1 && cumulative[segment] < target) segment += 1;
  while (segment < cumulative.length && cumulative[segment] <= cumulative[segment - 1]) segment += 1;
  if (segment >= cumulative.length) return { ...points[points.length - 1] };
  const start = segment - 1;
  const length = cumulative[segment] - cumulative[start];
  const amount = Math.max(0, Math.min(1, (target - cumulative[start]) / length));
  const from = points[start];
  const to = points[segment];
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
    pressure: from.pressure + (to.pressure - from.pressure) * amount,
    time: from.time + (to.time - from.time) * amount,
  };
}

function controlArcLengthParameters(controls: readonly HanaStroke3DControlPoint[]): number[] {
  const cumulative = [0];
  for (let index = 1; index < controls.length; index += 1) {
    const previous = controls[index - 1].position;
    const current = controls[index].position;
    cumulative.push(cumulative[index - 1] + Math.hypot(
      current.x - previous.x,
      current.y - previous.y,
      current.z - previous.z,
    ));
  }
  const total = cumulative[cumulative.length - 1];
  return total > Number.EPSILON
    ? cumulative.map((value) => value / total)
    : controls.map((_, index) => index / Math.max(1, controls.length - 1));
}

function inheritedAxisValue(position: HanaVector3, axis: HanaStrokeAxis): number {
  return position[axis];
}

function copyVisibleAxes(
  existing: HanaVector3,
  projected: HanaVector3,
  visibleAxes: readonly HanaStrokeAxis[],
): HanaVector3 {
  const next = clonePosition(existing);
  for (const axis of visibleAxes) next[axis] = projected[axis];
  return next;
}

function shouldReverseInput(
  controls: readonly HanaStroke3DControlPoint[],
  points: readonly HanaStrokePoint[],
  inheritedAxis: HanaStrokeAxis,
  options: HanaProjectionRedrawOptions,
): boolean {
  if (!options.pointToView || controls.length < 2 || points.length < 2) return false;
  const existingStart = options.pointToView(controls[0].position);
  const existingEnd = options.pointToView(controls[controls.length - 1].position);
  const redrawStartWorld = options.pointToWorld(points[0], controls[0].position[inheritedAxis], controls[0].position);
  const redrawEndWorld = options.pointToWorld(points[points.length - 1], controls[controls.length - 1].position[inheritedAxis], controls[controls.length - 1].position);
  if (!existingStart || !existingEnd || !redrawStartWorld || !redrawEndWorld) return false;
  const redrawStart = options.pointToView(redrawStartWorld);
  const redrawEnd = options.pointToView(redrawEndWorld);
  if (!redrawStart || !redrawEnd) return false;
  const sameDirection = distance(redrawStart, existingStart) + distance(redrawEnd, existingEnd);
  const reverseDirection = distance(redrawStart, existingEnd) + distance(redrawEnd, existingStart);
  return reverseDirection + 1e-6 < sameDirection;
}

/**
 * Apply a complete orthographic redraw to an existing Stroke3D.
 * Control count, point identity, source provenance and the hidden axis are retained.
 */
export function applyHanaProjectionRedraw(
  source: HanaStroke3D,
  redrawGesture: { viewDirection: HanaViewDirection; points: readonly HanaStrokePoint[] },
  options: HanaProjectionRedrawOptions,
): HanaProjectionRedrawResult {
  const direction = redrawGesture.viewDirection;
  if (direction === "axome") throw new Error("Projection Redraw requires an orthographic view");
  const mapping = HANA_PROJECTION_REDRAW_AXES[direction];
  if (!mapping) throw new Error(`Unsupported Projection Redraw view: ${direction}`);
  if (source.controlPoints.length === 0) throw new Error("Projection Redraw requires Control Points");
  if (redrawGesture.points.length < 2 || redrawGesture.points.some((point) => !finitePoint(point))) {
    throw new Error("Projection Redraw requires at least two finite points");
  }
  const cumulative = cumulativePolylineLengths(redrawGesture.points);
  const totalLength = cumulative[cumulative.length - 1];
  if (!Number.isFinite(totalLength) || totalLength <= Number.EPSILON) {
    throw new Error("Projection Redraw gesture has zero length");
  }
  const sourceParameters = controlArcLengthParameters(source.controlPoints);
  const reversed = shouldReverseInput(source.controlPoints, redrawGesture.points, mapping.inherited, options);
  const nextControls = source.controlPoints.map((control, index) => {
    const sourceParameter = sourceParameters[index];
    const redrawParameter = reversed ? 1 - sourceParameter : sourceParameter;
    const sample = sampleAtNormalizedLength(
      redrawGesture.points,
      cumulative,
      totalLength,
      redrawParameter,
    );
    const projected = options.pointToWorld(
      sample,
      inheritedAxisValue(control.position, mapping.inherited),
      control.position,
    );
    if (!projected) throw new Error(`Projection Redraw could not project point ${index + 1}`);
    return {
      ...cloneControlPoint(control),
      position: copyVisibleAxes(control.position, projected, mapping.visible),
    };
  });
  return {
    stroke: {
      ...source,
      curve: { ...source.curve },
      controlPoints: nextControls,
      ...(source.projectionRedraws
        ? {
          projectionRedraws: source.projectionRedraws.map((intent) => ({
            ...intent,
            visibleAxes: [...intent.visibleAxes],
            controlPointIds: [...intent.controlPointIds],
          })),
        }
        : {}),
    },
    reversed,
    visibleAxes: mapping.visible,
    inheritedAxis: mapping.inherited,
    redrawParameters: sourceParameters.map((parameter) => reversed ? 1 - parameter : parameter),
  };
}

/** Create the persisted intent record after a redraw has been accepted. */
export function createHanaProjectionRedrawIntent(
  id: string,
  sourceStrokeId: string,
  rawGestureId: string,
  viewDirection: Exclude<HanaViewDirection, "axome">,
  result: Pick<HanaProjectionRedrawResult, "reversed" | "visibleAxes" | "inheritedAxis" | "stroke">,
): HanaProjectionRedrawIntent {
  return {
    id,
    sourceStrokeId,
    rawGestureId,
    viewDirection,
    visibleAxes: [...result.visibleAxes],
    inheritedAxis: result.inheritedAxis,
    reversed: result.reversed,
    controlPointIds: result.stroke.controlPoints.map((point) => point.id),
  };
}
