import type {
  InternalStructureEdge,
  InternalStructureGraph,
} from "../voronoi.ts";

export const NETWORK_FORMATION_DURATION_MS = 12_400;

export type NetworkFormationEventKind = "reset" | "accept" | "propose" | "reject" | "stable";

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
  readonly terminalLines: readonly string[];
}

export interface NetworkFormationTimeline {
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

/**
 * Produce a deterministic reveal order from the already-completed graph.
 * This is display traversal only: it creates no nodes or permanent edges and
 * never participates in generation, validation, save, or export.
 */
export function networkFormationEdgeOrder(graph: InternalStructureGraph): number[] {
  const incident = new Map<number, number[]>();
  for (const [edgeIndex, edge] of graph.edges.entries()) {
    for (const nodeIndex of [edge.start, edge.end]) {
      const edges = incident.get(nodeIndex) ?? [];
      edges.push(edgeIndex);
      incident.set(nodeIndex, edges);
    }
  }
  for (const edges of incident.values()) edges.sort((a, b) => edgeStableOrder(graph, a, b));

  const remaining = new Set(graph.edges.map((_, index) => index));
  const result: number[] = [];
  while (remaining.size > 0) {
    const seed = Array.from(remaining).sort((a, b) => (
      edgeMidpointZ(graph, a) - edgeMidpointZ(graph, b) || edgeStableOrder(graph, a, b)
    ))[0];
    const queue = [seed];
    remaining.delete(seed);
    while (queue.length > 0) {
      const edgeIndex = queue.shift()!;
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

export function createNetworkFormationTimeline(graph: InternalStructureGraph): NetworkFormationTimeline {
  const edgeOrder = networkFormationEdgeOrder(graph);
  if (edgeOrder.length === 0) {
    return {
      durationMs: NETWORK_FORMATION_DURATION_MS,
      edgeOrder,
      events: [
        { atMs: 0, kind: "reset", visibleEdgeCount: 0, terminalLines: ["NETWORK FORMATION", "NO COMPLETED NETWORK"] },
        { atMs: NETWORK_FORMATION_DURATION_MS, kind: "stable", visibleEdgeCount: 0, terminalLines: ["NETWORK STABLE"] },
      ],
    };
  }

  const acceptEventCount = Math.min(edgeOrder.length, Math.max(18, Math.min(52, Math.ceil(edgeOrder.length / 7))));
  const rejectSlots = acceptEventCount >= 10
    ? new Set([Math.floor(acceptEventCount * 0.31), Math.floor(acceptEventCount * 0.67)])
    : new Set([Math.floor(acceptEventCount * 0.5)]);
  const rejectionWindowMs = 540;
  const startMs = 380;
  const revealWindowMs = 10_600;
  const cadenceMs = (revealWindowMs - rejectSlots.size * rejectionWindowMs) / acceptEventCount;
  const events: NetworkFormationEvent[] = [{
    atMs: 0,
    kind: "reset",
    visibleEdgeCount: 0,
    terminalLines: ["NETWORK FORMATION", "READING COMPLETED GRAPH", "INITIALIZING EMPTY VIEW"],
  }];
  let timeMs = startMs;
  let previousCount = 0;
  let proposalIndex = 0;

  for (let step = 1; step <= acceptEventCount; step++) {
    const visibleEdgeCount = Math.min(edgeOrder.length, Math.ceil(edgeOrder.length * step / acceptEventCount));
    if (rejectSlots.has(step - 1)) {
      const proposal = proposalForCheckpoint(graph, edgeOrder, previousCount, proposalIndex);
      if (proposal) {
        const target = graph.nodes[proposal.endNodeIndex]?.id ?? proposal.endNodeIndex;
        events.push({
          atMs: Math.round(timeMs),
          kind: "propose",
          visibleEdgeCount: previousCount,
          proposal,
          terminalLines: [`TARGET ${String(target).padStart(2, "0")}`, `EDGE ${proposal.id} PROPOSED`, "ROUTE UNRESOLVED"],
        });
        events.push({
          atMs: Math.round(timeMs + 280),
          kind: "reject",
          visibleEdgeCount: previousCount,
          proposal,
          terminalLines: ["CLEARANCE FAILED", "REJECT", `REMOVE EDGE ${proposal.id}`, `REROUTING TARGET ${String(target).padStart(2, "0")}`],
        });
        proposalIndex++;
        timeMs += rejectionWindowMs;
      }
    }
    const focusEdgeIndex = edgeOrder[Math.max(0, visibleEdgeCount - 1)];
    events.push({
      atMs: Math.round(timeMs),
      kind: "accept",
      visibleEdgeCount,
      terminalLines: acceptTerminalLines(graph, focusEdgeIndex),
    });
    previousCount = visibleEdgeCount;
    timeMs += cadenceMs;
  }

  events.push({
    atMs: NETWORK_FORMATION_DURATION_MS,
    kind: "stable",
    visibleEdgeCount: edgeOrder.length,
    terminalLines: [
      "NETWORK STABLE",
      `${graph.nodes.length} NODES / ${graph.edges.length} EDGES`,
      "COMPLETED GRAPH MATCHED",
    ],
  });
  return { durationMs: NETWORK_FORMATION_DURATION_MS, edgeOrder, events };
}

/** Build an ephemeral renderer graph from accepted completed edges. */
export function networkFormationGraphAt(
  graph: InternalStructureGraph,
  edgeOrder: readonly number[],
  visibleEdgeCount: number,
): InternalStructureGraph {
  if (visibleEdgeCount >= edgeOrder.length) return graph;
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
