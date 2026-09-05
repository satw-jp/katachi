/**
 * Conservative lower-envelope screen for Bambu Support Enforcer candidates.
 *
 * This deliberately asks a narrow question: can four points on a diagnosed
 * face see the build plate on a straight -Z ray without passing another final
 * Surface triangle?  It is not a support router, side-access proof, slicer,
 * removal proof, or print-success guarantee.
 */

export interface SupportReachabilityFacts {
  /** Longest finite final-Surface extent, in millimetres. */
  meshScaleMm: number;
  /** Same-height/self-hit tolerance, derived from final Surface scale. */
  lowerIntersectionEpsilonMm: number;
  /** Deterministic XY cell size used for the final-Surface index. */
  gridCellSizeMm: number;
  gridCellCount: number;
  surfaceTriangleCount: number;
  invalidSurfaceTriangleCount: number;
}

export interface SupportReachabilityResult extends SupportReachabilityFacts {
  /** Complete original candidate triangles, in their original input order. */
  keptPositions: Float32Array;
  candidateFaceCount: number;
  keptFaceCount: number;
  rejectedFaceCount: number;
  invalidCandidateFaceCount: number;
  /** Valid candidate faces whose deterministic samples were only partly
   * occluded. The legacy filter rejects these conservatively; the shared
   * v088 policy records them as unresolved instead of dropping them. */
  unresolvedCandidateFaceCount: number;
}

export type SupportReachabilityClassification = "outside" | "inside" | "unresolved";

/** Cache/provenance version for max(0.001 mm, meshScaleMm * 1e-6). */
export const SUPPORT_REACHABILITY_RAY_EPSILON_VERSION = "scale-1e-6-floor-0.001mm-v1";

export interface SupportReachabilitySampleDiagnosis {
  xMm: number;
  yMm: number;
  zMm: number;
  classification: Exclude<SupportReachabilityClassification, "unresolved">;
  nearestLowerIntersectionDistanceMm: number | null;
}

export interface SupportReachabilityTriangleDiagnosis {
  classification: SupportReachabilityClassification;
  samples: SupportReachabilitySampleDiagnosis[];
  blockedSampleCount: number;
  openSampleCount: number;
}

/** A reusable, deterministic lower-Surface index. The v088 policy uses this
 * same index for diagnosed faces and explicit Profile points so the CLI,
 * Worker, and app cannot drift into different routing rules. */
export interface SupportReachabilityIndex extends SupportReachabilityFacts {
  classifyTriangle: (positions: Float32Array, offset?: number) => SupportReachabilityClassification;
  classifyPoint: (x: number, y: number, z: number) => SupportReachabilityClassification;
  diagnosePoint: (x: number, y: number, z: number) => SupportReachabilitySampleDiagnosis | null;
  diagnoseTriangle: (positions: Float32Array, offset?: number) => SupportReachabilityTriangleDiagnosis;
}

type Triangle = { ax: number; ay: number; az: number; bx: number; by: number; bz: number; cx: number; cy: number; cz: number };

const VERTEX_BIASED_WEIGHT = 0.8;
/** Dimensionless inclusion slack for shared XY triangle edges. */
const BARYCENTRIC_BOUNDARY_TOLERANCE = 1e-9;

function finiteTriangle(positions: Float32Array, offset: number): Triangle | null {
  if (offset + 8 >= positions.length) return null;
  const values = Array.from(positions.subarray(offset, offset + 9));
  if (!values.every(Number.isFinite)) return null;
  const [ax, ay, az, bx, by, bz, cx, cy, cz] = values;
  const abx = bx - ax; const aby = by - ay; const abz = bz - az;
  const acx = cx - ax; const acy = cy - ay; const acz = cz - az;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz) || (nx === 0 && ny === 0 && nz === 0)) return null;
  return { ax, ay, az, bx, by, bz, cx, cy, cz };
}

function meshExtent(positions: Float32Array): number {
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (let offset = 0; offset + 2 < positions.length; offset += 3) {
    const x = positions[offset]; const y = positions[offset + 1]; const z = positions[offset + 2];
    if (!Number.isFinite(x + y + z)) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
  }
  return Number.isFinite(minX) ? Math.max(maxX - minX, maxY - minY, maxZ - minZ) : 0;
}

function cellKey(x: number, y: number): string { return `${x}:${y}`; }

/** Returns the triangle height at XY, or null when the vertical ray misses. */
function zAtXY(triangle: Triangle, x: number, y: number): number | null {
  const denominator = (triangle.by - triangle.cy) * (triangle.ax - triangle.cx)
    + (triangle.cx - triangle.bx) * (triangle.ay - triangle.cy);
  if (!Number.isFinite(denominator) || denominator === 0) return null;
  const u = ((triangle.by - triangle.cy) * (x - triangle.cx) + (triangle.cx - triangle.bx) * (y - triangle.cy)) / denominator;
  const v = ((triangle.cy - triangle.ay) * (x - triangle.cx) + (triangle.ax - triangle.cx) * (y - triangle.cy)) / denominator;
  const w = 1 - u - v;
  // Dimensionless barycentric slack keeps shared rasterized edges from
  // becoming numerical holes. It is intentionally independent of the
  // millimetre Z epsilon used to ignore same-height/self intersections.
  const boundary = BARYCENTRIC_BOUNDARY_TOLERANCE;
  if (u < -boundary || v < -boundary || w < -boundary) return null;
  return u * triangle.az + v * triangle.bz + w * triangle.cz;
}

/**
 * Keeps a candidate only when all four deterministic interior samples can
 * reach -Z without a lower final-Surface intersection.  Candidate order is
 * intentionally preserved for reproducible 3MFs and testable diagnostics.
 */
export function filterSupportEnforcerReachability(
  dangerousPositionsMm: Float32Array,
  finalSurfacePositionsMm: Float32Array,
): SupportReachabilityResult {
  if (dangerousPositionsMm.length % 9 !== 0) throw new Error("危険面bufferの長さが9の倍数ではありません");
  const index = createSupportReachabilityIndex(finalSurfacePositionsMm);
  const kept: number[] = [];
  let candidateFaceCount = 0;
  let keptFaceCount = 0;
  let rejectedFaceCount = 0;
  let invalidCandidateFaceCount = 0;
  let unresolvedCandidateFaceCount = 0;
  for (let offset = 0; offset < dangerousPositionsMm.length; offset += 9) {
    candidateFaceCount++;
    const triangle = finiteTriangle(dangerousPositionsMm, offset);
    if (!triangle) { invalidCandidateFaceCount++; continue; }
    const classification = index.classifyTriangle(dangerousPositionsMm, offset);
    if (classification === "unresolved") unresolvedCandidateFaceCount++;
    if (classification !== "outside") { rejectedFaceCount++; continue; }
    for (let index = 0; index < 9; index++) kept.push(dangerousPositionsMm[offset + index]);
    keptFaceCount++;
  }
  return {
    keptPositions: new Float32Array(kept), candidateFaceCount, keptFaceCount, rejectedFaceCount, invalidCandidateFaceCount,
    unresolvedCandidateFaceCount,
    meshScaleMm: index.meshScaleMm, lowerIntersectionEpsilonMm: index.lowerIntersectionEpsilonMm,
    gridCellSizeMm: index.gridCellSizeMm, gridCellCount: index.gridCellCount,
    surfaceTriangleCount: index.surfaceTriangleCount, invalidSurfaceTriangleCount: index.invalidSurfaceTriangleCount,
  };
}

/** Build the shared lower-envelope index used by all three execution paths. */
export function createSupportReachabilityIndex(finalSurfacePositionsMm: Float32Array): SupportReachabilityIndex {
  if (finalSurfacePositionsMm.length % 9 !== 0) throw new Error("最終Surface bufferの長さが9の倍数ではありません");
  if (finalSurfacePositionsMm.length === 0) throw new Error("Fail closed: 最終Surface occlusion meshが空です");
  const meshScaleMm = meshExtent(finalSurfacePositionsMm);
  // 1 µm minimum avoids float noise; 1 ppm of mesh extent grows modestly
  // with author scale and stays conservative relative to FDM tolerances.
  const lowerIntersectionEpsilonMm = Math.max(0.001, meshScaleMm * 1e-6);
  const gridCellSizeMm = Math.max(0.25, meshScaleMm / 64 || 0.25);
  const grid = new Map<string, Triangle[]>();
  let surfaceTriangleCount = 0;
  let invalidSurfaceTriangleCount = 0;
  for (let offset = 0; offset < finalSurfacePositionsMm.length; offset += 9) {
    const triangle = finiteTriangle(finalSurfacePositionsMm, offset);
    if (!triangle) { invalidSurfaceTriangleCount++; continue; }
    surfaceTriangleCount++;
    const minX = Math.floor(Math.min(triangle.ax, triangle.bx, triangle.cx) / gridCellSizeMm);
    const maxX = Math.floor(Math.max(triangle.ax, triangle.bx, triangle.cx) / gridCellSizeMm);
    const minY = Math.floor(Math.min(triangle.ay, triangle.by, triangle.cy) / gridCellSizeMm);
    const maxY = Math.floor(Math.max(triangle.ay, triangle.by, triangle.cy) / gridCellSizeMm);
    for (let gx = minX; gx <= maxX; gx++) for (let gy = minY; gy <= maxY; gy++) {
      const key = cellKey(gx, gy);
      const bucket = grid.get(key);
      if (bucket) bucket.push(triangle); else grid.set(key, [triangle]);
    }
  }
  // Any omitted final-Surface face could be the lower occluder for a kept
  // candidate. Do not turn a malformed mesh into an accidental escape hole.
  if (invalidSurfaceTriangleCount > 0) {
    throw new Error(`Fail closed: 最終Surface occlusion meshに無効面が${invalidSurfaceTriangleCount}枚あります`);
  }
  if (surfaceTriangleCount === 0) throw new Error("Fail closed: 最終Surface occlusion meshに有効面がありません");

  const diagnosePoint = (x: number, y: number, z: number): SupportReachabilitySampleDiagnosis | null => {
    if (![x, y, z].every(Number.isFinite)) return null;
    const bucket = grid.get(cellKey(Math.floor(x / gridCellSizeMm), Math.floor(y / gridCellSizeMm))) ?? [];
    let nearestLowerIntersectionDistanceMm = Infinity;
    for (const surface of bucket) {
      const hitZ = zAtXY(surface, x, y);
      if (hitZ !== null && hitZ < z - lowerIntersectionEpsilonMm) {
        nearestLowerIntersectionDistanceMm = Math.min(nearestLowerIntersectionDistanceMm, z - hitZ);
      }
    }
    return {
      xMm: x,
      yMm: y,
      zMm: z,
      classification: Number.isFinite(nearestLowerIntersectionDistanceMm) ? "inside" : "outside",
      nearestLowerIntersectionDistanceMm: Number.isFinite(nearestLowerIntersectionDistanceMm)
        ? nearestLowerIntersectionDistanceMm
        : null,
    };
  };

  const classifyPoint = (x: number, y: number, z: number): SupportReachabilityClassification =>
    diagnosePoint(x, y, z)?.classification ?? "unresolved";

  const diagnoseTriangle = (positions: Float32Array, offset = 0): SupportReachabilityTriangleDiagnosis => {
    const triangle = finiteTriangle(positions, offset);
    if (!triangle) return { classification: "unresolved", samples: [], blockedSampleCount: 0, openSampleCount: 0 };
    const vertices: Array<[number, number, number]> = [
      [triangle.ax, triangle.ay, triangle.az], [triangle.bx, triangle.by, triangle.bz], [triangle.cx, triangle.cy, triangle.cz],
    ];
    const centroid: [number, number, number] = [
      (triangle.ax + triangle.bx + triangle.cx) / 3,
      (triangle.ay + triangle.by + triangle.cy) / 3,
      (triangle.az + triangle.bz + triangle.cz) / 3,
    ];
    const samples: Array<[number, number, number]> = [centroid];
    for (let vertex = 0; vertex < 3; vertex++) {
      const otherA = vertices[(vertex + 1) % 3];
      const otherB = vertices[(vertex + 2) % 3];
      const point = vertices[vertex];
      samples.push([
        point[0] * VERTEX_BIASED_WEIGHT + (otherA[0] + otherB[0]) * (1 - VERTEX_BIASED_WEIGHT) / 2,
        point[1] * VERTEX_BIASED_WEIGHT + (otherA[1] + otherB[1]) * (1 - VERTEX_BIASED_WEIGHT) / 2,
        point[2] * VERTEX_BIASED_WEIGHT + (otherA[2] + otherB[2]) * (1 - VERTEX_BIASED_WEIGHT) / 2,
      ]);
    }
    const diagnosedSamples: SupportReachabilitySampleDiagnosis[] = [];
    for (const [x, y, z] of samples) {
      const diagnosis = diagnosePoint(x, y, z);
      if (!diagnosis) return { classification: "unresolved", samples: diagnosedSamples, blockedSampleCount: 0, openSampleCount: 0 };
      diagnosedSamples.push(diagnosis);
    }
    const blockedSampleCount = diagnosedSamples.filter((sample) => sample.classification === "inside").length;
    const openSampleCount = diagnosedSamples.length - blockedSampleCount;
    return {
      classification: blockedSampleCount === 0 ? "outside" : openSampleCount === 0 ? "inside" : "unresolved",
      samples: diagnosedSamples,
      blockedSampleCount,
      openSampleCount,
    };
  };

  const classifyTriangle = (positions: Float32Array, offset = 0): SupportReachabilityClassification =>
    diagnoseTriangle(positions, offset).classification;

  return {
    meshScaleMm, lowerIntersectionEpsilonMm, gridCellSizeMm, gridCellCount: grid.size,
    surfaceTriangleCount, invalidSurfaceTriangleCount, classifyTriangle, classifyPoint, diagnosePoint, diagnoseTriangle,
  };
}

/**
 * Packed large-mesh variant of createSupportReachabilityIndex().  It keeps
 * the same four samples, -Z lower-envelope rule, epsilon and unresolved
 * semantics, but stores grid buckets as typed triangle indices rather than
 * allocating one Triangle object for every final-surface face.
 */
export function createPackedSupportReachabilityIndex(finalSurfacePositionsMm: Float32Array): SupportReachabilityIndex {
  if (finalSurfacePositionsMm.length % 9 !== 0) throw new Error("最終Surface bufferの長さが9の倍数ではありません");
  if (finalSurfacePositionsMm.length === 0) throw new Error("Fail closed: 最終Surface occlusion meshが空です");
  const meshScaleMm = meshExtent(finalSurfacePositionsMm);
  const lowerIntersectionEpsilonMm = Math.max(0.001, meshScaleMm * 1e-6);
  const gridCellSizeMm = Math.max(0.25, meshScaleMm / 64 || 0.25);
  const cellIds = new Map<string, number>();
  const ranges = (triangle: number): [number, number, number, number] => {
    const offset = triangle * 9;
    const minX = Math.floor(Math.min(finalSurfacePositionsMm[offset], finalSurfacePositionsMm[offset + 3], finalSurfacePositionsMm[offset + 6]) / gridCellSizeMm);
    const maxX = Math.floor(Math.max(finalSurfacePositionsMm[offset], finalSurfacePositionsMm[offset + 3], finalSurfacePositionsMm[offset + 6]) / gridCellSizeMm);
    const minY = Math.floor(Math.min(finalSurfacePositionsMm[offset + 1], finalSurfacePositionsMm[offset + 4], finalSurfacePositionsMm[offset + 7]) / gridCellSizeMm);
    const maxY = Math.floor(Math.max(finalSurfacePositionsMm[offset + 1], finalSurfacePositionsMm[offset + 4], finalSurfacePositionsMm[offset + 7]) / gridCellSizeMm);
    return [minX, maxX, minY, maxY];
  };
  const idFor = (x: number, y: number): number => {
    const key = cellKey(x, y); const existing = cellIds.get(key);
    if (existing !== undefined) return existing;
    const id = cellIds.size; cellIds.set(key, id); return id;
  };
  const triangleCount = finalSurfacePositionsMm.length / 9;
  let surfaceTriangleCount = 0; let invalidSurfaceTriangleCount = 0;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const offset = triangle * 9;
    const values = finalSurfacePositionsMm.subarray(offset, offset + 9);
    if (!values.every(Number.isFinite)) { invalidSurfaceTriangleCount++; continue; }
    const abx = values[3] - values[0]; const aby = values[4] - values[1]; const abz = values[5] - values[2];
    const acx = values[6] - values[0]; const acy = values[7] - values[1]; const acz = values[8] - values[2];
    const nx = aby * acz - abz * acy; const ny = abz * acx - abx * acz; const nz = abx * acy - aby * acx;
    if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz) || (nx === 0 && ny === 0 && nz === 0)) { invalidSurfaceTriangleCount++; continue; }
    surfaceTriangleCount++;
    const [minX, maxX, minY, maxY] = ranges(triangle);
    for (let x = minX; x <= maxX; x += 1) for (let y = minY; y <= maxY; y += 1) idFor(x, y);
  }
  if (invalidSurfaceTriangleCount > 0) throw new Error(`Fail closed: 最終Surface occlusion meshに無効面が${invalidSurfaceTriangleCount}枚あります`);
  if (surfaceTriangleCount === 0) throw new Error("Fail closed: 最終Surface occlusion meshに有効面がありません");
  const counts = new Uint32Array(cellIds.size);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const offset = triangle * 9; const values = finalSurfacePositionsMm.subarray(offset, offset + 9);
    const abx = values[3] - values[0]; const aby = values[4] - values[1]; const abz = values[5] - values[2];
    const acx = values[6] - values[0]; const acy = values[7] - values[1]; const acz = values[8] - values[2];
    const nx = aby * acz - abz * acy; const ny = abz * acx - abx * acz; const nz = abx * acy - aby * acx;
    if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz) || (nx === 0 && ny === 0 && nz === 0)) continue;
    const [minX, maxX, minY, maxY] = ranges(triangle);
    for (let x = minX; x <= maxX; x += 1) for (let y = minY; y <= maxY; y += 1) counts[idFor(x, y)]++;
  }
  const offsets = new Uint32Array(cellIds.size + 1);
  for (let index = 0; index < counts.length; index += 1) {
    const next = offsets[index] + counts[index];
    if (next > 0xffff_ffff) throw new Error("Fail closed: packed reachability index exceeds Uint32 capacity");
    offsets[index + 1] = next;
  }
  const indices = new Uint32Array(offsets[offsets.length - 1]);
  const cursors = new Uint32Array(offsets.length - 1); cursors.set(offsets.subarray(0, -1));
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const offset = triangle * 9; const values = finalSurfacePositionsMm.subarray(offset, offset + 9);
    const abx = values[3] - values[0]; const aby = values[4] - values[1]; const abz = values[5] - values[2];
    const acx = values[6] - values[0]; const acy = values[7] - values[1]; const acz = values[8] - values[2];
    const nx = aby * acz - abz * acy; const ny = abz * acx - abx * acz; const nz = abx * acy - aby * acx;
    if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz) || (nx === 0 && ny === 0 && nz === 0)) continue;
    const [minX, maxX, minY, maxY] = ranges(triangle);
    for (let x = minX; x <= maxX; x += 1) for (let y = minY; y <= maxY; y += 1) {
      const id = idFor(x, y); indices[cursors[id]++] = triangle;
    }
  }
  const zAt = (triangle: number, x: number, y: number): number | null => {
    const offset = triangle * 9;
    const ax = finalSurfacePositionsMm[offset]; const ay = finalSurfacePositionsMm[offset + 1]; const az = finalSurfacePositionsMm[offset + 2];
    const bx = finalSurfacePositionsMm[offset + 3]; const by = finalSurfacePositionsMm[offset + 4]; const bz = finalSurfacePositionsMm[offset + 5];
    const cx = finalSurfacePositionsMm[offset + 6]; const cy = finalSurfacePositionsMm[offset + 7]; const cz = finalSurfacePositionsMm[offset + 8];
    const denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (!Number.isFinite(denominator) || denominator === 0) return null;
    const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / denominator;
    const v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / denominator;
    const w = 1 - u - v;
    if (u < -BARYCENTRIC_BOUNDARY_TOLERANCE || v < -BARYCENTRIC_BOUNDARY_TOLERANCE || w < -BARYCENTRIC_BOUNDARY_TOLERANCE) return null;
    return u * az + v * bz + w * cz;
  };
  const diagnosePoint = (x: number, y: number, z: number): SupportReachabilitySampleDiagnosis | null => {
    if (![x, y, z].every(Number.isFinite)) return null;
    const id = cellIds.get(cellKey(Math.floor(x / gridCellSizeMm), Math.floor(y / gridCellSizeMm)));
    let nearest = Infinity;
    if (id !== undefined) for (let cursor = offsets[id]; cursor < offsets[id + 1]; cursor += 1) {
      const hitZ = zAt(indices[cursor], x, y);
      if (hitZ !== null && hitZ < z - lowerIntersectionEpsilonMm) nearest = Math.min(nearest, z - hitZ);
    }
    return { xMm: x, yMm: y, zMm: z,
      classification: Number.isFinite(nearest) ? "inside" : "outside",
      nearestLowerIntersectionDistanceMm: Number.isFinite(nearest) ? nearest : null };
  };
  const diagnoseTriangle = (positions: Float32Array, offset = 0): SupportReachabilityTriangleDiagnosis => {
    const triangle = finiteTriangle(positions, offset);
    if (!triangle) return { classification: "unresolved", samples: [], blockedSampleCount: 0, openSampleCount: 0 };
    const vertices: Array<[number, number, number]> = [[triangle.ax, triangle.ay, triangle.az], [triangle.bx, triangle.by, triangle.bz], [triangle.cx, triangle.cy, triangle.cz]];
    const samples: Array<[number, number, number]> = [[(triangle.ax + triangle.bx + triangle.cx) / 3, (triangle.ay + triangle.by + triangle.cy) / 3, (triangle.az + triangle.bz + triangle.cz) / 3]];
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const otherA = vertices[(vertex + 1) % 3]; const otherB = vertices[(vertex + 2) % 3]; const point = vertices[vertex];
      samples.push([point[0] * VERTEX_BIASED_WEIGHT + (otherA[0] + otherB[0]) * (1 - VERTEX_BIASED_WEIGHT) / 2,
        point[1] * VERTEX_BIASED_WEIGHT + (otherA[1] + otherB[1]) * (1 - VERTEX_BIASED_WEIGHT) / 2,
        point[2] * VERTEX_BIASED_WEIGHT + (otherA[2] + otherB[2]) * (1 - VERTEX_BIASED_WEIGHT) / 2]);
    }
    const diagnosedSamples: SupportReachabilitySampleDiagnosis[] = [];
    for (const sample of samples) { const diagnosis = diagnosePoint(sample[0], sample[1], sample[2]); if (!diagnosis) return { classification: "unresolved", samples: diagnosedSamples, blockedSampleCount: 0, openSampleCount: 0 }; diagnosedSamples.push(diagnosis); }
    const blockedSampleCount = diagnosedSamples.filter((sample) => sample.classification === "inside").length;
    const openSampleCount = diagnosedSamples.length - blockedSampleCount;
    return { classification: blockedSampleCount === 0 ? "outside" : openSampleCount === 0 ? "inside" : "unresolved", samples: diagnosedSamples, blockedSampleCount, openSampleCount };
  };
  return {
    meshScaleMm, lowerIntersectionEpsilonMm, gridCellSizeMm, gridCellCount: cellIds.size,
    surfaceTriangleCount, invalidSurfaceTriangleCount,
    classifyTriangle: (positions, offset = 0) => diagnoseTriangle(positions, offset).classification,
    classifyPoint: (x, y, z) => diagnosePoint(x, y, z)?.classification ?? "unresolved",
    diagnosePoint, diagnoseTriangle,
  };
}
