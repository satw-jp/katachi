import type { HostVec3 } from "./externalStlHost.ts";

export interface PackedCandidateQueryStats {
  readonly triangleCount: number;
  readonly leafSize: number;
  readonly nodeCount: number;
  readonly positionsBytes: number;
  readonly triangleOrderBytes: number;
  readonly boundsBytes: number;
  readonly childBytes: number;
  readonly rangeBytes: number;
  readonly totalTypedArrayBytes: number;
}

export interface PackedCandidateQuery {
  readonly stats: PackedCandidateQueryStats;
  readonly positions: Float32Array;
  closestSurface(point: HostVec3): { distance: number; triangleIndex: number } | null;
  signedDistance(point: HostVec3): number;
  release(): void;
}

const LEAF_SIZE = 32;
const EPSILON = 1e-7;

function pointAabbDistanceSquared(point: HostVec3, bounds: Float32Array, offset: number): number {
  const dx = point.x < bounds[offset] ? bounds[offset] - point.x : point.x > bounds[offset + 3] ? point.x - bounds[offset + 3] : 0;
  const dy = point.y < bounds[offset + 1] ? bounds[offset + 1] - point.y : point.y > bounds[offset + 4] ? point.y - bounds[offset + 4] : 0;
  const dz = point.z < bounds[offset + 2] ? bounds[offset + 2] - point.z : point.z > bounds[offset + 5] ? point.z - bounds[offset + 5] : 0;
  return dx * dx + dy * dy + dz * dz;
}

function triangleBounds(positions: Float32Array, triangle: number): [number, number, number, number, number, number] {
  const offset = triangle * 9;
  const ax = positions[offset]; const ay = positions[offset + 1]; const az = positions[offset + 2];
  const bx = positions[offset + 3]; const by = positions[offset + 4]; const bz = positions[offset + 5];
  const cx = positions[offset + 6]; const cy = positions[offset + 7]; const cz = positions[offset + 8];
  return [Math.min(ax, bx, cx), Math.min(ay, by, cy), Math.min(az, bz, cz), Math.max(ax, bx, cx), Math.max(ay, by, cy), Math.max(az, bz, cz)];
}

function pointTriangleDistanceSquared(point: HostVec3, positions: Float32Array, triangle: number): number {
  const offset = triangle * 9;
  const ax = positions[offset]; const ay = positions[offset + 1]; const az = positions[offset + 2];
  const bx = positions[offset + 3]; const by = positions[offset + 4]; const bz = positions[offset + 5];
  const cx = positions[offset + 6]; const cy = positions[offset + 7]; const cz = positions[offset + 8];
  const abx = bx - ax; const aby = by - ay; const abz = bz - az;
  const acx = cx - ax; const acy = cy - ay; const acz = cz - az;
  const apx = point.x - ax; const apy = point.y - ay; const apz = point.z - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return apx * apx + apy * apy + apz * apz;
  const bpx = point.x - bx; const bpy = point.y - by; const bpz = point.z - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return bpx * bpx + bpy * bpy + bpz * bpz;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    const qx = ax + v * abx - point.x; const qy = ay + v * aby - point.y; const qz = az + v * abz - point.z;
    return qx * qx + qy * qy + qz * qz;
  }
  const cpx = point.x - cx; const cpy = point.y - cy; const cpz = point.z - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return cpx * cpx + cpy * cpy + cpz * cpz;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    const qx = ax + w * acx - point.x; const qy = ay + w * acy - point.y; const qz = az + w * acz - point.z;
    return qx * qx + qy * qy + qz * qz;
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    const qx = bx + w * (cx - bx) - point.x; const qy = by + w * (cy - by) - point.y; const qz = bz + w * (cz - bz) - point.z;
    return qx * qx + qy * qy + qz * qz;
  }
  const nx = aby * acz - abz * acy; const ny = abz * acx - abx * acz; const nz = abx * acy - aby * acx;
  const normalLength = Math.hypot(nx, ny, nz);
  if (!(normalLength > EPSILON)) return Infinity;
  const distance = (apx * nx + apy * ny + apz * nz) / normalLength;
  return distance * distance;
}

function rayIntersectsTriangle(point: HostVec3, positions: Float32Array, triangle: number): boolean {
  const offset = triangle * 9;
  const ax = positions[offset]; const ay = positions[offset + 1]; const az = positions[offset + 2];
  const bx = positions[offset + 3]; const by = positions[offset + 4]; const bz = positions[offset + 5];
  const cx = positions[offset + 6]; const cy = positions[offset + 7]; const cz = positions[offset + 8];
  const edge1x = bx - ax; const edge1y = by - ay; const edge1z = bz - az;
  const edge2x = cx - ax; const edge2y = cy - ay; const edge2z = cz - az;
  const hx = 0; const hy = -edge2z; const hz = edge2y;
  const det = edge1x * hx + edge1y * hy + edge1z * hz;
  if (Math.abs(det) < EPSILON) return false;
  const inverse = 1 / det;
  const sx = point.x - ax; const sy = point.y - ay; const sz = (point.z + 3e-7) - az;
  const u = inverse * (sx * hx + sy * hy + sz * hz);
  if (u < -EPSILON || u > 1 + EPSILON) return false;
  const qx = sy * edge1z - sz * edge1y;
  const qy = sz * edge1x - sx * edge1z;
  const qz = sx * edge1y - sy * edge1x;
  const v = inverse * qx;
  if (v < -EPSILON || u + v > 1 + EPSILON) return false;
  const distance = inverse * (edge2x * qx + edge2y * qy + edge2z * qz);
  return distance > EPSILON;
}

/** A deliberately small packed query backend for one active large candidate. */
export function buildPackedCandidateQuery(
  positions: Float32Array,
  onProgress?: (stage: string, completed: number, total: number) => void,
): PackedCandidateQuery {
  if (positions.length === 0 || positions.length % 9 !== 0) throw new Error("Packed candidate positions must contain triangles");
  const triangleCount = positions.length / 9;
  const leafCount = Math.ceil(triangleCount / LEAF_SIZE);
  const nodeCount = leafCount * 2 - 1;
  const triangleOrder = new Uint32Array(triangleCount);
  for (let index = 0; index < triangleCount; index += 1) triangleOrder[index] = index;
  const bounds = new Float32Array(nodeCount * 6);
  const left = new Int32Array(nodeCount); left.fill(-1);
  const right = new Int32Array(nodeCount); right.fill(-1);
  const start = new Uint32Array(nodeCount);
  const count = new Uint32Array(nodeCount);
  for (let leaf = 0; leaf < leafCount; leaf += 1) {
    const node = leafCount - 1 + leaf;
    const first = leaf * LEAF_SIZE;
    const last = Math.min(triangleCount, first + LEAF_SIZE);
    start[node] = first;
    count[node] = last - first;
    const output = node * 6;
    bounds[output] = Infinity; bounds[output + 1] = Infinity; bounds[output + 2] = Infinity;
    bounds[output + 3] = -Infinity; bounds[output + 4] = -Infinity; bounds[output + 5] = -Infinity;
    for (let index = first; index < last; index += 1) {
      const triangle = triangleOrder[index];
      const values = triangleBounds(positions, triangle);
      bounds[output] = Math.min(bounds[output], values[0]); bounds[output + 1] = Math.min(bounds[output + 1], values[1]); bounds[output + 2] = Math.min(bounds[output + 2], values[2]);
      bounds[output + 3] = Math.max(bounds[output + 3], values[3]); bounds[output + 4] = Math.max(bounds[output + 4], values[4]); bounds[output + 5] = Math.max(bounds[output + 5], values[5]);
    }
    if (leaf % 1024 === 0) onProgress?.("Building Candidate query", leaf, leafCount);
  }
  for (let node = leafCount - 2; node >= 0; node -= 1) {
    const childLeft = node * 2 + 1; const childRight = childLeft + 1;
    left[node] = childLeft; right[node] = childRight;
    start[node] = Math.min(start[childLeft], start[childRight]);
    count[node] = count[childLeft] + count[childRight];
    const output = node * 6; const a = childLeft * 6; const b = childRight * 6;
    bounds[output] = Math.min(bounds[a], bounds[b]); bounds[output + 1] = Math.min(bounds[a + 1], bounds[b + 1]); bounds[output + 2] = Math.min(bounds[a + 2], bounds[b + 2]);
    bounds[output + 3] = Math.max(bounds[a + 3], bounds[b + 3]); bounds[output + 4] = Math.max(bounds[a + 4], bounds[b + 4]); bounds[output + 5] = Math.max(bounds[a + 5], bounds[b + 5]);
  }
  onProgress?.("Building Candidate query", leafCount, leafCount);
  let released = false;
  const assertLive = (): void => { if (released) throw new Error("Packed Candidate query has been released"); };
  const closestSurface = (point: HostVec3): { distance: number; triangleIndex: number } | null => {
    assertLive();
    let bestSquared = Infinity; let bestTriangle = -1;
    const stack: number[] = [0];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (pointAabbDistanceSquared(point, bounds, node * 6) > bestSquared + EPSILON) continue;
      if (count[node] > 0 && left[node] < 0) {
        for (let index = start[node]; index < start[node] + count[node]; index += 1) {
          const triangle = triangleOrder[index];
          const distanceSquared = pointTriangleDistanceSquared(point, positions, triangle);
          if (distanceSquared < bestSquared - EPSILON || (Math.abs(distanceSquared - bestSquared) <= EPSILON && triangle < bestTriangle)) {
            bestSquared = distanceSquared; bestTriangle = triangle;
          }
        }
      } else {
        const a = left[node]; const b = right[node];
        if (a >= 0 && b >= 0) {
          const da = pointAabbDistanceSquared(point, bounds, a * 6);
          const db = pointAabbDistanceSquared(point, bounds, b * 6);
          if (da < db) { stack.push(b, a); } else { stack.push(a, b); }
        }
      }
    }
    return bestTriangle < 0 ? null : { distance: Math.sqrt(bestSquared), triangleIndex: bestTriangle };
  };
  const rayIntersections = (point: HostVec3): number => {
    let hits = 0;
    const stack: number[] = [0];
    while (stack.length > 0) {
      const node = stack.pop()!;
      const box = node * 6;
      if (point.y < bounds[box + 1] - EPSILON || point.y > bounds[box + 4] + EPSILON
        || point.z < bounds[box + 2] - EPSILON || point.z > bounds[box + 5] + EPSILON
        || bounds[box + 3] <= point.x + EPSILON) continue;
      if (count[node] > 0 && left[node] < 0) {
        for (let index = start[node]; index < start[node] + count[node]; index += 1) {
          if (rayIntersectsTriangle(point, positions, triangleOrder[index])) hits += 1;
        }
      } else {
        if (left[node] >= 0) stack.push(left[node]);
        if (right[node] >= 0) stack.push(right[node]);
      }
    }
    return hits;
  };
  return {
    stats: {
      triangleCount, leafSize: LEAF_SIZE, nodeCount,
      positionsBytes: positions.byteLength, triangleOrderBytes: triangleOrder.byteLength,
      boundsBytes: bounds.byteLength, childBytes: left.byteLength + right.byteLength,
      rangeBytes: start.byteLength + count.byteLength,
      totalTypedArrayBytes: positions.byteLength + triangleOrder.byteLength + bounds.byteLength
        + left.byteLength + right.byteLength + start.byteLength + count.byteLength,
    },
    positions,
    closestSurface(point) {
      return closestSurface(point);
    },
    signedDistance(point) {
      const closest = closestSurface(point);
      if (!closest || !Number.isFinite(closest.distance)) return Number.NaN;
      if (closest.distance <= 1e-5) return 0;
      return rayIntersections(point) % 2 === 1 ? -closest.distance : closest.distance;
    },
    release() {
      released = true;
    },
  };
}
