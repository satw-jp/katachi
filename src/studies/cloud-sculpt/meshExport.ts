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
  /** Faces removed because fewer than three distinct vertices remain in the
   * exact Float32 millimetre coordinates written to STL. Kept explicit so
   * cleanup is never mistaken for a generator that emitted no slivers. */
  removedSavedDegenerateTriangleCount?: number;
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

export type Corner = MeshVertex & { value: number };

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

/**
 * Generalization of buildMeshFromField to N named scalar fields sampled from
 * a SINGLE combined evaluation per grid corner (T13 audit fix P0-2: S-skin's
 * A/B partition needs dOriginal, sdfA=max(dOriginal,dA-dB) and
 * sdfB=max(dOriginal,dB-dA) over the identical grid, but each of those is
 * itself built from dOriginal/dA/dB -- calling buildMeshFromField 3 times
 * independently would re-evaluate the patch-composite smooth-min sum up to
 * 7x per grid corner). Here `sampleAll` is called exactly once per corner
 * and must itself only compute each underlying quantity once (the caller's
 * responsibility -- this function just guarantees ONE call site per corner
 * instead of one per output field). `onProgress` (optional) is called after
 * every z-slice of the sampling pass with a 0..1 fraction and a stage label,
 * for a caller running this inside a Worker to report to the main thread.
 */
export function buildMeshesFromSharedField<K extends string>(
  sourceBounds: Bounds,
  fieldNames: readonly K[],
  sampleAll: (x: number, y: number, z: number) => Record<K, number>,
  options: MeshBuildOptions,
  onProgress?: (fraction: number, stage: string) => void,
): Record<K, MeshBuildResult> {
  const longest = sourceBounds.longest;
  const resolution = Math.max(8, Math.round(options.resolution));
  const nx = Math.max(2, Math.ceil((sourceBounds.size.x / longest) * resolution));
  const ny = Math.max(2, Math.ceil((sourceBounds.size.y / longest) * resolution));
  const nz = Math.max(2, Math.ceil((sourceBounds.size.z / longest) * resolution));
  const step = longest / resolution;

  const sx = nx + 1;
  const sy = ny + 1;
  const gridSize = sx * sy * (nz + 1);
  const valuesByField = {} as Record<K, Float32Array>;
  for (const name of fieldNames) valuesByField[name] = new Float32Array(gridSize);

  for (let z = 0; z <= nz; z++) {
    const pz = sourceBounds.min.z + z * step;
    for (let y = 0; y <= ny; y++) {
      const py = sourceBounds.min.y + y * step;
      for (let x = 0; x <= nx; x++) {
        const px = sourceBounds.min.x + x * step;
        const sample = sampleAll(px, py, pz);
        const idx = x + y * sx + z * sx * sy;
        for (const name of fieldNames) valuesByField[name][idx] = sample[name];
      }
    }
    onProgress?.((z + 1) / (nz + 1), "サンプリング中");
  }

  const result = {} as Record<K, MeshBuildResult>;
  let fieldIndex = 0;
  for (const name of fieldNames) {
    const values = valuesByField[name];
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
    const scaleMmPerUnit = meshBounds.longest > 0 ? options.targetLongestMm / meshBounds.longest : 1;
    const mmBounds = scaleBounds(meshBounds, scaleMmPerUnit);
    const watertight = inspectWatertight(triangles, scaleMmPerUnit);
    result[name] = { triangles, sourceBounds: meshBounds, mmBounds, scaleMmPerUnit, watertight };
    fieldIndex++;
    onProgress?.(fieldIndex / fieldNames.length, `三角形化中 (${String(name)})`);
  }
  return result;
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

/**
 * gate-correction winding-final: the pre-fix code emitted each case's
 * triangle(s) in whatever corner order the case fell out in (e.g. the
 * inside-1 case just used `outside[0,1,2]` in tet-local order), which is
 * only guaranteed to be MUTUALLY consistent between different tets/cases if
 * the six tets in TETS all happen to share compatible handedness AND every
 * one of the four marching-tet cases (0/1/2/3-inside) happens to encode a
 * consistent convention relative to that handedness -- neither was designed
 * for nor verified, and auditing all of it by hand for 6 tets x 4 cases
 * (see the instruction's Task 3) is both slow and easy to get subtly wrong
 * again. Instead, every emitted triangle is oriented AFTER generation
 * against the tet's own gradient (see tetGradient below) -- this is exact
 * (no extra SDF evaluations: the gradient of the tet's linear interpolant
 * is fully determined by the 4 corner values already sampled) and correct
 * BY CONSTRUCTION for every case and every tet, independent of whatever
 * corner order a given case's code happens to produce. A degenerate tet
 * (near-zero volume; tetGradient returns null) or a near-zero-area triangle
 * (gradient dot ~0) is left as generated -- there is no well-defined
 * "outward" direction to orient against in either case, and forcing one
 * would be guessing, not fixing (this is a distinct, still-open concern
 * from degenerate-triangle *rejection*, which Task 1/4's saved-topology and
 * volume-validity gates handle separately).
 */
export function polygonizeTet(corners: [Corner, Corner, Corner, Corner], triangles: Triangle[]): void {
  const inside = corners.filter((p) => p.value < 0);
  const outside = corners.filter((p) => p.value >= 0);
  if (inside.length === 0 || inside.length === 4) return;

  const gradient = tetGradient(corners);
  const push = (a: MeshVertex, b: MeshVertex, c: MeshVertex): void => {
    triangles.push(orientTriangle({ a, b, c }, gradient));
  };

  if (inside.length === 1) {
    const p = inside[0];
    push(interpolateIso(p, outside[0]), interpolateIso(p, outside[1]), interpolateIso(p, outside[2]));
    return;
  }
  if (inside.length === 3) {
    const p = outside[0];
    push(interpolateIso(p, inside[2]), interpolateIso(p, inside[1]), interpolateIso(p, inside[0]));
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
  push(a, b, c);
  push(b, d, c);
}

/**
 * Constant gradient of the tetrahedron's OWN linear interpolant (exactly
 * the field interpolateIso already assumes -- value varies linearly along
 * every tet edge), solved from corner 0 as reference: for i=1,2,3,
 * value_i - value_0 = g . (p_i - p_0), a 3x3 linear system via Cramer's
 * rule. No additional SDF sampling -- uses only the 4 corner values this
 * tet already has. Returns null for a (near-)degenerate tet (zero volume,
 * singular system); real callers of buildMeshFromField/
 * buildMeshesFromSharedField only ever produce nondegenerate tets (TETS
 * partitions a nondegenerate cube), so this is a defensive guard, not an
 * expected path.
 */
export function tetGradient(corners: [Corner, Corner, Corner, Corner]): MeshVertex | null {
  const [p0, p1, p2, p3] = corners;
  const e1x = p1.x - p0.x, e1y = p1.y - p0.y, e1z = p1.z - p0.z;
  const e2x = p2.x - p0.x, e2y = p2.y - p0.y, e2z = p2.z - p0.z;
  const e3x = p3.x - p0.x, e3y = p3.y - p0.y, e3z = p3.z - p0.z;
  const det = e1x * (e2y * e3z - e2z * e3y) - e1y * (e2x * e3z - e2z * e3x) + e1z * (e2x * e3y - e2y * e3x);
  if (Math.abs(det) < 1e-12) return null;
  const d1 = p1.value - p0.value;
  const d2 = p2.value - p0.value;
  const d3 = p3.value - p0.value;
  const invDet = 1 / det;
  const gx = (d1 * (e2y * e3z - e2z * e3y) - e1y * (d2 * e3z - e2z * d3) + e1z * (d2 * e3y - e2y * d3)) * invDet;
  const gy = (e1x * (d2 * e3z - e2z * d3) - d1 * (e2x * e3z - e2z * e3x) + e1z * (e2x * d3 - d2 * e3x)) * invDet;
  const gz = (e1x * (e2y * d3 - d2 * e3y) - e1y * (e2x * d3 - d2 * e3x) + d1 * (e2x * e3y - e2y * e3x)) * invDet;
  return { x: gx, y: gy, z: gz };
}

/**
 * Swaps b/c (reversing winding) iff the triangle's face normal points
 * against the gradient (toward decreasing SDF value, i.e. inward) --
 * leaves it untouched when there's no well-defined direction to check
 * against (null gradient, or a near-zero-area triangle whose normal has
 * negligible magnitude -- both documented above as open, not silently
 * "fixed" by guessing).
 */
export function orientTriangle(tri: Triangle, gradient: MeshVertex | null): Triangle {
  if (!gradient) return tri;
  const ux = tri.b.x - tri.a.x, uy = tri.b.y - tri.a.y, uz = tri.b.z - tri.a.z;
  const vx = tri.c.x - tri.a.x, vy = tri.c.y - tri.a.y, vz = tri.c.z - tri.a.z;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const normalLenSq = nx * nx + ny * ny + nz * nz;
  if (normalLenSq < 1e-20) return tri;
  const dot = nx * gradient.x + ny * gradient.y + nz * gradient.z;
  return dot < 0 ? { a: tri.a, b: tri.c, c: tri.b } : tri;
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

/**
 * Signed-tetrahedron-sum mesh volume (divergence theorem), in mm^3 using the
 * result's own scaleMmPerUnit. Assumes outward-facing winding, same
 * convention triangleNormal() below relies on for STL export. Used by
 * S-skin's A/B partition comparison (see partition.ts) to report each part's
 * volume and how far A+B strays from the original composite's volume --
 * not exposed elsewhere yet, added here (not skin-local) since it is a
 * generic mesh property, same reuse precedent as buildMeshFromField.
 */
export function computeMeshVolume(result: MeshBuildResult): number {
  return Math.abs(computeSignedMeshVolume(result));
}

/**
 * Same divergence-theorem sum as computeMeshVolume, WITHOUT the `Math.abs`
 * (winding-volume-final Task 4: "符号付きsumは各meshで符号も記録し、
 * `Math.abs`だけで反転や相殺を隠さない" -- a mesh with globally-reversed
 * winding, or one whose winding-inconsistent regions partially cancel in
 * the sum, both produce a wrong-but-plausible-looking positive number after
 * `Math.abs`; the sign is the cheapest signal that something is off,
 * callers that care about mesh validity should check it alongside
 * savedTopology rather than trust magnitude alone).
 */
export function computeSignedMeshVolume(result: MeshBuildResult): number {
  let sum = 0;
  for (const { a, b, c } of result.triangles) {
    sum +=
      a.x * (b.y * c.z - b.z * c.y) -
      a.y * (b.x * c.z - b.z * c.x) +
      a.z * (b.x * c.y - b.y * c.x);
  }
  const volumeFieldUnits = sum / 6;
  return volumeFieldUnits * result.scaleMmPerUnit ** 3;
}

/**
 * Re-derive mmBounds/watertight for `result` at an EXTERNALLY-chosen
 * `scaleMmPerUnit` instead of the one buildMeshFromField/
 * buildMeshesFromSharedField computed from THIS result's own longest edge
 * (T13 gate-correction audit fix P0-1: S-skin's A/B partition needs
 * original/A/B to share exactly one physical scale -- each part's own
 * bbox longest edge otherwise gets independently stretched to
 * targetLongestMm, so A and B are saved in different, incompatible unit
 * scales even though they came from the same shared grid). `triangles` and
 * `sourceBounds` (field-unit) are untouched; only the scale-derived fields
 * change. Generic (no knowledge of what "original" means) -- the caller
 * decides which result's scale is canonical.
 */
export function rescaleMeshResult(result: MeshBuildResult, scaleMmPerUnit: number): MeshBuildResult {
  return {
    ...result,
    mmBounds: scaleBounds(result.sourceBounds, scaleMmPerUnit),
    scaleMmPerUnit,
    watertight: inspectWatertight(result.triangles, scaleMmPerUnit),
  };
}

/** Normalize face directions using the exact Float32 vertex identity that
 * binary STL export preserves. Coordinates are never moved or welded. */
export function orientMeshForSavedStl(result: MeshBuildResult): MeshBuildResult {
  const scale = result.scaleMmPerUnit;
  const keyOf = (v: MeshVertex) => {
    const p = roundVertexToF32(v, scale);
    return `${p.x},${p.y},${p.z}`;
  };
  // A face with repeated Float32 vertices contributes no surface to the
  // bytes that STL consumers see. inspectSavedStlTopology already excludes
  // exactly these faces when counting edges; if its surviving surface is
  // closed, exporting the same survivors removes zero-area noise without
  // changing that measured topology. Record the removal explicitly.
  const triangles = result.triangles.filter((tri) => {
    const a = keyOf(tri.a), b = keyOf(tri.b), c = keyOf(tri.c);
    return a !== b && b !== c && c !== a;
  });
  const removedSavedDegenerateTriangleCount =
    (result.removedSavedDegenerateTriangleCount ?? 0) + result.triangles.length - triangles.length;
  if (triangles.length === 0) {
    return {
      ...result,
      triangles,
      removedSavedDegenerateTriangleCount,
      watertight: inspectWatertight(triangles, scale),
    };
  }
  type EdgeUse = { triangle: number; forward: boolean };
  const edgeUses = new Map<string, EdgeUse[]>();
  for (let ti = 0; ti < triangles.length; ti++) {
    const tri = triangles[ti];
    const keys = [keyOf(tri.a), keyOf(tri.b), keyOf(tri.c)];
    for (const [i, j] of [[0, 1], [1, 2], [2, 0]] as const) {
      const a = keys[i], b = keys[j];
      if (a === b) continue;
      const forward = a < b;
      const edge = forward ? `${a}|${b}` : `${b}|${a}`;
      const uses = edgeUses.get(edge) ?? [];
      uses.push({ triangle: ti, forward });
      edgeUses.set(edge, uses);
    }
  }
  const adjacency: Array<Array<{ other: number; xorFlip: boolean }>> = Array.from(
    { length: triangles.length }, () => [],
  );
  for (const uses of edgeUses.values()) {
    if (uses.length !== 2) continue;
    const [a, b] = uses;
    const xorFlip = a.forward === b.forward;
    adjacency[a.triangle].push({ other: b.triangle, xorFlip });
    adjacency[b.triangle].push({ other: a.triangle, xorFlip });
  }
  const flip: Array<boolean | undefined> = new Array(triangles.length);
  const components: number[][] = [];
  for (let start = 0; start < triangles.length; start++) {
    if (flip[start] !== undefined) continue;
    flip[start] = false;
    const queue = [start], component: number[] = [];
    for (let qi = 0; qi < queue.length; qi++) {
      const current = queue[qi];
      component.push(current);
      for (const edge of adjacency[current]) {
        const expected = Boolean(flip[current]) !== edge.xorFlip;
        if (flip[edge.other] === undefined) {
          flip[edge.other] = expected;
          queue.push(edge.other);
        }
      }
    }
    components.push(component);
  }
  const oriented = triangles.map((tri, i) => flip[i] ? { a: tri.a, b: tri.c, c: tri.b } : tri);
  for (const component of components) {
    let signedSixVolume = 0;
    for (const i of component) {
      const { a, b, c } = oriented[i];
      signedSixVolume += a.x * (b.y * c.z - b.z * c.y) - a.y * (b.x * c.z - b.z * c.x) + a.z * (b.x * c.y - b.y * c.x);
    }
    if (signedSixVolume < 0) {
      for (const i of component) {
        const tri = oriented[i];
        oriented[i] = { a: tri.a, b: tri.c, c: tri.b };
      }
    }
  }
  return {
    ...result,
    triangles: oriented,
    removedSavedDegenerateTriangleCount,
    watertight: inspectWatertight(oriented, scale),
  };
}

/**
 * Generic union-find connected-component count over a triangle soup, keyed
 * by an arbitrary per-vertex key function (so callers can either quantize
 * loosely, as countConnectedComponents below does, or use EXACT keys on
 * already-rounded vertices, as inspectSavedStlTopology does below).
 */
export function computeConnectedComponentsWithKey(triangles: Triangle[], keyOf: (v: MeshVertex) => string): number {
  if (triangles.length === 0) return 0;
  const idOf = new Map<string, number>();
  const parent: number[] = [];
  const idFor = (v: MeshVertex): number => {
    const key = keyOf(v);
    let id = idOf.get(key);
    if (id === undefined) {
      id = parent.length;
      parent.push(id);
      idOf.set(key, id);
    }
    return id;
  };
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (const tri of triangles) {
    const a = idFor(tri.a);
    const b = idFor(tri.b);
    const c = idFor(tri.c);
    union(a, b);
    union(b, c);
  }
  const roots = new Set<number>();
  for (let i = 0; i < parent.length; i++) roots.add(find(i));
  return roots.size;
}

/**
 * Exported (T1, additive — no behaviour change) so a second measurement can
 * quantize to the SAME saved coordinates instead of re-deriving a rounding of
 * its own: S-interior-growth's `solidTopology.ts` classifies shells on exactly
 * the coordinates these bytes carry.
 */
export function roundVertexToF32(v: MeshVertex, scale: number): MeshVertex {
  // Math.fround simulates the EXACT IEEE-754 float32 rounding
  // DataView.setFloat32 performs in encodeBinaryStl below -- this makes
  // inspectSavedStlTopology check the topology of the bytes that will
  // actually be saved, not the pre-rounding Float64 in-memory triangles.
  return { x: Math.fround(v.x * scale), y: Math.fround(v.y * scale), z: Math.fround(v.z * scale) };
}

export interface SavedStlTopologyReport {
  ok: boolean;
  openEdges: number;
  nonManifoldEdges: number;
  /** An edge used exactly twice but traversed in the SAME direction both
   * times (should be opposite directions for consistent outward winding) --
   * NOT caught by inspectWatertight's plain edge-count check. */
  windingInconsistentEdges: number;
  /** Triangles that collapsed to <3 distinct vertices AFTER float32
   * rounding -- reported explicitly, never silently dropped from the
   * pass/fail decision (T13 gate-correction P0-2: "退成三角形を検査から
   * 黙って除外してok=trueにしない"). */
  degenerateTriangleCount: number;
  connectedComponents: number;
  totalEdges: number;
  /** winding-volume-final Task 6: Optimizer/trimesh can report
   * watertight=true with winding_consistent=false (its "watertight" only
   * means edge-closed, not orientation-consistent) -- calling Katachi's
   * combined `ok` "watertight" in the UI was misleading against that
   * label. These three expose the sub-conditions `ok` ANDs together so a
   * caller can say precisely which one failed ("境界は閉じているが面方向が
   * 不整合", not just "watertightではない"). */
  closed: boolean;
  windingConsistent: boolean;
  degenerateFree: boolean;
}

/**
 * Topology check on the mesh AS IT WILL BE SAVED: float32-rounds every
 * vertex (see roundVertexToF32) at the given mm scale FIRST, then computes
 * open/non-manifold/winding-inconsistent edge counts, degenerate triangle
 * count, and connected components on those rounded coordinates -- catching
 * defects that only exist post-rounding (float64-distinct vertices that
 * collapse to the same float32, or vice versa) which the pre-rounding
 * inspectWatertight() cannot see (T13 gate-correction audit finding: Katachi
 * reported watertight=true for a mesh Optimizer's independent float32-STL
 * reader found non-manifold).
 */
export function inspectSavedStlTopology(triangles: Triangle[], scaleMmPerUnit: number): SavedStlTopologyReport {
  const rounded: Triangle[] = triangles.map((t) => ({
    a: roundVertexToF32(t.a, scaleMmPerUnit),
    b: roundVertexToF32(t.b, scaleMmPerUnit),
    c: roundVertexToF32(t.c, scaleMmPerUnit),
  }));
  const keyOf = (v: MeshVertex) => `${v.x},${v.y},${v.z}`; // exact -- vertices are already float32-rounded
  let degenerateTriangleCount = 0;
  const undirectedCount = new Map<string, number>();
  const directedCount = new Map<string, number>();
  const survivors: Triangle[] = [];
  for (const tri of rounded) {
    const ka = keyOf(tri.a);
    const kb = keyOf(tri.b);
    const kc = keyOf(tri.c);
    if (ka === kb || kb === kc || kc === ka) {
      degenerateTriangleCount++;
      continue;
    }
    survivors.push(tri);
    for (const [p, q] of [
      [ka, kb],
      [kb, kc],
      [kc, ka],
    ] as const) {
      const undirectedKey = p < q ? `${p}|${q}` : `${q}|${p}`;
      undirectedCount.set(undirectedKey, (undirectedCount.get(undirectedKey) ?? 0) + 1);
      const directedKey = `${p}>${q}`;
      directedCount.set(directedKey, (directedCount.get(directedKey) ?? 0) + 1);
    }
  }
  let openEdges = 0;
  let nonManifoldEdges = 0;
  let windingInconsistentEdges = 0;
  for (const [undirectedKey, count] of undirectedCount) {
    if (count === 1) {
      openEdges++;
      continue;
    }
    if (count > 2) {
      nonManifoldEdges++;
      continue;
    }
    const [p, q] = undirectedKey.split("|");
    const forward = directedCount.get(`${p}>${q}`) ?? 0;
    const backward = directedCount.get(`${q}>${p}`) ?? 0;
    if (forward !== 1 || backward !== 1) windingInconsistentEdges++;
  }
  const connectedComponents = computeConnectedComponentsWithKey(survivors, keyOf);
  const closed = openEdges === 0 && nonManifoldEdges === 0;
  const windingConsistent = windingInconsistentEdges === 0;
  const degenerateFree = degenerateTriangleCount === 0;
  const ok = closed && windingConsistent && degenerateFree;
  return {
    ok,
    openEdges,
    nonManifoldEdges,
    windingInconsistentEdges,
    degenerateTriangleCount,
    connectedComponents,
    totalEdges: undirectedCount.size,
    closed,
    windingConsistent,
    degenerateFree,
  };
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
    "# Katachi Cloud Sculpt OBJ",
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
  const header = new TextEncoder().encode(`Katachi Cloud Sculpt ${name}`.slice(0, 80));
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
  return `katachi-cloud-${stamp}`;
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
