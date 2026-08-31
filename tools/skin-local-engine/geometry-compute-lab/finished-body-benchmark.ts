import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import {
  buildMeshFromField,
  inspectSavedStlTopology,
  meshGridShape,
} from "../../../src/studies/cloud-sculpt/meshExport.ts";
import {
  buildSkinMesh,
  computeSkinMeshSamplingGrid,
  countConnectedComponents,
  createFinishedSkinBodySdfEvaluator,
} from "../../../src/studies/skin/meshExport.ts";
import {
  buildSkinRebuildProject,
  repairSkinRebuildFinalMesh,
} from "../../../src/studies/skin/rebuild/model.ts";
import { probeWindowsCapability } from "../probe-windows-capability.mjs";
import {
  FINISHED_BODY_SDF_ALGORITHM,
  FIXED_HOST,
  createLocalEngineServer,
} from "../server.mjs";
import {
  FINISHED_BODY_GRID_MEDIA_TYPE,
  FINISHED_BODY_RESULT_MEDIA_TYPE,
  FINISHED_BODY_SNAPSHOT_MEDIA_TYPE,
  decodeFinishedBodyGridResult,
  encodeFinishedBodyGridRequest,
} from "../finished-body-shadow-transport.mjs";
import { createFinishedBodyFieldSnapshotV1 } from "./finished-body-snapshot.ts";

const ORIGIN = "https://katachi.a-8c3.workers.dev";
const RESOLUTION = 128;
const FLOAT32_TOLERANCE = 1e-5;
const WARM_RUNS = 10;
const BASELINE_BODY_BUILD_MILLISECONDS = 19_373.54;
const BASELINE_CPU_SAMPLING_MILLISECONDS = 9_427.32;
const reportJsonUrl = new URL("./reports/finished-body-sdf-grid-2026-08-31.json", import.meta.url);
const reportMarkdownUrl = new URL("./reports/finished-body-sdf-grid-2026-08-31.md", import.meta.url);

function hash(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.length % 2 ? sorted[(sorted.length - 1) / 2]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
}

function maximumBoundsDelta(
  left: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } },
  right: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } },
): number {
  return Math.max(
    Math.abs(left.min.x - right.min.x), Math.abs(left.min.y - right.min.y), Math.abs(left.min.z - right.min.z),
    Math.abs(left.max.x - right.max.x), Math.abs(left.max.y - right.max.y), Math.abs(left.max.z - right.max.z),
  );
}

function classification(value: number): "inside" | "boundary" | "outside" {
  return value < -FLOAT32_TOLERANCE ? "inside" : value > FLOAT32_TOLERANCE ? "outside" : "boundary";
}

const projectStart = performance.now();
const { project } = buildSkinRebuildProject();
const projectBuildMilliseconds = performance.now() - projectStart;
const projectFingerprint = hash({
  algorithmVersion: project.algorithmVersion,
  settings: project.settings,
  base: project.base,
  patterns: project.patterns,
  finalGraph: project.finalGraph,
});
const meshInput = {
  mode: "plate" as const,
  host: project.base.host,
  hostK: project.base.hostK,
  thickness: project.settings.surfaceThickness,
  patches: project.patterns,
  roundK: project.settings.roundK,
  options: { resolution: RESOLUTION, targetLongestMm: project.settings.targetLongestMm },
  coinBulge: 0,
  quadMeshJoinWidth: 0,
  coinBulgeBalance: 0,
  internalGraph: project.finalGraph,
};

const gridPreparationStart = performance.now();
const grid = computeSkinMeshSamplingGrid(meshInput);
const shape = meshGridShape(grid.bounds, RESOLUTION);
const sizeX = shape.nx + 1, sizeY = shape.ny + 1, sizeZ = shape.nz + 1;
const sampleCount = sizeX * sizeY * sizeZ;
const gridPreparationMilliseconds = performance.now() - gridPreparationStart;
assert.equal(sampleCount, 480_009, "Print #002 grid identity changed");

const cpuEvaluator = createFinishedSkinBodySdfEvaluator(meshInput);
const cpuEvaluationStart = performance.now();
const cpuValues = new Float64Array(sampleCount);
let cursor = 0;
for (let z = 0; z < sizeZ; z++) {
  for (let y = 0; y < sizeY; y++) {
    for (let x = 0; x < sizeX; x++) {
      cpuValues[cursor++] = cpuEvaluator(
        grid.bounds.min.x + x * shape.step,
        grid.bounds.min.y + y * shape.step,
        grid.bounds.min.z + z * shape.step,
      );
    }
  }
}
const cpuEvaluationMilliseconds = performance.now() - cpuEvaluationStart;
assert.equal(cursor, sampleCount);
assert([...cpuValues].every(Number.isFinite));

const snapshotStart = performance.now();
const snapshot = createFinishedBodyFieldSnapshotV1(meshInput, {
  projectFingerprint,
  unitsPerMillimeter: grid.bounds.longest / project.settings.targetLongestMm,
});
const snapshotEncodeMilliseconds = performance.now() - snapshotStart;
const fingerprint = Buffer.from(snapshot.geometryFingerprint.slice("sha256:".length), "hex");
const gridEncodeStart = performance.now();
const encodedGrid = encodeFinishedBodyGridRequest(fingerprint, { bounds: grid.bounds, shape });
const gridEncodeMilliseconds = performance.now() - gridEncodeStart;
assert.equal(encodedGrid.sampleCount, sampleCount);

const probe = probeWindowsCapability();
assert.equal(probe.cudaBackend.available, true, probe.cudaBackend.reasonCode);
const server = createLocalEngineServer({ probe, expectedHostHeader: null });
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, FIXED_HOST, resolve);
});
const address = server.address();
assert(address && typeof address === "object");
const baseUrl = `http://${FIXED_HOST}:${address.port}`;
const commonHeaders = {
  Origin: ORIGIN,
  "X-Katachi-Geometry-Prototype": "shadow-only-v1",
  "X-Katachi-Project-Fingerprint": projectFingerprint,
  "X-Katachi-Algorithm-Contract": FINISHED_BODY_SDF_ALGORITHM,
};

let sessionId = "";
let upload: Record<string, unknown>;
let uploadTotalMilliseconds = 0;
const runs: Array<Record<string, number | boolean>> = [];
let candidateValues: Float32Array | null = null;
try {
  const uploadStart = performance.now();
  const uploadResponse = await fetch(`${baseUrl}/v1/lab/finished-body-sessions`, {
    method: "POST",
    headers: { ...commonHeaders, "Content-Type": FINISHED_BODY_SNAPSHOT_MEDIA_TYPE },
    body: snapshot.payload,
  });
  uploadTotalMilliseconds = performance.now() - uploadStart;
  if (uploadResponse.status !== 201) {
    throw new Error(`snapshot upload failed ${uploadResponse.status}: ${await uploadResponse.text()}`);
  }
  upload = await uploadResponse.json() as Record<string, unknown>;
  assert.equal(upload.shadow, true);
  assert.equal(upload.productionApplied, false);
  sessionId = String(upload.sessionId);

  for (let runIndex = 0; runIndex <= WARM_RUNS; runIndex++) {
    const requestStart = performance.now();
    const response = await fetch(`${baseUrl}/v1/lab/finished-body-sessions/${sessionId}/evaluate-grid`, {
      method: "POST",
      headers: {
        ...commonHeaders,
        "Content-Type": FINISHED_BODY_GRID_MEDIA_TYPE,
        "X-Katachi-Shadow-Session-Id": sessionId,
      },
      body: encodedGrid.payload,
    });
    const headersMilliseconds = performance.now() - requestStart;
    if (response.status !== 200) {
      throw new Error(`grid evaluation failed ${response.status}: ${await response.text()}`);
    }
    assert.equal(response.headers.get("content-type"), FINISHED_BODY_RESULT_MEDIA_TYPE);
    assert.equal(response.headers.get("x-katachi-shadow"), "true");
    assert.equal(response.headers.get("x-katachi-production-applied"), "false");
    assert.equal(response.headers.get("x-katachi-session-cache-hit"), "true");
    const transferStart = performance.now();
    const resultPayload = Buffer.from(await response.arrayBuffer());
    const responseTransferMilliseconds = performance.now() - transferStart;
    const decoded = decodeFinishedBodyGridResult(resultPayload, fingerprint, sampleCount);
    const totalMilliseconds = performance.now() - requestStart;
    if (runIndex === 0) candidateValues = decoded.values;
    runs.push({
      cold: runIndex === 0,
      totalMilliseconds,
      httpHeadersMilliseconds: headersMilliseconds,
      responseTransferMilliseconds,
      helperDecodeMilliseconds: Number(response.headers.get("x-katachi-helper-decode-ms")),
      workerRoundTripMilliseconds: Number(response.headers.get("x-katachi-worker-roundtrip-ms")),
      nativeRequestDecodeMilliseconds: decoded.timing.nativeRequestDecodeMilliseconds,
      bufferPreparationMilliseconds: decoded.timing.bufferPreparationMilliseconds,
      hostToDeviceMilliseconds: decoded.timing.hostToDeviceMilliseconds,
      kernelMilliseconds: decoded.timing.kernelMilliseconds,
      deviceToHostMilliseconds: decoded.timing.deviceToHostMilliseconds,
      nativeEndToEndMilliseconds: decoded.timing.nativeEndToEndMilliseconds,
      resultDecodeMilliseconds: decoded.timing.resultDecodeMilliseconds,
      outputBufferReused: decoded.timing.outputBufferReused,
    });
  }
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

assert(candidateValues);
let maximumAbsoluteSdfDelta = 0;
let signMismatchCount = 0;
let classificationMismatchCount = 0;
for (let index = 0; index < sampleCount; index++) {
  const cpu = cpuValues[index];
  const cuda = candidateValues[index];
  maximumAbsoluteSdfDelta = Math.max(maximumAbsoluteSdfDelta, Math.abs(cpu - cuda));
  if ((cpu < 0) !== (cuda < 0)) signMismatchCount++;
  if (classification(cpu) !== classification(cuda)) classificationMismatchCount++;
}
assert(maximumAbsoluteSdfDelta <= FLOAT32_TOLERANCE, `SDF delta ${maximumAbsoluteSdfDelta}`);
assert.equal(signMismatchCount, 0);
assert.equal(classificationMismatchCount, 0);

const referenceMeshStart = performance.now();
const referenceRawMesh = buildSkinMesh(
  meshInput.mode, meshInput.host, meshInput.hostK, meshInput.thickness,
  meshInput.patches, meshInput.roundK, meshInput.options, meshInput.coinBulge,
  meshInput.quadMeshJoinWidth, meshInput.coinBulgeBalance, meshInput.internalGraph,
);
const referenceMesh = repairSkinRebuildFinalMesh(referenceRawMesh);
const referenceMeshMilliseconds = performance.now() - referenceMeshStart;
const candidateMeshStart = performance.now();
const candidateRawMesh = buildMeshFromField(grid.bounds, (x, y, z) => {
  const ix = Math.round((x - grid.bounds.min.x) / shape.step);
  const iy = Math.round((y - grid.bounds.min.y) / shape.step);
  const iz = Math.round((z - grid.bounds.min.z) / shape.step);
  const index = (iz * sizeY + iy) * sizeX + ix;
  return candidateValues![index];
}, meshInput.options);
const candidateMesh = repairSkinRebuildFinalMesh(candidateRawMesh);
const candidateMeshMilliseconds = performance.now() - candidateMeshStart;
const candidateComponents = countConnectedComponents(candidateMesh.triangles);
const referenceComponents = countConnectedComponents(referenceMesh.triangles);
const referenceSavedTopology = inspectSavedStlTopology(referenceMesh.triangles, referenceMesh.scaleMmPerUnit);
const candidateSavedTopology = inspectSavedStlTopology(candidateMesh.triangles, candidateMesh.scaleMmPerUnit);

const cold = runs[0];
const warm = runs.slice(1);
const warmMedianTotal = median(warm.map((run) => Number(run.totalMilliseconds)));
const warmMedianKernel = median(warm.map((run) => Number(run.kernelMilliseconds)));
const expectedBodyBuildMilliseconds = BASELINE_BODY_BUILD_MILLISECONDS
  - BASELINE_CPU_SAMPLING_MILLISECONDS + warmMedianTotal;
const expectedBodyBuildImprovementPercent = (1 - expectedBodyBuildMilliseconds / BASELINE_BODY_BUILD_MILLISECONDS) * 100;
const recommendation = maximumAbsoluteSdfDelta <= FLOAT32_TOLERANCE
  && signMismatchCount === 0 && classificationMismatchCount === 0
  && warmMedianTotal < BASELINE_CPU_SAMPLING_MILLISECONDS * 0.25
  ? "Strong candidate" : warmMedianTotal < BASELINE_CPU_SAMPLING_MILLISECONDS * 0.75 ? "Marginal" : "Not worth integrating";

const report = {
  contract: "katachi.skin.finished-body-sdf-grid-benchmark.v1",
  recordedAt: new Date().toISOString(),
  policy: { authoritativeBackend: "web", candidateBackend: "cuda", shadow: true, productionApplied: false },
  source: {
    project: "deterministic Print #002 120 mm project",
    projectFingerprint,
    resolution: RESOLUTION,
    gridShape: shape,
    sampleOrder: "x-fastest-y-z",
    sampleCount,
  },
  snapshot: {
    contract: snapshot.contract,
    algorithmContract: snapshot.algorithmContract,
    geometryFingerprint: snapshot.geometryFingerprint,
    bytes: snapshot.byteLength,
    sourceCounts: snapshot.sourceCounts,
    primitiveCounts: {
      host: snapshot.host.length,
      flatPoints: snapshot.flatPoints.length,
      raisedPoints: snapshot.raisedPoints.length,
      capsules: snapshot.capsules.length,
    },
    excludes: ["removable support", "scaffold pillars", "FKEI persistence"],
  },
  cpu: {
    projectBuildMilliseconds,
    gridPreparationMilliseconds,
    finishedBodySdfEvaluationMilliseconds: cpuEvaluationMilliseconds,
    totalSamplingMilliseconds: gridPreparationMilliseconds + cpuEvaluationMilliseconds,
    precision: "float64",
  },
  cuda: {
    deviceName: (upload!.timing as { deviceName: string }).deviceName,
    snapshotEncodeMilliseconds,
    snapshotUploadFullPathMilliseconds: uploadTotalMilliseconds,
    snapshotUpload: upload!.timing,
    gridRequestEncodeMilliseconds: gridEncodeMilliseconds,
    gridRequestBytes: encodedGrid.payload.length,
    resultBytes: FINISHED_BODY_RESULT_MEDIA_TYPE ? 160 + sampleCount * 4 : 0,
    cold,
    warmRuns: warm,
    warmMedian: {
      totalMilliseconds: warmMedianTotal,
      kernelMilliseconds: warmMedianKernel,
      workerRoundTripMilliseconds: median(warm.map((run) => Number(run.workerRoundTripMilliseconds))),
      deviceToHostMilliseconds: median(warm.map((run) => Number(run.deviceToHostMilliseconds))),
      resultDecodeMilliseconds: median(warm.map((run) => Number(run.resultDecodeMilliseconds))),
    },
    contextModuleKernelReused: true,
    snapshotAndGeometryBuffersReused: true,
    repeatHostToDeviceBytes: 0,
  },
  comparison: {
    tolerance: FLOAT32_TOLERANCE,
    maximumAbsoluteSdfDelta,
    signMismatchCount,
    classificationMismatchCount,
    finite: true,
    identicalPointOrdering: true,
  },
  offlineMesh: {
    referenceBuildMilliseconds: referenceMeshMilliseconds,
    candidateBuildMilliseconds: candidateMeshMilliseconds,
    referenceTriangles: referenceMesh.triangles.length,
    candidateTriangles: candidateMesh.triangles.length,
    triangleCountDelta: candidateMesh.triangles.length - referenceMesh.triangles.length,
    referenceComponents,
    candidateComponents,
    referenceWatertight: referenceMesh.watertight,
    candidateWatertight: candidateMesh.watertight,
    maximumSourceBoundsDelta: maximumBoundsDelta(referenceMesh.sourceBounds, candidateMesh.sourceBounds),
    referenceSavedTopology,
    candidateSavedTopology,
    productionAdopted: false,
  },
  projection: {
    baselineBodyBuildMilliseconds: BASELINE_BODY_BUILD_MILLISECONDS,
    baselineCpuSamplingMilliseconds: BASELINE_CPU_SAMPLING_MILLISECONDS,
    expectedBodyBuildMilliseconds,
    expectedBodyBuildImprovementPercent,
    recommendation,
    caveat: "Projection replaces only Finished BODY sampling; CPU isosurface/topology/repair remains unchanged.",
  },
};

const markdown = `# CUDA-GEO-5 — Finished BODY SDF Grid Prototype\n\n`
  + `- Policy: Web/CPU authoritative; CUDA shadow only; productionApplied=false\n`
  + `- Snapshot: ${snapshot.byteLength.toLocaleString()} bytes, ${snapshot.geometryFingerprint}\n`
  + `- Grid: ${sampleCount.toLocaleString()} points (${sizeX} × ${sizeY} × ${sizeZ}), x-fastest-y-z\n`
  + `- CPU SDF: ${cpuEvaluationMilliseconds.toFixed(2)} ms\n`
  + `- CUDA cold full grid: ${Number(cold.totalMilliseconds).toFixed(2)} ms; kernel ${Number(cold.kernelMilliseconds).toFixed(3)} ms\n`
  + `- CUDA warm median: ${warmMedianTotal.toFixed(2)} ms; kernel ${warmMedianKernel.toFixed(3)} ms\n`
  + `- Max SDF delta: ${maximumAbsoluteSdfDelta.toExponential(6)} (tolerance ${FLOAT32_TOLERANCE})\n`
  + `- Sign/classification mismatch: ${signMismatchCount}/${classificationMismatchCount}\n`
  + `- Offline mesh triangles: ${referenceMesh.triangles.length.toLocaleString()} CPU vs ${candidateMesh.triangles.length.toLocaleString()} CUDA-field\n`
  + `- Offline mesh components: ${referenceComponents} vs ${candidateComponents}; watertight ${referenceMesh.watertight.ok}/${candidateMesh.watertight.ok}\n`
  + `- Projected BODY build: ${expectedBodyBuildMilliseconds.toFixed(2)} ms (${expectedBodyBuildImprovementPercent.toFixed(1)}% faster than 19,373.54 ms baseline)\n`
  + `- Recommendation: **${recommendation}**\n\n`
  + `No CUDA value was applied to production geometry. GPU meshing, Marching Cubes, topology and repair are outside this prototype.\n`;

await mkdir(new URL("./reports/", import.meta.url), { recursive: true });
await writeFile(reportJsonUrl, `${JSON.stringify(report, null, 2)}\n`);
await writeFile(reportMarkdownUrl, markdown);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
