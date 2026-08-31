import assert from "node:assert/strict";
import { fieldSdf } from "../../cloud-sculpt/field.ts";
import { inspectSavedStlTopology, orientMeshForSavedStl } from "../../cloud-sculpt/meshExport.ts";
import { createCompositeSdfEvaluator } from "../field.ts";
import { evaluateInternalPrintGate } from "../internalPrintGate.ts";
import { buildPrintSupportMesh } from "../meshExport.ts";
import {
  detectSkinRebuildOverhangRegions,
  sampleSkinRebuildOverhangRegionSurface,
} from "./overhangRegions.ts";
import {
  captureSkinRebuildFkei,
  parseSkinRebuildFkei,
  projectFromSkinRebuildFkei,
  serializeSkinRebuildFkei,
} from "./fkei.ts";
import {
  DEFAULT_SKIN_REBUILD_SETTINGS,
  auditSkinRebuildLatticeBaseContainment,
  assembleSkinRebuildProject,
  buildSkinRebuildDryWeb,
  buildSkinRebuildFinalMesh,
  buildSkinRebuildLattice,
  buildSkinRebuildPrintSupport,
  createEmptySkinRebuildGraph,
  createSkinRebuildBase,
  createSkinRebuildPatterns,
  exportSkinRebuildStl,
  findSkinRebuildLowestPoints,
  mergeSkinRebuildGraphs,
  mergeSkinRebuildGraphsAtSupportContacts,
  repairSkinRebuildFinalMesh,
  removeSkinRebuildLatticeEdge,
  reinforceSkinRebuildOverhangRegion,
  retainConnectedSkinRebuildLatticeConnections,
  skinRebuildRequiresSpiderSupport,
  skinRebuildSpiderSupportTargetIds,
  skinRebuildTopologyPass,
  type SkinRebuildBase,
  type SkinRebuildLowestPoint,
  type SkinRebuildSettings,
} from "./model.ts";
import type { InternalStructureGraph } from "../voronoi.ts";

function connectedNodeCount(nodes: number, edges: Array<{ start: number; end: number }>): number {
  if (nodes === 0) return 0;
  const neighbours = Array.from({ length: nodes }, () => [] as number[]);
  for (const edge of edges) {
    neighbours[edge.start].push(edge.end);
    neighbours[edge.end].push(edge.start);
  }
  const seen = new Set<number>([0]);
  const queue = [0];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of neighbours[current]) if (!seen.has(next)) {
      seen.add(next);
      queue.push(next);
    }
  }
  return seen.size;
}

const base = createSkinRebuildBase(DEFAULT_SKIN_REBUILD_SETTINGS);
const first = createSkinRebuildPatterns(base, DEFAULT_SKIN_REBUILD_SETTINGS);
const second = createSkinRebuildPatterns(base, DEFAULT_SKIN_REBUILD_SETTINGS);
assert.deepEqual(second, first, "surface placement must be deterministic");
assert.equal(first.patterns.length, DEFAULT_SKIN_REBUILD_SETTINGS.patternCount);
assert.ok(first.patternSides.every((side) => side.baseSideIsInside));
assert.ok(first.patternSides.every((side) => side.insideSignedDistance < 0 && side.outsideSignedDistance > 0));

const dryWeb = buildSkinRebuildDryWeb(base, first.patterns, first.patternSides, DEFAULT_SKIN_REBUILD_SETTINGS);
assert.equal(dryWeb.nodes.length, first.patterns.length);
assert.equal(connectedNodeCount(dryWeb.nodes.length, dryWeb.edges), dryWeb.nodes.length, "DryWeb must connect every pattern back");
assert.ok(dryWeb.edges.length >= dryWeb.nodes.length - 1);

const skippedDryWeb = createEmptySkinRebuildGraph();
const diagnosed = findSkinRebuildLowestPoints(
  base,
  first.patterns,
  first.patternSides,
  skippedDryWeb,
  DEFAULT_SKIN_REBUILD_SETTINGS,
);
const latticeBuild = buildSkinRebuildLattice(
  base,
  first.patterns,
  first.patternSides,
  diagnosed.lowestPoints,
  DEFAULT_SKIN_REBUILD_SETTINGS,
);
assert.ok(latticeBuild.connectivityLoopCount >= 1, "lattice must audit and repair disconnected Pattern components");
assert.ok(latticeBuild.supportLoopCount >= 1, "unsupported targets must enter the bounded support loop");
assert.deepEqual(latticeBuild.disconnectedPatternIds, [], "lattice alone must connect every Pattern back");
assert.deepEqual(latticeBuild.unsupportedTargetIds, [], "sample must exhaust the unsupported-target loop");
assert.equal(latticeBuild.containment.contained, true, "the complete spider radius must remain inside the Base");
assert.deepEqual(latticeBuild.containment.outsideEdgeIds, []);
assert.ok(latticeBuild.containment.checkedSampleCount > latticeBuild.lattice.edges.length * 2);
assert.ok(latticeBuild.lattice.nodes.every((node) =>
  fieldSdf(base.host, base.hostK, node.position.x, node.position.y, node.position.z) <= 1e-6),
"every spider centreline node must remain inside the authored Base");
const selectedRegion = diagnosed.overhang.regions[diagnosed.overhang.regions.length - 1];
assert.ok(selectedRegion, "sample diagnosis must expose a selectable red area");
const reinforcementSurfaceSamples = sampleSkinRebuildOverhangRegionSurface(
  diagnosed.overhang,
  selectedRegion.id,
  latticeBuild.lattice.edges[0].radius * 0.72,
);
assert.ok(reinforcementSurfaceSamples.length > 1, "a red area must become a face, not a one-point route");
const reinforcedRegion = reinforceSkinRebuildOverhangRegion(
  base,
  first.patterns,
  first.patternSides,
  latticeBuild.lattice,
  reinforcementSurfaceSamples[0].point,
  reinforcementSurfaceSamples[0].normal,
  DEFAULT_SKIN_REBUILD_SETTINGS,
  reinforcementSurfaceSamples,
);
assert.ok(reinforcedRegion.lattice.edges.length > latticeBuild.lattice.edges.length,
  "selected red area must add a real permanent reinforcement route");
assert.ok(reinforcedRegion.segmentCount > 0);
assert.equal(reinforcedRegion.reinforcementEdgeIds.length, reinforcedRegion.segmentCount);
assert.ok(reinforcedRegion.reinforcementEdgeIds.every((edgeId) =>
  reinforcedRegion.lattice.edges.some((edge) => edge.id === edgeId)));
assert.ok(reinforcedRegion.maximumEdgeAngleDeg <= 45 + 1e-5);
assert.equal(reinforcedRegion.surfaceContactCount, reinforcementSurfaceSamples.length);
assert.deepEqual(reinforcedRegion.uncoveredSurfaceContactIndices, []);
assert.equal(reinforcedRegion.containment.contained, true);
const reinforcedProject = assembleSkinRebuildProject(
  DEFAULT_SKIN_REBUILD_SETTINGS,
  base,
  first.patterns,
  first.patternSides,
  skippedDryWeb,
  diagnosed.lowestPoints,
  reinforcedRegion.lattice,
  latticeBuild.connections,
);
const reinforcedFkei = serializeSkinRebuildFkei(captureSkinRebuildFkei(reinforcedProject, {
  savedAt: "2026-08-30T12:00:00.000Z",
  appVersion: "0.89.4",
}));
const restoredReinforcement = projectFromSkinRebuildFkei(parseSkinRebuildFkei(reinforcedFkei));
assert.deepEqual(restoredReinforcement.lattice, reinforcedProject.lattice,
  "selected-area reinforcement geometry must survive the editable .fkei roundtrip");
assert.deepEqual(restoredReinforcement.finalGraph, reinforcedProject.finalGraph);
const reinforcedFinalMesh = buildSkinRebuildFinalMesh(reinforcedProject, 64);
const reinforcementPlateShift = reinforcedFinalMesh.plateShiftSourceZ ?? 0;
let visibleReinforcementMidpoints = 0;
for (const edgeId of reinforcedRegion.reinforcementEdgeIds) {
  const edge = reinforcedRegion.lattice.edges.find((candidate) => candidate.id === edgeId)!;
  const start = reinforcedRegion.lattice.nodes[edge.start].position;
  const end = reinforcedRegion.lattice.nodes[edge.end].position;
  const midpoint = {
    x: (start.x + end.x) * 0.5,
    y: (start.y + end.y) * 0.5,
    z: (start.z + end.z) * 0.5 + reinforcementPlateShift,
  };
  let nearestMeshVertex = Number.POSITIVE_INFINITY;
  for (const triangle of reinforcedFinalMesh.triangles) {
    for (const point of [triangle.a, triangle.b, triangle.c]) {
      nearestMeshVertex = Math.min(nearestMeshVertex, Math.hypot(
        point.x - midpoint.x,
        point.y - midpoint.y,
        point.z - midpoint.z,
      ));
    }
  }
  if (nearestMeshVertex <= edge.radius * 1.75) visibleReinforcementMidpoints++;
}
assert.ok(visibleReinforcementMidpoints > 0,
  "Stage 6 final mesh must expose the non-buried part of the actual 5B buttress");
const reinforcedMeshStep = reinforcedFinalMesh.sourceBounds.longest / 64;
const reinforcedDiagnosis = detectSkinRebuildOverhangRegions(
  reinforcedFinalMesh.triangles,
  DEFAULT_SKIN_REBUILD_SETTINGS.overhangThresholdDeg,
  reinforcedFinalMesh.sourceBounds.min.z,
  reinforcedMeshStep * 2.5,
);
const reinforcementShift = reinforcedFinalMesh.plateShiftSourceZ ?? 0;
let nearestRemainingRed = Number.POSITIVE_INFINITY;
for (let faceIndex = 0; faceIndex < reinforcedDiagnosis.faceCount; faceIndex++) {
  const offset = faceIndex * 9;
  const centroid = {
    x: (reinforcedDiagnosis.positions[offset]
      + reinforcedDiagnosis.positions[offset + 3]
      + reinforcedDiagnosis.positions[offset + 6]) / 3,
    y: (reinforcedDiagnosis.positions[offset + 1]
      + reinforcedDiagnosis.positions[offset + 4]
      + reinforcedDiagnosis.positions[offset + 7]) / 3,
    z: (reinforcedDiagnosis.positions[offset + 2]
      + reinforcedDiagnosis.positions[offset + 5]
      + reinforcedDiagnosis.positions[offset + 8]) / 3,
  };
  for (const sample of reinforcementSurfaceSamples) {
    nearestRemainingRed = Math.min(nearestRemainingRed, Math.hypot(
      centroid.x - sample.point.x,
      centroid.y - sample.point.y,
      centroid.z - (sample.point.z + reinforcementShift),
    ));
  }
}
assert.ok(nearestRemainingRed > latticeBuild.lattice.edges[0].radius * 1.15,
  "Stage 7 must find no red face at the physically rebuilt Stage 5B area");
const escapedLattice = {
  ...latticeBuild.lattice,
  nodes: latticeBuild.lattice.nodes.map((node, index) => index === 0
    ? { ...node, position: {
      x: first.patternSides[0].surfacePosition.x + first.patternSides[0].outwardNormal.x * 0.5,
      y: first.patternSides[0].surfacePosition.y + first.patternSides[0].outwardNormal.y * 0.5,
      z: first.patternSides[0].surfacePosition.z + first.patternSides[0].outwardNormal.z * 0.5,
    } }
    : { ...node, position: { ...node.position } }),
  edges: latticeBuild.lattice.edges.map((edge) => ({ ...edge })),
};
const escapedContainment = auditSkinRebuildLatticeBaseContainment(
  base,
  first.patterns,
  first.patternSides,
  escapedLattice,
  DEFAULT_SKIN_REBUILD_SETTINGS,
);
assert.equal(escapedContainment.contained, false, "a radius crossing the Base boundary must be detected");
assert.throws(() => buildSkinRebuildLattice(
  base,
  first.patterns,
  first.patternSides,
  diagnosed.lowestPoints,
  DEFAULT_SKIN_REBUILD_SETTINGS,
  { existingLattice: escapedLattice, existingConnections: latticeBuild.connections, incremental: true },
), /既存ラティスの太さがBase外/, "an old protruding lattice must require a clean Stage 4 rebuild");
const lowestByPatch = new Map(diagnosed.lowestPoints.map((point) => [point.patchId, point]));
const sideByPatch = new Map(first.patternSides.map((side) => [side.patchId, side]));
assert.ok(diagnosed.lowestPoints.some((point) => point.needsSupport
  && !skinRebuildRequiresSpiderSupport(point, sideByPatch.get(point.patchId))));
assert.ok(latticeBuild.connections.every((connection) =>
  skinRebuildRequiresSpiderSupport(lowestByPatch.get(connection.targetPatchId)!, sideByPatch.get(connection.targetPatchId))),
"only red faces whose Pattern inward normal points to the plate receive permanent spider routes");
for (const edge of latticeBuild.lattice.edges) {
  const start = latticeBuild.lattice.nodes[edge.start].position;
  const end = latticeBuild.lattice.nodes[edge.end].position;
  const actualAngle = Math.atan2(
    Math.hypot(end.x - start.x, end.y - start.y),
    Math.max(Math.abs(end.z - start.z), 1e-9),
  ) * 180 / Math.PI;
  assert.ok(actualAngle <= 45 + 1e-5, `actual snapped lattice edge ${edge.id} must remain printable (${actualAngle}°)`);
}
assert.equal(
  connectedNodeCount(latticeBuild.lattice.nodes.length, latticeBuild.lattice.edges),
  latticeBuild.lattice.nodes.length,
  "lattice graph must be one connected web without DryWeb",
);
const firstIncremental = buildSkinRebuildLattice(
  base,
  first.patterns,
  first.patternSides,
  diagnosed.lowestPoints,
  DEFAULT_SKIN_REBUILD_SETTINGS,
  { incremental: true },
);
assert.equal(firstIncremental.connections.length, 1, "one click must add one support route");
assert.equal(firstIncremental.connectivityLoopCount, 0, "one click must not also run a hidden connectivity pass");
const secondIncremental = buildSkinRebuildLattice(
  base,
  first.patterns,
  first.patternSides,
  diagnosed.lowestPoints,
  DEFAULT_SKIN_REBUILD_SETTINGS,
  {
    existingLattice: firstIncremental.lattice,
    existingConnections: firstIncremental.connections,
    incremental: true,
  },
);
assert.equal(secondIncremental.connections.length, 2, "the next click must resume from the existing graph");
assert.ok(secondIncremental.lattice.edges.length > firstIncremental.lattice.edges.length);
const bulkSupport = buildSkinRebuildLattice(
  base,
  first.patterns,
  first.patternSides,
  diagnosed.lowestPoints,
  DEFAULT_SKIN_REBUILD_SETTINGS,
  { maximumRoutes: 3, mode: "support-only" },
);
assert.equal(bulkSupport.addedSupportCount, 3, "the author-entered support count must be honored in one call");
assert.equal(bulkSupport.addedConnectivityCount, 0);
const completeSupport = buildSkinRebuildLattice(
  base,
  first.patterns,
  first.patternSides,
  diagnosed.lowestPoints,
  DEFAULT_SKIN_REBUILD_SETTINGS,
  {
    existingLattice: bulkSupport.lattice,
    existingConnections: bulkSupport.connections,
    maximumRoutes: Number.MAX_SAFE_INTEGER,
    mode: "support-only",
  },
);
assert.deepEqual(completeSupport.unsupportedTargetIds, [], "complete-support must reduce the export-blocking target count to zero");
assert.equal(
  completeSupport.addedSupportCount,
  latticeBuild.connections.length - bulkSupport.connections.length,
  "complete-support must add every remaining spider route in one call",
);
assert.equal(completeSupport.addedConnectivityCount, 0);
const connectivityOnly = buildSkinRebuildLattice(
  base,
  first.patterns,
  first.patternSides,
  diagnosed.lowestPoints.map((point) => ({ ...point, needsSupport: false })),
  DEFAULT_SKIN_REBUILD_SETTINGS,
  { maximumRoutes: Number.MAX_SAFE_INTEGER, mode: "connectivity-only" },
);
assert.deepEqual(connectivityOnly.disconnectedPatternIds, [], "one connect-all call must reduce disconnected Patterns to zero");
assert.ok(connectivityOnly.addedConnectivityCount > 0);

// Regression: a target with no candidate in the strict -0.35 cone must be
// retried in the wider cones instead of remaining N-1/N forever.
const fallbackPatterns = first.patterns.slice(0, 2);
const fallbackSides = first.patternSides.slice(0, 2).map((side, index) => ({
  ...side,
  outwardNormal: index === 0 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 },
}));
const fallbackSource = diagnosed.lowestPoints.find((point) => point.patchId === fallbackSides[0].patchId)!;
const fallbackTarget = {
  ...fallbackSource,
  normal: { x: 0, y: 0, z: -1 },
  plateContact: false,
  needsSupport: true,
};
const widenedCone = buildSkinRebuildLattice(
  base,
  fallbackPatterns,
  fallbackSides,
  [fallbackTarget],
  { ...DEFAULT_SKIN_REBUILD_SETTINGS, patternCount: 2 },
  { maximumRoutes: 1, targetPatchIds: [fallbackTarget.patchId], mode: "support-only" },
);
assert.equal(widenedCone.addedSupportCount, 1, "wider candidate retries must resolve a selected remaining target");
assert.deepEqual(widenedCone.unsupportedTargetIds, []);
const routeCut = latticeBuild.lattice.edges.find((edge) => {
  const edited = removeSkinRebuildLatticeEdge(latticeBuild.lattice, edge.id);
  return retainConnectedSkinRebuildLatticeConnections(
    base, first.patterns, first.patternSides, diagnosed.lowestPoints,
    edited, latticeBuild.connections, DEFAULT_SKIN_REBUILD_SETTINGS,
  ).length < latticeBuild.connections.length;
});
assert.ok(routeCut, "deleting a route member must invalidate a physically severed support claim");
const project = assembleSkinRebuildProject(
  DEFAULT_SKIN_REBUILD_SETTINGS,
  base,
  first.patterns,
  first.patternSides,
  skippedDryWeb,
  diagnosed.lowestPoints,
  latticeBuild.lattice,
  latticeBuild.connections,
  buildSkinRebuildPrintSupport(
    base,
    first.patterns,
    first.patternSides,
    diagnosed.lowestPoints,
    latticeBuild.lattice,
    DEFAULT_SKIN_REBUILD_SETTINGS,
  ),
);
assert.equal(project.audit.dryWebEdgeCount, 0, "first-print project must prove the DryWeb-skip route");
assert.equal(project.audit.realizedPatternCount, project.patterns.length);
assert.ok(project.audit.overhangTargetCount > 0, "sample must exercise overhang extraction");
assert.equal(project.audit.unsupportedTargetCount, 0, "first-print sample must support every extracted target");
assert.equal(project.audit.supportedTargetCount, skinRebuildSpiderSupportTargetIds(first.patternSides, diagnosed.lowestPoints).length);
assert.ok(project.latticeConnections.every((connection) => connection.opposingNormalDot <= 1 + 1e-9));
assert.ok(project.latticeConnections.every((connection) => connection.maximumEdgeAngleDeg <= 45 + 1e-5));
assert.equal(project.finalGraph.stats.connectedTargets, project.audit.supportedTargetCount);

for (const [patternCount, strutDiameterMm] of [[18, 1.6], [64, 4]] as const) {
  const stressSettings = { ...DEFAULT_SKIN_REBUILD_SETTINGS, patternCount, strutDiameterMm };
  const stressBase = createSkinRebuildBase(stressSettings);
  const stressSurface = createSkinRebuildPatterns(stressBase, stressSettings);
  const stressLowest = stressSurface.patternSides.map((side, index) => ({
    patchId: side.patchId,
    position: {
      x: side.surfacePosition.x - side.outwardNormal.x * 0.04,
      y: side.surfacePosition.y - side.outwardNormal.y * 0.04,
      z: side.surfacePosition.z - side.outwardNormal.z * 0.04,
    },
    normal: { ...side.outwardNormal },
    overhangAngleDeg: 60,
    plateContact: index === 0,
    needsSupport: index !== 0,
    basis: "sourceSphere" as const,
  }));
  const stress = buildSkinRebuildLattice(
    stressBase,
    stressSurface.patterns,
    stressSurface.patternSides,
    stressLowest,
    stressSettings,
  );
  assert.deepEqual(stress.disconnectedPatternIds, [], "stress lattice must connect every Pattern without snapping routes");
  assert.equal(stress.containment.contained, true, `${strutDiameterMm} mm stress lattice must contain its full radius`);
  for (const edge of stress.lattice.edges) {
    const start = stress.lattice.nodes[edge.start].position;
    const end = stress.lattice.nodes[edge.end].position;
    const actualAngle = Math.atan2(
      Math.hypot(end.x - start.x, end.y - start.y),
      Math.max(Math.abs(end.z - start.z), 1e-9),
    ) * 180 / Math.PI;
    assert.ok(actualAngle <= 45 + 1e-5, `stress edge ${edge.id} must stay <=45° after graph insertion`);
  }
}

const exported = exportSkinRebuildStl(project, "skin-rebuild-test.stl", 52);
assert.ok(exported.stl.byteLength > 84);
assert.ok(exported.mesh.triangles.length > 1_000);
assert.equal(exported.mesh.mmBounds.min.z, 0, "saved STL must sit on the build plate");
assert.equal(project.settings.targetLongestMm, 120, "new projects use the author's 1.5x physical baseline");
assert.equal(project.settings.strutDiameterMm, 3.9, "permanent lattice scales with the new baseline");
assert.equal(project.settings.supportDiameterMm, 1.6, "removable support keeps the author's thin breakaway baseline");
assert.ok(Math.abs(exported.mesh.mmBounds.longest - 120) <= 1e-6, "new default STL longest dimension is 120 mm");
assert.equal(skinRebuildTopologyPass(exported.topology), true);
assert.equal(exported.topology.connectedComponents, 1);
const withSavedCollinearNoise = {
  ...exported.mesh,
  triangles: [...exported.mesh.triangles, {
    a: { x: 0, y: 0, z: 0 },
    b: { x: 0.5, y: 0, z: 0 },
    c: { x: 1, y: 0, z: 0 },
  }],
};
const withoutSavedCollinearNoise = orientMeshForSavedStl(withSavedCollinearNoise);
assert.equal(
  withoutSavedCollinearNoise.triangles.length,
  exported.mesh.triangles.length,
  "saved-coordinate collinear noise must be removed before the final topology gate",
);
assert.equal(inspectSavedStlTopology(
  withoutSavedCollinearNoise.triangles,
  withoutSavedCollinearNoise.scaleMmPerUnit,
).degenerateTriangleCount, 0);
const withOneMissingTriangle = {
  ...exported.mesh,
  triangles: exported.mesh.triangles.slice(1),
};
const missingTriangleTopology = inspectSavedStlTopology(
  withOneMissingTriangle.triangles,
  withOneMissingTriangle.scaleMmPerUnit,
);
assert.equal(missingTriangleTopology.openEdges, 3, "one missing face must expose exactly three saved-STL edges");
const repairedTriangleHole = repairSkinRebuildFinalMesh(withOneMissingTriangle);
const repairedTriangleTopology = inspectSavedStlTopology(
  repairedTriangleHole.triangles,
  repairedTriangleHole.scaleMmPerUnit,
);
assert.equal(repairedTriangleTopology.ok, true, "one tiny triangular numerical hole must be repaired");
assert.equal(repairedTriangleTopology.openEdges, 0);
assert.equal(repairedTriangleTopology.connectedComponents, 1);
assert.equal(repairedTriangleHole.repairedSavedTriangleHoleCount, 1);
const enlargedMissingTriangle = {
  ...withOneMissingTriangle,
  scaleMmPerUnit: withOneMissingTriangle.scaleMmPerUnit * 10_000,
};
const refusedLargeHole = repairSkinRebuildFinalMesh(enlargedMissingTriangle);
assert.equal(
  inspectSavedStlTopology(refusedLargeHole.triangles, refusedLargeHole.scaleMmPerUnit).openEdges,
  3,
  "a physically large triangular opening must remain fail-closed",
);
const surfaceSdf = createCompositeSdfEvaluator(
  "plate", project.base.host, project.base.hostK, project.settings.surfaceThickness,
  project.patterns, project.settings.roundK, 0, 0,
);
const printGate = evaluateInternalPrintGate({
  graph: mergeSkinRebuildGraphsAtSupportContacts(project.finalGraph, project.printSupport),
  mesh: exported.mesh,
  resolution: 128,
  targetLongestMm: project.settings.targetLongestMm,
  surfaceSdf: (point) => surfaceSdf(point.x, point.y, point.z),
  buildPlateZSource: Math.min(...project.lowestPoints.map((point) => point.position.z)),
});
assert.ok(printGate.unsupportedNodes > 0, "a Body-crossing support rejection must remain visible to the fail-closed print gate");
assert.ok(printGate.unsupportedEdges > 0, "rejected support candidates must not be treated as printable spider support");
assert.ok(project.printSupport.edges.length > 0, "sample must generate removable support as a separate graph");
assert.ok(printGate.buildPlateAnchorNodes > 0, "separate support must expose explicit plate roots");
assert.ok(project.printSupport.edges.every((edge) => {
  const start = project.printSupport.nodes[edge.start].position;
  const end = project.printSupport.nodes[edge.end].position;
  return Math.hypot(end.x - start.x, end.y - start.y) <= 1e-9;
}), "removable support members must be vertical and independent from the spider web");
const shallowArtwork = createEmptySkinRebuildGraph();
shallowArtwork.nodes = [
  { id: 0, position: { x: 3.3, y: 3, z: 0.5 }, radius: 0.04 },
  { id: 1, position: { x: 3.9, y: 3, z: 0.5 }, radius: 0.04 },
];
shallowArtwork.edges = [{ id: 0, start: 0, end: 1, radius: 0.04 }];
const shallowSupport = buildSkinRebuildPrintSupport(
  project.base,
  project.patterns,
  project.patternSides,
  project.lowestPoints,
  shallowArtwork,
  project.settings,
);
assert.ok(shallowSupport.nodes.some((node) =>
  node.position.x > 3.3 + 1e-6 && node.position.x < 3.9 - 1e-6 && Math.abs(node.position.z - 0.5) <= 1e-6),
"Stage 5B must add a real intermediate plate contact beneath an overlong shallow member");
assert.ok(Math.abs(exported.mesh.plateShiftSourceZ ?? 0) > 1e-6, "BODY export must record its build-plate translation");
const supportMesh = orientMeshForSavedStl(buildPrintSupportMesh(
  project.printSupport,
  exported.mesh.scaleMmPerUnit,
  {
    sourceOffset: { x: 0, y: 0, z: exported.mesh.plateShiftSourceZ ?? 0 },
    extendVerticalRootsToPlateZ: 0,
  },
));
const supportTopology = inspectSavedStlTopology(supportMesh.triangles, supportMesh.scaleMmPerUnit);
assert.equal(supportTopology.ok, true, "separate print-support STL must contain closed consistently wound pillars");
assert.equal(supportTopology.connectedComponents, project.printSupport.edges.length, "each removable support pillar remains a separate closed component");
assert.ok(Math.abs(supportMesh.mmBounds.min.z) <= 1e-6, "vertical support roots must reach the exact build plate");
const expectedSupportMaxMm = (
  Math.max(...project.printSupport.nodes.map((node) => node.position.z))
  + (exported.mesh.plateShiftSourceZ ?? 0)
) * exported.mesh.scaleMmPerUnit;
assert.ok(Math.abs(supportMesh.mmBounds.max.z - expectedSupportMaxMm) <= 1e-6,
  "extending roots to the plate must not move artwork contact heights");

const supportFixtureSettings: SkinRebuildSettings = {
  ...DEFAULT_SKIN_REBUILD_SETTINGS,
  patternCount: 2,
  targetLongestMm: 20,
  supportDiameterMm: 1.6,
};
const supportFixtureBase: SkinRebuildBase = {
  kind: "metaball-capsule",
  host: [{ id: 1, x: 0, y: 0, z: 0, r: 0.1 }],
  hostK: 1,
};
const supportFixtureLowestPoints = (): SkinRebuildLowestPoint[] => [
  {
    patchId: 1,
    position: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: -1 },
    overhangAngleDeg: 0,
    plateContact: true,
    needsSupport: false,
    basis: "sourceSphere",
  },
  {
    patchId: 2,
    position: { x: 0, y: 0, z: 3 },
    normal: { x: 0, y: 0, z: 1 },
    overhangAngleDeg: 60,
    plateContact: false,
    needsSupport: true,
    basis: "sourceSphere",
  },
];
function supportFixtureArtwork(includeSeparatedObstruction: boolean, includeTerminalTarget: boolean): InternalStructureGraph {
  const graph = createEmptySkinRebuildGraph();
  const nodes = [] as InternalStructureGraph["nodes"];
  const edges = [] as InternalStructureGraph["edges"];
  const addMember = (startZ: number, endZ: number, radius: number): void => {
    const start = nodes.length;
    nodes.push({ id: start, position: { x: 0, y: 0, z: startZ }, radius });
    const end = nodes.length;
    nodes.push({ id: end, position: { x: 0, y: 0, z: endZ }, radius });
    edges.push({ id: edges.length, start, end, radius });
  };
  if (includeSeparatedObstruction) addMember(1, 1.2, 0.08);
  if (includeTerminalTarget) addMember(2.998, 3, 0.006);
  graph.nodes = nodes;
  graph.edges = edges;
  graph.stats.inputPoints = nodes.length;
  graph.stats.candidateEdges = edges.length;
  graph.stats.gridNodeCount = nodes.length;
  graph.stats.gridEdgeCount = edges.length;
  return graph;
}
const clearSupport = buildSkinRebuildPrintSupport(
  supportFixtureBase,
  [],
  [],
  supportFixtureLowestPoints(),
  supportFixtureArtwork(false, false),
  supportFixtureSettings,
);
assert.equal(clearSupport.stats.requestedTargets, 1, "clear-route fixture must retain its one target candidate");
assert.equal(clearSupport.stats.acceptedSupportCount, 1, "a clear vertical route must be accepted by the production keep-out path");
assert.equal(clearSupport.stats.rejectedByBodyIntersection, 0);
assert.equal(clearSupport.stats.unsupportedCount, 0);
const terminalSupport = buildSkinRebuildPrintSupport(
  supportFixtureBase,
  [],
  [],
  supportFixtureLowestPoints(),
  supportFixtureArtwork(false, true),
  supportFixtureSettings,
);
assert.equal(terminalSupport.stats.acceptedSupportCount, 1, "intended terminal Body contact must be allowed");
assert.equal(terminalSupport.stats.rejectedByBodyIntersection, 0);
const obstructedSupport = buildSkinRebuildPrintSupport(
  supportFixtureBase,
  [],
  [],
  supportFixtureLowestPoints(),
  supportFixtureArtwork(true, true),
  supportFixtureSettings,
);
assert.equal(obstructedSupport.stats.requestedTargets, 1);
assert.equal(obstructedSupport.stats.acceptedSupportCount, 0, "an intermediate Body obstruction must reject the candidate");
assert.equal(obstructedSupport.stats.rejectedByBodyIntersection, 1);
assert.equal(obstructedSupport.stats.unsupportedCount, 1);
assert.equal(obstructedSupport.stats.unsupportedCount,
  obstructedSupport.stats.requestedTargets! - obstructedSupport.stats.acceptedSupportCount!,
  "no-reroute accounting must expose the rejected candidate as unsupported");

console.log("skin-rebuild model tests passed", JSON.stringify(project.audit));
