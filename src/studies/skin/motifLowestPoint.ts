import type { Patch, PatchPoint, PatchShape } from "./field.ts";
import { internalGraphReachesPoint } from "./surfaceAngleDiagnosis.ts";
import type { InternalStructureGraph, Vector3Value } from "./voronoi.ts";

export interface MotifLowestPoint {
  patchId: number;
  shape: PatchShape;
  sourcePointIndex?: number;
  position: Vector3Value;
  /** Outward final-mesh normal at this marker when basis=finalMesh. */
  normal?: Vector3Value;
  markerRadius: number;
  reachedByInternal: boolean;
  basis: "sourceSphere" | "finalMesh";
}

interface IndexedPoint {
  point: PatchPoint;
  index: number;
}

/**
 * One deliberately simple low-point proxy per authored motif.
 *
 * SKIN motifs are realized as sphere sets, so the lowest envelope sample is
 * min(point.z - point.r). Relational bridge/surfaceConnector spheres are not
 * part of the flower/coin/ring itself and are ignored unless a legacy patch
 * contains nothing else. Internal reach means an edge tube overlaps the
 * sphere that owns this low point; it is not a slicer island or support proof.
 */
export function findMotifLowestPoints(
  patches: Patch[],
  internalGraph: InternalStructureGraph | null,
  contactTolerance = 0.02,
): MotifLowestPoint[] {
  const tolerance = Math.max(0, Number.isFinite(contactTolerance) ? contactTolerance : 0.02);
  const result: MotifLowestPoint[] = [];
  for (const patch of patches) {
    if (patch.points.length === 0) continue;
    const ownPoints: IndexedPoint[] = patch.points
      .map((point, index) => ({ point, index }))
      .filter(({ point }) => point.role !== "bridge" && point.role !== "surfaceConnector");
    const candidates = ownPoints.length > 0
      ? ownPoints
      : patch.points.map((point, index) => ({ point, index }));
    let lowest = candidates[0];
    for (const candidate of candidates.slice(1)) {
      if (candidate.point.z - candidate.point.r < lowest.point.z - lowest.point.r) lowest = candidate;
    }
    const point = lowest.point;
    result.push({
      patchId: patch.id,
      shape: patch.shape,
      sourcePointIndex: lowest.index,
      position: { x: point.x, y: point.y, z: point.z - point.r },
      markerRadius: Math.max(0.025, Math.min(0.06, point.r * 0.3)),
      reachedByInternal: internalGraphReachesPoint(point, internalGraph, tolerance, point.r),
      basis: "sourceSphere",
    });
  }
  return result;
}

interface MeshPatchCandidate {
  patch: Patch;
  points: PatchPoint[];
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/**
 * Attribute vertices of the already-built final Surface mesh to the patch
 * with the smallest local sphere field, then keep the lowest attributed
 * vertex per patch. Spatial hashing avoids a meshVertices × allPatches scan.
 * Ownership inside a smooth-min overlap is still an attribution heuristic;
 * the marker position itself is an actual final-mesh vertex.
 */
export function findMotifMeshLowestPoints(
  positions: Float32Array,
  patches: Patch[],
  internalGraph: InternalStructureGraph | null,
  meshStep: number,
  roundK: number,
  normals?: Float32Array,
): MotifLowestPoint[] {
  const step = Math.max(1e-6, Math.abs(meshStep));
  const influence = Math.max(step * 2, Math.max(0, roundK));
  const candidates: MeshPatchCandidate[] = [];
  for (const patch of patches) {
    const own = patch.points.filter((point) => point.role !== "bridge" && point.role !== "surfaceConnector");
    const points = own.length > 0 ? own : patch.points;
    if (points.length === 0) continue;
    candidates.push({
      patch,
      points,
      minX: Math.min(...points.map((point) => point.x - point.r - influence)),
      minY: Math.min(...points.map((point) => point.y - point.r - influence)),
      minZ: Math.min(...points.map((point) => point.z - point.r - influence)),
      maxX: Math.max(...points.map((point) => point.x + point.r + influence)),
      maxY: Math.max(...points.map((point) => point.y + point.r + influence)),
      maxZ: Math.max(...points.map((point) => point.z + point.r + influence)),
    });
  }
  if (candidates.length === 0 || positions.length < 3) return [];
  const spans = candidates
    .map((candidate) => Math.max(candidate.maxX - candidate.minX, candidate.maxY - candidate.minY, candidate.maxZ - candidate.minZ))
    .sort((a, b) => a - b);
  const cellSize = Math.max(step * 3, Math.min(0.5, spans[Math.floor(spans.length / 2)] || 0.2));
  const cell = (value: number) => Math.floor(value / cellSize);
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const patchGrid = new Map<string, number[]>();
  for (const [index, candidate] of candidates.entries()) {
    for (let ix = cell(candidate.minX); ix <= cell(candidate.maxX); ix++) {
      for (let iy = cell(candidate.minY); iy <= cell(candidate.maxY); iy++) {
        for (let iz = cell(candidate.minZ); iz <= cell(candidate.maxZ); iz++) {
          const gridKey = key(ix, iy, iz);
          const list = patchGrid.get(gridKey);
          if (list) list.push(index);
          else patchGrid.set(gridKey, [index]);
        }
      }
    }
  }
  const lowest = new Map<number, { position: Vector3Value; normal?: Vector3Value }>();
  for (let offset = 0; offset + 2 < positions.length; offset += 3) {
    const x = positions[offset];
    const y = positions[offset + 1];
    const z = positions[offset + 2];
    const nearby = patchGrid.get(key(cell(x), cell(y), cell(z)));
    if (!nearby) continue;
    let ownerIndex = -1;
    let ownerDistance = Infinity;
    for (const candidateIndex of nearby) {
      const candidate = candidates[candidateIndex];
      if (x < candidate.minX || x > candidate.maxX || y < candidate.minY || y > candidate.maxY || z < candidate.minZ || z > candidate.maxZ) continue;
      let distance = Infinity;
      for (const point of candidate.points) {
        distance = Math.min(distance, Math.hypot(x - point.x, y - point.y, z - point.z) - point.r);
      }
      if (distance <= influence && distance < ownerDistance) {
        ownerDistance = distance;
        ownerIndex = candidateIndex;
      }
    }
    if (ownerIndex < 0) continue;
    const patchId = candidates[ownerIndex].patch.id;
    const previous = lowest.get(patchId);
    if (!previous || z < previous.position.z) {
      let normal: Vector3Value | undefined;
      if (normals && normals.length >= offset + 3) {
        const nx = normals[offset];
        const ny = normals[offset + 1];
        const nz = normals[offset + 2];
        const length = Math.hypot(nx, ny, nz);
        if (length > 1e-8) normal = { x: nx / length, y: ny / length, z: nz / length };
      }
      lowest.set(patchId, { position: { x, y, z }, normal });
    }
  }
  const markerRadius = Math.max(0.02, Math.min(0.055, step * 0.8));
  const contactTolerance = step * 1.75;
  return candidates.flatMap(({ patch }) => {
    const sample = lowest.get(patch.id);
    if (!sample) return [];
    return [{
      patchId: patch.id,
      shape: patch.shape,
      position: sample.position,
      normal: sample.normal,
      markerRadius,
      reachedByInternal: internalGraphReachesPoint(sample.position, internalGraph, contactTolerance),
      basis: "finalMesh" as const,
    }];
  });
}
