import assert from "node:assert/strict";
import { buildSkinRebuildProject, skinRebuildBaseCentroid } from "./model.ts";
import {
  captureSkinRebuildFkei,
  parseSkinRebuildFkei,
  projectFromSkinRebuildFkei,
  serializeSkinRebuildFkei,
} from "./fkei.ts";

const { project } = buildSkinRebuildProject();
const document = captureSkinRebuildFkei(project, {
  savedAt: "2026-08-29T12:00:00.000Z",
  appVersion: "1.0.0",
  generatorCommit: "6f7b36fb115d58245044e50a48a3f3bd52c6891d",
});
const serialized = serializeSkinRebuildFkei(document);
const restoredDocument = parseSkinRebuildFkei(serialized);
const restoredProject = projectFromSkinRebuildFkei(restoredDocument);
assert.equal(serializeSkinRebuildFkei(restoredDocument), serialized, "FKEI roundtrip must be byte-stable");
assert.deepEqual(restoredProject.audit, project.audit);
assert.deepEqual(restoredProject.finalGraph, project.finalGraph);
assert.deepEqual(restoredProject.printSupport, project.printSupport);
assert.equal(restoredProject.settings.supportDiameterMm, project.settings.supportDiameterMm);
assert.equal(restoredDocument.printApproval, false);
assert.equal(
  project.printSupport.stats.acceptedSupportCount,
  project.printSupport.stats.connectedTargets,
  "new support diagnostics must identify accepted pillars as connected targets",
);
assert.equal(
  project.printSupport.stats.unsupportedCount,
  project.printSupport.stats.requestedTargets! - project.printSupport.stats.acceptedSupportCount!,
  "new support diagnostics must account for every no-reroute candidate",
);
assert.ok(
  project.printSupport.stats.rejectedByBodyIntersection! <= project.printSupport.stats.requestedTargets!,
  "Body-intersection rejects cannot exceed requested candidates",
);

const legacyWithoutSupportDiagnostics = JSON.parse(serialized) as Record<string, any>;
for (const key of ["rejectedByBodyIntersection", "acceptedSupportCount", "unsupportedCount"]) {
  delete legacyWithoutSupportDiagnostics.project.printSupport.stats[key];
}
const legacyDiagnosticsDocument = parseSkinRebuildFkei(JSON.stringify(legacyWithoutSupportDiagnostics));
const legacyDiagnosticsProject = projectFromSkinRebuildFkei(legacyDiagnosticsDocument);
assert.equal(
  legacyDiagnosticsProject.printSupport.stats.acceptedSupportCount,
  undefined,
  "legacy support graphs without optional diagnostics must remain readable",
);

const centroidLegacy = JSON.parse(serialized) as Record<string, any>;
centroidLegacy.compatibility.appVersion = "0.87.0";
const legacyCentroidZ = skinRebuildBaseCentroid(project.base).z;
const legacyTargetIds = new Set(project.lowestPoints
  .filter((point) => point.needsSupport && point.position.z >= legacyCentroidZ - 1e-9)
  .map((point) => point.patchId));
centroidLegacy.project.latticeConnections = centroidLegacy.project.latticeConnections
  .filter((connection: { targetPatchId: number }) => legacyTargetIds.has(connection.targetPatchId));
centroidLegacy.project.audit.overhangTargetCount = legacyTargetIds.size;
centroidLegacy.project.audit.supportedTargetCount = centroidLegacy.project.latticeConnections.length;
centroidLegacy.project.audit.unsupportedTargetCount = legacyTargetIds.size
  - centroidLegacy.project.latticeConnections.length;
centroidLegacy.project.audit.maximumLatticeAngleDeg = centroidLegacy.project.latticeConnections.reduce(
  (maximum: number, connection: { maximumEdgeAngleDeg: number }) => Math.max(maximum, connection.maximumEdgeAngleDeg),
  0,
);
const canonicalizedLegacy = parseSkinRebuildFkei(JSON.stringify(centroidLegacy));
assert.equal(
  canonicalizedLegacy.project.audit.overhangTargetCount,
  project.audit.overhangTargetCount,
  "v0.87 centroid audits must reopen and canonicalize to the local-normal rule",
);

const legacyValue = JSON.parse(serialized) as Record<string, any>;
legacyValue.compatibility.appVersion = "0.84.0";
delete legacyValue.project.settings.supportDiameterMm;
delete legacyValue.project.printSupport;
const migratedLegacy = projectFromSkinRebuildFkei(parseSkinRebuildFkei(JSON.stringify(legacyValue)));
assert.equal(migratedLegacy.settings.supportDiameterMm, 1.6, "v0.84 FKEI must acquire the separate support default");
assert.equal(migratedLegacy.printSupport.edges.length, 0, "old mixed-support files must require explicit 5B regeneration");

const incompleteProject = structuredClone(project);
incompleteProject.latticeConnections.pop();
incompleteProject.audit.supportedTargetCount = incompleteProject.latticeConnections.length;
incompleteProject.audit.unsupportedTargetCount = incompleteProject.audit.overhangTargetCount
  - incompleteProject.audit.supportedTargetCount;
incompleteProject.audit.maximumLatticeAngleDeg = incompleteProject.latticeConnections.reduce(
  (maximum, connection) => Math.max(maximum, connection.maximumEdgeAngleDeg),
  0,
);
incompleteProject.lattice.stats.connectedTargets = incompleteProject.audit.supportedTargetCount;
const incompleteText = serializeSkinRebuildFkei(captureSkinRebuildFkei(incompleteProject, {
  savedAt: "2026-08-29T12:00:00.000Z",
}));
assert.equal(
  parseSkinRebuildFkei(incompleteText).project.audit.unsupportedTargetCount,
  1,
  ".fkei must preserve and save an honest remaining unsupported target",
);

function mutate(mutator: (value: Record<string, any>) => void): string {
  const value = JSON.parse(serialized) as Record<string, any>;
  mutator(value);
  return JSON.stringify(value);
}

assert.throws(() => parseSkinRebuildFkei(mutate((value) => { value.printApproval = true; })), /printApproval/);
assert.throws(() => parseSkinRebuildFkei(mutate((value) => { value.project.patternSides[0].baseSideIsInside = false; })), /inside\/outside/);
assert.throws(() => parseSkinRebuildFkei(mutate((value) => { value.project.lattice.edges[0].end = 999999; })), /edge is invalid/);
assert.throws(() => parseSkinRebuildFkei(mutate((value) => {
  const edge = value.project.printSupport.edges[0];
  value.project.printSupport.nodes[edge.end].position.x += 100;
})), /printSupport contains a segment above 45 degrees/);
assert.throws(() => parseSkinRebuildFkei(mutate((value) => { value.project.latticeConnections[0].maximumEdgeAngleDeg = 60; })), /contract/);
assert.throws(() => parseSkinRebuildFkei(mutate((value) => { value.project.audit.supportedTargetCount += 1; })), /inconsistent/);
assert.throws(() => parseSkinRebuildFkei(mutate((value) => { value.project.unknown = true; })), /unknown field/);

console.log("skin-rebuild fkei tests passed", serialized.length);
