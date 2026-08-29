/** Detached Risk-Driven Permanent Internal Lattice v0 BODY builder. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import {
  encodeBinaryStl,
  inspectSavedStlTopology,
  orientMeshForSavedStl,
  type Triangle,
} from "../src/studies/cloud-sculpt/meshExport.ts";
import {
  buildSkinMesh,
  computeSkinMeshSamplingGrid,
} from "../src/studies/skin/meshExport.ts";
import {
  deriveRiskDrivenInternalLattice,
} from "../src/studies/skin/riskDrivenInternalLattice.ts";
import {
  buildRiskDrivenPermanentLatticePlan,
} from "../src/studies/skin/riskDrivenPermanentLattice.ts";
import type { InternalStructureGraph } from "../src/studies/skin/voronoi.ts";

interface CanonicalRequest {
  mode: "plate" | "window";
  host: Array<{ id: number; x: number; y: number; z: number; r: number }>;
  hostK: number;
  thickness: number;
  patches: unknown[];
  internalGraph: InternalStructureGraph;
  roundK: number;
  coinBulge: number;
  coinBulgeBalance?: number;
  quadMeshJoinWidth?: number;
  targetLongestMm: number;
  resolution: number;
}

const inputPath = resolve(process.argv[2] ?? "/tmp/skin-current-canonical-gate-request-20260829.json");
const outputDir = resolve(process.argv[3] ?? "/tmp/skin-risk-driven-lattice-v0-res128");
const base = "skin-risk-driven-internal-lattice-v0-res128";

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function positionsFromTriangles(triangles: readonly Triangle[]): Float32Array {
  const output = new Float32Array(triangles.length * 9);
  let cursor = 0;
  for (const triangle of triangles) {
    for (const point of [triangle.a, triangle.b, triangle.c]) {
      output[cursor++] = point.x;
      output[cursor++] = point.y;
      output[cursor++] = point.z;
    }
  }
  return output;
}

function topologyPass(report: ReturnType<typeof inspectSavedStlTopology>): boolean {
  return report.connectedComponents === 1
    && report.closed
    && report.openEdges === 0
    && report.nonManifoldEdges === 0
    && report.degenerateTriangleCount === 0
    && report.nonFiniteTriangleCount === 0
    && report.windingInconsistentEdges === 0;
}

const startedAt = Date.now();
const raw = new Uint8Array(readFileSync(inputPath));
const canonical = JSON.parse(Buffer.from(raw).toString("utf8")) as CanonicalRequest;
if (canonical.internalGraph?.nodes.length !== 2475 || canonical.internalGraph?.edges.length !== 2404) {
  throw new Error(`Fail closed: expected current canonical Graph 2475/2404, got ${canonical.internalGraph?.nodes.length}/${canonical.internalGraph?.edges.length}`);
}
if (canonical.targetLongestMm !== 80) throw new Error("Fail closed: targetLongestMm is not 80");

const surfaceResolution = 48;
const surfaceStartedAt = Date.now();
const surface = buildSkinMesh(
  canonical.mode,
  canonical.host,
  canonical.hostK,
  canonical.thickness,
  canonical.patches as never,
  canonical.roundK,
  { resolution: surfaceResolution, targetLongestMm: canonical.targetLongestMm },
  canonical.coinBulge,
  canonical.quadMeshJoinWidth ?? 0,
  canonical.coinBulgeBalance ?? 0,
  null,
);
const grid = computeSkinMeshSamplingGrid({
  mode: canonical.mode,
  host: canonical.host,
  hostK: canonical.hostK,
  thickness: canonical.thickness,
  patches: canonical.patches as never,
  roundK: canonical.roundK,
  options: { resolution: surfaceResolution, targetLongestMm: canonical.targetLongestMm },
  coinBulge: canonical.coinBulge,
  quadMeshJoinWidth: canonical.quadMeshJoinWidth ?? 0,
  coinBulgeBalance: canonical.coinBulgeBalance ?? 0,
  internalGraph: null,
});
const thresholdDeg = 45;
const facts = deriveRiskDrivenInternalLattice({
  surfacePositions: positionsFromTriangles(surface.triangles),
  thresholdDeg,
  meshStep: grid.bounds.longest / grid.resolution,
  resolution: surfaceResolution,
});
if (facts.status !== "current") throw new Error(`Fail closed: Surface risk diagnosis unavailable: ${facts.reason}`);
const planned = buildRiskDrivenPermanentLatticePlan({
  riskFacts: facts,
  surfacePositions: positionsFromTriangles(surface.triangles),
  canonicalGraph: canonical.internalGraph,
  scaleMmPerUnit: surface.scaleMmPerUnit,
  maxCandidates: 12,
  diameterMm: 2.2,
});
if (planned.status !== "current") throw new Error(`Fail closed: ${planned.reason}`);
const augmented = planned.augmentedGraph;
const canonicalStill = canonical.internalGraph.nodes.length === 2475 && canonical.internalGraph.edges.length === 2404;
if (!canonicalStill) throw new Error("Fail closed: canonical Graph was mutated");

const meshStartedAt = Date.now();
const built = buildSkinMesh(
  canonical.mode,
  canonical.host,
  canonical.hostK,
  canonical.thickness,
  canonical.patches as never,
  canonical.roundK,
  { resolution: 128, targetLongestMm: canonical.targetLongestMm },
  canonical.coinBulge,
  canonical.quadMeshJoinWidth ?? 0,
  canonical.coinBulgeBalance ?? 0,
  augmented,
);
const topologyBefore = inspectSavedStlTopology(built.triangles, built.scaleMmPerUnit);
const repaired = orientMeshForSavedStl(built);
const topology = inspectSavedStlTopology(repaired.triangles, repaired.scaleMmPerUnit);
if (!topologyPass(topology)) {
  throw new Error(`Fail closed: resolution 128 saved topology did not pass: ${JSON.stringify(topology)}`);
}
const savedDiameterMm = planned.graph.nodes[0]?.radius * 2 * repaired.scaleMmPerUnit;
const savedEdgeLengthsMm = planned.graph.edges.map((edge) => {
  const start = planned.graph.nodes[edge.start]?.position;
  const end = planned.graph.nodes[edge.end]?.position;
  if (!start || !end) throw new Error("Fail closed: saved lattice edge endpoint is missing");
  return Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z) * repaired.scaleMmPerUnit;
});
const savedMaxEdgeLengthMm = Math.max(...savedEdgeLengthsMm);
if (!(savedDiameterMm >= 2 && savedDiameterMm <= 2.5) || !(savedMaxEdgeLengthMm <= 5)) {
  throw new Error(`Fail closed: saved-scale lattice dimensions are outside contract: diameter=${savedDiameterMm}, maxEdge=${savedMaxEdgeLengthMm}`);
}

mkdirSync(outputDir, { recursive: true });
const stlPath = resolve(outputDir, `${base}.stl`);
const planPath = resolve(outputDir, `${base}.plan.json`);
const validationPath = resolve(outputDir, `${base}.validation.json`);
const stl = new Uint8Array(encodeBinaryStl(repaired, basename(stlPath)));
const planDocument = {
  schema: "katachi.skin.risk-driven-permanent-lattice-plan.v0",
  reviewOnly: true,
  printApproval: false,
  automaticSupport: false,
  removableSupport: false,
  canonicalRequest: { path: inputPath, sha256: sha256(raw), graphNodes: 2475, graphEdges: 2404 },
  surfaceDiagnosis: {
    resolution: surfaceResolution,
    thresholdDeg,
    riskClusters: facts.clusters.length,
    riskyFaces: facts.riskyFaceCount,
    riskyAreaProxySource: facts.riskyArea,
    safeAnchorCandidates: planned.diagnostics.safeSurfaceFaceCount,
    elapsedMs: meshStartedAt - surfaceStartedAt,
  },
  lattice: planned,
};
const planJson = JSON.stringify(planDocument, null, 2) + "\n";
writeFileSync(planPath, planJson, "utf8");
writeFileSync(stlPath, stl);
const validation = {
  schema: "katachi.skin.risk-driven-permanent-lattice-body.v0",
  artifactKind: "detached-risk-driven-permanent-lattice-body",
  reviewOnly: true,
  printApproval: false,
  notForPrint: true,
  automaticSupport: false,
  removableSupport: false,
  slicerDiagnosis: "not-run",
  floatingRegions: "not-evaluated",
  resolution: 128,
  targetLongestMm: canonical.targetLongestMm,
  canonicalGraph: { nodes: 2475, edges: 2404 },
  augmentedGraph: { nodes: augmented.nodes.length, edges: augmented.edges.length },
  lattice: {
    groups: planned.spines.length,
    sharedGroups: planned.diagnostics.sharedSpineCount,
    nodes: planned.graph.nodes.length,
    edges: planned.graph.edges.length,
    selectedCandidates: planned.selectedCandidates.length,
    selectedRiskClusters: planned.selectedCandidates.map((candidate) => candidate.riskClusterId),
    affectedRiskAreaProxy: planned.selectedCandidates.reduce((sum, candidate) => sum + candidate.affectedRiskArea, 0),
    totalLengthMm: planned.graph.edges.reduce((sum, edge) => sum + edge.physicalLengthMm, 0),
    nominalDiameterMm: planned.diameterMm,
    savedDiameterMm,
    nominalMaxEdgeLengthMm: Math.max(...planned.graph.edges.map((edge) => edge.physicalLengthMm)),
    savedMaxEdgeLengthMm,
    maxAngleFromVerticalDeg: Math.max(...planned.graph.edges.map((edge) => edge.angleFromVerticalDeg)),
  },
  mesh: {
    triangleCount: repaired.triangles.length,
    scaleMmPerUnit: repaired.scaleMmPerUnit,
    topologyBefore,
    topology,
    elapsedMs: Date.now() - meshStartedAt,
  },
  hashes: {
    canonicalRequestSha256: sha256(raw),
    planSha256: sha256(planJson),
    stlSha256: sha256(stl),
  },
  outputs: { stl: stlPath, plan: planPath, validation: validationPath },
  totalElapsedMs: Date.now() - startedAt,
};
const validationJson = JSON.stringify(validation, null, 2) + "\n";
writeFileSync(validationPath, validationJson, "utf8");
writeFileSync(`${validationPath}.sha256`, `${sha256(validationJson)}  ${basename(validationPath)}\n`, "utf8");
console.log(JSON.stringify({ ...validation, hashes: { ...validation.hashes, validationSha256: sha256(validationJson) } }, null, 2));
