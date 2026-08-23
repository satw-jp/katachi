import type { Ball } from "../cloud-sculpt/field.ts";
import { projectToSurface, type Patch, type PatchPoint } from "./field.ts";

export interface SurfaceNeighbourPair {
  a: Patch;
  b: Patch;
  span: number;
}

export interface SurfaceConnectionResult {
  connectorPointCount: number;
  edgeCount: number;
  openEdgeCount: number;
  maximumConnectorRadius: number;
}

function distance(a: PatchPoint, b: PatchPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function motifPoints(patch: Patch): PatchPoint[] {
  return patch.points.filter((point) => point.role !== "surfaceConnector");
}

function closestPair(a: Patch, b: Patch): { a: PatchPoint; b: PatchPoint; clearance: number } | null {
  let result: { a: PatchPoint; b: PatchPoint; clearance: number } | null = null;
  for (const pointA of motifPoints(a)) for (const pointB of motifPoints(b)) {
    const clearance = distance(pointA, pointB) - (pointA.baseR ?? pointA.r) - (pointB.baseR ?? pointB.r);
    if (!result || clearance < result.clearance) result = { a: pointA, b: pointB, clearance };
  }
  return result;
}

function patchClearance(a: Patch, b: Patch): number {
  let minimum = Infinity;
  for (const pointA of a.points) for (const pointB of b.points) {
    minimum = Math.min(minimum, distance(pointA, pointB) - pointA.r - pointB.r);
  }
  return minimum;
}

/**
 * Extend short, surface-projected bead lugs from the closest motif points.
 * Authored coin/ring/flower radii are never enlarged, so a ring opening is
 * not erased merely to close a neighbouring-cell gap. The midpoint bead is
 * recorded on both patches; that explicit overlap also survives Patch-owned
 * N partitioning instead of relying on a sub-voxel tangency.
 */
export function connectSurfaceNeighboursWithLugs(
  host: Ball[],
  hostK: number,
  pairs: SurfaceNeighbourPair[],
  connectionDepth: number,
  requestedMeshWidth: number,
): SurfaceConnectionResult {
  for (const pair of pairs) {
    pair.a.points = motifPoints(pair.a).map((point) => ({ ...point }));
    pair.b.points = motifPoints(pair.b).map((point) => ({ ...point }));
  }
  const overlapMultiplier = Math.max(0, Math.min(2, connectionDepth));
  const requested = Math.max(0, Math.min(0.25, requestedMeshWidth));
  let connectorPointCount = 0;
  let maximumConnectorRadius = 0;
  for (const pair of pairs) {
    const closest = closestPair(pair.a, pair.b);
    if (!closest) continue;
    const radiusA = closest.a.baseR ?? closest.a.r;
    const radiusB = closest.b.baseR ?? closest.b.r;
    const desiredOverlap = pair.span * 0.03 * overlapMultiplier;
    const connectorRadius = Math.max(
      0.018,
      Math.min(0.12, Math.max(requested * 0.5, Math.min(radiusA, radiusB) * 0.72) + desiredOverlap * 0.15),
    );
    const centreDistance = distance(closest.a, closest.b);
    const maximumSpacing = connectorRadius * 1.45;
    const interiorCount = Math.max(1, Math.min(14, Math.ceil(centreDistance / maximumSpacing) - 1));
    const midpointIndex = Math.ceil(interiorCount / 2);
    for (let index = 1; index <= interiorCount; index++) {
      const t = index / (interiorCount + 1);
      const raw = {
        x: closest.a.x + (closest.b.x - closest.a.x) * t,
        y: closest.a.y + (closest.b.y - closest.a.y) * t,
        z: closest.a.z + (closest.b.z - closest.a.z) * t,
      };
      const projected = projectToSurface(host, hostK, raw.x, raw.y, raw.z, 12) ?? raw;
      const point: PatchPoint = {
        x: projected.x,
        y: projected.y,
        z: projected.z,
        r: connectorRadius,
        baseR: connectorRadius,
        fusionBaseR: 0,
        fusionR: 0,
        meshJoinR: 0,
        role: "surfaceConnector",
      };
      if (index <= midpointIndex) pair.a.points.push({ ...point });
      if (index >= midpointIndex) pair.b.points.push({ ...point });
      connectorPointCount += index === midpointIndex ? 2 : 1;
    }
    maximumConnectorRadius = Math.max(maximumConnectorRadius, connectorRadius);
  }
  const openEdgeCount = pairs.filter((pair) => patchClearance(pair.a, pair.b) > 1e-6).length;
  return {
    connectorPointCount,
    edgeCount: pairs.length,
    openEdgeCount,
    maximumConnectorRadius,
  };
}
