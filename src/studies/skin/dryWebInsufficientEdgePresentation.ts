import {
  dryWebAuthorPresentation,
  dryWebContactBinKey,
  normalizeDryWebRequiredContacts,
  type DryWebContactBinKey,
} from "./dryWebAuthorPresentation.ts";
import type { TargetedGridContactFacts, TargetedGridTargetConnectionFact } from "./targetedGrid.ts";
import type { InternalStructureGraph, Vector3Value } from "./voronoi.ts";

export const DRY_WEB_INSUFFICIENT_EDGE_COPY =
  "generator facts only · target接続edgeを除外 · mesh / strength / printability未判定";

export type DryWebInsufficientEdgePresentationState = "missing" | "running" | "stale" | "current";

export interface DryWebInsufficientEdgePresentationInput {
  /** Existing dryWebPreviewIsCurrent() boundary. */
  readonly current: boolean;
  /** Existing Dry Web preview or exact recheck activity. */
  readonly running: boolean;
  /** Existing preview exists but failed the current boundary. */
  readonly stale: boolean;
  readonly graph: InternalStructureGraph | null;
  readonly contactFacts: TargetedGridContactFacts | null;
  readonly requiredContacts: number | undefined;
  /** Runtime-only target mapping; its edge IDs are excluded from this view. */
  readonly targetConnectionFacts: readonly TargetedGridTargetConnectionFact[] | null;
  /** Current source target count, used to prove the mapping is complete. */
  readonly targetSourceCount: number | undefined;
  /** The current Surface context must remain visible while this overlay is on. */
  readonly surfaceContextVisible: boolean;
}

export interface DryWebInsufficientEdge {
  edgeId: number;
  start: number;
  end: number;
  radius: number;
  startPosition: Vector3Value;
  endPosition: Vector3Value;
  binKey: DryWebContactBinKey;
  /** Insufficient Surface patches explaining this edge, sorted by patch ID. */
  patchIds: number[];
}

export interface DryWebInsufficientEdgePresentation {
  state: DryWebInsufficientEdgePresentationState;
  insufficientPatchCount: number | null;
  highlightEdgeCount: number | null;
  edges: DryWebInsufficientEdge[];
  available: boolean;
  copy: string;
  reason: string;
}

function invalidPresentation(
  state: "missing" | "running" | "stale",
  reason: string,
): DryWebInsufficientEdgePresentation {
  return {
    state,
    insufficientPatchCount: null,
    highlightEdgeCount: null,
    edges: [],
    available: false,
    copy: DRY_WEB_INSUFFICIENT_EDGE_COPY,
    reason,
  };
}

function safeNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function finiteVector(value: unknown): value is Vector3Value {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Vector3Value;
  return Number.isFinite(candidate.x) && Number.isFinite(candidate.y) && Number.isFinite(candidate.z);
}

function validContactFacts(facts: TargetedGridContactFacts): boolean {
  if (!safeNonNegativeInteger(facts.usefulPatchCount)
    || !safeNonNegativeInteger(facts.componentCount)
    || !safeNonNegativeInteger(facts.mainComponentSize)
    || (facts.mainComponentKey !== null && typeof facts.mainComponentKey !== "string")
    || !Array.isArray(facts.patches)
    || facts.patches.length !== facts.usefulPatchCount) return false;
  const patchIds = new Set<number>();
  for (const patch of facts.patches) {
    if (typeof patch !== "object" || patch === null
      || !safeNonNegativeInteger(patch.patchId)
      || patchIds.has(patch.patchId)
      || !safeNonNegativeInteger(patch.contactCount)
      || typeof patch.componentKey !== "string"
      || !safeNonNegativeInteger(patch.componentSize)
      || !Array.isArray(patch.contactNodeIds)) return false;
    patchIds.add(patch.patchId);
    const nodeIds = new Set<number>();
    for (const nodeId of patch.contactNodeIds) {
      if (!safeNonNegativeInteger(nodeId) || nodeIds.has(nodeId)) return false;
      nodeIds.add(nodeId);
    }
    if (patch.contactCount !== patch.contactNodeIds.length) return false;
  }
  return true;
}

function validGraph(graph: InternalStructureGraph): boolean {
  if (graph.kind !== "targetedGrid" || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return false;
  const nodes = new Map<number, Vector3Value>();
  for (const node of graph.nodes) {
    if (typeof node !== "object" || node === null
      || !safeNonNegativeInteger(node.id) || nodes.has(node.id) || !finiteVector(node.position)
      || !Number.isFinite(node.radius) || !(node.radius > 0)) return false;
    nodes.set(node.id, node.position);
  }
  const edgeIds = new Set<number>();
  for (const edge of graph.edges) {
    if (typeof edge !== "object" || edge === null
      || !safeNonNegativeInteger(edge.id) || edgeIds.has(edge.id)
      || !safeNonNegativeInteger(edge.start) || !safeNonNegativeInteger(edge.end)
      || edge.start === edge.end || !nodes.has(edge.start) || !nodes.has(edge.end)
      || !Number.isFinite(edge.radius) || !(edge.radius > 0)
      || Math.hypot(
        nodes.get(edge.start)!.x - nodes.get(edge.end)!.x,
        nodes.get(edge.start)!.y - nodes.get(edge.end)!.y,
        nodes.get(edge.start)!.z - nodes.get(edge.end)!.z,
      ) <= 0) return false;
    edgeIds.add(edge.id);
  }
  return true;
}

function validTargetConnectionFacts(
  facts: readonly TargetedGridTargetConnectionFact[],
  edgesById: ReadonlyMap<number, InternalStructureGraph["edges"][number]>,
  expectedCount: number | undefined,
): boolean {
  if (expectedCount === undefined || !safeNonNegativeInteger(expectedCount) || facts.length !== expectedCount) return false;
  const sourceIndices = new Set<number>();
  for (const fact of facts) {
    if (typeof fact !== "object" || fact === null
      || !safeNonNegativeInteger(fact.sourceTargetIndex) || fact.sourceTargetIndex >= expectedCount
      || sourceIndices.has(fact.sourceTargetIndex)) return false;
    sourceIndices.add(fact.sourceTargetIndex);
    if (fact.status === "unresolved") {
      if (fact.contactNodeId !== null || fact.materialNodeId !== null || fact.edgeId !== null) return false;
      continue;
    }
    if (fact.status !== "connected"
      || fact.contactNodeId === null || !safeNonNegativeInteger(fact.contactNodeId)
      || fact.materialNodeId === null || !safeNonNegativeInteger(fact.materialNodeId)
      || (fact.edgeId !== null && !safeNonNegativeInteger(fact.edgeId))) return false;
    if (fact.edgeId !== null) {
      const edge = edgesById.get(fact.edgeId);
      if (!edge || !((edge.start === fact.contactNodeId && edge.end === fact.materialNodeId)
        || (edge.start === fact.materialNodeId && edge.end === fact.contactNodeId))) return false;
    }
  }
  return sourceIndices.size === expectedCount;
}

function edgeOutput(
  edge: InternalStructureGraph["edges"][number],
  nodesById: ReadonlyMap<number, InternalStructureGraph["nodes"][number]>,
  patchIds: readonly number[],
  patchContactCounts: ReadonlyMap<number, number>,
): DryWebInsufficientEdge {
  const start = nodesById.get(edge.start)!;
  const end = nodesById.get(edge.end)!;
  const rankedPatchIds = patchIds.slice().sort((left, right) =>
    (patchContactCounts.get(left)! - patchContactCounts.get(right)!) || left - right);
  return {
    edgeId: edge.id,
    start: edge.start,
    end: edge.end,
    radius: edge.radius,
    startPosition: { ...start.position },
    endPosition: { ...end.position },
    binKey: dryWebContactBinKey(patchContactCounts.get(rankedPatchIds[0]!)!),
    patchIds: patchIds.slice().sort((left, right) => left - right),
  };
}

/**
 * Build a read-only explanation layer from the existing generator facts.
 * Contact insufficiency is delegated to dryWebAuthorPresentation so the
 * component-membership rule and 1/2/3 threshold semantics stay canonical.
 */
export function createDryWebInsufficientEdgePresentation(
  input: DryWebInsufficientEdgePresentationInput,
): DryWebInsufficientEdgePresentation {
  if (input.running) {
    return invalidPresentation("running", "Dry Web生成または付加後Surface再診断中です。完了後に確認できます。");
  }
  if (!input.current) {
    return input.stale
      ? invalidPresentation("stale", "旧Dry Webです。Stage 3を再Graph化し、Stage 4でDry Webを再生成してください。")
      : invalidPresentation("missing", "current Dry Webのcontact factsが未確認です。Stage 4でDry Webを生成してください。");
  }
  if (!input.surfaceContextVisible) {
    return invalidPresentation("missing", "Surfaceが見えない表示では接触不足edgeを表示できません。Surface表示へ戻してください。");
  }
  const graph = input.graph;
  const contactFacts = input.contactFacts;
  const targetFacts = input.targetConnectionFacts;
  if (!graph || !contactFacts || !targetFacts || !validGraph(graph) || !validContactFacts(contactFacts)) {
    return invalidPresentation("missing", "current Graph / contact facts / target mappingが揃っていません。Dry Webを再生成してください。");
  }

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgesById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  if (!validTargetConnectionFacts(targetFacts, edgesById, input.targetSourceCount)) {
    return invalidPresentation("missing", "target接続 mappingが不正です。古いcountとedgeを表示しません。Dry Webを再生成してください。");
  }
  const author = dryWebAuthorPresentation(
    normalizeDryWebRequiredContacts(input.requiredContacts),
    contactFacts.usefulPatchCount,
    contactFacts,
    { maxInsufficientPatchIds: contactFacts.patches.length },
  );
  if (author.insufficientPatchIds.length !== author.insufficientPatchCount) {
    return invalidPresentation("missing", "current contact factsが不完全です。古いcountとedgeを表示しません。");
  }
  const insufficientPatchIds = new Set(author.insufficientPatchIds);
  const patchById = new Map(contactFacts.patches.map((patch) => [patch.patchId, patch]));
  const patchIdsByNode = new Map<number, number[]>();
  for (const patch of contactFacts.patches) {
    if (!insufficientPatchIds.has(patch.patchId)) continue;
    if (patch.contactNodeIds.some((nodeId) => !nodesById.has(nodeId))) {
      return invalidPresentation("missing", "contact nodeがcurrent Graphにありません。古いcountとedgeを表示しません。");
    }
    for (const nodeId of patch.contactNodeIds) {
      const patchIds = patchIdsByNode.get(nodeId);
      if (patchIds) patchIds.push(patch.patchId);
      else patchIdsByNode.set(nodeId, [patch.patchId]);
    }
  }
  const patchContactCounts = new Map(contactFacts.patches.map((patch) => [patch.patchId, patch.contactCount]));
  const excludedTargetEdgeIds = new Set(
    targetFacts.flatMap((fact) => fact.edgeId === null ? [] : [fact.edgeId]),
  );
  const emittedEdgeIds = new Set<number>();
  const edges: DryWebInsufficientEdge[] = [];
  for (const edge of graph.edges) {
    if (excludedTargetEdgeIds.has(edge.id) || emittedEdgeIds.has(edge.id)) continue;
    const associatedPatchIds = [...new Set([
      ...(patchIdsByNode.get(edge.start) ?? []),
      ...(patchIdsByNode.get(edge.end) ?? []),
    ])].filter((patchId) => insufficientPatchIds.has(patchId));
    if (associatedPatchIds.length === 0) continue;
    if (!associatedPatchIds.every((patchId) => patchById.has(patchId))) return invalidPresentation("missing", "patch factが不正です。古いedgeを表示しません。");
    emittedEdgeIds.add(edge.id);
    edges.push(edgeOutput(edge, nodesById, associatedPatchIds, patchContactCounts));
  }
  return {
    state: "current",
    insufficientPatchCount: author.insufficientPatchCount,
    highlightEdgeCount: edges.length,
    edges,
    available: true,
    copy: DRY_WEB_INSUFFICIENT_EDGE_COPY,
    reason: "current generator facts。接触不足Surface要素に対応するchosen patch-to-patch edgeだけを表示し、target接続edgeは除外しています。",
  };
}
