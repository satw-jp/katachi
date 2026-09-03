import assert from "node:assert/strict";
import test from "node:test";
import { createHanaRemoteObjectJobs } from "./remoteObjectFinalization.ts";
import type { HanaAuthoringDocument } from "./authoringDocument.ts";

function documentFixture(): HanaAuthoringDocument {
  const control = (id: string, sourceStroke: string, x: number) => ({
    id,
    position: { x, y: 0, z: x },
    provenance: { sourceStroke, sourceT: x / 2, sourcePointStart: 0, sourcePointEnd: 1, pressure: 0.5, time: x * 10 },
  });
  return {
    format: "katachi.hana-document.v2",
    documentId: "remote-object-document",
    revision: 7,
    rawGestures: { strokes: [] },
    strokes: [
      {
        id: "stem",
        rawGestureId: "raw-stem",
        controlPoints: [control("stem-0", "raw-stem", 0), control("stem-1", "raw-stem", 2)],
        curveSettings: { alpha: 0.5, samplesPerSegment: 8, smoothness: 0 },
        materialSettings: { mapping: "uniform", baseRadius: 0.18, minRadius: 0.05, maxRadius: 0.5, pressureInfluence: 0, speedInfluence: 0 },
        revision: 2,
        role: "stem",
        visible: true,
      },
      {
        id: "petal",
        rawGestureId: "raw-petal",
        controlPoints: [control("petal-0", "raw-petal", 0), control("petal-1", "raw-petal", 2)],
        curveSettings: { alpha: 0.5, samplesPerSegment: 8, smoothness: 0 },
        materialSettings: { mapping: "pressure", baseRadius: 0.2, minRadius: 0.05, maxRadius: 0.5, pressureInfluence: 0.5, speedInfluence: 0 },
        revision: 1,
        role: "petal",
        visible: true,
      },
    ],
    activeStrokeId: "stem",
    selectedStrokeIds: ["stem", "petal"],
    editorState: {
      viewportMode: "four",
      selectedViewportId: "viewport-front",
      split: { x: 0.5, y: 0.5 },
      softEditStrength: "medium",
      viewports: [],
    },
  };
}

test("authoring document produces independent remote jobs with semantic identity", () => {
  const jobs = createHanaRemoteObjectJobs(documentFixture());
  assert.equal(jobs.length, 2);
  assert.deepEqual(jobs.map((job) => job.objectId), ["stem", "petal"]);
  assert.deepEqual(jobs.map((job) => job.priority), ["active", "visible"]);
  assert.equal(jobs[0]?.snapshot.controls[0]?.provenance.sourceStroke, "raw-stem");
  assert.equal(jobs[1]?.snapshot.materialSettings.mapping, "pressure");
  assert.equal("positions" in jobs[0]!.snapshot, false);
  assert.equal("rawGestures" in jobs[0]!.snapshot, false);
});
