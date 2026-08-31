import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildBambu3mf,
  parseBinaryStlPositions,
} from "../src/studies/skin/bambu3mf.ts";
import {
  buildSkinRebuildProject,
  createEmptySkinRebuildGraph,
  exportSkinRebuildStl,
  type SkinRebuildProject,
} from "../src/studies/skin/rebuild/model.ts";
import {
  captureSkinRebuildFkei,
  parseSkinRebuildFkei,
  projectFromSkinRebuildFkei,
  serializeSkinRebuildFkei,
} from "../src/studies/skin/rebuild/fkei.ts";
import {
  DEFAULT_SKIN_HOST_PARAMS,
  serializeRecipe,
  type SkinHistoryEntry,
} from "../src/studies/skin/history.ts";
import type { InternalStructureGraph } from "../src/studies/skin/voronoi.ts";
import manifest from "../src/studies/skin/manifest.json";

const GENERATED_AT = "2026-08-31T00:00:00.000Z";
const BASE_NAME = "skin-rebuild-print-002-support-free";
const BASELINE_FKEI_SHA256 = "4bacfcced0fe311eef704a792d61f4a68531051ff408e26d5ff2937b8bbfadcf";
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(process.argv[2] ?? resolve(repositoryRoot, "outputs"));
const baselineFkeiPath = resolve(repositoryRoot, "public/samples/skin-rebuild-first-print.fkei");
const baselineValidationPath = resolve(repositoryRoot, "public/samples/skin-rebuild-first-print.validation.json");

function fail(message: string): never {
  throw new Error(`Print #002 generation failed: ${message}`);
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function graphIdentity(graph: InternalStructureGraph): string {
  return JSON.stringify({
    kind: graph.kind,
    nodes: graph.nodes.map((node) => ({ id: node.id, position: node.position, radius: node.radius })),
    edges: graph.edges.map((edge) => ({ id: edge.id, start: edge.start, end: edge.end, radius: edge.radius })),
  });
}

function graphMetrics(graph: InternalStructureGraph, scaleMmPerUnit: number) {
  const adjacency = graph.nodes.map(() => [] as number[]);
  let totalEdgeLengthSource = 0;
  for (const edge of graph.edges) {
    const start = graph.nodes[edge.start];
    const end = graph.nodes[edge.end];
    check(start !== undefined && end !== undefined, `permanent Web edge #${edge.id} references a missing node`);
    adjacency[edge.start].push(edge.end);
    adjacency[edge.end].push(edge.start);
    totalEdgeLengthSource += Math.hypot(
      end.position.x - start.position.x,
      end.position.y - start.position.y,
      end.position.z - start.position.z,
    );
  }
  const visited = new Uint8Array(graph.nodes.length);
  let connectedComponents = 0;
  for (let seed = 0; seed < graph.nodes.length; seed++) {
    if (visited[seed]) continue;
    connectedComponents++;
    const stack = [seed];
    visited[seed] = 1;
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const next of adjacency[current]) {
        if (visited[next]) continue;
        visited[next] = 1;
        stack.push(next);
      }
    }
  }
  return {
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    connectedComponents,
    totalEdgeLengthSource,
    totalEdgeLengthMm: totalEdgeLengthSource * scaleMmPerUnit,
  };
}

function supportFreeGraph(): InternalStructureGraph {
  const graph = createEmptySkinRebuildGraph();
  // Keep the graph in the same typed shape as a newly generated support graph:
  // all support diagnostics are explicit zero facts, not omitted/unknown data.
  graph.stats.requestedTargets = 0;
  graph.stats.connectedTargets = 0;
  graph.stats.rejectedByBodyIntersection = 0;
  graph.stats.acceptedSupportCount = 0;
  graph.stats.unsupportedCount = 0;
  return graph;
}

function makeShapeRecipe(project: SkinRebuildProject): string {
  const entries: SkinHistoryEntry[] = [
    {
      t: 1,
      op: "loadHostFromS1Recipe",
      args: {
        balls: project.base.host.map((ball) => ({ ...ball })),
        params: {
          ...DEFAULT_SKIN_HOST_PARAMS,
          count: project.base.host.length,
          k: project.base.hostK,
        },
        source: BASE_NAME,
      },
    },
    { t: 2, op: "setSkinParam", args: { key: "thickness", value: project.settings.surfaceThickness } },
    { t: 3, op: "setSkinParam", args: { key: "roundK", value: project.settings.roundK } },
    { t: 4, op: "setSkinParam", args: { key: "internalStructure", value: "targetedGrid" } },
    {
      t: 5,
      op: "packPatches",
      args: {
        patches: project.patterns.map((patch) => ({
          ...patch,
          points: patch.points.map((point) => ({ ...point })),
        })),
        identity: "replace",
      },
    },
  ];
  const recipe = JSON.parse(serializeRecipe(entries)) as { exportedAt: string };
  recipe.exportedAt = GENERATED_AT;
  return JSON.stringify(recipe, null, 2);
}

function baselineComparison() {
  const baselineFkei = readFileSync(baselineFkeiPath);
  check(sha256(baselineFkei) === BASELINE_FKEI_SHA256, "immutable first-print FKEI SHA-256 changed");
  const baselineDocument = parseSkinRebuildFkei(baselineFkei.toString("utf8"));
  const baselineValidationText = readFileSync(baselineValidationPath, "utf8");
  const baselineValidation = JSON.parse(baselineValidationText) as {
    schema?: string;
    settings?: { targetLongestMm?: number; strutDiameterMm?: number };
    mesh?: { triangleCount?: number };
    printSupport?: { edgeCount?: number };
  };
  check(baselineValidation.schema === "katachi.skin-rebuild.first-print-validation.v1", "first-print validation schema changed");
  const facts = {
    targetLongestMm: baselineValidation.settings?.targetLongestMm,
    permanentWebDiameterMm: baselineValidation.settings?.strutDiameterMm,
    supportEdgeCount: baselineValidation.printSupport?.edgeCount,
    bodyTriangleCount: baselineValidation.mesh?.triangleCount,
    supportPresent: (baselineValidation.printSupport?.edgeCount ?? 0) > 0,
  };
  check(facts.targetLongestMm === 80, "first-print baseline target scale is not 80 mm");
  check(facts.permanentWebDiameterMm === 2.6, "first-print baseline permanent Web diameter is not 2.6 mm");
  check(facts.supportEdgeCount === 67, "first-print baseline support edge count is not 67");
  check(facts.bodyTriangleCount === 59_524, "first-print baseline BODY triangle count is not 59,524");
  check(facts.supportPresent, "first-print baseline is missing its support fact");
  check(baselineDocument.project.printSupport.edges.length === facts.supportEdgeCount, "first-print FKEI/support validation disagree");
  return {
    sourceValidation: "public/samples/skin-rebuild-first-print.validation.json",
    sourceValidationSha256: sha256(baselineValidationText),
    sourceFkeiSha256: BASELINE_FKEI_SHA256,
    ...facts,
  };
}

const generatorCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim().toLowerCase();
check(/^[0-9a-f]{40}$/.test(generatorCommit), "generator commit is not a full Git SHA");
const baseline = baselineComparison();
const built = buildSkinRebuildProject();
const sourceProject = built.project;
check(sourceProject.settings.targetLongestMm === 120, "default project target is not 120 mm");
check(sourceProject.settings.strutDiameterMm === 3.9, "default project permanent Web diameter is not 3.9 mm");
check(sourceProject.settings.supportDiameterMm === 1.6, "default project dormant support diameter is not 1.6 mm");

const candidateProject: SkinRebuildProject = {
  ...sourceProject,
  printSupport: supportFreeGraph(),
};
check(candidateProject.base === sourceProject.base, "candidate changed Base identity");
check(candidateProject.patterns === sourceProject.patterns, "candidate changed Motif identity");
check(candidateProject.patternSides === sourceProject.patternSides, "candidate changed Pattern-side identity");
check(candidateProject.lowestPoints === sourceProject.lowestPoints, "candidate changed lowest-point identity");
check(candidateProject.lattice === sourceProject.lattice, "candidate changed permanent lattice identity");
check(candidateProject.finalGraph === sourceProject.finalGraph, "candidate changed permanent finalGraph identity");
check(candidateProject.printSupport.nodes.length === 0 && candidateProject.printSupport.edges.length === 0, "candidate support graph is not empty");

const document = captureSkinRebuildFkei(candidateProject, {
  savedAt: GENERATED_AT,
  appVersion: manifest.version,
  generatorCommit,
  shapeRecipe: makeShapeRecipe(candidateProject),
});
const fkei = serializeSkinRebuildFkei(document);
const restored = projectFromSkinRebuildFkei(parseSkinRebuildFkei(fkei));
check(restored.printSupport.kind === "targetedGrid", "round-tripped support graph kind changed");
check(restored.printSupport.nodes.length === 0 && restored.printSupport.edges.length === 0, "FKEI roundtrip retained removable support geometry");
check(restored.printSupport.stats.requestedTargets === 0, "round-tripped support requestedTargets is not zero");
check(restored.printSupport.stats.connectedTargets === 0, "round-tripped support connectedTargets is not zero");
check(restored.printSupport.stats.rejectedByBodyIntersection === 0, "round-tripped support rejection count is not zero");
check(restored.printSupport.stats.acceptedSupportCount === 0, "round-tripped support accepted count is not zero");
check(restored.printSupport.stats.unsupportedCount === 0, "round-tripped support unsupported count is not zero");
check(graphIdentity(restored.finalGraph) === graphIdentity(candidateProject.finalGraph), "FKEI roundtrip changed permanent finalGraph nodes/edges");

const artifact = exportSkinRebuildStl(restored, `${BASE_NAME}.stl`, restored.settings.exportResolution);
const stl = new Uint8Array(artifact.stl);
const bodyPositions = parseBinaryStlPositions(artifact.stl);
check(bodyPositions.length === artifact.mesh.triangles.length * 9, "BODY STL triangle count does not match exported mesh");
check(artifact.topology.ok, "BODY STL topology is not watertight");
check(artifact.topology.connectedComponents === 1, "BODY STL has more than one connected component");
check(artifact.topology.nonManifoldEdges === 0, "BODY STL has non-manifold edges");
check(artifact.topology.degenerateTriangleCount === 0, "BODY STL has degenerate triangles");

const bodyGraph = graphMetrics(restored.finalGraph, artifact.mesh.scaleMmPerUnit);
const permanentWeb = {
  ...bodyGraph,
  latticeNodeCount: restored.lattice.nodes.length,
  latticeEdgeCount: restored.lattice.edges.length,
};
const threeMfResult = await buildBambu3mf([
  { name: "SKIN_REBUILD_ARTWORK", role: "body", positions: bodyPositions },
], {
  title: BASE_NAME,
  supportType: "normal(manual)",
  date: "2026-08-31",
  generatorVersion: manifest.version,
  mergePrintableSupportIntoBody: false,
});
check(threeMfResult.stats.bodyFaces > 0, "BODY-only 3MF has no BODY faces");
check(threeMfResult.stats.scaffoldFaces === 0, "BODY-only 3MF contains printable support faces");
check(threeMfResult.stats.enforcerFaces === 0 && threeMfResult.stats.blockerFaces === 0, "BODY-only 3MF contains a support modifier volume");
const threeMf = new Uint8Array(threeMfResult.archive);

const bodyTopology = {
  watertight: artifact.topology.ok,
  components: artifact.topology.connectedComponents,
  nonManifoldEdges: artifact.topology.nonManifoldEdges,
  degenerateTriangles: artifact.topology.degenerateTriangleCount,
  openEdges: artifact.topology.openEdges,
  windingInconsistentEdges: artifact.topology.windingInconsistentEdges,
};
const validation = {
  schema: "katachi.skin-rebuild.support-free-print-002-validation.v1",
  generatedAt: GENERATED_AT,
  generatorCommit,
  appVersion: manifest.version,
  algorithmVersion: restored.algorithmVersion,
  printApproval: false,
  slicerPreview: "not-run",
  physicalPrint: "not-run",
  source: "buildSkinRebuildProject() with DEFAULT_SKIN_REBUILD_SETTINGS; printSupport replaced only by an empty typed Graph",
  settings: restored.settings,
  motifCount: restored.patterns.length,
  permanentWeb,
  audit: {
    overhangTargetCount: restored.audit.overhangTargetCount,
    supportedTargetCount: restored.audit.supportedTargetCount,
    unsupportedTargetCount: restored.audit.unsupportedTargetCount,
  },
  body: {
    resolution: restored.settings.exportResolution,
    triangleCount: artifact.mesh.triangles.length,
    boundsMm: artifact.mesh.mmBounds,
    scaleMmPerUnit: artifact.mesh.scaleMmPerUnit,
    topology: bodyTopology,
  },
  removableSupport: {
    mode: "off",
    nodeCount: restored.printSupport.nodes.length,
    edgeCount: restored.printSupport.edges.length,
    triangleCount: 0,
    artifactAbsent: true,
    graphStats: {
      inputPoints: restored.printSupport.stats.inputPoints,
      candidateEdges: restored.printSupport.stats.candidateEdges,
      requestedTargets: restored.printSupport.stats.requestedTargets,
      connectedTargets: restored.printSupport.stats.connectedTargets,
      rejectedByBodyIntersection: restored.printSupport.stats.rejectedByBodyIntersection,
      acceptedSupportCount: restored.printSupport.stats.acceptedSupportCount,
      unsupportedCount: restored.printSupport.stats.unsupportedCount,
    },
  },
  print001Comparison: {
    ...baseline,
    print002: {
      targetLongestMm: restored.settings.targetLongestMm,
      permanentWebDiameterMm: restored.settings.strutDiameterMm,
      supportEdgeCount: restored.printSupport.edges.length,
      bodyTriangleCount: artifact.mesh.triangles.length,
      supportPresent: false,
    },
  },
  files: {
    fkei: { filename: `${BASE_NAME}.fkei`, bytes: Buffer.byteLength(fkei), sha256: sha256(fkei) },
    stl: { filename: `${BASE_NAME}.stl`, bytes: stl.byteLength, sha256: sha256(stl) },
    threeMf: {
      filename: `${BASE_NAME}.3mf`,
      bytes: threeMf.byteLength,
      sha256: sha256(threeMf),
      partCount: 1,
      stats: {
        bodyFaces: threeMfResult.stats.bodyFaces,
        bodyVertices: threeMfResult.stats.bodyVertices,
        scaffoldFaces: threeMfResult.stats.scaffoldFaces,
        enforcerFaces: threeMfResult.stats.enforcerFaces,
        blockerFaces: threeMfResult.stats.blockerFaces,
        removedDegenerateTriangles: threeMfResult.stats.removedDegenerateTriangles,
      },
    },
  },
  roundtrip: {
    printSupportNodeCount: restored.printSupport.nodes.length,
    printSupportEdgeCount: restored.printSupport.edges.length,
    finalGraphNodeCount: restored.finalGraph.nodes.length,
    finalGraphEdgeCount: restored.finalGraph.edges.length,
    finalGraphIdentityPreserved: graphIdentity(restored.finalGraph) === graphIdentity(candidateProject.finalGraph),
  },
};

check(validation.removableSupport.nodeCount === 0 && validation.removableSupport.edgeCount === 0, "validation support count is non-zero");
check(validation.removableSupport.artifactAbsent === true, "validation support artifact is not absent");
check(validation.body.topology.watertight && validation.body.topology.components === 1, "validation BODY topology is unsafe");

mkdirSync(outputDirectory, { recursive: true });
const fkeiPath = resolve(outputDirectory, `${BASE_NAME}.fkei`);
const stlPath = resolve(outputDirectory, `${BASE_NAME}.stl`);
const threeMfPath = resolve(outputDirectory, `${BASE_NAME}.3mf`);
const validationPath = resolve(outputDirectory, `${BASE_NAME}.validation.json`);
const sumsPath = resolve(outputDirectory, "SHA256SUMS.txt");
const validationText = `${JSON.stringify(validation, null, 2)}\n`;
writeFileSync(fkeiPath, fkei, "utf8");
writeFileSync(stlPath, stl);
writeFileSync(threeMfPath, threeMf);
writeFileSync(validationPath, validationText, "utf8");
const sums = [
  [fkeiPath, `${BASE_NAME}.fkei`],
  [stlPath, `${BASE_NAME}.stl`],
  [threeMfPath, `${BASE_NAME}.3mf`],
  [validationPath, `${BASE_NAME}.validation.json`],
].map(([path, filename]) => `${sha256(readFileSync(path))}  ${filename}`).join("\n") + "\n";
writeFileSync(sumsPath, sums, "utf8");

check(!existsSync(resolve(outputDirectory, `${BASE_NAME}-print-support.stl`)), "a removable support artifact exists beside the candidate");
console.log(JSON.stringify({
  outputDirectory,
  generatorCommit,
  settings: {
    targetLongestMm: restored.settings.targetLongestMm,
    strutDiameterMm: restored.settings.strutDiameterMm,
    supportDiameterMm: restored.settings.supportDiameterMm,
    exportResolution: restored.settings.exportResolution,
  },
  motifCount: validation.motifCount,
  permanentWeb,
  audit: validation.audit,
  body: {
    resolution: validation.body.resolution,
    triangleCount: validation.body.triangleCount,
    scaleMmPerUnit: validation.body.scaleMmPerUnit,
    topology: validation.body.topology,
  },
  removableSupport: validation.removableSupport,
  threeMf: validation.files.threeMf,
  files: validation.files,
  sha256Sums: sums.trim().split("\n"),
}, null, 2));
