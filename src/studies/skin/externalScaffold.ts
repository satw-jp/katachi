/**
 * Printable, removable support columns owned by Katachi.
 *
 * Unlike Bambu Support Enforcer volumes, these columns are the complete
 * support geometry. They cover every plate-reachable diagnosed overhang by default, travel only
 * vertically from the plate, and end in a printable contact pad that overlaps
the target Surface. An outer-band comparison mode remains available for regression and research.
 */

export interface ExternalScaffoldOptions {
  coverageMode: "allReachable" | "outerBand";
  perimeterBandMm: number;
  spacingMm: number;
  shaftRadiusMm: number;
  baseRadiusMm: number;
  tipRadiusMm: number;
  contactOverlapMm: number;
  /** Extra downward reach so every pillar, not a coarse BODY extremum, defines the build-plate plane. */
  plateAnchorDropMm: number;
  baseHeightMm: number;
  tipHeightMm: number;
  xyClearanceMm: number;
  sides: number;
}

export interface ExternalScaffoldTarget {
  xMm: number;
  yMm: number;
  zMm: number;
  /** Optional contact-only enlargement for slicer-reported floating shells. */
  contactRadiusMm?: number;
  contactOverlapMm?: number;
}

export interface ExternalScaffoldStats {
  reachableFaceCount: number;
  coverageFaceCount: number;
  perimeterFaceCount: number;
  collisionRejectedFaceCount: number;
  shortRejectedFaceCount: number;
  spacingRejectedFaceCount: number;
  explicitTargetCount: number;
  explicitTargetCollisionRejectedCount: number;
  explicitTargetShortRejectedCount: number;
  explicitTargetEmbeddedColumnCount: number;
  explicitTargetSpacingRejectedCount: number;
  explicitTargetPillarCount: number;
  pillarCount: number;
  scaffoldFaceCount: number;
  plateZMm: number;
}

export interface ExternalScaffoldResult {
  positions: Float32Array;
  /** Exact selected columns in millimetres, reused by the fused SDF export. */
  pillars: ExternalScaffoldPillar[];
  stats: ExternalScaffoldStats;
}

export interface ExternalScaffoldPillar {
  xMm: number;
  yMm: number;
  plateZMm: number;
  targetZMm: number;
  topZMm: number;
  plateAnchored: boolean;
  contactRadiusMm: number;
}

export const DEFAULT_EXTERNAL_SCAFFOLD_OPTIONS: ExternalScaffoldOptions = {
  coverageMode: "allReachable",
  perimeterBandMm: 4,
  spacingMm: 0.8,
  // A 1.40 mm diameter survives almost three final 0.50 mm mesh cells and
  // yields roughly three printable tracks with the A1 mini profile.
  shaftRadiusMm: 0.70,
  // A one-millimetre-high fourth-power pad cannot disappear between two
  // 0.50 mm final-mesh samples. Its 0.90 mm radius also keeps at least
  // three 0.50 mm printable tracks at the middle of Bambu layer 1.
  baseRadiusMm: 0.90,
  // The final fused export samples an 80 mm body at >=160 cells (~0.5 mm).
  // The nominal contact starts at one millimetre; scaffoldFusion widens it
  // only to the 1.40 mm shaft diameter so it remains printable and removable.
  tipRadiusMm: 0.50,
  // Reach through the maximum half-voxel phase error between the diagnosed
  // Surface mesh and the analytic SDF remesh. The spherical neck at the
  // nominal surface remains under 1 mm in diameter for breakaway removal.
  contactOverlapMm: 0.65,
  // One millimetre is two final 80 mm / 160-grid cells and safely covers
  // coarse-versus-final extrema without relying on slicer auto-drop.
  plateAnchorDropMm: 1.0,
  baseHeightMm: 1.0,
  tipHeightMm: 0.9,
  xyClearanceMm: 0.05,
  sides: 8,
};

type Point2 = { x: number; y: number };
type Triangle = { ax: number; ay: number; az: number; bx: number; by: number; bz: number; cx: number; cy: number; cz: number };
type Candidate = { x: number; y: number; z: number; startZ: number; plateAnchored: boolean; hullDistance: number; sourceIndex: number; sourceKind: "diagnosis" | "sliceFeedback"; contactRadiusMm: number; contactOverlapMm: number };

const BARYCENTRIC_EPSILON = 1e-9;
const TARGET_CONTACT_EXCLUSION_MM = 0.22;

function triangleAt(positions: Float32Array, offset: number): Triangle | null {
  if (offset + 8 >= positions.length) return null;
  const values = Array.from(positions.subarray(offset, offset + 9));
  if (!values.every(Number.isFinite)) return null;
  const [ax, ay, az, bx, by, bz, cx, cy, cz] = values;
  const abx = bx - ax; const aby = by - ay; const abz = bz - az;
  const acx = cx - ax; const acy = cy - ay; const acz = cz - az;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  if (!Number.isFinite(nx + ny + nz) || (nx === 0 && ny === 0 && nz === 0)) return null;
  return { ax, ay, az, bx, by, bz, cx, cy, cz };
}

function zAtXY(triangle: Triangle, x: number, y: number): number | null {
  const denominator = (triangle.by - triangle.cy) * (triangle.ax - triangle.cx)
    + (triangle.cx - triangle.bx) * (triangle.ay - triangle.cy);
  if (!Number.isFinite(denominator) || denominator === 0) return null;
  const u = ((triangle.by - triangle.cy) * (x - triangle.cx) + (triangle.cx - triangle.bx) * (y - triangle.cy)) / denominator;
  const v = ((triangle.cy - triangle.ay) * (x - triangle.cx) + (triangle.ax - triangle.cx) * (y - triangle.cy)) / denominator;
  const w = 1 - u - v;
  if (u < -BARYCENTRIC_EPSILON || v < -BARYCENTRIC_EPSILON || w < -BARYCENTRIC_EPSILON) return null;
  return u * triangle.az + v * triangle.bz + w * triangle.cz;
}

function pointKey(point: Point2): string {
  return `${Math.fround(point.x)},${Math.fround(point.y)}`;
}

function cross(origin: Point2, a: Point2, b: Point2): number {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

function convexHull(points: Point2[]): Point2[] {
  const unique = new Map<string, Point2>();
  for (const point of points) if (Number.isFinite(point.x + point.y)) unique.set(pointKey(point), point);
  const sorted = [...unique.values()].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) throw new Error("Fail closed: 外周hullを作る点が不足しています");
  const lower: Point2[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: Point2[] = [];
  for (let index = sorted.length - 1; index >= 0; index--) {
    const point = sorted[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function distanceToSegment(point: Point2, a: Point2, b: Point2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const denominator = dx * dx + dy * dy;
  const t = denominator > 0 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / denominator)) : 0;
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

function distanceToHull(point: Point2, hull: Point2[]): number {
  let distance = Infinity;
  for (let index = 0; index < hull.length; index++) {
    distance = Math.min(distance, distanceToSegment(point, hull[index], hull[(index + 1) % hull.length]));
  }
  return distance;
}

function bounds(positions: Float32Array): { minZ: number; extent: number } {
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (let offset = 0; offset + 2 < positions.length; offset += 3) {
    const x = positions[offset]; const y = positions[offset + 1]; const z = positions[offset + 2];
    if (!Number.isFinite(x + y + z)) throw new Error("Fail closed: BODYに非有限座標があります");
    minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
  }
  if (!Number.isFinite(minZ)) throw new Error("Fail closed: BODYが空です");
  return { minZ, extent: Math.max(maxX - minX, maxY - minY, maxZ - minZ) };
}

function cellKey(x: number, y: number): string { return `${x}:${y}`; }

function buildBodyIndex(positions: Float32Array, cellSize: number): Map<string, Triangle[]> {
  if (positions.length === 0 || positions.length % 9 !== 0) throw new Error("Fail closed: BODY triangle bufferが不正です");
  const grid = new Map<string, Triangle[]>();
  let valid = 0;
  for (let offset = 0; offset < positions.length; offset += 9) {
    const triangle = triangleAt(positions, offset);
    if (!triangle) throw new Error("Fail closed: BODYに無効面があります");
    valid++;
    const minX = Math.floor(Math.min(triangle.ax, triangle.bx, triangle.cx) / cellSize);
    const maxX = Math.floor(Math.max(triangle.ax, triangle.bx, triangle.cx) / cellSize);
    const minY = Math.floor(Math.min(triangle.ay, triangle.by, triangle.cy) / cellSize);
    const maxY = Math.floor(Math.max(triangle.ay, triangle.by, triangle.cy) / cellSize);
    for (let gx = minX; gx <= maxX; gx++) for (let gy = minY; gy <= maxY; gy++) {
      const key = cellKey(gx, gy);
      const bucket = grid.get(key);
      if (bucket) bucket.push(triangle); else grid.set(key, [triangle]);
    }
  }
  if (!valid) throw new Error("Fail closed: BODYに有効面がありません");
  return grid;
}

function corridorIsClear(
  grid: Map<string, Triangle[]>,
  cellSize: number,
  candidate: Candidate,
  plateZ: number,
  topZ: number,
  radius: number,
  epsilon: number,
): boolean {
  const samples: Point2[] = [{ x: candidate.x, y: candidate.y }];
  for (let index = 0; index < 8; index++) {
    const angle = index * Math.PI / 4;
    samples.push({ x: candidate.x + Math.cos(angle) * radius, y: candidate.y + Math.sin(angle) * radius });
  }
  for (const sample of samples) {
    const bucket = grid.get(cellKey(Math.floor(sample.x / cellSize), Math.floor(sample.y / cellSize))) ?? [];
    for (const triangle of bucket) {
      const hitZ = zAtXY(triangle, sample.x, sample.y);
      if (hitZ !== null && hitZ > plateZ + epsilon && hitZ < topZ - epsilon) return false;
    }
  }
  return true;
}

function appendTriangle(target: number[], a: number[], b: number[], c: number[]): void {
  target.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
}

function appendPillar(
  target: number[],
  candidate: Candidate,
  plateZ: number,
  topZ: number,
  options: ExternalScaffoldOptions,
): void {
  const sides = Math.max(6, Math.round(options.sides));
  const baseEnd = Math.min(topZ, plateZ + options.baseHeightMm);
  const tipStart = Math.max(baseEnd, topZ - options.tipHeightMm);
  const rings: Array<{ z: number; radius: number }> = [{ z: plateZ, radius: options.baseRadiusMm }];
  if (baseEnd > plateZ + 1e-6) rings.push({ z: baseEnd, radius: options.shaftRadiusMm });
  if (tipStart > rings[rings.length - 1].z + 1e-6) rings.push({ z: tipStart, radius: options.shaftRadiusMm });
  if (topZ > rings[rings.length - 1].z + 1e-6) rings.push({ z: topZ, radius: options.tipRadiusMm });
  const points = rings.map((ring) => Array.from({ length: sides }, (_, index) => {
    const angle = index * Math.PI * 2 / sides;
    return [candidate.x + Math.cos(angle) * ring.radius, candidate.y + Math.sin(angle) * ring.radius, ring.z];
  }));
  const bottomCenter = [candidate.x, candidate.y, plateZ];
  const topCenter = [candidate.x, candidate.y, topZ];
  for (let side = 0; side < sides; side++) {
    const next = (side + 1) % sides;
    appendTriangle(target, bottomCenter, points[0][next], points[0][side]);
    appendTriangle(target, topCenter, points[points.length - 1][side], points[points.length - 1][next]);
  }
  for (let ring = 0; ring + 1 < points.length; ring++) {
    for (let side = 0; side < sides; side++) {
      const next = (side + 1) % sides;
      appendTriangle(target, points[ring][side], points[ring][next], points[ring + 1][next]);
      appendTriangle(target, points[ring][side], points[ring + 1][next], points[ring + 1][side]);
    }
  }
}

export function buildExternalPerimeterScaffold(
  reachablePositionsMm: Float32Array,
  finalSurfacePositionsMm: Float32Array,
  bodyPositionsMm: Float32Array,
  partialOptions: Partial<ExternalScaffoldOptions> = {},
  explicitTargetsMm: ReadonlyArray<ExternalScaffoldTarget> = [],
): ExternalScaffoldResult {
  if (reachablePositionsMm.length % 9 !== 0) throw new Error("到達面bufferの長さが9の倍数ではありません");
  if (finalSurfacePositionsMm.length === 0 || finalSurfacePositionsMm.length % 9 !== 0) throw new Error("最終Surface bufferが不正です");
  const options = { ...DEFAULT_EXTERNAL_SCAFFOLD_OPTIONS, ...partialOptions };
  if (
    (options.coverageMode !== "allReachable" && options.coverageMode !== "outerBand") || !(options.perimeterBandMm > 0) || !(options.spacingMm > 0) || !(options.shaftRadiusMm > 0)
    || !(options.baseRadiusMm >= options.shaftRadiusMm) || !(options.tipRadiusMm > 0)
    || !(options.contactOverlapMm >= 0 && options.contactOverlapMm <= 1) || !(options.plateAnchorDropMm >= 0) || !(options.xyClearanceMm >= 0)
  ) throw new Error("外周支柱optionが不正です");
  const bodyBounds = bounds(bodyPositionsMm);
  const plateZ = bodyBounds.minZ - options.plateAnchorDropMm;
  const cellSize = Math.max(0.25, bodyBounds.extent / 64);
  const bodyIndex = buildBodyIndex(bodyPositionsMm, cellSize);
  let hull: Point2[] | null = null;
  if (options.coverageMode === "outerBand") {
    const hullPoints: Point2[] = [];
    for (let offset = 0; offset < finalSurfacePositionsMm.length; offset += 3) {
      hullPoints.push({ x: finalSurfacePositionsMm[offset], y: finalSurfacePositionsMm[offset + 1] });
    }
    hull = convexHull(hullPoints);
  }
  const collisionEpsilon = Math.max(0.001, bodyBounds.extent * 1e-6);
  const clearRadius = options.shaftRadiusMm + options.xyClearanceMm;
  const candidates: Candidate[] = [];
  let coverageFaceCount = 0;
  let perimeterFaceCount = 0;
  let collisionRejectedFaceCount = 0;
  let shortRejectedFaceCount = 0;
  let explicitTargetCollisionRejectedCount = 0;
  let explicitTargetShortRejectedCount = 0;
  let explicitTargetEmbeddedColumnCount = 0;
  for (let index = 0; index < explicitTargetsMm.length; index++) {
    const target = explicitTargetsMm[index];
    if (!Number.isFinite(target.xMm + target.yMm + target.zMm)) throw new Error("明示支柱targetに非有限座標があります");
    const candidate: Candidate = {
      x: target.xMm, y: target.yMm, z: target.zMm, startZ: plateZ, plateAnchored: true, hullDistance: 0, sourceIndex: index, sourceKind: "sliceFeedback",
      contactRadiusMm: target.contactRadiusMm ?? options.tipRadiusMm,
      contactOverlapMm: target.contactOverlapMm ?? options.contactOverlapMm,
    };
    if (!(candidate.contactRadiusMm > 0 && candidate.contactRadiusMm <= 2) || !(candidate.contactOverlapMm >= 0 && candidate.contactOverlapMm <= 2)) {
      throw new Error("明示支柱targetの接触寸法が不正です");
    }
    const collisionTopZ = candidate.z - TARGET_CONTACT_EXCLUSION_MM;
    if (!corridorIsClear(bodyIndex, cellSize, candidate, plateZ, collisionTopZ, clearRadius, collisionEpsilon)) {
      explicitTargetEmbeddedColumnCount++;
    }
    candidates.push(candidate);
  }
  for (let offset = 0; offset < reachablePositionsMm.length; offset += 9) {
    const triangle = triangleAt(reachablePositionsMm, offset);
    if (!triangle) continue;
    const candidate: Candidate = {
      x: (triangle.ax + triangle.bx + triangle.cx) / 3,
      y: (triangle.ay + triangle.by + triangle.cy) / 3,
      z: (triangle.az + triangle.bz + triangle.cz) / 3,
      startZ: plateZ,
      plateAnchored: true,
      hullDistance: 0,
      sourceIndex: offset / 9,
      sourceKind: "diagnosis",
      contactRadiusMm: options.tipRadiusMm,
      contactOverlapMm: options.contactOverlapMm,
    };
    if (hull) {
      candidate.hullDistance = distanceToHull(candidate, hull);
      if (candidate.hullDistance > options.perimeterBandMm) continue;
      perimeterFaceCount++;
    }
    coverageFaceCount++;
    const collisionTopZ = candidate.z - TARGET_CONTACT_EXCLUSION_MM;
    if (collisionTopZ - plateZ < options.baseHeightMm + options.tipHeightMm + 0.2) {
      shortRejectedFaceCount++;
      continue;
    }
    if (!corridorIsClear(bodyIndex, cellSize, candidate, plateZ, collisionTopZ, clearRadius, collisionEpsilon)) {
      collisionRejectedFaceCount++;
      continue;
    }
    candidates.push(candidate);
  }
  candidates.sort((a, b) => (a.sourceKind === b.sourceKind ? 0 : a.sourceKind === "sliceFeedback" ? -1 : 1) || (a.sourceKind === "sliceFeedback" ? b.z - a.z : a.z - b.z) || a.hullDistance - b.hullDistance || a.x - b.x || a.y - b.y || a.sourceIndex - b.sourceIndex);
  const selected: Candidate[] = [];
  let spacingRejectedFaceCount = 0;
  let explicitTargetSpacingRejectedCount = 0;
  for (const candidate of candidates) {
    const minimumSpacing = candidate.sourceKind === "sliceFeedback"
      ? Math.min(options.spacingMm, options.shaftRadiusMm * 0.5)
      : options.spacingMm;
    if (selected.some((other) => Math.hypot(candidate.x - other.x, candidate.y - other.y) < minimumSpacing)) {
      if (candidate.sourceKind === "sliceFeedback") explicitTargetSpacingRejectedCount++;
      else spacingRejectedFaceCount++;
      continue;
    }
    selected.push(candidate);
  }
  const triangles: number[] = [];
  for (const candidate of selected) {
    const pillarOptions = candidate.plateAnchored ? options : {
      ...options,
      baseRadiusMm: options.shaftRadiusMm,
      tipRadiusMm: options.shaftRadiusMm,
      baseHeightMm: Math.min(options.baseHeightMm, options.shaftRadiusMm),
      tipHeightMm: Math.min(options.tipHeightMm, options.shaftRadiusMm),
    };
    appendPillar(triangles, candidate, candidate.startZ, candidate.z + candidate.contactOverlapMm, {
      ...pillarOptions,
      tipRadiusMm: candidate.contactRadiusMm,
    });
  }
  return {
    positions: new Float32Array(triangles),
    pillars: selected.map((candidate) => ({
      xMm: candidate.x,
      yMm: candidate.y,
      plateZMm: candidate.startZ,
      targetZMm: candidate.z,
      topZMm: candidate.z + candidate.contactOverlapMm,
      plateAnchored: candidate.plateAnchored,
      contactRadiusMm: candidate.contactRadiusMm,
    })),
    stats: {
      reachableFaceCount: reachablePositionsMm.length / 9,
      coverageFaceCount,
      perimeterFaceCount,
      collisionRejectedFaceCount,
      shortRejectedFaceCount,
      spacingRejectedFaceCount,
      explicitTargetCount: explicitTargetsMm.length,
      explicitTargetCollisionRejectedCount,
      explicitTargetShortRejectedCount,
      explicitTargetEmbeddedColumnCount,
      explicitTargetSpacingRejectedCount,
      explicitTargetPillarCount: selected.filter((candidate) => candidate.sourceKind === "sliceFeedback").length,
      pillarCount: selected.length,
      scaffoldFaceCount: triangles.length / 9,
      plateZMm: plateZ,
    },
  };
}
