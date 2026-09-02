import assert from "node:assert/strict";
import test from "node:test";

import { createBoundedStrokePreview, HANA_MOUSE_EDIT_PREVIEW_MAX_CONTROLS } from "./editPreview.ts";
import type { HanaStroke3D } from "./stroke3d.ts";

function stroke(controlCount: number): HanaStroke3D {
  return {
    id: "preview-fixture",
    sourceGestureId: "gesture-1",
    viewDirection: "front",
    curve: { alpha: 0.5, samplesPerSegment: 8, smoothness: 0.4 },
    controlPoints: Array.from({ length: controlCount }, (_, index) => ({
      id: `control-${index + 1}`,
      position: { x: index, y: index * 2, z: -index },
      provenance: {
        sourcePointStart: index,
        sourcePointEnd: index,
        sourceT: index / Math.max(1, controlCount - 1),
        pressure: 0.5,
        time: index,
      },
    })),
  };
}

test("Mouse Edit preview is bounded, deterministic, and keeps endpoints/provenance", () => {
  const source = stroke(972);
  const before = structuredClone(source);
  const preview = createBoundedStrokePreview(source);
  assert.equal(preview.controlPoints.length, HANA_MOUSE_EDIT_PREVIEW_MAX_CONTROLS);
  assert.deepEqual(preview.controlPoints[0], source.controlPoints[0]);
  assert.deepEqual(preview.controlPoints.at(-1), source.controlPoints.at(-1));
  assert.deepEqual(createBoundedStrokePreview(source), preview);
  assert.ok(preview.controlPoints.every((point) => (
    source.controlPoints.some((candidate) => candidate.provenance.sourceT === point.provenance.sourceT)
  )));
  assert.deepEqual(source, before);
});

test("Short Mouse Edit preview preserves every control", () => {
  const source = stroke(7);
  assert.deepEqual(createBoundedStrokePreview(source), source);
});
