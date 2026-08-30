import type { Triangle } from "../../cloud-sculpt/meshExport.ts";
import { surfaceOverhangAngleDeg } from "../surfaceAngleDiagnosis.ts";
import type { Vector3Value } from "../voronoi.ts";

export interface SkinRebuildOverhangRegion {
  id: number;
  faceCount: number;
  areaSourceSquared: number;
  minimumZ: number;
  maximumZ: number;
  lowestPoint: Vector3Value;
  /** A point guaranteed to lie on one diagnosed triangle in this region. */
  supportPoint: Vector3Value;
  /** Outward mesh normal at supportPoint; its opposite points into the work. */
  supportNormal: Vector3Value;
}

export interface SkinRebuildOverhangDetection {
  /** Triangle soup for the display-only red overlay. */
  positions: Float32Array;
  faceCount: number;
  regionCount: number;
  areaSourceSquared: number;
  totalAreaSourceSquared: number;
  regions: SkinRebuildOverhangRegion[];
  /** Region id for each triangle in positions (one id per nine floats). */
  faceRegionIds: Int32Array;
}

/** One real point on a diagnosed red triangle.  Stage 5B uses a bounded set
 * of these samples to make a face-to-point buttress instead of pretending
 * that one thin centreline supports an entire connected red region. */
export interface SkinRebuildOverhangSurfaceSample {
  point: Vector3Value;
  normal: Vector3Value;
  faceIndex: number;
}

interface RiskFace {
  triangle: Triangle;
  area: number;
  normal: Vector3Value;
  vertexKeys: [string, string, string];
}

const EPSILON = 1e-12;

function triangleFacts(triangle: Triangle): { normal: Vector3Value; area: number } {
  const ab = {
    x: triangle.b.x - triangle.a.x,
    y: triangle.b.y - triangle.a.y,
    z: triangle.b.z - triangle.a.z,
  };
  const ac = {
    x: triangle.c.x - triangle.a.x,
    y: triangle.c.y - triangle.a.y,
    z: triangle.c.z - triangle.a.z,
  };
  const cross = {
    x: ab.y * ac.z - ab.z * ac.y,
    y: ab.z * ac.x - ab.x * ac.z,
    z: ab.x * ac.y - ab.y * ac.x,
  };
  const magnitude = Math.hypot(cross.x, cross.y, cross.z);
  if (!(magnitude > EPSILON)) return { normal: { x: 0, y: 0, z: 0 }, area: 0 };
  return {
    normal: { x: cross.x / magnitude, y: cross.y / magnitude, z: cross.z / magnitude },
    area: magnitude * 0.5,
  };
}

/** Mesh vertices have already crossed the Float32 browser-worker boundary.
 * Math.fround makes an edge identity stable even when the Triangle objects
 * themselves were reconstructed as ordinary JavaScript numbers. */
function vertexKey(point: Vector3Value): string {
  return `${Math.fround(point.x)},${Math.fround(point.y)},${Math.fround(point.z)}`;
}

function edgeKey(first: string, second: string): string {
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

class DisjointSet {
  private readonly parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index);
  }

  find(value: number): number {
    let root = value;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[value] !== value) {
      const next = this.parent[value];
      this.parent[value] = root;
      value = next;
    }
    return root;
  }

  union(first: number, second: number): void {
    const a = this.find(first);
    const b = this.find(second);
    if (a !== b) this.parent[Math.max(a, b)] = Math.min(a, b);
  }
}

/**
 * Detect every downward final-mesh face at or above the selected overhang
 * angle, then group edge-adjacent faces into visible regions.
 *
 * This is a geometric diagnostic, not a slicer simulation: bridge settings,
 * extrusion width, layer height and cooling are deliberately outside its
 * contract. Faces entirely inside the first plate band are excluded because
 * they already have direct build-plate contact.
 */
export function detectSkinRebuildOverhangRegions(
  triangles: readonly Triangle[],
  thresholdDeg: number,
  plateFloor: number,
  plateBand: number,
): SkinRebuildOverhangDetection {
  if (!Number.isFinite(thresholdDeg) || !Number.isFinite(plateFloor) || !Number.isFinite(plateBand)) {
    throw new Error("overhang-region settings must be finite");
  }
  const threshold = Math.max(0, Math.min(90, thresholdDeg));
  const directPlateLimit = plateFloor + Math.max(0, plateBand);
  const riskFaces: RiskFace[] = [];
  let totalAreaSourceSquared = 0;

  for (const triangle of triangles) {
    const facts = triangleFacts(triangle);
    if (!(facts.area > 0)) continue;
    totalAreaSourceSquared += facts.area;
    const maximumZ = Math.max(triangle.a.z, triangle.b.z, triangle.c.z);
    if (maximumZ <= directPlateLimit + 1e-9) continue;
    if (surfaceOverhangAngleDeg(facts.normal) + 1e-6 < threshold) continue;
    riskFaces.push({
      triangle,
      area: facts.area,
      normal: facts.normal,
      vertexKeys: [vertexKey(triangle.a), vertexKey(triangle.b), vertexKey(triangle.c)],
    });
  }

  const positions = new Float32Array(riskFaces.length * 9);
  for (let faceIndex = 0; faceIndex < riskFaces.length; faceIndex++) {
    const triangle = riskFaces[faceIndex].triangle;
    let offset = faceIndex * 9;
    for (const point of [triangle.a, triangle.b, triangle.c]) {
      positions[offset++] = point.x;
      positions[offset++] = point.y;
      positions[offset++] = point.z;
    }
  }
  if (riskFaces.length === 0) {
    return {
      positions,
      faceCount: 0,
      regionCount: 0,
      areaSourceSquared: 0,
      totalAreaSourceSquared,
      regions: [],
      faceRegionIds: new Int32Array(0),
    };
  }

  const sets = new DisjointSet(riskFaces.length);
  const ownerByEdge = new Map<string, number>();
  for (let faceIndex = 0; faceIndex < riskFaces.length; faceIndex++) {
    const [a, b, c] = riskFaces[faceIndex].vertexKeys;
    for (const key of [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)]) {
      const previous = ownerByEdge.get(key);
      if (previous === undefined) ownerByEdge.set(key, faceIndex);
      else sets.union(previous, faceIndex);
    }
  }

  const membersByRoot = new Map<number, number[]>();
  for (let faceIndex = 0; faceIndex < riskFaces.length; faceIndex++) {
    const root = sets.find(faceIndex);
    const members = membersByRoot.get(root);
    if (members) members.push(faceIndex);
    else membersByRoot.set(root, [faceIndex]);
  }
  const rawRegions = [...membersByRoot.values()].map((members) => {
    let areaSourceSquared = 0;
    let minimumZ = Infinity;
    let maximumZ = -Infinity;
    let lowestPoint: Vector3Value = { x: 0, y: 0, z: Infinity };
    let supportFace = riskFaces[members[0]];
    let supportFaceMinimumZ = Infinity;
    for (const faceIndex of members) {
      const face = riskFaces[faceIndex];
      areaSourceSquared += face.area;
      const faceMinimumZ = Math.min(face.triangle.a.z, face.triangle.b.z, face.triangle.c.z);
      if (faceMinimumZ < supportFaceMinimumZ) {
        supportFace = face;
        supportFaceMinimumZ = faceMinimumZ;
      }
      for (const point of [face.triangle.a, face.triangle.b, face.triangle.c]) {
        if (point.z < lowestPoint.z) lowestPoint = { ...point };
        minimumZ = Math.min(minimumZ, point.z);
        maximumZ = Math.max(maximumZ, point.z);
      }
    }
    const supportPoint = {
      x: (supportFace.triangle.a.x + supportFace.triangle.b.x + supportFace.triangle.c.x) / 3,
      y: (supportFace.triangle.a.y + supportFace.triangle.b.y + supportFace.triangle.c.y) / 3,
      z: (supportFace.triangle.a.z + supportFace.triangle.b.z + supportFace.triangle.c.z) / 3,
    };
    return {
      members,
      faceCount: members.length,
      areaSourceSquared,
      minimumZ,
      maximumZ,
      lowestPoint,
      supportPoint,
      supportNormal: { ...supportFace.normal },
    };
  });
  rawRegions.sort((a, b) => a.minimumZ - b.minimumZ
    || b.areaSourceSquared - a.areaSourceSquared
    || a.lowestPoint.x - b.lowestPoint.x
    || a.lowestPoint.y - b.lowestPoint.y);
  const faceRegionIds = new Int32Array(riskFaces.length);
  const regions = rawRegions.map((region, id) => {
    for (const faceIndex of region.members) faceRegionIds[faceIndex] = id;
    return {
      id,
      faceCount: region.faceCount,
      areaSourceSquared: region.areaSourceSquared,
      minimumZ: region.minimumZ,
      maximumZ: region.maximumZ,
      lowestPoint: region.lowestPoint,
      supportPoint: region.supportPoint,
      supportNormal: region.supportNormal,
    };
  });

  return {
    positions,
    faceCount: riskFaces.length,
    regionCount: regions.length,
    areaSourceSquared: riskFaces.reduce((sum, face) => sum + face.area, 0),
    totalAreaSourceSquared,
    regions,
    faceRegionIds,
  };
}

/** Pick deterministic, spatially spread triangle contacts for one connected
 * red region.  The first sample is the face closest to the region's area
 * centroid and becomes the hub contact; the remaining samples cover the
 * face and are joined back to that hub by Stage 5B geometry. */
export function sampleSkinRebuildOverhangRegionSurface(
  detection: Pick<SkinRebuildOverhangDetection, "positions" | "faceRegionIds">,
  regionId: number,
  minimumSpacing: number,
  maximumSamples = 96,
): SkinRebuildOverhangSurfaceSample[] {
  if (!Number.isInteger(regionId) || regionId < 0) return [];
  if (!Number.isFinite(minimumSpacing) || !(minimumSpacing > 0)) {
    throw new Error("overhang surface sample spacing must be positive and finite");
  }
  const limit = Math.max(1, Math.min(256, Math.floor(maximumSamples)));
  const candidates: Array<SkinRebuildOverhangSurfaceSample & { area: number }> = [];
  for (let faceIndex = 0; faceIndex < detection.faceRegionIds.length; faceIndex++) {
    if (detection.faceRegionIds[faceIndex] !== regionId) continue;
    const offset = faceIndex * 9;
    const triangle: Triangle = {
      a: { x: detection.positions[offset], y: detection.positions[offset + 1], z: detection.positions[offset + 2] },
      b: { x: detection.positions[offset + 3], y: detection.positions[offset + 4], z: detection.positions[offset + 5] },
      c: { x: detection.positions[offset + 6], y: detection.positions[offset + 7], z: detection.positions[offset + 8] },
    };
    const facts = triangleFacts(triangle);
    if (!(facts.area > EPSILON)) continue;
    candidates.push({
      point: {
        x: (triangle.a.x + triangle.b.x + triangle.c.x) / 3,
        y: (triangle.a.y + triangle.b.y + triangle.c.y) / 3,
        z: (triangle.a.z + triangle.b.z + triangle.c.z) / 3,
      },
      normal: facts.normal,
      faceIndex,
      area: facts.area,
    });
  }
  if (candidates.length === 0) return [];

  const area = candidates.reduce((sum, candidate) => sum + candidate.area, 0);
  const centroid = candidates.reduce((sum, candidate) => ({
    x: sum.x + candidate.point.x * candidate.area / area,
    y: sum.y + candidate.point.y * candidate.area / area,
    z: sum.z + candidate.point.z * candidate.area / area,
  }), { x: 0, y: 0, z: 0 });
  const distanceSquared = (first: Vector3Value, second: Vector3Value): number => {
    const dx = first.x - second.x;
    const dy = first.y - second.y;
    const dz = first.z - second.z;
    return dx * dx + dy * dy + dz * dz;
  };
  const remaining = new Set(candidates.map((_, index) => index));
  let firstIndex = 0;
  for (let index = 1; index < candidates.length; index++) {
    const candidateDistance = distanceSquared(candidates[index].point, centroid);
    const firstDistance = distanceSquared(candidates[firstIndex].point, centroid);
    if (candidateDistance < firstDistance - EPSILON
      || (Math.abs(candidateDistance - firstDistance) <= EPSILON
        && candidates[index].faceIndex < candidates[firstIndex].faceIndex)) firstIndex = index;
  }
  const selected: typeof candidates = [candidates[firstIndex]];
  remaining.delete(firstIndex);
  const minimumSpacingSquared = minimumSpacing * minimumSpacing;
  while (remaining.size > 0 && selected.length < limit) {
    let bestIndex = -1;
    let bestDistance = Number.NEGATIVE_INFINITY;
    for (const index of remaining) {
      const nearest = selected.reduce((minimum, sample) =>
        Math.min(minimum, distanceSquared(candidates[index].point, sample.point)), Number.POSITIVE_INFINITY);
      if (nearest > bestDistance + EPSILON
        || (Math.abs(nearest - bestDistance) <= EPSILON
          && (bestIndex < 0 || candidates[index].faceIndex < candidates[bestIndex].faceIndex))) {
        bestIndex = index;
        bestDistance = nearest;
      }
    }
    if (bestIndex < 0 || bestDistance < minimumSpacingSquared) break;
    selected.push(candidates[bestIndex]);
    remaining.delete(bestIndex);
  }
  return selected.map(({ point, normal, faceIndex }) => ({
    point: { ...point },
    normal: { ...normal },
    faceIndex,
  }));
}
