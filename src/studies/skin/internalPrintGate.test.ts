import assert from "node:assert/strict";
import {
  A1_MINI_PLA_04_02,
  evaluateInternalPrintGate,
  internalPrintGateAllowsSupportDisabledExport,
  internalStructureOutputBlockReason,
  screenInternalStructureAngles,
} from "./internalPrintGate.ts";
import type { InternalPrintGateReport } from "./internalPrintGate.ts";
import type { InternalStructureGraph } from "./voronoi.ts";
import { mergeSkinRebuildGraphsAtSupportContacts } from "./rebuild/model.ts";

let passed = 0;
const check = (value: unknown, message: string) => { assert.ok(value, message); passed++; };

function graph(points: Array<[number, number, number]>, edges: Array<[number, number, number]>): InternalStructureGraph {
  return {
    kind: "targetedGrid",
    nodes: points.map(([x, y, z], id) => ({ id, position: { x, y, z }, radius: 0.05 })),
    edges: edges.map(([start, end, radius], id) => ({ id, start, end, radius })),
    stats: { inputPoints: 0, delaunayTetrahedra: 0, candidateEdges: 0, clippedEdges: 0, removedShortEdges: 0, removedOutsideEdges: 0, removedIsolatedEdges: 0 },
  };
}

const mesh = {
  watertight: { ok: true, openEdges: 0, nonManifoldEdges: 0, totalEdges: 12 },
  connectedComponents: 1,
  scaleMmPerUnit: 10,
  removedSavedDegenerateTriangleCount: 0,
};
const vertical = graph([[0, 0, 0], [0, 0, 1]], [[0, 1, 0.05]]);
const pass = evaluateInternalPrintGate({
  graph: vertical, mesh, resolution: 224, targetLongestMm: 80,
  surfaceSdf: (point) => point.z < 0.01 ? -0.05 : 1,
});
check(pass.ok, "a rooted 1 mm vertical strut passes the conservative profile");
check(pass.surfaceAnchorNodes === 1 && pass.unsupportedNodes === 0, "support propagates upward from the surface root");
check(pass.minDiameterMm === 1, "edge radius is converted to an actual diameter in millimetres");
check(pass.voxelsAcrossDiameter >= A1_MINI_PLA_04_02.minVoxelsAcrossDiameter, "final mesh resolves the strut");

const supportShortReport: InternalPrintGateReport = {
  ...pass,
  ok: false,
  reasons: ["support demand only"],
  unsupportedNodes: 2,
  unsupportedEdges: 1,
  overlongBridges: 1,
};
check(
  internalPrintGateAllowsSupportDisabledExport(supportShortReport, "off"),
  "explicit removable-support Off waives only support-demand facts",
);
check(
  !internalPrintGateAllowsSupportDisabledExport(supportShortReport, "automatic"),
  "Automatic remains fail-closed for a support-short report",
);
check(
  internalPrintGateAllowsSupportDisabledExport(pass, "off")
    && internalPrintGateAllowsSupportDisabledExport(pass, "automatic"),
  "an ordinary OK report remains accepted in either support mode",
);
for (const [label, change] of [
  ["non-watertight mesh", { watertight: false }],
  ["multiple mesh components", { meshComponents: 2 }],
  ["saved degenerate triangles", { removedDegenerateTriangles: 1 }],
  ["no anchored graph", { surfaceAnchorNodes: 0, buildPlateAnchorNodes: 0 }],
  ["floating graph component", { floatingGraphComponents: 1 }],
  ["undersized strut", { minDiameterMm: 0.7 }],
  ["under-resolved strut", { voxelsAcrossDiameter: 2.4 }],
] as const) {
  check(
    !internalPrintGateAllowsSupportDisabledExport(
      { ...supportShortReport, ...change },
      "off",
    ),
    `support-disabled export still rejects ${label}`,
  );
}

const plateRooted = evaluateInternalPrintGate({
  graph: vertical, mesh, resolution: 224, targetLongestMm: 80,
  surfaceSdf: () => 1,
  buildPlateZSource: -0.05,
});
check(
  plateRooted.ok && plateRooted.surfaceAnchorNodes === 0 && plateRooted.buildPlateAnchorNodes === 1,
  "a strut that reaches the build plate is an explicit printable root",
);

const thin = evaluateInternalPrintGate({ ...{
  graph: graph([[0, 0, 0], [0, 0, 1]], [[0, 1, 0.03]]), mesh, resolution: 224, targetLongestMm: 80,
  surfaceSdf: (point: { z: number }) => point.z < 0.01 ? -0.05 : 1,
} });
check(!thin.ok && thin.reasons.some((reason) => reason.includes("最低線径")), "a sub-0.8 mm strut fails closed");

const coarse = evaluateInternalPrintGate({
  graph: vertical, mesh, resolution: 96, targetLongestMm: 80,
  surfaceSdf: (point) => point.z < 0.01 ? -0.05 : 1,
});
check(!coarse.ok && coarse.reasons.some((reason) => reason.includes("voxel")), "under-resolved struts fail independently of physical diameter");

const floating = evaluateInternalPrintGate({
  graph: vertical, mesh, resolution: 224, targetLongestMm: 80, surfaceSdf: () => 1,
});
check(!floating.ok, "a graph with no Surface root fails");
check(floating.floatingGraphComponents === 1 && floating.unsupportedNodes === 2, "floating graph and nodes are counted");

const shortBridge = graph([[0, 0, 0], [0, 0, 1], [0.4, 0, 1], [0.4, 0, 0]], [
  [0, 1, 0.05], [2, 3, 0.05], [1, 2, 0.05],
]);
const bridgePass = evaluateInternalPrintGate({
  graph: shortBridge, mesh, resolution: 224, targetLongestMm: 80,
  surfaceSdf: (point) => point.z < 0.01 ? -0.05 : 1,
});
check(bridgePass.ok && bridgePass.bridgeEdges === 1, "a 4 mm bridge between two rooted columns passes");

const longBridge = graph([[0, 0, 0], [0, 0, 1], [0.7, 0, 1], [0.7, 0, 0]], [
  [0, 1, 0.05], [2, 3, 0.05], [1, 2, 0.05],
]);
const bridgeFail = evaluateInternalPrintGate({
  graph: longBridge, mesh, resolution: 224, targetLongestMm: 80,
  surfaceSdf: (point) => point.z < 0.01 ? -0.05 : 1,
});
check(!bridgeFail.ok && bridgeFail.overlongBridges === 1, "a 7 mm bridge exceeds the conservative 5 mm gate");
const midpointSupport = graph([[0.35, 0, 0], [0.35, 0, 1]], [[0, 1, 0.05]]);
const repairedBridge = evaluateInternalPrintGate({
  graph: mergeSkinRebuildGraphsAtSupportContacts(longBridge, midpointSupport),
  mesh, resolution: 224, targetLongestMm: 80,
  surfaceSdf: (point) => point.z < 0.01 ? -0.05 : 1,
});
check(
  repairedBridge.ok && repairedBridge.overlongBridges === 0 && repairedBridge.maxObservedBridgeMm <= 5,
  "a real midpoint pillar splits the physical 7 mm bridge into printable intervals",
);

const embeddedTie = graph([[0, 0, 0], [1, 0, 0]], [[0, 1, 0.05]]);
const embeddedPass = evaluateInternalPrintGate({
  graph: embeddedTie, mesh, resolution: 224, targetLongestMm: 80,
  surfaceSdf: (point) => point.x < 0.4 || point.x > 0.6 ? -0.05 : 1,
});
check(embeddedPass.ok && embeddedPass.maxObservedBridgeMm < 3,
  "a centre-to-centre tie counts only its exposed material gap, not both embedded ends");

const cantilever = graph([[0, 0, 0], [0.4, 0, 0]], [[0, 1, 0.05]]);
const cantileverFail = evaluateInternalPrintGate({
  graph: cantilever, mesh, resolution: 224, targetLongestMm: 80,
  surfaceSdf: (point) => point.x < 0.01 ? -0.05 : 1,
});
check(!cantileverFail.ok && cantileverFail.unsupportedEdges === 1, "a one-ended horizontal cantilever is not treated as a bridge");

const topologyFail = evaluateInternalPrintGate({
  graph: vertical,
  mesh: { ...mesh, watertight: { ...mesh.watertight, ok: false, openEdges: 4 }, connectedComponents: 2, removedSavedDegenerateTriangleCount: 3 },
  resolution: 224, targetLongestMm: 80,
  surfaceSdf: (point) => point.z < 0.01 ? -0.05 : 1,
});
check(!topologyFail.ok && topologyFail.reasons.some((reason) => reason.includes("水密")), "non-watertight final mesh fails");
check(topologyFail.reasons.some((reason) => reason.includes("2部品")), "multiple final mesh components fail");
check(topologyFail.reasons.some((reason) => reason.includes("退化")), "saved-coordinate degenerates fail");

const absent = evaluateInternalPrintGate({ graph: null, mesh, resolution: 224, targetLongestMm: 80, surfaceSdf: () => 1 });
check(!absent.ok && absent.reasons[0].includes("ありません"), "missing Internal fails honestly");
check(A1_MINI_PLA_04_02.nozzleDiameterMm === 0.4 && A1_MINI_PLA_04_02.layerHeightMm === 0.2, "profile records the author's exact setup");

check(internalStructureOutputBlockReason("none", null) === null, "none keeps the Surface-only output path available");
check(internalStructureOutputBlockReason("targetedGrid", vertical) === null, "a non-empty targetedGrid graph is output-ready");
check(internalStructureOutputBlockReason("voronoiEdge", { ...vertical, kind: "voronoiEdge" }) === null, "a non-empty voronoiEdge graph is output-ready");
check(internalStructureOutputBlockReason("targetedGrid", null)?.includes("未生成") === true, "a missing selected graph blocks output with a Japanese reason");
check(internalStructureOutputBlockReason("voronoiEdge", graph([[0, 0, 0]], []))?.includes("空") === true, "an empty selected graph blocks output with a Japanese reason");

const angleGraph = graph(
  [[0, 0, 0], [0, 0, 1], [1, 0, 1], [1, 0, 0]],
  [[0, 1, 0.05], [0, 2, 0.05], [0, 3, 0.05], [1, 0, 0.05], [0, 99, 0.05]],
);
const angleScreen = screenInternalStructureAngles(angleGraph);
check(angleScreen.edges[0].classification === "selfSupportingAngle", "vertical edge is green");
check(angleScreen.edges[1].classification === "selfSupportingAngle" && Math.abs((angleScreen.edges[1].angleFromVerticalDeg ?? 0) - 45) < 1e-6, "exactly 45 degrees is green");
check(angleScreen.edges[2].classification === "angleRisk", "an edge above 45 degrees is red");
check(angleScreen.edges[2].angleFromVerticalDeg === 90, "a horizontal edge measures 90 degrees");
check(angleScreen.edges[0].classification === angleScreen.edges[3].classification, "reversed endpoints give the same classification");
check(angleScreen.edges[4].classification === "angleRisk" && angleScreen.edges[4].angleFromVerticalDeg === null, "missing endpoint fails closed as red");
check(
  angleScreen.edges.length === angleGraph.edges.length
  && angleScreen.selfSupportingAngleCount + angleScreen.angleRiskCount === angleGraph.edges.length,
  "screen totals equal graph edge count",
);
check(
  JSON.stringify(angleScreen) === JSON.stringify(screenInternalStructureAngles(angleGraph)),
  "angle screening edge order and totals are deterministic",
);

const nonContiguousIdGraph: InternalStructureGraph = {
  kind: "voronoiEdge",
  // Deliberately reorder the nodes: edge.start/end are IDs, not array indexes.
  nodes: [
    { id: 900, position: { x: 2, y: 0, z: 1 }, radius: 0.05 },
    { id: 12, position: { x: 0, y: 0, z: 0 }, radius: 0.05 },
    { id: 77, position: { x: 0, y: 0, z: 1 }, radius: 0.05 },
  ],
  edges: [
    { id: 8, start: 12, end: 77, radius: 0.05 },
    { id: 3, start: 12, end: 900, radius: 0.05 },
  ],
  stats: { inputPoints: 0, delaunayTetrahedra: 0, candidateEdges: 0, clippedEdges: 0, removedShortEdges: 0, removedOutsideEdges: 0, removedIsolatedEdges: 0 },
};
const nonContiguousIdScreen = screenInternalStructureAngles(nonContiguousIdGraph);
check(nonContiguousIdScreen.edges[0].classification === "selfSupportingAngle", "non-contiguous node IDs resolve the vertical edge as green");
check(nonContiguousIdScreen.edges[1].classification === "angleRisk", "non-contiguous node IDs resolve the steep edge as red");
check(
  nonContiguousIdScreen.edges.map((edge) => edge.edgeId).join(",") === "8,3"
  && JSON.stringify(nonContiguousIdScreen) === JSON.stringify(screenInternalStructureAngles(nonContiguousIdGraph)),
  "node-ID screening keeps deterministic graph edge order",
);

console.log(`internal print gate tests: ${passed} passed`);
