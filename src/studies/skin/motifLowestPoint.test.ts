import type { Patch } from "./field.ts";
import {
  findMotifLowestPoints,
  findMotifMeshLowestPoints,
  recomputeMotifLowestPointReachability,
  type MotifLowestPoint,
} from "./motifLowestPoint.ts";
import { compileInternalGraphReachability } from "./surfaceAngleDiagnosis.ts";
import type { InternalStructureGraph } from "./voronoi.ts";

let assertions = 0;
function equal<T>(actual: T, expected: T, message: string): void {
  assertions++;
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}
function near(actual: number, expected: number, message: string): void {
  assertions++;
  if (Math.abs(actual - expected) > 1e-6) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

const patches: Patch[] = [
  {
    id: 7,
    shape: "flower",
    points: [
      { x: 0, y: 0, z: 0.4, r: 0.1, role: "motif" },
      { x: 1, y: 0, z: 0.3, r: 0.2, role: "motif" },
      { x: 2, y: 0, z: -2, r: 0.5, role: "bridge" },
    ],
  },
  { id: 8, shape: "coin", points: [{ x: 4, y: 0, z: 0.5, r: 0.1 }] },
  { id: 9, shape: "flatRing", points: [] },
];

const noInternal = findMotifLowestPoints(patches, null);
equal(noInternal.length, 2, "empty patch is omitted");
equal(noInternal[0].patchId, 7, "patch identity is retained");
equal(noInternal[0].sourcePointIndex, 1, "lowest own motif sphere is chosen");
near(noInternal[0].position.x, 1, "marker uses chosen sphere x");
near(noInternal[0].position.z, 0.1, "marker lies at z-radius");
equal(noInternal[0].reachedByInternal, false, "no graph cannot reach a motif");
equal(noInternal[1].shape, "coin", "shape is retained");

const graph: InternalStructureGraph = {
  nodes: [
    { id: 1, position: { x: 0.9, y: 0, z: 0.3 }, radius: 0.03 },
    { id: 2, position: { x: 1.1, y: 0, z: 0.3 }, radius: 0.03 },
  ],
  edges: [{ id: 1, start: 1, end: 2, radius: 0.03 }],
  stats: {
    inputPoints: 2,
    delaunayTetrahedra: 0,
    rawVertices: 0,
    rawEdges: 1,
    clippedEdges: 0,
    removedShortEdges: 0,
    removedOutsideEdges: 0,
    removedIsolatedEdges: 0,
  },
};
const withInternal = findMotifLowestPoints(patches, graph, 0);
equal(withInternal[0].reachedByInternal, true, "edge touching the lowest sphere is an Internal reach candidate");
equal(withInternal[1].reachedByInternal, false, "far motif remains unreached");
near(withInternal[0].markerRadius, 0.06, "marker size is visibly capped");
equal(withInternal[0].basis, "sourceSphere", "source proxy identifies its basis");

const meshPatches: Patch[] = [
  { id: 21, shape: "coin", points: [{ x: 0, y: 0, z: 0, r: 1 }] },
  { id: 22, shape: "flower", points: [{ x: 5, y: 0, z: 0, r: 1 }] },
];
const meshPositions = new Float32Array([
  0, 0, -0.8, 0.1, 0, -0.9, -0.1, 0, -0.85,
  5, 0, -0.7, 5.1, 0, -0.65, 4.9, 0, -0.68,
]);
const meshGraph: InternalStructureGraph = {
  ...graph,
  nodes: [
    { id: 1, position: { x: -0.1, y: 0, z: -0.8 }, radius: 0.03 },
    { id: 2, position: { x: 0.1, y: 0, z: -0.8 }, radius: 0.03 },
  ],
};
const meshLowest = findMotifMeshLowestPoints(meshPositions, meshPatches, meshGraph, 0.1, 0);
equal(meshLowest.length, 2, "final mesh vertices are attributed to both motifs");
equal(meshLowest[0].basis, "finalMesh", "final mesh marker identifies its basis");
near(meshLowest[0].position.z, -0.9, "lowest attributed final mesh vertex is kept");
equal(meshLowest[0].reachedByInternal, true, "final mesh contact uses the mesh-step band");
equal(meshLowest[1].reachedByInternal, false, "far final mesh point remains unreached");

const savedFinalMarkers: MotifLowestPoint[] = [
  {
    patchId: 31,
    shape: "coin",
    sourcePointIndex: 4,
    position: { x: 0, y: 0, z: -0.8 },
    normal: { x: 0, y: 0, z: -1 },
    markerRadius: 0.041,
    reachedByInternal: false,
    basis: "finalMesh",
  },
  {
    patchId: 32,
    shape: "flatRing",
    sourcePointIndex: 8,
    position: { x: 0.32, y: 0, z: -0.8 },
    markerRadius: 0.042,
    reachedByInternal: true,
    basis: "finalMesh",
  },
];
const savedFinalMarkersBefore = JSON.stringify(savedFinalMarkers);
const reuseQuery = compileInternalGraphReachability(meshGraph);
const reusedMarkers = recomputeMotifLowestPointReachability(savedFinalMarkers, reuseQuery, 0.1);
equal(reusedMarkers.length, savedFinalMarkers.length, "reuse preserves marker count");
equal(reusedMarkers[0].patchId, savedFinalMarkers[0].patchId, "reuse preserves marker order and identity");
equal(reusedMarkers[0].shape, savedFinalMarkers[0].shape, "reuse preserves shape");
equal(reusedMarkers[0].sourcePointIndex, savedFinalMarkers[0].sourcePointIndex, "reuse preserves source index");
equal(reusedMarkers[0].markerRadius, savedFinalMarkers[0].markerRadius, "reuse preserves marker radius");
equal(reusedMarkers[0].basis, savedFinalMarkers[0].basis, "reuse preserves basis");
equal(reusedMarkers[0].reachedByInternal, true, "reuse recomputes reached marker exactly");
equal(reusedMarkers[1].reachedByInternal, false, "reuse recomputes unreached marker exactly");
equal(JSON.stringify({ ...reusedMarkers[0], reachedByInternal: undefined }), JSON.stringify({ ...savedFinalMarkers[0], reachedByInternal: undefined }), "reuse preserves final marker fields");
equal(JSON.stringify({ ...reusedMarkers[1], reachedByInternal: undefined }), JSON.stringify({ ...savedFinalMarkers[1], reachedByInternal: undefined }), "reuse preserves marker without normal");
equal(reusedMarkers[0] === savedFinalMarkers[0], false, "reuse returns fresh marker objects");
equal(reusedMarkers[0].position === savedFinalMarkers[0].position, false, "reuse clones position");
equal(reusedMarkers[0].normal === savedFinalMarkers[0].normal, false, "reuse clones normal");
equal(Object.prototype.hasOwnProperty.call(reusedMarkers[1], "normal"), false, "reuse preserves absent optional normal");
equal(JSON.stringify(savedFinalMarkers), savedFinalMarkersBefore, "reuse leaves nested input fields unchanged");
const repeatedMarkers = recomputeMotifLowestPointReachability(savedFinalMarkers, compileInternalGraphReachability(meshGraph), 0.1);
equal(JSON.stringify(reusedMarkers), JSON.stringify(repeatedMarkers), "reuse is deterministic");
const emptyMarkers: MotifLowestPoint[] = [];
const emptyReusedMarkers = recomputeMotifLowestPointReachability(emptyMarkers, reuseQuery, 0.1);
equal(emptyReusedMarkers.length, 0, "supplied empty marker list stays empty");
equal(emptyReusedMarkers === emptyMarkers, false, "empty reuse returns a fresh list");

console.log(`motif lowest point tests: ${assertions} passed`);
