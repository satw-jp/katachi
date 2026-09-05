import assert from "node:assert/strict";
import test from "node:test";

import type { HanaViewportStroke } from "./gesture.ts";
import {
  createDefaultHanaEditorState,
  createHanaAuthoringDocument,
  migrateHanaDocument,
  serializeHanaAuthoringDocument,
  validateHanaAuthoringDocument,
} from "./authoringDocument.ts";
import { applyHanaProjectionRedraw, createHanaProjectionRedrawIntent } from "./projectionRedraw.ts";
import type { HanaStroke3D } from "./stroke3d.ts";

function sourceStroke(): HanaStroke3D {
  return {
    id: "stroke-1",
    sourceGestureId: "gesture-original",
    sourceViewportId: "viewport-front",
    sourceViewDirection: "front",
    initialPlaneValue: 7,
    curve: { type: "catmull-rom", parameterization: "centripetal", alpha: 0.5, samplesPerSegment: 8, smoothness: 0 },
    controlPoints: [0, 1, 2, 3].map((index) => ({
      id: `control-${index + 1}`,
      position: { x: index, y: 10 + index, z: index * 2 },
      provenance: {
        sourceStroke: "gesture-original",
        sourceT: index / 3,
        sourcePointStart: index,
        sourcePointEnd: index,
        pressure: 0.4,
        time: index * 10,
      },
    })),
  };
}

function gesture(direction: HanaViewportStroke["viewDirection"], points: Array<{ x: number; y: number }>): HanaViewportStroke {
  return {
    id: "gesture-redraw",
    viewportId: `viewport-${direction}`,
    viewDirection: direction,
    pointerType: "pen",
    viewportSize: { width: 100, height: 100 },
    points: points.map((point, index) => ({ ...point, pressure: 0.5, time: index * 10 })),
  };
}

function apply(direction: HanaViewportStroke["viewDirection"], points: Array<{ x: number; y: number }>) {
  return applyHanaProjectionRedraw(sourceStroke(), gesture(direction, points), {
    pointToWorld: (point) => direction === "front"
      ? { x: point.x, y: 999, z: point.y }
      : direction === "right"
        ? { x: 999, y: point.x, z: point.y }
        : { x: point.x, y: point.y, z: 999 },
  });
}

test("Front redraw updates X/Z and inherits Y", () => {
  const result = apply("front", [{ x: 20, y: 30 }, { x: 40, y: 60 }]);
  const positions = result.stroke.controlPoints.map((point) => point.position);
  assert.deepEqual(positions.map((position) => position.y), [10, 11, 12, 13]);
  assert.deepEqual(positions.map((position) => position.z), [30, 40, 50, 60]);
  assert.ok(Math.abs(positions[0].x - 20) < 1e-9);
  assert.ok(Math.abs(positions[1].x - 26.666666666666667) < 1e-9);
  assert.ok(Math.abs(positions[2].x - 33.33333333333333) < 1e-9);
  assert.ok(Math.abs(positions[3].x - 40) < 1e-9);
  assert.deepEqual(result.visibleAxes, ["x", "z"]);
  assert.equal(result.inheritedAxis, "y");
});

test("Right and Top redraws keep their hidden axis unchanged", () => {
  const right = apply("right", [{ x: 20, y: 30 }, { x: 40, y: 60 }]);
  assert.equal(right.stroke.controlPoints[0].position.x, 0);
  assert.equal(right.stroke.controlPoints[3].position.y, 40);
  assert.equal(right.stroke.controlPoints[3].position.z, 60);
  const top = apply("top", [{ x: 20, y: 30 }, { x: 40, y: 60 }]);
  assert.equal(top.stroke.controlPoints[0].position.z, 0);
  assert.equal(top.stroke.controlPoints[3].position.x, 40);
  assert.equal(top.stroke.controlPoints[3].position.y, 60);
});

test("Redraw preserves Stroke, Control Point identity, original provenance and accepts reverse input", () => {
  const source = sourceStroke();
  const result = applyHanaProjectionRedraw(source, gesture("front", [{ x: 40, y: 60 }, { x: 20, y: 30 }]), {
    pointToWorld: (point) => ({ x: point.x, y: 999, z: point.y }),
    pointToView: (position) => ({ x: position.x * 1, y: position.z * 1 }),
  });
  assert.equal(result.stroke.id, source.id);
  assert.deepEqual(result.stroke.controlPoints.map((point) => point.id), source.controlPoints.map((point) => point.id));
  assert.deepEqual(result.stroke.controlPoints.map((point) => point.provenance), source.controlPoints.map((point) => point.provenance));
  assert.equal(result.reversed, true);
  const intent = createHanaProjectionRedrawIntent("redraw-1", source.id, "gesture-redraw", "front", result);
  assert.deepEqual(intent.controlPointIds, source.controlPoints.map((point) => point.id));
  assert.equal(intent.rawGestureId, "gesture-redraw");
});

test("Duplicate samples are safe and endpoints are exact", () => {
  const result = apply("front", [{ x: 2, y: 4 }, { x: 2, y: 4 }, { x: 10, y: 20 }, { x: 10, y: 20 }]);
  assert.deepEqual(result.stroke.controlPoints[0].position, { x: 2, y: 10, z: 4 });
  assert.deepEqual(result.stroke.controlPoints[3].position, { x: 10, y: 13, z: 20 });
});

test("Empty, invalid and zero-length redraws are rejected", () => {
  const source = sourceStroke();
  const options = { pointToWorld: (point: { x: number; y: number }) => ({ x: point.x, y: 0, z: point.y }) };
  assert.throws(() => applyHanaProjectionRedraw(source, gesture("front", [{ x: 1, y: 1 }]), options), /at least two/);
  assert.throws(() => applyHanaProjectionRedraw(source, gesture("front", [{ x: 1, y: 1 }, { x: 1, y: 1 }]), options), /zero length/);
  assert.throws(() => applyHanaProjectionRedraw(source, gesture("front", [{ x: Number.NaN, y: 1 }, { x: 2, y: 2 }]), options), /finite/);
});

test("Redraw raw source and intent survive authoring Save/Load without derived data", () => {
  const source = sourceStroke();
  const redraw = applyHanaProjectionRedraw(source, gesture("right", [{ x: 5, y: 2 }, { x: 8, y: 9 }]), {
    pointToWorld: (point) => ({ x: 77, y: point.x, z: point.y }),
  });
  const intent = createHanaProjectionRedrawIntent("redraw-1", source.id, "gesture-redraw", "right", redraw);
  const next = { ...redraw.stroke, projectionRedraws: [intent] };
  const document = createHanaAuthoringDocument(
    [
      {
        ...gesture("front", [{ x: 0, y: 0 }, { x: 1, y: 1 }]),
        id: source.sourceGestureId,
      },
      gesture("right", [{ x: 5, y: 2 }, { x: 8, y: 9 }]),
    ],
    [next],
    { documentId: "redraw-save", editorState: createDefaultHanaEditorState() },
  );
  const serialized = serializeHanaAuthoringDocument(document);
  assert.equal(serialized.includes("materialSamples"), false);
  const reloaded = migrateHanaDocument(JSON.parse(serialized));
  assert.deepEqual(reloaded.rawGestures.strokes.map((item) => item.id), ["gesture-original", "gesture-redraw"]);
  assert.equal(reloaded.strokes[0].projectionRedraws?.[0]?.rawGestureId, "gesture-redraw");
  assert.equal(reloaded.strokes[0].projectionRedraws?.[0]?.sourceStrokeId, source.id);
  assert.deepEqual(reloaded.strokes[0].controlPoints.map((point) => point.id), source.controlPoints.map((point) => point.id));
  assert.equal(validateHanaAuthoringDocument(reloaded).valid, true);
});
