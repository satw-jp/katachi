// ---------------------------------------------------------------------------
// SKIN Risk-Driven Permanent Lattice v0 — Checkpoint 2.
//
// This is a detached, deterministic planner.  It consumes the accepted
// Checkpoint 1 Risk Cluster / Support Candidate facts plus the same Surface
// triangle soup, chooses a bounded set of lower-side anchors on diagnosed-safe
// faces, and returns an additive graph that can be supplied to the existing
// Surface mesher by an explicitly one-off build script.  It never mutates the
// canonical graph and it does not participate in the editor/runtime adoption
// path.
// ---------------------------------------------------------------------------

import { surfaceOverhangAngleDeg } from "./surfaceAngleDiagnosis.ts";
import type {
  InternalStructureEdge,
  InternalStructureGraph,
  InternalStructureNode,
  Vector3Value,
} from "./voronoi.ts";
import type {
  RiskDrivenInternalLatticeFacts,
  SupportCandidate,
} from "./riskDrivenInternalLattice.ts";

export const RISK_DRIVEN_PERMANENT_LATTICE_ALGORITHM_VERSION = "checkpoint-2-v0";
export const RISK_DRIVEN_PERMANENT_LATTICE_DIAMETER_MM = 2.2;
export const RISK_DRIVEN_PERMANENT_LATTICE_MAX_SEGMENT_MM = 5;
export const RISK_DRIVEN_PERMANENT_LATTICE_MAX_CANDIDATES = 12;
export const RISK_DRIVEN_PERMANENT_LATTICE_MAX_ANCHOR_DISTANCE_STEPS = 12;

const EPSILON = 1e-9;
const DEGENERATE_AREA_EPSILON = 1e-14;
const PATH_SEGMENT_MM = RISK_DRIVEN_PERMANENT_LATTICE_MAX_SEGMENT_MM - 1e-6;

export type RiskDrivenPermanentLatticeNodeRole =
  | "surface-anchor"
  | "spine"
  | "junction"
  | "branch"
  | "risk-target";

export type RiskDrivenPermanentLatticeEdgeRole = "spine" | "branch";

export interface RiskDrivenPermanentLatticeAnchor {
  /** Stable diagnosis-face ordinal, not a Surface Pattern patch ID. */
  readonly id: number;
  readonly diagnosisFaceId: number;
  readonly position: Vector3Value;
  readonly angleDeg: number;
  readonly candidateIds: readonly number[];
}

export interface RiskDrivenPermanentLatticeCandidate {
  /** Rank in the selected bounded candidate set. */
  readonly id: number;
  /** Rank in the complete Checkpoint 1 candidate ordering. */
  readonly sourceRank: number;
  readonly riskClusterId: number;
  readonly position: Vector3Value;
  readonly affectedRiskArea: number;
  readonly remainingRiskArea: number;
  readonly requiredLatticeLength: number;
  readonly supportGain: number;
  readonly anchorId: number;
}

export interface RiskDrivenPermanentLatticeNode extends InternalStructureNode {
  readonly role: RiskDrivenPermanentLatticeNodeRole;
  readonly anchorId?: number;
  readonly candidateId?: number;
  readonly spineId?: number;
}

export interface RiskDrivenPermanentLatticeEdge extends InternalStructureEdge {
  readonly role: RiskDrivenPermanentLatticeEdgeRole;
  readonly diameterMm: number;
  readonly physicalLengthMm: number;
  readonly horizontalMm: number;
  readonly verticalMm: number;
  readonly angleFromVerticalDeg: number;
  readonly candidateId?: number;
  readonly spineId?: number;
}

export interface RiskDrivenPermanentLatticeGraph {
  readonly kind: "targetedGrid";
  readonly nodes: readonly RiskDrivenPermanentLatticeNode[];
  readonly edges: readonly RiskDrivenPermanentLatticeEdge[];
  readonly stats: InternalStructureGraph["stats"] & {
    readonly permanentLatticeGroupCount: number;
    readonly permanentLatticeCandidateCount: number;
    readonly permanentLatticeAnchorCount: number;
  };
}

export interface RiskDrivenPermanentLatticeSpine {
  readonly id: number;
  readonly anchorId: number;
  readonly candidateIds: readonly number[];
  readonly nodeIds: readonly number[];
  readonly edgeIds: readonly number[];
}

export interface RiskDrivenPermanentLatticeBranch {
  readonly candidateId: number;
  readonly spineId: number;
  readonly junctionNodeId: number;
  readonly targetNodeId: number;
  readonly edgeIds: readonly number[];
}

export interface RiskDrivenPermanentLatticePlan {
  readonly status: "current";
  readonly enabled: true;
  readonly algorithmVersion: string;
  readonly thresholdDeg: number;
  readonly meshStep: number;
  readonly scaleMmPerUnit: number;
  readonly diameterMm: number;
  readonly maximumSegmentLengthMm: number;
  readonly maximumAngleFromVerticalDeg: number;
  readonly selectedCandidates: readonly RiskDrivenPermanentLatticeCandidate[];
  readonly anchors: readonly RiskDrivenPermanentLatticeAnchor[];
  readonly spines: readonly RiskDrivenPermanentLatticeSpine[];
  readonly branches: readonly RiskDrivenPermanentLatticeBranch[];
  /** Lattice-only graph, with local IDs starting at zero. */
  readonly graph: RiskDrivenPermanentLatticeGraph;
  /** Canonical graph clone plus lattice nodes/edges with collision-free IDs. */
  readonly augmentedGraph: InternalStructureGraph;
  readonly diagnostics: {
    readonly canonicalNodeCount: number;
    readonly canonicalEdgeCount: number;
    readonly safeSurfaceFaceCount: number;
    readonly selectedCandidateCount: number;
    readonly sharedSpineCount: number;
    readonly latticeNodeCount: number;
    readonly latticeEdgeCount: number;
    readonly augmentedNodeCount: number;
    readonly augmentedEdgeCount: number;
  };
  readonly caveat: string;
}

export interface RiskDrivenPermanentLatticeDisabled {
  readonly status: "disabled";
  readonly enabled: false;
  readonly reason: string;
  readonly selectedCandidates: readonly [];
  readonly anchors: readonly [];
  readonly spines: readonly [];
  readonly branches: readonly [];
  readonly graph: null;
  readonly augmentedGraph: null;
}

export type RiskDrivenPermanentLatticeResult =
  | RiskDrivenPermanentLatticePlan
  | RiskDrivenPermanentLatticeDisabled;

export interface RiskDrivenPermanentLatticeInput {
  readonly riskFacts: RiskDrivenInternalLatticeFacts;
  /** The exact triangle soup used to derive riskFacts, nine values per face. */
  readonly surfacePositions: Float32Array;
  /** Detached canonical graph to augment; never mutated by the planner. */
  readonly canonicalGraph: InternalStructureGraph;
  /** Source units to physical millimetres for diameter and segment checks. */
  readonly scaleMmPerUnit: number;
  /** Optional bounded selection override; never permits more than the v0 cap. */
  readonly maxCandidates?: number;
  /** v0 physical diameter, constrained to the requested 2.0–2.5 mm interval. */
  readonly diameterMm?: number;
}

interface SurfaceFace {
  readonly id: number;
  readonly vertices: readonly [Vector3Value, Vector3Value, Vector3Value];
  readonly centroid: Vector3Value;
  readonly angleDeg: number;
}

interface AnchorChoice {
  readonly face: SurfaceFace;
  readonly horizontalDistance: number;
  readonly verticalDistance: number;
  readonly score: number;
}

interface SpineDraft {
  readonly id: number;
  readonly anchor: RiskDrivenPermanentLatticeAnchor;
  readonly candidateIds: number[];
  readonly junctions: Map<number, number>;
}

function freezeVector(point: Vector3Value): Vector3Value {
  return Object.freeze({ x: point.x, y: point.y, z: point.z });
}

function freezeArray<T>(items: T[]): readonly T[] {
  return Object.freeze(items.slice());
}

function finitePoint(point: Vector3Value): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function disabled(reason: string): RiskDrivenPermanentLatticeDisabled {
  return Object.freeze({
    status: "disabled",
    enabled: false,
    reason,
    selectedCandidates: Object.freeze([]) as readonly [],
    anchors: Object.freeze([]) as readonly [],
    spines: Object.freeze([]) as readonly [],
    branches: Object.freeze([]) as readonly [],
    graph: null,
    augmentedGraph: null,
  });
}

function distance2d(a: Vector3Value, b: Vector3Value): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distance3d(a: Vector3Value, b: Vector3Value): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function compareVector(a: Vector3Value, b: Vector3Value): number {
  return a.z - b.z || a.y - b.y || a.x - b.x;
}

function candidateCompare(a: SupportCandidate & { sourceRank: number }, b: SupportCandidate & { sourceRank: number }): number {
  return b.supportGain - a.supportGain
    || a.requiredLatticeLength - b.requiredLatticeLength
    || a.riskClusterId - b.riskClusterId
    || compareVector(a.position, b.position)
    || a.sourceRank - b.sourceRank;
}

function faceFromPositions(positions: Float32Array, id: number): SurfaceFace | null {
  const offset = id * 9;
  const a = { x: positions[offset], y: positions[offset + 1], z: positions[offset + 2] };
  const b = { x: positions[offset + 3], y: positions[offset + 4], z: positions[offset + 5] };
  const c = { x: positions[offset + 6], y: positions[offset + 7], z: positions[offset + 8] };
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
  const normal = {
    x: ab.y * ac.z - ab.z * ac.y,
    y: ab.z * ac.x - ab.x * ac.z,
    z: ab.x * ac.y - ab.y * ac.x,
  };
  const length = Math.hypot(normal.x, normal.y, normal.z);
  if (!Number.isFinite(length) || length <= DEGENERATE_AREA_EPSILON) return null;
  const centroid = {
    x: (a.x + b.x + c.x) / 3,
    y: (a.y + b.y + c.y) / 3,
    z: (a.z + b.z + c.z) / 3,
  };
  if (!finitePoint(centroid)) return null;
  return {
    id,
    vertices: [a, b, c],
    centroid,
    angleDeg: surfaceOverhangAngleDeg({
      x: normal.x / length,
      y: normal.y / length,
      z: normal.z / length,
    }),
  };
}

function validCanonicalGraph(graph: InternalStructureGraph): boolean {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return false;
  for (let index = 0; index < graph.nodes.length; index++) {
    const node = graph.nodes[index];
    if (!node || node.id !== index || !finitePoint(node.position) || !finitePositive(node.radius)) return false;
  }
  for (let index = 0; index < graph.edges.length; index++) {
    const edge = graph.edges[index];
    if (!edge || edge.id !== index || !Number.isSafeInteger(edge.start) || !Number.isSafeInteger(edge.end)
      || edge.start < 0 || edge.start >= graph.nodes.length || edge.end < 0 || edge.end >= graph.nodes.length
      || edge.start === edge.end || !finitePositive(edge.radius)) return false;
  }
  return Boolean(graph.stats) && graph.kind === "targetedGrid";
}

function cloneGraph(graph: InternalStructureGraph): InternalStructureGraph {
  return {
    kind: graph.kind,
    nodes: graph.nodes.map((node) => ({ ...node, position: { ...node.position } })),
    edges: graph.edges.map((edge) => ({ ...edge })),
    stats: { ...graph.stats },
  };
}

/**
 * Append a lattice graph to a detached canonical graph.  Existing IDs are
 * retained, while local lattice IDs receive contiguous offsets, which keeps
 * the existing mesh converter's id-as-array-index contract valid.
 */
export function augmentRiskDrivenPermanentLatticeGraph(
  canonical: InternalStructureGraph,
  lattice: RiskDrivenPermanentLatticeGraph,
): InternalStructureGraph {
  if (!validCanonicalGraph(canonical)) throw new Error("canonical graph is malformed");
  if (lattice.kind !== "targetedGrid") throw new Error("risk-driven lattice graph kind is unsupported");
  if (lattice.nodes.some((node, index) => node.id !== index)
    || lattice.edges.some((edge, index) => edge.id !== index)) {
    throw new Error("risk-driven lattice IDs are not contiguous");
  }
  const canonicalClone = cloneGraph(canonical);
  const nodeOffset = canonicalClone.nodes.length;
  const edgeOffset = canonicalClone.edges.length;
  const nodes: InternalStructureNode[] = [
    ...canonicalClone.nodes,
    ...lattice.nodes.map((node) => ({
      ...node,
      id: node.id + nodeOffset,
      position: { ...node.position },
    })),
  ];
  const edges: InternalStructureEdge[] = [
    ...canonicalClone.edges,
    ...lattice.edges.map((edge) => ({
      ...edge,
      id: edge.id + edgeOffset,
      start: edge.start + nodeOffset,
      end: edge.end + nodeOffset,
    })),
  ];
  return {
    kind: canonicalClone.kind,
    nodes,
    edges,
    stats: {
      ...canonicalClone.stats,
      inputPoints: nodes.length,
      candidateEdges: edges.length,
      gridNodeCount: nodes.length,
      gridEdgeCount: edges.length,
    },
  };
}

function nodeKey(point: Vector3Value): string {
  return `${point.x},${point.y},${point.z}`;
}

function edgeKey(start: number, end: number): string {
  return start < end ? `${start}:${end}` : `${end}:${start}`;
}

function interpolate(a: Vector3Value, b: Vector3Value, t: number): Vector3Value {
  // Endpoint identity is part of graph topology. Arithmetic interpolation at
  // t=1 can differ from `b` by one ULP and create a visually fused but
  // topologically disconnected branch junction.
  if (t <= 0) return { ...a };
  if (t >= 1) return { ...b };
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function pathPoints(low: Vector3Value, high: Vector3Value, scaleMmPerUnit: number): Vector3Value[] {
  const lengthMm = distance3d(low, high) * scaleMmPerUnit;
  const divisions = Math.max(1, Math.ceil(lengthMm / PATH_SEGMENT_MM));
  const points: Vector3Value[] = [];
  for (let index = 0; index <= divisions; index++) points.push(interpolate(low, high, index / divisions));
  return points;
}

function edgeMeasurement(low: Vector3Value, high: Vector3Value, scaleMmPerUnit: number): {
  physicalLengthMm: number;
  horizontalMm: number;
  verticalMm: number;
  angleFromVerticalDeg: number;
} {
  const horizontal = distance2d(low, high);
  const vertical = Math.abs(high.z - low.z);
  const physicalLengthMm = Math.hypot(horizontal, vertical) * scaleMmPerUnit;
  const horizontalMm = horizontal * scaleMmPerUnit;
  const verticalMm = vertical * scaleMmPerUnit;
  const angleFromVerticalDeg = Math.atan2(horizontal, Math.max(EPSILON, vertical)) * 180 / Math.PI;
  return { physicalLengthMm, horizontalMm, verticalMm, angleFromVerticalDeg };
}

function freezeNode(node: RiskDrivenPermanentLatticeNode): RiskDrivenPermanentLatticeNode {
  return Object.freeze({
    ...node,
    position: freezeVector(node.position),
  });
}

function freezeEdge(edge: RiskDrivenPermanentLatticeEdge): RiskDrivenPermanentLatticeEdge {
  return Object.freeze({ ...edge });
}

function buildLatticeGraph(
  anchors: readonly RiskDrivenPermanentLatticeAnchor[],
  selectedCandidates: readonly RiskDrivenPermanentLatticeCandidate[],
  scaleMmPerUnit: number,
  meshStep: number,
  diameterMm: number,
): {
  graph: RiskDrivenPermanentLatticeGraph;
  spines: readonly RiskDrivenPermanentLatticeSpine[];
  branches: readonly RiskDrivenPermanentLatticeBranch[];
} {
  const radius = diameterMm / (2 * scaleMmPerUnit);
  const nodes: RiskDrivenPermanentLatticeNode[] = [];
  const edges: RiskDrivenPermanentLatticeEdge[] = [];
  const nodeIds = new Map<string, number>();
  const edgeIds = new Map<string, number>();
  const addNode = (
    position: Vector3Value,
    role: RiskDrivenPermanentLatticeNodeRole,
    metadata: { anchorId?: number; candidateId?: number; spineId?: number } = {},
  ): number => {
    const key = nodeKey(position);
    const existing = nodeIds.get(key);
    if (existing !== undefined) return existing;
    const id = nodes.length;
    nodes.push(freezeNode({ id, position: { ...position }, radius, role, ...metadata }));
    nodeIds.set(key, id);
    return id;
  };
  const addEdge = (
    low: Vector3Value,
    high: Vector3Value,
    start: number,
    end: number,
    role: RiskDrivenPermanentLatticeEdgeRole,
    metadata: { candidateId?: number; spineId?: number },
  ): number => {
    const key = edgeKey(start, end);
    const existing = edgeIds.get(key);
    if (existing !== undefined) return existing;
    const measurement = edgeMeasurement(low, high, scaleMmPerUnit);
    if (!(measurement.physicalLengthMm > 0)
      || measurement.physicalLengthMm > RISK_DRIVEN_PERMANENT_LATTICE_MAX_SEGMENT_MM + 1e-6
      || measurement.angleFromVerticalDeg > 45 + 1e-6) {
      throw new Error(`risk-driven lattice edge violates diameter/path constraints: ${JSON.stringify(measurement)}`);
    }
    const id = edges.length;
    edges.push(freezeEdge({
      id,
      start,
      end,
      radius,
      role,
      diameterMm,
      physicalLengthMm: measurement.physicalLengthMm,
      horizontalMm: measurement.horizontalMm,
      verticalMm: measurement.verticalMm,
      angleFromVerticalDeg: measurement.angleFromVerticalDeg,
      ...metadata,
    }));
    edgeIds.set(key, id);
    return id;
  };

  const drafts: SpineDraft[] = [];
  for (const anchor of anchors) {
    const members = selectedCandidates.filter((candidate) => candidate.anchorId === anchor.id);
    if (members.length === 0) continue;
    const spineId = drafts.length;
    const junctionHeights = members.map((candidate) => {
      const horizontal = distance2d(anchor.position, candidate.position);
      return {
        candidate,
        // The shared junction must be below the target so material can grow
        // from the safe anchor upward into the diagnosed Risk point.
        z: candidate.position.z - Math.max(horizontal + meshStep * 0.01, meshStep * 0.5),
      };
    }).sort((a, b) => a.z - b.z || a.candidate.id - b.candidate.id);
    const topZ = junctionHeights[junctionHeights.length - 1]?.z;
    if (!Number.isFinite(topZ) || topZ <= anchor.position.z + EPSILON) {
      throw new Error("risk-driven lattice spine has no finite upper junction");
    }
    const anchorNodeId = addNode(anchor.position, "surface-anchor", { anchorId: anchor.id, spineId });
    // Include every junction height in the vertical path so a junction is an
    // actual shared spine node, rather than a visually coincident isolated
    // node created between two subdivided spine samples.
    const spinePositions: Vector3Value[] = [anchor.position];
    let previousSpinePoint = anchor.position;
    for (const entry of junctionHeights) {
      const nextSpinePoint = { x: anchor.position.x, y: anchor.position.y, z: entry.z };
      if (distance3d(previousSpinePoint, nextSpinePoint) <= EPSILON) continue;
      const segment = pathPoints(previousSpinePoint, nextSpinePoint, scaleMmPerUnit);
      for (let index = 1; index < segment.length; index++) spinePositions.push(segment[index]);
      previousSpinePoint = nextSpinePoint;
    }
    const spineNodeIds: number[] = [anchorNodeId];
    for (let index = 1; index < spinePositions.length; index++) {
      spineNodeIds.push(addNode(spinePositions[index], "spine", { anchorId: anchor.id, spineId }));
    }
    const spineEdgeIds: number[] = [];
    for (let index = 1; index < spineNodeIds.length; index++) {
      spineEdgeIds.push(addEdge(
        spinePositions[index - 1],
        spinePositions[index],
        spineNodeIds[index - 1],
        spineNodeIds[index],
        "spine",
        { spineId },
      ));
    }
    const junctions = new Map<number, number>();
    const branchDrafts: Array<{ candidate: RiskDrivenPermanentLatticeCandidate; junction: Vector3Value }> = [];
    for (const entry of junctionHeights) {
      const junction = { x: anchor.position.x, y: anchor.position.y, z: entry.z };
      const junctionNodeId = addNode(junction, "junction", { anchorId: anchor.id, spineId, candidateId: entry.candidate.id });
      junctions.set(entry.candidate.id, junctionNodeId);
      branchDrafts.push({ candidate: entry.candidate, junction });
    }
    const branchIds = members.map((candidate) => candidate.id);
    drafts.push({
      id: spineId,
      anchor,
      candidateIds: branchIds,
      junctions,
    });
    for (const branch of branchDrafts.sort((a, b) => a.candidate.id - b.candidate.id)) {
      const targetNodeId = addNode(branch.candidate.position, "risk-target", {
        anchorId: anchor.id,
        candidateId: branch.candidate.id,
        spineId,
      });
      const points = pathPoints(branch.candidate.position, branch.junction, scaleMmPerUnit);
      let previousNodeId = targetNodeId;
      for (let index = 1; index < points.length; index++) {
        const point = points[index];
        const nextNodeId = index === points.length - 1
          ? junctions.get(branch.candidate.id)!
          : addNode(point, "branch", { anchorId: anchor.id, candidateId: branch.candidate.id, spineId });
        addEdge(
          points[index - 1],
          point,
          previousNodeId,
          nextNodeId,
          "branch",
          { candidateId: branch.candidate.id, spineId },
        );
        previousNodeId = nextNodeId;
      }
    }
  }

  const spines: RiskDrivenPermanentLatticeSpine[] = drafts.map((draft) => {
    const edgeIdsForSpine = edges
      .filter((edge) => edge.spineId === draft.id && edge.role === "spine")
      .map((edge) => edge.id);
    const nodeIdsForSpine = nodes
      .filter((node) => node.spineId === draft.id)
      .map((node) => node.id);
    return Object.freeze({
      id: draft.id,
      anchorId: draft.anchor.id,
      candidateIds: freezeArray(draft.candidateIds),
      nodeIds: freezeArray(nodeIdsForSpine),
      edgeIds: freezeArray(edgeIdsForSpine),
    });
  });
  const branches: RiskDrivenPermanentLatticeBranch[] = [];
  for (const spine of spines) {
    for (const candidateId of spine.candidateIds) {
      const junctionNodeId = drafts[spine.id]?.junctions.get(candidateId);
      const targetNodeId = nodes.find((node) => node.candidateId === candidateId && node.role === "risk-target")?.id;
      if (junctionNodeId === undefined || targetNodeId === undefined) throw new Error("risk-driven branch endpoint is missing");
      const edgeIdsForBranch = edges
        .filter((edge) => edge.role === "branch" && edge.candidateId === candidateId && edge.spineId === spine.id)
        .map((edge) => edge.id);
      if (edgeIdsForBranch.length === 0) throw new Error("risk-driven branch has no edge");
      branches.push(Object.freeze({
        candidateId,
        spineId: spine.id,
        junctionNodeId,
        targetNodeId,
        edgeIds: freezeArray(edgeIdsForBranch),
      }));
    }
  }
  const frozenNodes = Object.freeze(nodes.slice());
  const frozenEdges = Object.freeze(edges.slice());
  const graph: RiskDrivenPermanentLatticeGraph = Object.freeze({
    kind: "targetedGrid",
    nodes: frozenNodes,
    edges: frozenEdges,
    stats: Object.freeze({
      inputPoints: frozenNodes.length,
      delaunayTetrahedra: 0,
      candidateEdges: frozenEdges.length,
      clippedEdges: 0,
      removedShortEdges: 0,
      removedOutsideEdges: 0,
      removedIsolatedEdges: 0,
      permanentLatticeGroupCount: spines.length,
      permanentLatticeCandidateCount: selectedCandidates.length,
      permanentLatticeAnchorCount: anchors.length,
    }),
  });
  return { graph, spines: Object.freeze(spines), branches: Object.freeze(branches) };
}

function validRiskFacts(facts: RiskDrivenInternalLatticeFacts | null | undefined): facts is RiskDrivenInternalLatticeFacts {
  if (!facts || typeof facts !== "object") return false;
  if (facts.status !== "current" || !facts.enabled
    || !Number.isFinite(facts.thresholdDeg)
    || !Number.isFinite(facts.meshStep) || facts.meshStep <= 0
    || !Array.isArray(facts.clusters) || !Array.isArray(facts.candidates)) return false;
  const clusterIds = new Set<number>();
  for (const cluster of facts.clusters) {
    if (!cluster || !Number.isSafeInteger(cluster.id) || cluster.id < 0 || clusterIds.has(cluster.id)
      || !Array.isArray(cluster.faceIds)
      || !cluster.faceIds.every((faceId: number) => Number.isSafeInteger(faceId) && faceId >= 0)) return false;
    clusterIds.add(cluster.id);
  }
  for (const candidate of facts.candidates) {
    if (!candidate || !Number.isSafeInteger(candidate.riskClusterId)
      || !clusterIds.has(candidate.riskClusterId)
      || !finitePoint(candidate.position)
      || !Number.isFinite(candidate.affectedRiskArea) || candidate.affectedRiskArea < 0
      || !Number.isFinite(candidate.remainingRiskArea) || candidate.remainingRiskArea < 0
      || !Number.isFinite(candidate.supportGain)
      || !Number.isFinite(candidate.requiredLatticeLength) || candidate.requiredLatticeLength <= 0) return false;
  }
  return true;
}

function everyComponentHasSurfaceAnchor(graph: RiskDrivenPermanentLatticeGraph): boolean {
  const adjacency = Array.from({ length: graph.nodes.length }, () => [] as number[]);
  for (const edge of graph.edges) {
    if (!Number.isSafeInteger(edge.start) || !Number.isSafeInteger(edge.end)
      || edge.start < 0 || edge.start >= graph.nodes.length
      || edge.end < 0 || edge.end >= graph.nodes.length) return false;
    adjacency[edge.start].push(edge.end);
    adjacency[edge.end].push(edge.start);
  }
  const visited = new Uint8Array(graph.nodes.length);
  for (let start = 0; start < graph.nodes.length; start++) {
    if (visited[start]) continue;
    const queue = [start];
    visited[start] = 1;
    let anchored = false;
    let hasRiskTarget = false;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const nodeIndex = queue[cursor];
      const node = graph.nodes[nodeIndex];
      if (node.role === "surface-anchor") anchored = true;
      if (node.role === "risk-target") hasRiskTarget = true;
      for (const next of adjacency[nodeIndex]) {
        if (visited[next]) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }
    if (hasRiskTarget && !anchored) return false;
  }
  return true;
}

/**
 * Build one detached permanent-lattice candidate graph from Checkpoint 1.
 * “Safe” means only that the Surface face is below the existing angle
 * threshold; it is not a load, slicer, or printability proof.  A junction is
 * placed below each candidate so every branch grows upward at 45° or less
 * from vertical, while one lower vertical spine can serve several candidates.
 */
export function buildRiskDrivenPermanentLatticePlan(
  input: RiskDrivenPermanentLatticeInput,
): RiskDrivenPermanentLatticeResult {
  if (!validRiskFacts(input?.riskFacts)) return disabled("Risk facts are missing or not current");
  const positions = input.surfacePositions;
  if (!(positions instanceof Float32Array) || positions.length === 0 || positions.length % 9 !== 0) {
    return disabled("Surface diagnosis triangle soup is missing or malformed");
  }
  for (const value of positions) if (!Number.isFinite(value)) return disabled("Surface diagnosis contains non-finite coordinates");
  if (!validCanonicalGraph(input.canonicalGraph)) return disabled("Canonical internal graph is missing or malformed");
  if (!finitePositive(input.scaleMmPerUnit)) return disabled("Surface-to-print scale is missing or non-positive");
  const diameterMm = input.diameterMm ?? RISK_DRIVEN_PERMANENT_LATTICE_DIAMETER_MM;
  if (!Number.isFinite(diameterMm) || diameterMm < 2 || diameterMm > 2.5) {
    return disabled("Permanent lattice diameter must be between 2.0 and 2.5 mm");
  }
  const candidateLimit = input.maxCandidates ?? RISK_DRIVEN_PERMANENT_LATTICE_MAX_CANDIDATES;
  if (!Number.isSafeInteger(candidateLimit) || candidateLimit <= 0) return disabled("Permanent lattice candidate limit is malformed");
  const boundedCandidateLimit = Math.min(candidateLimit, RISK_DRIVEN_PERMANENT_LATTICE_MAX_CANDIDATES);
  const facts = input.riskFacts;
  const faceCount = positions.length / 9;
  const riskyFaceIds = new Set<number>();
  for (const cluster of facts.clusters) {
    for (const faceId of cluster.faceIds) {
      if (!Number.isSafeInteger(faceId) || faceId < 0 || faceId >= faceCount) return disabled("Risk facts reference an invalid diagnosis face ID");
      riskyFaceIds.add(faceId);
    }
  }
  const safeFaces: SurfaceFace[] = [];
  for (let faceId = 0; faceId < faceCount; faceId++) {
    if (riskyFaceIds.has(faceId)) continue;
    const face = faceFromPositions(positions, faceId);
    if (!face || !(face.angleDeg + EPSILON < facts.thresholdDeg)) continue;
    safeFaces.push(face);
  }
  if (safeFaces.length === 0) return disabled("No diagnosed-safe Surface anchor face is available");

  const rankedCandidates = facts.candidates
    .map((candidate, sourceRank) => ({ ...candidate, sourceRank }))
    .sort(candidateCompare);
  const seenCandidatePositions = new Set<string>();
  const seenRiskClusters = new Set<number>();
  const selectedDrafts: Array<{
    source: SupportCandidate & { sourceRank: number };
    anchorFace: SurfaceFace;
  }> = [];
  const groups: Array<{ anchorFace: SurfaceFace; candidateSourceRanks: number[] }> = [];
  const anchorDistanceLimit = facts.meshStep * RISK_DRIVEN_PERMANENT_LATTICE_MAX_ANCHOR_DISTANCE_STEPS;
  if (!finitePositive(anchorDistanceLimit)) return disabled("Surface anchor search scale is non-finite");
  for (const source of rankedCandidates) {
    if (selectedDrafts.length >= boundedCandidateLimit) break;
    if (!finitePoint(source.position)) continue;
    if (seenRiskClusters.has(source.riskClusterId)) continue;
    const positionKey = `${Math.round(source.position.x / Math.max(facts.meshStep * 0.25, EPSILON))},${Math.round(source.position.y / Math.max(facts.meshStep * 0.25, EPSILON))},${Math.round(source.position.z / Math.max(facts.meshStep * 0.25, EPSILON))}`;
    if (seenCandidatePositions.has(positionKey)) continue;
    const anchorChoices: AnchorChoice[] = [];
    for (const face of safeFaces) {
      const verticalDistance = source.position.z - face.centroid.z;
      if (!(verticalDistance > EPSILON)) continue;
      const horizontalDistance = distance2d(source.position, face.centroid);
      if (!(horizontalDistance <= anchorDistanceLimit + EPSILON)) continue;
      // A 45°-or-less branch needs at least as much upward travel as lateral
      // travel. Reject anchors that would require approaching from above.
      if (verticalDistance + EPSILON < horizontalDistance + facts.meshStep * 0.5) continue;
      // Existing groups are considered before new anchors so nearby candidates
      // deterministically share their lower spine whenever possible.
      const score = horizontalDistance + verticalDistance * 0.01;
      anchorChoices.push({ face, horizontalDistance, verticalDistance, score });
    }
    if (anchorChoices.length === 0) continue;
    anchorChoices.sort((a, b) => a.score - b.score
      || a.horizontalDistance - b.horizontalDistance
      || b.verticalDistance - a.verticalDistance
      || a.face.id - b.face.id);
    const existingAnchorIds = new Set(groups.map((group) => group.anchorFace.id));
    const shared = anchorChoices.find((choice) => existingAnchorIds.has(choice.face.id));
    const choice = shared ?? anchorChoices[0];
    if (!choice) continue;
    seenCandidatePositions.add(positionKey);
    seenRiskClusters.add(source.riskClusterId);
    selectedDrafts.push({ source, anchorFace: choice.face });
    const group = groups.find((entry) => entry.anchorFace.id === choice.face.id);
    if (group) group.candidateSourceRanks.push(source.sourceRank);
    else groups.push({ anchorFace: choice.face, candidateSourceRanks: [source.sourceRank] });
  }
  if (selectedDrafts.length === 0) return disabled("No bounded Risk Candidate has a diagnosed-safe lower Surface anchor");

  groups.sort((a, b) => a.anchorFace.id - b.anchorFace.id);
  const anchorIdByFaceId = new Map<number, number>();
  const anchors: RiskDrivenPermanentLatticeAnchor[] = groups.map((group, id) => {
    anchorIdByFaceId.set(group.anchorFace.id, id);
    return Object.freeze({
      id,
      diagnosisFaceId: group.anchorFace.id,
      position: freezeVector(group.anchorFace.centroid),
      angleDeg: group.anchorFace.angleDeg,
      candidateIds: Object.freeze([]) as readonly number[],
    });
  });
  const selectedCandidates: RiskDrivenPermanentLatticeCandidate[] = selectedDrafts.map((draft, id) => {
    const anchorId = anchorIdByFaceId.get(draft.anchorFace.id);
    if (anchorId === undefined) throw new Error("risk-driven lattice anchor mapping is missing");
    return Object.freeze({
      id,
      sourceRank: draft.source.sourceRank,
      riskClusterId: draft.source.riskClusterId,
      position: freezeVector(draft.source.position),
      affectedRiskArea: draft.source.affectedRiskArea,
      remainingRiskArea: draft.source.remainingRiskArea,
      requiredLatticeLength: draft.source.requiredLatticeLength,
      supportGain: draft.source.supportGain,
      anchorId,
    });
  });
  const candidateIdsByAnchor = new Map<number, number[]>();
  for (const candidate of selectedCandidates) {
    const ids = candidateIdsByAnchor.get(candidate.anchorId);
    if (ids) ids.push(candidate.id);
    else candidateIdsByAnchor.set(candidate.anchorId, [candidate.id]);
  }
  const detachedAnchors = anchors.map((anchor) => Object.freeze({
    ...anchor,
    candidateIds: Object.freeze(candidateIdsByAnchor.get(anchor.id)?.slice() ?? []) as readonly number[],
  }));
  const lattice = buildLatticeGraph(
    detachedAnchors,
    selectedCandidates,
    input.scaleMmPerUnit,
    facts.meshStep,
    diameterMm,
  );
  if (!everyComponentHasSurfaceAnchor(lattice.graph)) {
    return disabled("A Risk branch is not connected to a diagnosed-safe Surface anchor");
  }
  const augmentedGraph = augmentRiskDrivenPermanentLatticeGraph(input.canonicalGraph, lattice.graph);
  const sharedSpineCount = lattice.spines.filter((spine) => spine.candidateIds.length > 1).length;
  if (sharedSpineCount === 0) return disabled("No shared spine serves more than one Risk Candidate");
  return Object.freeze({
    status: "current",
    enabled: true,
    algorithmVersion: RISK_DRIVEN_PERMANENT_LATTICE_ALGORITHM_VERSION,
    thresholdDeg: facts.thresholdDeg,
    meshStep: facts.meshStep,
    scaleMmPerUnit: input.scaleMmPerUnit,
    diameterMm,
    maximumSegmentLengthMm: RISK_DRIVEN_PERMANENT_LATTICE_MAX_SEGMENT_MM,
    maximumAngleFromVerticalDeg: 45,
    selectedCandidates: Object.freeze(selectedCandidates),
    anchors: Object.freeze(detachedAnchors),
    spines: lattice.spines,
    branches: lattice.branches,
    graph: lattice.graph,
    augmentedGraph,
    diagnostics: Object.freeze({
      canonicalNodeCount: input.canonicalGraph.nodes.length,
      canonicalEdgeCount: input.canonicalGraph.edges.length,
      safeSurfaceFaceCount: safeFaces.length,
      selectedCandidateCount: selectedCandidates.length,
      sharedSpineCount,
      latticeNodeCount: lattice.graph.nodes.length,
      latticeEdgeCount: lattice.graph.edges.length,
      augmentedNodeCount: augmentedGraph.nodes.length,
      augmentedEdgeCount: augmentedGraph.edges.length,
    }),
    caveat: "Permanent Lattice v0 は診断Risk Clusterを眺めるための候補Graphです。diameter/segment/angleと保存mesh topologyを検査しますが、荷重・支持除去・Slicer挙動・実物の安全性・printabilityは確立しません。",
  });
}
