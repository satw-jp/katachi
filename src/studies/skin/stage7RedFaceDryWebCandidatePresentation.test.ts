import {
  createStage7RedFaceDryWebCandidatePresentation,
  type Stage7RedFaceDryWebCandidateInput,
} from "./stage7RedFaceDryWebCandidatePresentation.ts";
import type { InternalStructureGraph } from "./voronoi.ts";
import type { Stage7RedFaceLocatorPresentation } from "./stage7RedFaceLocatorPresentation.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function nearlyEqual(actual: number, expected: number, message: string): void {
  assert(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} !== ${expected}`);
}

function locator(points: number[], faceIds: number[]): Stage7RedFaceLocatorPresentation {
  return {
    state: "current",
    enabled: faceIds.length > 0,
    count: faceIds.length,
    faceIds: [...faceIds],
    redPositions: new Float32Array(points),
    status: "current exact red faces",
  };
}

function graph(
  nodes: Array<{ id: number; x: number; y: number; z: number }>,
  edges: Array<{ id: number; start: number; end: number; radius?: number }>,
  kind: InternalStructureGraph["kind"] = "targetedGrid",
): InternalStructureGraph {
  return {
    kind,
    nodes: nodes.map((node) => ({ id: node.id, position: { x: node.x, y: node.y, z: node.z }, radius: 0.1 })),
    edges: edges.map((edge) => ({ id: edge.id, start: edge.start, end: edge.end, radius: edge.radius ?? 0.1 })),
    stats: {
      inputPoints: 0,
      delaunayTetrahedra: 0,
      candidateEdges: edges.length,
      clippedEdges: 0,
      removedShortEdges: 0,
      removedOutsideEdges: 0,
      removedIsolatedEdges: 0,
    },
  };
}

function input(
  red: Stage7RedFaceLocatorPresentation,
  currentGraph: InternalStructureGraph | null,
  overrides: Partial<Stage7RedFaceDryWebCandidateInput> = {},
): Stage7RedFaceDryWebCandidateInput {
  return {
    current: true,
    targetedGrid: true,
    running: false,
    stale: false,
    redFaceLocator: red,
    graph: currentGraph,
    ...overrides,
  };
}

function triangleAt(x: number, y: number, z = 0): number[] {
  return [x - 0.01, y - 0.01, z, x + 0.02, y - 0.01, z, x - 0.01, y + 0.02, z];
}

// One face: exact closest point lies in the edge interior.
{
  const result = createStage7RedFaceDryWebCandidatePresentation(input(
    locator(triangleAt(0, 0), [20]),
    graph([
      { id: 1, x: -1, y: 1, z: 0 },
      { id: 2, x: 1, y: 1, z: 0 },
    ], [{ id: 40, start: 1, end: 2 }]),
  ));
  assert(result.state === "current" && result.enabled, "one face/edge is current and enabled");
  assert(result.previewedCandidateCount === 1 && result.totalRedFaceCount === 1, "one candidate/count");
  assert(result.candidates[0].faceId === 20, "face ID is preserved");
  nearlyEqual(result.candidates[0].start.x, 0, "centroid start x");
  nearlyEqual(result.candidates[0].end.x, 0, "interior closest x");
  nearlyEqual(result.candidates[0].end.y, 1, "interior closest y");
  nearlyEqual(result.candidates[0].length, 1, "interior closest length");
  assert(result.candidates[0].edgeId === 40 && result.candidates[0].edgeOrder === 0, "edge source/order");
  assert(result.linePositions.length === 6, "line buffer has one XYZ pair");
}

// Clamping covers both an endpoint beyond the segment and a degenerate segment.
{
  const clamped = createStage7RedFaceDryWebCandidatePresentation(input(
    locator(triangleAt(2, 0), [21]),
    graph([{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 1, y: 0, z: 0 }], [{ id: 41, start: 1, end: 2 }]),
  ));
  assert(clamped.candidates.length === 1, "clamped candidate exists");
  nearlyEqual(clamped.candidates[0].end.x, 1, "clamped upper endpoint");
  nearlyEqual(clamped.candidates[0].length, 1, "clamped length");

  const lowerClamped = createStage7RedFaceDryWebCandidatePresentation(input(
    locator(triangleAt(-2, 0), [211]),
    graph([{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 1, y: 0, z: 0 }], [{ id: 411, start: 1, end: 2 }]),
  ));
  nearlyEqual(lowerClamped.candidates[0].end.x, 0, "clamped lower endpoint");
  nearlyEqual(lowerClamped.candidates[0].length, 2, "lower clamped length");

  const degenerate = createStage7RedFaceDryWebCandidatePresentation(input(
    locator(triangleAt(-2, 0), [22]),
    graph([{ id: 1, x: -1, y: 0, z: 0 }], [{ id: 42, start: 1, end: 1 }]),
  ));
  nearlyEqual(degenerate.candidates[0].end.x, -1, "degenerate segment endpoint");
}

// The nearest of two edges wins, even when it is later in source order.
{
  const result = createStage7RedFaceDryWebCandidatePresentation(input(
    locator(triangleAt(0, 0), [23]),
    graph([
      { id: 1, x: -1, y: 3, z: 0 }, { id: 2, x: 1, y: 3, z: 0 },
      { id: 3, x: -1, y: 0.5, z: 0 }, { id: 4, x: 1, y: 0.5, z: 0 },
    ], [
      { id: 50, start: 1, end: 2 },
      { id: 51, start: 3, end: 4 },
    ]),
  ));
  assert(result.candidates[0].edgeId === 51, "nearest edge wins");
  nearlyEqual(result.candidates[0].length, 0.5, "nearest edge length");
}

// Exact distance ties are stable by original edge order, then edge ID.
{
  const result = createStage7RedFaceDryWebCandidatePresentation(input(
    locator(triangleAt(0, 0), [24]),
    graph([
      { id: 1, x: -1, y: 1, z: 0 }, { id: 2, x: 1, y: 1, z: 0 },
      { id: 3, x: -1, y: -1, z: 0 }, { id: 4, x: 1, y: -1, z: 0 },
    ], [
      { id: 90, start: 1, end: 2 },
      { id: 2, start: 3, end: 4 },
    ]),
  ));
  assert(result.candidates[0].edgeId === 90 && result.candidates[0].edgeOrder === 0, "exact tie keeps first edge");
}

// Canonical red-face order and IDs are retained; preview is capped and disclosed.
{
  const faceIds = Array.from({ length: 130 }, (_, index) => 1000 + index);
  const points = faceIds.flatMap((_, index) => triangleAt(index / 100, 0));
  const result = createStage7RedFaceDryWebCandidatePresentation(input(
    locator(points, faceIds),
    graph([{ id: 1, x: -1, y: 1, z: 0 }, { id: 2, x: 2, y: 1, z: 0 }], [{ id: 60, start: 1, end: 2 }]),
  ));
  assert(result.totalRedFaceCount === 130 && result.previewedCandidateCount === 128, "128 preview cap/count");
  assert(result.reason.includes("preview 128 / total 130"), "cap disclosure");
  assert(result.candidates[0].faceId === 1000 && result.candidates[127].faceId === 1127, "canonical order/IDs");
  assert(result.linePositions.length === 128 * 6, "capped line buffer count");
}

// Summary statistics are computed from the independent line candidates.
{
  const result = createStage7RedFaceDryWebCandidatePresentation(input(
    locator([...triangleAt(0, 0), ...triangleAt(0, 2)], [30, 31]),
    graph([
      { id: 1, x: -1, y: 1, z: 0 }, { id: 2, x: 1, y: 1, z: 0 },
      { id: 3, x: -1, y: 3, z: 0 }, { id: 4, x: 1, y: 3, z: 0 },
    ], [{ id: 70, start: 1, end: 2 }, { id: 71, start: 3, end: 4 }]),
  ));
  nearlyEqual(result.minLength!, 1, "minimum summary");
  nearlyEqual(result.meanLength!, 1, "mean summary");
  nearlyEqual(result.maxLength!, 1, "maximum summary");
}

// Running, stale, missing, non-targeted, and malformed inputs fail closed.
{
  const red = locator(triangleAt(0, 0), [80]);
  const valid = graph([{ id: 1, x: -1, y: 1, z: 0 }, { id: 2, x: 1, y: 1, z: 0 }], [{ id: 80, start: 1, end: 2 }]);
  for (const [label, overrides] of [
    ["running", { running: true }],
    ["stale", { stale: true }],
    ["non-current", { current: false }],
    ["non-targeted", { targetedGrid: false }],
    ["missing graph", { graph: null }],
  ] as const) {
    const result = createStage7RedFaceDryWebCandidatePresentation(input(red, valid, overrides));
    assert(result.state !== "current" && !result.enabled && result.previewedCandidateCount === 0, `${label} fails closed`);
    assert(result.linePositions.length === 0, `${label} has no lines`);
  }
  const nonTargetedGraph = createStage7RedFaceDryWebCandidatePresentation(input(red, { ...valid, kind: "voronoiEdge" }, {}));
  assert(nonTargetedGraph.state === "missing" && nonTargetedGraph.totalRedFaceCount === 0, "non-targeted graph fails closed");
  const missingNode = createStage7RedFaceDryWebCandidatePresentation(input(red, graph(
    [{ id: 1, x: 0, y: 0, z: 0 }], [{ id: 81, start: 1, end: 9 }],
  )));
  assert(missingNode.state === "missing" && missingNode.skippedEdgeCount === 0, "all-unavailable edges fail closed");
  const malformed = createStage7RedFaceDryWebCandidatePresentation(input(red, graph(
    [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 1, y: 0, z: 0 }], [{ id: 82, start: 1, end: 2, radius: Number.NaN }],
  )));
  assert(malformed.state === "missing" && malformed.reason.includes("有効なedge"), "malformed edges fail closed honestly");
}

// Deep input immutability and repeated determinism.
{
  const red = locator(triangleAt(0, 0), [90]);
  const currentGraph = graph([{ id: 1, x: -1, y: 1, z: 0 }, { id: 2, x: 1, y: 1, z: 0 }], [{ id: 91, start: 1, end: 2 }]);
  const before = JSON.stringify({ red: red.redPositions, graph: currentGraph });
  const first = createStage7RedFaceDryWebCandidatePresentation(input(red, currentGraph));
  const second = createStage7RedFaceDryWebCandidatePresentation(input(red, currentGraph));
  assert(JSON.stringify(first) === JSON.stringify(second), "repeated output is deterministic");
  (first.candidates[0].start as { x: number }).x = 999;
  first.linePositions[0] = 999;
  assert(JSON.stringify({ red: red.redPositions, graph: currentGraph }) === before, "inputs remain deeply immutable");
  assert(second.candidates[0].start.x !== 999 && second.linePositions[0] !== 999, "outputs are fresh");
}

console.log("stage7RedFaceDryWebCandidatePresentation.test.ts: all assertions passed");
