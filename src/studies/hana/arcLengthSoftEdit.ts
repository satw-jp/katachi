import type { HanaSoftEditStrength, HanaViewDirection } from "./gesture.ts";
import type { HanaStroke } from "./authoringDocument.ts";
import { stroke3DFromHanaStroke } from "./authoringDocument.ts";
import type { HanaStroke3D, HanaStroke3DControlPoint, HanaVector3 } from "./stroke3d.ts";

/** World-space influence radii. They are editing settings, not material Thickness. */
export const HANA_ARC_LENGTH_SOFT_EDIT_RADII: Record<Exclude<HanaSoftEditStrength, "off">, number> = {
  low: 0.75,
  medium: 1.5,
};

export interface HanaArcLengthSoftEditOptions {
  radii?: Partial<Record<Exclude<HanaSoftEditStrength, "off">, number>>;
}

export interface HanaArcLengthSoftEditResult {
  stroke: HanaStroke3D;
  affectedControlIndices: number[];
  weights: number[];
  delta: HanaVector3;
  radius: number;
}

function clonePoint(point: HanaStroke3DControlPoint): HanaStroke3DControlPoint {
  return {
    ...point,
    position: { ...point.position },
    provenance: { ...point.provenance },
  };
}

function smoothFalloff(distance: number, radius: number): number {
  if (radius <= 0) return distance <= Number.EPSILON ? 1 : 0;
  const normalized = Math.max(0, Math.min(1, 1 - distance / radius));
  return normalized * normalized * (3 - 2 * normalized);
}

function arcLengths(points: readonly HanaStroke3DControlPoint[]): number[] {
  const result = [0];
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1].position;
    const b = points[index].position;
    result.push(result[index - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  return result;
}

function visibleDelta(
  selected: HanaVector3,
  visiblePosition: HanaVector3,
  direction: Exclude<HanaViewDirection, "axome">,
): HanaVector3 {
  if (direction === "front") return { x: visiblePosition.x - selected.x, y: 0, z: visiblePosition.z - selected.z };
  if (direction === "right") return { x: 0, y: visiblePosition.y - selected.y, z: visiblePosition.z - selected.z };
  return { x: visiblePosition.x - selected.x, y: visiblePosition.y - selected.y, z: 0 };
}

/** Immutable, world-space Soft Edit independent of Control Point density. */
export function applyArcLengthSoftEdit(
  source: HanaStroke3D,
  selectedIndex: number,
  direction: Exclude<HanaViewDirection, "axome">,
  visiblePosition: HanaVector3,
  strength: HanaSoftEditStrength,
  options: HanaArcLengthSoftEditOptions = {},
): HanaArcLengthSoftEditResult {
  const selected = source.controlPoints[selectedIndex];
  if (!selected) throw new Error(`Unknown HANA control point index: ${selectedIndex}`);
  const next: HanaStroke3D = {
    ...source,
    curve: { ...source.curve },
    controlPoints: source.controlPoints.map(clonePoint),
  };
  const delta = visibleDelta(selected.position, visiblePosition, direction);
  const radius = strength === "off" ? 0 : Math.max(
    Number.EPSILON,
    options.radii?.[strength] ?? HANA_ARC_LENGTH_SOFT_EDIT_RADII[strength],
  );
  const cumulative = arcLengths(source.controlPoints);
  const selectedDistance = cumulative[selectedIndex];
  const affectedControlIndices: number[] = [];
  const weights: number[] = [];
  for (let index = 0; index < next.controlPoints.length; index += 1) {
    const distance = Math.abs(cumulative[index] - selectedDistance);
    const weight = smoothFalloff(distance, radius);
    if (weight <= 0) continue;
    const point = next.controlPoints[index].position;
    point.x += delta.x * weight;
    point.y += delta.y * weight;
    point.z += delta.z * weight;
    affectedControlIndices.push(index);
    weights.push(weight);
  }
  return { stroke: next, affectedControlIndices, weights, delta, radius };
}

export function applyArcLengthSoftEditToStroke(
  source: HanaStroke,
  selectedIndex: number,
  direction: Exclude<HanaViewDirection, "axome">,
  visiblePosition: HanaVector3,
  strength: HanaSoftEditStrength,
  options: HanaArcLengthSoftEditOptions = {},
): HanaArcLengthSoftEditResult & { authoringStroke: HanaStroke } {
  const result = applyArcLengthSoftEdit(
    stroke3DFromHanaStroke(source),
    selectedIndex,
    direction,
    visiblePosition,
    strength,
    options,
  );
  return {
    ...result,
    authoringStroke: {
      ...source,
      controlPoints: result.stroke.controlPoints.map(clonePoint),
      curveSettings: { ...result.stroke.curve },
      revision: source.revision + 1,
    },
  };
}
