import assert from "node:assert/strict";
import test from "node:test";

import { defaultHanaMaterialSettings, type HanaStroke } from "./authoringDocument.ts";
import { createMaterialObject } from "./materialObjects.ts";
import {
  addFlowerCoreStroke,
  attachHanaFlowerToStem,
  createHanaFlowerFromSelection,
  materializeHanaFlower,
  moveHanaFlower,
  rotateHanaFlower,
} from "./flowerAuthoring.ts";
import type { HanaMaterialSample } from "./materialField.ts";

function stroke(id: string, role: HanaStroke["role"] = "free"): HanaStroke {
  return {
    id,
    rawGestureId: `raw-${id}`,
    controlPoints: [{ id: `${id}-p`, position: { x: 0, y: 0, z: 0 }, provenance: { sourceStroke: `raw-${id}`, sourceT: 0, sourcePointStart: 0, sourcePointEnd: 0, pressure: 0.5, time: 0 } }],
    curveSettings: { type: "catmull-rom", parameterization: "centripetal", alpha: 0.5, samplesPerSegment: 8, smoothness: 0 },
    materialSettings: defaultHanaMaterialSettings(),
    revision: 0,
    role,
    visible: true,
  };
}

function sample(): HanaMaterialSample {
  return { position: { x: 0, y: 0, z: 0 }, sourceT: 0, pressure: 0.5, time: 0 };
}

test("Flower preserves petal order, core, and source Gesture provenance", () => {
  const strokes = ["p1", "p2", "p3", "p4", "p5", "core"].map((id) => stroke(id));
  const result = createHanaFlowerFromSelection("flower-1", strokes, ["p1", "p2", "p3", "p4", "p5", "core"], { coreStrokeIds: ["core"], center: { x: 1, y: 2, z: 3 } });
  assert.deepEqual(result.flower.petalStrokeIds, ["p1", "p2", "p3", "p4", "p5"]);
  assert.deepEqual(result.flower.coreStrokeIds, ["core"]);
  assert.deepEqual(result.flower.provenance.sourceGestureIds, ["raw-p1", "raw-p2", "raw-p3", "raw-p4", "raw-p5", "raw-core"]);
  assert.equal(result.updatedStrokes.find((item) => item.id === "p3")?.role, "petal");
  assert.equal(result.updatedStrokes.find((item) => item.id === "core")?.role, "core");
});

test("Flower transform and stem attachment are authoring-only operations", () => {
  const { flower } = createHanaFlowerFromSelection("flower-1", [stroke("p1")], ["p1"]);
  const moved = moveHanaFlower(flower, { x: 4, y: 5, z: 6 });
  const rotated = rotateHanaFlower(moved, { x: 0, y: 0, z: 1, w: 0 });
  const attached = attachHanaFlowerToStem(rotated, { id: "attach-1", sourceStrokeId: "stem", normalizedT: 0.8, position: { x: 4, y: 5, z: 0 } });
  assert.deepEqual(attached.center, { x: 4, y: 5, z: 6 });
  assert.deepEqual(attached.orientation, { x: 0, y: 0, z: 1, w: 0 });
  assert.equal(attached.stemAttachment?.sourceStrokeId, "stem");
  assert.equal(flower.stemAttachment, null);
});

test("Flower materialization is a local derived object and does not require a global union", () => {
  const petal = stroke("petal");
  const { flower } = createHanaFlowerFromSelection("flower-1", [petal], [petal.id]);
  const source = createMaterialObject(petal.id, "stroke", [petal.id], [sample()], petal.revision);
  const flowerObject = materializeHanaFlower(flower, [source]);
  assert.equal(flowerObject.kind, "flower");
  assert.deepEqual(flowerObject.sourceIds, ["petal"]);
  assert.equal(flowerObject.materialSamples.length, 1);
  const withCore = addFlowerCoreStroke(flower, stroke("core"));
  assert.deepEqual(withCore.coreStrokeIds, ["core"]);
});
