import type { CameraFit, FormPointSet, PcaResult, ProjectionFrame, Vec3 } from "./contracts.ts";

function dot(point: Vec3, axis: Vec3): number { return point[0] * axis[0] + point[1] * axis[1] + point[2] * axis[2]; }

function makeFrame(name: ProjectionFrame["name"], horizontalAxis: Vec3, verticalAxis: Vec3, points: Float32Array, count: number): ProjectionFrame {
  let minHorizontal = Number.POSITIVE_INFINITY; let maxHorizontal = Number.NEGATIVE_INFINITY;
  let minVertical = Number.POSITIVE_INFINITY; let maxVertical = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < count * 3; index += 3) {
    const point: Vec3 = [points[index], points[index + 1], points[index + 2]];
    const horizontal = dot(point, horizontalAxis); const vertical = dot(point, verticalAxis);
    minHorizontal = Math.min(minHorizontal, horizontal); maxHorizontal = Math.max(maxHorizontal, horizontal);
    minVertical = Math.min(minVertical, vertical); maxVertical = Math.max(maxVertical, vertical);
  }
  return { name, center: [(minHorizontal + maxHorizontal) / 2, (minVertical + maxVertical) / 2], horizontalAxis, verticalAxis, extent: [maxHorizontal - minHorizontal, maxVertical - minVertical] };
}

export function fitObservationCameras(pointSet: Pick<FormPointSet, "positions" | "pointCount">, pca: Pick<PcaResult, "basis">, padding = 0.07): CameraFit {
  if (pointSet.pointCount <= 0) throw new RangeError("Camera fit requires at least one point");
  if (!Number.isFinite(padding) || padding < 0) throw new RangeError("Camera padding must be finite and non-negative");
  const frames: readonly ProjectionFrame[] = [
    makeFrame("top", [1, 0, 0], [0, 0, 1], pointSet.positions, pointSet.pointCount),
    makeFrame("front", [1, 0, 0], [0, 1, 0], pointSet.positions, pointSet.pointCount),
    makeFrame("side", [0, 0, 1], [0, 1, 0], pointSet.positions, pointSet.pointCount),
    makeFrame("principal", pca.basis[0], pca.basis[1], pointSet.positions, pointSet.pointCount),
  ];
  const commonProjectedExtent = Math.max(...frames.flatMap((frame) => [frame.extent[0], frame.extent[1]]), Number.EPSILON);
  return { commonProjectedExtent, padding, orthographicSpan: commonProjectedExtent * (1 + padding), frames };
}
