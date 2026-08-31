import type { SkinRebuildLowestPoint, SkinRebuildPatternSide } from "./model.ts";

export const SKIN_REBUILD_OVERHANG_INSIDE = 0;
export const SKIN_REBUILD_OVERHANG_OUTSIDE = 1;
export const SKIN_REBUILD_OVERHANG_UNCLASSIFIED = 2;

export type SkinRebuildOverhangInteriorClass =
  | typeof SKIN_REBUILD_OVERHANG_INSIDE
  | typeof SKIN_REBUILD_OVERHANG_OUTSIDE
  | typeof SKIN_REBUILD_OVERHANG_UNCLASSIFIED;

export interface SkinRebuildOverhangInteriorClassification {
  /** One Stage 3-derived class per diagnosed overhang triangle. */
  faceClasses: Int8Array;
  /** The retained Stage 4 region id for every diagnosed overhang triangle. */
  faceRegionIds: Int32Array;
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
  stage4Classification: Pick<SkinRebuildOverhangInteriorClassification, "faceClasses" | "faceRegionIds">,
): SkinRebuildFinalArtworkOverhangProjection {
  if (stage7Positions.length % 9 !== 0
    || stage7FaceRegionIds.length !== stage7Positions.length / 9
    || stage4Positions.length % 9 !== 0
    || stage4Classification.faceClasses.length !== stage4Positions.length / 9
    || stage4Classification.faceRegionIds.length !== stage4Positions.length / 9) {
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
    const projected: SkinRebuildProjectedOverhangFace = {
      stage7FaceIndex,
      position: representative.position,
      normal: representative.normal,
      responsibility,
      responsibilityRegionId,
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
      insideFaceCount++;
      insideRegions.add(regionId);
    } else {
      faceClasses[faceIndex] = SKIN_REBUILD_OVERHANG_OUTSIDE;
      outsideFaceCount++;
      outsideRegions.add(regionId);
    }
  }
  const sorted = (values: Set<number>): number[] => [...values].sort((a, b) => a - b);
  return {
    faceClasses,
    faceRegionIds: new Int32Array(faceRegionIds),
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
