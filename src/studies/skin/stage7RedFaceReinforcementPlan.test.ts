import {
  createStage7RedFaceReinforcementPlan,
} from "./stage7RedFaceReinforcementPlan.ts";
import type { Stage7RedFaceDryWebCandidate } from "./stage7RedFaceDryWebCandidatePresentation.ts";
import type { InternalStructureGraph } from "./voronoi.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function graph(
  nodes: Array<[number, number, number]>,
  edges: Array<[number, number, number, number]>,
): InternalStructureGraph {
  return {
    kind: "targetedGrid",
    nodes: nodes.map(([id, x, radius]) => ({ id, position: { x, y: 0, z: 0 }, radius })),
    edges: edges.map(([id, start, end, radius]) => ({ id, start, end, radius })),
    stats: {
      inputPoints: 17,
      delaunayTetrahedra: 19,
      candidateEdges: edges.length,
      clippedEdges: 2,
      removedShortEdges: 3,
      removedOutsideEdges: 4,
      removedIsolatedEdges: 5,
      gridNodeCount: nodes.length,
      gridEdgeCount: edges.length,
      dryWebContactFacts: { keep: "byte-for-value" },
    } as InternalStructureGraph["stats"],
  };
}

function candidate(
  faceId: number,
  edgeId: number,
  edgeOrder: number,
  endX: number,
  length = 1,
  startX = endX,
): Stage7RedFaceDryWebCandidate {
  return {
    faceId,
    start: { x: startX, y: 1, z: 0 },
    end: { x: endX, y: 0, z: 0 },
    edgeId,
    edgeOrder,
    length,
  };
}

function input(
  currentGraph: InternalStructureGraph,
  candidates: readonly Stage7RedFaceDryWebCandidate[],
  targetDiameterMm = 1.5,
  reinforcementRadius = 0.75,
) {
  return { graph: currentGraph, candidates, targetDiameterMm, reinforcementRadius };
}

// Endpoint hit uses the existing node and does not split the source edge.
{
  const base = graph([[10, 0, 0.11], [50, 10, 0.12]], [[100, 10, 50, 0.3]]);
  const result = createStage7RedFaceReinforcementPlan(input(base, [candidate(7, 100, 0, 10)]));
  assert(result.state === "current" && result.graph, "endpoint plan is current");
  assert(result.facts.sourceEdgesSplit === 0, "endpoint does not split");
  assert(result.facts.junctionNodesAdded === 0 && result.facts.redEndpointNodesAdded === 1, "endpoint node facts");
  assert(result.graph.nodes.length === 3 && result.graph.edges.length === 2, "endpoint counts");
  assert(result.graph.edges[0].id === 100 && result.graph.edges[1].start === 51 && result.graph.edges[1].end === 50, "source edge remains and reinforcement reaches endpoint");
  assert(result.facts.candidateFaceIds.join(",") === "7", "face order retained");
}

// One interior hit makes two source-radius pieces and one reinforcement edge.
{
  const base = graph([[10, 0, 0.11], [50, 10, 0.12]], [[100, 10, 50, 0.3]]);
  const result = createStage7RedFaceReinforcementPlan(input(base, [candidate(8, 100, 0, 4)]));
  assert(result.state === "current" && result.graph, "interior plan is current");
  assert(result.facts.baseNodeCount === 2 && result.facts.provisionalNodeCount === 4, "node delta");
  assert(result.facts.baseEdgeCount === 1 && result.facts.provisionalEdgeCount === 3, "edge delta");
  assert(result.facts.sourceEdgesSplit === 1 && result.facts.junctionNodesAdded === 1 && result.facts.reinforcementEdgesAdded === 1, "interior facts");
  assert(result.graph.edges[0].start === 10 && result.graph.edges[0].end === 51, "first split starts at source");
  assert(result.graph.edges[1].start === 51 && result.graph.edges[1].end === 50, "second split ends at source");
  assert(result.graph.edges[2].start === 52 && result.graph.edges[2].end === 51, "reinforcement uses red endpoint to junction");
  assert(result.graph.edges[0].radius === 0.3 && result.graph.edges[1].radius === 0.3, "source radius preserved");
  assert(result.graph.nodes[2].radius === 0.75 && result.graph.nodes[3].radius === 0.75, "reinforcement radius applied to junction and red endpoint");
  assert(result.graph.stats.gridNodeCount === 4 && result.graph.stats.gridEdgeCount === 3, "only graph counts update");
  assert((result.graph.stats as Record<string, unknown>).dryWebContactFacts !== undefined, "other stats preserved");
}

// Candidate order is preserved for endpoint nodes/reinforcement edges, while
// split positions on one source edge are sorted by projection parameter.
{
  const base = graph([[10, 0, 0.1], [50, 10, 0.1]], [[100, 10, 50, 0.2]]);
  const candidates = [candidate(20, 100, 0, 8), candidate(21, 100, 0, 2)];
  const result = createStage7RedFaceReinforcementPlan(input(base, candidates));
  assert(result.state === "current" && result.graph, "two-interior plan is current");
  assert(result.facts.junctionNodesAdded === 2 && result.facts.sourceEdgesSplit === 1, "two junction facts");
  assert(result.graph.edges[0].end === 53 && result.graph.edges[1].start === 53 && result.graph.edges[1].end === 51 && result.graph.edges[2].start === 51, "split pieces sorted by t");
  assert(result.graph.edges[3].start === 52 && result.graph.edges[3].end === 51, "first candidate reinforcement follows candidate order");
  assert(result.graph.edges[4].start === 54 && result.graph.edges[4].end === 53, "second candidate reinforcement follows candidate order");
}

// Exact-equivalent interior hits share one junction; distinct source edges do
// not share junctions even when their positions happen to match.
{
  const base = graph(
    [[10, 0, 0.1], [50, 10, 0.1], [80, 0, 0.1], [90, 10, 0.1]],
    [[100, 10, 50, 0.2], [200, 80, 90, 0.4]],
  );
  const candidates = [candidate(30, 100, 0, 4), candidate(31, 100, 0, 4), candidate(32, 200, 1, 4)];
  const result = createStage7RedFaceReinforcementPlan(input(base, candidates, 2, 1));
  assert(result.state === "current" && result.graph, "multi-edge plan is current");
  assert(result.facts.junctionNodesAdded === 2 && result.facts.redEndpointNodesAdded === 3, "equivalent hits share one junction");
  assert(result.facts.sourceEdgesSplit === 2 && result.facts.reinforcementEdgesAdded === 3, "two source edges split");
  assert(result.graph.nodes.length === 9 && result.graph.edges.length === 7, "multi-edge counts");
  assert(result.graph.edges.slice(-3).map((edge) => edge.start).join(",") === "92,93,95", "reinforcement edge order follows candidates");
  assert(result.facts.targetDiameterMm === 2 && result.facts.reinforcementRadius === 1, "physical facts retained");
}

// IDs are allocated from max IDs, not array indexes, and a repeated run is
// deterministic. Inputs and nested stats remain deeply unchanged.
{
  const base = graph([[1000, 0, 0.1], [4000, 10, 0.1]], [[9000, 1000, 4000, 0.4]]);
  const candidates = [candidate(44, 9000, 0, 5, 1)];
  const before = JSON.stringify(base);
  const first = createStage7RedFaceReinforcementPlan(input(base, candidates, 4, 1));
  const second = createStage7RedFaceReinforcementPlan(input(base, candidates, 4, 1));
  assert(JSON.stringify(first) === JSON.stringify(second), "repeated result is deterministic");
  assert(first.graph && first.graph.nodes[2].id === 4001 && first.graph.nodes[3].id === 4002, "node IDs use max existing ID");
  assert(first.graph.edges[0].id === 9001 && first.graph.edges[1].id === 9002 && first.graph.edges[2].id === 9003, "edge IDs use max existing ID");
  (first.graph.nodes[0].position as { x: number }).x = 999;
  (first.graph.stats as Record<string, unknown>).dryWebContactFacts = { changed: true };
  assert(JSON.stringify(base) === before, "graph input remains deeply unchanged");
  assert(Object.isFrozen(first.facts) && Object.isFrozen(first.facts.candidateFaceIds), "facts are immutable");
}

// Every inconsistent candidate/graph fact rejects the whole plan rather than
// re-targeting it, including stale-equivalent endpoint data and zero-length
// split/source data.
{
  const base = graph([[10, 0, 0.1], [50, 10, 0.1]], [[100, 10, 50, 0.2]]);
  const malformed = [
    candidate(1, 999, 0, 4),
    candidate(1, 100, 1, 4),
    { ...candidate(1, 100, 0, 4), end: { x: 4, y: 0.01, z: 0 } },
    { ...candidate(1, 100, 0, 4), length: Number.NaN },
    { ...candidate(1, 100, 0, 4), start: { x: 4, y: Number.NaN, z: 0 } },
    { ...candidate(1, 100, 0, 4), end: { x: 11, y: 0, z: 0 } },
  ];
  for (const bad of malformed) {
    const result = createStage7RedFaceReinforcementPlan(input(base, [bad]));
    assert(result.state === "invalid" && result.graph === null, "malformed candidate fails closed");
  }
  const zeroSource = graph([[10, 0, 0.1]], [[100, 10, 10, 0.2]]);
  const zeroResult = createStage7RedFaceReinforcementPlan(input(zeroSource, [candidate(1, 100, 0, 0, 1, 0)]));
  assert(zeroResult.state === "invalid", "zero-length source fails closed");
  const wrongKind = { ...base, kind: "voronoiEdge" as const };
  assert(createStage7RedFaceReinforcementPlan(input(wrongKind, [candidate(1, 100, 0, 4)])).state === "invalid", "wrong graph kind fails closed");
}

console.log("stage7RedFaceReinforcementPlan.test.ts: all assertions passed");
