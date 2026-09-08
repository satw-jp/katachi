import assert from "node:assert/strict";
import { buildPackedCandidateQuery } from "./astraPackedCandidateQuery.ts";

const cubePositions = new Float32Array([
  0, 0, 0, 0, 1, 0, 0, 1, 1,
  0, 0, 0, 0, 1, 1, 0, 0, 1,
  1, 0, 0, 1, 1, 1, 1, 1, 0,
  1, 0, 0, 1, 0, 1, 1, 1, 1,
  0, 0, 0, 1, 0, 1, 1, 0, 0,
  0, 0, 0, 0, 0, 1, 1, 0, 1,
  0, 1, 0, 1, 1, 0, 1, 1, 1,
  0, 1, 0, 1, 1, 1, 0, 1, 1,
  0, 0, 0, 1, 1, 0, 1, 0, 0,
  0, 0, 0, 1, 0, 0, 1, 1, 0,
  0, 0, 1, 1, 0, 1, 1, 1, 1,
  0, 0, 1, 1, 1, 1, 0, 1, 1,
]);

const query = buildPackedCandidateQuery(cubePositions, undefined, { telemetry: true, timing: true });
assert.equal(query.signedDistance({ x: 2, y: 0.5, z: 0.5 }), 1);
assert.equal(query.signedDistance({ x: 0.5, y: 0.5, z: 0.5 }), -0.5);
assert.equal(query.signedDistance({ x: 0, y: 0.5, z: 0.5 }), 0);
assert.equal(query.signedDistanceCapped({ x: 2, y: 0.5, z: 0.5 }, 0.25), 0.25);
assert.equal(query.signedDistanceCapped({ x: 0.5, y: 0.5, z: 0.5 }, 0.25), -0.25);
assert.equal(query.signedDistanceCapped({ x: 0, y: 0.5, z: 0.5 }, 0.25), 0);

const timed = query.readTelemetry();
assert.equal(timed.signedDistanceCalls, 3);
assert.equal(timed.closestSurfaceCalls, 3);
assert.equal(timed.rayIntersectionCalls, 4, "surface zero keeps the legacy no-ray path");
assert.equal(timed.cappedSignedDistanceCalls, 3);
assert.equal(timed.cappedDistanceReturnedCapCount, 2);
assert.ok(timed.cappedClosestSurfaceTotalMs >= 0);
assert.ok(timed.cappedSignedDistanceTotalMs >= 0);
assert.ok(timed.closestSurfaceTotalMs >= 0);
assert.ok(timed.rayIntersectionTotalMs >= 0);
assert.ok(timed.signedDistanceTotalMs >= 0);
assert.ok(timed.signedDistanceTotalMs >= timed.closestSurfaceTotalMs);

query.resetTelemetry();
const reset = query.readTelemetry();
assert.equal(reset.signedDistanceCalls, 0);
assert.equal(reset.cappedSignedDistanceCalls, 0);
assert.equal(reset.cappedDistanceReturnedCapCount, 0);
assert.equal(reset.closestSurfaceTotalMs, 0);
assert.equal(reset.rayIntersectionTotalMs, 0);
assert.equal(reset.signedDistanceTotalMs, 0);

const untimed = buildPackedCandidateQuery(cubePositions, undefined, { telemetry: true });
untimed.signedDistance({ x: 0.5, y: 0.5, z: 0.5 });
const untimedStats = untimed.readTelemetry();
assert.equal(untimedStats.closestSurfaceTotalMs, 0);
assert.equal(untimedStats.rayIntersectionTotalMs, 0);
assert.equal(untimedStats.signedDistanceTotalMs, 0);
assert.equal(untimedStats.cappedClosestSurfaceTotalMs, 0);
assert.equal(untimedStats.cappedSignedDistanceTotalMs, 0);

console.log("astraPackedCandidateQuery: exact sign/zero semantics and optional timing telemetry passed");
