// ---------------------------------------------------------------------------
// P2.6 Phase C2 — source tetra / grid-corner tracing, diagnosis only.
//
// This module reconstructs the exact marching-tetrahedra sampling loop used by
// buildMeshFromField and records where every emitted triangle came from. It is
// deliberately not imported by a browser entry point: the permanent
// production triangle type stays small, while a test/report can compare an
// ambiguous saved shell with its source cube, tetrahedron and four Float32
// corner values.
// ---------------------------------------------------------------------------

import {
  polygonizeTet,
  tetGradient,
  type Bounds,
  type Corner,
  type MeshVertex,
  type Triangle,
} from "../cloud-sculpt/meshExport.ts";
import type { ShellStat } from "./solidTopology.ts";

export type DiagnosticField = (x: number, y: number, z: number) => number;

const TETS = [
  [0, 5, 1, 6],
  [0, 1, 2, 6],
  [0, 2, 3, 6],
  [0, 3, 7, 6],
  [0, 7, 4, 6],
  [0, 4, 5, 6],
] as const;

const CUBE_OFFSETS = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
] as const;

export interface SourceTetraTrace {
  triangleIndex: number;
  triangle: Triangle;
  cube: { x: number; y: number; z: number };
  tetrahedronIndex: number;
  corners: [Corner, Corner, Corner, Corner];
  cornerNegativeCount: number;
  cornerPositiveCount: number;
  linearFieldAtCentroid: number;
  actualFieldAtCentroid: number;
  actualFieldAtPlusProbe: number;
  actualFieldAtMinusProbe: number;
  probeDistanceFieldUnits: number;
}

export interface SourceTetraTraceResult {
  triangles: Triangle[];
  traces: SourceTetraTrace[];
  gridStepFieldUnits: number;
  gridSize: { nx: number; ny: number; nz: number };
}

export type SourceTetraShellClassification =
  | "cavity-wall"
  | "field-inconsistent-interpolation-shell"
  | "undetermined";

export interface SourceTetraShellReport {
  shellIndex: number;
  triangleCount: number;
  matchedTriangleCount: number;
  mixedCornerTriangleCount: number;
  centroidMaterialCount: number;
  centroidVoidCount: number;
  bothProbeSidesVoidCount: number;
  bothProbeSidesMaterialCount: number;
  resolvedBoundaryCount: number;
  linearCentroidMaxAbs: number;
  actualCentroidMin: number;
  actualCentroidMax: number;
  classification: SourceTetraShellClassification;
}

function centroid(t: Triangle): MeshVertex {
  return {
    x: (t.a.x + t.b.x + t.c.x) / 3,
    y: (t.a.y + t.b.y + t.c.y) / 3,
    z: (t.a.z + t.b.z + t.c.z) / 3,
  };
}

function normal(t: Triangle): MeshVertex {
  const abx = t.b.x - t.a.x;
  const aby = t.b.y - t.a.y;
  const abz = t.b.z - t.a.z;
  const acx = t.c.x - t.a.x;
  const acy = t.c.y - t.a.y;
  const acz = t.c.z - t.a.z;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  const length = Math.hypot(nx, ny, nz);
  return length > 0
    ? { x: nx / length, y: ny / length, z: nz / length }
    : { x: 0, y: 0, z: 0 };
}

function linearFieldAt(corners: [Corner, Corner, Corner, Corner], point: MeshVertex): number {
  const gradient = tetGradient(corners);
  if (!gradient) return Number.NaN;
  const origin = corners[0];
  return origin.value
    + gradient.x * (point.x - origin.x)
    + gradient.y * (point.y - origin.y)
    + gradient.z * (point.z - origin.z);
}

function triangleGeometryKey(t: Triangle): string {
  return [t.a, t.b, t.c]
    .map((p) => `${p.x},${p.y},${p.z}`)
    .sort()
    .join("|");
}

function cubeCorners(
  bounds: Bounds,
  values: Float32Array,
  nx: number,
  ny: number,
  x: number,
  y: number,
  z: number,
  step: number,
): Corner[] {
  const sx = nx + 1;
  const sy = ny + 1;
  return CUBE_OFFSETS.map(([dx, dy, dz]) => {
    const gx = x + dx;
    const gy = y + dy;
    const gz = z + dz;
    return {
      x: bounds.min.x + gx * step,
      y: bounds.min.y + gy * step,
      z: bounds.min.z + gz * step,
      value: values[gx + gy * sx + gz * sx * sy],
    };
  });
}

/**
 * Reconstructs buildMeshFromField's sampling and polygonisation exactly, while
 * retaining diagnostic origin metadata. The caller should compare `triangles`
 * against buildMeshFromField in a test before trusting any trace.
 */
export function traceMeshSourceTetra(
  sourceBounds: Bounds,
  field: DiagnosticField,
  resolutionInput: number,
): SourceTetraTraceResult {
  const resolution = Math.max(8, Math.round(resolutionInput));
  const step = sourceBounds.longest / resolution;
  const nx = Math.max(2, Math.ceil((sourceBounds.size.x / sourceBounds.longest) * resolution));
  const ny = Math.max(2, Math.ceil((sourceBounds.size.y / sourceBounds.longest) * resolution));
  const nz = Math.max(2, Math.ceil((sourceBounds.size.z / sourceBounds.longest) * resolution));
  const sx = nx + 1;
  const sy = ny + 1;
  const values = new Float32Array((nx + 1) * (ny + 1) * (nz + 1));
  for (let z = 0; z <= nz; z++) {
    const pz = sourceBounds.min.z + z * step;
    for (let y = 0; y <= ny; y++) {
      const py = sourceBounds.min.y + y * step;
      for (let x = 0; x <= nx; x++) {
        const px = sourceBounds.min.x + x * step;
        values[x + y * sx + z * sx * sy] = field(px, py, pz);
      }
    }
  }

  const triangles: Triangle[] = [];
  const traces: SourceTetraTrace[] = [];
  const probeDistanceFieldUnits = step * 0.125;
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const corners = cubeCorners(sourceBounds, values, nx, ny, x, y, z, step);
        for (let tetrahedronIndex = 0; tetrahedronIndex < TETS.length; tetrahedronIndex++) {
          const indices = TETS[tetrahedronIndex];
          const tetra = [
            corners[indices[0]],
            corners[indices[1]],
            corners[indices[2]],
            corners[indices[3]],
          ] as [Corner, Corner, Corner, Corner];
          const firstTriangle = triangles.length;
          polygonizeTet(tetra, triangles);
          for (let triangleIndex = firstTriangle; triangleIndex < triangles.length; triangleIndex++) {
            const triangle = triangles[triangleIndex];
            const c = centroid(triangle);
            const n = normal(triangle);
            const plus = {
              x: c.x + n.x * probeDistanceFieldUnits,
              y: c.y + n.y * probeDistanceFieldUnits,
              z: c.z + n.z * probeDistanceFieldUnits,
            };
            const minus = {
              x: c.x - n.x * probeDistanceFieldUnits,
              y: c.y - n.y * probeDistanceFieldUnits,
              z: c.z - n.z * probeDistanceFieldUnits,
            };
            const cornerNegativeCount = tetra.filter((corner) => corner.value < 0).length;
            traces.push({
              triangleIndex,
              triangle,
              cube: { x, y, z },
              tetrahedronIndex,
              corners: tetra,
              cornerNegativeCount,
              cornerPositiveCount: 4 - cornerNegativeCount,
              linearFieldAtCentroid: linearFieldAt(tetra, c),
              actualFieldAtCentroid: field(c.x, c.y, c.z),
              actualFieldAtPlusProbe: field(plus.x, plus.y, plus.z),
              actualFieldAtMinusProbe: field(minus.x, minus.y, minus.z),
              probeDistanceFieldUnits,
            });
          }
        }
      }
    }
  }
  return {
    triangles,
    traces,
    gridStepFieldUnits: step,
    gridSize: { nx, ny, nz },
  };
}

/**
 * Compares one saved shell with the tetrahedra that emitted its triangles.
 * The field band is the shell's own measured C1 decision band, in field
 * units; no new tolerance is introduced to make a classification pass.
 */
export function diagnoseShellSourceTetra(
  shell: ShellStat,
  savedTriangles: Triangle[],
  traced: SourceTetraTraceResult,
  fieldBandFieldUnits: number,
): SourceTetraShellReport {
  const byGeometry = new Map<string, SourceTetraTrace[]>();
  for (const trace of traced.traces) {
    const key = triangleGeometryKey(trace.triangle);
    const bucket = byGeometry.get(key) ?? [];
    bucket.push(trace);
    byGeometry.set(key, bucket);
  }

  const matches: SourceTetraTrace[] = [];
  for (const sourceTriangleIndex of shell.sourceTriangleIndices) {
    const triangle = savedTriangles[sourceTriangleIndex];
    if (!triangle) continue;
    const bucket = byGeometry.get(triangleGeometryKey(triangle));
    const match = bucket?.shift();
    if (match) matches.push(match);
  }

  let mixedCornerTriangleCount = 0;
  let centroidMaterialCount = 0;
  let centroidVoidCount = 0;
  let bothProbeSidesVoidCount = 0;
  let bothProbeSidesMaterialCount = 0;
  let resolvedBoundaryCount = 0;
  let linearCentroidMaxAbs = 0;
  let actualCentroidMin = Infinity;
  let actualCentroidMax = -Infinity;
  for (const trace of matches) {
    if (trace.cornerNegativeCount > 0 && trace.cornerPositiveCount > 0) mixedCornerTriangleCount++;
    const centroidValue = trace.actualFieldAtCentroid;
    if (centroidValue < -fieldBandFieldUnits) centroidMaterialCount++;
    if (centroidValue > fieldBandFieldUnits) centroidVoidCount++;
    const plus = trace.actualFieldAtPlusProbe;
    const minus = trace.actualFieldAtMinusProbe;
    if (plus > fieldBandFieldUnits && minus > fieldBandFieldUnits) bothProbeSidesVoidCount++;
    if (plus < -fieldBandFieldUnits && minus < -fieldBandFieldUnits) bothProbeSidesMaterialCount++;
    if (
      (plus > fieldBandFieldUnits && minus < -fieldBandFieldUnits)
      || (minus > fieldBandFieldUnits && plus < -fieldBandFieldUnits)
    ) {
      resolvedBoundaryCount++;
    }
    linearCentroidMaxAbs = Math.max(linearCentroidMaxAbs, Math.abs(trace.linearFieldAtCentroid));
    actualCentroidMin = Math.min(actualCentroidMin, centroidValue);
    actualCentroidMax = Math.max(actualCentroidMax, centroidValue);
  }

  let classification: SourceTetraShellClassification = "undetermined";
  if (
    matches.length === shell.triangleCount
    && mixedCornerTriangleCount === matches.length
    && centroidVoidCount === matches.length
    && bothProbeSidesVoidCount === matches.length
  ) {
    classification = "field-inconsistent-interpolation-shell";
  } else if (
    matches.length === shell.triangleCount
    && resolvedBoundaryCount === matches.length
  ) {
    classification = "cavity-wall";
  }

  return {
    shellIndex: shell.index,
    triangleCount: shell.triangleCount,
    matchedTriangleCount: matches.length,
    mixedCornerTriangleCount,
    centroidMaterialCount,
    centroidVoidCount,
    bothProbeSidesVoidCount,
    bothProbeSidesMaterialCount,
    resolvedBoundaryCount,
    linearCentroidMaxAbs,
    actualCentroidMin,
    actualCentroidMax,
    classification,
  };
}
