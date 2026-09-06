import type { Bounds } from "../cloud-sculpt/meshExport.ts";

export const VOID_ANALYSIS_RESOLUTION = 64 as const;

export interface VoidAnalysisInput {
  bounds: Bounds;
  resolution?: number;
  insideHost: (x: number, y: number, z: number) => boolean;
  insideFinalBody: (x: number, y: number, z: number) => boolean;
}

export interface VoidAnalysisResult {
  resolution: number;
  bounds: Bounds;
  cellSize: { x: number; y: number; z: number };
  sampledCellCount: number;
  hostCellCount: number;
  voidCellCount: number;
  bodyCellCount: number;
  componentCount: number;
  largestComponentFraction: number;
  boundaryConnectedComponentCount: number;
  surfacePositions: Float32Array;
}

function indexOf(x: number, y: number, z: number, resolution: number): number {
  return x + resolution * (y + resolution * z);
}

const SIX_NEIGHBOURS = [
  [-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1],
] as const;

function isHostBoundaryAdjacent(
  x: number,
  y: number,
  z: number,
  resolution: number,
  bounds: Bounds,
  cellSize: { x: number; y: number; z: number },
  hostMask: Uint8Array,
  insideHost: (x: number, y: number, z: number) => boolean,
): boolean {
  for (const [dx, dy, dz] of SIX_NEIGHBOURS) {
    const nx = x + dx;
    const ny = y + dy;
    const nz = z + dz;
    const px = bounds.min.x + (nx + 0.5) * cellSize.x;
    const py = bounds.min.y + (ny + 0.5) * cellSize.y;
    const pz = bounds.min.z + (nz + 0.5) * cellSize.z;
    if (nx >= 0 && ny >= 0 && nz >= 0 && nx < resolution && ny < resolution && nz < resolution) {
      if (hostMask[indexOf(nx, ny, nz, resolution)] === 0) return true;
      continue;
    }
    if (!insideHost(px, py, pz)) return true;
  }
  return false;
}

function pushTriangle(
  target: number[],
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
): void {
  target.push(...a, ...b, ...c);
}

function pushQuad(
  target: number[],
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  d: [number, number, number],
): void {
  pushTriangle(target, a, b, c);
  pushTriangle(target, a, c, d);
}

function buildBoundarySurface(
  mask: Uint8Array,
  resolution: number,
  bounds: Bounds,
  cellSize: { x: number; y: number; z: number },
): Float32Array {
  const positions: number[] = [];
  const isVoid = (x: number, y: number, z: number): boolean => (
    x >= 0 && y >= 0 && z >= 0 && x < resolution && y < resolution && z < resolution
      ? mask[indexOf(x, y, z, resolution)] === 1
      : false
  );
  const face = (x: number, y: number, z: number, axis: "x-" | "x+" | "y-" | "y+" | "z-" | "z+"): void => {
    const x0 = bounds.min.x + x * cellSize.x;
    const x1 = x0 + cellSize.x;
    const y0 = bounds.min.y + y * cellSize.y;
    const y1 = y0 + cellSize.y;
    const z0 = bounds.min.z + z * cellSize.z;
    const z1 = z0 + cellSize.z;
    if (axis === "x-") pushQuad(positions, [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]);
    if (axis === "x+") pushQuad(positions, [x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]);
    if (axis === "y-") pushQuad(positions, [x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [x1, y0, z0]);
    if (axis === "y+") pushQuad(positions, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]);
    if (axis === "z-") pushQuad(positions, [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]);
    if (axis === "z+") pushQuad(positions, [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1]);
  };

  for (let z = 0; z < resolution; z++) {
    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        if (!isVoid(x, y, z)) continue;
        if (!isVoid(x - 1, y, z)) face(x, y, z, "x-");
        if (!isVoid(x + 1, y, z)) face(x, y, z, "x+");
        if (!isVoid(x, y - 1, z)) face(x, y, z, "y-");
        if (!isVoid(x, y + 1, z)) face(x, y, z, "y+");
        if (!isVoid(x, y, z - 1)) face(x, y, z, "z-");
        if (!isVoid(x, y, z + 1)) face(x, y, z, "z+");
      }
    }
  }
  return Float32Array.from(positions);
}

/** Deterministic voxel classification of Ω \ S. This is a Viewer-derived
 * measurement only; no result is written back to FKEI. */
export function analyzeVoid(input: VoidAnalysisInput): VoidAnalysisResult {
  const resolution = Math.max(2, Math.round(input.resolution ?? VOID_ANALYSIS_RESOLUTION));
  const cellSize = {
    x: input.bounds.size.x / resolution,
    y: input.bounds.size.y / resolution,
    z: input.bounds.size.z / resolution,
  };
  const total = resolution * resolution * resolution;
  const mask = new Uint8Array(total);
  const hostMask = new Uint8Array(total);
  const visited = new Uint8Array(total);
  let hostCellCount = 0;
  let bodyCellCount = 0;
  let voidCellCount = 0;
  for (let z = 0; z < resolution; z++) {
    const pz = input.bounds.min.z + (z + 0.5) * cellSize.z;
    for (let y = 0; y < resolution; y++) {
      const py = input.bounds.min.y + (y + 0.5) * cellSize.y;
      for (let x = 0; x < resolution; x++) {
        const px = input.bounds.min.x + (x + 0.5) * cellSize.x;
        const host = input.insideHost(px, py, pz);
        const body = input.insideFinalBody(px, py, pz);
        hostMask[indexOf(x, y, z, resolution)] = host ? 1 : 0;
        if (host) hostCellCount++;
        if (body) bodyCellCount++;
        if (host && !body) {
          mask[indexOf(x, y, z, resolution)] = 1;
          voidCellCount++;
        }
      }
    }
  }

  let componentCount = 0;
  let largestComponent = 0;
  let boundaryConnectedComponentCount = 0;
  const queue = new Int32Array(total);
  for (let z = 0; z < resolution; z++) {
    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const start = indexOf(x, y, z, resolution);
        if (mask[start] !== 1 || visited[start] === 1) continue;
        componentCount++;
        let head = 0;
        let tail = 0;
        let size = 0;
        let touchesBoundary = false;
        queue[tail++] = start;
        visited[start] = 1;
        while (head < tail) {
          const current = queue[head++];
          const cx = current % resolution;
          const cy = Math.floor(current / resolution) % resolution;
          const cz = Math.floor(current / (resolution * resolution));
          size++;
          if (!touchesBoundary && isHostBoundaryAdjacent(
            cx,
            cy,
            cz,
            resolution,
            input.bounds,
            cellSize,
            hostMask,
            input.insideHost,
          )) touchesBoundary = true;
          for (const [dx, dy, dz] of SIX_NEIGHBOURS) {
            const nx = cx + dx;
            const ny = cy + dy;
            const nz = cz + dz;
            if (nx < 0 || ny < 0 || nz < 0 || nx >= resolution || ny >= resolution || nz >= resolution) continue;
            const next = indexOf(nx, ny, nz, resolution);
            if (mask[next] !== 1 || visited[next] === 1) continue;
            visited[next] = 1;
            queue[tail++] = next;
          }
        }
        largestComponent = Math.max(largestComponent, size);
        if (touchesBoundary) boundaryConnectedComponentCount++;
      }
    }
  }

  return {
    resolution,
    bounds: input.bounds,
    cellSize,
    sampledCellCount: total,
    hostCellCount,
    voidCellCount,
    bodyCellCount,
    componentCount,
    largestComponentFraction: voidCellCount === 0 ? 0 : largestComponent / voidCellCount,
    boundaryConnectedComponentCount,
    surfacePositions: buildBoundarySurface(mask, resolution, input.bounds, cellSize),
  };
}
