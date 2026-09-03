import assert from "node:assert/strict";
import test from "node:test";
import { createCaptureManifest, serializeCaptureManifest, type CaptureStateSource } from "../capture/captureManifest.ts";

test("capture manifest is serializable and preserves fixed state", () => {
  const source: CaptureStateSource = {
    captureState: () => ({ concept: "mutual-rescue", seed: 12345, timeMs: 12840.4, palette: "rich", parameters: { gravity: 0.65 }, camera: { x: 1, y: 2, z: 3, fov: 46 } }),
    sourceFingerprint: () => "graph-test",
    cameraManifest: () => ({ mode: "AUTO", scoreId: "mutual-rescue-camera-v1", scoreSeed: 12345, timeMs: 12840, position: [1, 2, 3], target: [0, 0.2, 0], fov: 46, roll: 0.02, focusDistance: 5, focusBias: 0.2 }),
  };
  const manifest = createCaptureManifest(source, 1920, 1080, "deadbeef");
  const restored = JSON.parse(serializeCaptureManifest(manifest)) as typeof manifest;
  assert.equal(restored.schemaVersion, 1);
  assert.equal(restored.sourceFingerprint, "graph-test");
  assert.equal(restored.timeMs, 12840);
  assert.deepEqual(restored.viewport, { width: 1920, height: 1080 });
  assert.equal(restored.parameters.gravity, 0.65);
  assert.equal(restored.camera.scoreId, "mutual-rescue-camera-v1");
  assert.deepEqual(restored.camera.target, [0, 0.2, 0]);
});
