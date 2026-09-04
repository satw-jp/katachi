import assert from "node:assert/strict";
import test from "node:test";

import {
  applyHanaAxisConstraint,
  hanaGizmoArrowTip,
  hanaGizmoAxisScreenDelta,
  hanaViewportGizmoAxes,
  hanaWorldAxisVector,
  hitTestHanaGizmoAxis,
  resolveHanaViewportEditPlane,
} from "./moveGizmo.ts";
import { applySoftViewportEdit } from "./smoothCenterline.ts";
import type { HanaStroke3D } from "./stroke3d.ts";

function stroke(): HanaStroke3D {
  return {
    id: "stroke-1",
    sourceGestureId: "gesture-1",
    sourceViewportId: "viewport-front",
    sourceViewDirection: "front",
    initialPlaneValue: 0,
    curve: { type: "catmull-rom", parameterization: "centripetal", alpha: 0.5, samplesPerSegment: 8, smoothness: 0 },
    controlPoints: [0, 1, 2, 3, 4].map((index) => ({
      id: `control-${index + 1}`,
      position: { x: index, y: index * 2, z: index * 3 },
      provenance: { sourceStroke: "gesture-1", sourceT: index / 4, sourcePointStart: index, sourcePointEnd: index, pressure: 0.5, time: index },
    })),
  };
}

test("each viewport shows only the meaningful world axes", () => {
  assert.deepEqual(hanaViewportGizmoAxes("top"), ["x", "y"]);
  assert.deepEqual(hanaViewportGizmoAxes("front"), ["x", "z"]);
  assert.deepEqual(hanaViewportGizmoAxes("right"), ["y", "z"]);
  assert.deepEqual(hanaViewportGizmoAxes("axome"), ["x", "y", "z"]);
  assert.deepEqual(hanaWorldAxisVector("x"), { x: 1, y: 0, z: 0 });
  assert.deepEqual(hanaWorldAxisVector("y"), { x: 0, y: 1, z: 0 });
  assert.deepEqual(hanaWorldAxisVector("z"), { x: 0, y: 0, z: 1 });
});

test("direct planar drag freezes exactly one world component", () => {
  assert.equal(resolveHanaViewportEditPlane("top"), "z");
  assert.equal(resolveHanaViewportEditPlane("front"), "y");
  assert.equal(resolveHanaViewportEditPlane("right"), "x");
  const top = stroke();
  applySoftViewportEdit(top, 2, "top", { x: 9, y: 8, z: 7 }, "off");
  assert.equal(top.controlPoints[2].position.z, 6);
  const front = stroke();
  applySoftViewportEdit(front, 2, "front", { x: 9, y: 8, z: 7 }, "off");
  assert.equal(front.controlPoints[2].position.y, 4);
  const right = stroke();
  applySoftViewportEdit(right, 2, "right", { x: 9, y: 8, z: 7 }, "off");
  assert.equal(right.controlPoints[2].position.x, 2);
});

test("axis constraint keeps the other components exactly", () => {
  const original = { x: 1, y: 2, z: 3 };
  assert.deepEqual(applyHanaAxisConstraint(original, { x: 9, y: 8, z: 7 }, "x"), { x: 9, y: 2, z: 3 });
  assert.deepEqual(applyHanaAxisConstraint(original, { x: 9, y: 8, z: 7 }, "y"), { x: 1, y: 8, z: 3 });
  assert.deepEqual(applyHanaAxisConstraint(original, { x: 9, y: 8, z: 7 }, "z"), { x: 1, y: 2, z: 7 });
});

test("axis screen drag maps pointer travel onto the world axis", () => {
  const delta = hanaGizmoAxisScreenDelta({
    startPointer: { x: 100, y: 100 },
    currentPointer: { x: 140, y: 100 },
    axisOriginScreen: { x: 100, y: 100 },
    axisUnitTipScreen: { x: 120, y: 100 },
  });
  assert.equal(delta, 2);
  const vertical = hanaGizmoAxisScreenDelta({
    startPointer: { x: 100, y: 100 },
    currentPointer: { x: 140, y: 100 },
    axisOriginScreen: { x: 100, y: 100 },
    axisUnitTipScreen: { x: 100, y: 120 },
  });
  assert.equal(vertical, 0);
  const degenerate = hanaGizmoAxisScreenDelta({
    startPointer: { x: 100, y: 100 },
    currentPointer: { x: 140, y: 100 },
    axisOriginScreen: { x: 100, y: 100 },
    axisUnitTipScreen: { x: 100, y: 100 },
  });
  assert.equal(degenerate, 0);
});

test("arrow tips stay a constant screen length from the origin", () => {
  const tip = hanaGizmoArrowTip({ x: 50, y: 50 }, { x: 70, y: 50 }, 46);
  assert.equal(Math.hypot(tip.x - 50, tip.y - 50), 46);
});

test("gizmo hit prefers the nearest axis and stays reachable for points", () => {
  const origin = { x: 100, y: 100 };
  const tips = { x: { x: 146, y: 100 }, y: { x: 100, y: 146 } };
  assert.equal(hitTestHanaGizmoAxis({ x: 130, y: 103 }, origin, tips, 14), "x");
  assert.equal(hitTestHanaGizmoAxis({ x: 103, y: 130 }, origin, tips, 14), "y");
  assert.equal(hitTestHanaGizmoAxis({ x: 100, y: 100 }, origin, tips, 14), null);
  assert.equal(hitTestHanaGizmoAxis({ x: 200, y: 200 }, origin, tips, 14), null);
  assert.equal(hitTestHanaGizmoAxis({ x: 130, y: 103 }, origin, {}, 14), null);
});
