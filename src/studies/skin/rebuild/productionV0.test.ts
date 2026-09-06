import assert from "node:assert/strict";
import { fieldSdf } from "../../cloud-sculpt/field.ts";
import {
  DEFAULT_SKIN_REBUILD_SETTINGS,
} from "./model.ts";
import {
  DEFAULT_SKIN_PRODUCTION_V0_GEOMETRY_POLICY,
  DEFAULT_SKIN_PRODUCTION_V0_REPAIR_POLICY,
  buildSkinProductionV0,
  buildSkinProductionV0FromProject,
  productionV0Fingerprint,
} from "./productionV0.ts";

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
    for (const next of neighbours[current]) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen.size;
}

const settings = {
  ...DEFAULT_SKIN_REBUILD_SETTINGS,
  baseStretch: 3.1,
  patternCount: 24,
  analysisResolution: 30,
  exportResolution: 36,
};

const testGeometryPolicy = {
  ...DEFAULT_SKIN_PRODUCTION_V0_GEOMETRY_POLICY,
  meshResolution: 36,
};

const first = buildSkinProductionV0(settings, {
  ...DEFAULT_SKIN_PRODUCTION_V0_REPAIR_POLICY,
  maxPasses: 1,
  maxEdgeChangesPerPass: 1,
  diagnosticGridResolution: 8,
}, testGeometryPolicy);

assert.equal(first.provenance.seedPolicy, "motif-conditioned");
assert.equal(first.provenance.networkCore, "local-relay-permanent-network");
assert.equal(first.provenance.repairMechanism, "bounded-graph-only");
assert.equal(first.provenance.coEvolution, "not-implemented");
assert.equal(first.provenance.generatedNetwork.source, "research-m-local-route-contract");
assert.deepEqual(first.provenance.geometryPolicy, testGeometryPolicy);
assert.equal(first.analysisMesh.scaleMmPerUnit, DEFAULT_SKIN_PRODUCTION_V0_GEOMETRY_POLICY.sourceToMmScale);
assert.equal(first.analysisMeshBeforeRepair.scaleMmPerUnit, DEFAULT_SKIN_PRODUCTION_V0_GEOMETRY_POLICY.sourceToMmScale);
for (let index = 0; index < first.project.patternSides.length; index++) {
  const anchor = first.project.dryWeb.nodes[index];
  assert.ok(anchor, "every Motif has a stable leading Local Relay anchor");
  assert.ok(Math.abs(fieldSdf(
    first.project.base.host,
    first.project.base.hostK,
    anchor.position.x,
    anchor.position.y,
    anchor.position.z,
  ) + testGeometryPolicy.anchorDepthSource) <= 2e-6,
  "every Motif anchor follows the Research M Host-depth contract");
}
assert.ok(first.project.dryWeb.nodes.length >= first.project.patterns.length);
assert.equal(
  connectedNodeCount(first.project.dryWeb.nodes.length, first.project.dryWeb.edges),
  first.project.dryWeb.nodes.length,
  "Motif-conditioned Local Relay graph must connect every Motif",
);
assert.ok(first.project.dryWeb.edges.length >= first.project.dryWeb.nodes.length - 1);
assert.equal(first.project.dryWeb.edges.length - first.project.dryWeb.nodes.length + 1, 20,
  "Research M family retains the explicit cycle-rank contract");
assert.equal(first.project.lattice.edges.length, 0,
  "legacy Stage 5A lattice is not layered onto the Production v0 Local Relay network");
assert.deepEqual(first.project.finalGraph.nodes, first.project.dryWeb.nodes);
assert.deepEqual(first.project.finalGraph.edges, first.project.dryWeb.edges);
assert.ok(first.project.dryWeb.edges.every((edge) => edge.radius === 0.06));
assert.equal(first.provenance.repair.motifRelocationCount, 0);
assert.equal(first.diagnosticsBefore.motif.relocationCount, 0);
assert.equal(first.diagnosticsAfter.motif.relocationCount, 0);
assert.equal(first.diagnosticsBefore.body.source, "actual-native-body");
assert.equal(first.diagnosticsAfter.body.source, "actual-native-body");
assert.ok(first.diagnosticsAfter.body.triangleCount > 0);
assert.ok(first.diagnosticsAfter.body.volumeMm3 > 0);
assert.ok(first.provenance.repair.passes.length <= 1);

const second = buildSkinProductionV0(settings, {
  ...DEFAULT_SKIN_PRODUCTION_V0_REPAIR_POLICY,
  maxPasses: 1,
  maxEdgeChangesPerPass: 1,
  diagnosticGridResolution: 8,
}, testGeometryPolicy);
assert.equal(productionV0Fingerprint(second), productionV0Fingerprint(first),
  "same inputs, policy, and deterministic seed must reproduce the production graph/BODY contract");
assert.deepEqual(second.project.finalGraph, first.project.finalGraph);
assert.equal(second.provenance.diagnostics.bodyGeometryHash, first.provenance.diagnostics.bodyGeometryHash);

const authoredAdapter = buildSkinProductionV0FromProject(first.project, {
  ...DEFAULT_SKIN_PRODUCTION_V0_REPAIR_POLICY,
  maxPasses: 0,
  diagnosticGridResolution: 8,
}, testGeometryPolicy);
assert.deepEqual(authoredAdapter.project.base.host, first.project.base.host,
  "authored Host geometry must be preserved by the root-production adapter");
assert.deepEqual(authoredAdapter.project.patterns, first.project.patterns,
  "authored Motif geometry must be preserved by the root-production adapter");
assert.equal(authoredAdapter.project.lattice.edges.length, 0,
  "Production adapter replaces legacy permanent lattice with Local Relay");
assert.deepEqual(authoredAdapter.project.printSupport, first.project.printSupport,
  "existing removable support remains unchanged by production v0");
assert.equal(authoredAdapter.provenance.repair.motifRelocationCount, 0);
