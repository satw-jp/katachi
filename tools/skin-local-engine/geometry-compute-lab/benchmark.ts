import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { fieldSdf } from "../../../src/studies/cloud-sculpt/field.ts";
import { meshGridShape } from "../../../src/studies/cloud-sculpt/meshExport.ts";
import {
  computeSkinMeshSamplingGrid,
  createFinishedSkinBodySdfEvaluator,
} from "../../../src/studies/skin/meshExport.ts";
import {
  createEvaluateContainmentJob,
  EXPECTED_CUDA_DEVICE_NAME,
  EXPECTED_CUDA_EXECUTABLE_SHA256,
  type ContainmentClassification,
} from "../../../src/studies/skin/rebuild/geometryEngine/contracts.ts";
import { WindowsLocalGeometryEngineClient } from "../../../src/studies/skin/rebuild/geometryEngine/windowsLocalClient.ts";
import {
  buildSkinRebuildFinalMesh,
  buildSkinRebuildProject,
  meshPositions,
} from "../../../src/studies/skin/rebuild/model.ts";
import { detectSkinRebuildOverhangRegions } from "../../../src/studies/skin/rebuild/overhangRegions.ts";
import {
  GEOMETRY_COMPUTE_LAB_CONTRACT,
  MESH_ANALYSIS_FIELD_ALGORITHM,
  SHADOW_GEOMETRY_COMPUTE_POLICY,
  type GeometryComputePoint,
  type MeshAnalysisFieldRequest,
} from "./contracts.ts";
import { evaluateMeshAnalysisFieldOnWeb } from "./web-reference.ts";

const PRODUCTION_ORIGIN = "https://katachi.a-8c3.workers.dev";
const MAXIMUM_BATCH_SAMPLES = 250_000;
const POINT_RADIUS = 1e-12;
const COMPARISON_TOLERANCE = 1e-5;
const FINAL_MESH_RESOLUTION = Math.max(48, Math.min(160,
  Number(process.env.KATACHI_CUDA_GEOMETRY_RESOLUTION ?? 128)));
const reportDirectory = new URL("./reports/", import.meta.url);
const reportJsonUrl = new URL("./reports/skin-cuda-geometry-cost-map-2026-08-31.json", import.meta.url);
const reportMarkdownUrl = new URL("./reports/skin-cuda-geometry-cost-map-2026-08-31.md", import.meta.url);

function hashBytes(value: ArrayBufferView | string | object): `sha256:${string}` {
  const hash = createHash("sha256");
  if (typeof value === "string") hash.update(value);
  else if (ArrayBuffer.isView(value)) {
    hash.update(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
  } else hash.update(JSON.stringify(value));
  return `sha256:${hash.digest("hex")}`;
}

function productionFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Origin", PRODUCTION_ORIGIN);
  return fetch(input, { ...init, headers });
}

function expectedClassification(margin: number): ContainmentClassification {
  return margin > COMPARISON_TOLERANCE
    ? "outside"
    : margin < -COMPARISON_TOLERANCE
      ? "inside"
      : "boundary";
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function maximum(values: Iterable<number>): number {
  let result = Number.NEGATIVE_INFINITY;
  for (const value of values) result = Math.max(result, value);
  return result === Number.NEGATIVE_INFINITY ? 0 : result;
}

function minimum(values: Iterable<number>): number {
  let result = Number.POSITIVE_INFINITY;
  for (const value of values) result = Math.min(result, value);
  return result === Number.POSITIVE_INFINITY ? 0 : result;
}

function triangleCentroid(positions: Float32Array, faceIndex: number): GeometryComputePoint {
  const offset = faceIndex * 9;
  return {
    x: (positions[offset] + positions[offset + 3] + positions[offset + 6]) / 3,
    y: (positions[offset + 1] + positions[offset + 4] + positions[offset + 7]) / 3,
    z: (positions[offset + 2] + positions[offset + 5] + positions[offset + 8]) / 3,
  };
}

interface CandidateBatchReport {
  domain: string;
  sampleCount: number;
  batchCount: number;
  fullObservedMilliseconds: number;
  requestConstructionMilliseconds: number;
  clientTotalMilliseconds: number;
  requestEncodingMilliseconds: number;
  httpRoundTripMilliseconds: number;
  helperDecodeMilliseconds: number;
  workerMilliseconds: number;
  responseEncodeMilliseconds: number;
  responseDecodeMilliseconds: number;
  semanticValidationMilliseconds: number;
  cudaEndToEndMilliseconds: number;
  cudaKernelMilliseconds: number;
  requestBytes: number;
  responseBytes: number;
  maximumAbsoluteSignedDistanceDelta: number;
  identityMismatchCount: number;
  classificationMismatchCount: number;
  finite: boolean;
  deviceName: string;
  artifactSha256: string;
  shadow: true;
  productionApplied: false;
}

async function evaluateCudaCandidate({
  domain,
  sampleCount,
  pointAt,
  expectedAt,
  client,
  projectFingerprint,
  unitsPerMillimeter,
  baseBalls,
  smoothness,
}: {
  domain: string;
  sampleCount: number;
  pointAt(index: number): GeometryComputePoint;
  expectedAt(index: number): number;
  client: WindowsLocalGeometryEngineClient;
  projectFingerprint: `sha256:${string}`;
  unitsPerMillimeter: number;
  baseBalls: ReadonlyArray<{ id?: number; x: number; y: number; z: number; r: number }>;
  smoothness: number;
}): Promise<CandidateBatchReport> {
  const fullStarted = performance.now();
  const timings = {
    construction: [] as number[], client: [] as number[], encode: [] as number[], http: [] as number[],
    helperDecode: [] as number[], worker: [] as number[], responseEncode: [] as number[],
    decode: [] as number[], semantic: [] as number[], cuda: [] as number[], kernel: [] as number[],
  };
  let requestBytes = 0;
  let responseBytes = 0;
  let maximumAbsoluteSignedDistanceDelta = 0;
  let identityMismatchCount = 0;
  let classificationMismatchCount = 0;
  let finite = true;
  let deviceName = "";
  let artifactSha256 = "";
  const batchCount = Math.ceil(sampleCount / MAXIMUM_BATCH_SAMPLES);
  for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
    const first = batchIndex * MAXIMUM_BATCH_SAMPLES;
    const count = Math.min(MAXIMUM_BATCH_SAMPLES, sampleCount - first);
    const constructionStart = performance.now();
    const samples = Array.from({ length: count }, (_, localIndex) => {
      const stableIndex = first + localIndex;
      return {
        sampleId: `${domain}-sample-${stableIndex}`,
        edgeId: `${domain}-batch-${batchIndex}`,
        position: pointAt(stableIndex),
        radius: POINT_RADIUS,
      };
    });
    const request = createEvaluateContainmentJob({
      clientRequestId: `geometry-lab-${domain}-${batchIndex}`,
      projectFingerprint,
      coordinateContract: {
        frame: "object",
        unitsPerMillimeter,
        handedness: "right",
        buildAxis: "+z",
      },
      quality: {
        purpose: `shadow-${domain}`,
        sourceAlgorithmVersion: "skin-cuda-geometry-compute-lab-v1",
        benchmarkIterations: 1,
      },
      input: {
        base: {
          kind: "metaball-smooth-union",
          contractVersion: 1,
          balls: baseBalls.map((ball, index) => ({
            id: Number.isInteger(ball.id) ? ball.id! : index + 1,
            x: ball.x, y: ball.y, z: ball.z, r: ball.r,
          })),
          smoothness,
        },
        samples,
        boundaryTolerance: COMPARISON_TOLERANCE,
      },
    });
    timings.construction.push(performance.now() - constructionStart);
    const result = await client.evaluateContainment(request);
    assert.equal(result.shadow, true);
    assert.equal(result.productionApplied, false);
    assert.equal(result.backend.deviceName, EXPECTED_CUDA_DEVICE_NAME);
    assert.equal(result.backend.artifactSha256, EXPECTED_CUDA_EXECUTABLE_SHA256);
    deviceName = result.backend.deviceName ?? "";
    artifactSha256 = result.backend.artifactSha256 ?? "";
    for (let localIndex = 0; localIndex < count; localIndex += 1) {
      const stableIndex = first + localIndex;
      const sample = result.result.samples[localIndex];
      const expected = expectedAt(stableIndex);
      if (sample.sampleId !== `${domain}-sample-${stableIndex}`
        || sample.edgeId !== `${domain}-batch-${batchIndex}`) identityMismatchCount++;
      if (sample.classification !== expectedClassification(expected + POINT_RADIUS)) {
        classificationMismatchCount++;
      }
      if (!Number.isFinite(sample.baseSignedDistance)) finite = false;
      maximumAbsoluteSignedDistanceDelta = Math.max(
        maximumAbsoluteSignedDistanceDelta,
        Math.abs(sample.baseSignedDistance - expected),
      );
    }
    const transport = client.getLastTransportTiming();
    assert(transport, "binary client timing is required");
    timings.client.push(transport.totalMilliseconds);
    timings.encode.push(transport.requestEncodingMilliseconds);
    timings.http.push(transport.httpRoundTripMilliseconds);
    timings.helperDecode.push(transport.helperDecodeMilliseconds ?? 0);
    timings.worker.push(transport.workerTotalMilliseconds ?? 0);
    timings.responseEncode.push(transport.helperResponseEncodeMilliseconds ?? 0);
    timings.decode.push(transport.responseDecodeMilliseconds);
    timings.semantic.push(transport.semanticValidationMilliseconds);
    timings.cuda.push(result.backend.timing?.endToEndMilliseconds ?? 0);
    timings.kernel.push(result.backend.timing?.kernelAverageMilliseconds ?? 0);
    requestBytes += transport.requestBytes;
    responseBytes += transport.responseBytes;
  }
  assert.equal(identityMismatchCount, 0);
  assert.equal(classificationMismatchCount, 0);
  assert.equal(finite, true);
  assert(maximumAbsoluteSignedDistanceDelta <= COMPARISON_TOLERANCE);
  return {
    domain,
    sampleCount,
    batchCount,
    fullObservedMilliseconds: performance.now() - fullStarted,
    requestConstructionMilliseconds: sum(timings.construction),
    clientTotalMilliseconds: sum(timings.client),
    requestEncodingMilliseconds: sum(timings.encode),
    httpRoundTripMilliseconds: sum(timings.http),
    helperDecodeMilliseconds: sum(timings.helperDecode),
    workerMilliseconds: sum(timings.worker),
    responseEncodeMilliseconds: sum(timings.responseEncode),
    responseDecodeMilliseconds: sum(timings.decode),
    semanticValidationMilliseconds: sum(timings.semantic),
    cudaEndToEndMilliseconds: sum(timings.cuda),
    cudaKernelMilliseconds: sum(timings.kernel),
    requestBytes,
    responseBytes,
    maximumAbsoluteSignedDistanceDelta,
    identityMismatchCount,
    classificationMismatchCount,
    finite,
    deviceName,
    artifactSha256,
    shadow: true,
    productionApplied: false,
  };
}

function gridPointAt(
  index: number,
  bounds: { min: GeometryComputePoint },
  shape: { nx: number; ny: number; nz: number; step: number },
): GeometryComputePoint {
  const sx = shape.nx + 1;
  const sy = shape.ny + 1;
  const plane = sx * sy;
  const z = Math.floor(index / plane);
  const withinPlane = index - z * plane;
  const y = Math.floor(withinPlane / sx);
  const x = withinPlane - y * sx;
  return {
    x: bounds.min.x + x * shape.step,
    y: bounds.min.y + y * shape.step,
    z: bounds.min.z + z * shape.step,
  };
}

function sampleGrid(
  sampleCount: number,
  pointAt: (index: number) => GeometryComputePoint,
  evaluator: (x: number, y: number, z: number) => number,
): { values: Float64Array; milliseconds: number; finite: boolean; checksum: number } {
  const started = performance.now();
  const values = new Float64Array(sampleCount);
  let finite = true;
  let checksum = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const point = pointAt(index);
    const value = evaluator(point.x, point.y, point.z);
    values[index] = value;
    if (!Number.isFinite(value)) finite = false;
    checksum += value * ((index % 31) + 1);
  }
  return { values, milliseconds: performance.now() - started, finite, checksum };
}

function routeSampleCount(project: ReturnType<typeof buildSkinRebuildProject>["project"]): number {
  let count = 0;
  for (const edge of project.lattice.edges) {
    const start = project.lattice.nodes[edge.start]?.position;
    const end = project.lattice.nodes[edge.end]?.position;
    if (!start || !end || !(edge.radius > 0)) continue;
    const distance = Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
    const intervals = Math.max(2, Math.min(512, Math.ceil(distance / Math.max(edge.radius * 0.2, 1e-4))));
    count += intervals + 1;
  }
  return count;
}

const report: Record<string, unknown> = {
  contract: "katachi.skin.cuda-geometry-compute-cost-map.v1",
  recordedAt: new Date().toISOString(),
  branch: "agent/skin-cuda-geometry",
  baseCommit: "13fe4d204041748d2782f29abec5c8474343a37b",
  policy: SHADOW_GEOMETRY_COMPUTE_POLICY,
};

const projectStarted = performance.now();
const built = buildSkinRebuildProject();
const projectBuildMilliseconds = performance.now() - projectStarted;
const project = built.project;
const projectFingerprint = hashBytes({
  algorithmVersion: project.algorithmVersion,
  settings: project.settings,
  base: project.base,
  patterns: project.patterns,
  finalGraph: project.finalGraph,
});

const finalMeshStarted = performance.now();
const finalMesh = buildSkinRebuildFinalMesh(project, FINAL_MESH_RESOLUTION);
const finalMeshMilliseconds = performance.now() - finalMeshStarted;
const positions = meshPositions(finalMesh);
const topologyFingerprint = hashBytes(positions);
const meshFieldRequest: MeshAnalysisFieldRequest = {
  contract: GEOMETRY_COMPUTE_LAB_CONTRACT,
  operation: "evaluateMeshAnalysisField",
  algorithmContract: MESH_ANALYSIS_FIELD_ALGORITHM,
  requestId: "real-skin-final-body-mesh-analysis",
  projectFingerprint,
  topologyFingerprint,
  coordinateFrame: "object",
  unitsPerMillimeter: 1 / finalMesh.scaleMmPerUnit,
  positions,
  baseField: {
    kind: "metaball-smooth-union",
    contractVersion: 1,
    balls: project.base.host.map((ball, index) => ({
      id: Number.isInteger(ball.id) ? ball.id! : index + 1,
      x: ball.x, y: ball.y, z: ball.z, r: ball.r,
    })),
    smoothness: project.base.hostK,
  },
  buildAxis: "+z",
  requestedFields: ["insideScore", "overhangAngleDeg"],
};
const meshAnalysisStarted = performance.now();
const meshField = evaluateMeshAnalysisFieldOnWeb(meshFieldRequest);
const meshAnalysisWebMilliseconds = performance.now() - meshAnalysisStarted;

const meshStep = finalMesh.sourceBounds.longest / FINAL_MESH_RESOLUTION;
const plateBand = Math.max(meshStep * 2.5, project.settings.patternRadius * 0.55);
const overhangStarted = performance.now();
const overhang = detectSkinRebuildOverhangRegions(
  finalMesh.triangles,
  project.settings.overhangThresholdDeg,
  finalMesh.sourceBounds.min.z,
  plateBand,
);
const overhangGroupingMilliseconds = performance.now() - overhangStarted;

const meshInput = {
  mode: "plate" as const,
  host: project.base.host,
  hostK: project.base.hostK,
  thickness: project.settings.surfaceThickness,
  patches: project.patterns,
  roundK: project.settings.roundK,
  options: { resolution: FINAL_MESH_RESOLUTION, targetLongestMm: project.settings.targetLongestMm },
  coinBulge: 0,
  quadMeshJoinWidth: 0,
  coinBulgeBalance: 0,
  internalGraph: project.finalGraph,
};
const samplingGrid = computeSkinMeshSamplingGrid(meshInput);
const gridShape = meshGridShape(samplingGrid.bounds, FINAL_MESH_RESOLUTION);
const gridSampleCount = (gridShape.nx + 1) * (gridShape.ny + 1) * (gridShape.nz + 1);
const gridPoint = (index: number): GeometryComputePoint =>
  gridPointAt(index, samplingGrid.bounds, gridShape);
const baseGrid = sampleGrid(
  gridSampleCount,
  gridPoint,
  (x, y, z) => fieldSdf(project.base.host, project.base.hostK, x, y, z),
);
const finishedBodyEvaluator = createFinishedSkinBodySdfEvaluator(meshInput);
const finishedBodyGrid = sampleGrid(gridSampleCount, gridPoint, finishedBodyEvaluator);
assert.equal(baseGrid.finite, true);
assert.equal(finishedBodyGrid.finite, true);

const client = new WindowsLocalGeometryEngineClient({ fetch: productionFetch, transport: "binary", jobTimeoutMs: 60_000 });
const capability = await client.probeCapabilities();
assert.equal(capability.available, true, capability.available ? "" : capability.detail);
assert(capability.available && client.supportsCudaContainment(capability.capabilities));
const meshCuda = await evaluateCudaCandidate({
  domain: "mesh-face",
  sampleCount: meshField.faceIndices.length,
  pointAt: (index) => triangleCentroid(positions, index),
  expectedAt: (index) => meshField.insideScore[index],
  client,
  projectFingerprint,
  unitsPerMillimeter: meshFieldRequest.unitsPerMillimeter,
  baseBalls: project.base.host,
  smoothness: project.base.hostK,
});
const gridCuda = await evaluateCudaCandidate({
  domain: "sdf-grid",
  sampleCount: gridSampleCount,
  pointAt: gridPoint,
  expectedAt: (index) => baseGrid.values[index],
  client,
  projectFingerprint,
  unitsPerMillimeter: meshFieldRequest.unitsPerMillimeter,
  baseBalls: project.base.host,
  smoothness: project.base.hostK,
});

const insideCounts = { inside: 0, boundary: 0, outside: 0 };
for (const score of meshField.insideScore) {
  insideCounts[expectedClassification(score)]++;
}

Object.assign(report, {
  source: {
    source: "buildSkinRebuildProject() deterministic 120 mm project",
    targetLongestMm: project.settings.targetLongestMm,
    finalMeshResolution: FINAL_MESH_RESOLUTION,
    baseBallCount: project.base.host.length,
    patternCount: project.patterns.length,
    latticeNodeCount: project.lattice.nodes.length,
    latticeEdgeCount: project.lattice.edges.length,
    routeContainmentSampleCount: routeSampleCount(project),
    finalFaceCount: finalMesh.triangles.length,
    finalPositionFloatCount: positions.length,
    gridShape,
    gridSampleCount,
    projectFingerprint,
    topologyFingerprint,
  },
  timings: {
    projectBuildMilliseconds,
    finalMeshMilliseconds,
    meshAnalysisWebMilliseconds,
    overhangGroupingMilliseconds,
    baseGridWebMilliseconds: baseGrid.milliseconds,
    finishedBodyCompositeGridWebMilliseconds: finishedBodyGrid.milliseconds,
    inferredAssemblyTopologyRepairMilliseconds: Math.max(0, finalMeshMilliseconds - finishedBodyGrid.milliseconds),
  },
  meshAnalysis: {
    faceCount: meshField.faceIndices.length,
    insideCounts,
    overhangMinimumDeg: minimum(meshField.overhangAngleDeg),
    overhangMaximumDeg: maximum(meshField.overhangAngleDeg),
    riskyFaceCount: overhang.faceCount,
    overhangRegionCount: overhang.regionCount,
    web: {
      totalMilliseconds: meshAnalysisWebMilliseconds,
      insideScorePrecision: "float64",
      overhangAnglePrecision: "float32 cache",
    },
    cudaCandidate: meshCuda,
    semanticCoverage: {
      insideScore: "existing RTX containment kernel, stable face-index reconstruction",
      overhangAngleDeg: "Web/CPU reference only in this prototype",
      thresholding: "browser cache; no backend recomputation",
    },
  },
  sdfGrid: {
    resolution: FINAL_MESH_RESOLUTION,
    shape: gridShape,
    sampleCount: gridSampleCount,
    baseFieldWebMilliseconds: baseGrid.milliseconds,
    baseFieldCudaCandidate: gridCuda,
    finishedBodyCompositeWebMilliseconds: finishedBodyGrid.milliseconds,
    semanticCoverage: {
      cuda: "metaball Base field only",
      missingForProductionBody: "Surface Pattern primitives plus permanent capsule graph encoding",
      cpuIsosurface: "unchanged marching-tetrahedra assembly and fail-closed topology/repair",
    },
  },
  routeEvaluation: {
    status: "contract and workload evaluated; not selected as one of the first two prototypes",
    currentReusablePrimitive: "radius-aware sampled Base containment",
    sampleCount: routeSampleCount(project),
    requiredNextFacts: [
      "minimum finished-BODY clearance",
      "minimum permanent-Web clearance",
      "minimum neighbor clearance",
      "first collision segment/t",
    ],
    browserAuthority: "candidate route generation and acceptance remain CPU/browser-owned",
  },
  inventory: [
    { stage: "Stage 3 inside/outside", currentEvidence: `${project.patterns.length} patterns plus ${meshField.faceIndices.length} face centroids`, hotFunction: "fieldSdf", gpuSuitability: "excellent" },
    { stage: "Stage 4 overhang", currentEvidence: `${overhang.faceCount} risky faces / ${overhang.regionCount} regions in ${overhangGroupingMilliseconds.toFixed(2)} ms after mesh exists`, hotFunction: "triangle normals + edge grouping", gpuSuitability: "possible; grouping stays CPU" },
    { stage: "Stage 5B reinforcement", currentEvidence: "existing UI evidence: bounded candidate route search can run for seconds", hotFunction: "Base containment and repeated route scoring", gpuSuitability: "high for facts, CPU for selection" },
    { stage: "Stage 6 BODY mesh", currentEvidence: `${finalMesh.triangles.length} faces in ${finalMeshMilliseconds.toFixed(2)} ms at resolution ${FINAL_MESH_RESOLUTION}`, hotFunction: "finished BODY SDF grid + marching tetrahedra + topology", gpuSuitability: "excellent for SDF grid" },
    { stage: "Stage 7 diagnosis", currentEvidence: "existing real browser evidence: 201,380 faces / about 2.5 s", hotFunction: "mesh scan, attribution and region grouping", gpuSuitability: "high for scalar fields" },
    { stage: "Stage 8 support", currentEvidence: "existing real browser evidence: 66 separate support members", hotFunction: "finished-BODY keep-out and candidate route collision", gpuSuitability: "high for batch facts, CPU for sparse selection" },
    { stage: "FKEI restore recompute", currentEvidence: "invalidated computed evidence re-enters Stage 3-7 paths", hotFunction: "same field/mesh/diagnosis operations", gpuSuitability: "inherits each operation" },
    { stage: "high-resolution preview", currentEvidence: `${gridSampleCount} field samples at current benchmark resolution`, hotFunction: "SDF grid", gpuSuitability: "excellent" },
  ],
  priority: [
    { rank: 1, operation: "finished-BODY SDF grid sampling", rationale: "largest repeatable data-parallel share; requires portable Pattern/capsule encoding before production use" },
    { rank: 2, operation: "mesh analysis continuous fields", rationale: "stable face-index mapping works now; insideScore matched RTX while threshold remains browser-owned" },
    { rank: 3, operation: "generic route collision/clearance", rationale: "shared by 5B/8/Web, but needs finished-BODY/Web field snapshots and candidate counts" },
    { rank: 4, operation: "structural coverage", rationale: "depends on route/clearance facts and a still-CPU semantic definition" },
  ],
  decision: {
    selectedPrototypes: ["mesh analysis insideScore field", "Base SDF grid sampling feasibility"],
    nextImplementation: ["portable finished-BODY primitive snapshot", "batched mesh analysis field result using stable indices"],
    notSelected: ["graph topology", "support sparse selection", "Web topology", "CUDA authority"],
    limitation: "The reviewed kernel proves Base metaball point evaluation only; it does not yet represent Pattern or permanent capsule geometry.",
  },
});

await mkdir(reportDirectory, { recursive: true });
await writeFile(reportJsonUrl, `${JSON.stringify(report, null, 2)}\n`);
const timing = report.timings as Record<string, number>;
const lines = [
  "# SKIN CUDA Geometry Compute Cost Map",
  "",
  `Recorded from the deterministic 120 mm project on branch \`agent/skin-cuda-geometry\` at final-mesh resolution ${FINAL_MESH_RESOLUTION}. This is shadow/lab evidence only. Web remains authoritative; \`shadow=true\` and \`productionApplied=false\`.`,
  "",
  "## Measured production-shaped workload",
  "",
  "| Work | Count | Web/CPU | CUDA candidate | Kernel | Result |",
  "|:---|---:|---:|---:|---:|:---|",
  `| Project build (Stage 3-5A shaped) | ${project.patterns.length} patterns / ${project.lattice.edges.length} lattice edges | ${projectBuildMilliseconds.toFixed(2)} ms | — | — | CPU authority |`,
  `| Final BODY build | ${finalMesh.triangles.length.toLocaleString()} faces | ${finalMeshMilliseconds.toFixed(2)} ms | — | — | production algorithm unchanged |`,
  `| Mesh analysis field | ${meshField.faceIndices.length.toLocaleString()} faces | ${meshAnalysisWebMilliseconds.toFixed(2)} ms | ${meshCuda.fullObservedMilliseconds.toFixed(2)} ms | ${meshCuda.cudaKernelMilliseconds.toFixed(3)} ms | identity/classification matched; max SDF Δ ${meshCuda.maximumAbsoluteSignedDistanceDelta.toExponential(3)} |`,
  `| Base SDF grid | ${gridSampleCount.toLocaleString()} points / ${gridCuda.batchCount} batches | ${baseGrid.milliseconds.toFixed(2)} ms | ${gridCuda.fullObservedMilliseconds.toFixed(2)} ms | ${gridCuda.cudaKernelMilliseconds.toFixed(3)} ms | identity/classification matched; max SDF Δ ${gridCuda.maximumAbsoluteSignedDistanceDelta.toExponential(3)} |`,
  `| Finished-BODY composite grid | ${gridSampleCount.toLocaleString()} points | ${finishedBodyGrid.milliseconds.toFixed(2)} ms | not encoded | — | next primitive-snapshot gap |`,
  `| Overhang grouping after mesh | ${finalMesh.triangles.length.toLocaleString()} faces | ${overhangGroupingMilliseconds.toFixed(2)} ms | not selected | — | ${overhang.faceCount.toLocaleString()} risky faces / ${overhang.regionCount} regions |`,
  "",
  "CUDA candidate results are observations only. All sample identities and classifications matched, values were finite, and both candidate paths reported `productionApplied=false`.",
  "",
  "## Cost map and boundary",
  "",
  `The exact grid used ${gridShape.nx + 1} × ${gridShape.ny + 1} × ${gridShape.nz + 1} points. Finished-BODY field sampling took ${timing.finishedBodyCompositeGridWebMilliseconds.toFixed(2)} ms; full BODY build took ${timing.finalMeshMilliseconds.toFixed(2)} ms. Marching-tetrahedra assembly, orientation, topology and bounded repair remain CPU/fail-closed work.`,
  "",
  "1. **Finished-BODY SDF grid sampling** is the highest-impact GPU target. The Base-only CUDA lower bound is already measured, but production use first needs a portable immutable snapshot for Surface Pattern primitives and permanent capsule edges.",
  "2. **Mesh analysis continuous fields** are the lowest-risk first integration target. Stable face indices preserve identity, CUDA `insideScore` matches Web, and `overhangAngleDeg` plus thresholding can remain cached/browser-owned.",
  "3. **Route collision/clearance** remains the next shared primitive for Stage 5B, Stage 8 and future Web. This task fixes its semantic contract but does not implement route selection or a support-specific kernel.",
  "",
  "## Authority and stop rule",
  "",
  "No CUDA value is connected to BODY, FKEI, STL, 3MF, Support or Web topology. Graph topology, sparse support selection and threshold meaning remain Web/CPU decisions. CUDA failure cannot alter production output.",
];
await writeFile(reportMarkdownUrl, `${lines.join("\n")}\n`);
process.stdout.write(`${JSON.stringify({
  source: report.source,
  timings: report.timings,
  meshAnalysis: report.meshAnalysis,
  sdfGrid: report.sdfGrid,
  priority: report.priority,
  policy: report.policy,
}, null, 2)}\n`);
