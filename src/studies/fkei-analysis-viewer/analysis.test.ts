import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeVoid } from "./voidAnalysis.ts";
import { buildViewerArtifact, verifyReadOnlyIdentity } from "./fkeiAdapter.ts";
import { graphMetrics, permanentGraphOnly } from "./analysis.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");
const samplePath = join(REPO_ROOT, "public", "samples", "skin-rebuild-first-print.fkei");
const sampleText = readFileSync(samplePath, "utf8");

// T1 — read-only identity across the four representation derivations.
const artifact = buildViewerArtifact(sampleText, "skin-rebuild-first-print.fkei");
const identityBefore = artifact.canonicalSerialization;
for (const representation of ["Geometry", "Graph", "Surface", "Void", "Geometry"]) {
  if (representation === "Graph") graphMetrics(permanentGraphOnly(artifact.runtime.project));
  if (representation === "Surface") artifact.surface.triangles.length;
  if (representation === "Void") artifact.voidAnalysis.componentCount;
}
assert.equal(artifact.canonicalSerialization, identityBefore, "view derivations must not rewrite canonical FKEI serialization");
assert.equal(verifyReadOnlyIdentity(artifact), true, "canonical identity must remain unchanged after all view derivations");

// T2 — Permanent Graph excludes the source FKEI's removable Support graph.
assert.ok(artifact.sourceProject.printSupport.edges.length > 0, "fixture must contain removable support for the isolation test");
const permanent = permanentGraphOnly(artifact.runtime.project);
assert.equal(artifact.runtime.project.printSupport.edges.length, 0, "current Production runtime must not install removable Support into Permanent Graph");
assert.ok(permanent.edges.length > 0, "Permanent Artwork Structure must remain available");
assert.notStrictEqual(permanent, artifact.runtime.project.printSupport, "Permanent Graph and Removable Support must be separate objects");

// T3 — known graph: one component, five edges, four nodes => β1 = 2.
const knownGraph = {
  kind: "targetedGrid" as const,
  nodes: [0, 1, 2, 3].map((id) => ({ id, position: { x: id, y: 0, z: 0 }, radius: 0.1 })),
  edges: [
    { id: 0, start: 0, end: 1, radius: 0.1 },
    { id: 1, start: 1, end: 2, radius: 0.1 },
    { id: 2, start: 2, end: 3, radius: 0.1 },
    { id: 3, start: 3, end: 0, radius: 0.1 },
    { id: 4, start: 0, end: 2, radius: 0.1 },
  ],
  stats: { inputPoints: 0, delaunayTetrahedra: 0, candidateEdges: 0, clippedEdges: 0, removedShortEdges: 0, removedOutsideEdges: 0, removedIsolatedEdges: 0 },
};
assert.deepEqual(
  graphMetrics(knownGraph),
  { nodes: 4, edges: 5, junctions: 2, components: 1, cycleRank: 2 },
  "graph metrics must match the known topology",
);

// T4 — analytic Host cube minus full-height slab: two Host/Base-boundary-connected components.
const cubeBounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 }, size: { x: 1, y: 1, z: 1 }, longest: 1 };
const analyticVoid = analyzeVoid({
  bounds: cubeBounds,
  resolution: 8,
  insideHost: (x, y, z) => x >= 0 && x <= 1 && y >= 0 && y <= 1 && z >= 0 && z <= 1,
  insideFinalBody: (x, y, z) => x >= 0.375 && x <= 0.625 && y >= 0 && y <= 1 && z >= 0 && z <= 1,
});
assert.equal(analyticVoid.componentCount, 2, "analytic slab must split the Void into two components");
assert.equal(analyticVoid.boundaryConnectedComponentCount, 2, "both slab-side void components touch the Host/Base boundary");

// T5 — fixed-grid Void is deterministic.
const analyticVoidAgain = analyzeVoid({
  bounds: cubeBounds,
  resolution: 8,
  insideHost: (x, y, z) => x >= 0 && x <= 1 && y >= 0 && y <= 1 && z >= 0 && z <= 1,
  insideFinalBody: (x, y, z) => x >= 0.375 && x <= 0.625 && y >= 0 && y <= 1 && z >= 0 && z <= 1,
});
assert.deepEqual(analyticVoidAgain, analyticVoid, "same artifact functions and grid must produce identical Void analysis");

// T6 — Host boundary inside the sampling box: the old envelope-edge check would report 0,
// while the Host/Base-boundary definition must report the interior Host component.
const interiorHostBounds = { min: { x: -1, y: -1, z: -1 }, max: { x: 2, y: 2, z: 2 }, size: { x: 3, y: 3, z: 3 }, longest: 3 };
const interiorHostVoid = analyzeVoid({
  bounds: interiorHostBounds,
  resolution: 12,
  insideHost: (x, y, z) => x >= 0 && x <= 1 && y >= 0 && y <= 1 && z >= 0 && z <= 1,
  insideFinalBody: () => false,
});
assert.equal(interiorHostVoid.componentCount, 1, "interior Host fixture must contain one Void component");
assert.equal(interiorHostVoid.boundaryConnectedComponentCount, 1, "interior Host boundary must be detected away from the sampling-box edge");

console.log("FKEI Analysis Viewer analysis tests passed", {
  schema: artifact.schema,
  graph: graphMetrics(permanent),
  voidComponents: artifact.voidAnalysis.componentCount,
});
