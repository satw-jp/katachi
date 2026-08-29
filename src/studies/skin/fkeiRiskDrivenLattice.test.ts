import assert from "node:assert/strict";
import { parseFkei } from "./fkei.ts";
import { fkeiCanonicalDryWebGraphSha256, fkeiExactDiagnosisSummarySha256, fkeiRestoredRiskDrivenCheckpointGraphIsCurrent, fkeiRiskDrivenLatticeSemanticSha256, validateFkeiCanonicalDryWebArtifact, validateFkeiRiskDrivenLatticeArtifact, hydrateFkeiRiskDrivenLatticeArtifact } from "./fkeiRiskDrivenLattice.ts";

const stats = { inputPoints: 2, delaunayTetrahedra: 0, candidateEdges: 1, clippedEdges: 0, removedShortEdges: 0, removedOutsideEdges: 0, removedIsolatedEdges: 0 };
const graph = { kind: "targetedGrid" as const, nodes: [{ id: 0, position: { x: 0, y: 0, z: 0 }, radius: .1 }, { id: 1, position: { x: 0, y: 0, z: 1 }, radius: .1 }], edges: [{ id: 0, start: 0, end: 1, radius: .1 }], stats };
const binding = {
  shapeFingerprint: "shape",
  patchSetRevision: 1,
  paintRevision: 2,
  artworkGraphSourceKey: "art",
  canonicalRequestSha256: "request",
  canonicalGraphSha256: fkeiCanonicalDryWebGraphSha256(graph),
  surfaceResolution: 16,
  surfaceTargetLongestMm: 10,
  surfaceAngleThresholdDeg: 45,
  exactDiagnosisProvenanceSha256: "proof",
};
const canonical = validateFkeiCanonicalDryWebArtifact({ schemaVersion: 1, producer: "katachi.skin.risk-driven-permanent-lattice-v0", inputBinding: binding, graph, shapeSnapshot: { mode: "plate", patchSetRevision: 1, host: [{ id: 0, x: 0, y: 0, z: 0, r: 1 }], hostK: .5, thickness: .1, roundK: .05, coinBulge: 0, coinBulgeBalance: 0, quadMeshJoinWidth: 0, patches: [] }, exactDiagnosisSummary: { teal: 1, orange: 0, red: 0, provenanceSha256: "proof", summarySha256: fkeiExactDiagnosisSummarySha256({ teal: 1, orange: 0, red: 0, provenanceSha256: "proof" }) } });
const artifact: any = { schemaVersion: 1, producer: "katachi.skin.risk-driven-permanent-lattice-v0", inputBinding: { ...binding, canonicalGraphNodes: 2, canonicalGraphEdges: 1 }, planSha256: "p", validationSha256: "v", stlSha256: "s", settings: { thresholdDeg: 45, meshStep: .1, scaleMmPerUnit: 11, diameterMm: 2.2, maximumSegmentLengthMm: 5, maximumAngleFromVerticalDeg: 45 }, graph: { kind: "targetedGrid", nodes: [{ id: 0, position: { x: 0, y: 0, z: 0 }, radius: .1, role: "surface-anchor", anchorId: 0, spineId: 0 }, { id: 1, position: { x: 0, y: 0, z: 1 }, radius: .1, role: "risk-target", candidateId: 0, spineId: 0 }], edges: [{ id: 0, start: 0, end: 1, radius: .1, role: "branch", diameterMm: 2.2, physicalLengthMm: 1, horizontalMm: 0, verticalMm: 1, angleFromVerticalDeg: 0, candidateId: 0, spineId: 0 }], stats }, anchors: [{ id: 0, diagnosisFaceId: 0, position: { x: 0, y: 0, z: 0 }, angleDeg: 0, candidateIds: [0] }], selectedCandidates: [{ id: 0, sourceRank: 0, riskClusterId: 0, position: { x: 0, y: 0, z: 1 }, affectedRiskArea: 1, remainingRiskArea: 0, requiredLatticeLength: 1, supportGain: 1, anchorId: 0 }], spines: [{ id: 0, anchorId: 0, candidateIds: [0], nodeIds: [0, 1], edgeIds: [0] }], branches: [{ candidateId: 0, spineId: 0, junctionNodeId: 0, targetNodeId: 1, edgeIds: [0] }], generationFacts: { canonicalNodeCount: 2, canonicalEdgeCount: 1, latticeNodeCount: 2, latticeEdgeCount: 1, augmentedNodeCount: 4, augmentedEdgeCount: 2, sharedSpineCount: 0, savedDiameterMm: 2.2, triangleCount: 1 }, sourceSpace: { resolution: 128, targetLongestMm: 80 } };
artifact.semanticSha256 = fkeiRiskDrivenLatticeSemanticSha256(artifact);
const valid = validateFkeiRiskDrivenLatticeArtifact(artifact, canonical);
assert.deepEqual([hydrateFkeiRiskDrivenLatticeArtifact(canonical, valid).augmentedGraph.nodes.length, hydrateFkeiRiskDrivenLatticeArtifact(canonical, valid).augmentedGraph.edges.length], [4, 2]);
assert.equal(fkeiRestoredRiskDrivenCheckpointGraphIsCurrent(canonical, valid, canonical.graph), true);
const replacedLiveCanonicalGraph = structuredClone(canonical.graph);
replacedLiveCanonicalGraph.nodes[0]!.position.x = 0.25;
assert.equal(fkeiRestoredRiskDrivenCheckpointGraphIsCurrent(canonical, valid, replacedLiveCanonicalGraph), false, "same upstream bindings cannot keep a replaced live graph current");
const staleSemantic = structuredClone(valid) as typeof valid & { semanticSha256: string };
staleSemantic.graph.nodes[1]!.position.z = 2;
assert.equal(fkeiRestoredRiskDrivenCheckpointGraphIsCurrent(canonical, staleSemantic, canonical.graph), false, "semantic payload mutation stales the restored lattice");
assert.equal(parseFkei(JSON.stringify([{ t: 1, op: "clearAll", args: {} }])).kind, "legacy");
for (const mutate of [(x: any) => x.graph.edges[0].end = 99, (x: any) => x.graph.nodes[0].role = "unknown", (x: any) => x.branches[0].spineId = 9]) { const copy = JSON.parse(JSON.stringify(artifact)); mutate(copy); assert.throws(() => validateFkeiRiskDrivenLatticeArtifact(copy, canonical)); }
const tamperedCanonical = JSON.parse(JSON.stringify(canonical));
tamperedCanonical.graph.nodes[0].position.x = 0.25;
assert.throws(() => validateFkeiCanonicalDryWebArtifact(tamperedCanonical), /SHA-256.*reviewed geometry/);
const tamperedExact = JSON.parse(JSON.stringify(canonical));
tamperedExact.exactDiagnosisSummary.red = 1;
assert.throws(() => validateFkeiCanonicalDryWebArtifact(tamperedExact), /summary SHA-256/);
for (const mutate of [
  (x: any) => x.generationFacts.sharedSpineCount = 1,
  (x: any) => x.sourceSpace.resolution = 127,
  (x: any) => x.graph.edges[0].diameterMm = 2.1,
  (x: any) => x.branches[0].edgeIds = [],
  (x: any) => x.graph.nodes[1].position.z = 2,
]) {
  const copy = JSON.parse(JSON.stringify(artifact));
  mutate(copy);
  assert.throws(() => validateFkeiRiskDrivenLatticeArtifact(copy, canonical));
}
console.log("fkeiRiskDrivenLattice.test.ts passed");
