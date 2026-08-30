import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseFkeiDocument } from "../fkei.ts";
import { createFkeiRestorePlan } from "../fkeiRuntimeRestore.ts";
import { DEFAULT_SKIN_PARAMS, generateShapePoints, projectToSurface, type Patch } from "../field.ts";
import {
  DEFAULT_SKIN_REBUILD_SETTINGS,
  assembleSkinRebuildProject,
  buildSkinRebuildDryWeb,
  buildSkinRebuildLattice,
  buildSkinRebuildPrintSupport,
  classifySkinRebuildPatternSides,
  createEmptySkinRebuildGraph,
  exportSkinRebuildStl,
  findSkinRebuildLowestPoints,
  type SkinRebuildBase,
  type SkinRebuildSettings,
} from "./model.ts";
import {
  captureSkinRebuildFkei,
  parseSkinRebuildFkei,
  projectFromSkinRebuildFkei,
  serializeSkinRebuildFkei,
} from "./fkei.ts";
import { serializeRecipe } from "../history.ts";

const samplePath = fileURLToPath(new URL("../../../../public/samples/skin-rebuild-original-stage2.fkei", import.meta.url));
const original = createFkeiRestorePlan(parseFkeiDocument(readFileSync(samplePath, "utf8")));
const state = original.shapeState;
const radii = state.patches.flatMap((patch) => patch.points.map((point) => point.r));
const averageRadius = radii.reduce((sum, radius) => sum + radius, 0) / radii.length;
const settings: SkinRebuildSettings = {
  ...DEFAULT_SKIN_REBUILD_SETTINGS,
  patternCount: state.patches.length,
  surfaceThickness: state.skinParams.thickness,
  patternRadius: Math.max(0.18, Math.min(0.38, averageRadius)),
  roundK: state.skinParams.roundK,
  analysisResolution: 48,
  exportResolution: 68,
};
const base: SkinRebuildBase = {
  kind: "metaball-capsule",
  host: state.host.map((ball) => ({ ...ball })),
  hostK: state.hostParams.k,
};

const patternSides = classifySkinRebuildPatternSides(base, state.patches, settings);
assert.equal(patternSides.length, 38);
assert.ok(patternSides.every((side) => side.baseSideIsInside && side.insideSignedDistance < 0 && side.outsideSignedDistance > 0));

// SKIN REBUILD normally skips DryWeb.  The one-click Stage 5A action must
// support every spider target without allowing the complete strut radius to
// leave the authored Base.  Keep this exact original-editor sample as the
// regression for the lower protrusion reported in the UI.
const emptyDryWeb = createEmptySkinRebuildGraph();
const noDryWebDiagnosis = findSkinRebuildLowestPoints(base, state.patches, patternSides, emptyDryWeb, settings);
const noDryWebLattice = buildSkinRebuildLattice(
  base,
  state.patches,
  patternSides,
  noDryWebDiagnosis.lowestPoints,
  settings,
  { maximumRoutes: Number.MAX_SAFE_INTEGER, mode: "support-only" },
);
assert.deepEqual(
  noDryWebLattice.unsupportedTargetIds,
  [],
  `one-click Stage 5A left unsupported Pattern ids ${noDryWebLattice.unsupportedTargetIds.join(", ")}`,
);
assert.equal(noDryWebLattice.containment.contained, true);
assert.deepEqual(noDryWebLattice.containment.outsideEdgeIds, []);

const dryWeb = buildSkinRebuildDryWeb(base, state.patches, patternSides, settings);
const diagnosed = findSkinRebuildLowestPoints(base, state.patches, patternSides, dryWeb, settings);
const built = buildSkinRebuildLattice(base, state.patches, patternSides, diagnosed.lowestPoints, settings);
const project = assembleSkinRebuildProject(
  settings,
  base,
  state.patches,
  patternSides,
  dryWeb,
  diagnosed.lowestPoints,
  built.lattice,
  built.connections,
);
assert.ok(project.audit.overhangTargetCount > 0, "original Stage 2 sample must exercise lowest-point extraction");
assert.ok(project.audit.supportedTargetCount > 0, "original Stage 2 sample must produce printable internal members");
assert.equal(
  project.audit.supportedTargetCount + project.audit.unsupportedTargetCount,
  project.audit.overhangTargetCount,
  "arbitrary original shapes must report unsupported targets instead of inventing support",
);
assert.ok(project.audit.maximumLatticeAngleDeg <= 45 + 1e-5);

const shapeRecipe = serializeRecipe(original.history);
const text = serializeSkinRebuildFkei(captureSkinRebuildFkei(project, {
  savedAt: "2026-08-29T12:00:00.000Z",
  shapeRecipe,
}));
const roundtrip = parseSkinRebuildFkei(text);
assert.equal(roundtrip.shapeRecipe, shapeRecipe);
assert.deepEqual(projectFromSkinRebuildFkei(roundtrip).audit, project.audit);

// A ring's centroid is a real hole, so graph connectivity alone used to
// leave one closed STL component per Pattern.  Classification must move the
// back anchor to actual ring material before Stage 5 builds the web.
const ringParams = {
  ...DEFAULT_SKIN_PARAMS,
  patchShape: "flatRing" as const,
  motifPlacement: "surface" as const,
  flatRingHoleRatio: 0.62,
  ringNodeCount: 12,
  ringWobbleR: 0,
};
const ringPatches: Patch[] = state.patches.slice(0, 12).map((patch, index) => {
  const source = patch.points[0];
  const projected = projectToSurface(base.host, base.hostK, source.x, source.y, source.z, 36);
  assert.ok(projected, `ring ${index + 1} must project to the Base Shape`);
  return {
    id: index + 1,
    shape: "flatRing",
    motifPlacement: "surface",
    points: generateShapePoints(
      "flatRing", base.host, base.hostK, projected!, 0.19, ringParams, () => 0.5, index + 1, [],
    ),
  };
});
const ringSettings: SkinRebuildSettings = {
  ...settings,
  patternCount: ringPatches.length,
  analysisResolution: 32,
  exportResolution: 48,
};
const ringSides = classifySkinRebuildPatternSides(base, ringPatches, ringSettings);
const ringScale = ringSettings.targetLongestMm / Math.max(
  ...base.host.flatMap((ball) => [Math.abs(ball.x) + ball.r, Math.abs(ball.y) + ball.r, Math.abs(ball.z) + ball.r]),
);
const ringStrutRadius = ringSettings.strutDiameterMm * 0.5 / ringScale;
for (const side of ringSides) {
  const patch = ringPatches.find((candidate) => candidate.id === side.patchId)!;
  assert.ok(
    patch.points.some((point) => Math.hypot(
      point.x - side.insidePosition.x,
      point.y - side.insidePosition.y,
      point.z - side.insidePosition.z,
    ) < point.r + ringStrutRadius),
    `ring #${side.patchId} back anchor must overlap realized ring material`,
  );
}
const ringDryWeb = createEmptySkinRebuildGraph();
const ringDiagnosed = findSkinRebuildLowestPoints(base, ringPatches, ringSides, ringDryWeb, ringSettings);
const ringLattice = buildSkinRebuildLattice(base, ringPatches, ringSides, ringDiagnosed.lowestPoints, ringSettings);
const ringProject = assembleSkinRebuildProject(
  ringSettings,
  base,
  ringPatches,
  ringSides,
  ringDryWeb,
  ringDiagnosed.lowestPoints,
  ringLattice.lattice,
  ringLattice.connections,
  buildSkinRebuildPrintSupport(base, ringPatches, ringSides, ringDiagnosed.lowestPoints, ringLattice.lattice, ringSettings),
);
const ringExport = exportSkinRebuildStl(ringProject, "skin-rebuild-ring-attachment-test.stl", 48);
assert.equal(ringExport.topology.connectedComponents, 1, "ring Patterns must physically fuse to the spider lattice");
assert.equal(ringExport.topology.degenerateTriangleCount, 0);

console.log("SKIN REBUILD original Surface pipeline tests passed", JSON.stringify(project.audit));
