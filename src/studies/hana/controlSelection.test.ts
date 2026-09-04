import assert from "node:assert/strict";
import test from "node:test";

import {
  findHanaControlPointIndex,
  reconcileHanaControlPointSelection,
} from "./controlSelection.ts";

const strokes = [
  { id: "stroke-1", controlPointIds: ["control-1", "control-2", "control-3"] },
  { id: "stroke-2", controlPointIds: ["control-1", "control-2"] },
];

test("control identity needs the parent Stroke because point ids repeat", () => {
  assert.deepEqual(findHanaControlPointIndex(strokes, { strokeId: "stroke-1", controlPointId: "control-1" }), { strokeIndex: 0, controlIndex: 0 });
  assert.deepEqual(findHanaControlPointIndex(strokes, { strokeId: "stroke-2", controlPointId: "control-1" }), { strokeIndex: 1, controlIndex: 0 });
  assert.equal(findHanaControlPointIndex(strokes, { strokeId: "stroke-9", controlPointId: "control-1" }), null);
  assert.equal(findHanaControlPointIndex(strokes, { strokeId: "stroke-1", controlPointId: "control-9" }), null);
});

test("reconcile keeps a live selection across viewport switches", () => {
  assert.deepEqual(
    reconcileHanaControlPointSelection({ strokeId: "stroke-1", controlPointId: "control-2" }, strokes),
    { selection: { strokeId: "stroke-1", controlPointId: "control-2" }, controlIndex: 1 },
  );
  assert.deepEqual(reconcileHanaControlPointSelection(null, strokes), { selection: null, controlIndex: null });
});

test("reconcile clears dangling references without throwing", () => {
  assert.deepEqual(
    reconcileHanaControlPointSelection({ strokeId: "stroke-1", controlPointId: "control-2" }, []),
    { selection: null, controlIndex: null },
  );
  assert.deepEqual(
    reconcileHanaControlPointSelection(
      { strokeId: "stroke-1", controlPointId: "control-2" },
      [{ id: "stroke-2", controlPointIds: ["control-1"] }],
    ),
    { selection: null, controlIndex: null },
  );
  assert.deepEqual(
    reconcileHanaControlPointSelection(
      { strokeId: "stroke-1", controlPointId: "control-2" },
      [{ id: "stroke-1", controlPointIds: ["control-1"] }],
    ),
    { selection: null, controlIndex: null },
  );
});
