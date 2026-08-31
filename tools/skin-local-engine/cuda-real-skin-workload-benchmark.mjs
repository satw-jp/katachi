import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import {
  createEvaluateContainmentJob,
  EXPECTED_CUDA_DEVICE_NAME,
  EXPECTED_CUDA_EXECUTABLE_SHA256,
} from "../../src/studies/skin/rebuild/geometryEngine/contracts.ts";
import { compareContainmentResults } from "../../src/studies/skin/rebuild/geometryEngine/resultComparison.ts";
import { evaluateContainmentShadow } from "../../src/studies/skin/rebuild/geometryEngine/shadowEvaluateContainment.ts";
import { evaluateContainmentOnWeb } from "../../src/studies/skin/rebuild/geometryEngine/webGeometryEngine.ts";
import { WindowsLocalGeometryEngineClient } from "../../src/studies/skin/rebuild/geometryEngine/windowsLocalClient.ts";
import { computeSkinSamplingBounds } from "../../src/studies/skin/meshExport.ts";
import { buildSkinRebuildProject } from "../../src/studies/skin/rebuild/model.ts";
import { probeWindowsCapability } from "./probe-windows-capability.mjs";
import { createLocalEngineServer, FIXED_HOST, FIXED_PORT } from "./server.mjs";

const WARM_RUNS = 10;
const PRODUCTION_ORIGIN = "https://katachi.a-8c3.workers.dev";
const fixtureUrl = new URL("./fixtures/real-skin-120mm-containment-v1.json", import.meta.url);
const reportJsonUrl = new URL("./benchmarks/cuda-real-skin-workload-2026-08-31.json", import.meta.url);
const reportMarkdownUrl = new URL("./benchmarks/cuda-real-skin-workload-2026-08-31.md", import.meta.url);

if (process.platform !== "win32") {
  process.stdout.write(`${JSON.stringify({ skipped: true, reason: "windows_required" })}\n`);
  process.exit(0);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function length(first, second) {
  return Math.hypot(second.x - first.x, second.y - first.y, second.z - first.z);
}

function buildRealRequest() {
  const buildStart = performance.now();
  const { project } = buildSkinRebuildProject();
  const bounds = computeSkinSamplingBounds(
    project.base.host,
    project.base.hostK,
    project.settings.surfaceThickness,
    project.patterns,
  );
  const scaleMmPerUnit = project.settings.targetLongestMm / bounds.longest;
  const samples = [];
  const edgeSampleCounts = [];
  for (const edge of project.lattice.edges) {
    const start = project.lattice.nodes[edge.start]?.position;
    const end = project.lattice.nodes[edge.end]?.position;
    if (!start || !end || !(edge.radius > 0)) throw new Error(`invalid real lattice edge ${edge.id}`);
    const sampleStep = Math.max(edge.radius * 0.2, 1e-4);
    const intervals = Math.max(2, Math.min(512, Math.ceil(length(start, end) / sampleStep)));
    edgeSampleCounts.push(intervals + 1);
    for (let index = 0; index <= intervals; index += 1) {
      const t = index / intervals;
      samples.push({
        sampleId: `skin120-edge-${edge.id}-sample-${index}`,
        edgeId: `skin120-edge-${edge.id}`,
        position: {
          x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t,
          z: start.z + (end.z - start.z) * t,
        },
        radius: edge.radius,
      });
    }
  }
  const sourceIdentity = {
    algorithmVersion: project.algorithmVersion,
    settings: project.settings,
    base: project.base,
    lattice: project.lattice,
  };
  const projectDigest = sha256(JSON.stringify(sourceIdentity));
  const request = createEvaluateContainmentJob({
    clientRequestId: "real-skin-120mm-containment",
    projectFingerprint: `sha256:${projectDigest}`,
    coordinateContract: {
      frame: "object",
      unitsPerMillimeter: 1 / scaleMmPerUnit,
      handedness: "right",
      buildAxis: "+z",
    },
    quality: {
      purpose: "real-skin-shadow-benchmark",
      sourceAlgorithmVersion: project.algorithmVersion,
      benchmarkIterations: 1,
    },
    input: {
      base: {
        kind: "metaball-smooth-union",
        contractVersion: 1,
        balls: project.base.host.map((ball, index) => ({
          id: Number.isInteger(ball.id) ? ball.id : index + 1,
          x: ball.x,
          y: ball.y,
          z: ball.z,
          r: ball.r,
        })),
        smoothness: project.base.hostK,
      },
      samples,
      boundaryTolerance: 1e-6,
    },
  });
  return {
    request,
    source: {
      source: "buildSkinRebuildProject(DEFAULT_SKIN_REBUILD_SETTINGS)",
      targetLongestMm: project.settings.targetLongestMm,
      strutDiameterMm: project.settings.strutDiameterMm,
      algorithmVersion: project.algorithmVersion,
      hostBallCount: project.base.host.length,
      patternCount: project.patterns.length,
      latticeNodeCount: project.lattice.nodes.length,
      latticeEdgeCount: project.lattice.edges.length,
      sampleCount: samples.length,
      minimumSamplesPerEdge: Math.min(...edgeSampleCounts),
      maximumSamplesPerEdge: Math.max(...edgeSampleCounts),
      scaleMmPerUnit,
      projectDigest,
      projectAudit: project.audit,
      requestGenerationMilliseconds: performance.now() - buildStart,
      samplingRule: "production sampledLatticeEdgeBaseExcess density: step=max(edge.radius*0.2,1e-4), intervals clamp [2,512], endpoints included",
      semanticDifference: "portable GeometryEngine request intentionally omits production attachment-site exemptions; it evaluates the complete cylinder radius against Base only",
    },
  };
}

function productionFetch(input, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Origin", PRODUCTION_ORIGIN);
  return fetch(input, { ...init, headers });
}

function assertMatched(request, outcome) {
  assert.equal(outcome.candidateStatus, "candidate_matched", outcome.fallback?.detail);
  assert.equal(outcome.comparison?.matched, true);
  assert.equal(outcome.comparison?.missingSampleIds.length, 0);
  assert.equal(outcome.comparison?.discreteMismatchSampleIds.length, 0);
  assert.equal(outcome.authoritative.backend.backendKind, "web");
  assert.equal(outcome.authoritative.productionApplied, false);
  assert.equal(outcome.candidate?.backend.deviceName, EXPECTED_CUDA_DEVICE_NAME);
  assert.equal(outcome.candidate?.backend.artifactSha256, EXPECTED_CUDA_EXECUTABLE_SHA256);
  assert.equal(outcome.candidate?.result.samples.length, request.input.samples.length);
  assert.equal(outcome.shadowOnly, true);
  assert.equal(outcome.productionApplied, false);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function summarize(runs) {
  return {
    runCount: runs.length,
    fullApplicationMilliseconds: median(runs.map((run) => run.fullApplicationMilliseconds)),
    clientTotalMilliseconds: median(runs.map((run) => run.clientTiming.totalMilliseconds)),
    requestEncodingMilliseconds: median(runs.map((run) => run.clientTiming.requestEncodingMilliseconds)),
    httpRoundTripMilliseconds: median(runs.map((run) => run.clientTiming.httpRoundTripMilliseconds)),
    workerMilliseconds: median(runs.map((run) => run.clientTiming.workerTotalMilliseconds ?? 0)),
    responseDecodeMilliseconds: median(runs.map((run) => run.clientTiming.responseDecodeMilliseconds)),
    semanticValidationMilliseconds: median(runs.map((run) => run.clientTiming.semanticValidationMilliseconds)),
    cudaEndToEndMilliseconds: median(runs.map((run) => run.cudaTiming.endToEndMilliseconds)),
    cudaKernelMilliseconds: median(runs.map((run) => run.cudaTiming.kernelAverageMilliseconds)),
    maximumAbsoluteMarginDelta: Math.max(...runs.map((run) => run.maximumAbsoluteMarginDelta)),
    allMatched: runs.every((run) => run.matched),
  };
}

const generated = buildRealRequest();
await writeFile(fixtureUrl, `${JSON.stringify({
  contract: "katachi.real-skin-containment-fixture.v1",
  generatedAt: "2026-08-31T00:00:00.000Z",
  source: generated.source,
  request: generated.request,
}, null, 2)}\n`);
const checkedFixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
assert.equal(checkedFixture.source.targetLongestMm, 120);
assert.equal(checkedFixture.request.input.samples.length, generated.source.sampleCount);
assert.equal(sha256(JSON.stringify(checkedFixture.request)), sha256(JSON.stringify(generated.request)));

const probe = probeWindowsCapability();
assert.equal(probe.cudaBackend.available, true, probe.cudaBackend.reasonCode);
const server = createLocalEngineServer({ probe });
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(FIXED_PORT, FIXED_HOST, resolve);
});

const request = generated.request;
const client = new WindowsLocalGeometryEngineClient({ fetch: productionFetch, transport: "binary" });
const webReferenceRuns = [];
let webReferenceResult;
for (let index = 0; index < WARM_RUNS; index += 1) {
  const start = performance.now();
  webReferenceResult = evaluateContainmentOnWeb(request);
  webReferenceRuns.push(performance.now() - start);
}
const classificationCounts = Object.fromEntries(["inside", "boundary", "outside", "unknown"]
  .map((classification) => [classification, webReferenceResult.result.samples
    .filter((sample) => sample.classification === classification).length]));
const report = {
  contract: "katachi.cuda-real-skin-workload-benchmark.v1",
  recordedAt: new Date().toISOString(),
  source: generated.source,
  fixture: {
    path: "tools/skin-local-engine/fixtures/real-skin-120mm-containment-v1.json",
    requestSha256: sha256(JSON.stringify(request)),
  },
  policy: { authoritativeBackend: "web", candidateBackend: "cuda", shadow: true, productionApplied: false },
  webReference: {
    runCount: WARM_RUNS,
    medianMilliseconds: median(webReferenceRuns),
    classificationCounts,
    contained: webReferenceResult.result.summary.contained,
    outsideEdgeCount: webReferenceResult.result.summary.outsideEdgeIds.length,
    outsideSampleCount: webReferenceResult.result.summary.outsideSampleIds.length,
  },
  outerBinary: { cold: null, warm: [] },
  session: { firstUpload: null, warm: [] },
  fallback: null,
};

try {
  for (let index = 0; index <= WARM_RUNS; index += 1) {
    const activeRequest = { ...request, clientRequestId: `real-skin-outer-${index}` };
    const start = performance.now();
    const outcome = await evaluateContainmentShadow(activeRequest, {
      preferWindowsCuda: true,
      localClient: client,
      comparisonMarginTolerance: activeRequest.input.boundaryTolerance,
    });
    const fullApplicationMilliseconds = performance.now() - start;
    assertMatched(activeRequest, outcome);
    const record = {
      index,
      fullApplicationMilliseconds,
      clientTiming: client.getLastTransportTiming(),
      cudaTiming: outcome.candidate.backend.timing,
      matched: outcome.comparison.matched,
      maximumAbsoluteMarginDelta: outcome.comparison.maximumAbsoluteMarginDelta,
      missingSampleCount: outcome.comparison.missingSampleIds.length,
      mismatchSampleCount: outcome.comparison.discreteMismatchSampleIds.length,
      shadow: outcome.shadowOnly,
      productionApplied: outcome.productionApplied,
    };
    if (index === 0) report.outerBinary.cold = record;
    else report.outerBinary.warm.push(record);
  }

  const sessionClient = new WindowsLocalGeometryEngineClient({ fetch: productionFetch, transport: "binary" });
  const sessionRequest = { ...request, clientRequestId: "real-skin-session-upload" };
  const firstStart = performance.now();
  const first = await sessionClient.createContainmentShadowSession(sessionRequest);
  const firstAuthoritative = evaluateContainmentOnWeb(sessionRequest);
  const firstComparison = compareContainmentResults(
    sessionRequest,
    firstAuthoritative,
    first.result,
    sessionRequest.input.boundaryTolerance,
  );
  assert.equal(firstComparison.matched, true);
  report.session.firstUpload = {
    fullApplicationMilliseconds: performance.now() - firstStart,
    clientTiming: sessionClient.getLastTransportTiming(),
    maximumAbsoluteMarginDelta: firstComparison.maximumAbsoluteMarginDelta,
    matched: firstComparison.matched,
  };
  report.session.binding = first.session;
  for (let index = 1; index <= WARM_RUNS; index += 1) {
    const start = performance.now();
    const repeated = await sessionClient.evaluateContainmentShadowSession(first.session.sessionId, {
      clientRequestId: `real-skin-session-${index}`,
      benchmarkIterations: 1,
    });
    const authoritative = evaluateContainmentOnWeb(repeated.request);
    const comparison = compareContainmentResults(
      repeated.request,
      authoritative,
      repeated.result,
      repeated.request.input.boundaryTolerance,
    );
    assert.equal(comparison.matched, true);
    report.session.warm.push({
      index,
      fullApplicationMilliseconds: performance.now() - start,
      clientTiming: sessionClient.getLastTransportTiming(),
      cudaTiming: repeated.result.backend.timing,
      matched: comparison.matched,
      maximumAbsoluteMarginDelta: comparison.maximumAbsoluteMarginDelta,
      shadow: repeated.result.shadow,
      productionApplied: repeated.result.productionApplied,
    });
  }
  await sessionClient.releaseContainmentShadowSession(first.session.sessionId);
} finally {
  await new Promise((resolve) => server.close(resolve));
}

const fallbackClient = new WindowsLocalGeometryEngineClient({
  fetch: async () => { throw new TypeError("helper unavailable for fallback verification"); },
  probeTimeoutMs: 20,
});
const fallback = await evaluateContainmentShadow(request, {
  preferWindowsCuda: true,
  localClient: fallbackClient,
  comparisonMarginTolerance: request.input.boundaryTolerance,
});
assert.equal(fallback.candidateStatus, "helper_unavailable");
assert.equal(fallback.authoritative.backend.backendKind, "web");
assert.equal(fallback.productionApplied, false);
report.fallback = {
  candidateStatus: fallback.candidateStatus,
  fallback: fallback.fallback,
  authoritativeBackend: fallback.authoritative.backend.backendKind,
  shadow: fallback.shadowOnly,
  productionApplied: fallback.productionApplied,
};
report.summary = {
  outerBinaryCold: report.outerBinary.cold,
  outerBinaryWarm: summarize(report.outerBinary.warm),
  sessionWarm: summarize(report.session.warm),
};

await writeFile(reportJsonUrl, `${JSON.stringify(report, null, 2)}\n`);
const outer = report.summary.outerBinaryWarm;
const session = report.summary.sessionWarm;
const lines = [
  "# CUDA-4C Real SKIN Workload Shadow Benchmark",
  "",
  `Current 120 mm project: ${generated.source.hostBallCount} Base balls, ${generated.source.patternCount} patterns, ${generated.source.latticeNodeCount} lattice nodes, ${generated.source.latticeEdgeCount} lattice edges, ${generated.source.sampleCount} containment samples.`,
  "",
  "| Path (10 warm runs, median) | Full Web + CUDA compare | Client | Worker | CUDA e2e | Kernel | Max margin Δ |",
  "|:---|---:|---:|---:|---:|---:|---:|",
  `| outer binary | ${outer.fullApplicationMilliseconds.toFixed(2)} ms | ${outer.clientTotalMilliseconds.toFixed(2)} ms | ${outer.workerMilliseconds.toFixed(2)} ms | ${outer.cudaEndToEndMilliseconds.toFixed(3)} ms | ${outer.cudaKernelMilliseconds.toFixed(3)} ms | ${outer.maximumAbsoluteMarginDelta.toExponential(3)} |`,
  `| session repeat | ${session.fullApplicationMilliseconds.toFixed(2)} ms | ${session.clientTotalMilliseconds.toFixed(2)} ms | ${session.workerMilliseconds.toFixed(2)} ms | ${session.cudaEndToEndMilliseconds.toFixed(3)} ms | ${session.cudaKernelMilliseconds.toFixed(3)} ms | ${session.maximumAbsoluteMarginDelta.toExponential(3)} |`,
  "",
  `Web-only reference median was ${report.webReference.medianMilliseconds.toFixed(2)} ms. Classifications: ${report.webReference.classificationCounts.inside} inside, ${report.webReference.classificationCounts.boundary} boundary, ${report.webReference.classificationCounts.outside} outside.`,
  "",
  `Cold outer-binary full path was ${report.outerBinary.cold.fullApplicationMilliseconds.toFixed(2)} ms, including worker/context/PTX startup.`,
  "",
  "All ordered sample/edge identities and classifications matched; no samples were missing. Web remained authoritative and every CUDA result reported `productionApplied=false`.",
  "",
  "The fixture copies current default-project Base and permanent lattice topology into the portable benchmark contract. It deliberately does not encode the production attachment-site exemption, so it is a faithful workload/transport fixture rather than a replacement for the production audit.",
  "",
  "With the real 8,159-sample workload, the warm shadow path is judged interactively useful when its measured full comparison remains near or below the 100 ms reference. Helper failure was also verified to keep the Web result authoritative.",
];
await writeFile(reportMarkdownUrl, `${lines.join("\n")}\n`);
process.stdout.write(`${JSON.stringify({ source: report.source, summary: report.summary, fallback: report.fallback }, null, 2)}\n`);
