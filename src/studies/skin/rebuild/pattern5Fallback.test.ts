import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  captureSkinRebuildFkei,
  parseSkinRebuildFkei,
  projectFromSkinRebuildFkei,
  serializeSkinRebuildFkei,
} from "./fkei.ts";
import {
  assembleSkinRebuildProject,
  buildSkinRebuildLattice,
  retainConnectedSkinRebuildLatticeConnections,
} from "./model.ts";

const source = parseSkinRebuildFkei(readFileSync(
  new URL("../../../../public/samples/skin-rebuild-pattern5-regression.fkei", import.meta.url),
  "utf8",
));
const project = projectFromSkinRebuildFkei(source);

assert.equal(project.patterns.some((pattern) => pattern.id === 5), true,
  "the regression must keep Pattern #5 in the artwork");
assert.equal(project.audit.unsupportedTargetCount, 1);

const repaired = buildSkinRebuildLattice(
  project.base,
  project.patterns,
  project.patternSides,
  project.lowestPoints,
  project.settings,
  {
    existingLattice: project.lattice,
    existingConnections: project.latticeConnections,
    maximumRoutes: 1,
    targetPatchIds: [5],
    mode: "support-only",
  },
);

assert.equal(repaired.addedSupportCount, 1,
  "one selected-target action must add Pattern #5 support");
assert.equal(repaired.fallbackSupportCount, 1,
  "the deep-concavity case must use the existing-web fallback");
assert.deepEqual(repaired.unsupportedTargetIds, []);
assert.equal(repaired.containment.contained, true);
assert.equal(repaired.lattice.edges.length, project.lattice.edges.length + 4);
assert.equal(repaired.connections.length, project.latticeConnections.length + 1);
const pattern5Connection = repaired.connections.find((connection) => connection.targetPatchId === 5);
assert.ok(pattern5Connection, "Pattern #5 must have a persisted support claim");

for (const edge of repaired.lattice.edges) {
  const start = repaired.lattice.nodes[edge.start].position;
  const end = repaired.lattice.nodes[edge.end].position;
  const angle = Math.atan2(
    Math.hypot(end.x - start.x, end.y - start.y),
    Math.max(Math.abs(end.z - start.z), 1e-9),
  ) * 180 / Math.PI;
  assert.ok(angle <= 45 + 1e-5, `fallback edge ${edge.id} must remain <=45 degrees (${angle})`);
}

const retained = retainConnectedSkinRebuildLatticeConnections(
  project.base,
  project.patterns,
  project.patternSides,
  project.lowestPoints,
  repaired.lattice,
  repaired.connections,
  project.settings,
);
assert.equal(retained.length, repaired.connections.length,
  "the fallback support claim must remain connected after the exact graph audit");

const repairedProject = assembleSkinRebuildProject(
  project.settings,
  project.base,
  project.patterns,
  project.patternSides,
  project.dryWeb,
  project.lowestPoints,
  repaired.lattice,
  repaired.connections,
);
assert.equal(repairedProject.audit.unsupportedTargetCount, 0);
assert.equal(repairedProject.patterns.some((pattern) => pattern.id === 5), true);

const roundTripped = projectFromSkinRebuildFkei(parseSkinRebuildFkei(serializeSkinRebuildFkei(
  captureSkinRebuildFkei(repairedProject, {
    appVersion: "0.90.5",
    shapeRecipe: source.shapeRecipe,
    savedAt: "2026-08-30T16:00:00.000Z",
  }),
)));
assert.equal(roundTripped.audit.unsupportedTargetCount, 0);
assert.equal(roundTripped.patterns.some((pattern) => pattern.id === 5), true);
assert.equal(roundTripped.lattice.edges.length, repaired.lattice.edges.length);

// Browser-authored geometry can select a different root in the same mature
// web component. Its normal may not satisfy the obsolete direct-opposition
// threshold, but the saved graph still proves the complete printable path.
const webRoutedProject = structuredClone(repairedProject);
const webRoutedConnection = webRoutedProject.latticeConnections.find((connection) => connection.targetPatchId === 5)!;
webRoutedConnection.opposingNormalDot = 0.35;
const webRoutedRoundTrip = projectFromSkinRebuildFkei(parseSkinRebuildFkei(serializeSkinRebuildFkei(
  captureSkinRebuildFkei(webRoutedProject, {
    appVersion: "0.90.6",
    shapeRecipe: source.shapeRecipe,
    savedAt: "2026-08-30T16:01:00.000Z",
  }),
)));
assert.equal(webRoutedRoundTrip.audit.unsupportedTargetCount, 0,
  "an existing-web route must save when its actual graph path remains connected and printable");

const brokenPathProject = structuredClone(webRoutedProject);
const targetSide = brokenPathProject.patternSides.find((side) => side.patchId === 5)!;
const ownBackNode = brokenPathProject.lattice.nodes.findIndex((node) => (
  Math.hypot(
    node.position.x - targetSide.insidePosition.x,
    node.position.y - targetSide.insidePosition.y,
    node.position.z - targetSide.insidePosition.z,
  ) <= 1e-6
));
assert.ok(ownBackNode >= 0);
brokenPathProject.lattice.edges = brokenPathProject.lattice.edges
  .filter((edge) => edge.start !== ownBackNode && edge.end !== ownBackNode)
  .map((edge, id) => ({ ...edge, id }));
assert.throws(
  () => captureSkinRebuildFkei(brokenPathProject, {
    appVersion: "0.90.6",
    savedAt: "2026-08-30T16:02:00.000Z",
  }),
  /lattice path contract failed at Pattern #5/,
  "save must still reject a support claim whose real spider path was severed",
);

console.log("skin-rebuild Pattern #5 existing-web fallback tests passed");
