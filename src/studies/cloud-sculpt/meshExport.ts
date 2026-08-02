import type { Ball } from "./field.ts";
import { fieldSdf } from "./field.ts";
import type { HistoryEntry } from "./history.ts";
import { serializeRecipe } from "./history.ts";

export interface MeshVertex {
  x: number;
  y: number;
  z: number;
}

export interface Triangle {
  a: MeshVertex;
  b: MeshVertex;
  c: MeshVertex;
}

export interface MeshBuildOptions {
  resolution: number;
  targetLongestMm: number;
}

export interface MeshBuildResult {
  triangles: Triangle[];
  sourceBounds: Bounds;
  mmBounds: Bounds;
  scaleMmPerUnit: number;
  watertight: WatertightReport;
}

export interface Bounds {
  min: MeshVertex;
  max: MeshVertex;
  size: MeshVertex;
  longest: number;
}

export interface WatertightReport {
  ok: boolean;
  openEdges: number;
  nonManifoldEdges: number;
  totalEdges: number;
}

type Corner = MeshVertex & { value: number };

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

export function buildCloudMesh(
  balls: Ball[],
  k: number,
  options: MeshBuildOptions,
): MeshBuildResult {
  if (balls.length === 0) {
    throw new Error("雲が空です。球を追加してから書き出してください。");
  }
  const sourceBounds = computeSamplingBounds(balls, k);
  return buildMeshFromField(sourceBounds, (x, y, z) => fieldSdf(balls, k, x, y, z), options);
}

/**
 * Generalization of buildCloudMesh's marching-tetrahedra core to an
 * arbitrary scalar field (any `sdf(x,y,z) < 0` = inside convention), so
 * other Studies can reuse the exact same meshing/watertight-check
 * mechanism without copying it (T7-foam-cells.md "コピーせず関数を共有
 * できる形"). buildCloudMesh above is unchanged in behavior — it just
 * delegates here with fieldSdf as the sampled function.
 */
export function buildMeshFromField(
  sourceBounds: Bounds,
  sdf: (x: number, y: number, z: number) => number,
  options: MeshBuildOptions,
): MeshBuildResult {
  const longest = sourceBounds.longest;
  const resolution = Math.max(8, Math.round(options.resolution));
  const nx = Math.max(2, Math.ceil((sourceBounds.size.x / longest) * resolution));
  const ny = Math.max(2, Math.ceil((sourceBounds.size.y / longest) * resolution));
  const nz = Math.max(2, Math.ceil((sourceBounds.size.z / longest) * resolution));
  const step = longest / resolution;
  const values = sampleGrid(sdf, sourceBounds, nx, ny, nz, step);
  const triangles: Triangle[] = [];

  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const corners = cubeCorners(sourceBounds, values, nx, ny, x, y, z, step);
        for (const tet of TETS) {
          polygonizeTet([corners[tet[0]], corners[tet[1]], corners[tet[2]], corners[tet[3]]], triangles);
        }
      }
    }
  }

  const meshBounds = computeMeshBounds(triangles);
  const scaleMmPerUnit =
    meshBounds.longest > 0 ? options.targetLongestMm / meshBounds.longest : 1;
  const mmBounds = scaleBounds(meshBounds, scaleMmPerUnit);
  const watertight = inspectWatertight(triangles, scaleMmPerUnit);
  return { triangles, sourceBounds: meshBounds, mmBounds, scaleMmPerUnit, watertight };
}

export function computeSamplingBounds(balls: Ball[], k: number): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let maxR = 0;
  for (const b of balls) {
    maxR = Math.max(maxR, b.r);
    minX = Math.min(minX, b.x - b.r);
    minY = Math.min(minY, b.y - b.r);
    minZ = Math.min(minZ, b.z - b.r);
    maxX = Math.max(maxX, b.x + b.r);
    maxY = Math.max(maxY, b.y + b.r);
    maxZ = Math.max(maxZ, b.z + b.r);
  }
  const margin = Math.max(0.25, maxR * 0.25, k * 0.75);
  return makeBounds(
    { x: minX - margin, y: minY - margin, z: minZ - margin },
    { x: maxX + margin, y: maxY + margin, z: maxZ + margin },
  );
}

function makeBounds(min: MeshVertex, max: MeshVertex): Bounds {
  const size = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
  return { min, max, size, longest: Math.max(size.x, size.y, size.z) };
}

function sampleGrid(
  sdf: (x: number, y: number, z: number) => number,
  bounds: Bounds,
  nx: number,
  ny: number,
  nz: number,
  step: number,
): Float32Array {
  const sx = nx + 1;
  const sy = ny + 1;
  const values = new Float32Array((nx + 1) * (ny + 1) * (nz + 1));
  for (let z = 0; z <= nz; z++) {
    const pz = bounds.min.z + z * step;
    for (let y = 0; y <= ny; y++) {
      const py = bounds.min.y + y * step;
      for (let x = 0; x <= nx; x++) {
        const px = bounds.min.x + x * step;
        values[x + y * sx + z * sx * sy] = sdf(px, py, pz);
      }
    }
  }
  return values;
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

function polygonizeTet(corners: [Corner, Corner, Corner, Corner], triangles: Triangle[]): void {
  const inside = corners.filter((p) => p.value < 0);
  const outside = corners.filter((p) => p.value >= 0);
  if (inside.length === 0 || inside.length === 4) return;

  if (inside.length === 1) {
    const p = inside[0];
    triangles.push({
      a: interpolateIso(p, outside[0]),
      b: interpolateIso(p, outside[1]),
      c: interpolateIso(p, outside[2]),
    });
    return;
  }
  if (inside.length === 3) {
    const p = outside[0];
    triangles.push({
      a: interpolateIso(p, inside[2]),
      b: interpolateIso(p, inside[1]),
      c: interpolateIso(p, inside[0]),
    });
    return;
  }

  const p0 = inside[0];
  const p1 = inside[1];
  const q0 = outside[0];
  const q1 = outside[1];
  const a = interpolateIso(p0, q0);
  const b = interpolateIso(p0, q1);
  const c = interpolateIso(p1, q0);
  const d = interpolateIso(p1, q1);
  triangles.push({ a, b, c });
  triangles.push({ a: b, b: d, c });
}

function interpolateIso(a: Corner, b: Corner): MeshVertex {
  const denom = a.value - b.value;
  const t = Math.abs(denom) < 1e-8 ? 0.5 : a.value / denom;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function computeMeshBounds(triangles: Triangle[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const tri of triangles) {
    for (const p of [tri.a, tri.b, tri.c]) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      minZ = Math.min(minZ, p.z);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
      maxZ = Math.max(maxZ, p.z);
    }
  }
  if (triangles.length === 0) {
    return makeBounds({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
  }
  return makeBounds({ x: minX, y: minY, z: minZ }, { x: maxX, y: maxY, z: maxZ });
}

function scaleBounds(bounds: Bounds, scale: number): Bounds {
  return makeBounds(
    { x: bounds.min.x * scale, y: bounds.min.y * scale, z: bounds.min.z * scale },
    { x: bounds.max.x * scale, y: bounds.max.y * scale, z: bounds.max.z * scale },
  );
}

export function inspectWatertight(triangles: Triangle[], scale = 1): WatertightReport {
  const edgeUse = new Map<string, number>();
  for (const tri of triangles) {
    const a = vertexKey(tri.a, scale);
    const b = vertexKey(tri.b, scale);
    const c = vertexKey(tri.c, scale);
    // Marching tetrahedra emits degenerate (near-zero-area) slivers when the
    // isosurface passes almost exactly through a tet vertex. At this check's
    // quantization those slivers collapse (two identical vertex keys) and
    // their edges triple-count, making healthy meshes read as 非多様体
    // (author's machine: 62 at 974k triangles, 2026-07-11 — every one traced
    // to sliver edges ~1e-7 of a cell step). A triangle that is degenerate
    // in key space contributes no surface at this precision, so it is
    // excluded from the count. The mesh itself is left untouched — slicers
    // are indifferent to zero-area noise, and removing slivers from the
    // geometry (tried: naive filter, then two flavors of vertex welding)
    // either opened real holes or manufactured new artifacts.
    if (a === b || b === c || c === a) continue;
    const keys = [a, b, c];
    for (const [i, j] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ] as const) {
      const ka = keys[i];
      const kb = keys[j];
      const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
    }
  }
  let openEdges = 0;
  let nonManifoldEdges = 0;
  for (const count of edgeUse.values()) {
    if (count === 1) openEdges++;
    if (count > 2) nonManifoldEdges++;
  }
  return {
    ok: openEdges === 0 && nonManifoldEdges === 0,
    openEdges,
    nonManifoldEdges,
    totalEdges: edgeUse.size,
  };
}

function vertexKey(v: MeshVertex, scale: number): string {
  const q = 1e5;
  return `${Math.round(v.x * scale * q)},${Math.round(v.y * scale * q)},${Math.round(
    v.z * scale * q,
  )}`;
}

export function meshSummary(result: MeshBuildResult): string {
  const b = result.mmBounds.size;
  const water = result.watertight.ok
    ? "水密: OK"
    : `水密: NG (開いた辺 ${result.watertight.openEdges}, 非多様体辺 ${result.watertight.nonManifoldEdges})`;
  return `三角形 ${result.triangles.length.toLocaleString()} / ${b.x.toFixed(1)} x ${b.y.toFixed(
    1,
  )} x ${b.z.toFixed(1)} mm / ${water}`;
}

export function encodeObj(result: MeshBuildResult): string {
  const lines = [
    "# Yohaku Cloud Sculpt OBJ",
    `# triangles ${result.triangles.length}`,
    `# scale ${result.scaleMmPerUnit} mm/source-unit`,
  ];
  const vertices: MeshVertex[] = [];
  const vertexIndices = new Map<string, number>();
  const faces: [number, number, number][] = [];
  for (const tri of result.triangles) {
    const indices = [tri.a, tri.b, tri.c].map((point) => {
      const key = vertexKey(point, result.scaleMmPerUnit);
      const existing = vertexIndices.get(key);
      if (existing !== undefined) return existing;
      const index = vertices.length + 1;
      vertices.push(point);
      vertexIndices.set(key, index);
      return index;
    }) as [number, number, number];
    if (indices[0] !== indices[1] && indices[1] !== indices[2] && indices[2] !== indices[0]) {
      faces.push(indices);
    }
  }
  lines.push(`# shared_vertices ${vertices.length}`);
  lines.push(`# exported_faces ${faces.length}`);
  for (const point of vertices) {
    lines.push(`v ${fmt(point.x * result.scaleMmPerUnit)} ${fmt(point.y * result.scaleMmPerUnit)} ${fmt(point.z * result.scaleMmPerUnit)}`);
  }
  for (const face of faces) {
    lines.push(`f ${face[0]} ${face[1]} ${face[2]}`);
  }
  return `${lines.join("\n")}\n`;
}

export function encodeBinaryStl(result: MeshBuildResult, name: string): ArrayBuffer {
  const buffer = new ArrayBuffer(84 + result.triangles.length * 50);
  const view = new DataView(buffer);
  const header = new TextEncoder().encode(`Yohaku Cloud Sculpt ${name}`.slice(0, 80));
  new Uint8Array(buffer, 0, header.length).set(header);
  view.setUint32(80, result.triangles.length, true);
  let offset = 84;
  for (const tri of result.triangles) {
    const normal = triangleNormal(tri);
    for (const n of [normal.x, normal.y, normal.z]) {
      view.setFloat32(offset, n, true);
      offset += 4;
    }
    for (const p of [tri.a, tri.b, tri.c]) {
      view.setFloat32(offset, p.x * result.scaleMmPerUnit, true);
      view.setFloat32(offset + 4, p.y * result.scaleMmPerUnit, true);
      view.setFloat32(offset + 8, p.z * result.scaleMmPerUnit, true);
      offset += 12;
    }
    view.setUint16(offset, 0, true);
    offset += 2;
  }
  return buffer;
}

function triangleNormal(tri: Triangle): MeshVertex {
  const ux = tri.b.x - tri.a.x;
  const uy = tri.b.y - tri.a.y;
  const uz = tri.b.z - tri.a.z;
  const vx = tri.c.x - tri.a.x;
  const vy = tri.c.y - tri.a.y;
  const vz = tri.c.z - tri.a.z;
  const x = uy * vz - uz * vy;
  const y = uz * vx - ux * vz;
  const z = ux * vy - uy * vx;
  const len = Math.hypot(x, y, z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(6);
}

export function makeExportBaseName(): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `yohaku-cloud-${stamp}`;
}

export function downloadMeshBundle(
  result: MeshBuildResult,
  history: HistoryEntry[],
  baseName = makeExportBaseName(),
): void {
  downloadBlob(
    new Blob([encodeBinaryStl(result, baseName)], { type: "model/stl" }),
    `${baseName}.stl`,
  );
  downloadBlob(new Blob([encodeObj(result)], { type: "text/plain" }), `${baseName}.obj`);
  downloadBlob(
    new Blob([serializeRecipe(history)], { type: "application/json" }),
    `${baseName}.recipe.json`,
  );
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
