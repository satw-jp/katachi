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
  readonly terminalLines: readonly string[];
}

export interface NetworkFormationTimeline {
  readonly variantId: NetworkFormationVariantId;
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

export function createNetworkFormationTimeline(
  graph: InternalStructureGraph,
  variantId: NetworkFormationVariantId = DEFAULT_NETWORK_FORMATION_VARIANT_ID,
): NetworkFormationTimeline {
  const edgeOrder = networkFormationEdgeOrder(graph, variantId);
  const variant = networkFormationVariant(variantId);
  if (edgeOrder.length === 0) {
    return {
      variantId,
      durationMs: NETWORK_FORMATION_DURATION_MS,
      edgeOrder,
      events: [
        { atMs: 0, kind: "reset", visibleEdgeCount: 0, terminalLines: [`STUDY ${variant.label}`, "NO COMPLETED NETWORK"] },
        { atMs: NETWORK_FORMATION_DURATION_MS, kind: "stable", visibleEdgeCount: 0, terminalLines: ["NETWORK STABLE", `STUDY ${variant.label}`] },
      ],
    };
  }

  const acceptEventCount = Math.min(edgeOrder.length, Math.max(18, Math.min(52, Math.ceil(edgeOrder.length / 7))));
  const rejectFractions = acceptEventCount >= 10 ? formationRejectFractions(variantId) : [0.5];
  const rejectSlots = new Set(rejectFractions.map((fraction) => Math.floor(acceptEventCount * fraction)));
  const rejectionWindowMs = 540;
  const startMs = 380;
  const revealWindowMs = 10_600;
  const cadenceMs = (revealWindowMs - rejectSlots.size * rejectionWindowMs) / acceptEventCount;
  const events: NetworkFormationEvent[] = [{
    atMs: 0,
    kind: "reset",
    visibleEdgeCount: 0,
    terminalLines: [`STUDY ${variant.label}`, ...NETWORK_FORMATION_VARIANT_CUES[variantId], "INITIALIZING EMPTY VIEW"],
  }];
  let timeMs = startMs;
  let previousCount = 0;
  let proposalIndex = 0;

  for (let step = 1; step <= acceptEventCount; step++) {
    const remainingSteps = acceptEventCount - step;
    const desiredCount = Math.ceil(edgeOrder.length * formationRevealFraction(variantId, step / acceptEventCount));
    const visibleEdgeCount = step === acceptEventCount
      ? edgeOrder.length
      : Math.min(edgeOrder.length - remainingSteps, Math.max(previousCount + 1, desiredCount));
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
          atMs: Math.round(timeMs + 120),
          kind: "evaluate",
          visibleEdgeCount: previousCount,
          proposal,
          terminalLines: ["TEMP EDGE ONLY", "COMPLETED GRAPH SET UNCHANGED", "EVALUATE"],
        });
        events.push({
          atMs: Math.round(timeMs + 280),
          kind: "reject",
          visibleEdgeCount: previousCount,
          proposal,
          terminalLines: ["NOT IN COMPLETED GRAPH", "REJECT", `REMOVE EDGE ${proposal.id}`, `REROUTING TARGET ${String(target).padStart(2, "0")}`],
        });
        events.push({
          atMs: Math.round(timeMs + 420),
          kind: "revise",
          visibleEdgeCount: previousCount,
          proposal,
          terminalLines: ["REVISE PRESENTATION ROUTE", "SELECT NEXT COMPLETED EDGE", "KEEP COMPLETED GRAPH INTACT"],
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
      `STUDY ${variant.label}`,
      `${graph.nodes.length} NODES / ${graph.edges.length} EDGES`,
      "COMPLETED GRAPH MATCHED",
    ],
  });
  return { variantId, durationMs: NETWORK_FORMATION_DURATION_MS, edgeOrder, events };
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
