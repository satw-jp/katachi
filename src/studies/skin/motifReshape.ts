import type { Ball } from "../cloud-sculpt/field.ts";
import { hashSeed, makeRng } from "../cloud-sculpt/random.ts";
import {
  captureMotifShapeParams,
  generateShapePoints,
  projectToSurface,
  type MotifShapeParams,
  type Patch,
  type PatchPoint,
  type Projected,
  type SkinParams,
} from "./field.ts";

export type MotifReshapeResult = { ok: true; patch: Patch } | { ok: false; reason: string };

function editable(point: PatchPoint): boolean {
  return point.role !== "bridge" && point.role !== "surfaceConnector";
}

/** Centerline diameter shown by the individual ring editor. New edits keep
 * the authored value; legacy/generated rings derive a stable estimate from
 * their realized primary node centres. Tube radius is deliberately excluded. */
export function ring3dCenterlineDiameter(patch: Patch): number | null {
  if (patch.shape !== "ring3d") return null;
  if (patch.ringDiameter !== undefined && Number.isFinite(patch.ringDiameter) && patch.ringDiameter > 0) return patch.ringDiameter;
  const editablePoints = patch.points.filter(editable);
  const points = editablePoints.some((point) => point.ringPrimary !== undefined)
    ? editablePoints.filter((point) => point.ringPrimary)
    : editablePoints;
  if (points.length < 3) return null;
  const center = points.reduce((sum, point) => ({
    x: sum.x + point.x,
    y: sum.y + point.y,
    z: sum.z + point.z,
  }), { x: 0, y: 0, z: 0 });
  center.x /= points.length; center.y /= points.length; center.z /= points.length;
  const meanRadius = points.reduce((sum, point) => sum + Math.hypot(
    point.x - center.x, point.y - center.y, point.z - center.z,
  ), 0) / points.length;
  return Math.max(0.04, meanRadius * 2);
}

export function reshapePatchMotif(
  patch: Patch,
  host: Ball[],
  hostK: number,
  current: SkinParams,
  motifParams: MotifShapeParams,
  neighbours: Patch[],
  requestedRingDiameter?: number,
): MotifReshapeResult {
  const editablePoints = patch.points.filter(editable);
  // New ring3d realizations interleave continuity connectors. Their authored
  // nodes, not the helper density, define the anchor/envelope used for an
  // explicit reshape. Legacy arrays have no marker and intentionally retain
  // their literal all-point interpretation.
  const points = patch.shape === "ring3d" && editablePoints.some((point) => point.ringPrimary !== undefined)
    ? editablePoints.filter((point) => point.ringPrimary)
    : editablePoints;
  if (points.length === 0 || patch.points.some((point) => !editable(point))) {
    return { ok: false, reason: "接続点を持つ要素は、接続を壊すため個別再生成できません" };
  }
  if (patch.shape === "flower" && neighbours.some((candidate) =>
    candidate.shape === "flower" && candidate.points.some((point) => point.role === "bridge"),
  )) {
    return { ok: false, reason: "花どうしの接続があるため、花は個別再生成できません" };
  }
  let anchor: Projected;
  let valid: Projected[];
  const annularCoin = patch.shape === "coin" && (patch.motifParams?.coinHoleRatio ?? 0) > 1e-6;
  if (patch.shape === "coin" && !annularCoin) {
    // A coin alone has a distinguished anchor: points[0]. Its asymmetric
    // satellite points deliberately must not pull the whole coin when it is
    // regenerated with unchanged parameters.
    const carrier = projectToSurface(host, hostK, points[0].x, points[0].y, points[0].z);
    if (!carrier) return { ok: false, reason: "表面上の基準位置を復元できません" };
    anchor = carrier;
    valid = [carrier];
  } else {
    const carriers = points.map((point) => projectToSurface(host, hostK, point.x, point.y, point.z));
    if (carriers.some((carrier) => carrier === null)) return { ok: false, reason: "表面上の基準位置を復元できません" };
    valid = carriers.filter((carrier): carrier is Projected => carrier !== null);
    const average = valid.reduce((sum, carrier) => ({
      x: sum.x + carrier.x,
      y: sum.y + carrier.y,
      z: sum.z + carrier.z,
    }), { x: 0, y: 0, z: 0 });
    const projected = projectToSurface(host, hostK, average.x / valid.length, average.y / valid.length, average.z / valid.length);
    if (!projected) return { ok: false, reason: "表面上の中心を決められません" };
    anchor = projected;
  }

  let anchorR: number;
  if (patch.shape === "coin" && !annularCoin) {
    anchorR = Math.max(0.02, points[0]?.r ?? current.minR);
  } else if (patch.shape === "ring3d") {
    anchorR = Math.max(0.02, valid.reduce((sum, carrier) => sum + Math.hypot(
      carrier.x - anchor.x, carrier.y - anchor.y, carrier.z - anchor.z,
    ), 0) / valid.length);
  } else {
    anchorR = Math.max(0.02, ...points.map((point) => Math.hypot(
      point.x - anchor.x, point.y - anchor.y, point.z - anchor.z,
    ) + (patch.shape === "flower" ? point.baseR ?? point.r : point.r)));
  }
  anchorR = Math.min(Math.max(current.minR * 0.25, anchorR), current.maxR * 2.5);
  if (requestedRingDiameter !== undefined && patch.shape === "ring3d" && Number.isFinite(requestedRingDiameter) && requestedRingDiameter > 0) {
    anchorR = Math.min(Math.max(current.minR * 0.25, requestedRingDiameter / 2), current.maxR * 2.5);
  }

  const params: SkinParams = {
    ...current,
    ...motifParams,
    patchShape: patch.shape,
    seed: `${current.seed}-individual-${patch.id}`,
  };
  let realized = generateShapePoints(
    patch.shape, host, hostK, anchor, anchorR, params,
    makeRng(hashSeed(params.seed)), patch.id, neighbours.filter((candidate) => candidate.id !== patch.id),
  );
  if (realized.length === 0) return { ok: false, reason: "この設定では形を再生成できません" };
  if (patch.shape === "flower" && motifParams.flowerExpansion > 0) {
    realized = realized.map((point) => {
      const baseR = point.baseR ?? point.r;
      const fusionR = (point.fusionBaseR ?? 0) * motifParams.flowerExpansion;
      return { ...point, baseR, fusionR, r: baseR + fusionR };
    });
  }
  return {
    ok: true,
    patch: {
      ...patch,
      ...(patch.shape === "ring3d" ? { ringDiameter: anchorR * 2 } : {}),
      motifParams: captureMotifShapeParams(params),
      points: realized,
    },
  };
}
