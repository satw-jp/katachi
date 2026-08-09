// ---------------------------------------------------------------------------
// T2f — STL import: parse a binary STL's triangles, then fill their INTERIOR
// with MPM material points (a voxel grid classified inside/outside by a
// ray-parity test). No sphere-fitting, no medial-axis extraction, no mesh
// repair -- those are freeze's job (particles -> balls, seeding.ts) and
// Blender's job, respectively (T2f-import-stl.md "最小負荷の設計": the only
// two new things this task asked for are "read an STL" and "fill its inside
// with particles").
//
// The ray/triangle intersection itself now lives in
// ../../lib/geometry/pointInMesh.ts (T13 audit fix P0-1: S-skin's partition
// verification needed the same test against arbitrary triangle soups, so it
// was extracted into a shared pure function instead of being re-derived).
// ---------------------------------------------------------------------------

import { rayTriangleIntersectX } from "../../lib/geometry/pointInMesh.ts";

export interface StlVertex {
  x: number;
  y: number;
  z: number;
}

export interface StlTriangle {
  a: StlVertex;
  b: StlVertex;
  c: StlVertex;
}

/**
 * Hard cap on particles a single STL import can emit. Chosen from the
 * measured CPU cost in mpm/README.md's perf table (~11ms/substep at 3,307
 * particles, roughly linear in particle count for the P2G/G2P neighborhood
 * loop) -- 20,000 particles extrapolates to well under 100ms/substep, still
 * usable for the discrete "実行" button even on the CPU fallback backend.
 * This is a sketch-scale UI safety valve, not a physical limit; exceeding it
 * triggers deterministic thinning with mass conserved across the thinned
 * set (see fillMeshWithParticles), never a silent partial import.
 */
export const MAX_MESH_PARTICLES = 20000;

/**
 * True if `buffer` looks like an ASCII STL. ASCII STL files start with the
 * text "solid", but some BINARY STL exporters also legally put "solid ..."
 * as arbitrary free-text header content -- so text alone is not a reliable
 * signal. The disambiguator is size: a binary STL's byte length must equal
 * 84 + triangleCount*50 exactly (triangleCount read from its own header);
 * an ASCII file will not match that formula.
 */
export function looksLikeAsciiStl(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 84) return true; // too short to be a valid binary STL
  const head = new Uint8Array(buffer, 0, Math.min(5, buffer.byteLength));
  const text = new TextDecoder("ascii").decode(head).trim().toLowerCase();
  if (!text.startsWith("solid")) return false;
  const count = new DataView(buffer).getUint32(80, true);
  const expected = 84 + count * 50;
  return buffer.byteLength !== expected;
}

/**
 * Parse a binary STL: 80-byte header + uint32 triangle count + 50
 * bytes/triangle (3x float32 normal [ignored -- not needed by the inside
 * test below] + 3x3 float32 vertices + uint16 attribute byte count), all
 * little-endian. Format reference: the de facto binary STL spec (no formal
 * standards body; this is the same layout cloud-sculpt/meshExport.ts's
 * `encodeBinaryStl` writes, so this parser is this project's own writer's
 * exact inverse).
 *
 * ASCII STL is deliberately NOT supported (T2f-import-stl.md explicitly
 * allows either supporting it or honestly declining -- declining costs less
 * implementation effort, and Blender can always re-export as binary).
 */
export function parseBinaryStl(buffer: ArrayBuffer): StlTriangle[] {
  if (looksLikeAsciiStl(buffer)) {
    throw new Error(
      "ASCII STL は非対応です（作業負荷を抑えるための仮決め。T2f-import-stl.md 参照）。" +
        "Blenderの書き出し設定で「ASCII」ではなく「Binary」を選んで書き出し直してください。",
    );
  }
  if (buffer.byteLength < 84) {
    throw new Error("STLファイルが短すぎます（バイナリSTLの80バイトヘッダ+三角形数が読めません）。");
  }
  const view = new DataView(buffer);
  const count = view.getUint32(80, true);
  const expected = 84 + count * 50;
  if (buffer.byteLength < expected) {
    throw new Error(
      `STLファイルの三角形数(${count})から期待されるサイズ(${expected}バイト)に対し、実際のファイルサイズ(${buffer.byteLength}バイト)が不足しています（壊れているか、バイナリSTLではない可能性があります）。`,
    );
  }
  const triangles: StlTriangle[] = new Array(count);
  let offset = 84;
  for (let i = 0; i < count; i++) {
    offset += 12; // skip the stored facet normal (3x float32) -- not needed, the inside test below only uses vertex positions
    const a = readVertex(view, offset);
    offset += 12;
    const b = readVertex(view, offset);
    offset += 12;
    const c = readVertex(view, offset);
    offset += 12;
    offset += 2; // attribute byte count
    triangles[i] = { a, b, c };
  }
  return triangles;
}

function readVertex(view: DataView, offset: number): StlVertex {
  return { x: view.getFloat32(offset, true), y: view.getFloat32(offset + 4, true), z: view.getFloat32(offset + 8, true) };
}

export interface MeshFillOptions {
  /** Target particle density, particles per unit^3 -- the same knob as ball seeding's particlesPerUnitVolume (seeding.ts). Voxel spacing h = particlesPerUnitVolume^(-1/3), so on average one grid point falls in every 1/particlesPerUnitVolume of volume. */
  particlesPerUnitVolume: number;
  /** MPM world domain span (sim.ts's DOMAIN_SIZE). */
  domainSize: number;
  /** Fraction of domainSize the mesh's longest bounding-box edge is scaled to (T2f-import-stl.md "既定はドメインの6割程度" -> 0.6). */
  targetLongestFraction: number;
  /** World Y the mesh's lowest point should rest at (pass marginWorld(gridN) + a small clearance -- the same convention main.ts's liftAboveGround uses for S1 balls). */
  floorY: number;
  /** Hard cap on emitted particles; see MAX_MESH_PARTICLES. */
  maxParticles: number;
}

export interface MeshFillResult {
  /** World-space (already scaled + centered on x/z + rested on floorY) particle positions filling the mesh's interior. */
  positions: StlVertex[];
  /** Estimated filled volume (voxel count * voxelSize^3) BEFORE any thinning -- used so a thinned particle set still conserves the shape's total mass (same idea as seeding.ts's per-ball mass conservation). */
  totalVolume0: number;
  voxelSize: number;
  /** Uniform scale factor applied to the raw STL coordinates to reach targetLongestFraction * domainSize. */
  scale: number;
  /** True if the raw fill exceeded maxParticles and was deterministically thinned. */
  truncated: boolean;
  /** Particle count before thinning (equals positions.length when truncated is false). */
  requestedCount: number;
  rawTriangleCount: number;
}

/**
 * Normalize (uniform-scale to targetLongestFraction*domainSize, center on
 * x/z, rest on floorY -- T2f-import-stl.md's "大きさと置き方を正規化") then
 * voxel-fill the mesh's interior: for each grid point on an h-spaced
 * lattice, cast a ray toward +X and count triangle crossings -- an odd
 * count means the point is inside (the classic ray-casting
 * point-in-polyhedron test; see e.g. O'Rourke, *Computational Geometry in
 * C*, 2nd ed., §7.5). The ray/triangle intersection itself is Möller &
 * Trumbore, "Fast, Minimum Storage Ray-Triangle Intersection", 1997,
 * specialized below to a ray direction of exactly (1,0,0).
 *
 * Non-watertight meshes (holes, self-intersecting or flipped-normal
 * geometry) can make this parity test wrong near the defect --
 * T2f-import-stl.md explicitly scopes mesh repair and a watertightness
 * check OUT of this task (that is Blender's job); this function does not
 * attempt to detect or correct that, it is surfaced to the user as a
 * caveat instead (see the hint text next to the STL file input in ui.ts).
 */
export function fillMeshWithParticles(rawTriangles: StlTriangle[], options: MeshFillOptions): MeshFillResult {
  if (rawTriangles.length === 0) throw new Error("STLに三角形がありません。");

  // 1. Raw bounding box, uniform scale so the longest edge hits the target size.
  const rawBounds = computeBounds(rawTriangles);
  const longestRaw = Math.max(rawBounds.size.x, rawBounds.size.y, rawBounds.size.z);
  if (!(longestRaw > 0)) throw new Error("STLの大きさが0です（退化した形状です）。");
  const scale = (options.domainSize * options.targetLongestFraction) / longestRaw;

  // 2. Transform every vertex: scale, then center x/z at the domain's
  // center (0) and rest the lowest point exactly at floorY (the caller is
  // responsible for baking in a small clearance above the actual floor,
  // matching main.ts's liftAboveGround `clearance = floorY + 0.05` convention).
  const scaledBounds = scaleBounds(rawBounds, scale);
  const shiftX = -(scaledBounds.min.x + scaledBounds.max.x) / 2;
  const shiftZ = -(scaledBounds.min.z + scaledBounds.max.z) / 2;
  const shiftY = options.floorY - scaledBounds.min.y;
  const transform = (v: StlVertex): StlVertex => ({ x: v.x * scale + shiftX, y: v.y * scale + shiftY, z: v.z * scale + shiftZ });
  const triangles: StlTriangle[] = rawTriangles.map((t) => ({ a: transform(t.a), b: transform(t.b), c: transform(t.c) }));
  const bounds = computeBounds(triangles);

  // 3. Voxel grid spacing from the density knob.
  const h = Math.cbrt(1 / Math.max(1e-6, options.particlesPerUnitVolume));

  // Precompute each triangle's Y/Z bounding box once (cheap numeric bounds,
  // reused by every (y,z) column below instead of recomputing min/max of 3
  // vertices per column x triangle pair).
  const n = triangles.length;
  const triMinY = new Float64Array(n);
  const triMaxY = new Float64Array(n);
  const triMinZ = new Float64Array(n);
  const triMaxZ = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const { a, b, c } = triangles[i];
    triMinY[i] = Math.min(a.y, b.y, c.y);
    triMaxY[i] = Math.max(a.y, b.y, c.y);
    triMinZ[i] = Math.min(a.z, b.z, c.z);
    triMaxZ[i] = Math.max(a.z, b.z, c.z);
  }

  const margin = h * 0.5;
  const minIx = Math.floor((bounds.min.x - margin) / h);
  const maxIx = Math.ceil((bounds.max.x + margin) / h);
  const minIy = Math.floor((bounds.min.y - margin) / h);
  const maxIy = Math.ceil((bounds.max.y + margin) / h);
  const minIz = Math.floor((bounds.min.z - margin) / h);
  const maxIz = Math.ceil((bounds.max.z + margin) / h);
  const rayOriginX = bounds.min.x - Math.max(1, margin * 4); // safely outside the mesh on the -X side, for every column

  const positions: StlVertex[] = [];
  const candidateIdx: number[] = [];
  const hits: number[] = [];
  for (let iy = minIy; iy <= maxIy; iy++) {
    const py = iy * h;
    for (let iz = minIz; iz <= maxIz; iz++) {
      const pz = iz * h;
      candidateIdx.length = 0;
      for (let i = 0; i < n; i++) {
        if (py >= triMinY[i] && py <= triMaxY[i] && pz >= triMinZ[i] && pz <= triMaxZ[i]) candidateIdx.push(i);
      }
      if (candidateIdx.length === 0) continue;
      hits.length = 0;
      for (const i of candidateIdx) {
        const t = rayTriangleIntersectX(rayOriginX, py, pz, triangles[i]);
        if (t !== null) hits.push(rayOriginX + t);
      }
      if (hits.length === 0) continue;
      hits.sort((a, b) => a - b);
      for (let ix = minIx; ix <= maxIx; ix++) {
        const px = ix * h;
        let crossings = 0;
        for (const hx of hits) if (hx < px) crossings++;
        if (crossings % 2 === 1) positions.push({ x: px, y: py, z: pz });
      }
    }
  }

  const requestedCount = positions.length;
  const totalVolume0 = requestedCount * h * h * h;
  let finalPositions = positions;
  let truncated = false;
  if (requestedCount > options.maxParticles && requestedCount > 0) {
    truncated = true;
    // Deterministic stride-based thinning (not random): keeps roughly even
    // spatial coverage of the filled volume rather than e.g. dropping the
    // whole tail of the scan order. totalVolume0 above is computed from the
    // PRE-thinning count, so downstream mass allocation (history.ts's
    // "seedMesh" case) gives each surviving particle proportionally more
    // mass -- the shape's total mass is conserved across thinning, same
    // idea as seeding.ts's per-ball mass conservation.
    const stride = requestedCount / options.maxParticles;
    const thinned: StlVertex[] = [];
    for (let k = 0; thinned.length < options.maxParticles; k++) {
      const idx = Math.floor(k * stride);
      if (idx >= requestedCount) break;
      thinned.push(positions[idx]);
    }
    finalPositions = thinned;
  }

  return { positions: finalPositions, totalVolume0, voxelSize: h, scale, truncated, requestedCount, rawTriangleCount: rawTriangles.length };
}

interface Bounds3 {
  min: StlVertex;
  max: StlVertex;
  size: StlVertex;
}

function computeBounds(triangles: StlTriangle[]): Bounds3 {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const tri of triangles) {
    for (const v of [tri.a, tri.b, tri.c]) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.z < minZ) minZ = v.z;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
      if (v.z > maxZ) maxZ = v.z;
    }
  }
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ }, size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ } };
}

function scaleBounds(b: Bounds3, s: number): Bounds3 {
  return {
    min: { x: b.min.x * s, y: b.min.y * s, z: b.min.z * s },
    max: { x: b.max.x * s, y: b.max.y * s, z: b.max.z * s },
    size: { x: b.size.x * s, y: b.size.y * s, z: b.size.z * s },
  };
}
