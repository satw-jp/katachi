import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DEFAULT_SKIN_HOST_PARAMS } from "../src/studies/skin/history.ts";
import { DEFAULT_SKIN_PARAMS } from "../src/studies/skin/field.ts";
import { growBalls } from "../src/studies/cloud-sculpt/field.ts";
import { buildSkinMesh, computeSkinSamplingBounds } from "../src/studies/skin/meshExport.ts";
import { packPatchesGreedy } from "../src/studies/skin/field.ts";
import { packPatchesOnQuadFlow } from "../src/studies/skin/quadFlow.ts";
import { packPatchesOnVoronoi } from "../src/studies/skin/voronoiFlow.ts";
import { packPatchesOnGoldberg } from "../src/studies/skin/goldbergFlow.ts";
import { diagnoseSurfaceAnglePositions } from "../src/studies/skin/surfaceAngleDiagnosis.ts";
import { findMotifMeshLowestPoints } from "../src/studies/skin/motifLowestPoint.ts";
import { buildTargetedGridInternalStructure } from "../src/studies/skin/targetedGrid.ts";
import { buildVoronoiInternalStructure } from "../src/studies/skin/voronoi.ts";
import { filterSupportEnforcerReachability } from "../src/studies/skin/supportReachability.ts";

const shouldWrite = process.argv.includes("--write");
const output = resolve("src/studies/skin/notes/support-reachability-matrix-20260822.json");
const hostSeeds = ["reachability-host-a", "reachability-host-b", "reachability-host-c"];
const variants = [
  { id: "random-pack", surfaceGenerationMode: "randomPack" },
  { id: "quad-regular", surfaceGenerationMode: "quadFlow", quadTilingMode: "regular" },
  { id: "quad-varied", surfaceGenerationMode: "quadFlow", quadTilingMode: "varied" },
  { id: "quad-field-curvature", surfaceGenerationMode: "quadFlow", quadTilingMode: "field" },
  { id: "voronoi-cvt", surfaceGenerationMode: "voronoi" },
  { id: "goldberg", surfaceGenerationMode: "goldberg" },
] as const;
const internalModes = ["targetedGrid", "voronoiEdge"] as const;

function positions(mesh: ReturnType<typeof buildSkinMesh>): Float32Array {
  return new Float32Array(mesh.triangles.flatMap((triangle) => [
    triangle.a.x, triangle.a.y, triangle.a.z, triangle.b.x, triangle.b.y, triangle.b.z, triangle.c.x, triangle.c.y, triangle.c.z,
  ]));
}

function buildPatches(host: ReturnType<typeof growBalls>, hostK: number, params: typeof DEFAULT_SKIN_PARAMS) {
  if (params.surfaceGenerationMode === "quadFlow") return packPatchesOnQuadFlow(host, hostK, params).patches;
  if (params.surfaceGenerationMode === "voronoi") return packPatchesOnVoronoi(host, hostK, params).patches;
  if (params.surfaceGenerationMode === "goldberg") return packPatchesOnGoldberg(host, hostK, params).patches;
  return packPatchesGreedy(host, hostK, [], params).patches;
}

function runCase(seed: string, variant: typeof variants[number], internalMode: typeof internalModes[number]) {
  const started = performance.now();
  const hostParams = { ...DEFAULT_SKIN_HOST_PARAMS, seed, count: 18 };
  const host = growBalls(hostParams);
  const params = { ...DEFAULT_SKIN_PARAMS, seed: `${seed}-${variant.id}`, attempts: 180, surfaceGenerationMode: variant.surfaceGenerationMode, internalStructure: internalMode, quadTilingMode: variant.surfaceGenerationMode === "quadFlow" ? variant.quadTilingMode : DEFAULT_SKIN_PARAMS.quadTilingMode, quadDivisions: 3, voronoiSeedCount: 48, goldbergFrequency: 2, internalDensity: 16 };
  const patches = buildPatches(host, hostParams.k, params);
  const surface = buildSkinMesh("plate", host, hostParams.k, params.thickness, patches, params.roundK, { resolution: 30, targetLongestMm: 80 }, params.coinBulge, params.quadMeshJoinWidth, params.coinBulgeBalance, null);
  const surfacePositions = positions(surface);
  const meshStep = computeSkinSamplingBounds(host, hostParams.k, params.thickness, patches).longest / 30;
  const graph = internalMode === "targetedGrid"
    ? buildTargetedGridInternalStructure(host, hostParams.k, patches, findMotifMeshLowestPoints(surfacePositions, patches, null, meshStep, params.roundK).map((target) => ({ ...target, basis: "finalMesh" as const })), params.internalDensity, params.internalRadius)
    : buildVoronoiInternalStructure(host, hostParams.k, params.internalDensity, params.internalRadius, params.internalRandomness, params.seed);
  const diagnosis = diagnoseSurfaceAnglePositions(surfacePositions, graph, 45, meshStep);
  const candidates = diagnosis.afterDangerPositions;
  const reachability = filterSupportEnforcerReachability(new Float32Array(candidates.map((value) => value * surface.scaleMmPerUnit)), new Float32Array(surfacePositions.map((value) => value * surface.scaleMmPerUnit)));
  const invariantOk = reachability.keptFaceCount >= 0 && reachability.keptFaceCount <= reachability.candidateFaceCount && reachability.keptPositions.length === reachability.keptFaceCount * 9 && Number.isFinite(reachability.meshScaleMm);
  return { hostSeed: seed, surfaceVariant: variant.id, internalMode, surfaceFaces: surface.triangles.length, candidateFaces: reachability.candidateFaceCount, keptFaces: reachability.keptFaceCount, rejectedFaces: reachability.rejectedFaceCount, invalidFaces: reachability.invalidCandidateFaceCount, graphNodes: graph.nodes.length, graphEdges: graph.edges.length, runtimeMs: Math.round((performance.now() - started) * 1000) / 1000, pass: invariantOk, invariant: invariantOk ? "0 <= kept <= candidate; finite buffers; kept soup = 9 values/face" : "FAILED invariant", deterministic: null as boolean | null };
}

const cases = [];
for (const hostSeed of hostSeeds) for (const variant of variants) for (const internalMode of internalModes) {
  const first = runCase(hostSeed, variant, internalMode);
  const rerun = runCase(hostSeed, variant, internalMode);
  first.deterministic = first.surfaceFaces === rerun.surfaceFaces && first.candidateFaces === rerun.candidateFaces && first.keptFaces === rerun.keptFaces && first.rejectedFaces === rerun.rejectedFaces && first.graphNodes === rerun.graphNodes && first.graphEdges === rerun.graphEdges;
  first.pass &&= first.deterministic;
  if (!first.deterministic) first.invariant = "FAILED deterministic rerun count comparison";
  cases.push(first);
}
const evidence = { generatedAt: new Date().toISOString(), label: "bounded screening only; 3 deterministic host seeds × 6 current Surface organization variants × 2 Internal modes at resolution 30. Not the author’s final-resolution model.", resolution: 30, cases, summary: { total: cases.length, passed: cases.filter((entry) => entry.pass).length, failed: cases.filter((entry) => !entry.pass).length } };
if (shouldWrite) { await mkdir(dirname(output), { recursive: true }); await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`); }
console.log(JSON.stringify(evidence.summary));
if (!evidence.cases.every((entry) => entry.pass)) process.exitCode = 1;
