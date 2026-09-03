import { performance } from "node:perf_hooks";
import { defaultHanaMaterialSettings } from "../../src/studies/hana/authoringDocument.ts";
import { createHanaAuthoringStudy } from "../../src/studies/hana/authoringStudy.ts";
import { createHanaSmallCluster } from "../../src/studies/hana/authoringCluster.ts";
import { computeHanaFinalization, createHanaFinalizationSnapshot } from "../../src/studies/hana/finalizationCore.ts";
import { deriveStroke3D } from "../../src/studies/hana/stroke3d.ts";
import { stroke3DFromHanaStroke } from "../../src/studies/hana/authoringDocument.ts";
import {
  HANA_AUTO_THRESHOLDS,
  estimateHanaComputeWork,
} from "../../src/studies/hana/computeBackend.ts";

function snapshot(label, controlCount) {
  const raw = {
    id: `benchmark-${label}`,
    viewportId: "viewport-front",
    viewDirection: "front",
    pointerType: "pen",
    viewportSize: { width: 2048, height: 2048 },
    points: Array.from({ length: controlCount }, (_, index) => ({
      x: index * 0.25,
      y: Math.sin(index * 0.17) * 0.35,
      pressure: 0.5,
      time: index * 16,
    })),
  };
  return {
    label,
    snapshot: createHanaFinalizationSnapshot({
      requestId: `benchmark-${label}`,
      documentId: "hana-remote-benchmark",
      documentRevision: 1,
      objectRevision: 1,
      generationId: 1,
      stroke: deriveStroke3D(raw, (point) => ({ x: point.x, y: 0, z: point.y }), controlCount),
      materialSettings: defaultHanaMaterialSettings(0.18),
    }),
  };
}

function snapshotFromStroke(document, stroke, generationId) {
  return createHanaFinalizationSnapshot({
    requestId: `benchmark-${document.documentId}-${stroke.id}`,
    documentId: document.documentId,
    documentRevision: document.revision,
    objectRevision: stroke.revision,
    generationId,
    stroke: stroke3DFromHanaStroke(stroke),
    materialSettings: stroke.materialSettings,
  });
}

function aggregateFixture(label, sources, objectCount = sources.length, dependencyCount = 0) {
  const estimates = sources.map((source) => estimateHanaComputeWork(source));
  const work = estimates.reduce((total, item) => ({
    controls: total.controls + item.controls,
    smooth: total.smooth + item.smooth,
    materialSamples: total.materialSamples + item.materialSamples,
    boundsVolume: total.boundsVolume + item.boundsVolume,
    estimatedVoxels: total.estimatedVoxels + item.estimatedVoxels,
    candidateCountEstimate: total.candidateCountEstimate + item.candidateCountEstimate,
  }), {
    controls: 0,
    smooth: 0,
    materialSamples: 0,
    boundsVolume: 0,
    estimatedVoxels: 0,
    candidateCountEstimate: 0,
  });
  const recommended = work.materialSamples >= HANA_AUTO_THRESHOLDS.materialSamplesForWindows
    || work.estimatedVoxels >= HANA_AUTO_THRESHOLDS.estimatedVoxelsForWindows
    ? "windows"
    : "local";
  return {
    label,
    ...work,
    objectCount,
    dependencyCount,
    recommendedWhenWindowsReady: recommended,
    sources: sources.length,
  };
}

const baseFixtures = [snapshot("short", 8), snapshot("medium", 32), snapshot("long", 128)];
const study = createHanaAuthoringStudy();
const studySnapshots = study.document.strokes.map((stroke, index) => snapshotFromStroke(study.document, stroke, index + 1));
const flowerStrokeIds = new Set([...study.flowers[0].petalStrokeIds, ...study.flowers[0].coreStrokeIds]);
const flowerSources = studySnapshots.filter((source) => flowerStrokeIds.has(source.objectId));
const cluster = createHanaSmallCluster(study);
const groupedFixtures = [
  aggregateFixture("flower", flowerSources, flowerSources.length + 1, 1),
  aggregateFixture("small-cluster", studySnapshots, cluster.materialObjects.length, cluster.graph.edges.length),
  aggregateFixture("multiple-objects", studySnapshots, studySnapshots.length, 0),
  aggregateFixture("surface-draw", [studySnapshots[0]], 1, 0),
];
const report = [
  ...baseFixtures.map(({ label, snapshot: source }) => {
    const work = estimateHanaComputeWork(source);
    const recommended = work.materialSamples >= HANA_AUTO_THRESHOLDS.materialSamplesForWindows
      || work.estimatedVoxels >= HANA_AUTO_THRESHOLDS.estimatedVoxelsForWindows
      ? "windows"
      : "local";
    return { label, ...work, recommendedWhenWindowsReady: recommended };
  }),
  ...groupedFixtures,
];

const computeFixtures = baseFixtures;
/* Keep optional CPU measurement bounded to the original short/medium smoke. */

if (process.argv.includes("--compute")) {
  for (const { label, snapshot: source } of computeFixtures.slice(0, 2)) {
    const started = performance.now();
    const result = await computeHanaFinalization(source, undefined, {
      zSlicesPerYield: 8,
      yieldToBrowser: async () => undefined,
    });
    const elapsed = performance.now() - started;
    const item = report.find((entry) => entry.label === label);
    if (item) Object.assign(item, { measuredMilliseconds: elapsed, triangles: result.counts.triangles });
  }
}

console.log(JSON.stringify({
  engine: "cpu-js-v0",
  gpu: false,
  thresholds: HANA_AUTO_THRESHOLDS,
  fixtures: report,
}, null, 2));
