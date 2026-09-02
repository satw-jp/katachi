import type {
  InternalStructureEdge,
  InternalStructureGraph,
} from "../voronoi.ts";

export const NETWORK_FORMATION_DURATION_MS = 12_400;

export const NETWORK_FORMATION_VARIANT_IDS = [
  "trace",
  "radial-bloom",
  "boundary-frost",
  "geodesic-signal",
  "polar-scan",
  "mirror-stitch",
  "thickness-hierarchy",
  "local-weave",
  "hub-cascade",
  "multi-seed-confluence",
] as const;

export type NetworkFormationVariantId = typeof NETWORK_FORMATION_VARIANT_IDS[number];

export const REPRESENTATIVE_NETWORK_FORMATION_ID = "representative" as const;
export type NetworkFormationTimelineId = NetworkFormationVariantId | typeof REPRESENTATIVE_NETWORK_FORMATION_ID;

export type NetworkFormationChapterId =
  | "trace"
  | "radial-bloom"
  | "confluence"
  | "decision"
  | "thickness"
  | "converge";

export const NETWORK_FORMATION_CHAPTER_LABELS: Record<NetworkFormationChapterId, string> = {
  trace: "TRACE",
  "radial-bloom": "RADIAL BLOOM",
  confluence: "CONFLUENCE",
  decision: "PROPOSE / EVALUATE / REVISE",
  thickness: "THICKNESS",
  converge: "CONVERGE",
};

export interface NetworkFormationVariantOption {
  readonly id: NetworkFormationVariantId;
  readonly label: string;
  readonly description: string;
}

export const DEFAULT_NETWORK_FORMATION_VARIANT_ID: NetworkFormationVariantId = "trace";

export const NETWORK_FORMATION_VARIANTS: readonly NetworkFormationVariantOption[] = [
  { id: "trace", label: "TRACE", description: "A connected front grows from the lowest completed member." },
  { id: "radial-bloom", label: "RADIAL BLOOM", description: "The completed network opens from its spatial core." },
  { id: "boundary-frost", label: "BOUNDARY FROST", description: "An outer cage crystallizes before the interior arrives." },
  { id: "geodesic-signal", label: "GEODESIC SIGNAL", description: "A measured signal propagates through completed paths." },
  { id: "polar-scan", label: "POLAR SCAN", description: "An angular sweep reads the network sector by sector." },
  { id: "mirror-stitch", label: "MIRROR STITCH", description: "Opposing sides are stitched out from a central plane." },
  { id: "thickness-hierarchy", label: "THICKNESS", description: "Primary members arrive before the finest connections." },
  { id: "local-weave", label: "LOCAL WEAVE", description: "Short local relations accumulate before long bridges." },
  { id: "hub-cascade", label: "HUB CASCADE", description: "High-degree junctions ignite in successive starbursts." },
  { id: "multi-seed-confluence", label: "CONFLUENCE", description: "Three distant fronts form in parallel and converge." },
] as const;

export function isNetworkFormationVariantId(value: string): value is NetworkFormationVariantId {
  return (NETWORK_FORMATION_VARIANT_IDS as readonly string[]).includes(value);
}

export function networkFormationVariant(
  id: NetworkFormationVariantId,
): NetworkFormationVariantOption {
  return NETWORK_FORMATION_VARIANTS.find((candidate) => candidate.id === id)!;
}

export type NetworkFormationEventKind = "reset" | "accept" | "propose" | "evaluate" | "reject" | "revise" | "stable";

export interface NetworkFormationProposal {
  readonly id: string;
  readonly startNodeIndex: number;
  readonly endNodeIndex: number;
  readonly radius: number;
}

export interface NetworkFormationEvent {
  readonly atMs: number;
  readonly kind: NetworkFormationEventKind;
  readonly visibleEdgeCount: number;
  readonly proposal?: NetworkFormationProposal;
  readonly chapter?: NetworkFormationChapterId;
  readonly terminalLines: readonly string[];
}

export interface NetworkFormationTimeline {
  readonly variantId: NetworkFormationTimelineId;
  readonly durationMs: number;
  readonly edgeOrder: readonly number[];
  readonly events: readonly NetworkFormationEvent[];
}

function edgeStableOrder(graph: InternalStructureGraph, leftIndex: number, rightIndex: number): number {
  const left = graph.edges[leftIndex];
  const right = graph.edges[rightIndex];
  return left.id - right.id || leftIndex - rightIndex;
}

function edgeMidpointZ(graph: InternalStructureGraph, edgeIndex: number): number {
  const edge = graph.edges[edgeIndex];
  const start = graph.nodes[edge.start]?.position;
  const end = graph.nodes[edge.end]?.position;
  return start && end ? (start.z + end.z) * 0.5 : Number.POSITIVE_INFINITY;
}

interface FormationPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function edgeMidpoint(graph: InternalStructureGraph, edgeIndex: number): FormationPoint {
  const edge = graph.edges[edgeIndex];
  const start = graph.nodes[edge.start]?.position;
  const end = graph.nodes[edge.end]?.position;
  if (!start || !end) return { x: 0, y: 0, z: Number.POSITIVE_INFINITY };
  return {
    x: (start.x + end.x) * 0.5,
    y: (start.y + end.y) * 0.5,
    z: (start.z + end.z) * 0.5,
  };
}

function graphCentroid(graph: InternalStructureGraph): FormationPoint {
  if (graph.nodes.length === 0) return { x: 0, y: 0, z: 0 };
  const sum = graph.nodes.reduce((value, node) => ({
    x: value.x + node.position.x,
    y: value.y + node.position.y,
    z: value.z + node.position.z,
  }), { x: 0, y: 0, z: 0 });
  const inverse = 1 / graph.nodes.length;
  return { x: sum.x * inverse, y: sum.y * inverse, z: sum.z * inverse };
}

function edgeLength(graph: InternalStructureGraph, edgeIndex: number): number {
  const edge = graph.edges[edgeIndex];
  const start = graph.nodes[edge.start]?.position;
  const end = graph.nodes[edge.end]?.position;
  return start && end
    ? Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z)
    : Number.POSITIVE_INFINITY;
}

function sortedEdgeIndices(
  graph: InternalStructureGraph,
  compare: (leftIndex: number, rightIndex: number) => number,
): number[] {
  return graph.edges.map((_, index) => index)
    .sort((left, right) => compare(left, right) || edgeStableOrder(graph, left, right));
}

function edgeIncidentMap(graph: InternalStructureGraph): Map<number, number[]> {
  const incident = new Map<number, number[]>();
  for (const [edgeIndex, edge] of graph.edges.entries()) {
    for (const nodeIndex of [edge.start, edge.end]) {
      const edges = incident.get(nodeIndex) ?? [];
      edges.push(edgeIndex);
      incident.set(nodeIndex, edges);
    }
  }
  for (const edges of incident.values()) edges.sort((a, b) => edgeStableOrder(graph, a, b));
  return incident;
}

function connectedEdgeOrder(
  graph: InternalStructureGraph,
  seedCompare: (leftIndex: number, rightIndex: number) => number,
): number[] {
  const incident = edgeIncidentMap(graph);
  const seeds = sortedEdgeIndices(graph, seedCompare);
  const remaining = new Set(seeds);
  const result: number[] = [];
  for (const seed of seeds) {
    if (!remaining.delete(seed)) continue;
    const queue = [seed];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const edgeIndex = queue[cursor];
      result.push(edgeIndex);
      const edge = graph.edges[edgeIndex];
      const next = [...(incident.get(edge.start) ?? []), ...(incident.get(edge.end) ?? [])]
        .filter((candidate) => remaining.has(candidate))
        .sort((a, b) => edgeStableOrder(graph, a, b));
      for (const candidate of next) {
        remaining.delete(candidate);
        queue.push(candidate);
      }
    }
  }
  return result;
}

function geodesicEdgeOrder(graph: InternalStructureGraph): number[] {
  if (graph.nodes.length === 0) return [];
  const rootIndex = graph.nodes.map((_, index) => index).sort((left, right) => (
    graph.nodes[left].position.z - graph.nodes[right].position.z ||
    graph.nodes[left].id - graph.nodes[right].id || left - right
  ))[0];
  const incident = edgeIncidentMap(graph);
  const distances = Array.from({ length: graph.nodes.length }, () => Number.POSITIVE_INFINITY);
  distances[rootIndex] = 0;
  const queue: { nodeIndex: number; distance: number }[] = [{ nodeIndex: rootIndex, distance: 0 }];
  while (queue.length > 0) {
    queue.sort((left, right) => right.distance - left.distance || right.nodeIndex - left.nodeIndex);
    const current = queue.pop()!;
    if (current.distance !== distances[current.nodeIndex]) continue;
    for (const edgeIndex of incident.get(current.nodeIndex) ?? []) {
      const edge = graph.edges[edgeIndex];
      const nextNode = edge.start === current.nodeIndex ? edge.end : edge.start;
      const nextDistance = current.distance + edgeLength(graph, edgeIndex);
      if (nextDistance >= distances[nextNode]) continue;
      distances[nextNode] = nextDistance;
      queue.push({ nodeIndex: nextNode, distance: nextDistance });
    }
  }
  return sortedEdgeIndices(graph, (leftIndex, rightIndex) => {
    const left = graph.edges[leftIndex];
    const right = graph.edges[rightIndex];
    return Math.max(distances[left.start], distances[left.end]) -
      Math.max(distances[right.start], distances[right.end]);
  });
}

function multiSeedEdgeOrder(graph: InternalStructureGraph): number[] {
  if (graph.edges.length === 0) return [];
  const centroid = graphCentroid(graph);
  const byLow = sortedEdgeIndices(graph, (left, right) => edgeMidpointZ(graph, left) - edgeMidpointZ(graph, right));
  const byHigh = [...byLow].reverse();
  const byRadius = sortedEdgeIndices(graph, (left, right) => {
    const leftPoint = edgeMidpoint(graph, left);
    const rightPoint = edgeMidpoint(graph, right);
    const leftRadius = Math.hypot(leftPoint.x - centroid.x, leftPoint.y - centroid.y, leftPoint.z - centroid.z);
    const rightRadius = Math.hypot(rightPoint.x - centroid.x, rightPoint.y - centroid.y, rightPoint.z - centroid.z);
    return rightRadius - leftRadius;
  });
  const seeds = Array.from(new Set([byLow[0], byHigh[0], byRadius[0]]));
  const incident = edgeIncidentMap(graph);
  const claimed = new Set(seeds);
  const queues = seeds.map((seed) => [seed]);
  const cursors = seeds.map(() => 0);
  const result: number[] = [];
  while (result.length < graph.edges.length) {
    let progressed = false;
    for (let front = 0; front < queues.length; front++) {
      const edgeIndex = queues[front][cursors[front]++];
      if (edgeIndex === undefined) continue;
      progressed = true;
      result.push(edgeIndex);
      const edge = graph.edges[edgeIndex];
      const next = [...(incident.get(edge.start) ?? []), ...(incident.get(edge.end) ?? [])]
        .filter((candidate) => !claimed.has(candidate))
        .sort((a, b) => edgeStableOrder(graph, a, b));
      for (const candidate of next) {
        claimed.add(candidate);
        queues[front].push(candidate);
      }
    }
    if (progressed) continue;
    const nextSeed = graph.edges.findIndex((_, index) => !claimed.has(index));
    if (nextSeed < 0) break;
    claimed.add(nextSeed);
    queues.push([nextSeed]);
    cursors.push(0);
  }
  return result;
}

/**
 * Produce a deterministic reveal order from the already-completed graph.
 * This is display traversal only: it creates no nodes or permanent edges and
 * never participates in generation, validation, save, or export.
 */
export function networkFormationEdgeOrder(
  graph: InternalStructureGraph,
  variantId: NetworkFormationVariantId = DEFAULT_NETWORK_FORMATION_VARIANT_ID,
): number[] {
  const centroid = graphCentroid(graph);
  const radialDistance = (edgeIndex: number): number => {
    const point = edgeMidpoint(graph, edgeIndex);
    return Math.hypot(point.x - centroid.x, point.y - centroid.y, point.z - centroid.z);
  };
  switch (variantId) {
    case "trace":
      return connectedEdgeOrder(graph, (left, right) => edgeMidpointZ(graph, left) - edgeMidpointZ(graph, right));
    case "radial-bloom":
      return sortedEdgeIndices(graph, (left, right) => radialDistance(left) - radialDistance(right));
    case "boundary-frost":
      return sortedEdgeIndices(graph, (left, right) => radialDistance(right) - radialDistance(left));
    case "geodesic-signal":
      return geodesicEdgeOrder(graph);
    case "polar-scan":
      return sortedEdgeIndices(graph, (left, right) => {
        const leftPoint = edgeMidpoint(graph, left);
        const rightPoint = edgeMidpoint(graph, right);
        return Math.atan2(leftPoint.y - centroid.y, leftPoint.x - centroid.x) -
          Math.atan2(rightPoint.y - centroid.y, rightPoint.x - centroid.x);
      });
    case "mirror-stitch": {
      const extents = (["x", "y", "z"] as const).map((axis) => {
        const values = graph.nodes.map((node) => node.position[axis]);
        return { axis, span: values.length > 0 ? Math.max(...values) - Math.min(...values) : 0 };
      }).sort((left, right) => right.span - left.span);
      const axis = extents[0].axis;
      return sortedEdgeIndices(graph, (left, right) => {
        const leftDelta = edgeMidpoint(graph, left)[axis] - centroid[axis];
        const rightDelta = edgeMidpoint(graph, right)[axis] - centroid[axis];
        return Math.abs(leftDelta) - Math.abs(rightDelta) || Math.sign(leftDelta) - Math.sign(rightDelta);
      });
    }
    case "thickness-hierarchy":
      return sortedEdgeIndices(graph, (left, right) => (
        graph.edges[right].radius - graph.edges[left].radius || edgeLength(graph, right) - edgeLength(graph, left)
      ));
    case "local-weave":
      return sortedEdgeIndices(graph, (left, right) => edgeLength(graph, left) - edgeLength(graph, right));
    case "hub-cascade": {
      const degree = Array.from({ length: graph.nodes.length }, () => 0);
      for (const edge of graph.edges) {
        degree[edge.start]++;
        degree[edge.end]++;
      }
      return sortedEdgeIndices(graph, (leftIndex, rightIndex) => {
        const left = graph.edges[leftIndex];
        const right = graph.edges[rightIndex];
        return Math.max(degree[right.start], degree[right.end]) - Math.max(degree[left.start], degree[left.end]) ||
          Math.min(degree[right.start], degree[right.end]) - Math.min(degree[left.start], degree[left.end]);
      });
    }
    case "multi-seed-confluence":
      return multiSeedEdgeOrder(graph);
  }
}

function edgePairKey(start: number, end: number): string {
  return start < end ? `${start}:${end}` : `${end}:${start}`;
}

function proposalForCheckpoint(
  graph: InternalStructureGraph,
  edgeOrder: readonly number[],
  visibleEdgeCount: number,
  proposalIndex: number,
): NetworkFormationProposal | null {
  const permanentPairs = new Set(graph.edges.map((edge) => edgePairKey(edge.start, edge.end)));
  const visible = edgeOrder.slice(0, Math.max(1, visibleEdgeCount)).reverse();
  const upcoming = edgeOrder.slice(visibleEdgeCount, visibleEdgeCount + 24);
  const sourceNodes = visible.flatMap((edgeIndex) => {
    const edge = graph.edges[edgeIndex];
    return [edge.end, edge.start];
  }).slice(0, 24);
  const targetNodes = upcoming.flatMap((edgeIndex) => {
    const edge = graph.edges[edgeIndex];
    return [edge.start, edge.end];
  });
  const nearbyRadii = [...visible.slice(0, 8), ...upcoming.slice(0, 12)]
    .map((edgeIndex) => graph.edges[edgeIndex]?.radius)
    .filter((radius): radius is number => Number.isFinite(radius) && radius > 0)
    .sort((left, right) => left - right);
  const presentationRadius = nearbyRadii.length > 0
    ? nearbyRadii[Math.floor(nearbyRadii.length * 0.5)]
    : null;

  for (const startNodeIndex of sourceNodes) {
    for (const endNodeIndex of targetNodes) {
      if (startNodeIndex === endNodeIndex) continue;
      if (permanentPairs.has(edgePairKey(startNodeIndex, endNodeIndex))) continue;
      const start = graph.nodes[startNodeIndex];
      const end = graph.nodes[endNodeIndex];
      if (!start || !end) continue;
      const dx = end.position.x - start.position.x;
      const dy = end.position.y - start.position.y;
      const dz = end.position.z - start.position.z;
      if (dx * dx + dy * dy + dz * dz < 1e-8) continue;
      return {
        id: `TEMP-${String(proposalIndex + 1).padStart(2, "0")}`,
        startNodeIndex,
        endNodeIndex,
        // Keep a rejected route visually comparable to the completed network.
        // Node radii can be much wider than members, so prefer nearby real edge
        // radii while keeping this value entirely presentation-local.
        radius: Math.max(0.001, presentationRadius ?? Math.min(start.radius, end.radius)),
      };
    }
  }
  return null;
}

function edgeAngleDegrees(graph: InternalStructureGraph, edge: InternalStructureEdge): number | null {
  const start = graph.nodes[edge.start]?.position;
  const end = graph.nodes[edge.end]?.position;
  if (!start || !end) return null;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dy, dz);
  if (!(length > 1e-9)) return null;
  return Math.acos(Math.min(1, Math.abs(dz) / length)) * 180 / Math.PI;
}

function acceptTerminalLines(graph: InternalStructureGraph, edgeIndex: number): string[] {
  const edge = graph.edges[edgeIndex];
  const target = graph.nodes[edge.end]?.id ?? edge.end;
  const angle = edgeAngleDegrees(graph, edge);
  return [
    `TARGET ${String(target).padStart(2, "0")}`,
    `EDGE ${String(edge.id).padStart(3, "0")} PROPOSED`,
    ...(angle === null ? [] : [`ANGLE ${angle.toFixed(1)} DEG`]),
    "ACCEPT",
  ];
}

const NETWORK_FORMATION_VARIANT_CUES: Record<NetworkFormationVariantId, readonly string[]> = {
  "trace": ["LOW ROOT SELECTED", "FOLLOWING CONNECTIVITY"],
  "radial-bloom": ["CORE ORIGIN ACQUIRED", "EXPANDING RADIUS"],
  "boundary-frost": ["BOUNDARY PASS", "COLLAPSING INWARD"],
  "geodesic-signal": ["LOW ROOT SELECTED", "PROPAGATING PATH COST"],
  "polar-scan": ["CENTROID ACQUIRED", "ANGULAR SECTOR SWEEP"],
  "mirror-stitch": ["CENTER PLANE ACQUIRED", "STITCHING OPPOSING SIDES"],
  "thickness-hierarchy": ["PRIMARY GAUGE FIRST", "RESOLVING FINE MEMBERS"],
  "local-weave": ["LOCAL SPANS FIRST", "WEAVING LONG BRIDGES"],
  "hub-cascade": ["HIGH DEGREE HUB FIRST", "CASCADE SPOKES"],
  "multi-seed-confluence": ["SEEDS A / B / C", "PARALLEL FRONTS ACTIVE"],
};

function formationRejectFractions(variantId: NetworkFormationVariantId): readonly number[] {
  if (variantId === "multi-seed-confluence") return [0.18, 0.39, 0.61, 0.79];
  if (variantId === "geodesic-signal" || variantId === "hub-cascade") return [0.24, 0.52, 0.76];
  return [0.31, 0.67];
}

function formationRevealFraction(variantId: NetworkFormationVariantId, fraction: number): number {
  switch (variantId) {
    case "radial-bloom":
    case "thickness-hierarchy":
      return 1 - (1 - fraction) ** 1.55;
    case "boundary-frost":
    case "local-weave":
      return fraction ** 1.55;
    case "hub-cascade":
      return Math.min(1, Math.ceil(fraction * 6) / 6);
    default:
      return fraction;
  }
}

interface FormationTimelineConfig {
  readonly timelineId: NetworkFormationTimelineId;
  readonly label: string;
  readonly cues: readonly string[];
  readonly rejectFractions: readonly number[];
  readonly revealFraction: (fraction: number) => number;
  readonly chapterForEdge?: (edgeIndex: number) => NetworkFormationChapterId | undefined;
  readonly chapterForDecision?: NetworkFormationChapterId;
  readonly stableLines: readonly string[];
  readonly initialPrefix: string;
}

function representativeNetworkFormationOrder(
  graph: InternalStructureGraph,
): { edgeOrder: number[]; chapterByEdge: Map<number, NetworkFormationChapterId> } {
  const total = graph.edges.length;
  const edgeOrder: number[] = [];
  const chapterByEdge = new Map<number, NetworkFormationChapterId>();
  const seen = new Set<number>();
  const appendUntil = (
    targetCount: number,
    order: readonly number[],
    chapter: NetworkFormationChapterId,
  ): void => {
    for (const edgeIndex of order) {
      if (edgeOrder.length >= targetCount) break;
      if (seen.has(edgeIndex)) continue;
      seen.add(edgeIndex);
      edgeOrder.push(edgeIndex);
      chapterByEdge.set(edgeIndex, chapter);
    }
  };

  // Borrow existing traversals for each visual front. The thresholds only
  // partition the completed graph for presentation; they never create or
  // reorder anything in the saved/runtime graph.
  appendUntil(Math.max(1, Math.round(total * 0.18)), networkFormationEdgeOrder(graph, "trace"), "trace");
  appendUntil(Math.max(1, Math.round(total * 0.44)), networkFormationEdgeOrder(graph, "radial-bloom"), "radial-bloom");
  appendUntil(Math.max(1, Math.round(total * 0.67)), networkFormationEdgeOrder(graph, "multi-seed-confluence"), "confluence");
  appendUntil(Math.max(1, Math.round(total * 0.86)), networkFormationEdgeOrder(graph, "thickness-hierarchy"), "thickness");
  appendUntil(total, networkFormationEdgeOrder(graph, "geodesic-signal"), "converge");

  // Defensive completion for an unexpected disconnected or malformed edge.
  for (const edgeIndex of graph.edges.map((_, index) => index)) {
    if (seen.has(edgeIndex)) continue;
    seen.add(edgeIndex);
    edgeOrder.push(edgeIndex);
    chapterByEdge.set(edgeIndex, "converge");
  }
  return { edgeOrder, chapterByEdge };
}

function representativeChapterLines(
  graph: InternalStructureGraph,
  chapter: NetworkFormationChapterId,
  edgeIndex: number,
): string[] {
  const edge = graph.edges[edgeIndex];
  switch (chapter) {
    case "trace":
      return ["TRACE / CONNECTED FRONT", "LOW ROOT TOPOLOGY"];
    case "radial-bloom":
      return ["RADIAL BLOOM / SPATIAL CORE", "EXPANDING LOCALITY"];
    case "confluence":
      return ["CONFLUENCE / MULTI-SEED FRONT", "JUNCTIONS IN VIEW"];
    case "thickness":
      return [
        "THICKNESS / MEMBER GAUGE",
        ...(edge && Number.isFinite(edge.radius) ? [`RADIUS ${edge.radius.toFixed(3)} SOURCE UNITS`] : []),
      ];
    case "converge":
      return ["CONVERGE / COMPLETED TOPOLOGY", "REMAINING EDGES RESOLVED"];
    case "decision":
      return ["PROPOSE / EVALUATE / REVISE", "PRESENTATION ROUTE ONLY"];
  }
}

function createNetworkFormationTimelineFromOrder(
  graph: InternalStructureGraph,
  edgeOrder: readonly number[],
  config: FormationTimelineConfig,
): NetworkFormationTimeline {
  if (edgeOrder.length === 0) {
    return {
      variantId: config.timelineId,
      durationMs: NETWORK_FORMATION_DURATION_MS,
      edgeOrder,
      events: [
        {
          atMs: 0,
          kind: "reset",
          visibleEdgeCount: 0,
          chapter: config.chapterForDecision,
          terminalLines: [`${config.initialPrefix} ${config.label}`, "NO COMPLETED NETWORK"],
        },
        {
          atMs: NETWORK_FORMATION_DURATION_MS,
          kind: "stable",
          visibleEdgeCount: 0,
          chapter: "converge",
          terminalLines: [...config.stableLines],
        },
      ],
    };
  }

  const acceptEventCount = Math.min(edgeOrder.length, Math.max(18, Math.min(52, Math.ceil(edgeOrder.length / 7))));
  const rejectSlots = new Set(config.rejectFractions.map((fraction) => Math.floor(acceptEventCount * fraction)));
  const rejectionWindowMs = 540;
  const startMs = 380;
  const revealWindowMs = 10_600;
  const cadenceMs = (revealWindowMs - rejectSlots.size * rejectionWindowMs) / acceptEventCount;
  const events: NetworkFormationEvent[] = [{
    atMs: 0,
    kind: "reset",
    visibleEdgeCount: 0,
    chapter: config.chapterForDecision,
    terminalLines: [`${config.initialPrefix} ${config.label}`, ...config.cues, "INITIALIZING EMPTY VIEW"],
  }];
  let timeMs = startMs;
  let previousCount = 0;
  let proposalIndex = 0;
  let previousChapter: NetworkFormationChapterId | undefined;

  for (let step = 1; step <= acceptEventCount; step++) {
    const remainingSteps = acceptEventCount - step;
    const desiredCount = Math.ceil(edgeOrder.length * config.revealFraction(step / acceptEventCount));
    const visibleEdgeCount = step === acceptEventCount
      ? edgeOrder.length
      : Math.min(edgeOrder.length - remainingSteps, Math.max(previousCount + 1, desiredCount));
    const focusEdgeIndex = edgeOrder[Math.max(0, visibleEdgeCount - 1)];
    const focusChapter = config.chapterForEdge?.(focusEdgeIndex);
    if (rejectSlots.has(step - 1)) {
      const proposal = proposalForCheckpoint(graph, edgeOrder, previousCount, proposalIndex);
      if (proposal) {
        const target = graph.nodes[proposal.endNodeIndex]?.id ?? proposal.endNodeIndex;
        const decisionChapter = config.chapterForDecision;
        events.push({
          atMs: Math.round(timeMs),
          kind: "propose",
          visibleEdgeCount: previousCount,
          proposal,
          chapter: decisionChapter,
          terminalLines: [`TARGET ${String(target).padStart(2, "0")}`, `EDGE ${proposal.id} PROPOSED`, "ROUTE UNRESOLVED"],
        });
        events.push({
          atMs: Math.round(timeMs + 120),
          kind: "evaluate",
          visibleEdgeCount: previousCount,
          proposal,
          chapter: decisionChapter,
          terminalLines: ["TEMP EDGE ONLY", "COMPLETED GRAPH SET UNCHANGED", "EVALUATE"],
        });
        events.push({
          atMs: Math.round(timeMs + 280),
          kind: "reject",
          visibleEdgeCount: previousCount,
          proposal,
          chapter: decisionChapter,
          terminalLines: ["NOT IN COMPLETED GRAPH", "REJECT", `REMOVE EDGE ${proposal.id}`, `REROUTING TARGET ${String(target).padStart(2, "0")}`],
        });
        events.push({
          atMs: Math.round(timeMs + 420),
          kind: "revise",
          visibleEdgeCount: previousCount,
          proposal,
          chapter: decisionChapter,
          terminalLines: ["REVISE PRESENTATION ROUTE", "SELECT NEXT COMPLETED EDGE", "KEEP COMPLETED GRAPH INTACT"],
        });
        proposalIndex++;
        timeMs += rejectionWindowMs;
      }
    }
    const chapterChanged = focusChapter !== undefined && focusChapter !== previousChapter;
    events.push({
      atMs: Math.round(timeMs),
      kind: "accept",
      visibleEdgeCount,
      chapter: focusChapter,
      terminalLines: [
        ...(chapterChanged && focusChapter ? representativeChapterLines(graph, focusChapter, focusEdgeIndex) : []),
        ...acceptTerminalLines(graph, focusEdgeIndex),
      ],
    });
    previousChapter = focusChapter;
    previousCount = visibleEdgeCount;
    timeMs += cadenceMs;
  }

  events.push({
    atMs: NETWORK_FORMATION_DURATION_MS,
    kind: "stable",
    visibleEdgeCount: edgeOrder.length,
    chapter: "converge",
    terminalLines: [...config.stableLines],
  });
  return { variantId: config.timelineId, durationMs: NETWORK_FORMATION_DURATION_MS, edgeOrder, events };
}

export function createNetworkFormationTimeline(
  graph: InternalStructureGraph,
  variantId: NetworkFormationVariantId = DEFAULT_NETWORK_FORMATION_VARIANT_ID,
): NetworkFormationTimeline {
  const variant = networkFormationVariant(variantId);
  const edgeOrder = networkFormationEdgeOrder(graph, variantId);
  return createNetworkFormationTimelineFromOrder(graph, edgeOrder, {
    timelineId: variantId,
    label: variant.label,
    cues: NETWORK_FORMATION_VARIANT_CUES[variantId],
    rejectFractions: edgeOrder.length >= 10 ? formationRejectFractions(variantId) : [0.5],
    revealFraction: (fraction) => formationRevealFraction(variantId, fraction),
    stableLines: [
      "NETWORK STABLE",
      `STUDY ${variant.label}`,
      `${graph.nodes.length} NODES / ${graph.edges.length} EDGES`,
      "COMPLETED GRAPH MATCHED",
    ],
    initialPrefix: "STUDY",
  });
}

/**
 * Compose one artwork from four existing completed-graph traversals. This is
 * deliberately a presentation plan: the final frame reuses the exact source
 * graph object and no temporary route enters runtime or save state.
 */
export function createRepresentativeNetworkFormationTimeline(
  graph: InternalStructureGraph,
): NetworkFormationTimeline {
  const composition = representativeNetworkFormationOrder(graph);
  return createNetworkFormationTimelineFromOrder(graph, composition.edgeOrder, {
    timelineId: REPRESENTATIVE_NETWORK_FORMATION_ID,
    label: "FORMATION",
    cues: [
      "TRACE / CONNECTED FRONT",
      "RADIAL BLOOM / SPATIAL CORE",
      "CONFLUENCE / MULTI-SEED JUNCTION",
      "THICKNESS / MEMBER GAUGE",
    ],
    rejectFractions: [0.27, 0.49, 0.72],
    revealFraction: (fraction) => fraction ** 0.9,
    chapterForEdge: (edgeIndex) => composition.chapterByEdge.get(edgeIndex),
    chapterForDecision: "decision",
    stableLines: [
      "NETWORK STABLE",
      "TRACE / RADIAL BLOOM / CONFLUENCE",
      "THICKNESS / CONVERGE",
      `${graph.nodes.length} NODES / ${graph.edges.length} EDGES`,
      "COMPLETED GRAPH MATCHED",
    ],
    initialPrefix: "FORMATION",
  });
}

/** Build an ephemeral renderer graph from accepted completed edges. */
export function networkFormationGraphAt(
  graph: InternalStructureGraph,
  edgeOrder: readonly number[],
  visibleEdgeCount: number,
): InternalStructureGraph {
  if (visibleEdgeCount >= graph.edges.length) return graph;
  const edgeIndices = edgeOrder.slice(0, Math.max(0, visibleEdgeCount));
  const nodeIndices = Array.from(new Set(edgeIndices.flatMap((edgeIndex) => {
    const edge = graph.edges[edgeIndex];
    return [edge.start, edge.end];
  }))).sort((a, b) => a - b);
  const remap = new Map(nodeIndices.map((nodeIndex, index) => [nodeIndex, index]));
  return {
    kind: graph.kind,
    nodes: nodeIndices.map((nodeIndex) => {
      const node = graph.nodes[nodeIndex];
      return { ...node, position: { ...node.position } };
    }),
    edges: edgeIndices.map((edgeIndex) => {
      const edge = graph.edges[edgeIndex];
      return {
        ...edge,
        start: remap.get(edge.start)!,
        end: remap.get(edge.end)!,
      };
    }),
    stats: { ...graph.stats },
  };
}
