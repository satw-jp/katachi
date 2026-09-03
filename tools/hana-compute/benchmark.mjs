import { performance } from "node:perf_hooks";
import { defaultHanaMaterialSettings } from "../../src/studies/hana/authoringDocument.ts";
import { computeHanaFinalization, createHanaFinalizationSnapshot } from "../../src/studies/hana/finalizationCore.ts";
import { deriveStroke3D } from "../../src/studies/hana/stroke3d.ts";
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

const fixtures = [snapshot("short", 8), snapshot("medium", 32), snapshot("long", 128)];
const report = fixtures.map(({ label, snapshot: source }) => {
  const work = estimateHanaComputeWork(source);
  const recommended = work.materialSamples >= HANA_AUTO_THRESHOLDS.materialSamplesForWindows
    || work.estimatedVoxels >= HANA_AUTO_THRESHOLDS.estimatedVoxelsForWindows
    ? "windows"
    : "local";
  return { label, ...work, recommendedWhenWindowsReady: recommended };
});

if (process.argv.includes("--compute")) {
  for (const { label, snapshot: source } of fixtures.slice(0, 2)) {
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
