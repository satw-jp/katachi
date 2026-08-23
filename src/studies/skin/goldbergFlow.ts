import type { Ball } from "../cloud-sculpt/field.ts";
import { computeSamplingBounds } from "../cloud-sculpt/meshExport.ts";
import { hashSeed, makeRng } from "../cloud-sculpt/random.ts";
import {
  captureMotifShapeParams,
  freshPatchId,
  generateShapePoints,
  projectToSurface,
  resetPatchIdCounter,
  type PackPatchesResult,
  type Patch,
  type Projected,
  type SkinParams,
} from "./field.ts";
import { connectSurfaceNeighboursWithLugs } from "./surfaceConnection.ts";

type Vec3 = { x: number; y: number; z: number };

export interface GoldbergPackResult extends PackPatchesResult {
  goldbergFrequency: number;
  goldbergSiteCount: number;
  goldbergPentagonCount: number;
  goldbergHexagonCount: number;
  goldbergIrregularCount: number;
  goldbergNeighbourEdges: number;
  goldbergProjectionFailures: number;
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

const PHI = (1 + Math.sqrt(5)) / 2;
const ICOSAHEDRON_VERTICES = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
].map(([x, y, z]) => normalize({ x, y, z }));

const ICOSAHEDRON_FACES = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
] as const;

function directionKey(direction: Vec3): string {
  return `${direction.x.toFixed(8)},${direction.y.toFixed(8)},${direction.z.toFixed(8)}`;
}

function buildGoldbergDirections(frequency: number): { directions: Vec3[]; edges: Array<[number, number]> } {
  const directions: Vec3[] = [];
  const idByDirection = new Map<string, number>();
  const triangles: Array<[number, number, number]> = [];
  const getId = (direction: Vec3): number => {
    const normalized = normalize(direction);
    const key = directionKey(normalized);
    const known = idByDirection.get(key);
    if (known !== undefined) return known;
    const id = directions.length;
    directions.push(normalized);
    idByDirection.set(key, id);
    return id;
  };
  for (const [ia, ib, ic] of ICOSAHEDRON_FACES) {
    const a = ICOSAHEDRON_VERTICES[ia];
    const b = ICOSAHEDRON_VERTICES[ib];
    const c = ICOSAHEDRON_VERTICES[ic];
    const local = new Map<string, number>();
    for (let i = 0; i <= frequency; i++) for (let j = 0; j <= frequency - i; j++) {
      const k = frequency - i - j;
      local.set(`${i}:${j}`, getId({
        x: (a.x * i + b.x * j + c.x * k) / frequency,
        y: (a.y * i + b.y * j + c.y * k) / frequency,
        z: (a.z * i + b.z * j + c.z * k) / frequency,
      }));
    }
    for (let i = 0; i < frequency; i++) for (let j = 0; j < frequency - i; j++) {
      const p00 = local.get(`${i}:${j}`)!;
      const p10 = local.get(`${i + 1}:${j}`)!;
      const p01 = local.get(`${i}:${j + 1}`)!;
      triangles.push([p00, p10, p01]);
      if (i + j < frequency - 1) {
        const p11 = local.get(`${i + 1}:${j + 1}`)!;
        triangles.push([p10, p11, p01]);
      }
    }
  }
  const edgeMap = new Map<string, [number, number]>();
  for (const triangle of triangles) for (let edge = 0; edge < 3; edge++) {
    const a = triangle[edge];
    const b = triangle[(edge + 1) % 3];
    const low = Math.min(a, b);
    const high = Math.max(a, b);
    edgeMap.set(`${low}:${high}`, [low, high]);
  }
  return { directions, edges: [...edgeMap.values()] };
}

function projectOuterRay(
  host: Ball[], hostK: number, center: Vec3, direction: Vec3, outerRadius: number,
): Projected | null {
  for (let index = 95; index >= 0; index--) {
    const radius = (outerRadius * index) / 96;
    const projected = projectToSurface(
      host, hostK,
      center.x + direction.x * radius,
      center.y + direction.y * radius,
      center.z + direction.z * radius,
      32,
    );
    if (projected && distance(projected, {
      x: center.x + direction.x * radius,
      y: center.y + direction.y * radius,
      z: center.z + direction.z * radius,
    }) < outerRadius * 0.35) return projected;
  }
  return null;
}

export function packPatchesOnGoldberg(host: Ball[], hostK: number, params: SkinParams): GoldbergPackResult {
  resetPatchIdCounter(1);
  const frequency = Math.max(1, Math.min(6, Math.round(params.goldbergFrequency)));
  const topology = buildGoldbergDirections(frequency);
  if (host.length === 0) return {
    patches: [], placed: 0, triedAndRejected: topology.directions.length, stoppedEarly: true,
    flowerConnections: 0, flowerBridgePoints: 0, flowerFusedPatches: 0, flowerFusionRadius: 0,
    flowerFusionLocalized: false, flowerFusionAdjustedPoints: 0, flowerFusionEdgeCount: 0,
    flowerFusionOpenEdges: 0, quadConnectionShape: null, quadConnectionLocalized: false,
    quadConnectionAdjustedPoints: 0, quadConnectionEdgeCount: 0, quadConnectionOpenEdges: 0,
    quadConnectionMaxRadius: 0, goldbergFrequency: frequency, goldbergSiteCount: 0,
    goldbergPentagonCount: 0, goldbergHexagonCount: 0, goldbergIrregularCount: 0,
    goldbergNeighbourEdges: 0, goldbergProjectionFailures: topology.directions.length,
  };
  const bounds = computeSamplingBounds(host, hostK);
  const center = {
    x: (bounds.min.x + bounds.max.x) * 0.5,
    y: (bounds.min.y + bounds.max.y) * 0.5,
    z: (bounds.min.z + bounds.max.z) * 0.5,
  };
  const projected = topology.directions.map((direction) =>
    projectOuterRay(host, hostK, center, direction, bounds.longest * 1.2));
  const topologyNeighbours = topology.directions.map(() => new Set<number>());
  for (const [a, b] of topology.edges) {
    topologyNeighbours[a].add(b);
    topologyNeighbours[b].add(a);
  }
  const patches: Patch[] = [];
  const patchIndexBySite = new Map<number, number>();
  for (let site = 0; site < projected.length; site++) {
    const surface = projected[site];
    if (!surface) continue;
    const nearest = [...topologyNeighbours[site]].reduce((minimum, neighbour) => {
      const other = projected[neighbour];
      return other ? Math.min(minimum, distance(surface, other)) : minimum;
    }, Infinity);
    const patchId = freshPatchId();
    const authored = generateShapePoints(
      params.patchShape, host, hostK, surface, Math.max(0.025, nearest * 0.56), params,
      makeRng(hashSeed(`${params.seed}#goldberg-${frequency}-${site}`)), patchId, patches,
    );
    if (authored.length === 0) continue;
    patchIndexBySite.set(site, patches.length);
    patches.push({
      id: patchId,
      shape: params.patchShape,
      motifPlacement: params.motifPlacement ?? "surface",
      surfaceCellId: site,
      surfaceCellKind: "goldberg",
      motifParams: captureMotifShapeParams(params),
      points: authored,
    });
  }
  const realizedEdges = topology.edges
    .map(([siteA, siteB]) => {
      const a = patchIndexBySite.get(siteA);
      const b = patchIndexBySite.get(siteB);
      const pointA = projected[siteA];
      const pointB = projected[siteB];
      return a === undefined || b === undefined || !pointA || !pointB ? null
        : { a, b, span: distance(pointA, pointB) };
    })
    .filter((edge): edge is { a: number; b: number; span: number } => edge !== null);
  const connected = params.quadConnectionMode === "local"
    ? connectSurfaceNeighboursWithLugs(
        host, hostK,
        realizedEdges.map((edge) => ({ a: patches[edge.a], b: patches[edge.b], span: edge.span })),
        params.quadConnectionDepth, params.quadMeshJoinWidth,
      )
    : { connectorPointCount: 0, openEdgeCount: 0, maximumConnectorRadius: 0 };
  const valences = topologyNeighbours.map((neighbours, site) => projected[site] ? neighbours.size : 0).filter(Boolean);
  const pentagons = valences.filter((valence) => valence === 5).length;
  const hexagons = valences.filter((valence) => valence === 6).length;
  return {
    patches,
    placed: patches.length,
    triedAndRejected: topology.directions.length - patches.length,
    stoppedEarly: patches.length !== topology.directions.length,
    flowerConnections: 0,
    flowerBridgePoints: 0,
    flowerFusedPatches: 0,
    flowerFusionRadius: 0,
    flowerFusionLocalized: false,
    flowerFusionAdjustedPoints: 0,
    flowerFusionEdgeCount: 0,
    flowerFusionOpenEdges: 0,
    quadConnectionShape: params.quadConnectionMode === "local" ? params.patchShape : null,
    quadConnectionLocalized: params.quadConnectionMode === "local",
    quadConnectionAdjustedPoints: connected.connectorPointCount,
    quadConnectionEdgeCount: realizedEdges.length,
    quadConnectionOpenEdges: connected.openEdgeCount,
    quadConnectionMaxRadius: connected.maximumConnectorRadius,
    goldbergFrequency: frequency,
    goldbergSiteCount: patches.length,
    goldbergPentagonCount: pentagons,
    goldbergHexagonCount: hexagons,
    goldbergIrregularCount: valences.length - pentagons - hexagons,
    goldbergNeighbourEdges: realizedEdges.length,
    goldbergProjectionFailures: topology.directions.length - patches.length,
  };
}

export const __goldbergTest = { buildGoldbergDirections };
