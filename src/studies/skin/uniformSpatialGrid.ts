export interface SpatialPoint3 {
  x: number;
  y: number;
  z: number;
}

export interface SpatialBounds3 {
  min: SpatialPoint3;
  max: SpatialPoint3;
}

export interface UniformSpatialGrid3 {
  readonly points: Float32Array;
  readonly pointCount: number;
  readonly cellSize: number;
  readonly bounds: SpatialBounds3;
  readonly cells: ReadonlyMap<string, readonly number[]>;
}

function cellKey(x: number, y: number, z: number): string {
  return x + "|" + y + "|" + z;
}

function finitePoint(points: Float32Array, index: number): SpatialPoint3 {
  const offset = index * 3;
  const point = { x: points[offset], y: points[offset + 1], z: points[offset + 2] };
  if (![point.x, point.y, point.z].every(Number.isFinite)) {
    throw new Error("uniform spatial grid requires finite points");
  }
  return point;
}

export function buildUniformSpatialGrid3(
  points: Float32Array,
  requestedCellSize?: number,
): UniformSpatialGrid3 {
  if (points.length === 0 || points.length % 3 !== 0) {
    throw new Error("uniform spatial grid requires xyz points");
  }
  const pointCount = points.length / 3;
  const first = finitePoint(points, 0);
  const min = { ...first };
  const max = { ...first };
  for (let index = 1; index < pointCount; index++) {
    const point = finitePoint(points, index);
    min.x = Math.min(min.x, point.x); min.y = Math.min(min.y, point.y); min.z = Math.min(min.z, point.z);
    max.x = Math.max(max.x, point.x); max.y = Math.max(max.y, point.y); max.z = Math.max(max.z, point.z);
  }
  const longest = Math.max(max.x - min.x, max.y - min.y, max.z - min.z, 1e-9);
  const targetAxisCells = Math.max(1, Math.cbrt(pointCount / 6));
  const automatic = longest / targetAxisCells;
  const cellSize = Number.isFinite(requestedCellSize) && requestedCellSize! > 0
    ? requestedCellSize!
    : Math.max(longest / 512, automatic);
  const mutable = new Map<string, number[]>();
  for (let index = 0; index < pointCount; index++) {
    const point = finitePoint(points, index);
    const ix = Math.floor((point.x - min.x) / cellSize);
    const iy = Math.floor((point.y - min.y) / cellSize);
    const iz = Math.floor((point.z - min.z) / cellSize);
    const key = cellKey(ix, iy, iz);
    const bucket = mutable.get(key);
    if (bucket) bucket.push(index);
    else mutable.set(key, [index]);
  }
  return {
    points,
    pointCount,
    cellSize,
    bounds: { min, max },
    cells: mutable,
  };
}

export function queryUniformSpatialGridSphere(
  grid: UniformSpatialGrid3,
  center: SpatialPoint3,
  radius: number,
): number[] {
  if (![center.x, center.y, center.z, radius].every(Number.isFinite) || radius < 0) return [];
  const { min } = grid.bounds;
  const loX = Math.floor((center.x - radius - min.x) / grid.cellSize);
  const hiX = Math.floor((center.x + radius - min.x) / grid.cellSize);
  const loY = Math.floor((center.y - radius - min.y) / grid.cellSize);
  const hiY = Math.floor((center.y + radius - min.y) / grid.cellSize);
  const loZ = Math.floor((center.z - radius - min.z) / grid.cellSize);
  const hiZ = Math.floor((center.z + radius - min.z) / grid.cellSize);
  const radiusSquared = radius * radius;
  const result: number[] = [];
  for (let ix = loX; ix <= hiX; ix++) {
    for (let iy = loY; iy <= hiY; iy++) {
      for (let iz = loZ; iz <= hiZ; iz++) {
        const bucket = grid.cells.get(cellKey(ix, iy, iz));
        if (!bucket) continue;
        for (const index of bucket) {
          const offset = index * 3;
          const dx = grid.points[offset] - center.x;
          const dy = grid.points[offset + 1] - center.y;
          const dz = grid.points[offset + 2] - center.z;
          if (dx * dx + dy * dy + dz * dz <= radiusSquared) result.push(index);
        }
      }
    }
  }
  return result;
}

function rayBoundsInterval(
  origin: SpatialPoint3,
  direction: SpatialPoint3,
  bounds: SpatialBounds3,
  padding: number,
): [number, number] | null {
  let near = 0;
  let far = Number.POSITIVE_INFINITY;
  for (const axis of ["x", "y", "z"] as const) {
    const lower = bounds.min[axis] - padding;
    const upper = bounds.max[axis] + padding;
    const component = direction[axis];
    if (Math.abs(component) < 1e-12) {
      if (origin[axis] < lower || origin[axis] > upper) return null;
      continue;
    }
    const a = (lower - origin[axis]) / component;
    const b = (upper - origin[axis]) / component;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
    if (far < near) return null;
  }
  return Number.isFinite(far) && far >= 0 ? [Math.max(0, near), far] : null;
}

/**
 * Returns only points from grid cells touched by the ray and its immediate
 * cell neighbourhood. Callers perform the exact screen-distance/depth test.
 */
export function queryUniformSpatialGridRayNeighborhood(
  grid: UniformSpatialGrid3,
  origin: SpatialPoint3,
  direction: SpatialPoint3,
  neighbourLayers = 1,
): number[] {
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (!(length > 1e-12) || !Number.isFinite(length)) return [];
  const ray = { x: direction.x / length, y: direction.y / length, z: direction.z / length };
  const layers = Math.max(0, Math.floor(neighbourLayers));
  const interval = rayBoundsInterval(origin, ray, grid.bounds, grid.cellSize * (layers + 0.5));
  if (!interval) return [];
  const [near, far] = interval;
  const step = grid.cellSize * 0.45;
  const visitedCells = new Set<string>();
  const visitedPoints = new Set<number>();
  const result: number[] = [];
  const sampleCount = Math.max(1, Math.ceil((far - near) / step));
  for (let sample = 0; sample <= sampleCount; sample++) {
    const t = Math.min(far, near + sample * step);
    const x = origin.x + ray.x * t;
    const y = origin.y + ray.y * t;
    const z = origin.z + ray.z * t;
    const baseX = Math.floor((x - grid.bounds.min.x) / grid.cellSize);
    const baseY = Math.floor((y - grid.bounds.min.y) / grid.cellSize);
    const baseZ = Math.floor((z - grid.bounds.min.z) / grid.cellSize);
    for (let dx = -layers; dx <= layers; dx++) {
      for (let dy = -layers; dy <= layers; dy++) {
        for (let dz = -layers; dz <= layers; dz++) {
          const key = cellKey(baseX + dx, baseY + dy, baseZ + dz);
          if (visitedCells.has(key)) continue;
          visitedCells.add(key);
          const bucket = grid.cells.get(key);
          if (!bucket) continue;
          for (const index of bucket) {
            if (visitedPoints.has(index)) continue;
            visitedPoints.add(index);
            result.push(index);
          }
        }
      }
    }
  }
  return result;
}
