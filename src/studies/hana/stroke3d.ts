import type {
  HanaEditorState,
  HanaStrokePoint,
  HanaViewDirection,
  HanaViewportStroke,
} from "./gesture.ts";

export const HANA_DOCUMENT_FORMAT = "katachi.hana-document.v1c" as const;
export const HANA_CONTROL_POINT_COUNT = 32;
export const HANA_CURVE_SETTINGS = {
  type: "catmull-rom",
  parameterization: "centripetal",
  alpha: 0.5,
  samplesPerSegment: 8,
  smoothness: 0,
} as const;

export interface HanaCurveSettings {
  type: typeof HANA_CURVE_SETTINGS.type;
  parameterization: typeof HANA_CURVE_SETTINGS.parameterization;
  alpha: typeof HANA_CURVE_SETTINGS.alpha;
  samplesPerSegment: typeof HANA_CURVE_SETTINGS.samplesPerSegment;
  smoothness?: number;
}

export interface HanaVector3 {
  x: number;
  y: number;
  z: number;
}

export interface HanaControlPointProvenance {
  sourceStroke: string;
  sourceT: number;
  sourcePointStart: number;
  sourcePointEnd: number;
  pressure: number;
  time: number;
}

export interface HanaStroke3DControlPoint {
  id: string;
  position: HanaVector3;
  provenance: HanaControlPointProvenance;
}

export type HanaStrokeAxis = "x" | "y" | "z";

/** Semantic provenance for a full-stroke orthographic redraw. */
export interface HanaProjectionRedrawIntent {
  id: string;
  sourceStrokeId: string;
  rawGestureId: string;
  viewDirection: Exclude<HanaViewDirection, "axome">;
  visibleAxes: HanaStrokeAxis[];
  inheritedAxis: HanaStrokeAxis;
  reversed: boolean;
  controlPointIds: string[];
}

export interface HanaStroke3D {
  id: string;
  sourceGestureId: string;
  sourceViewportId: string;
  sourceViewDirection: Exclude<HanaViewDirection, "axome">;
  initialPlaneValue: number;
  curve: HanaCurveSettings;
  controlPoints: HanaStroke3DControlPoint[];
  /** Additive authoring provenance; derived geometry is intentionally absent. */
  projectionRedraws?: HanaProjectionRedrawIntent[];
}

export interface HanaDocument {
  format: typeof HANA_DOCUMENT_FORMAT;
  rawGestures: {
    strokes: HanaViewportStroke[];
  };
  strokes3D: HanaStroke3D[];
  editorState: HanaEditorState;
}

export interface HanaStroke3DSourceSample {
  point: HanaStrokePoint;
  sourceT: number;
  sourcePointStart: number;
  sourcePointEnd: number;
}

type ResampledPoint = HanaStroke3DSourceSample;

function lerp(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

function cloneGesture(stroke: HanaViewportStroke): HanaViewportStroke {
  return {
    ...stroke,
    viewportSize: { ...stroke.viewportSize },
    points: stroke.points.map((point) => ({ ...point })),
  };
}

function cloneStroke3D(stroke: HanaStroke3D): HanaStroke3D {
  return {
    ...stroke,
    curve: { ...stroke.curve },
    controlPoints: stroke.controlPoints.map((point) => ({
      ...point,
      position: { ...point.position },
      provenance: { ...point.provenance },
    })),
    ...(stroke.projectionRedraws
      ? {
        projectionRedraws: stroke.projectionRedraws.map((intent) => ({
          ...intent,
          visibleAxes: [...intent.visibleAxes],
          controlPointIds: [...intent.controlPointIds],
        })),
      }
      : {}),
  };
}

function cloneEditorState(editorState: HanaEditorState): HanaEditorState {
  return {
    ...editorState,
    split: { ...editorState.split },
    viewports: editorState.viewports.map((viewport) => ({
      ...viewport,
      camera: {
        ...viewport.camera,
        position: [...viewport.camera.position],
        up: [...viewport.camera.up],
        target: [...viewport.camera.target],
      },
    })),
  };
}

export function resampleRawGesture(
  points: readonly HanaStrokePoint[],
  targetCount = HANA_CONTROL_POINT_COUNT,
): ResampledPoint[] {
  if (points.length === 0 || targetCount <= 0) return [];
  if (points.length === 1) {
    return [{ point: { ...points[0] }, sourceT: 0, sourcePointStart: 0, sourcePointEnd: 0 }];
  }

  const count = Math.max(2, Math.trunc(targetCount));
  const cumulative = [0];
  for (let index = 1; index < points.length; index += 1) {
    cumulative.push(cumulative[index - 1] + Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].y - points[index - 1].y,
    ));
  }
  const totalLength = cumulative[cumulative.length - 1];

  return Array.from({ length: count }, (_, outputIndex) => {
    const sourceT = outputIndex / (count - 1);
    const targetDistance = totalLength * sourceT;
    let end = cumulative.findIndex((distance) => distance >= targetDistance);
    if (end < 0) end = cumulative.length - 1;
    if (end === 0) end = 1;
    const start = end - 1;
    const segmentLength = cumulative[end] - cumulative[start];
    const amount = segmentLength > 0
      ? (targetDistance - cumulative[start]) / segmentLength
      : sourceT;
    const from = points[start];
    const to = points[end];
    return {
      point: {
        x: lerp(from.x, to.x, amount),
        y: lerp(from.y, to.y, amount),
        pressure: lerp(from.pressure, to.pressure, amount),
        time: lerp(from.time, to.time, amount),
      },
      sourceT,
      sourcePointStart: start,
      sourcePointEnd: end,
    };
  });
}

function createStroke3DFromResampled(
  rawGesture: HanaViewportStroke,
  samples: readonly ResampledPoint[],
  pointToWorld: (point: HanaStrokePoint) => HanaVector3,
): HanaStroke3D {
  const controlPoints = samples.map((sample, index) => ({
    id: `control-${index + 1}`,
    position: pointToWorld(sample.point),
    provenance: {
      sourceStroke: rawGesture.id,
      sourceT: sample.sourceT,
      sourcePointStart: sample.sourcePointStart,
      sourcePointEnd: sample.sourcePointEnd,
      pressure: sample.point.pressure,
      time: sample.point.time,
    },
  }));
  const missingAxis = rawGesture.viewDirection === "front"
    ? "y"
    : rawGesture.viewDirection === "right" ? "x" : "z";
  return {
    id: "stroke3d-1",
    sourceGestureId: rawGesture.id,
    sourceViewportId: rawGesture.viewportId,
    sourceViewDirection: rawGesture.viewDirection as Exclude<HanaViewDirection, "axome">,
    initialPlaneValue: controlPoints[0]?.position[missingAxis] ?? 0,
    curve: { ...HANA_CURVE_SETTINGS },
    controlPoints,
  };
}

/**
 * Build a provisional or authoritative Stroke3D from an already-resampled
 * ordered source stream. The caller owns the resampling policy; this helper
 * only creates the normal editable Stroke3D representation and provenance.
 */
export function deriveStroke3DFromSamples(
  rawGesture: HanaViewportStroke,
  samples: readonly HanaStroke3DSourceSample[],
  pointToWorld: (point: HanaStrokePoint) => HanaVector3,
): HanaStroke3D {
  if (rawGesture.viewDirection === "axome") {
    throw new Error("Axome Draw cannot create a HANA Stroke3D");
  }
  return createStroke3DFromResampled(rawGesture, samples, pointToWorld);
}

export function deriveStroke3D(
  rawGesture: HanaViewportStroke,
  pointToWorld: (point: HanaStrokePoint) => HanaVector3,
  targetCount = HANA_CONTROL_POINT_COUNT,
): HanaStroke3D {
  if (rawGesture.viewDirection === "axome") {
    throw new Error("Axome Draw cannot create a HANA Stroke3D");
  }
  return createStroke3DFromResampled(
    rawGesture,
    resampleRawGesture(rawGesture.points, targetCount),
    pointToWorld,
  );
}

/**
 * Build controls from exact ordered Raw Gesture samples selected by a fitting
 * algorithm. This bypasses fixed-count resampling but keeps the same
 * provenance and editable Stroke3D representation.
 */
export function deriveStroke3DFromRawIndices(
  rawGesture: HanaViewportStroke,
  pointToWorld: (point: HanaStrokePoint) => HanaVector3,
  rawIndices: readonly number[],
  rawCumulativeDistances?: readonly number[],
): HanaStroke3D {
  if (rawGesture.viewDirection === "axome") {
    throw new Error("Axome Draw cannot create a HANA Stroke3D");
  }
  const points = rawGesture.points;
  if (points.length === 0) return createStroke3DFromResampled(rawGesture, [], pointToWorld);

  const cumulative = rawCumulativeDistances ? [...rawCumulativeDistances] : [0];
  if (!rawCumulativeDistances) {
    for (let index = 1; index < points.length; index += 1) {
      cumulative.push(cumulative[index - 1] + Math.hypot(
        points[index].x - points[index - 1].x,
        points[index].y - points[index - 1].y,
      ));
    }
  }
  const totalLength = cumulative[cumulative.length - 1];
  const normalizedIndices = [...new Set([
    0,
    ...rawIndices.map((index) => Math.trunc(index)),
    points.length - 1,
  ].filter((index) => index >= 0 && index < points.length))].sort((a, b) => a - b);
  const samples: ResampledPoint[] = normalizedIndices.map((sourceIndex) => ({
    point: { ...points[sourceIndex] },
    sourceT: totalLength > Number.EPSILON
      ? cumulative[sourceIndex] / totalLength
      : sourceIndex / Math.max(1, points.length - 1),
    sourcePointStart: sourceIndex,
    sourcePointEnd: sourceIndex,
  }));
  return createStroke3DFromResampled(rawGesture, samples, pointToWorld);
}

export function applyViewportEdit(
  point: HanaStroke3DControlPoint,
  direction: Exclude<HanaViewDirection, "axome">,
  visiblePosition: HanaVector3,
): void {
  if (direction === "front") {
    point.position.x = visiblePosition.x;
    point.position.z = visiblePosition.z;
  } else if (direction === "right") {
    point.position.y = visiblePosition.y;
    point.position.z = visiblePosition.z;
  } else {
    point.position.x = visiblePosition.x;
    point.position.y = visiblePosition.y;
  }
}

export function createHanaDocument(
  rawGestures: readonly HanaViewportStroke[],
  strokes3D: readonly HanaStroke3D[],
  editorState: HanaEditorState,
): HanaDocument {
  return {
    format: HANA_DOCUMENT_FORMAT,
    rawGestures: { strokes: rawGestures.map(cloneGesture) },
    strokes3D: strokes3D.map(cloneStroke3D),
    editorState: cloneEditorState(editorState),
  };
}
