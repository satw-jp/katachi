import assert from "node:assert/strict";
import test from "node:test";
import { createAuthoringGraph } from "./authoringGraph.ts";
import { createHanaAuthoringDocument, hanaStrokeFromStroke3D } from "./authoringDocument.ts";
import { createHanaFlowerFromSelection } from "./flowerAuthoring.ts";
import {
  exportHanaSkinBridge,
  parseHanaSkinBridge,
  serializeHanaSkinBridge,
  validateHanaSkinBridge,
} from "./skinBridge.ts";
import type { HanaStroke3D } from "./stroke3d.ts";
import { createDefaultHanaEditorState } from "./authoringDocument.ts";

function stroke3d(id: string, rawGestureId: string, offset: number): HanaStroke3D {
  return {
    id,
    sourceGestureId: rawGestureId,
    sourceViewDirection: "front",
    controlPoints: [
      {
        position: { x: offset, y: 0, z: 0 },
        provenance: { sourceStroke: rawGestureId, sourceT: 0, sourcePointStart: 0, sourcePointEnd: 0, pressure: 0.2, time: 0 },
      },
      {
        position: { x: offset + 0.5, y: 0, z: 1 },
        provenance: { sourceStroke: rawGestureId, sourceT: 1, sourcePointStart: 1, sourcePointEnd: 1, pressure: 0.4, time: 1 },
      },
    ],
    curveSettings: { alpha: 0.5, samplesPerSegment: 8, smoothness: 0 },
    revision: 0,
  };
}

function fixtureState() {
  const petal = hanaStrokeFromStroke3D(stroke3d("petal-1", "gesture-petal", 0), "petal");
  const core = hanaStrokeFromStroke3D(stroke3d("core-1", "gesture-core", 1), "core");
  const document = createHanaAuthoringDocument([], [petal, core], { editorState: createDefaultHanaEditorState() });
  const flower = createHanaFlowerFromSelection("flower-1", document.strokes, [petal.id, core.id], { coreStrokeIds: [core.id] }).flower;
  return { document, flowers: [flower], graph: createAuthoringGraph() };
}

test("HANA → SKIN Bridge exports semantic authoring data without derived geometry", () => {
  const bridge = exportHanaSkinBridge(fixtureState());
  assert.equal(bridge.format, "katachi.hana-skin-bridge.v0");
  assert.equal(bridge.strokes.length, 2);
  assert.equal(bridge.flowers[0]?.petalStrokeIds[0], "petal-1");
  assert.ok(!("surface" in bridge));
  assert.ok(!("field" in bridge));
  assert.equal(validateHanaSkinBridge(bridge).valid, true);
});

test("Bridge JSON round-trips deterministically and rejects stale semantic references", () => {
  const bridge = exportHanaSkinBridge(fixtureState());
  const serialized = serializeHanaSkinBridge(bridge);
  assert.equal(serializeHanaSkinBridge(parseHanaSkinBridge(serialized)), serialized);
  const broken = structuredClone(bridge);
  broken.flowers[0]!.petalStrokeIds.push("missing-stroke");
  assert.equal(validateHanaSkinBridge(broken).valid, false);
  assert.throws(() => parseHanaSkinBridge(JSON.stringify(broken)), /missing Stroke/);
});
