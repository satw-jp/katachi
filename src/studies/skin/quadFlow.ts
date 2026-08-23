import type { Ball } from "../cloud-sculpt/field.ts";
import { fieldSdf } from "../cloud-sculpt/field.ts";
import { computeSamplingBounds } from "../cloud-sculpt/meshExport.ts";
import { hashSeed, makeRng } from "../cloud-sculpt/random.ts";
import {
  captureMotifShapeParams,
  connectFlowerPatchesDirectly,
  freshPatchId,
  generateShapePoints,
  projectToSurface,
  resetPatchIdCounter,
  type PackPatchesResult,
  type Patch,
  type PatchPoint,
  type Projected,
  type SkinParams,
} from "./field.ts";
import { connectSurfaceNeighboursWithLugs } from "./surfaceConnection.ts";

export interface QuadFlowVertex extends Projected {
  id: number;
}

export interface QuadFlowCell {
  id: number;
  vertexIds: readonly [number, number, number, number];
  /** A normal quad still occupies this cell. `special` only says that at
   * least one corner has valence other than four and may later need a
   * purpose-designed fitting instead of the ordinary motif. */
  special: boolean;
}

export interface QuadFlowGrid {
  divisions: number;
  tilingMode: SkinParams["quadTilingMode"];
  sizeVariation: number;
  vertices: QuadFlowVertex[];
  cells: QuadFlowCell[];
  extraordinaryVertexCount: number;
  specialCellCount: number;
  projectionFailures: number;
  curvatureAttraction: number;
  curvatureMinimum: number;
  curvatureMaximum: number;
  curvatureRedistributionPasses: number;
}

export interface QuadFlowPackResult extends PackPatchesResult {
  quadGrid: QuadFlowGrid;
}

type Vec3 = { x: number; y: number; z: number };

const QUAD_FOOTPRINT_OVERREACH = 1.04;

function axisPositions(divisions: number, variation: number, seed: string): number[] {
  const positions = Array.from({ length: divisions + 1 }, (_, index) => -1 + (2 * index) / divisions);
  if (variation <= 0) return positions;
  const rng = makeRng(hashSeed(seed));
  const step = 2 / divisions;
  for (let index = 1; index < divisions / 2; index++) {
    const moved = positions[index] + (rng() * 2 - 1) * step * variation;
    positions[index] = moved;
    positions[divisions - index] = -moved;
  }
  if (divisions % 2 === 0) positions[divisions / 2] = 0;
  return positions;
}

function cubeDirection(
  faceIndex: number,
  i: number,
  j: number,
  xAxis: number[],
  yAxis: number[],
  zAxis: number[],
): Vec3 {
  switch (faceIndex) {
    case 0: return { x: 1, y: yAxis[j], z: -zAxis[i] };
    case 1: return { x: -1, y: yAxis[j], z: zAxis[i] };
    case 2: return { x: xAxis[i], y: 1, z: -zAxis[j] };
    case 3: return { x: xAxis[i], y: -1, z: zAxis[j] };
    case 4: return { x: xAxis[i], y: yAxis[j], z: 1 };
    default: return { x: -xAxis[i], y: yAxis[j], z: -1 };
  }
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

function directionKey(direction: Vec3): string {
  return `${direction.x.toFixed(9)},${direction.y.toFixed(9)},${direction.z.toFixed(9)}`;
}

function projectOuterRay(
  host: Ball[],
  hostK: number,
  center: Vec3,
  direction: Vec3,
  outerRadius: number,
): Projected | null {
  const samples = 96;
  let outsideRadius = outerRadius;
  let outsideValue = fieldSdf(
    host,
    hostK,
    center.x + direction.x * outsideRadius,
    center.y + direction.y * outsideRadius,
    center.z + direction.z * outsideRadius,
  );
  for (let index = samples - 1; index >= 0; index--) {
    const radius = (outerRadius * index) / samples;
    const x = center.x + direction.x * radius;
    const y = center.y + direction.y * radius;
    const z = center.z + direction.z * radius;
    const value = fieldSdf(host, hostK, x, y, z);
    if (outsideValue >= 0 && value <= 0) {
      let lo = radius;
      let hi = outsideRadius;
      for (let step = 0; step < 18; step++) {
        const mid = (lo + hi) * 0.5;
        const midValue = fieldSdf(
          host,
          hostK,
          center.x + direction.x * mid,
          center.y + direction.y * mid,
          center.z + direction.z * mid,
        );
        if (midValue <= 0) lo = mid;
        else hi = mid;
      }
      const surfaceRadius = (lo + hi) * 0.5;
      return projectToSurface(
        host,
        hostK,
        center.x + direction.x * surfaceRadius,
        center.y + direction.y * surfaceRadius,
        center.z + direction.z * surfaceRadius,
        32,
      );
    }
    outsideRadius = radius;
    outsideValue = value;
  }
  return projectToSurface(
    host,
    hostK,
    center.x + direction.x * outerRadius * 0.45,
    center.y + direction.y * outerRadius * 0.45,
    center.z + direction.z * outerRadius * 0.45,
    32,
  );
}

/**
 * Cube-sphere topology projected onto the outer host surface. Every emitted
 * cell has four corners. Euler-required irregularity is kept at vertices
 * (normally the eight cube corners, valence three) and reported rather than
 * hidden or converted into triangles.
 */
export function buildQuadFlowGrid(
  host: Ball[],
  hostK: number,
  requestedDivisions: number,
  tilingMode: SkinParams["quadTilingMode"] = "regular",
  requestedVariation = 0,
  seed = "yohaku-skin",
  requestedCurvatureAttraction = 0,
): QuadFlowGrid {
  const divisions = Math.max(2, Math.min(12, Math.round(requestedDivisions)));
  const sizeVariation = tilingMode === "varied"
    ? Math.max(0, Math.min(0.45, requestedVariation))
    : 0;
  const curvatureAttraction = tilingMode === "field"
    ? Math.max(0, Math.min(1, requestedCurvatureAttraction))
    : 0;
  if (host.length === 0) {
    return {
      divisions,
      tilingMode,
      sizeVariation,
      vertices: [],
      cells: [],
      extraordinaryVertexCount: 0,
      specialCellCount: 0,
      projectionFailures: 0,
      curvatureAttraction,
      curvatureMinimum: 0,
      curvatureMaximum: 0,
      curvatureRedistributionPasses: 0,
    };
  }
  const bounds = computeSamplingBounds(host, hostK);
  const center = {
    x: (bounds.min.x + bounds.max.x) * 0.5,
    y: (bounds.min.y + bounds.max.y) * 0.5,
    z: (bounds.min.z + bounds.max.z) * 0.5,
  };
  const outerRadius = bounds.longest * 1.2;
  const vertices: QuadFlowVertex[] = [];
  const vertexByDirection = new Map<string, number>();
  const faceVertexIds: Array<Array<number | null>> = [];
  let projectionFailures = 0;
  const xAxis = axisPositions(divisions, sizeVariation, `${seed}#quad-x`);
  const yAxis = axisPositions(divisions, sizeVariation, `${seed}#quad-y`);
  const zAxis = axisPositions(divisions, sizeVariation, `${seed}#quad-z`);

  for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
    const ids: Array<number | null> = [];
    for (let j = 0; j <= divisions; j++) {
      for (let i = 0; i <= divisions; i++) {
        const direction = normalize(cubeDirection(faceIndex, i, j, xAxis, yAxis, zAxis));
        const key = directionKey(direction);
        const known = vertexByDirection.get(key);
        if (known !== undefined) {
          ids.push(known);
          continue;
        }
        const projected = projectOuterRay(host, hostK, center, direction, outerRadius);
        if (!projected) {
          projectionFailures++;
          ids.push(null);
          continue;
        }
        const id = vertices.length;
        vertices.push({ id, ...projected });
        vertexByDirection.set(key, id);
        ids.push(id);
      }
    }
    faceVertexIds.push(ids);
  }

  const rawCells: Array<Omit<QuadFlowCell, "special">> = [];
  for (const ids of faceVertexIds) {
    for (let j = 0; j < divisions; j++) {
      for (let i = 0; i < divisions; i++) {
        const a = ids[i + j * (divisions + 1)];
        const b = ids[i + 1 + j * (divisions + 1)];
        const c = ids[i + 1 + (j + 1) * (divisions + 1)];
        const d = ids[i + (j + 1) * (divisions + 1)];
        if (a === null || b === null || c === null || d === null) continue;
        rawCells.push({ id: rawCells.length, vertexIds: [a, b, c, d] });
      }
    }
  }

  const neighbours = vertices.map(() => new Set<number>());
  for (const cell of rawCells) for (let edge = 0; edge < 4; edge++) {
    const a = cell.vertexIds[edge];
    const b = cell.vertexIds[(edge + 1) % 4];
    neighbours[a].add(b);
    neighbours[b].add(a);
  }
  const curvatureOf = (vertex: QuadFlowVertex, index: number): number => {
    const adjacent = [...neighbours[index]];
    if (adjacent.length === 0) return 0;
    return adjacent.reduce((sum, neighbourId) => {
      const other = vertices[neighbourId];
      const normalDifference = Math.hypot(vertex.nx - other.nx, vertex.ny - other.ny, vertex.nz - other.nz);
      return sum + normalDifference / Math.max(distance(vertex, other), 1e-6);
    }, 0) / adjacent.length;
  };
  let curvatures = vertices.map(curvatureOf);
  const redistributionPasses = curvatureAttraction > 0 ? 2 : 0;
  for (let pass = 0; pass < redistributionPasses; pass++) {
    const maximum = Math.max(1e-9, ...curvatures);
    const moved = vertices.map((vertex, index) => {
      const adjacent = [...neighbours[index]];
      if (adjacent.length === 0) return { ...vertex };
      let weightSum = 1;
      let x = vertex.x;
      let y = vertex.y;
      let z = vertex.z;
      for (const neighbourId of adjacent) {
        const weight = 1 + (curvatures[neighbourId] / maximum) * curvatureAttraction * 3;
        const neighbour = vertices[neighbourId];
        x += neighbour.x * weight;
        y += neighbour.y * weight;
        z += neighbour.z * weight;
        weightSum += weight;
      }
      const blend = 0.14 * curvatureAttraction;
      const raw = {
        x: vertex.x + (x / weightSum - vertex.x) * blend,
        y: vertex.y + (y / weightSum - vertex.y) * blend,
        z: vertex.z + (z / weightSum - vertex.z) * blend,
      };
      const projected = projectToSurface(host, hostK, raw.x, raw.y, raw.z, 24);
      return projected ? { id: vertex.id, ...projected } : { ...vertex };
    });
    for (let index = 0; index < vertices.length; index++) Object.assign(vertices[index], moved[index]);
    curvatures = vertices.map(curvatureOf);
  }

  const valence = new Uint16Array(vertices.length);
  for (const cell of rawCells) for (const vertexId of cell.vertexIds) valence[vertexId]++;
  const cells: QuadFlowCell[] = rawCells.map((cell) => ({
    ...cell,
    special: cell.vertexIds.some((vertexId) => valence[vertexId] !== 4),
  }));
  const extraordinaryVertexCount = [...valence].filter((count) => count > 0 && count !== 4).length;
  const specialCellCount = cells.filter((cell) => cell.special).length;
  return {
    divisions,
    tilingMode,
    sizeVariation,
    vertices,
    cells,
    extraordinaryVertexCount,
    specialCellCount,
    projectionFailures,
    curvatureAttraction,
    curvatureMinimum: curvatures.length > 0 ? Math.min(...curvatures) : 0,
    curvatureMaximum: curvatures.length > 0 ? Math.max(...curvatures) : 0,
    curvatureRedistributionPasses: redistributionPasses,
  };
}

function distance(a: QuadFlowVertex, b: QuadFlowVertex): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function tangentBasis(normal: Vec3): { t1: Vec3; t2: Vec3 } {
  const up = Math.abs(normal.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
  const t1 = normalize({
    x: normal.y * up.z - normal.z * up.y,
    y: normal.z * up.x - normal.x * up.z,
    z: normal.x * up.y - normal.y * up.x,
  });
  return {
    t1,
    t2: {
      x: normal.y * t1.z - normal.z * t1.y,
      y: normal.z * t1.x - normal.x * t1.z,
      z: normal.x * t1.y - normal.y * t1.x,
    },
  };
}

function cellFrame(
  grid: QuadFlowGrid,
  cell: QuadFlowCell,
): {
  projected: Projected;
  anchorR: number;
  phase01: number;
  t1: Vec3;
  t2: Vec3;
  corners: QuadFlowVertex[];
} {
  const corners = cell.vertexIds.map((vertexId) => grid.vertices[vertexId]);
  const projected = corners.reduce((sum, corner) => ({
    x: sum.x + corner.x * 0.25,
    y: sum.y + corner.y * 0.25,
    z: sum.z + corner.z * 0.25,
    nx: sum.nx + corner.nx * 0.25,
    ny: sum.ny + corner.ny * 0.25,
    nz: sum.nz + corner.nz * 0.25,
  }), { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0 });
  const normalLength = Math.hypot(projected.nx, projected.ny, projected.nz) || 1;
  projected.nx /= normalLength;
  projected.ny /= normalLength;
  projected.nz /= normalLength;
  const edgeLength = Math.min(
    distance(corners[0], corners[1]),
    distance(corners[1], corners[2]),
    distance(corners[2], corners[3]),
    distance(corners[3], corners[0]),
  );
  const edge = {
    x: corners[1].x - corners[0].x,
    y: corners[1].y - corners[0].y,
    z: corners[1].z - corners[0].z,
  };
  const { t1, t2 } = tangentBasis(projected);
  const phase = Math.atan2(
    edge.x * t2.x + edge.y * t2.y + edge.z * t2.z,
    edge.x * t1.x + edge.y * t1.y + edge.z * t1.z,
  );
  const phase01 = ((phase / (Math.PI * 2)) % 1 + 1) % 1;
  return { projected, anchorR: Math.max(0.025, edgeLength * 0.43), phase01, t1, t2, corners };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function bilerp(corners: QuadFlowVertex[], u: number, v: number): Projected {
  const weights = [(1 - u) * (1 - v), u * (1 - v), u * v, (1 - u) * v];
  const result = corners.reduce((sum, corner, index) => ({
    x: sum.x + corner.x * weights[index],
    y: sum.y + corner.y * weights[index],
    z: sum.z + corner.z * weights[index],
    nx: sum.nx + corner.nx * weights[index],
    ny: sum.ny + corner.ny * weights[index],
    nz: sum.nz + corner.nz * weights[index],
  }), { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0 });
  const normalLength = Math.hypot(result.nx, result.ny, result.nz) || 1;
  result.nx /= normalLength;
  result.ny /= normalLength;
  result.nz /= normalLength;
  return result;
}

/**
 * Deform an authored motif across the complete quad footprint. The motif's
 * local x/y envelope (component centres plus radii) becomes the four-sided
 * cell domain, then every component is projected back to the host surface.
 * A small 4% overreach prevents a mathematical hairline at the shared edge;
 * it is still the motif's own surface, never separate connector geometry.
 */
function fitPointsToQuadCell(
  host: Ball[],
  hostK: number,
  frame: ReturnType<typeof cellFrame>,
  points: PatchPoint[],
): PatchPoint[] {
  if (points.length === 0) return [];
  const local = points.map((point) => {
    const delta = {
      x: point.x - frame.projected.x,
      y: point.y - frame.projected.y,
      z: point.z - frame.projected.z,
    };
    return {
      point,
      x: dot(delta, frame.t1),
      y: dot(delta, frame.t2),
      lift: dot(delta, { x: frame.projected.nx, y: frame.projected.ny, z: frame.projected.nz }),
    };
  });
  const envelopeX = Math.max(1e-6, ...local.map(({ point, x }) => Math.abs(x) + point.r));
  const envelopeY = Math.max(1e-6, ...local.map(({ point, y }) => Math.abs(y) + point.r));
  const halfWidth = (distance(frame.corners[0], frame.corners[1])
    + distance(frame.corners[3], frame.corners[2])) * 0.25;
  const halfHeight = (distance(frame.corners[0], frame.corners[3])
    + distance(frame.corners[1], frame.corners[2])) * 0.25;
  const scaleX = halfWidth * QUAD_FOOTPRINT_OVERREACH / envelopeX;
  const scaleY = halfHeight * QUAD_FOOTPRINT_OVERREACH / envelopeY;
  const radiusScale = Math.sqrt(Math.max(1e-6, scaleX * scaleY));

  return local.map(({ point, x, y, lift }) => {
    const u = 0.5 + x * scaleX / Math.max(halfWidth * 2, 1e-6);
    const v = 0.5 + y * scaleY / Math.max(halfHeight * 2, 1e-6);
    const interpolated = bilerp(frame.corners, u, v);
    const surface = projectToSurface(host, hostK, interpolated.x, interpolated.y, interpolated.z, 20)
      ?? interpolated;
    const scaledLift = lift * radiusScale;
    const scaleOptional = (value: number | undefined): number | undefined =>
      value === undefined ? undefined : value * radiusScale;
    return {
      ...point,
      x: surface.x + surface.nx * scaledLift,
      y: surface.y + surface.ny * scaledLift,
      z: surface.z + surface.nz * scaledLift,
      r: point.r * radiusScale,
      baseR: scaleOptional(point.baseR),
      fusionBaseR: scaleOptional(point.fusionBaseR),
      fusionR: scaleOptional(point.fusionR),
    };
  });
}

interface QuadCellAdjacency {
  aCellId: number;
  bCellId: number;
  edgeLength: number;
}

function cellAdjacencyPairs(grid: QuadFlowGrid): QuadCellAdjacency[] {
  const ownerByEdge = new Map<string, { cellId: number; a: number; b: number }>();
  const pairs: QuadCellAdjacency[] = [];
  for (const cell of grid.cells) for (let edgeIndex = 0; edgeIndex < 4; edgeIndex++) {
    const a = cell.vertexIds[edgeIndex];
    const b = cell.vertexIds[(edgeIndex + 1) % 4];
    const edgeKey = a < b ? `${a}:${b}` : `${b}:${a}`;
    const owner = ownerByEdge.get(edgeKey);
    if (owner === undefined) ownerByEdge.set(edgeKey, { cellId: cell.id, a, b });
    else pairs.push({
      aCellId: owner.cellId,
      bCellId: cell.id,
      edgeLength: distance(grid.vertices[owner.a], grid.vertices[owner.b]),
    });
  }
  return pairs;
}

export function patchSurfaceClearance(a: Patch, b: Patch): number {
  let minimum = Infinity;
  for (const pointA of a.points) for (const pointB of b.points) {
    minimum = Math.min(minimum, Math.hypot(
      pointA.x - pointB.x,
      pointA.y - pointB.y,
      pointA.z - pointB.z,
    ) - pointA.r - pointB.r);
  }
  return minimum;
}

/**
 * Repair only an open shared edge by extending short surface lugs from the
 * closest motif components. Original component radii stay unchanged, so a
 * ring hole is not closed merely to make its neighbour contact.
 */
function connectQuadNeighboursLocally(
  host: Ball[],
  hostK: number,
  grid: QuadFlowGrid,
  patchByCellId: Map<number, Patch>,
  connectionDepth: number,
  meshJoinWidth: number,
): {
  patches: Patch[];
  fusionRadius: number;
  adjustedPointCount: number;
  edgeCount: number;
  openEdgeCount: number;
} {
  const pairs = cellAdjacencyPairs(grid)
    .map((pair) => ({
      ...pair,
      a: patchByCellId.get(pair.aCellId),
      b: patchByCellId.get(pair.bCellId),
    }))
    .filter((pair): pair is QuadCellAdjacency & { a: Patch; b: Patch } =>
      pair.a !== undefined && pair.b !== undefined);
  const patches = [...patchByCellId.values()];
  const connected = connectSurfaceNeighboursWithLugs(
    host,
    hostK,
    pairs.map((pair) => ({ a: pair.a, b: pair.b, span: pair.edgeLength })),
    connectionDepth,
    meshJoinWidth,
  );
  return {
    patches,
    fusionRadius: connected.maximumConnectorRadius,
    adjustedPointCount: connected.connectorPointCount,
    edgeCount: connected.edgeCount,
    openEdgeCount: connected.openEdgeCount,
  };
}

/** One ordinary motif per quad. Special cells deliberately receive the same
 * placeholder motif for now; the grid marks them so a later fitting pass can
 * replace them without changing the all-quad topology or current PACK mode. */
export function packPatchesOnQuadFlow(
  host: Ball[],
  hostK: number,
  params: SkinParams,
): QuadFlowPackResult {
  // QUAD-FLOW replaces the complete patch field, so stable cell-order IDs
  // are preferable to inheriting a global counter from earlier previews.
  // This keeps an identical seed/settings repack identical and leaves the
  // counter at the first free ID for a later manual addition.
  resetPatchIdCounter(1);
  const quadGrid = buildQuadFlowGrid(
    host,
    hostK,
    params.quadDivisions,
    params.quadTilingMode,
    params.quadSizeVariation,
    params.seed,
    params.quadCurvatureAttraction,
  );
  let patches: Patch[] = [];
  const patchByCellId = new Map<number, Patch>();
  for (const cell of quadGrid.cells) {
    const patchId = freshPatchId();
    const frame = cellFrame(quadGrid, cell);
    const { projected, anchorR, phase01 } = frame;
    const seededRng = makeRng(hashSeed(`${params.seed}#quad-${cell.id}`));
    let firstRandom = true;
    const rng = (): number => {
      if (!firstRandom) return seededRng();
      firstRandom = false;
      return phase01;
    };
    const authoredPoints = generateShapePoints(
      params.patchShape,
      host,
      hostK,
      projected,
      anchorR,
      params,
      rng,
      patchId,
      patches,
    );
    const points = fitPointsToQuadCell(host, hostK, frame, authoredPoints);
    if (points.length > 0) {
      const patch = {
        id: patchId,
        shape: params.patchShape,
        motifPlacement: params.motifPlacement ?? "surface",
        quadCellId: cell.id,
        surfaceCellId: cell.id,
        surfaceCellKind: "quad" as const,
        motifParams: captureMotifShapeParams(params),
        points,
      } satisfies Patch;
      patches.push(patch);
      patchByCellId.set(cell.id, patch);
    }
  }

  let flowerFusionRadius = 0;
  let flowerFusionAdjustedPoints = 0;
  let flowerFusionEdgeCount = 0;
  let flowerFusionOpenEdges = 0;
  let flowerConnections = 0;
  let flowerBridgePoints = 0;
  let quadConnectionMaxRadius = 0;
  let quadConnectionAdjustedPoints = 0;
  let quadConnectionEdgeCount = 0;
  let quadConnectionOpenEdges = 0;
  if (params.quadConnectionMode === "local") {
    const connected = connectQuadNeighboursLocally(
      host,
      hostK,
      quadGrid,
      patchByCellId,
      params.quadConnectionDepth,
      params.quadMeshJoinWidth,
    );
    patches = connected.patches;
    quadConnectionMaxRadius = connected.fusionRadius;
    quadConnectionAdjustedPoints = connected.adjustedPointCount;
    quadConnectionEdgeCount = connected.edgeCount;
    quadConnectionOpenEdges = connected.openEdgeCount;
    if (params.patchShape === "flower") {
      flowerFusionRadius = connected.fusionRadius;
      flowerFusionAdjustedPoints = connected.adjustedPointCount;
      flowerFusionEdgeCount = connected.edgeCount;
      flowerFusionOpenEdges = connected.openEdgeCount;
    }
  } else if (params.patchShape === "flower" && params.flowerConnectionMode === "direct") {
    const connected = connectFlowerPatchesDirectly(host, hostK, patches);
    patches = connected.patches;
    flowerConnections = connected.connectionCount;
    flowerBridgePoints = connected.bridgePointCount;
  }
  const flowerFusedPatches = params.patchShape === "flower" && params.quadConnectionMode === "local"
    ? patches.filter((patch) => patch.points.some((point) =>
      (point.fusionR ?? 0) > 0 && point.r > (point.baseR ?? point.r))).length
    : 0;
  return {
    patches,
    placed: patches.length,
    triedAndRejected: quadGrid.projectionFailures,
    stoppedEarly: quadGrid.projectionFailures > 0,
    flowerConnections,
    flowerBridgePoints,
    flowerFusedPatches,
    flowerFusionRadius,
    flowerFusionLocalized: params.patchShape === "flower" && params.quadConnectionMode === "local",
    flowerFusionAdjustedPoints,
    flowerFusionEdgeCount,
    flowerFusionOpenEdges,
    quadConnectionShape: params.quadConnectionMode === "local" ? params.patchShape : null,
    quadConnectionLocalized: params.quadConnectionMode === "local",
    quadConnectionAdjustedPoints,
    quadConnectionEdgeCount,
    quadConnectionOpenEdges,
    quadConnectionMaxRadius,
    quadGrid,
  };
}
