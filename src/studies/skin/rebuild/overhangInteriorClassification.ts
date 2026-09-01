import type { SkinRebuildLowestPoint, SkinRebuildPatternSide } from "./model.ts";

export const SKIN_REBUILD_OVERHANG_INSIDE = 0;
export const SKIN_REBUILD_OVERHANG_OUTSIDE = 1;
export const SKIN_REBUILD_OVERHANG_UNCLASSIFIED = 2;
/** Presentation-only Stage 7 class for a face inside the actual mesh
 * interface band.  The existing Stage 4 unclassified value remains 2; this
 * value is kept separate because Stage 7 maps Boundary into the support
 * presentation class. */
export const SKIN_REBUILD_STAGE7_DANGER_BOUNDARY = 2;
/** Presentation-only Stage 7 class for an unavailable or unmapped face. */
export const SKIN_REBUILD_STAGE7_DANGER_UNCLASSIFIED = 3;

export type SkinRebuildOverhangInteriorClass =
  | typeof SKIN_REBUILD_OVERHANG_INSIDE
  | typeof SKIN_REBUILD_OVERHANG_OUTSIDE
  | typeof SKIN_REBUILD_OVERHANG_UNCLASSIFIED;

export interface SkinRebuildOverhangInteriorClassification {
  /** One Stage 3-derived class per diagnosed overhang triangle. */
  faceClasses: Int8Array;
  /** The retained Stage 4 region id for every diagnosed overhang triangle. */
  faceRegionIds: Int32Array;
  /** The selected Stage 3 Pattern owner for every diagnosed triangle, or -1
   * when the Stage 4 responsibility is unavailable.  This is copied from the
   * actual nearest SkinRebuildPatternSide; it is not a new classifier. */
  faceOwnerPatchIds: Int32Array;
  /** Original region id for inside faces, -1 for every other face. */
  insideFaceRegionIds: Int32Array;
  insideFaceCount: number;
  outsideFaceCount: number;
  unclassifiedFaceCount: number;
  insideRegionIds: number[];
  outsideRegionIds: number[];
  unclassifiedRegionIds: number[];
  mixedRegionCount: number;
}

export interface SkinRebuildOverhangTargetResponsibility {
  inside: SkinRebuildLowestPoint[];
  outside: SkinRebuildLowestPoint[];
  unclassified: SkinRebuildLowestPoint[];
}

export interface SkinRebuildStage7DangerFaceMapping {
  /** 0 = Inside danger, 1 = Outside/Boundary support target, 3 = unknown. */
  faceClasses: Int8Array;
  /** Exact full-mesh face identity for each Stage 7 danger face, or -1. */
  fullMeshFaceIndices: Int32Array;
  supportTargetFaceCount: number;
  insideDangerFaceCount: number;
  unclassifiedFaceCount: number;
  supportTargetRegionCount: number;
  insideDangerRegionCount: number;
  unclassifiedRegionCount: number;
  /** False when at least one Stage 7 triangle could not be mapped exactly. */
  available: boolean;
  reason: string | null;
}

function skinRebuildStage7DangerTriangleKey(
  positions: Float32Array,
  faceIndex: number,
): string | null {
  const offset = faceIndex * 9;
  const values: string[] = [];
  for (let vertex = 0; vertex < 9; vertex++) {
    const value = positions[offset + vertex];
    if (!Number.isFinite(value)) return null;
    // Both buffers are Float32Array values. Keep signed zero distinct so an
    // exact key can never substitute a different face.
    values.push(Object.is(value, -0) ? "-0" : String(value));
  }
  return values.join(",");
}

function skinRebuildStage7DangerRegionIdIsValid(regionId: number): boolean {
  return Number.isInteger(regionId) && regionId >= 0;
}

/**
 * Map the current Stage 7 overhang triangle soup onto its full Stage 7 mesh
 * faces by exact triangle coordinate identity.  The full-mesh classes must
 * already be supplied by the existing Stage 3 projection plus the actual
 * mesh-interface Boundary distance field; this helper does not classify or
 * search by proximity.  Duplicate coordinate keys consume full faces in
 * source order, making the transfer deterministic.
 */
export function mapSkinRebuildStage7DangerFacesByExactTriangle(
  fullMeshPositions: Float32Array,
  fullMeshInteriorClasses: Int8Array,
  overhangPositions: Float32Array,
  overhangFaceRegionIds: Int32Array,
): SkinRebuildStage7DangerFaceMapping {
  if (fullMeshPositions.length % 9 !== 0
    || fullMeshInteriorClasses.length !== fullMeshPositions.length / 9
    || overhangPositions.length % 9 !== 0
    || overhangFaceRegionIds.length !== overhangPositions.length / 9) {
    throw new Error("Stage 7 exact danger mapping buffers are inconsistent");
  }
  const fullFaceCount = fullMeshInteriorClasses.length;
  const overhangFaceCount = overhangFaceRegionIds.length;
  const faceClasses = new Int8Array(overhangFaceCount).fill(SKIN_REBUILD_STAGE7_DANGER_UNCLASSIFIED);
  const fullMeshFaceIndices = new Int32Array(overhangFaceCount).fill(-1);
  const fullFaceIndicesByKey = new Map<string, number[]>();
  for (let fullFaceIndex = 0; fullFaceIndex < fullFaceCount; fullFaceIndex++) {
    const key = skinRebuildStage7DangerTriangleKey(fullMeshPositions, fullFaceIndex);
    if (!key) continue;
    const queue = fullFaceIndicesByKey.get(key);
    if (queue) queue.push(fullFaceIndex);
    else fullFaceIndicesByKey.set(key, [fullFaceIndex]);
  }
  const queueCursors = new Map<string, number>();
  const supportTargetRegions = new Set<number>();
  const insideDangerRegions = new Set<number>();
  const unclassifiedRegions = new Set<number>();
  let supportTargetFaceCount = 0;
  let insideDangerFaceCount = 0;
  let unclassifiedFaceCount = 0;
  let mappingFailed = false;
  for (let overhangFaceIndex = 0; overhangFaceIndex < overhangFaceCount; overhangFaceIndex++) {
    const regionId = overhangFaceRegionIds[overhangFaceIndex];
    const key = skinRebuildStage7DangerTriangleKey(overhangPositions, overhangFaceIndex);
    const queue = key ? fullFaceIndicesByKey.get(key) : undefined;
    let fullFaceIndex = -1;
    if (queue && key) {
      let cursor = queueCursors.get(key) ?? 0;
      if (cursor < queue.length) {
        fullFaceIndex = queue[cursor];
        cursor += 1;
        queueCursors.set(key, cursor);
      }
    }
    if (fullFaceIndex < 0) {
      mappingFailed = true;
      unclassifiedFaceCount++;
      if (skinRebuildStage7DangerRegionIdIsValid(regionId)) unclassifiedRegions.add(regionId);
      continue;
    }
    fullMeshFaceIndices[overhangFaceIndex] = fullFaceIndex;
    const fullClass = fullMeshInteriorClasses[fullFaceIndex];
    if (fullClass === SKIN_REBUILD_OVERHANG_INSIDE) {
      faceClasses[overhangFaceIndex] = SKIN_REBUILD_OVERHANG_INSIDE;
      insideDangerFaceCount++;
      if (skinRebuildStage7DangerRegionIdIsValid(regionId)) insideDangerRegions.add(regionId);
    } else if (fullClass === SKIN_REBUILD_OVERHANG_OUTSIDE
      || fullClass === SKIN_REBUILD_STAGE7_DANGER_BOUNDARY) {
      faceClasses[overhangFaceIndex] = SKIN_REBUILD_OVERHANG_OUTSIDE;
      supportTargetFaceCount++;
      if (skinRebuildStage7DangerRegionIdIsValid(regionId)) supportTargetRegions.add(regionId);
    } else {
      unclassifiedFaceCount++;
      if (skinRebuildStage7DangerRegionIdIsValid(regionId)) unclassifiedRegions.add(regionId);
    }
  }
  return {
    faceClasses,
    fullMeshFaceIndices,
    supportTargetFaceCount,
    insideDangerFaceCount,
    unclassifiedFaceCount,
    supportTargetRegionCount: supportTargetRegions.size,
    insideDangerRegionCount: insideDangerRegions.size,
    unclassifiedRegionCount: unclassifiedRegions.size,
    available: !mappingFailed,
    reason: mappingFailed ? "some Stage 7 danger triangles have no exact full-mesh face identity" : null,
  };
}

type SkinRebuildMeshInteriorInterfaceEdge = {
  faces: number[];
  start: [number, number, number];
  end: [number, number, number];
};

type SkinRebuildMeshInteriorFaceNeighbor = {
  faceIndex: number;
  distanceMm: number;
};

function skinRebuildMeshInteriorVertexKey(
  positions: Float32Array,
  offset: number,
): string {
  const quantize = (value: number): number => Math.round(value * 1e8);
  return `${quantize(positions[offset])},${quantize(positions[offset + 1])},${quantize(positions[offset + 2])}`;
}

function skinRebuildMeshInteriorEdgeKey(start: string, end: string): string {
  return start < end ? `${start}|${end}` : `${end}|${start}`;
}

function skinRebuildMeshInteriorFaceIsDisplayable(positions: Float32Array, faceIndex: number): boolean {
  const offset = faceIndex * 9;
  for (let vertex = 0; vertex < 9; vertex++) {
    if (!Number.isFinite(positions[offset + vertex])) return false;
  }
  const abx = positions[offset + 3] - positions[offset];
  const aby = positions[offset + 4] - positions[offset + 1];
  const abz = positions[offset + 5] - positions[offset + 2];
  const acx = positions[offset + 6] - positions[offset];
  const acy = positions[offset + 7] - positions[offset + 1];
  const acz = positions[offset + 8] - positions[offset + 2];
  return Math.hypot(
    aby * acz - abz * acy,
    abz * acx - abx * acz,
    abx * acy - aby * acx,
  ) > 1e-12;
}

function skinRebuildMeshInteriorPointSegmentDistanceMm(
  point: readonly number[],
  start: readonly number[],
  end: readonly number[],
  scaleMmPerUnit: number,
): number {
  const abx = end[0] - start[0];
  const aby = end[1] - start[1];
  const abz = end[2] - start[2];
  const lengthSquared = abx * abx + aby * aby + abz * abz;
  const projection = lengthSquared > 0
    ? Math.max(0, Math.min(1, ((point[0] - start[0]) * abx
      + (point[1] - start[1]) * aby
      + (point[2] - start[2]) * abz) / lengthSquared))
    : 0;
  const closestX = start[0] + abx * projection;
  const closestY = start[1] + aby * projection;
  const closestZ = start[2] + abz * projection;
  return Math.hypot(point[0] - closestX, point[1] - closestY, point[2] - closestZ) * scaleMmPerUnit;
}

/**
 * Presentation-only surface distance from the actual mesh Inside/Outside
 * interface.  The face classes are supplied by the existing Stage 3
 * projection; this helper never classifies a face or samples an SDF.  Only
 * shared edges with one stored Inside and one stored Outside face seed the
 * distance.  Propagation then follows shared edges between faces of the same
 * stored class, so disconnected same-class components remain Infinity.
 */
export function computeSkinRebuildMeshInteriorInterfaceDistancesMm(
  positions: Float32Array,
  faceClasses: Int8Array,
  scaleMmPerUnit: number,
): Float32Array {
  if (positions.length % 9 !== 0 || faceClasses.length !== positions.length / 9) {
    throw new Error("mesh interface distance buffers must contain one class per triangle");
  }
  if (!(scaleMmPerUnit > 0) || !Number.isFinite(scaleMmPerUnit)) {
    throw new Error("mesh interface distance scale must be finite and positive");
  }
  const faceCount = faceClasses.length;
  const distances = new Float64Array(faceCount).fill(Number.POSITIVE_INFINITY);
  const validFaces = new Uint8Array(faceCount);
  const centroids = new Float64Array(faceCount * 3);
  const edgeMap = new Map<string, SkinRebuildMeshInteriorInterfaceEdge>();
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    const faceClass = faceClasses[faceIndex];
    if ((faceClass !== SKIN_REBUILD_OVERHANG_INSIDE && faceClass !== SKIN_REBUILD_OVERHANG_OUTSIDE)
      || !skinRebuildMeshInteriorFaceIsDisplayable(positions, faceIndex)) continue;
    validFaces[faceIndex] = 1;
    const offset = faceIndex * 9;
    centroids[faceIndex * 3] = (positions[offset] + positions[offset + 3] + positions[offset + 6]) / 3;
    centroids[faceIndex * 3 + 1] = (positions[offset + 1] + positions[offset + 4] + positions[offset + 7]) / 3;
    centroids[faceIndex * 3 + 2] = (positions[offset + 2] + positions[offset + 5] + positions[offset + 8]) / 3;
    const vertices = [
      skinRebuildMeshInteriorVertexKey(positions, offset),
      skinRebuildMeshInteriorVertexKey(positions, offset + 3),
      skinRebuildMeshInteriorVertexKey(positions, offset + 6),
    ];
    for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
      const startOffset = offset + edgeIndex * 3;
      const endOffset = offset + ((edgeIndex + 1) % 3) * 3;
      const edgeKey = skinRebuildMeshInteriorEdgeKey(
        vertices[edgeIndex],
        vertices[(edgeIndex + 1) % 3],
      );
      const existing = edgeMap.get(edgeKey);
      if (existing) existing.faces.push(faceIndex);
      else {
        edgeMap.set(edgeKey, {
          faces: [faceIndex],
          start: [positions[startOffset], positions[startOffset + 1], positions[startOffset + 2]],
          end: [positions[endOffset], positions[endOffset + 1], positions[endOffset + 2]],
        });
      }
    }
  }

  const neighbors: Array<SkinRebuildMeshInteriorFaceNeighbor[]> = Array.from(
    { length: faceCount },
    () => [],
  );
  for (const edge of edgeMap.values()) {
    let hasInside = false;
    let hasOutside = false;
    for (const faceIndex of edge.faces) {
      if (faceClasses[faceIndex] === SKIN_REBUILD_OVERHANG_INSIDE) hasInside = true;
      if (faceClasses[faceIndex] === SKIN_REBUILD_OVERHANG_OUTSIDE) hasOutside = true;
    }
    if (hasInside && hasOutside) {
      for (const faceIndex of edge.faces) {
        if (!validFaces[faceIndex]) continue;
        const centroidOffset = faceIndex * 3;
        const distanceMm = skinRebuildMeshInteriorPointSegmentDistanceMm(
          [centroids[centroidOffset], centroids[centroidOffset + 1], centroids[centroidOffset + 2]],
          edge.start,
          edge.end,
          scaleMmPerUnit,
        );
        if (distanceMm < distances[faceIndex]) distances[faceIndex] = distanceMm;
      }
    }
    for (let left = 0; left < edge.faces.length; left++) {
      const leftFace = edge.faces[left];
      if (!validFaces[leftFace]) continue;
      for (let right = left + 1; right < edge.faces.length; right++) {
        const rightFace = edge.faces[right];
        if (!validFaces[rightFace] || faceClasses[leftFace] !== faceClasses[rightFace]) continue;
        const leftOffset = leftFace * 3;
        const rightOffset = rightFace * 3;
        const distanceMm = Math.hypot(
          centroids[leftOffset] - centroids[rightOffset],
          centroids[leftOffset + 1] - centroids[rightOffset + 1],
          centroids[leftOffset + 2] - centroids[rightOffset + 2],
        ) * scaleMmPerUnit;
        if (!Number.isFinite(distanceMm)) continue;
        neighbors[leftFace].push({ faceIndex: rightFace, distanceMm });
        neighbors[rightFace].push({ faceIndex: leftFace, distanceMm });
      }
    }
  }

  const heapFaces: number[] = [];
  const heapDistances: number[] = [];
  const push = (faceIndex: number, distanceMm: number): void => {
    let index = heapFaces.length;
    heapFaces.push(faceIndex);
    heapDistances.push(distanceMm);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (heapDistances[parent] <= distanceMm) break;
      heapFaces[index] = heapFaces[parent];
      heapDistances[index] = heapDistances[parent];
      index = parent;
    }
    heapFaces[index] = faceIndex;
    heapDistances[index] = distanceMm;
  };
  const pop = (): { faceIndex: number; distanceMm: number } | null => {
    if (heapFaces.length === 0) return null;
    const faceIndex = heapFaces[0];
    const distanceMm = heapDistances[0];
    const lastFace = heapFaces.pop()!;
    const lastDistance = heapDistances.pop()!;
    if (heapFaces.length > 0) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        if (left >= heapFaces.length) break;
        const right = left + 1;
        const child = right < heapFaces.length && heapDistances[right] < heapDistances[left] ? right : left;
        if (heapDistances[child] >= lastDistance) break;
        heapFaces[index] = heapFaces[child];
        heapDistances[index] = heapDistances[child];
        index = child;
      }
      heapFaces[index] = lastFace;
      heapDistances[index] = lastDistance;
    }
    return { faceIndex, distanceMm };
  };
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    if (Number.isFinite(distances[faceIndex])) push(faceIndex, distances[faceIndex]);
  }
  while (heapFaces.length > 0) {
    const current = pop()!;
    if (current.distanceMm > distances[current.faceIndex]) continue;
    for (const neighbor of neighbors[current.faceIndex]) {
      const nextDistance = current.distanceMm + neighbor.distanceMm;
      if (nextDistance >= distances[neighbor.faceIndex]) continue;
      distances[neighbor.faceIndex] = nextDistance;
      push(neighbor.faceIndex, nextDistance);
    }
  }
  const result = new Float32Array(faceCount);
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    result[faceIndex] = Number.isFinite(distances[faceIndex]) ? distances[faceIndex] : Number.POSITIVE_INFINITY;
  }
  return result;
}

export interface SkinRebuildProjectedOverhangFace {
  /** Index in the current Stage 7 final-artwork overhang triangle soup. */
  stage7FaceIndex: number;
  /** Representative point of the current final-artwork triangle. */
  position: { x: number; y: number; z: number };
  /** Flat normal of the current final-artwork triangle. */
  normal: { x: number; y: number; z: number };
  /** Exact class copied from the nearest stored Stage 4 triangle. */
  responsibility: SkinRebuildOverhangInteriorClass;
  /** Exact Stage 4 region id copied with the responsibility class. */
  responsibilityRegionId: number;
  /** Exact Stage 3 Pattern owner copied with the responsibility class. */
  responsibilityOwnerPatchId: number;
}

export interface SkinRebuildFinalArtworkOverhangProjection {
  faces: SkinRebuildProjectedOverhangFace[];
  /** Outside faces grouped by the retained Stage 4 region id. */
  outsideByRegion: Map<number, SkinRebuildProjectedOverhangFace[]>;
  insideFaceCount: number;
  outsideFaceCount: number;
  unclassifiedFaceCount: number;
}

/**
 * Attach Surface support targets to the nearest Stage 4 triangle and copy its
 * already-established Stage 3 class.  This does not perform another
 * Inside/Outside test: it only projects the Stage 4 SSOT onto Stage 8's
 * lower-resolution target points.
 */
export function partitionSkinRebuildLowestPointsByOverhangResponsibility(
  lowestPoints: readonly SkinRebuildLowestPoint[],
  overhangPositions: Float32Array,
  classification: SkinRebuildOverhangInteriorClassification,
): SkinRebuildOverhangTargetResponsibility {
  const faceCount = overhangPositions.length / 9;
  if (overhangPositions.length % 9 !== 0 || classification.faceClasses.length !== faceCount) {
    throw new Error("overhang target projection requires one Stage 4 class per triangle");
  }
  const result: SkinRebuildOverhangTargetResponsibility = {
    inside: [],
    outside: [],
    unclassified: [],
  };
  for (const point of lowestPoints) {
    let nearestFaceIndex = -1;
    let nearestSquared = Number.POSITIVE_INFINITY;
    for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
      const offset = faceIndex * 9;
      const x = (overhangPositions[offset] + overhangPositions[offset + 3] + overhangPositions[offset + 6]) / 3;
      const y = (overhangPositions[offset + 1] + overhangPositions[offset + 4] + overhangPositions[offset + 7]) / 3;
      const z = (overhangPositions[offset + 2] + overhangPositions[offset + 5] + overhangPositions[offset + 8]) / 3;
      const dx = point.position.x - x;
      const dy = point.position.y - y;
      const dz = point.position.z - z;
      const distanceSquared = dx * dx + dy * dy + dz * dz;
      if (distanceSquared < nearestSquared) {
        nearestSquared = distanceSquared;
        nearestFaceIndex = faceIndex;
      }
    }
    const faceClass = nearestFaceIndex >= 0
      ? classification.faceClasses[nearestFaceIndex]
      : SKIN_REBUILD_OVERHANG_UNCLASSIFIED;
    if (faceClass === SKIN_REBUILD_OVERHANG_INSIDE) result.inside.push(point);
    else if (faceClass === SKIN_REBUILD_OVERHANG_OUTSIDE) result.outside.push(point);
    else result.unclassified.push(point);
  }
  return result;
}

function triangleRepresentative(
  positions: Float32Array,
  faceIndex: number,
): { position: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number } } | null {
  const offset = faceIndex * 9;
  const ax = positions[offset];
  const ay = positions[offset + 1];
  const az = positions[offset + 2];
  const bx = positions[offset + 3];
  const by = positions[offset + 4];
  const bz = positions[offset + 5];
  const cx = positions[offset + 6];
  const cy = positions[offset + 7];
  const cz = positions[offset + 8];
  if (![ax, ay, az, bx, by, bz, cx, cy, cz].every(Number.isFinite)) return null;
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  const magnitude = Math.hypot(nx, ny, nz);
  if (!(magnitude > 1e-12)) return null;
  return {
    position: { x: (ax + bx + cx) / 3, y: (ay + by + cy) / 3, z: (az + bz + cz) / 3 },
    normal: { x: nx / magnitude, y: ny / magnitude, z: nz / magnitude },
  };
}

/**
 * Transfer Stage 4's stored responsibility onto the current Stage 7
 * final-artwork triangles.  Stage 7 supplies the positions and normals; Stage
 * 4 supplies both the class and region id.  No Base/SDF test is performed and
 * no new Inside/Outside decision is made here.
 *
 * The nearest-triangle search intentionally uses stored triangle
 * representatives and a stable face-index tie break.  This keeps the
 * operation deterministic when final artwork has a different triangulation
 * from the Stage 4 mesh while preserving the 53-region responsibility unit.
 */
export function projectSkinRebuildFinalArtworkOverhangToStage4(
  stage7Positions: Float32Array,
  stage7FaceRegionIds: Int32Array,
  stage4Positions: Float32Array,
  stage4Classification: Pick<SkinRebuildOverhangInteriorClassification, "faceClasses" | "faceRegionIds" | "faceOwnerPatchIds">,
): SkinRebuildFinalArtworkOverhangProjection {
  if (stage7Positions.length % 9 !== 0
    || stage7FaceRegionIds.length !== stage7Positions.length / 9
    || stage4Positions.length % 9 !== 0
    || stage4Classification.faceClasses.length !== stage4Positions.length / 9
    || stage4Classification.faceRegionIds.length !== stage4Positions.length / 9
    || stage4Classification.faceOwnerPatchIds.length !== stage4Positions.length / 9) {
    throw new Error("Stage 7/Stage 4 overhang projection buffers are inconsistent");
  }
  const stage4Representatives = Array.from(
    { length: stage4Classification.faceClasses.length },
    (_, faceIndex) => triangleRepresentative(stage4Positions, faceIndex),
  );
  const faces: SkinRebuildProjectedOverhangFace[] = [];
  const outsideByRegion = new Map<number, SkinRebuildProjectedOverhangFace[]>();
  let insideFaceCount = 0;
  let outsideFaceCount = 0;
  let unclassifiedFaceCount = 0;
  for (let stage7FaceIndex = 0; stage7FaceIndex < stage7FaceRegionIds.length; stage7FaceIndex++) {
    const representative = triangleRepresentative(stage7Positions, stage7FaceIndex);
    if (!representative) {
      unclassifiedFaceCount++;
      continue;
    }
    let nearestStage4Face = -1;
    let nearestSquared = Number.POSITIVE_INFINITY;
    for (let stage4FaceIndex = 0; stage4FaceIndex < stage4Representatives.length; stage4FaceIndex++) {
      const candidate = stage4Representatives[stage4FaceIndex];
      if (!candidate) continue;
      const dx = representative.position.x - candidate.position.x;
      const dy = representative.position.y - candidate.position.y;
      const dz = representative.position.z - candidate.position.z;
      const distanceSquared = dx * dx + dy * dy + dz * dz;
      if (distanceSquared < nearestSquared - 1e-12
        || (Math.abs(distanceSquared - nearestSquared) <= 1e-12
          && (nearestStage4Face < 0 || stage4FaceIndex < nearestStage4Face))) {
        nearestSquared = distanceSquared;
        nearestStage4Face = stage4FaceIndex;
      }
    }
    if (nearestStage4Face < 0) {
      unclassifiedFaceCount++;
      continue;
    }
    const responsibility = stage4Classification.faceClasses[nearestStage4Face] as SkinRebuildOverhangInteriorClass;
    const responsibilityRegionId = stage4Classification.faceRegionIds[nearestStage4Face];
    const responsibilityOwnerPatchId = stage4Classification.faceOwnerPatchIds[nearestStage4Face];
    const projected: SkinRebuildProjectedOverhangFace = {
      stage7FaceIndex,
      position: representative.position,
      normal: representative.normal,
      responsibility,
      responsibilityRegionId,
      responsibilityOwnerPatchId,
    };
    faces.push(projected);
    if (responsibility === SKIN_REBUILD_OVERHANG_INSIDE) insideFaceCount++;
    else if (responsibility === SKIN_REBUILD_OVERHANG_OUTSIDE && responsibilityRegionId >= 0) {
      outsideFaceCount++;
      const region = outsideByRegion.get(responsibilityRegionId) ?? [];
      region.push(projected);
      outsideByRegion.set(responsibilityRegionId, region);
    } else unclassifiedFaceCount++;
  }
  return { faces, outsideByRegion, insideFaceCount, outsideFaceCount, unclassifiedFaceCount };
}

/**
 * Project the exact Stage 3 orientation verdict onto Stage 4 triangles.
 *
 * There is deliberately no Base SDF resampling here.  The closest stored
 * Stage 3 motif row supplies the already-decided surface point and outward
 * direction; a face centre on its negative half-space is on the Base/inside
 * side.
 * This keeps Stage 3 as the only Inside / Outside classifier while retaining
 * every Stage 4 overhang triangle for print diagnosis.
 */
export function classifySkinRebuildOverhangFromStage3(
  positions: Float32Array,
  faceRegionIds: Int32Array,
  patternSides: readonly SkinRebuildPatternSide[],
): SkinRebuildOverhangInteriorClassification {
  if (positions.length % 9 !== 0 || faceRegionIds.length !== positions.length / 9) {
    throw new Error("overhang classification buffers must contain one region id per triangle");
  }
  const faceCount = faceRegionIds.length;
  const faceClasses = new Int8Array(faceCount).fill(SKIN_REBUILD_OVERHANG_UNCLASSIFIED);
  const insideFaceRegionIds = new Int32Array(faceCount).fill(-1);
  const faceOwnerPatchIds = new Int32Array(faceCount).fill(-1);
  const validSides = patternSides.filter((side) => side.baseSideIsInside);
  const insideRegions = new Set<number>();
  const outsideRegions = new Set<number>();
  const unclassifiedRegions = new Set<number>();
  let insideFaceCount = 0;
  let outsideFaceCount = 0;
  let unclassifiedFaceCount = 0;

  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    const offset = faceIndex * 9;
    const regionId = faceRegionIds[faceIndex];
    if (validSides.length === 0) {
      unclassifiedFaceCount++;
      unclassifiedRegions.add(regionId);
      continue;
    }
    const centroid = {
      x: (positions[offset] + positions[offset + 3] + positions[offset + 6]) / 3,
      y: (positions[offset + 1] + positions[offset + 4] + positions[offset + 7]) / 3,
      z: (positions[offset + 2] + positions[offset + 5] + positions[offset + 8]) / 3,
    };
    let side = validSides[0];
    let nearestSquared = Number.POSITIVE_INFINITY;
    for (const candidate of validSides) {
      const dx = centroid.x - candidate.surfacePosition.x;
      const dy = centroid.y - candidate.surfacePosition.y;
      const dz = centroid.z - candidate.surfacePosition.z;
      const distanceSquared = dx * dx + dy * dy + dz * dz;
      if (distanceSquared < nearestSquared) {
        nearestSquared = distanceSquared;
        side = candidate;
      }
    }
    const alignment = (centroid.x - side.surfacePosition.x) * side.outwardNormal.x
      + (centroid.y - side.surfacePosition.y) * side.outwardNormal.y
      + (centroid.z - side.surfacePosition.z) * side.outwardNormal.z;
    if (alignment < 0) {
      faceClasses[faceIndex] = SKIN_REBUILD_OVERHANG_INSIDE;
      insideFaceRegionIds[faceIndex] = regionId;
      faceOwnerPatchIds[faceIndex] = side.patchId;
      insideFaceCount++;
      insideRegions.add(regionId);
    } else {
      faceClasses[faceIndex] = SKIN_REBUILD_OVERHANG_OUTSIDE;
      faceOwnerPatchIds[faceIndex] = side.patchId;
      outsideFaceCount++;
      outsideRegions.add(regionId);
    }
  }
  const sorted = (values: Set<number>): number[] => [...values].sort((a, b) => a - b);
  return {
    faceClasses,
    faceRegionIds: new Int32Array(faceRegionIds),
    faceOwnerPatchIds,
    insideFaceRegionIds,
    insideFaceCount,
    outsideFaceCount,
    unclassifiedFaceCount,
    insideRegionIds: sorted(insideRegions),
    outsideRegionIds: sorted(outsideRegions),
    unclassifiedRegionIds: sorted(unclassifiedRegions),
    mixedRegionCount: [...insideRegions].filter((regionId) => outsideRegions.has(regionId)).length,
  };
}
