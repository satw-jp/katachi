import assert from "node:assert/strict";
import test from "node:test";

import { HikariMpmDriver } from "../../src/studies/cloud-sculpt/hikariMpmDriver.ts";

test("MPM preview produces a bounded finite proxy that can be adopted", () => {
  const driver = new HikariMpmDriver({
    particlesPerUnitVolume: 18,
    gridN: 24,
    maxBalls: 12,
  });
  driver.seed([{ id: 1, x: 0, y: 0, z: 0, r: 1 }], 0.6);
  assert.ok(driver.particleCount() > 0);

  const before = driver.previewBalls();
  driver.advance(1);
  const after = driver.previewBalls();

  assert.ok(before.length > 0);
  assert.ok(after.length > 0);
  assert.ok(after.length <= 12);
  for (const ball of after) {
    assert.ok(Number.isFinite(ball.x));
    assert.ok(Number.isFinite(ball.y));
    assert.ok(Number.isFinite(ball.z));
    assert.ok(Number.isFinite(ball.r) && ball.r > 0);
  }
});

test("MPM preview caps particles before allocation and rejects out-of-domain shapes", () => {
  const capped = new HikariMpmDriver({
    particlesPerUnitVolume: 500,
    gridN: 24,
    maxParticles: 80,
  });
  capped.seed([
    { id: 1, x: -0.8, y: 0, z: 0, r: 0.9 },
    { id: 2, x: 0.8, y: 0, z: 0, r: 0.9 },
  ], 0.6);
  assert.ok(capped.particleCount() > 0);
  assert.ok(capped.particleCount() <= 80);

  const rejected = new HikariMpmDriver({ gridN: 24 });
  assert.throws(
    () => rejected.seed([{ id: 3, x: 0, y: 0, z: 0, r: 10 }], 0.6),
    /MPMプレビュー領域/,
  );
});
