import assert from "node:assert/strict";
import test from "node:test";

import {
  cameraPositionForSunBacklight,
  cameraSunAngleDeg,
} from "../../src/studies/cloud-sculpt/sunBacklight.ts";

test("sun backlight alignment preserves target distance and centres the sun", () => {
  const camera = { x: 4, y: -3, z: 5 };
  const target = { x: 1, y: 2, z: -1 };
  const sun = { x: 0.2, y: 0.8, z: -0.4 };
  const aligned = cameraPositionForSunBacklight(camera, target, sun);
  const beforeDistance = Math.hypot(
    camera.x - target.x,
    camera.y - target.y,
    camera.z - target.z,
  );
  const afterDistance = Math.hypot(
    aligned.x - target.x,
    aligned.y - target.y,
    aligned.z - target.z,
  );

  assert.ok(Math.abs(beforeDistance - afterDistance) < 1e-10);
  assert.ok(cameraSunAngleDeg(aligned, target, sun) < 1e-6);
});

test("saved backlight-like view reports a sun-disc miss", () => {
  const angle = cameraSunAngleDeg(
    { x: 0.1822050028, y: -6.5351625002, z: -2.1233116664 },
    { x: 0, y: 0, z: 0 },
    { x: -0.027567, y: 0.956305, z: 0.291071 },
  );
  assert.ok(angle > 0.4, `expected the 0.4 degree sun radius to be missed, got ${angle}`);
});
