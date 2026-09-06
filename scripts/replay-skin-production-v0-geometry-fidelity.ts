import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { encodeBinaryStl, orientMeshForSavedStl, type MeshBuildResult } from "../src/studies/cloud-sculpt/meshExport.ts";
import { parseSkinRebuildFkei, projectFromSkinRebuildFkei } from "../src/studies/skin/rebuild/fkei.ts";
import type { SkinRebuildProject } from "../src/studies/skin/rebuild/model.ts";
import {
  DEFAULT_SKIN_PRODUCTION_V0_GEOMETRY_POLICY,
  buildSkinProductionV0FromProject,
  productionV0Fingerprint,
} from "../src/studies/skin/rebuild/productionV0.ts";
import type { InternalStructureGraph, Vector3Value } from "../src/studies/skin/voronoi.ts";

const FKEI = process.argv[2] ?? "C:/Users/as/Downloads/skin-rebuild-complete-2026-09-06T01-16-12-040Z.fkei";
const OUT = process.argv[3] ?? "J:/My Drive/codex/2026-09-06/files-pasted-by-the-user-temporary/outputs/production-v0-geometry-fidelity-fix-v0";
const RESEARCH = "J:/My Drive/codex/2026-09-06/files-pasted-by-the-user-skin-2/outputs";
const M_ROOT = `${RESEARCH}/astra-c-round2`;
const MR_ROOT = `${RESEARCH}/astra-c-round4-mr-control`;

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
}

function hashValue(value: unknown): string {
  return sha256(stable(value));
}

function distance(a: Vector3Value, b: Vector3Value): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function graphSummary(graph: InternalStructureGraph, scale: number) {
  const parent = graph.nodes.map((_, index) => index);
  const find = (node: number): number => {
    let root = node;
    while (parent[root] !== root) root = parent[root];
    while (parent[node] !== node) {
      const next = parent[node]; parent[node] = root; node = next;
    }
    return root;
  };
  const degrees = graph.nodes.map(() => 0);
  const lengths: number[] = [];
  for (const edge of graph.edges) {
    const first = find(edge.start); const second = find(edge.end);
    if (first !== second) parent[second] = first;
    degrees[edge.start]++; degrees[edge.end]++;
    lengths.push(distance(graph.nodes[edge.start].position, graph.nodes[edge.end].position) * scale);
  }
  const components = new Set(graph.nodes.map((_, index) => find(index))).size;
  const histogram: Record<string, number> = {};
  for (const degree of degrees) histogram[String(degree)] = (histogram[String(degree)] ?? 0) + 1;
  return {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    components,
    cycleRank: graph.edges.length - graph.nodes.length + components,
    totalLengthMm: lengths.reduce((sum, value) => sum + value, 0),
    maxEdgeLengthMm: lengths.length > 0 ? Math.max(...lengths) : 0,
    meanDegree: degrees.reduce((sum, value) => sum + value, 0) / Math.max(1, degrees.length),
    maxDegree: degrees.length > 0 ? Math.max(...degrees) : 0,
    degreeHistogram: histogram,
    radiusMm: [...new Set(graph.edges.map((edge) => Number((edge.radius * scale).toFixed(9))))],
    graphFingerprint: hashValue(graph),
  };
}

function stl(mesh: MeshBuildResult, name: string): Uint8Array {
  return new Uint8Array(encodeBinaryStl(orientMeshForSavedStl(mesh), name));
}

function bodyStage(mesh: MeshBuildResult, diagnostics: ReturnType<typeof buildSkinProductionV0FromProject>["diagnosticsBefore"], fingerprint: string) {
  return {
    faces: diagnostics.body.triangleCount,
    volumeMm3: diagnostics.body.volumeMm3,
    boundsMm: diagnostics.body.boundsMm,
    connectedComponents: diagnostics.body.connectedComponents,
    topology: diagnostics.body.topology,
    scaleMmPerSource: mesh.scaleMmPerUnit,
    bodyFingerprint: fingerprint,
  };
}

function researchRow(label: string, root: string, id: string) {
  const mesh = JSON.parse(readFileSync(`${root}/evidence/${id}.mesh.json`, "utf8"));
  const analysisPath = `${root}/evidence/${id}.analysis.json`;
  const diagnosticsPath = `${root}/diagnostics/${id}.analysis.json`;
  const analysis = JSON.parse(readFileSync(label === "Research M-R" ? diagnosticsPath : analysisPath, "utf8"));
  const graph = JSON.parse(readFileSync(`${root}/geometry/${id}.graph.json`, "utf8")) as InternalStructureGraph;
  return {
    stage: label,
    faces: mesh.faces,
    volumeMm3: analysis.mesh.signed_volume_mm3,
    boundsXmm: mesh.mmBounds.size.x,
    boundsYmm: mesh.mmBounds.size.y,
    boundsZmm: mesh.mmBounds.size.z,
    graphNodes: graph.nodes.length,
    graphEdges: graph.edges.length,
    graphCycleRank: graph.edges.length - graph.nodes.length + 1,
    scaleMmPerSource: mesh.scaleMmPerUnit,
    bodyFingerprint: sha256(readFileSync(`${root}/geometry/${id}.stl`)),
  };
}

function csv(rows: Array<Record<string, unknown>>): string {
  const fields = Object.keys(rows[0]);
  const encode = (value: unknown): string => {
    const text = value === undefined || value === null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return `${fields.join(",")}\n${rows.map((row) => fields.map((field) => encode(row[field])).join(",")).join("\n")}\n`;
}

const inputBytes = readFileSync(FKEI);
const inputFingerprint = sha256(inputBytes);
const source = projectFromSkinRebuildFkei(parseSkinRebuildFkei(inputBytes.toString("utf8")));
const inputIdentity = {
  host: hashValue(source.base),
  motifs: hashValue(source.patterns),
  motifTransforms: hashValue(source.patternSides.map((side) => ({ patchId: side.patchId, surfacePosition: side.surfacePosition }))),
  support: hashValue(source.printSupport),
};
const first = buildSkinProductionV0FromProject(source);
const second = buildSkinProductionV0FromProject(source);
const p1Bytes = stl(first.analysisMeshBeforeRepair, "production-v0-fidelity-P1");
const p3Bytes = stl(first.analysisMesh, "production-v0-fidelity-P3");
const p1Fingerprint = sha256(p1Bytes);
const p3Fingerprint = sha256(p3Bytes);
const outputIdentity = {
  host: hashValue(first.project.base),
  motifs: hashValue(first.project.patterns),
  motifTransforms: hashValue(first.project.patternSides.map((side) => ({ patchId: side.patchId, surfacePosition: side.surfacePosition }))),
  support: hashValue(first.project.printSupport),
};
const deterministic = {
  runtimeFingerprintMatch: productionV0Fingerprint(first) === productionV0Fingerprint(second),
  graphFingerprintMatch: hashValue(first.project.finalGraph) === hashValue(second.project.finalGraph),
  bodyFingerprintMatch: first.provenance.diagnostics.bodyGeometryHash === second.provenance.diagnostics.bodyGeometryHash,
  diagnosticsMatch: hashValue(first.diagnosticsAfter) === hashValue(second.diagnosticsAfter),
};

assert.equal(inputFingerprint, "791e47f7b94cdd667516f44d0c2f731d6326fb7949a47cd785189e2eb3963276");
assert.equal(outputIdentity.host, inputIdentity.host, "Host must be immutable");
assert.equal(outputIdentity.motifs, inputIdentity.motifs, "Motifs must be immutable");
assert.equal(outputIdentity.motifTransforms, inputIdentity.motifTransforms, "Motif transforms must be immutable");
assert.equal(first.project.printSupport.edges.length, 0,
  "Production Stage 6 must clear legacy removable Support before current Stage 8 generation");
assert.equal(first.provenance.repair.motifRelocationCount, 0);
assert.ok(Object.values(deterministic).every(Boolean), "Production v0 replay must be deterministic");
assert.equal(first.diagnosticsBefore.body.connectedComponents, 1);
assert.equal(first.diagnosticsAfter.body.connectedComponents, 1);
assert.equal(first.diagnosticsBefore.body.topology.closed, true);
assert.equal(first.diagnosticsAfter.body.topology.closed, true);
assert.equal(first.diagnosticsBefore.body.topology.nonManifoldEdges, 0);
assert.equal(first.diagnosticsAfter.body.topology.nonManifoldEdges, 0);

mkdirSync(`${OUT}/geometry`, { recursive: true });
mkdirSync(`${OUT}/images`, { recursive: true });
writeFileSync(`${OUT}/geometry/production-P1-before-repair.stl`, p1Bytes);
writeFileSync(`${OUT}/geometry/production-P3-final-native.stl`, p3Bytes);
writeFileSync(`${OUT}/geometry/production-P1.graph.json`, `${JSON.stringify(first.projectBeforeRepair.finalGraph, null, 2)}\n`);
writeFileSync(`${OUT}/geometry/production-P3.graph.json`, `${JSON.stringify(first.project.finalGraph, null, 2)}\n`);

const p1Graph = graphSummary(first.projectBeforeRepair.finalGraph, first.analysisMeshBeforeRepair.scaleMmPerUnit);
const p3Graph = graphSummary(first.project.finalGraph, first.analysisMesh.scaleMmPerUnit);
const manifest = {
  schema: "katachi.skin-production-v0.geometry-fidelity-replay.v1",
  date: "2026-09-06",
  source: {
    repository: "J:/My Drive/codex/2026-09-06/skin-production-v0-geometry-fidelity-fix-v0-work",
    branch: "agent/skin-production-v0-geometry-fidelity-fix-v0",
    base: "19c539f86e87ae033a8f6317fac6836a217922be",
    commitCreated: false,
  },
  input: { path: FKEI, fingerprint: inputFingerprint, hostCount: source.base.host.length, motifCount: source.patterns.length },
  policy: first.provenance.geometryPolicy,
  stages: [
    { id: "P0", name: "Host + Motifs", inputIdentity },
    { id: "P1", name: "Local Relay Graph / BODY before repair", graph: p1Graph, body: bodyStage(first.analysisMeshBeforeRepair, first.diagnosticsBefore, p1Fingerprint) },
    { id: "P2", name: "Graph after bounded repair", graph: p3Graph, repair: first.provenance.repair },
    { id: "P3", name: "Final native BODY", graph: p3Graph, body: bodyStage(first.analysisMesh, first.diagnosticsAfter, p3Fingerprint) },
  ],
  invariants: {
    hostIdentity: inputIdentity.host === outputIdentity.host,
    motifIdentity: inputIdentity.motifs === outputIdentity.motifs,
    motifTransforms: inputIdentity.motifTransforms === outputIdentity.motifTransforms,
    motifRelocation: first.provenance.repair.motifRelocationCount,
    legacyRemovableSupportCleared: first.project.printSupport.edges.length === 0,
  },
  deterministic,
  research: {
    M: `${M_ROOT}/geometry/M.stl`,
    MR: `${MR_ROOT}/geometry/M-R.stl`,
    comparisonMeaning: "same generative family and intended BODY contract; byte identity is not required",
  },
};
writeFileSync(`${OUT}/pipeline-stage-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(`${OUT}/validation.json`, `${JSON.stringify({ status: "PASS", deterministic, invariants: manifest.invariants, P1: manifest.stages[1], P3: manifest.stages[3] }, null, 2)}\n`);
writeFileSync(`${OUT}/parameter-diff.json`, `${JSON.stringify({
  before: {
    sourceToMmScale: 17.66992511297614,
    graphRadiusMm: [1.447166867],
    graph: { nodes: 251, edges: 335, cycleRank: 85 },
    quadMeshJoinWidthSource: null,
    meshResolution: 48,
  },
  after: {
    sourceToMmScale: first.provenance.geometryPolicy.sourceToMmScale,
    memberRadiusSource: first.provenance.geometryPolicy.memberRadiusSource,
    memberRadiusMm: first.provenance.geometryPolicy.memberRadiusSource * first.provenance.geometryPolicy.sourceToMmScale,
    graph: p1Graph,
    quadMeshJoinWidthSource: first.provenance.geometryPolicy.quadMeshJoinWidthSource,
    meshResolution: first.provenance.geometryPolicy.meshResolution,
  },
  authority: "Research M / M-R contract and geometry-fidelity audit; no numeric target fitting",
}, null, 2)}\n`);

const researchM = researchRow("Research M", M_ROOT, "M");
const researchMR = researchRow("Research M-R", MR_ROOT, "M-R");
const p1Body = manifest.stages[1].body!;
const p3Body = manifest.stages[3].body!;
const rows: Array<Record<string, unknown>> = [
  researchM,
  researchMR,
  { stage: "Fixed Production P1", faces: p1Body.faces, volumeMm3: p1Body.volumeMm3, boundsXmm: p1Body.boundsMm.x, boundsYmm: p1Body.boundsMm.y, boundsZmm: p1Body.boundsMm.z, graphNodes: p1Graph.nodes, graphEdges: p1Graph.edges, graphCycleRank: p1Graph.cycleRank, scaleMmPerSource: p1Body.scaleMmPerSource, bodyFingerprint: p1Body.bodyFingerprint },
  { stage: "Fixed Production P3", faces: p3Body.faces, volumeMm3: p3Body.volumeMm3, boundsXmm: p3Body.boundsMm.x, boundsYmm: p3Body.boundsMm.y, boundsZmm: p3Body.boundsMm.z, graphNodes: p3Graph.nodes, graphEdges: p3Graph.edges, graphCycleRank: p3Graph.cycleRank, scaleMmPerSource: p3Body.scaleMmPerSource, bodyFingerprint: p3Body.bodyFingerprint },
];
writeFileSync(`${OUT}/comparison.csv`, csv(rows));
writeFileSync(`${OUT}/REPORT.md`, `# C Production v0 Geometry Fidelity Fix Evidence\n\n` +
  `Generated 2026-09-06 from the immutable C0 FKEI. This report records geometry evidence only; artwork acceptance remains with C SOL / Author.\n\n` +
  `- Host identity: PASS\n- Motif identity and transforms: PASS\n- Motif relocation: 0\n- Legacy Removable Support cleared: PASS (current Stage 8 required)\n- Deterministic replay: PASS\n` +
  `- P1: ${p1Body.faces} faces, ${p1Body.volumeMm3.toFixed(6)} mm³, ${p1Graph.nodes}/${p1Graph.edges}, fingerprint ${p1Body.bodyFingerprint}\n` +
  `- P3: ${p3Body.faces} faces, ${p3Body.volumeMm3.toFixed(6)} mm³, ${p3Graph.nodes}/${p3Graph.edges}, fingerprint ${p3Body.bodyFingerprint}\n\n` +
  `Research M and M-R are compared in comparison.csv and the same-view images. Exact byte identity is not required. Support, 3MF export, deployment, and physical gates were not touched.\n`);

console.log(JSON.stringify({ output: OUT, P1: manifest.stages[1], P3: manifest.stages[3], deterministic, invariants: manifest.invariants }, null, 2));
