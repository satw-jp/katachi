import type { HostBounds, HostVec3, ParsedHostMesh, ParsedRawStlMesh } from "./externalStlHost.ts";

export type HostWatertightDiagnostic = "CLOSED CANDIDATE" | "OPEN" | "NON-MANIFOLD" | "UNKNOWN";

export interface HostTopologyDiagnostics {
  readonly triangleCount: number;
  readonly validTriangleCount: number;
  readonly degenerateTriangleCount: number;
  readonly weldedVertexCount: number;
  readonly weldTolerance: number;
  readonly connectedComponentCount: number;
  readonly boundaryEdgeCount: number;
  readonly nonManifoldEdgeCount: number;
  readonly orientationInconsistencyEdgeCount: number;
  readonly watertightDiagnostic: HostWatertightDiagnostic;
}

export interface HostNormalThresholdStatistic {
  readonly thresholdDeg: number;
  readonly count: number;
  readonly fraction: number;
}

export interface HostNormalStatistics {
  readonly adjacentEdgeCount: number;
  readonly medianDihedralDeg: number | null;
  readonly p90DihedralDeg: number | null;
  readonly p95DihedralDeg: number | null;
  readonly maximumDihedralDeg: number | null;
  readonly thresholds: readonly HostNormalThresholdStatistic[];
}

export interface HostMeshDiagnostics {
  readonly sourceBounds: HostBounds;
  readonly topology: HostTopologyDiagnostics;
  readonly normals: HostNormalStatistics;
}

interface EdgeRecord {
  readonly triangles: number[];
  readonly directions: number[];
}

interface WeldedTopology {
  readonly topology: HostTopologyDiagnostics;
  readonly edges: ReadonlyMap<string, EdgeRecord>;
}

interface UnionFind {
  find(value: number): number;
  union(left: number, right: number): void;
}

function unionFind(size: number): UnionFind {
  const parent = new Int32Array(size);
  const rank = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) parent[index] = index;
  const find = (value: number): number => {
    let root = value;
    while (parent[root] !== root) root = parent[root];
    while (parent[value] !== value) {
      const next = parent[value];
      parent[value] = root;
      value = next;
    }
    return root;
  };
  return {
    find,
    union(left, right) {
      const leftRoot = find(left);
      const rightRoot = find(right);
      if (leftRoot === rightRoot) return;
      if (rank[leftRoot] < rank[rightRoot]) parent[leftRoot] = rightRoot;
      else if (rank[leftRoot] > rank[rightRoot]) parent[rightRoot] = leftRoot;
      else {
        parent[rightRoot] = leftRoot;
        rank[leftRoot] += 1;
      }
    },
  };
}

function finiteBounds(positions: Float64Array): HostBounds {
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (let index = 0; index < positions.length; index += 3) {
    minX = Math.min(minX, positions[index]);
    minY = Math.min(minY, positions[index + 1]);
    minZ = Math.min(minZ, positions[index + 2]);
    maxX = Math.max(maxX, positions[index]);
    maxY = Math.max(maxY, positions[index + 1]);
    maxZ = Math.max(maxZ, positions[index + 2]);
  }
  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  };
}

function longestDimension(bounds: HostBounds): number {
  return Math.max(
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z,
  );
}

function defaultWeldTolerance(positions: Float64Array): number {
  const longest = longestDimension(finiteBounds(positions));
  return longest > 0 ? longest * 1e-7 : 1e-9;
}

function cellKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function squaredDistance(left: HostVec3, right: HostVec3): number {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  const dz = left.z - right.z;
  return dx * dx + dy * dy + dz * dz;
}

function weldPositions(positions: Float64Array, tolerance: number): { indices: Int32Array; count: number } {
  const toleranceSquared = tolerance * tolerance;
  const vertices: HostVec3[] = [];
  const buckets = new Map<string, number[]>();
  const indices = new Int32Array(positions.length / 3);
  const add = (point: HostVec3): number => {
    const cellX = Math.floor(point.x / tolerance);
    const cellY = Math.floor(point.y / tolerance);
    const cellZ = Math.floor(point.z / tolerance);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const candidates = buckets.get(cellKey(cellX + dx, cellY + dy, cellZ + dz));
          if (!candidates) continue;
          for (const candidate of candidates) {
            if (squaredDistance(vertices[candidate], point) <= toleranceSquared) return candidate;
          }
        }
      }
    }
    const index = vertices.length;
    vertices.push(point);
    const key = cellKey(cellX, cellY, cellZ);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(index);
    else buckets.set(key, [index]);
    return index;
  };
  for (let index = 0; index < indices.length; index += 1) {
    indices[index] = add({ x: positions[index * 3], y: positions[index * 3 + 1], z: positions[index * 3 + 2] });
  }
  return { indices, count: vertices.length };
}

function edgeKey(left: number, right: number): string {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

function recordEdge(edges: Map<string, EdgeRecord>, left: number, right: number, triangle: number): void {
  const key = edgeKey(left, right);
  const record = edges.get(key);
  const direction = left < right ? 1 : -1;
  if (record) {
    record.triangles.push(triangle);
    record.directions.push(direction);
  } else {
    edges.set(key, { triangles: [triangle], directions: [direction] });
  }
}

function triangleCrossSquared(positions: Float64Array, triangle: number): number {
  const offset = triangle * 9;
  const abx = positions[offset + 3] - positions[offset];
  const aby = positions[offset + 4] - positions[offset + 1];
  const abz = positions[offset + 5] - positions[offset + 2];
  const acx = positions[offset + 6] - positions[offset];
  const acy = positions[offset + 7] - positions[offset + 1];
  const acz = positions[offset + 8] - positions[offset + 2];
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  return nx * nx + ny * ny + nz * nz;
}

function analyzeWeldedTopology(positions: Float64Array, triangleCount: number, tolerance: number): WeldedTopology {
  const welded = weldPositions(positions, tolerance);
  const bounds = finiteBounds(positions);
  const scale = longestDimension(bounds);
  // Cross products have length^2 units, so their squared magnitude scales as length^4.
  // Keeping the threshold dimensionally aligned makes diagnostics invariant to an
  // explicit source-unit conversion such as mmPerSourceUnit = 10.
  const degeneracyThreshold = scale > 0 ? scale ** 4 * 1e-24 : 0;
  const validTriangles: number[] = [];
  let degenerateTriangleCount = 0;
  const edges = new Map<string, EdgeRecord>();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const vertexOffset = triangle * 3;
    const a = welded.indices[vertexOffset];
    const b = welded.indices[vertexOffset + 1];
    const c = welded.indices[vertexOffset + 2];
    const degenerate = a === b || b === c || c === a || triangleCrossSquared(positions, triangle) <= degeneracyThreshold;
    if (degenerate) {
      degenerateTriangleCount += 1;
      continue;
    }
    validTriangles.push(triangle);
    recordEdge(edges, a, b, triangle);
    recordEdge(edges, b, c, triangle);
    recordEdge(edges, c, a, triangle);
  }

  const triangleToValidIndex = new Map<number, number>();
  validTriangles.forEach((triangle, index) => triangleToValidIndex.set(triangle, index));
  const components = unionFind(validTriangles.length);
  let boundaryEdgeCount = 0;
  let nonManifoldEdgeCount = 0;
  let orientationInconsistencyEdgeCount = 0;
  for (const record of edges.values()) {
    if (record.triangles.length === 1) boundaryEdgeCount += 1;
    if (record.triangles.length > 2) nonManifoldEdgeCount += 1;
    if (record.triangles.length === 2) {
      const left = triangleToValidIndex.get(record.triangles[0]);
      const right = triangleToValidIndex.get(record.triangles[1]);
      if (left !== undefined && right !== undefined) components.union(left, right);
      if (record.directions[0] === record.directions[1]) orientationInconsistencyEdgeCount += 1;
    }
  }
  const roots = new Set<number>();
  for (let index = 0; index < validTriangles.length; index += 1) roots.add(components.find(index));
  const watertightDiagnostic = validTriangles.length === 0
    ? "UNKNOWN"
    : nonManifoldEdgeCount > 0
      ? "NON-MANIFOLD"
      : boundaryEdgeCount > 0
        ? "OPEN"
        : "CLOSED CANDIDATE";
  return {
    topology: {
      triangleCount,
      validTriangleCount: validTriangles.length,
      degenerateTriangleCount,
      weldedVertexCount: welded.count,
      weldTolerance: tolerance,
      connectedComponentCount: roots.size,
      boundaryEdgeCount,
      nonManifoldEdgeCount,
      orientationInconsistencyEdgeCount,
      watertightDiagnostic,
    },
    edges,
  };
}

function percentile(sorted: readonly number[], fraction: number): number | null {
  if (sorted.length === 0) return null;
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const amount = index - lower;
  return sorted[lower] * (1 - amount) + sorted[upper] * amount;
}

function normalStatistics(mesh: ParsedHostMesh, edges: ReadonlyMap<string, EdgeRecord>): HostNormalStatistics {
  const angles: number[] = [];
  for (const record of edges.values()) {
    if (record.triangles.length !== 2) continue;
    const left = record.triangles[0] * 3;
    const right = record.triangles[1] * 3;
    const dotProduct = Math.max(-1, Math.min(1,
      mesh.geometricNormals[left] * mesh.geometricNormals[right]
      + mesh.geometricNormals[left + 1] * mesh.geometricNormals[right + 1]
      + mesh.geometricNormals[left + 2] * mesh.geometricNormals[right + 2],
    ));
    angles.push(Math.acos(dotProduct) * 180 / Math.PI);
  }
  angles.sort((left, right) => left - right);
  const thresholds = [30, 45, 60].map((thresholdDeg) => {
    const count = angles.filter((angle) => angle > thresholdDeg).length;
    return { thresholdDeg, count, fraction: angles.length === 0 ? 0 : count / angles.length };
  });
  return {
    adjacentEdgeCount: angles.length,
    medianDihedralDeg: percentile(angles, 0.5),
    p90DihedralDeg: percentile(angles, 0.9),
    p95DihedralDeg: percentile(angles, 0.95),
    maximumDihedralDeg: percentile(angles, 1),
    thresholds,
  };
}

export function characterizeHostMesh(
  mesh: ParsedHostMesh | ParsedRawStlMesh,
  weldTolerance = defaultWeldTolerance(mesh.positions),
): HostMeshDiagnostics {
  if (!(weldTolerance > 0) || !Number.isFinite(weldTolerance)) throw new Error("weldTolerance must be positive and finite");
  const welded = analyzeWeldedTopology(mesh.positions, mesh.triangleCount, weldTolerance);
  const normals = "geometricNormals" in mesh
    ? normalStatistics(mesh, welded.edges)
    : {
        adjacentEdgeCount: 0,
        medianDihedralDeg: null,
        p90DihedralDeg: null,
        p95DihedralDeg: null,
        maximumDihedralDeg: null,
        thresholds: [],
      };
  return {
    sourceBounds: finiteBounds(mesh.positions),
    topology: welded.topology,
    normals,
  };
}
