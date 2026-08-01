import assert from "node:assert/strict";
import test from "node:test";
import { advanceCameraOrbit } from "../../src/studies/cloud-sculpt/cameraOrbit.ts";

test("automatic orbit preserves target radius and elevation", () => {
  const target = [1, 2, 3] as const;
  const position = [5, 4, 6] as const;
  const next = advanceCameraOrbit(position, target, 7.5, {
    durationSeconds: 60,
    direction: "clockwise",
  });
  const radius = Math.hypot(position[0] - target[0], position[2] - target[2]);
  const nextRadius = Math.hypot(next[0] - target[0], next[2] - target[2]);
  assert.ok(Math.abs(nextRadius - radius) < 1e-12);
  assert.equal(next[1], position[1]);
});

test("quarter-orbit direction is deterministic", () => {
  assert.deepEqual(
    advanceCameraOrbit([1, 0, 0], [0, 0, 0], 15, {
      durationSeconds: 60,
      direction: "clockwise",
    }).map((value) => Math.round(value)),
    [0, 0, -1],
  );
  assert.deepEqual(
    advanceCameraOrbit([1, 0, 0], [0, 0, 0], 15, {
      durationSeconds: 60,
      direction: "counterclockwise",
    }).map((value) => Math.round(value)),
    [0, 0, 1],
  );
});

test("automatic orbit rejects invalid time inputs", () => {
  assert.throws(() => advanceCameraOrbit([1, 0, 0], [0, 0, 0], -1, {
    durationSeconds: 60,
    direction: "clockwise",
  }), RangeError);
  assert.throws(() => advanceCameraOrbit([1, 0, 0], [0, 0, 0], 1, {
    durationSeconds: 0,
    direction: "clockwise",
  }), RangeError);
});

