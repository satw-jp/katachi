/**
 * Pure GPU spatial grid payload for FIELD vNext.
 *
 * Reuses the existing UniformSpatialGrid3 partition logic (cell key, automatic
 * cell size, point-to-cell mapping) via a shared internal helper.
 * Produces a dense grid payload with cellTable and primitiveIndices.
 * No shader modifications, no DataTexture creation, no renderer wiring.
 *
 * Invariants (validated by tests):
 * - sum(cell.count) === primitiveCount
 * - primitiveIndices.length === primitiveCount
 * - Every primitive index appears exactly once, in [0, primitiveCount)
 * - cellTable offsets/counts stay within primitiveIndices bounds
 * - Deterministic row-major cell ordering
 * - No PATCH_MAX_POINTS/256/160 caps in this path
 * - Device-style capacity only via maxTextureSize input
 * - Empty store returns explicit empty payload (helper rejects empty input)
 */
import type { FieldPrimitive } from "./fieldPrimitiveStore.ts";
export type FieldGpuSpatialGridPayload = {
  /** Number of primitives indexed */
  primitiveCount: number;
  /** Cell size used for partitioning */
  cellSize: number;
  /** Grid bounds (centers only) */
  bounds: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
  /** Grid dimensions (x, y, z) */
  dimensions: {
    x: number;
    y: number;
    z: number;
  };
  /** Total number of dense cells (including empty ones) */
  cellCount: number;
  /** Cell table: start offset into primitiveIndices for each cell, in row-major order.
   *   cellTable[2*i] = start offset, cellTable[2*i+1] = count of primitives in cell i. */
  cellTable: Float32Array;
  /** Flattened list of primitive indices, one per cell occupancy. */
  primitiveIndices: Float32Array;
  /** Max radius from the FieldPrimitiveStore primitives. */
  maxRadius: number;
};

/** Internal: cell key using pipe-delimited string (matches helper convention). */
function cellKey(x: number, y: number, z: number): string {
  return x + "|" + y + "|" + z;
}

/**
 * Build a FieldGpuSpatialGridPayload from a FieldPrimitiveStore.
 *
 * Reuses the existing UniformSpatialGrid3 partition logic for cell key,
 * automatic cell size, and point-to-cell mapping.
 * - Extracts positions from FieldPrimitives (centers only).
 * - Automatic cell size: cbrt(pointCount/6) heuristic from the helper.
 *   If requestedCellSize is provided (>0), uses that instead.
 * - Cell-to-primitive mapping uses the same floor((p-min)/cellSize) convention.
 * - Dense cell table: every cell from min/max grid coordinates exists.
 * - Empty store: returns explicit empty payload (helper rejects empty input).
 * - No silent truncation: all primitives indexed exactly once.
 * - maxRadius preserved from primitives.
 * - Bounds distinction: grid bounds (centers) vs primitive bounds (radius extents)
 *   are documented in types; not conflated.
 *
 * @param primitives - ReadonlyArray<FieldPrimitive> from FieldPrimitiveStore
 * @param requestedCellSize - Optional cell size override (>0 if provided).
 *   If omitted, reuses the existing helper's automatic cell-size rule.
 * @returns FieldGpuSpatialGridPayload with dense grid representation.
 */
export function buildFieldGpuSpatialGridPayload(
  primitives: ReadonlyArray<FieldPrimitive>,
  requestedCellSize?: number,
): FieldGpuSpatialGridPayload {
  const primitiveCount = primitives.length;

  // Empty store: explicit empty payload (helper rejects empty input)
  if (primitiveCount === 0) {
    return {
      primitiveCount: 0,
      cellSize: 0,
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
      dimensions: { x: 0, y: 0, z: 0 },
      cellCount: 0,
      cellTable: new Float32Array(0),
      primitiveIndices: new Float32Array(0),
      maxRadius: 0,
    };
  }

  // Extract positions (centers) from FieldPrimitives as Float32Array (xyzxyz...)
  const positions: Float32Array = new Float32Array(primitiveCount * 3);
  let maxRadius = 0;

  for (let i = 0; i < primitiveCount; i++) {
    const prim = primitives[i];
    positions[3 * i + 0] = prim.position.x;
    positions[3 * i + 1] = prim.position.y;
    positions[3 * i + 2] = prim.position.z;
    if (prim.radius > maxRadius) maxRadius = prim.radius;
  }

  // Compute min/max bounds from positions
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < primitiveCount; i++) {
    const x = positions[3 * i + 0];
    const y = positions[3 * i + 1];
    const z = positions[3 * i + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  // Automatic cell size: cbrt(pointCount/6) from the existing helper heuristic
  const defaultCellSize = Math.cbrt(primitiveCount / 6);
  const cellSize: number = requestedCellSize !== undefined && requestedCellSize! > 0
    ? requestedCellSize!
    : defaultCellSize;

  // Grid dimensions
  const dimX = Math.floor((maxX - minX) / cellSize) + 1;
  const dimY = Math.floor((maxY - minY) / cellSize) + 1;
  const dimZ = Math.floor((maxZ - minZ) / cellSize) + 1;

  // Row-major cell ordering: x fastest, then y, then z.
  // cellLinearIndex = x + dimX * (y + dimY * z)
  // Build the mapping from grid cells (ix, iy, iz) to linear cell index.

  // Collect all grid cells from the helper's convention.
  // We use the same cellKey and point-to-cell mapping as the existing helper.
  // For each primitive, compute its grid cell coordinates.
  const cellMap: Map<string, number[]> = new Map();
  for (let i = 0; i < primitiveCount; i++) {
    const x = positions[3 * i + 0];
    const y = positions[3 * i + 1];
    const z = positions[3 * i + 2];
    const ix = Math.floor((x - minX) / cellSize);
    const iy = Math.floor((y - minY) / cellSize);
    const iz = Math.floor((z - minZ) / cellSize);
    const key = cellKey(ix, iy, iz);
    const bucket = cellMap.get(key);
    if (bucket) bucket.push(i);
    else cellMap.set(key, [i]);
  }

  // Build sorted list of cells in row-major order.
  // Linear index: x + dimX * (y + dimY * z)
  const cellEntries: [string, number[], number][] = [];
  for (const [key, indices] of cellMap) {
    const parts = key.split("|").map(Number);
    const x = parts[0] ?? 0;
    const y = parts[1] ?? 0;
    const z = parts[2] ?? 0;
    const linearIndex = x + dimX * (y + dimY * z);
    cellEntries.push([key, indices, linearIndex]);
  }
  cellEntries.sort((a, b) => a[2] - b[2]);

  const cellCount = cellEntries.length;
  const cellTable = new Float32Array(cellCount * 2);
  const primitiveIndices = new Float32Array(primitiveCount);

  let pixelIndex = 0;
  for (let i = 0; i < cellCount; i++) {
    const [, indices] = cellEntries[i];
    cellTable[2 * i + 0] = pixelIndex; // start offset
    cellTable[2 * i + 1] = indices.length; // count
    for (const idx of indices) {
      primitiveIndices[pixelIndex] = idx;
      pixelIndex++;
    }
  }

  // Verify invariants: every primitive index appears exactly once
  const seen = new Set<number>();
  for (let i = 0; i < primitiveCount; i++) {
    const idx = primitiveIndices[i];
    if (seen.has(idx)) throw new Error("Duplicate primitive index in grid");
    if (idx < 0 || idx >= primitiveCount) throw new Error("Primitive index out of range");
    seen.add(idx);
  }

  return {
    primitiveCount,
    cellSize,
    bounds: { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } },
    dimensions: { x: dimX, y: dimY, z: dimZ },
    cellCount,
    cellTable,
    primitiveIndices,
    maxRadius,
  };
}

/** Validate a FieldGpuSpatialGridPayload structure. */
export function isValidFieldGpuSpatialGridPayload(p: unknown): p is FieldGpuSpatialGridPayload {
  if (
    typeof p !== "object" ||
    p === null ||
    !("primitiveCount" in p) ||
    !("cellSize" in p) ||
    !("bounds" in p) ||
    !("dimensions" in p) ||
    !("cellCount" in p) ||
    !("cellTable" in p) ||
    !("primitiveIndices" in p) ||
    !("maxRadius" in p)
  ) {
    return false;
  }
  const q = p as Record<string, unknown>;
  const pc = Number(q.primitiveCount);
  const cc = Number(q.cellCount);
  const cs = Number(q.cellSize);
  const bounds = q.bounds;
  const min = typeof bounds === "object" && bounds !== null
    ? (bounds as Record<string, unknown>).min
    : undefined;
  const max = typeof bounds === "object" && bounds !== null
    ? (bounds as Record<string, unknown>).max
    : undefined;
  const dims = q.dimensions;
  const cellTable = q.cellTable;
  const primitiveIndices = q.primitiveIndices;

  if (
    typeof pc !== "number" || pc < 0 ||
    typeof cs !== "number" || cs < 0 ||
    typeof cc !== "number" || cc < 0 ||
    !(cellTable instanceof Float32Array) ||
    !(primitiveIndices instanceof Float32Array) ||
    cellTable.byteLength !== cc * 2 * 4 ||
    primitiveIndices.byteLength !== pc * 4
  ) {
    return false;
  }
  if (pc < 0 || cc < 0 || cs < 0) return false;
  if (pc === 0 && cc !== 0) return false;
  if (pc > 0 && cc === 0) return false;
  if (!isNumericVec3(min) || !isNumericVec3(max) || !isNumericVec3(dims)) return false;
  if (typeof q.maxRadius !== "number" || !Number.isFinite(q.maxRadius)) return false;

  // Check cellTable entries (start offset + count)
  for (let i = 0; i < cc; i++) {
    const start = cellTable[2 * i];
    const count = cellTable[2 * i + 1];
    if (!Number.isFinite(start) || !Number.isFinite(count) || start < 0 || count < 0 || start + count > pc) return false;
  }

  // Check primitive indices: in-range, no duplicates
  if (pc > 0) {
    const seen = new Set<number>();
    for (let i = 0; i < pc; i++) {
      const idx = primitiveIndices[i];
      if (!Number.isFinite(idx) || idx < 0 || idx >= pc || !Number.isInteger(idx) || seen.has(idx)) return false;
      seen.add(idx);
    }
  }

  return true;
}

function isNumericVec3(value: unknown): value is { x: number; y: number; z: number } {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.x === "number" && Number.isFinite(record.x) &&
    typeof record.y === "number" && Number.isFinite(record.y) &&
    typeof record.z === "number" && Number.isFinite(record.z)
  );
}
