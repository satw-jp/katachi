import assert from "node:assert/strict";
import { A1_MINI_PLA_04_02, evaluateInternalPrintGate } from "./internalPrintGate.ts";
import type { InternalStructureGraph } from "./voronoi.ts";

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

console.log(`internal print gate tests: ${passed} passed`);
