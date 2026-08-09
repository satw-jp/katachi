// ---------------------------------------------------------------------------
// Shared ray/triangle point-in-mesh test, extracted from
// src/studies/mpm/stlImport.ts's fillMeshWithParticles so a second consumer
// (S-skin's partition.ts, T13 audit fix P0-1) can reuse the EXACT same
// ray-parity math instead of re-deriving a slightly different one. The
// Möller-Trumbore ray/triangle intersection below is copied verbatim from
// stlImport.ts (same numerics, same +X-ray specialization); stlImport.ts now
// imports it from here instead of keeping its own private copy.
// ---------------------------------------------------------------------------

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Tri3 {
  a: Vec3;
  b: Vec3;
  c: Vec3;
}

/**
 * Möller & Trumbore (1997) ray-triangle intersection, specialized to a ray
 * with direction exactly (1,0,0) starting at (originX, py, pz). Returns the
 * ray parameter t (> 0, i.e. a forward hit) or null.
 */
export function rayTriangleIntersectX(originX: number, py: number, pz: number, tri: Tri3): number | null {
  const EPS = 1e-9;
  const { a, b, c } = tri;
  const e1x = b.x - a.x;
  const e1y = b.y - a.y;
  const e1z = b.z - a.z;
  const e2x = c.x - a.x;
  const e2y = c.y - a.y;
  const e2z = c.z - a.z;
  // h = cross(dir, e2), dir = (1,0,0) => h = (0, -e2z, e2y)
  const hx = 0;
  const hy = -e2z;
  const hz = e2y;
  const det = e1x * hx + e1y * hy + e1z * hz;
  if (Math.abs(det) < EPS) return null; // ray parallel to the triangle's plane
  const invDet = 1 / det;
  const sx = originX - a.x;
  const sy = py - a.y;
  const sz = pz - a.z;
  const u = (sx * hx + sy * hy + sz * hz) * invDet;
  if (u < 0 || u > 1) return null;
  // q = cross(s, e1)
  const qx = sy * e1z - sz * e1y;
  const qy = sz * e1x - sx * e1z;
  const qz = sx * e1y - sy * e1x;
  // dir . q = (1,0,0) . q = qx
  const v = qx * invDet;
  if (v < 0 || u + v > 1) return null;
  const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
  if (t <= EPS) return null;
  return t;
}

export interface InsideTester {
  /** Ray-parity point-in-mesh test (odd number of +X crossings = inside).
   * Assumes `triangles` forms a closed (watertight) surface -- on an open
   * mesh, points near the defect can misclassify, same caveat
   * fillMeshWithParticles documents for its own use of this test. */
  isInside(x: number, y: number, z: number): boolean;
  triangleCount: number;
}

const NULL_TESTER: InsideTester = { isInside: () => false, triangleCount: 0 };

/**
 * Build a Y/Z-bucketed inside/outside tester for `triangles`: same +X
 * ray-parity test mpm/stlImport.ts's fillMeshWithParticles uses for its
 * regular voxel-grid fill, generalized here to arbitrary (not grid-aligned)
 * query points via a uniform Y/Z spatial hash so repeated queries don't
 * rescan every triangle (targets ~4 triangles/bucket on average, a
 * heuristic, not a tuned constant).
 */
export function buildInsideTester(triangles: Tri3[]): InsideTester {
  if (triangles.length === 0) return NULL_TESTER;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const t of triangles) {
    for (const v of [t.a, t.b, t.c]) {
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
      if (v.z < minZ) minZ = v.z;
      if (v.z > maxZ) maxZ = v.z;
    }
  }
  const originX = minX - Math.max(1, (maxX - minX) * 0.1 + 1);
  const sizeY = Math.max(1e-6, maxY - minY);
  const sizeZ = Math.max(1e-6, maxZ - minZ);
  const bucketsTarget = Math.max(1, Math.ceil(triangles.length / 4));
  const aspect = sizeY / sizeZ;
  const gridY = Math.max(1, Math.round(Math.sqrt(bucketsTarget * aspect)));
  const gridZ = Math.max(1, Math.round(bucketsTarget / gridY));
  const cellY = sizeY / gridY;
  const cellZ = sizeZ / gridZ;
  const buckets: number[][] = new Array(gridY * gridZ);
  for (let i = 0; i < buckets.length; i++) buckets[i] = [];
  const clampY = (iy: number) => Math.min(gridY - 1, Math.max(0, iy));
  const clampZ = (iz: number) => Math.min(gridZ - 1, Math.max(0, iz));
  const bucketIndex = (iy: number, iz: number) => clampY(iy) * gridZ + clampZ(iz);

  for (let i = 0; i < triangles.length; i++) {
    const t = triangles[i];
    const triMinY = Math.min(t.a.y, t.b.y, t.c.y);
    const triMaxY = Math.max(t.a.y, t.b.y, t.c.y);
    const triMinZ = Math.min(t.a.z, t.b.z, t.c.z);
    const triMaxZ = Math.max(t.a.z, t.b.z, t.c.z);
    // Clamp BEFORE looping, not just inside bucketIndex: a triangle whose
    // bbox touches the grid's outer edge gets floor(max/cell) === gridY
    // (one past the last valid index), which an unclamped `iy<=iy1` loop
    // then iterates as two distinct raw values (gridY-1 and gridY) that
    // both clamp to the SAME bucket -- pushing this triangle's index into
    // that bucket twice (or 4x, if both Y and Z hit this). isInside's
    // even/odd crossing parity then double- or quadruple-counts that
    // triangle's hit, silently flipping inside<->outside for any query
    // whose ray passes through it. Found via partition.test.ts's point-in-
    // mesh fixture -- this directly corrupts the Monte Carlo fidelity
    // sampling `verifyMeshPartition` (partition.ts) feeds into the gate.
    const iy0 = clampY(Math.floor((triMinY - minY) / cellY));
    const iy1 = clampY(Math.floor((triMaxY - minY) / cellY));
    const iz0 = clampZ(Math.floor((triMinZ - minZ) / cellZ));
    const iz1 = clampZ(Math.floor((triMaxZ - minZ) / cellZ));
    for (let iy = iy0; iy <= iy1; iy++) {
      for (let iz = iz0; iz <= iz1; iz++) buckets[bucketIndex(iy, iz)].push(i);
    }
  }

  const isInside = (x: number, y: number, z: number): boolean => {
    if (y < minY || y > maxY || z < minZ || z > maxZ) return false;
    const iy = Math.floor((y - minY) / cellY);
    const iz = Math.floor((z - minZ) / cellZ);
    const idxs = buckets[bucketIndex(iy, iz)];
    let crossings = 0;
    for (const i of idxs) {
      const t = rayTriangleIntersectX(originX, y, z, triangles[i]);
      if (t !== null && originX + t < x) crossings++;
    }
    return crossings % 2 === 1;
  };
  return { isInside, triangleCount: triangles.length };
}
