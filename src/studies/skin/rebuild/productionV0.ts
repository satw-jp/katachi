import { fieldSdf } from "../../cloud-sculpt/field.ts";
import {
  computeMeshVolume,
  inspectSavedStlTopology,
  type MeshBuildResult,
} from "../../cloud-sculpt/meshExport.ts";
import {
  createFinishedSkinBodySdfEvaluator,
  type SkinMeshResult,
} from "../meshExport.ts";
import type { Patch } from "../field.ts";
import type {
  InternalStructureEdge,
  InternalStructureGraph,
  Vector3Value,
} from "../voronoi.ts";
import {
  DEFAULT_SKIN_REBUILD_SETTINGS,
  assembleSkinRebuildProject,
  buildSkinRebuildDryWeb,
  buildSkinRebuildFinalMesh,
  buildSkinRebuildLattice,
  buildSkinRebuildPrintSupport,
  createSkinRebuildBase,
  createSkinRebuildPatterns,
  findSkinRebuildLowestPoints,
  mergeSkinRebuildGraphs,
  skinRebuildBaseCentroid,
  type SkinRebuildProject,
  type SkinRebuildSettings,
} from "./model.ts";

export const SKIN_PRODUCTION_V0_POLICY_VERSION = "skin-production-v0-local-relay-graph-repair-v1";

export interface SkinProductionV0RepairPolicy {
  /** Explicit upper bound for graph-only repair passes. */
  maxPasses: number;
  /** Explicit upper bound for changed routes in one pass. */
  maxEdgeChangesPerPass: number;
  /** Explicit upper bound for relay candidates considered for one route. */
  maxCandidateRelaysPerEdge: number;
  /** Defaults to the current SKIN overhang contract when omitted. */
  angleThresholdDeg?: number;
  /** Guardrail applied independently to each measured sightline. */
  maximumSightlineDropFraction: number;
  /** Guardrail applied independently to the largest sampled void. */
  maximumLargestVoidShrinkFraction: number;
  /** Coarse actual-BODY diagnostic grid; it is a measurement, not an objective. */
  diagnosticGridResolution: number;
  /** Radius of the central measurement region as a host-relative fraction. */
  centralRegionFraction: number;
}

export const DEFAULT_SKIN_PRODUCTION_V0_REPAIR_POLICY: SkinProductionV0RepairPolicy = {
  maxPasses: 2,
  maxEdgeChangesPerPass: 2,
  maxCandidateRelaysPerEdge: 8,
  maximumSightlineDropFraction: 0.15,
  maximumLargestVoidShrinkFraction: 0.15,
  diagnosticGridResolution: 12,
  centralRegionFraction: 0.25,
};

export interface SkinProductionV0BodyDiagnostics {
  source: "actual-native-body";
  triangleCount: number;
  volumeMm3: number;
  boundsMm: { x: number; y: number; z: number };
  connectedComponents: number;
  topology: {
    closed: boolean;
    nonManifoldEdges: number;
    windingConsistent: boolean;
    degenerateTriangleCount: number;
    nonFiniteTriangleCount: number;
  };
}

export interface SkinProductionV0SpatialDiagnostics {
  internalOccupancyFraction: number;
  shellOccupancyFraction: number;
  centralOccupancyFraction: number;
  congestionFraction: number;
  largestVoid: {
    voxelCount: number;
    volumeMm3: number;
    continuityFraction: number;
  };
  sightlines: {
    front: number;
    side: number;
    oblique: number;
    axial: number;
  };
}

export interface SkinProductionV0GraphDiagnostics {
  nodeCount: number;
  edgeCount: number;
  componentCount: number;
  routeTotalSource: number;
  routeTotalMm: number;
  routeMaximumSource: number;
  routeMaximumMm: number;
  bridgeCount: number;
  maximumBetweenness: number;
  maximumAngleDeg: number;
  longRangeEdgeCount: number;
  centralCrossingCount: number;
  localContactCount: number;
  nonLocalContactCount: number;
  degreeDistribution: {
    minimum: number;
    maximum: number;
    mean: number;
    histogram: Record<string, number>;
  };
}

export interface SkinProductionV0MotifDiagnostics {
  motifCount: number;
  motifIds: number[];
  contactSpreadMeanSource: number;
  contactSpreadMaximumSource: number;
  clusterCount: number;
  spacingCv: number;
  nodeDensityCv: { x: number; y: number; z: number };
  relocationCount: number;
  geometryHash: string;
}

export interface SkinProductionV0Diagnostics {
  body: SkinProductionV0BodyDiagnostics;
  spatial: SkinProductionV0SpatialDiagnostics;
  graph: SkinProductionV0GraphDiagnostics;
  motif: SkinProductionV0MotifDiagnostics;
}

export interface SkinProductionV0RepairPass {
  pass: number;
  changedEdgeIds: number[];
  accepted: boolean;
  candidateDiagnostics: SkinProductionV0Diagnostics | null;
  rejectionReasons: string[];
}

export interface SkinProductionV0Provenance {
  policyVersion: typeof SKIN_PRODUCTION_V0_POLICY_VERSION;
  seedPolicy: "motif-conditioned";
  networkCore: "local-relay-permanent-network";
  repairMechanism: "bounded-graph-only";
  coEvolution: "not-implemented";
  hostIdentity: {
    query: "authored-host";
    hostK: number;
    geometryHash: string;
  };
  motifIdentity: Array<{
    id: number;
    geometryHash: string;
    transformHash: string;
  }>;
  generatedNetwork: {
    source: "pattern-side-inside-positions";
    nodeCount: number;
    edgeCount: number;
    nodeIds: number[];
    edgeIds: number[];
  };
  repair: {
    policy: SkinProductionV0RepairPolicy;
    passes: SkinProductionV0RepairPass[];
    motifRelocationCount: number;
  };
  diagnostics: {
    beforeHash: string;
    afterHash: string;
    bodyGeometryHash: string;
  };
  deterministicKey: string;
}

export interface SkinProductionV0RuntimeBuild {
  project: SkinRebuildProject;
  analysisMesh: MeshBuildResult;
  diagnosticsBefore: SkinProductionV0Diagnostics;
  diagnosticsAfter: SkinProductionV0Diagnostics;
  provenance: SkinProductionV0Provenance;
}

interface GeneratedCandidate {
  project: SkinRebuildProject;
  body: MeshBuildResult;
}

const EPSILON = 1e-9;

function cloneVector(value: Vector3Value): Vector3Value {
  return { x: value.x, y: value.y, z: value.z };
}

function distance(a: Vector3Value, b: Vector3Value): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function horizontalDistance(a: Vector3Value, b: Vector3Value): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function edgeAngleDeg(a: Vector3Value, b: Vector3Value): number {
  return Math.atan2(horizontalDistance(a, b), Math.max(Math.abs(a.z - b.z), EPSILON)) * 180 / Math.PI;
}

function midpoint(a: Vector3Value, b: Vector3Value): Vector3Value {
  return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5, z: (a.z + b.z) * 0.5 };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length * 0.5);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) * 0.5;
}

function coefficientOfVariation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean <= EPSILON) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(Math.max(0, variance)) / mean;
}

function canonical(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? value.toPrecision(15) : String(value);
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function hashText(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function hashValue(value: unknown): string {
  return hashText(canonical(value));
}

function hashMesh(mesh: MeshBuildResult): string {
  let hash = 2166136261;
  const feed = (value: number): void => {
    const text = Number.isFinite(value) ? value.toPrecision(15) : String(value);
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  };
  feed(mesh.triangles.length);
  for (const triangle of mesh.triangles) {
    for (const point of [triangle.a, triangle.b, triangle.c]) {
      feed(point.x); feed(point.y); feed(point.z);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function hostGeometryHash(project: Pick<SkinRebuildProject, "base">): string {
  return hashValue({ hostK: project.base.hostK, host: project.base.host });
}

function motifGeometryHash(patch: Patch): string {
  return hashValue({ id: patch.id, shape: patch.shape, quadCellId: patch.quadCellId, points: patch.points });
}

function motifTransformHash(patch: Patch, sidePosition: Vector3Value): string {
  return hashValue({ patchId: patch.id, sidePosition });
}

function graphComponents(graph: InternalStructureGraph): number[][] {
  const neighbours = Array.from({ length: graph.nodes.length }, () => [] as number[]);
  for (const edge of graph.edges) {
    if (!graph.nodes[edge.start] || !graph.nodes[edge.end]) continue;
    neighbours[edge.start].push(edge.end);
    neighbours[edge.end].push(edge.start);
  }
  const seen = new Set<number>();
  const components: number[][] = [];
  for (let start = 0; start < graph.nodes.length; start++) {
    if (seen.has(start)) continue;
    const queue = [start];
    const component: number[] = [];
    seen.add(start);
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      for (const next of neighbours[current]) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    components.push(component);
  }
  return components;
}

function graphBridgeCount(graph: InternalStructureGraph): number {
  const adjacency = Array.from({ length: graph.nodes.length }, () => [] as Array<{ node: number; edge: number }>);
  for (const edge of graph.edges) {
    if (!graph.nodes[edge.start] || !graph.nodes[edge.end]) continue;
    adjacency[edge.start].push({ node: edge.end, edge: edge.id });
    adjacency[edge.end].push({ node: edge.start, edge: edge.id });
  }
  const discovery = Array<number>(graph.nodes.length).fill(-1);
  const low = Array<number>(graph.nodes.length).fill(-1);
  let time = 0;
  let bridges = 0;
  const visit = (node: number, parentEdge: number): void => {
    discovery[node] = low[node] = time++;
    for (const next of adjacency[node]) {
      if (next.edge === parentEdge) continue;
      if (discovery[next.node] < 0) {
        visit(next.node, next.edge);
        low[node] = Math.min(low[node], low[next.node]);
        if (low[next.node] > discovery[node]) bridges++;
      } else {
        low[node] = Math.min(low[node], discovery[next.node]);
      }
    }
  };
  for (let node = 0; node < graph.nodes.length; node++) {
    if (discovery[node] < 0) visit(node, -1);
  }
  return bridges;
}

function graphBetweenness(graph: InternalStructureGraph): number {
  const adjacency = Array.from({ length: graph.nodes.length }, () => [] as number[]);
  for (const edge of graph.edges) {
    if (!graph.nodes[edge.start] || !graph.nodes[edge.end]) continue;
    adjacency[edge.start].push(edge.end);
    adjacency[edge.end].push(edge.start);
  }
  const centrality = Array<number>(graph.nodes.length).fill(0);
  for (let source = 0; source < graph.nodes.length; source++) {
    const stack: number[] = [];
    const predecessors = Array.from({ length: graph.nodes.length }, () => [] as number[]);
    const sigma = Array<number>(graph.nodes.length).fill(0);
    const distanceFromSource = Array<number>(graph.nodes.length).fill(-1);
    sigma[source] = 1;
    distanceFromSource[source] = 0;
    const queue = [source];
    while (queue.length > 0) {
      const current = queue.shift()!;
      stack.push(current);
      for (const next of adjacency[current]) {
        if (distanceFromSource[next] < 0) {
          distanceFromSource[next] = distanceFromSource[current] + 1;
          queue.push(next);
        }
        if (distanceFromSource[next] === distanceFromSource[current] + 1) {
          sigma[next] += sigma[current];
          predecessors[next].push(current);
        }
      }
    }
    const dependency = Array<number>(graph.nodes.length).fill(0);
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const predecessor of predecessors[current]) {
        dependency[predecessor] += (sigma[predecessor] / Math.max(sigma[current], EPSILON)) * (1 + dependency[current]);
      }
      if (current !== source) centrality[current] += dependency[current];
    }
  }
  return centrality.length > 0 ? Math.max(...centrality) : 0;
}

function pointToSegmentDistance(point: Vector3Value, start: Vector3Value, end: Vector3Value): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const denominator = dx * dx + dy * dy + dz * dz;
  const t = denominator > EPSILON
    ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy + (point.z - start.z) * dz) / denominator))
    : 0;
  return Math.hypot(
    point.x - (start.x + dx * t),
    point.y - (start.y + dy * t),
    point.z - (start.z + dz * t),
  );
}

function hostSpan(project: SkinRebuildProject): { min: Vector3Value; max: Vector3Value; longest: number } {
  const host = project.base.host;
  const min = {
    x: Math.min(...host.map((ball) => ball.x - ball.r)),
    y: Math.min(...host.map((ball) => ball.y - ball.r)),
    z: Math.min(...host.map((ball) => ball.z - ball.r)),
  };
  const max = {
    x: Math.max(...host.map((ball) => ball.x + ball.r)),
    y: Math.max(...host.map((ball) => ball.y + ball.r)),
    z: Math.max(...host.map((ball) => ball.z + ball.r)),
  };
  return { min, max, longest: Math.max(max.x - min.x, max.y - min.y, max.z - min.z) };
}

function densityCv(graph: InternalStructureGraph, axis: "x" | "y" | "z", span: { min: Vector3Value; max: Vector3Value }): number {
  if (graph.nodes.length === 0) return 0;
  const bins = [0, 0, 0, 0];
  const min = span.min[axis];
  const size = Math.max(span.max[axis] - min, EPSILON);
  for (const node of graph.nodes) {
    const index = Math.max(0, Math.min(bins.length - 1, Math.floor(((node.position[axis] - min) / size) * bins.length)));
    bins[index]++;
  }
  return coefficientOfVariation(bins);
}

function nearestNeighbourSpacing(points: Vector3Value[]): number[] {
  return points.map((point, index) => {
    const distances = points
      .map((candidate, candidateIndex) => candidateIndex === index ? Number.POSITIVE_INFINITY : distance(point, candidate))
      .filter(Number.isFinite);
    return distances.length > 0 ? Math.min(...distances) : 0;
  });
}

function motifDiagnostics(
  project: SkinRebuildProject,
  graph: InternalStructureGraph,
  beforeGeometryHash: string,
): SkinProductionV0MotifDiagnostics {
  const positions = project.patternSides.map((side) => side.insidePosition);
  const contactSpreads = positions.map((position) => graph.nodes.length === 0
    ? 0
    : Math.min(...graph.nodes.map((node) => distance(position, node.position))));
  const spacing = nearestNeighbourSpacing(positions);
  const spacingThreshold = median(spacing) * 1.5;
  const neighbours = Array.from({ length: positions.length }, () => [] as number[]);
  for (let a = 0; a < positions.length; a++) {
    for (let b = a + 1; b < positions.length; b++) {
      if (distance(positions[a], positions[b]) <= spacingThreshold + EPSILON) {
        neighbours[a].push(b); neighbours[b].push(a);
      }
    }
  }
  const seen = new Set<number>();
  let clusterCount = 0;
  for (let start = 0; start < positions.length; start++) {
    if (seen.has(start)) continue;
    clusterCount++;
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of neighbours[current]) {
        if (seen.has(next)) continue;
        seen.add(next); queue.push(next);
      }
    }
  }
  const span = hostSpan(project);
  return {
    motifCount: project.patterns.length,
    motifIds: project.patterns.map((patch) => patch.id),
    contactSpreadMeanSource: contactSpreads.length > 0 ? contactSpreads.reduce((sum, value) => sum + value, 0) / contactSpreads.length : 0,
    contactSpreadMaximumSource: contactSpreads.length > 0 ? Math.max(...contactSpreads) : 0,
    clusterCount,
    spacingCv: coefficientOfVariation(spacing),
    nodeDensityCv: {
      x: densityCv(graph, "x", span),
      y: densityCv(graph, "y", span),
      z: densityCv(graph, "z", span),
    },
    relocationCount: beforeGeometryHash === hashValue(project.patterns) ? 0 : project.patterns.length,
    geometryHash: hashValue(project.patterns),
  };
}

function graphDiagnostics(
  project: SkinRebuildProject,
  graph: InternalStructureGraph,
  scaleMmPerUnit: number,
): SkinProductionV0GraphDiagnostics {
  const lengths = graph.edges.map((edge) => {
    const start = graph.nodes[edge.start]?.position;
    const end = graph.nodes[edge.end]?.position;
    return start && end ? distance(start, end) : 0;
  });
  const validEdges = graph.edges.filter((edge) => graph.nodes[edge.start] && graph.nodes[edge.end]);
  const angles = validEdges.map((edge) => edgeAngleDeg(graph.nodes[edge.start].position, graph.nodes[edge.end].position));
  const span = hostSpan(project);
  const centroid = skinRebuildBaseCentroid(project.base);
  const motifSpacing = median(nearestNeighbourSpacing(project.patternSides.map((side) => side.insidePosition)));
  const localThreshold = Math.max(motifSpacing * 1.5, median(lengths) * 1.5);
  const centralRadius = span.longest * 0.25;
  const degrees = Array<number>(graph.nodes.length).fill(0);
  for (const edge of validEdges) {
    degrees[edge.start]++; degrees[edge.end]++;
  }
  const histogram: Record<string, number> = {};
  for (const degree of degrees) histogram[String(degree)] = (histogram[String(degree)] ?? 0) + 1;
  return {
    nodeCount: graph.nodes.length,
    edgeCount: validEdges.length,
    componentCount: graphComponents(graph).length,
    routeTotalSource: lengths.reduce((sum, value) => sum + value, 0),
    routeTotalMm: lengths.reduce((sum, value) => sum + value, 0) * scaleMmPerUnit,
    routeMaximumSource: lengths.length > 0 ? Math.max(...lengths) : 0,
    routeMaximumMm: (lengths.length > 0 ? Math.max(...lengths) : 0) * scaleMmPerUnit,
    bridgeCount: graphBridgeCount(graph),
    maximumBetweenness: graphBetweenness(graph),
    maximumAngleDeg: angles.length > 0 ? Math.max(...angles) : 0,
    longRangeEdgeCount: lengths.filter((length) => length > Math.max(median(lengths) * 2, EPSILON)).length,
    centralCrossingCount: validEdges.filter((edge) => {
      const start = graph.nodes[edge.start].position;
      const end = graph.nodes[edge.end].position;
      return pointToSegmentDistance(centroid, start, end) <= centralRadius;
    }).length,
    localContactCount: lengths.filter((length) => length <= localThreshold + EPSILON).length,
    nonLocalContactCount: lengths.filter((length) => length > localThreshold + EPSILON).length,
    degreeDistribution: {
      minimum: degrees.length > 0 ? Math.min(...degrees) : 0,
      maximum: degrees.length > 0 ? Math.max(...degrees) : 0,
      mean: degrees.length > 0 ? degrees.reduce((sum, value) => sum + value, 0) / degrees.length : 0,
      histogram,
    },
  };
}

function sampleSpatialDiagnostics(
  project: SkinRebuildProject,
  mesh: SkinMeshResult | MeshBuildResult,
  policy: SkinProductionV0RepairPolicy,
): SkinProductionV0SpatialDiagnostics {
  const evaluator = createFinishedSkinBodySdfEvaluator({
    mode: "plate",
    host: project.base.host,
    hostK: project.base.hostK,
    thickness: project.settings.surfaceThickness,
    patches: project.patterns,
    roundK: project.settings.roundK,
    coinBulge: 0,
    internalGraph: project.finalGraph,
  });
  const resolution = Math.max(6, Math.min(24, Math.round(policy.diagnosticGridResolution)));
  const bounds = mesh.sourceBounds;
  const cells: Array<{ x: number; y: number; z: number; occupied: boolean; radial: number }> = [];
  const center = {
    x: (bounds.min.x + bounds.max.x) * 0.5,
    y: (bounds.min.y + bounds.max.y) * 0.5,
    z: (bounds.min.z + bounds.max.z) * 0.5,
  };
  for (let z = 0; z < resolution; z++) {
    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const point = {
          x: bounds.min.x + ((x + 0.5) / resolution) * bounds.size.x,
          y: bounds.min.y + ((y + 0.5) / resolution) * bounds.size.y,
          z: bounds.min.z + ((z + 0.5) / resolution) * bounds.size.z,
        };
        const normalized = {
          x: bounds.size.x > EPSILON ? (point.x - center.x) / (bounds.size.x * 0.5) : 0,
          y: bounds.size.y > EPSILON ? (point.y - center.y) / (bounds.size.y * 0.5) : 0,
          z: bounds.size.z > EPSILON ? (point.z - center.z) / (bounds.size.z * 0.5) : 0,
        };
        cells.push({
          ...point,
          occupied: evaluator(point.x, point.y, point.z) < 0,
          radial: Math.hypot(normalized.x, normalized.y, normalized.z),
        });
      }
    }
  }
  const centralLimit = Math.max(0.05, Math.min(0.8, policy.centralRegionFraction));
  const internalCells = cells.filter((cell) => cell.radial <= 0.7);
  const shellCells = cells.filter((cell) => cell.radial > 0.7);
  const centralCells = cells.filter((cell) => cell.radial <= centralLimit);
  const ratio = (values: typeof cells): number => values.length > 0 ? values.filter((cell) => cell.occupied).length / values.length : 0;
  const voidCells = cells.map((cell, index) => ({ ...cell, index })).filter((cell) => !cell.occupied && cell.radial <= 0.7);
  const voidIndex = new Set(voidCells.map((cell) => cell.index));
  const visited = new Set<number>();
  let largestVoid = 0;
  let totalVoid = 0;
  const indexOf = (x: number, y: number, z: number): number => z * resolution * resolution + y * resolution + x;
  for (const cell of voidCells) {
    if (visited.has(cell.index)) continue;
    const z = Math.floor(cell.index / (resolution * resolution));
    const y = Math.floor((cell.index % (resolution * resolution)) / resolution);
    const x = cell.index % resolution;
    const queue = [[x, y, z] as const];
    visited.add(cell.index);
    let count = 0;
    while (queue.length > 0) {
      const [cx, cy, cz] = queue.shift()!;
      count++;
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const nx = cx + dx; const ny = cy + dy; const nz = cz + dz;
        if (nx < 0 || ny < 0 || nz < 0 || nx >= resolution || ny >= resolution || nz >= resolution) continue;
        const neighbour = indexOf(nx, ny, nz);
        if (!voidIndex.has(neighbour) || visited.has(neighbour)) continue;
        visited.add(neighbour);
        queue.push([nx, ny, nz]);
      }
    }
    totalVoid += count;
    largestVoid = Math.max(largestVoid, count);
  }
  const sightline = (direction: Vector3Value): number => {
    const normalizedLength = Math.hypot(direction.x, direction.y, direction.z);
    const unit = { x: direction.x / normalizedLength, y: direction.y / normalizedLength, z: direction.z / normalizedLength };
    const denominator = Math.abs(unit.x) / Math.max(bounds.size.x * 0.5, EPSILON)
      + Math.abs(unit.y) / Math.max(bounds.size.y * 0.5, EPSILON)
      + Math.abs(unit.z) / Math.max(bounds.size.z * 0.5, EPSILON);
    const halfExtent = 0.92 / Math.max(denominator, EPSILON);
    const samples = Math.max(12, resolution);
    let clear = 0;
    for (let index = 0; index < samples; index++) {
      const t = -halfExtent + ((index + 0.5) / samples) * halfExtent * 2;
      if (evaluator(center.x + unit.x * t, center.y + unit.y * t, center.z + unit.z * t) >= 0) clear++;
    }
    return clear / samples;
  };
  const cellVolumeMm3 = (bounds.size.x / resolution) * (bounds.size.y / resolution) * (bounds.size.z / resolution) * mesh.scaleMmPerUnit ** 3;
  return {
    internalOccupancyFraction: ratio(internalCells),
    shellOccupancyFraction: ratio(shellCells),
    centralOccupancyFraction: ratio(centralCells),
    congestionFraction: centralCells.length > 0 ? centralCells.filter((cell) => cell.occupied).length / centralCells.length : 0,
    largestVoid: {
      voxelCount: largestVoid,
      volumeMm3: largestVoid * cellVolumeMm3,
      continuityFraction: totalVoid > 0 ? largestVoid / totalVoid : 0,
    },
    sightlines: {
      front: sightline({ x: 0, y: 1, z: 0 }),
      side: sightline({ x: 1, y: 0, z: 0 }),
      oblique: sightline({ x: 1, y: 1, z: 0.6 }),
      axial: sightline({ x: 0, y: 0, z: 1 }),
    },
  };
}

function bodyDiagnostics(
  project: SkinRebuildProject,
  graph: InternalStructureGraph,
  mesh: MeshBuildResult,
  motifBaselineHash: string,
  policy: SkinProductionV0RepairPolicy,
): SkinProductionV0Diagnostics {
  const topology = inspectSavedStlTopology(mesh.triangles, mesh.scaleMmPerUnit);
  const body: SkinProductionV0BodyDiagnostics = {
    source: "actual-native-body",
    triangleCount: mesh.triangles.length,
    volumeMm3: computeMeshVolume(mesh),
    boundsMm: { x: mesh.mmBounds.size.x, y: mesh.mmBounds.size.y, z: mesh.mmBounds.size.z },
    connectedComponents: topology.connectedComponents,
    topology: {
      closed: topology.closed,
      nonManifoldEdges: topology.nonManifoldEdges,
      windingConsistent: topology.windingConsistent,
      degenerateTriangleCount: topology.degenerateTriangleCount,
      nonFiniteTriangleCount: topology.nonFiniteTriangleCount,
    },
  };
  return {
    body,
    spatial: sampleSpatialDiagnostics(project, mesh, policy),
    graph: graphDiagnostics(project, graph, mesh.scaleMmPerUnit),
    motif: motifDiagnostics(project, graph, motifBaselineHash),
  };
}

function cloneGraph(graph: InternalStructureGraph): InternalStructureGraph {
  return {
    kind: graph.kind,
    nodes: graph.nodes.map((node) => ({ ...node, position: cloneVector(node.position) })),
    edges: graph.edges.map((edge) => ({ ...edge })),
    stats: { ...graph.stats },
  };
}

function effectivePolicy(settings: SkinRebuildSettings, policyInput: SkinProductionV0RepairPolicy): SkinProductionV0RepairPolicy {
  return {
    ...policyInput,
    angleThresholdDeg: policyInput.angleThresholdDeg ?? settings.overhangThresholdDeg,
    maxPasses: Math.max(0, Math.floor(policyInput.maxPasses)),
    maxEdgeChangesPerPass: Math.max(0, Math.floor(policyInput.maxEdgeChangesPerPass)),
    maxCandidateRelaysPerEdge: Math.max(1, Math.floor(policyInput.maxCandidateRelaysPerEdge)),
    diagnosticGridResolution: Math.max(6, Math.round(policyInput.diagnosticGridResolution)),
  };
}

function relayCandidates(
  project: SkinRebuildProject,
  start: Vector3Value,
  end: Vector3Value,
  radius: number,
  policy: SkinProductionV0RepairPolicy,
): Vector3Value[] {
  const mid = midpoint(start, end);
  const centroid = skinRebuildBaseCentroid(project.base);
  const toward = { x: centroid.x - mid.x, y: centroid.y - mid.y, z: centroid.z - mid.z };
  const towardLength = Math.hypot(toward.x, toward.y, toward.z);
  const horizontal = horizontalDistance(start, end);
  const thresholdRadians = Math.max(1, policy.angleThresholdDeg ?? 45) * Math.PI / 180;
  const requiredVertical = horizontal > EPSILON ? (horizontal * 0.5) / Math.max(Math.tan(thresholdRadians), EPSILON) : radius;
  const step = Math.max(radius * 2, requiredVertical, distance(start, end) * 0.2);
  const directions: Vector3Value[] = [
    { x: 0, y: 0, z: 1 },
    { x: 0, y: 0, z: -1 },
  ];
  if (towardLength > EPSILON) directions.push(
    { x: toward.x / towardLength, y: toward.y / towardLength, z: toward.z / towardLength },
    { x: -toward.x / towardLength, y: -toward.y / towardLength, z: -toward.z / towardLength },
  );
  const candidates: Vector3Value[] = [];
  for (const direction of directions) {
    for (const factor of [1, 0.75, 0.5, 0.25]) {
      if (candidates.length >= policy.maxCandidateRelaysPerEdge) return candidates;
      const candidate = {
        x: mid.x + direction.x * step * factor,
        y: mid.y + direction.y * step * factor,
        z: mid.z + direction.z * step * factor,
      };
      const routeSamples = 5;
      let contained = true;
      for (let sample = 0; sample <= routeSamples; sample++) {
        const t = sample / routeSamples;
        for (const [a, b] of [[start, candidate], [candidate, end]] as const) {
          const point = {
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
            z: a.z + (b.z - a.z) * t,
          };
          if (fieldSdf(project.base.host, project.base.hostK, point.x, point.y, point.z) > 1e-6) contained = false;
        }
      }
      if (contained) candidates.push(candidate);
    }
  }
  return candidates;
}

function splitGraphEdge(
  graph: InternalStructureGraph,
  edgeId: number,
  relay: Vector3Value,
): InternalStructureGraph {
  const edgeIndex = graph.edges.findIndex((edge) => edge.id === edgeId);
  if (edgeIndex < 0) return graph;
  const source = graph.edges[edgeIndex];
  const nodes = graph.nodes.map((node) => ({ ...node, position: cloneVector(node.position) }));
  const edges = graph.edges.filter((edge) => edge.id !== edgeId).map((edge) => ({ ...edge }));
  const relayId = nodes.length;
  nodes.push({ id: relayId, position: cloneVector(relay), radius: source.radius });
  const nextEdgeId = edges.reduce((maximum, edge) => Math.max(maximum, edge.id), -1) + 1;
  edges.push({ id: nextEdgeId, start: source.start, end: relayId, radius: source.radius });
  edges.push({ id: nextEdgeId + 1, start: relayId, end: source.end, radius: source.radius });
  return {
    kind: graph.kind,
    nodes,
    edges,
    stats: {
      ...graph.stats,
      inputPoints: nodes.length,
      candidateEdges: edges.length,
      gridNodeCount: nodes.length,
      gridEdgeCount: edges.length,
    },
  };
}

function repairDryWebGraph(
  project: SkinRebuildProject,
  graph: InternalStructureGraph,
  policy: SkinProductionV0RepairPolicy,
): { graph: InternalStructureGraph; changedEdgeIds: number[] } {
  let repaired = cloneGraph(graph);
  const changedEdgeIds: number[] = [];
  for (let change = 0; change < policy.maxEdgeChangesPerPass; change++) {
    const targets = repaired.edges
      .map((edge) => {
        const start = repaired.nodes[edge.start]?.position;
        const end = repaired.nodes[edge.end]?.position;
        return start && end ? { edge, angle: edgeAngleDeg(start, end), length: distance(start, end) } : null;
      })
      .filter((value): value is { edge: InternalStructureEdge; angle: number; length: number } => value !== null)
      .filter((value) => value.angle > (policy.angleThresholdDeg ?? 45) + 1e-6)
      .sort((a, b) => b.angle - a.angle || b.length - a.length || a.edge.id - b.edge.id);
    const target = targets[0];
    if (!target) break;
    const start = repaired.nodes[target.edge.start].position;
    const end = repaired.nodes[target.edge.end].position;
    const candidates = relayCandidates(project, start, end, target.edge.radius, policy)
      .map((candidate) => ({
        candidate,
        maximumAngle: Math.max(edgeAngleDeg(start, candidate), edgeAngleDeg(candidate, end)),
        length: distance(start, candidate) + distance(candidate, end),
      }))
      .filter((value) => value.maximumAngle < target.angle - 1e-6)
      .sort((a, b) => a.maximumAngle - b.maximumAngle || a.length - b.length
        || a.candidate.x - b.candidate.x || a.candidate.y - b.candidate.y || a.candidate.z - b.candidate.z);
    if (candidates.length === 0) break;
    repaired = splitGraphEdge(repaired, target.edge.id, candidates[0].candidate);
    changedEdgeIds.push(target.edge.id);
  }
  return { graph: repaired, changedEdgeIds };
}

function generateProject(settingsInput: SkinRebuildSettings): GeneratedCandidate {
  const settings = { ...settingsInput };
  const base = createSkinRebuildBase(settings);
  const { patterns, patternSides } = createSkinRebuildPatterns(base, settings);
  const dryWeb = buildSkinRebuildDryWeb(base, patterns, patternSides, settings);
  const diagnosed = findSkinRebuildLowestPoints(base, patterns, patternSides, dryWeb, settings);
  const { lattice, connections } = buildSkinRebuildLattice(base, patterns, patternSides, diagnosed.lowestPoints, settings);
  const finalGraph = mergeSkinRebuildGraphs(dryWeb, lattice);
  const printSupport = buildSkinRebuildPrintSupport(base, patterns, patternSides, diagnosed.lowestPoints, finalGraph, settings);
  const project = assembleSkinRebuildProject(
    settings,
    base,
    patterns,
    patternSides,
    dryWeb,
    diagnosed.lowestPoints,
    lattice,
    connections,
    printSupport,
  );
  return { project, body: buildSkinRebuildFinalMesh(project, settings.analysisResolution) };
}

function runProductionV0(
  generated: GeneratedCandidate,
  settingsInput: SkinRebuildSettings,
  repairPolicyInput: SkinProductionV0RepairPolicy,
): SkinProductionV0RuntimeBuild {
  const settings = { ...settingsInput };
  const policy = effectivePolicy(settings, repairPolicyInput);
  const motifBaselineHash = hashValue(generated.project.patterns);
  const diagnosticsBefore = bodyDiagnostics(generated.project, generated.project.finalGraph, generated.body, motifBaselineHash, policy);
  let active = generated;
  let activeDiagnostics = diagnosticsBefore;
  const passes: SkinProductionV0RepairPass[] = [];
  for (let pass = 0; pass < policy.maxPasses; pass++) {
    const repaired = repairDryWebGraph(active.project, active.project.dryWeb, policy);
    if (repaired.changedEdgeIds.length === 0) {
      passes.push({ pass: pass + 1, changedEdgeIds: [], accepted: false, candidateDiagnostics: null, rejectionReasons: ["no eligible local relay candidate"] });
      break;
    }
    const project = candidateProject(active.project, repaired.graph);
    const candidate = { project, body: buildSkinRebuildFinalMesh(project, settings.analysisResolution) };
    const candidateDiagnostics = bodyDiagnostics(candidate.project, candidate.project.finalGraph, candidate.body, motifBaselineHash, policy);
    const rejectionReasons = candidatePassAccepted(activeDiagnostics, candidateDiagnostics, policy);
    const accepted = rejectionReasons.length === 0;
    passes.push({ pass: pass + 1, changedEdgeIds: repaired.changedEdgeIds, accepted, candidateDiagnostics, rejectionReasons });
    if (!accepted) break;
    active = candidate;
    activeDiagnostics = candidateDiagnostics;
  }
  const diagnosticsAfter = activeDiagnostics;
  const motifRelocationCount = diagnosticsAfter.motif.relocationCount;
  const provenanceBase = {
    policyVersion: SKIN_PRODUCTION_V0_POLICY_VERSION as typeof SKIN_PRODUCTION_V0_POLICY_VERSION,
    seedPolicy: "motif-conditioned" as const,
    networkCore: "local-relay-permanent-network" as const,
    repairMechanism: "bounded-graph-only" as const,
    coEvolution: "not-implemented" as const,
    hostIdentity: { query: "authored-host" as const, hostK: active.project.base.hostK, geometryHash: hostGeometryHash(active.project) },
    motifIdentity: motifIdentity(active.project),
    generatedNetwork: {
      source: "pattern-side-inside-positions" as const,
      nodeCount: generated.project.dryWeb.nodes.length,
      edgeCount: generated.project.dryWeb.edges.length,
      nodeIds: generated.project.dryWeb.nodes.map((node) => node.id),
      edgeIds: generated.project.dryWeb.edges.map((edge) => edge.id),
    },
    repair: { policy, passes, motifRelocationCount },
    diagnostics: {
      beforeHash: diagnosticsHash(diagnosticsBefore),
      afterHash: diagnosticsHash(diagnosticsAfter),
      bodyGeometryHash: hashMesh(active.body),
    },
  };
  const provenance: SkinProductionV0Provenance = {
    ...provenanceBase,
    deterministicKey: hashValue({ settings, policy, host: provenanceBase.hostIdentity, motifs: provenanceBase.motifIdentity }),
  };
  return {
    project: active.project,
    analysisMesh: active.body,
    diagnosticsBefore,
    diagnosticsAfter,
    provenance,
  };
}

function candidateProject(project: SkinRebuildProject, dryWeb: InternalStructureGraph): SkinRebuildProject {
  return assembleSkinRebuildProject(
    project.settings,
    project.base,
    project.patterns,
    project.patternSides,
    dryWeb,
    project.lowestPoints,
    project.lattice,
    project.latticeConnections,
    project.printSupport,
  );
}

function candidatePassAccepted(
  before: SkinProductionV0Diagnostics,
  after: SkinProductionV0Diagnostics,
  policy: SkinProductionV0RepairPolicy,
): string[] {
  const failures: string[] = [];
  if (after.body.connectedComponents !== 1) failures.push("actual BODY is not one connected component");
  if (!after.body.topology.closed) failures.push("actual BODY is not closed");
  if (after.body.topology.nonManifoldEdges > 0) failures.push("actual BODY has non-manifold edges");
  if (after.body.topology.degenerateTriangleCount > 0) failures.push("actual BODY has saved degenerate triangles");
  if (after.motif.relocationCount !== 0) failures.push("Motif relocation invariant changed");
  const beforeSightlines = before.spatial.sightlines;
  const afterSightlines = after.spatial.sightlines;
  for (const key of ["front", "side", "oblique", "axial"] as const) {
    if (afterSightlines[key] + 1e-9 < beforeSightlines[key] * (1 - policy.maximumSightlineDropFraction)) {
      failures.push(`${key} sightline guardrail failed`);
    }
  }
  if (after.spatial.largestVoid.voxelCount + 1e-9
    < before.spatial.largestVoid.voxelCount * (1 - policy.maximumLargestVoidShrinkFraction)) {
    failures.push("largest-void guardrail failed");
  }
  return failures;
}

function diagnosticsHash(diagnostics: SkinProductionV0Diagnostics): string {
  return hashValue(diagnostics);
}

function motifIdentity(project: SkinRebuildProject): SkinProductionV0Provenance["motifIdentity"] {
  return project.patterns.map((patch) => {
    const side = project.patternSides.find((candidate) => candidate.patchId === patch.id);
    const transformHash = motifTransformHash(patch, side?.surfacePosition ?? { x: 0, y: 0, z: 0 });
    return { id: patch.id, geometryHash: motifGeometryHash(patch), transformHash };
  });
}

export function productionV0Fingerprint(runtime: SkinProductionV0RuntimeBuild): string {
  return hashValue({
    policyVersion: runtime.provenance.policyVersion,
    project: {
      base: runtime.project.base,
      patterns: runtime.project.patterns,
      patternSides: runtime.project.patternSides,
      dryWeb: runtime.project.dryWeb,
      lattice: runtime.project.lattice,
      finalGraph: runtime.project.finalGraph,
    },
    body: {
      geometryHash: runtime.provenance.diagnostics.bodyGeometryHash,
      topology: runtime.diagnosticsAfter.body.topology,
      volumeMm3: runtime.diagnosticsAfter.body.volumeMm3,
    },
    repair: runtime.provenance.repair,
  });
}

export function buildSkinProductionV0(
  settingsInput: SkinRebuildSettings = DEFAULT_SKIN_REBUILD_SETTINGS,
  repairPolicyInput: SkinProductionV0RepairPolicy = DEFAULT_SKIN_PRODUCTION_V0_REPAIR_POLICY,
): SkinProductionV0RuntimeBuild {
  const settings = { ...settingsInput };
  return runProductionV0(generateProject(settings), settings, repairPolicyInput);
}

/** Run production v0 against an already authored SKIN REBUILD project.
 * Host and Motif geometry are copied as inputs; only the derived DryWeb graph
 * and the separate diagnostics/provenance runtime may change. Existing
 * lattice and removable-support fields remain separate and are preserved. */
export function buildSkinProductionV0FromProject(
  projectInput: SkinRebuildProject,
  repairPolicyInput: SkinProductionV0RepairPolicy = DEFAULT_SKIN_PRODUCTION_V0_REPAIR_POLICY,
): SkinProductionV0RuntimeBuild {
  const dryWeb = buildSkinRebuildDryWeb(
    projectInput.base,
    projectInput.patterns,
    projectInput.patternSides,
    projectInput.settings,
  );
  const project = candidateProject(projectInput, dryWeb);
  const generated: GeneratedCandidate = {
    project,
    body: buildSkinRebuildFinalMesh(project, project.settings.analysisResolution),
  };
  return runProductionV0(generated, project.settings, repairPolicyInput);
}
