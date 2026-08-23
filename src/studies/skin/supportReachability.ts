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
  const kept: number[] = [];
  let candidateFaceCount = 0;
  let keptFaceCount = 0;
  let rejectedFaceCount = 0;
  let invalidCandidateFaceCount = 0;
  for (let offset = 0; offset < dangerousPositionsMm.length; offset += 9) {
    candidateFaceCount++;
    const triangle = finiteTriangle(dangerousPositionsMm, offset);
    if (!triangle) { invalidCandidateFaceCount++; continue; }
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
    let blocked = false;
    for (const [x, y, z] of samples) {
      const bucket = grid.get(cellKey(Math.floor(x / gridCellSizeMm), Math.floor(y / gridCellSizeMm))) ?? [];
      for (const surface of bucket) {
        const hitZ = zAtXY(surface, x, y);
        if (hitZ !== null && hitZ < z - lowerIntersectionEpsilonMm) { blocked = true; break; }
      }
      if (blocked) break;
    }
    if (blocked) { rejectedFaceCount++; continue; }
    for (let index = 0; index < 9; index++) kept.push(dangerousPositionsMm[offset + index]);
    keptFaceCount++;
  }
  return {
    keptPositions: new Float32Array(kept), candidateFaceCount, keptFaceCount, rejectedFaceCount, invalidCandidateFaceCount,
    meshScaleMm, lowerIntersectionEpsilonMm, gridCellSizeMm, gridCellCount: grid.size,
    surfaceTriangleCount, invalidSurfaceTriangleCount,
  };
}
