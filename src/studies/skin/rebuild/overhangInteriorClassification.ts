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
