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

export interface PackedCandidateQueryTelemetry {
  readonly enabled: boolean;
  readonly closestSurfaceCalls: number;
  readonly signedDistanceCalls: number;
  readonly rayIntersectionCalls: number;
  readonly closestSurfaceNodesVisited: number;
  readonly closestSurfaceTrianglesTested: number;
  readonly rayIntersectionNodesVisited: number;
  readonly rayIntersectionTrianglesTested: number;
  readonly closestSurfaceMaxNodesVisited: number;
  readonly closestSurfaceMaxTrianglesTested: number;
  readonly rayIntersectionMaxNodesVisited: number;
  readonly rayIntersectionMaxTrianglesTested: number;
  /** Histogram-derived upper bounds; telemetry is intentionally bounded. */
  readonly closestSurfaceP50NodesVisited: number;
  readonly closestSurfaceP95NodesVisited: number;
  readonly closestSurfaceP50TrianglesTested: number;
  readonly closestSurfaceP95TrianglesTested: number;
  readonly rayIntersectionP50NodesVisited: number;
  readonly rayIntersectionP95NodesVisited: number;
  readonly rayIntersectionP50TrianglesTested: number;
  readonly rayIntersectionP95TrianglesTested: number;
}

export interface PackedCandidateQuery {
  readonly stats: PackedCandidateQueryStats;
  readonly positions: Float32Array;
  closestSurface(point: HostVec3): { distance: number; triangleIndex: number } | null;
  signedDistance(point: HostVec3): number;
  resetTelemetry(): void;
  readTelemetry(): PackedCandidateQueryTelemetry;
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
  options: { telemetry?: boolean } = {},
): PackedCandidateQuery {
  if (positions.length === 0 || positions.length % 9 !== 0) throw new Error("Packed candidate positions must contain triangles");
  const triangleCount = positions.length / 9;
  const leafCount = Math.ceil(triangleCount / LEAF_SIZE);
  const nodeCount = leafCount * 2 - 1;
  const triangleOrder = new Uint32Array(triangleCount);
  for (let index = 0; index < triangleCount; index += 1) triangleOrder[index] = index;
  let centroids: Float32Array | null = new Float32Array(triangleCount * 3);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const source = triangle * 9;
    const centroid = triangle * 3;
    centroids[centroid] = (positions[source] + positions[source + 3] + positions[source + 6]) / 3;
    centroids[centroid + 1] = (positions[source + 1] + positions[source + 4] + positions[source + 7]) / 3;
    centroids[centroid + 2] = (positions[source + 2] + positions[source + 5] + positions[source + 8]) / 3;
  }
  const bounds = new Float32Array(nodeCount * 6);
  const left = new Int32Array(nodeCount); left.fill(-1);
  const right = new Int32Array(nodeCount); right.fill(-1);
  const start = new Uint32Array(nodeCount);
  const count = new Uint32Array(nodeCount);
  const subtreeLeafCounts = new Uint32Array(nodeCount);
  for (let leaf = 0; leaf < leafCount; leaf += 1) subtreeLeafCounts[leafCount - 1 + leaf] = 1;
  for (let node = leafCount - 2; node >= 0; node -= 1) {
    subtreeLeafCounts[node] = subtreeLeafCounts[node * 2 + 1] + subtreeLeafCounts[node * 2 + 2];
  }
  const compareTriangles = (first: number, second: number, axis: number): number => {
    const centroidData = centroids!;
    const difference = centroidData[first * 3 + axis] - centroidData[second * 3 + axis];
    return difference !== 0 ? difference : first - second;
  };
  const selectKth = (first: number, last: number, kth: number, axis: number): void => {
    let low = first;
    let high = last - 1;
    while (low < high) {
      const pivot = triangleOrder[low + ((high - low) >> 1)];
      let leftIndex = low;
      let rightIndex = high;
      while (leftIndex <= rightIndex) {
        while (compareTriangles(triangleOrder[leftIndex], pivot, axis) < 0) leftIndex += 1;
        while (compareTriangles(triangleOrder[rightIndex], pivot, axis) > 0) rightIndex -= 1;
        if (leftIndex <= rightIndex) {
          const value = triangleOrder[leftIndex];
          triangleOrder[leftIndex] = triangleOrder[rightIndex];
          triangleOrder[rightIndex] = value;
          leftIndex += 1;
          rightIndex -= 1;
        }
      }
      if (kth <= rightIndex) high = rightIndex;
      else if (kth >= leftIndex) low = leftIndex;
      else return;
    }
  };
  let leavesBuilt = 0;
  const buildNode = (node: number, first: number, last: number): void => {
    const leaf = node >= leafCount - 1;
    if (!leaf) {
      const childLeft = node * 2 + 1;
      const childRight = childLeft + 1;
      left[node] = childLeft;
      right[node] = childRight;
      const leftCapacity = subtreeLeafCounts[childLeft] * LEAF_SIZE;
      const middle = Math.min(last - 1, first + leftCapacity);
      let minX = Infinity; let minY = Infinity; let minZ = Infinity;
      let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
      for (let index = first; index < last; index += 1) {
        const triangle = triangleOrder[index];
        const centroid = triangle * 3;
        minX = Math.min(minX, centroids![centroid]); maxX = Math.max(maxX, centroids![centroid]);
        minY = Math.min(minY, centroids![centroid + 1]); maxY = Math.max(maxY, centroids![centroid + 1]);
        minZ = Math.min(minZ, centroids![centroid + 2]); maxZ = Math.max(maxZ, centroids![centroid + 2]);
      }
      const spanX = maxX - minX; const spanY = maxY - minY; const spanZ = maxZ - minZ;
      const axis = spanY > spanX && spanY >= spanZ ? 1 : spanZ > spanX && spanZ > spanY ? 2 : 0;
      if (middle > first && middle < last) selectKth(first, last, middle, axis);
      buildNode(childLeft, first, middle);
      buildNode(childRight, middle, last);
      const output = node * 6; const a = childLeft * 6; const b = childRight * 6;
      bounds[output] = Math.min(bounds[a], bounds[b]); bounds[output + 1] = Math.min(bounds[a + 1], bounds[b + 1]); bounds[output + 2] = Math.min(bounds[a + 2], bounds[b + 2]);
      bounds[output + 3] = Math.max(bounds[a + 3], bounds[b + 3]); bounds[output + 4] = Math.max(bounds[a + 4], bounds[b + 4]); bounds[output + 5] = Math.max(bounds[a + 5], bounds[b + 5]);
      start[node] = Math.min(start[childLeft], start[childRight]);
      count[node] = count[childLeft] + count[childRight];
      return;
    }
    const output = node * 6;
    start[node] = first;
    count[node] = last - first;
    bounds[output] = Infinity; bounds[output + 1] = Infinity; bounds[output + 2] = Infinity;
    bounds[output + 3] = -Infinity; bounds[output + 4] = -Infinity; bounds[output + 5] = -Infinity;
    for (let index = first; index < last; index += 1) {
      const triangle = triangleOrder[index];
      const values = triangleBounds(positions, triangle);
      bounds[output] = Math.min(bounds[output], values[0]); bounds[output + 1] = Math.min(bounds[output + 1], values[1]); bounds[output + 2] = Math.min(bounds[output + 2], values[2]);
      bounds[output + 3] = Math.max(bounds[output + 3], values[3]); bounds[output + 4] = Math.max(bounds[output + 4], values[4]); bounds[output + 5] = Math.max(bounds[output + 5], values[5]);
    }
    leavesBuilt += 1;
    if (leavesBuilt % 1024 === 0 || leavesBuilt === leafCount) onProgress?.("Building Candidate query", leavesBuilt, leafCount);
  };
  buildNode(0, 0, triangleCount);
  centroids = null;
  onProgress?.("Building Candidate query", leafCount, leafCount);
  let released = false;
  const telemetryEnabled = options.telemetry === true;
  const telemetry = {
    closestSurfaceCalls: 0,
    signedDistanceCalls: 0,
    rayIntersectionCalls: 0,
    closestSurfaceNodesVisited: 0,
    closestSurfaceTrianglesTested: 0,
    rayIntersectionNodesVisited: 0,
    rayIntersectionTrianglesTested: 0,
    closestSurfaceMaxNodesVisited: 0,
    closestSurfaceMaxTrianglesTested: 0,
    rayIntersectionMaxNodesVisited: 0,
    rayIntersectionMaxTrianglesTested: 0,
    closestSurfaceNodeHistogram: new Uint32Array(32),
    closestSurfaceTriangleHistogram: new Uint32Array(32),
    rayIntersectionNodeHistogram: new Uint32Array(32),
    rayIntersectionTriangleHistogram: new Uint32Array(32),
  };
  const resetTelemetry = (): void => {
    telemetry.closestSurfaceCalls = 0;
    telemetry.signedDistanceCalls = 0;
    telemetry.rayIntersectionCalls = 0;
    telemetry.closestSurfaceNodesVisited = 0;
    telemetry.closestSurfaceTrianglesTested = 0;
    telemetry.rayIntersectionNodesVisited = 0;
    telemetry.rayIntersectionTrianglesTested = 0;
    telemetry.closestSurfaceMaxNodesVisited = 0;
    telemetry.closestSurfaceMaxTrianglesTested = 0;
    telemetry.rayIntersectionMaxNodesVisited = 0;
    telemetry.rayIntersectionMaxTrianglesTested = 0;
    telemetry.closestSurfaceNodeHistogram.fill(0);
    telemetry.closestSurfaceTriangleHistogram.fill(0);
    telemetry.rayIntersectionNodeHistogram.fill(0);
    telemetry.rayIntersectionTriangleHistogram.fill(0);
  };
  const histogramBin = (value: number): number => Math.min(31, 31 - Math.clz32(Math.max(1, value)));
  const percentileUpperBound = (histogram: Uint32Array, calls: number, fraction: number): number => {
    if (calls <= 0) return 0;
    const target = Math.max(1, Math.ceil(calls * fraction));
    let cumulative = 0;
    for (let index = 0; index < histogram.length; index += 1) {
      cumulative += histogram[index];
      if (cumulative >= target) return index >= 31 ? 2 ** 31 : 2 ** index;
    }
    return 2 ** 31;
  };
  const readTelemetry = (): PackedCandidateQueryTelemetry => ({
    enabled: telemetryEnabled,
    closestSurfaceCalls: telemetry.closestSurfaceCalls,
    signedDistanceCalls: telemetry.signedDistanceCalls,
    rayIntersectionCalls: telemetry.rayIntersectionCalls,
    closestSurfaceNodesVisited: telemetry.closestSurfaceNodesVisited,
    closestSurfaceTrianglesTested: telemetry.closestSurfaceTrianglesTested,
    rayIntersectionNodesVisited: telemetry.rayIntersectionNodesVisited,
    rayIntersectionTrianglesTested: telemetry.rayIntersectionTrianglesTested,
    closestSurfaceMaxNodesVisited: telemetry.closestSurfaceMaxNodesVisited,
    closestSurfaceMaxTrianglesTested: telemetry.closestSurfaceMaxTrianglesTested,
    rayIntersectionMaxNodesVisited: telemetry.rayIntersectionMaxNodesVisited,
    rayIntersectionMaxTrianglesTested: telemetry.rayIntersectionMaxTrianglesTested,
    closestSurfaceP50NodesVisited: percentileUpperBound(telemetry.closestSurfaceNodeHistogram, telemetry.closestSurfaceCalls, 0.5),
    closestSurfaceP95NodesVisited: percentileUpperBound(telemetry.closestSurfaceNodeHistogram, telemetry.closestSurfaceCalls, 0.95),
    closestSurfaceP50TrianglesTested: percentileUpperBound(telemetry.closestSurfaceTriangleHistogram, telemetry.closestSurfaceCalls, 0.5),
    closestSurfaceP95TrianglesTested: percentileUpperBound(telemetry.closestSurfaceTriangleHistogram, telemetry.closestSurfaceCalls, 0.95),
    rayIntersectionP50NodesVisited: percentileUpperBound(telemetry.rayIntersectionNodeHistogram, telemetry.rayIntersectionCalls, 0.5),
    rayIntersectionP95NodesVisited: percentileUpperBound(telemetry.rayIntersectionNodeHistogram, telemetry.rayIntersectionCalls, 0.95),
    rayIntersectionP50TrianglesTested: percentileUpperBound(telemetry.rayIntersectionTriangleHistogram, telemetry.rayIntersectionCalls, 0.5),
    rayIntersectionP95TrianglesTested: percentileUpperBound(telemetry.rayIntersectionTriangleHistogram, telemetry.rayIntersectionCalls, 0.95),
  });
  const assertLive = (): void => { if (released) throw new Error("Packed Candidate query has been released"); };
  // Both traversals are synchronous and never re-enter the query, so one
  // fixed stack removes millions of short-lived Array allocations during
  // Support audits without changing child visitation order.
  const traversalStack = new Int32Array(nodeCount);
  const closestSurface = (point: HostVec3): { distance: number; triangleIndex: number } | null => {
    assertLive();
    let bestSquared = Infinity; let bestTriangle = -1; let nodesVisited = 0; let trianglesTested = 0;
    let stackSize = 1;
    traversalStack[0] = 0;
    while (stackSize > 0) {
      const node = traversalStack[--stackSize];
      nodesVisited += 1;
      if (pointAabbDistanceSquared(point, bounds, node * 6) > bestSquared + EPSILON) continue;
      if (count[node] > 0 && left[node] < 0) {
        for (let index = start[node]; index < start[node] + count[node]; index += 1) {
          trianglesTested += 1;
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
          if (da < db) {
            traversalStack[stackSize++] = b;
            traversalStack[stackSize++] = a;
          } else {
            traversalStack[stackSize++] = a;
            traversalStack[stackSize++] = b;
          }
        }
      }
    }
    if (telemetryEnabled) {
      telemetry.closestSurfaceCalls += 1;
      telemetry.closestSurfaceNodesVisited += nodesVisited;
      telemetry.closestSurfaceTrianglesTested += trianglesTested;
      telemetry.closestSurfaceMaxNodesVisited = Math.max(telemetry.closestSurfaceMaxNodesVisited, nodesVisited);
      telemetry.closestSurfaceMaxTrianglesTested = Math.max(telemetry.closestSurfaceMaxTrianglesTested, trianglesTested);
      telemetry.closestSurfaceNodeHistogram[histogramBin(nodesVisited)] += 1;
      telemetry.closestSurfaceTriangleHistogram[histogramBin(trianglesTested)] += 1;
    }
    return bestTriangle < 0 ? null : { distance: Math.sqrt(bestSquared), triangleIndex: bestTriangle };
  };
  const rayIntersections = (point: HostVec3): number => {
    let hits = 0; let nodesVisited = 0; let trianglesTested = 0;
    let stackSize = 1;
    traversalStack[0] = 0;
    while (stackSize > 0) {
      const node = traversalStack[--stackSize];
      nodesVisited += 1;
      const box = node * 6;
      if (point.y < bounds[box + 1] - EPSILON || point.y > bounds[box + 4] + EPSILON
        || point.z < bounds[box + 2] - EPSILON || point.z > bounds[box + 5] + EPSILON
        || bounds[box + 3] <= point.x + EPSILON) continue;
      if (count[node] > 0 && left[node] < 0) {
        for (let index = start[node]; index < start[node] + count[node]; index += 1) {
          trianglesTested += 1;
          if (rayIntersectsTriangle(point, positions, triangleOrder[index])) hits += 1;
        }
      } else {
        if (left[node] >= 0) traversalStack[stackSize++] = left[node];
        if (right[node] >= 0) traversalStack[stackSize++] = right[node];
      }
    }
    if (telemetryEnabled) {
      telemetry.rayIntersectionCalls += 1;
      telemetry.rayIntersectionNodesVisited += nodesVisited;
      telemetry.rayIntersectionTrianglesTested += trianglesTested;
      telemetry.rayIntersectionMaxNodesVisited = Math.max(telemetry.rayIntersectionMaxNodesVisited, nodesVisited);
      telemetry.rayIntersectionMaxTrianglesTested = Math.max(telemetry.rayIntersectionMaxTrianglesTested, trianglesTested);
      telemetry.rayIntersectionNodeHistogram[histogramBin(nodesVisited)] += 1;
      telemetry.rayIntersectionTriangleHistogram[histogramBin(trianglesTested)] += 1;
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
      if (telemetryEnabled) telemetry.signedDistanceCalls += 1;
      const closest = closestSurface(point);
      if (!closest || !Number.isFinite(closest.distance)) return Number.NaN;
      if (closest.distance <= 1e-5) return 0;
      return rayIntersections(point) % 2 === 1 ? -closest.distance : closest.distance;
    },
    resetTelemetry,
    readTelemetry,
    release() {
      released = true;
    },
  };
}
