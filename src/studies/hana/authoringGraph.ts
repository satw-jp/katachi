import type { HanaVector3 } from "./stroke3d.ts";

export const HANA_AUTHORING_NODE_ROLES = [
  "flower-center",
  "junction",
  "branch",
  "anchor",
  "attachment",
  "free-end",
] as const;
export type HanaAuthoringNodeRole = typeof HANA_AUTHORING_NODE_ROLES[number];

export const HANA_AUTHORING_EDGE_ROLES = [
  "stem",
  "petal",
  "connector",
  "surface-strand",
  "gesture-stroke",
] as const;
export type HanaAuthoringEdgeRole = typeof HANA_AUTHORING_EDGE_ROLES[number];

export interface HanaGraphProvenance {
  sourceObjectIds: string[];
  sourceGestureIds: string[];
}

export interface HanaAuthoringNode {
  id: string;
  role: HanaAuthoringNodeRole;
  sourceObjectId: string | null;
  position: HanaVector3;
  provenance: HanaGraphProvenance;
  revision: number;
  protected: boolean;
}

export interface HanaAuthoringEdge {
  id: string;
  role: HanaAuthoringEdgeRole;
  sourceObjectId: string | null;
  fromNodeId: string;
  toNodeId: string;
  provenance: HanaGraphProvenance;
  revision: number;
  protected: boolean;
}

export interface HanaAuthoringGraph {
  nodes: HanaAuthoringNode[];
  edges: HanaAuthoringEdge[];
  revision: number;
}

export interface HanaGraphValidationIssue {
  code:
  | "duplicate-node-id"
  | "duplicate-edge-id"
  | "missing-edge-node"
  | "duplicate-connection"
  | "zero-length-edge"
  | "stale-source-reference";
  message: string;
  entityId?: string;
}

export interface HanaGraphValidationResult {
  valid: boolean;
  issues: HanaGraphValidationIssue[];
}

export interface HanaGraphOverlaySegment {
  edgeId: string;
  role: HanaAuthoringEdgeRole;
  from: HanaVector3;
  to: HanaVector3;
}

function cloneVector(value: HanaVector3): HanaVector3 {
  return { x: value.x, y: value.y, z: value.z };
}

function cloneProvenance(value: HanaGraphProvenance): HanaGraphProvenance {
  return {
    sourceObjectIds: [...value.sourceObjectIds],
    sourceGestureIds: [...value.sourceGestureIds],
  };
}

function cloneNode(node: HanaAuthoringNode): HanaAuthoringNode {
  return {
    ...node,
    position: cloneVector(node.position),
    provenance: cloneProvenance(node.provenance),
  };
}

function cloneEdge(edge: HanaAuthoringEdge): HanaAuthoringEdge {
  return { ...edge, provenance: cloneProvenance(edge.provenance) };
}

function cloneGraph(graph: HanaAuthoringGraph): HanaAuthoringGraph {
  return {
    nodes: graph.nodes.map(cloneNode),
    edges: graph.edges.map(cloneEdge),
    revision: graph.revision,
  };
}

function defaultProvenance(provenance?: Partial<HanaGraphProvenance>): HanaGraphProvenance {
  return {
    sourceObjectIds: [...(provenance?.sourceObjectIds ?? [])],
    sourceGestureIds: [...(provenance?.sourceGestureIds ?? [])],
  };
}

export function createAuthoringGraph(): HanaAuthoringGraph {
  return { nodes: [], edges: [], revision: 0 };
}

export function addAuthoringNode(
  graph: HanaAuthoringGraph,
  node: Omit<HanaAuthoringNode, "revision" | "provenance"> & {
    revision?: number;
    provenance?: Partial<HanaGraphProvenance>;
  },
): HanaAuthoringGraph {
  if (graph.nodes.some((candidate) => candidate.id === node.id)) {
    throw new Error(`Authoring node already exists: ${node.id}`);
  }
  const next = cloneGraph(graph);
  next.nodes.push({
    ...node,
    position: cloneVector(node.position),
    provenance: defaultProvenance(node.provenance),
    revision: node.revision ?? 0,
  });
  next.revision += 1;
  return next;
}

export function connectAuthoringNodes(
  graph: HanaAuthoringGraph,
  edge: Omit<HanaAuthoringEdge, "revision" | "provenance"> & {
    revision?: number;
    provenance?: Partial<HanaGraphProvenance>;
  },
): HanaAuthoringGraph {
  if (!graph.nodes.some((node) => node.id === edge.fromNodeId)) {
    throw new Error(`Unknown source node: ${edge.fromNodeId}`);
  }
  if (!graph.nodes.some((node) => node.id === edge.toNodeId)) {
    throw new Error(`Unknown target node: ${edge.toNodeId}`);
  }
  if (graph.edges.some((candidate) => candidate.id === edge.id)) {
    throw new Error(`Authoring edge already exists: ${edge.id}`);
  }
  if (graph.edges.some((candidate) => (
    candidate.fromNodeId === edge.fromNodeId
    && candidate.toNodeId === edge.toNodeId
    && candidate.role === edge.role
  ))) {
    throw new Error(`Authoring connection already exists: ${edge.fromNodeId} → ${edge.toNodeId}`);
  }
  const next = cloneGraph(graph);
  next.edges.push({
    ...edge,
    provenance: defaultProvenance(edge.provenance),
    revision: edge.revision ?? 0,
  });
  next.revision += 1;
  return next;
}

export function disconnectAuthoringEdge(
  graph: HanaAuthoringGraph,
  edgeId: string,
): HanaAuthoringGraph {
  const next = cloneGraph(graph);
  const before = next.edges.length;
  next.edges = next.edges.filter((edge) => edge.id !== edgeId);
  if (next.edges.length !== before) next.revision += 1;
  return next;
}

export function createJunctionNode(
  graph: HanaAuthoringGraph,
  id: string,
  position: HanaVector3,
  provenance: Partial<HanaGraphProvenance> = {},
): HanaAuthoringGraph {
  return addAuthoringNode(graph, {
    id,
    role: "junction",
    sourceObjectId: null,
    position,
    provenance,
    protected: false,
  });
}

export function graphOverlaySegments(
  graph: HanaAuthoringGraph,
): HanaGraphOverlaySegment[] {
  const positions = new Map(graph.nodes.map((node) => [node.id, node.position]));
  return graph.edges.flatMap((edge) => {
    const from = positions.get(edge.fromNodeId);
    const to = positions.get(edge.toNodeId);
    return from && to
      ? [{ edgeId: edge.id, role: edge.role, from: cloneVector(from), to: cloneVector(to) }]
      : [];
  });
}

export function validateAuthoringGraph(
  graph: HanaAuthoringGraph,
  validSourceIds?: Iterable<string>,
): HanaGraphValidationResult {
  const issues: HanaGraphValidationIssue[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  const nodes = new Map<string, HanaAuthoringNode>();
  const sourceIds = validSourceIds ? new Set(validSourceIds) : null;

  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      issues.push({ code: "duplicate-node-id", message: `Duplicate node id: ${node.id}`, entityId: node.id });
    }
    nodeIds.add(node.id);
    nodes.set(node.id, node);
    if (sourceIds && node.sourceObjectId && !sourceIds.has(node.sourceObjectId)) {
      issues.push({ code: "stale-source-reference", message: `Node references missing source object: ${node.sourceObjectId}`, entityId: node.id });
    }
  }

  const connections = new Set<string>();
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) {
      issues.push({ code: "duplicate-edge-id", message: `Duplicate edge id: ${edge.id}`, entityId: edge.id });
    }
    edgeIds.add(edge.id);
    const from = nodes.get(edge.fromNodeId);
    const to = nodes.get(edge.toNodeId);
    if (!from || !to) {
      issues.push({ code: "missing-edge-node", message: `Edge references missing node: ${edge.id}`, entityId: edge.id });
      continue;
    }
    const connectionKey = `${edge.role}:${edge.fromNodeId}:${edge.toNodeId}`;
    if (connections.has(connectionKey)) {
      issues.push({ code: "duplicate-connection", message: `Duplicate authoring connection: ${connectionKey}`, entityId: edge.id });
    }
    connections.add(connectionKey);
    if (from.position.x === to.position.x && from.position.y === to.position.y && from.position.z === to.position.z) {
      issues.push({ code: "zero-length-edge", message: `Edge has coincident endpoints: ${edge.id}`, entityId: edge.id });
    }
    if (sourceIds && edge.sourceObjectId && !sourceIds.has(edge.sourceObjectId)) {
      issues.push({ code: "stale-source-reference", message: `Edge references missing source object: ${edge.sourceObjectId}`, entityId: edge.id });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function cloneAuthoringGraph(graph: HanaAuthoringGraph): HanaAuthoringGraph {
  return cloneGraph(graph);
}

/**
 * Remove safe references to deleted authoring objects while refusing to leave a
 * protected graph entity in an ambiguous state.
 */
export function removeAuthoringGraphReferences(
  graph: HanaAuthoringGraph,
  deletedObjectIds: readonly string[],
  deletedGestureIds: readonly string[] = [],
  remainingObjectIds: Iterable<string> = [],
  remainingGestureIds: Iterable<string> = [],
): HanaAuthoringGraph {
  const deletedObjects = new Set(deletedObjectIds);
  const deletedGestures = new Set(deletedGestureIds);
  const remainingObjects = new Set(remainingObjectIds);
  const remainingGestures = new Set(remainingGestureIds);
  const referencesDeleted = (entity: HanaAuthoringNode | HanaAuthoringEdge): boolean => (
    (entity.sourceObjectId !== null && deletedObjects.has(entity.sourceObjectId))
    || entity.provenance.sourceObjectIds.some((id) => deletedObjects.has(id))
    || entity.provenance.sourceGestureIds.some((id) => deletedGestures.has(id))
  );
  for (const entity of [...graph.nodes, ...graph.edges]) {
    if (entity.protected && referencesDeleted(entity)) {
      throw new Error(`Cannot delete protected Graph reference: ${entity.id}`);
    }
  }
  const removedNodeIds = new Set(
    graph.nodes
      .filter((node) => !node.protected && referencesDeleted(node))
      .map((node) => node.id),
  );
  for (const edge of graph.edges) {
    if (edge.protected && (removedNodeIds.has(edge.fromNodeId) || removedNodeIds.has(edge.toNodeId))) {
      throw new Error(`Cannot delete protected Graph reference: ${edge.id}`);
    }
  }
  const next = cloneGraph(graph);
  next.nodes = next.nodes
    .filter((node) => !removedNodeIds.has(node.id))
    .map((node) => ({
      ...node,
      sourceObjectId: node.sourceObjectId && deletedObjects.has(node.sourceObjectId)
        ? null
        : node.sourceObjectId,
      provenance: {
        sourceObjectIds: node.provenance.sourceObjectIds.filter((id) => !deletedObjects.has(id) && (!remainingObjects.size || remainingObjects.has(id))),
        sourceGestureIds: node.provenance.sourceGestureIds.filter((id) => !deletedGestures.has(id) && (!remainingGestures.size || remainingGestures.has(id))),
      },
    }));
  const survivingNodeIds = new Set(next.nodes.map((node) => node.id));
  next.edges = next.edges
    .filter((edge) => survivingNodeIds.has(edge.fromNodeId) && survivingNodeIds.has(edge.toNodeId))
    .filter((edge) => !referencesDeleted(edge))
    .map((edge) => ({
      ...edge,
      sourceObjectId: edge.sourceObjectId && deletedObjects.has(edge.sourceObjectId)
        ? null
        : edge.sourceObjectId,
      provenance: {
        sourceObjectIds: edge.provenance.sourceObjectIds.filter((id) => !deletedObjects.has(id) && (!remainingObjects.size || remainingObjects.has(id))),
        sourceGestureIds: edge.provenance.sourceGestureIds.filter((id) => !deletedGestures.has(id) && (!remainingGestures.size || remainingGestures.has(id))),
      },
    }));
  if (next.nodes.length !== graph.nodes.length || next.edges.length !== graph.edges.length) next.revision += 1;
  return next;
}
