import assert from "node:assert/strict";
import {
  canonicalizeSkinRebuildArtifactPositions,
  evaluateSkinRebuildArtifactExportAvailability,
} from "./artifactExport.ts";

const formats = {
  threeMf: true,
  bodyStl: true,
  supportStl: true,
  obj: true,
  report: true,
};
const triangle = new Float32Array([
  0, 0, 0, 1, 0, 0, 0, 1, 0,
]);
const degenerate = new Float32Array([
  4, 4, 4, 4, 4, 4, 4, 4, 4,
]);
const combined = new Float32Array([...triangle, ...degenerate]);
const before = combined.slice();
const canonicalized = canonicalizeSkinRebuildArtifactPositions(combined);
assert.deepEqual(canonicalized.removedFaceIndices, [1]);
assert.deepEqual(Array.from(canonicalized.positions), Array.from(triangle));
assert.deepEqual(Array.from(combined), Array.from(before), "canonicalization must not mutate the snapshot buffer");

const staleReadiness = evaluateSkinRebuildArtifactExportAvailability({
  hasCurrentProject: true,
  bodyPositions: triangle,
  supportPositions: null,
  supportRequested: true,
  supportMeshable: null,
  selectedFormats: formats,
  warnings: ["Stage 7.5 stale", "Unsupported: 10", "accepted BODY collision: 0", "thin strut"],
});
assert.equal(staleReadiness.canExportArtifact, true, "readiness warnings must not block artifact export");
assert.equal(staleReadiness.technicalBlockReason, null);
assert.ok(staleReadiness.warnings.length >= 4);

const supportFailure = evaluateSkinRebuildArtifactExportAvailability({
  hasCurrentProject: true,
  bodyPositions: triangle,
  supportPositions: null,
  supportRequested: true,
  supportMeshable: false,
  selectedFormats: { ...formats, threeMf: false, supportStl: false },
});
assert.equal(supportFailure.canExportArtifact, true, "BODY-only formats remain selectable after Support failure");
assert.match(supportFailure.warnings.join("\n"), /BODY-only/);

const supportOnlyFailure = evaluateSkinRebuildArtifactExportAvailability({
  hasCurrentProject: true,
  bodyPositions: triangle,
  supportRequested: true,
  supportMeshable: false,
  selectedFormats: { ...formats, threeMf: false, bodyStl: false, obj: false, report: false },
});
assert.equal(supportOnlyFailure.canExportArtifact, false);
assert.match(supportOnlyFailure.technicalBlockReason ?? "", /Support/);

assert.equal(evaluateSkinRebuildArtifactExportAvailability({
  hasCurrentProject: false,
  bodyPositions: null,
  supportRequested: false,
  supportMeshable: null,
  selectedFormats: formats,
}).canExportArtifact, false);
assert.equal(evaluateSkinRebuildArtifactExportAvailability({
  hasCurrentProject: true,
  bodyPositions: null,
  bodyGenerationAvailable: true,
  supportRequested: false,
  supportMeshable: null,
  selectedFormats: formats,
}).canExportArtifact, true, "current project can use export-only BODY generation");
assert.throws(() => canonicalizeSkinRebuildArtifactPositions(new Float32Array([0, 0, 0])), /structurally broken/);
assert.throws(() => canonicalizeSkinRebuildArtifactPositions(new Float32Array([0, 0, 0, Infinity, 0, 0, 0, 1, 0])), /non-finite/);

console.log("artifactExport: warnings-only readiness, support BODY-only fallback, deterministic degenerates and technical blocks passed");
