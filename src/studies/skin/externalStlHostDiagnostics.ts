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
  readonly boundaryLoopCount: number;
  readonly nonManifoldEdgeCount: number;
  readonly orientationInconsistencyEdgeCount: number;
  readonly watertightDiagnostic: HostWatertightDiagnostic;
}

export type HostBoundaryFillability = "PLAUSIBLE_LOCAL" | "NOT_PLAUSIBLE" | "UNKNOWN";

export interface HostBoundaryLoopDiagnostic {
  readonly loopIndex: number;
  readonly edgeCount: number;
  /** Welded vertex ids in deterministic ascending order. */
  readonly vertexIndices: readonly number[];
  /** Boundary-edge directions as emitted by the existing triangle winding. */
  readonly directedEdges: readonly (readonly [number, number])[];
  /** Positions corresponding to vertexIndices, retained for explicit repair. */
  readonly vertexPositions: readonly HostVec3[];
  readonly perimeter: number;
  readonly bounds: HostBounds;
  readonly center: HostVec3;
  readonly planarDeviation: number;
  readonly fillability: HostBoundaryFillability;
  readonly localMinimal: "YES" | "NO" | "UNKNOWN";
  readonly silhouetteImpact: "NOT_ASSESSED";
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
  readonly validTriangleIndices: readonly number[];
  readonly boundaryLoops: readonly HostBoundaryLoopDiagnostic[];
  readonly normals: HostNormalStatistics;
}

interface EdgeRecord {
  readonly triangles: number[];
  readonly directions: number[];
  readonly vertices: readonly [number, number];
  readonly directedVertices: Array<readonly [number, number]>;
}

interface WeldedTopology {
  readonly topology: HostTopologyDiagnostics;
  readonly validTriangleIndices: readonly number[];
  readonly edges: ReadonlyMap<string, EdgeRecord>;
  readonly weldedVertices: readonly HostVec3[];
  readonly boundaryLoops: readonly HostBoundaryLoopDiagnostic[];
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

function weldPositions(positions: Float64Array, tolerance: number): { indices: Int32Array; count: number; vertices: readonly HostVec3[] } {
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
  return { indices, count: vertices.length, vertices };
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
    record.directedVertices.push([left, right]);
  } else {
    edges.set(key, {
      triangles: [triangle],
      directions: [direction],
      vertices: [Math.min(left, right), Math.max(left, right)],
      directedVertices: [[left, right]],
    });
  }
}

function distance(left: HostVec3, right: HostVec3): number {
  return Math.sqrt(squaredDistance(left, right));
}

function loopBounds(vertices: readonly HostVec3[]): HostBounds {
  return finiteBounds(Float64Array.from(vertices.flatMap((point) => [point.x, point.y, point.z])));
}

function loopPlanarDeviation(vertices: readonly HostVec3[], tolerance: number): number {
  if (vertices.length < 3) return Infinity;
  const first = vertices[0];
  let normal: HostVec3 | null = null;
  for (let left = 1; left < vertices.length && !normal; left += 1) {
    const ab = {
      x: vertices[left].x - first.x,
      y: vertices[left].y - first.y,
      z: vertices[left].z - first.z,
    };
    for (let right = left + 1; right < vertices.length; right += 1) {
      const ac = {
        x: vertices[right].x - first.x,
        y: vertices[right].y - first.y,
        z: vertices[right].z - first.z,
      };
      const cross = {
        x: ab.y * ac.z - ab.z * ac.y,
        y: ab.z * ac.x - ab.x * ac.z,
        z: ab.x * ac.y - ab.y * ac.x,
      };
      const length = Math.hypot(cross.x, cross.y, cross.z);
      if (length > tolerance * tolerance) {
        normal = { x: cross.x / length, y: cross.y / length, z: cross.z / length };
        break;
      }
    }
  }
  if (!normal) return Infinity;
  let maximum = 0;
  for (const point of vertices) {
    maximum = Math.max(maximum, Math.abs(
      (point.x - first.x) * normal.x
      + (point.y - first.y) * normal.y
      + (point.z - first.z) * normal.z,
    ));
  }
  return maximum;
}

function characterizeBoundaryLoops(
  edges: ReadonlyMap<string, EdgeRecord>,
  weldedVertices: readonly HostVec3[],
  modelScale: number,
  tolerance: number,
): HostBoundaryLoopDiagnostic[] {
  const boundaryEdges = Array.from(edges.values()).filter((edge) => edge.triangles.length === 1);
  const adjacency = new Map<number, number[]>();
  boundaryEdges.forEach((edge, index) => {
    for (const vertex of edge.vertices) {
      const list = adjacency.get(vertex);
      if (list) list.push(index);
      else adjacency.set(vertex, [index]);
    }
  });
  const visited = new Set<number>();
  const loops: HostBoundaryLoopDiagnostic[] = [];
  for (let seed = 0; seed < boundaryEdges.length; seed += 1) {
    if (visited.has(seed)) continue;
    const queue = [seed];
    const componentEdges: number[] = [];
    const componentVertices = new Set<number>();
    while (queue.length > 0) {
      const edgeIndex = queue.pop()!;
      if (visited.has(edgeIndex)) continue;
      visited.add(edgeIndex);
      componentEdges.push(edgeIndex);
      const edge = boundaryEdges[edgeIndex];
      for (const vertex of edge.vertices) {
        componentVertices.add(vertex);
        for (const adjacent of adjacency.get(vertex) ?? []) if (!visited.has(adjacent)) queue.push(adjacent);
      }
    }
    const vertices = Array.from(componentVertices, (index) => weldedVertices[index]);
    const vertexIndices = Array.from(componentVertices).sort((left, right) => left - right);
    const directedEdges = componentEdges.map((edgeIndex) => boundaryEdges[edgeIndex].directedVertices[0]);
    const bounds = loopBounds(vertices);
    const span = longestDimension(bounds);
    const perimeter = componentEdges.reduce((sum, edgeIndex) => {
      const edge = boundaryEdges[edgeIndex];
      return sum + distance(weldedVertices[edge.vertices[0]], weldedVertices[edge.vertices[1]]);
    }, 0);
    const planarDeviation = loopPlanarDeviation(vertices, tolerance);
    const closed = vertices.every((vertex) => (adjacency.get(weldedVertices.indexOf(vertex))?.length ?? 0) === 2);
    const planar = Number.isFinite(planarDeviation) && planarDeviation <= Math.max(tolerance * 4, span * 1e-4);
    const fillability: HostBoundaryFillability = closed && vertices.length >= 3 && planar
      ? "PLAUSIBLE_LOCAL"
      : closed ? "UNKNOWN" : "NOT_PLAUSIBLE";
    loops.push({
      loopIndex: loops.length,
      edgeCount: componentEdges.length,
      vertexIndices: Object.freeze(vertexIndices),
      directedEdges: Object.freeze(directedEdges),
      vertexPositions: Object.freeze(vertexIndices.map((index) => weldedVertices[index])),
      perimeter,
      bounds,
      center: {
        x: (bounds.min.x + bounds.max.x) / 2,
        y: (bounds.min.y + bounds.max.y) / 2,
        z: (bounds.min.z + bounds.max.z) / 2,
      },
      planarDeviation,
      fillability,
      localMinimal: fillability === "PLAUSIBLE_LOCAL" && span <= modelScale * 0.1 ? "YES" : "UNKNOWN",
      silhouetteImpact: "NOT_ASSESSED",
    });
  }
  return loops;
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
  const boundaryLoops = characterizeBoundaryLoops(edges, welded.vertices, scale, tolerance);
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
      boundaryLoopCount: boundaryLoops.length,
      nonManifoldEdgeCount,
      orientationInconsistencyEdgeCount,
      watertightDiagnostic,
    },
    validTriangleIndices: Object.freeze(validTriangles),
    edges,
    weldedVertices: welded.vertices,
    boundaryLoops,
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
    validTriangleIndices: welded.validTriangleIndices,
    boundaryLoops: welded.boundaryLoops,
    normals,
  };
}
