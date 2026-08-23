import type { Triangle } from "../cloud-sculpt/meshExport.ts";
import type { InternalStructureGraph, Vector3Value } from "./voronoi.ts";

export interface SurfaceAngleDiagnosisMetrics {
  thresholdDeg: number;
  surfaceArea: number;
  dangerousAreaBefore: number;
  dangerousAreaAfter: number;
  mitigatedArea: number;
  dangerousFaceCountBefore: number;
  dangerousFaceCountAfter: number;
  mitigatedFaceCount: number;
  contactTolerance: number;
}

export interface SurfaceAngleDiagnosisResult extends SurfaceAngleDiagnosisMetrics {
  beforeDangerPositions: Float32Array;
  afterDangerPositions: Float32Array;
  mitigatedPositions: Float32Array;
}

interface FaceMeasurement {
  area: number;
  centroid: Vector3Value;
  normal: Vector3Value;
}

const RAD_TO_DEG = 180 / Math.PI;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function measureFace(triangle: Triangle): FaceMeasurement {
  const abx = triangle.b.x - triangle.a.x;
  const aby = triangle.b.y - triangle.a.y;
  const abz = triangle.b.z - triangle.a.z;
  const acx = triangle.c.x - triangle.a.x;
  const acy = triangle.c.y - triangle.a.y;
  const acz = triangle.c.z - triangle.a.z;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  const crossLength = Math.hypot(nx, ny, nz);
  const length = crossLength || 1;
  return {
    area: crossLength * 0.5,
    centroid: {
      x: (triangle.a.x + triangle.b.x + triangle.c.x) / 3,
      y: (triangle.a.y + triangle.b.y + triangle.c.y) / 3,
      z: (triangle.a.z + triangle.b.z + triangle.c.z) / 3,
    },
    normal: { x: nx / length, y: ny / length, z: nz / length },
  };
}

/**
 * Simple FDM-style convention used only by this first diagnostic:
 * 0deg = vertical wall, 90deg = downward horizontal ceiling. Upward-facing
 * faces are not overhang candidates. Build direction is fixed to +Z.
 */
export function surfaceOverhangAngleDeg(normal: Vector3Value): number {
  if (normal.z >= 0) return 0;
  return Math.asin(clamp(-normal.z, 0, 1)) * RAD_TO_DEG;
}

function pointSegmentDistance(point: Vector3Value, start: Vector3Value, end: Vector3Value): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const lengthSq = dx * dx + dy * dy + dz * dz;
  const t = lengthSq <= 1e-16 ? 0 : clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy + (point.z - start.z) * dz) / lengthSq,
    0,
    1,
  );
  return Math.hypot(
    point.x - (start.x + dx * t),
    point.y - (start.y + dy * t),
    point.z - (start.z + dz * t),
  );
}

export function internalGraphReachesPoint(
  point: Vector3Value,
  graph: InternalStructureGraph | null,
  contactTolerance: number,
  pointRadius = 0,
): boolean {
  if (!graph || graph.edges.length === 0) return false;
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const edge of graph.edges) {
    const start = nodeById.get(edge.start);
    const end = nodeById.get(edge.end);
    if (!start || !end) continue;
    if (pointSegmentDistance(point, start.position, end.position) <= edge.radius + pointRadius + contactTolerance) return true;
  }
  return false;
}

function appendPositionTriangle(target: number[], positions: Float32Array, offset: number): void {
  for (let index = 0; index < 9; index++) target.push(positions[offset + index]);
}

/**
 * Diagnose the outer SKIN only. Adding an internal graph does not change the
 * face angle itself; it can only move an over-threshold face from red
 * "unreached" to teal "internal member reaches this finite-resolution
 * contact band". This is deliberately a screening heuristic, not a slicer,
 * bridge simulation, load path, or printability claim.
 */
export function diagnoseSurfaceAngles(
  surfaceTriangles: Triangle[],
  internalGraph: InternalStructureGraph | null,
  thresholdDeg: number,
  meshStep: number,
): SurfaceAngleDiagnosisResult {
  const positions = new Float32Array(surfaceTriangles.length * 9);
  let cursor = 0;
  for (const triangle of surfaceTriangles) {
    for (const point of [triangle.a, triangle.b, triangle.c]) {
      positions[cursor++] = point.x;
      positions[cursor++] = point.y;
      positions[cursor++] = point.z;
    }
  }
  return diagnoseSurfaceAnglePositions(positions, internalGraph, thresholdDeg, meshStep);
}

/** Buffer form used by the final-precision parallel mesh Worker. */
export function diagnoseSurfaceAnglePositions(
  positions: Float32Array,
  internalGraph: InternalStructureGraph | null,
  thresholdDeg: number,
  meshStep: number,
): SurfaceAngleDiagnosisResult {
  const threshold = clamp(Number.isFinite(thresholdDeg) ? thresholdDeg : 45, 0, 90);
  const contactTolerance = Math.max(1e-6, Math.abs(meshStep) * 1.75);
  const before: number[] = [];
  const after: number[] = [];
  const mitigated: number[] = [];
  let surfaceArea = 0;
  let dangerousAreaBefore = 0;
  let dangerousAreaAfter = 0;
  let mitigatedArea = 0;
  let dangerousFaceCountBefore = 0;
  let dangerousFaceCountAfter = 0;
  let mitigatedFaceCount = 0;

  for (let offset = 0; offset + 8 < positions.length; offset += 9) {
    const triangle: Triangle = {
      a: { x: positions[offset], y: positions[offset + 1], z: positions[offset + 2] },
      b: { x: positions[offset + 3], y: positions[offset + 4], z: positions[offset + 5] },
      c: { x: positions[offset + 6], y: positions[offset + 7], z: positions[offset + 8] },
    };
    const face = measureFace(triangle);
    if (face.area <= 1e-14) continue;
    surfaceArea += face.area;
    if (face.normal.z >= -1e-8 || surfaceOverhangAngleDeg(face.normal) < threshold) continue;
    appendPositionTriangle(before, positions, offset);
    dangerousAreaBefore += face.area;
    dangerousFaceCountBefore++;
    if (internalGraphReachesPoint(face.centroid, internalGraph, contactTolerance)) {
      appendPositionTriangle(mitigated, positions, offset);
      mitigatedArea += face.area;
      mitigatedFaceCount++;
    } else {
      appendPositionTriangle(after, positions, offset);
      dangerousAreaAfter += face.area;
      dangerousFaceCountAfter++;
    }
  }

  return {
    thresholdDeg: threshold,
    surfaceArea,
    dangerousAreaBefore,
    dangerousAreaAfter,
    mitigatedArea,
    dangerousFaceCountBefore,
    dangerousFaceCountAfter,
    mitigatedFaceCount,
    contactTolerance,
    beforeDangerPositions: new Float32Array(before),
    afterDangerPositions: new Float32Array(after),
    mitigatedPositions: new Float32Array(mitigated),
  };
}
