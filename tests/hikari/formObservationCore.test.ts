import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fitObservationCameras } from "../../src/studies/cloud-sculpt/formObservation/cameraFit.ts";
import { adaptCloudSdf, createCloudSdfGeometry, evaluateCloudSdfEquivalence } from "../../src/studies/cloud-sculpt/formObservation/cloudSdfAdapter.ts";
import { calculatePca, determinantOfBasis } from "../../src/studies/cloud-sculpt/formObservation/pca.ts";
import { processSamplingRequest } from "../../src/studies/cloud-sculpt/formObservation/sampling.worker.ts";
import { evaluateSerializedSdf, sampleSdfSurface, samplingIdentity } from "../../src/studies/cloud-sculpt/formObservation/surfaceSampling.ts";
import { validateFormGeometry, validatePointBudget } from "../../src/studies/cloud-sculpt/formObservation/validation.ts";

const balls = [
  { id: 99, x: -0.65, y: 0.1, z: 0.15, r: 1.1 },
  { id: 100, x: 0.72, y: -0.15, z: -0.2, r: 0.82 },
];
const geometry = createCloudSdfGeometry(balls, 0.35, "cloud-current", "r7");
const testOptions = { allowTestBudget: 256, samplingVersion: "test-v1" } as const;

test("FORM SDF sampling identity and positions are deterministic", () => {
  const first = sampleSdfSurface(geometry, 256, testOptions);
  const second = sampleSdfSurface(geometry, 256, testOptions);
  assert.equal(first.diagnostics.identity, samplingIdentity(geometry.contentHash, 256, "test-v1"));
  assert.deepEqual([...first.positions], [...second.positions]);
  assert.deepEqual(first.diagnostics, second.diagnostics);
  assert.ok(first.pointCount <= 256);
  assert.equal(first.diagnostics.acceptedCount + first.diagnostics.rejectedCount, first.diagnostics.candidateCount);
  assert.equal(first.diagnostics.nonconvergedCount, first.diagnostics.rejectedCount);
  assert.match(first.diagnostics.limitations.join(" "), /not uniform-area sampling/);
});

test("FORM sampler preserves inputs and identity changes with content, budget, or version", () => {
  const original = structuredClone(balls);
  const originalGeometry = structuredClone(geometry);
  const changed = createCloudSdfGeometry([...balls, { id: 101, x: 0, y: 1.2, z: 0, r: 0.3 }], 0.35, "cloud-current", "r8");
  const sample = sampleSdfSurface(geometry, 256, testOptions);
  assert.deepEqual(balls, original);
  assert.deepEqual(geometry, originalGeometry);
  assert.notEqual(sample.diagnostics.identity, samplingIdentity(changed.contentHash, 256, "test-v1"));
  assert.notEqual(sample.diagnostics.identity, samplingIdentity(geometry.contentHash, 255, "test-v1"));
  assert.notEqual(sample.diagnostics.identity, samplingIdentity(geometry.contentHash, 256, "test-v2"));
});

test("FORM SDF points show finite residual evidence and bounded nonconvergence accounting", () => {
  const sample = sampleSdfSurface(geometry, 256, testOptions);
  assert.ok(Number.isFinite(sample.diagnostics.maxResidual));
  assert.ok(sample.diagnostics.maxResidual < 1e-3);
  for (let index = 0; index < sample.positions.length; index += 3) {
    assert.ok(Math.abs(evaluateSerializedSdf(geometry, sample.positions[index], sample.positions[index + 1], sample.positions[index + 2])) < 1e-3);
  }
  assert.ok(sample.diagnostics.totalIterations >= sample.pointCount);
  assert.equal(sample.positions.byteLength, sample.pointCount * 3 * Float32Array.BYTES_PER_ELEMENT);
});

test("FORM validation rejects empty, nonfinite, invalid, and unbounded point requests", () => {
  assert.throws(() => validatePointBudget(123));
  assert.throws(() => validatePointBudget(160_001));
  assert.throws(() => adaptCloudSdf({ balls: [], k: 0, sourceId: "empty", revision: "1" }));
  assert.throws(() => adaptCloudSdf({ balls: [{ id: 1, x: Number.NaN, y: 0, z: 0, r: 1 }], k: 0, sourceId: "bad", revision: "1" }));
  const malformed = structuredClone(geometry) as typeof geometry;
  (malformed.representation as { balls: unknown[] }).balls = [];
  assert.throws(() => validateFormGeometry(malformed));
});

test("PCA is orthonormal, sign-stable, right-handed, and honest about ambiguity", () => {
  const points = new Float32Array([
    -5, -1, -0.25, 5, -1, -0.25, -5, 1, 0.25, 5, 1, 0.25,
    -4, -1, -0.25, 4, -1, -0.25, -4, 1, 0.25, 4, 1, 0.25,
  ]);
  const result = calculatePca({ positions: points, pointCount: points.length / 3 });
  assert.equal(result.ambiguous, false);
  assert.ok(result.eigenvalues[0] >= result.eigenvalues[1] && result.eigenvalues[1] >= result.eigenvalues[2]);
  for (const axis of result.basis) assert.ok(Math.abs(Math.hypot(...axis) - 1) < 1e-10);
  assert.ok(Math.abs(result.basis[0][0] * result.basis[1][0] + result.basis[0][1] * result.basis[1][1] + result.basis[0][2] * result.basis[1][2]) < 1e-10);
  assert.ok(determinantOfBasis(result.basis) > 0.999999);
  assert.deepEqual(calculatePca({ positions: points, pointCount: points.length / 3 }).basis, result.basis);
  const isotropic = new Float32Array([1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1]);
  const fallback = calculatePca({ positions: isotropic, pointCount: isotropic.length / 3 });
  assert.equal(fallback.ambiguous, true);
  assert.equal(fallback.basisProvenance, "world-axis-fallback");
  assert.deepEqual(fallback.basis, [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
});

test("camera fit uses one projected scale while retaining each projection center", () => {
  const points = new Float32Array([10, -2, 30, 18, 2, 32, 11, 2, 31, 17, -2, 30]);
  const fit = fitObservationCameras({ positions: points, pointCount: 4 }, { basis: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] });
  assert.equal(fit.frames.length, 4);
  assert.equal(fit.orthographicSpan, fit.commonProjectedExtent * 1.07);
  assert.equal(fit.commonProjectedExtent, 8);
  assert.notDeepEqual(fit.frames[0].center, fit.frames[1].center);
});

test("Cloud adapter preserves field SDF values and Worker responses have a transferable point shape", () => {
  const seam = evaluateCloudSdfEquivalence(geometry, [0.2, -0.3, 0.4]);
  assert.ok(seam.difference < 1e-12);
  assert.equal(geometry.coordinateSystem.handedness, "right");
  assert.equal(geometry.coordinateSystem.canonicalUp, "y");
  assert.equal(geometry.physicalScale.provenance, "unknown");
  const progress: string[] = [];
  const result = processSamplingRequest({ type: "sample", requestId: "latest-r8", geometry, pointBudget: 20_000, samplingVersion: "worker-v1" }, (message) => progress.push(message.type));
  assert.equal(result.type, "result");
  assert.equal(result.requestId, "latest-r8");
  assert.ok(result.pointSet.positions instanceof Float32Array);
  assert.equal(result.pointSet.positions.buffer.byteLength, result.pointSet.positions.byteLength);
  assert.ok(progress.includes("progress"));
});

test("pure FORM files retain their import boundary", () => {
  const root = new URL("../../src/studies/cloud-sculpt/formObservation/", import.meta.url);
  for (const name of ["contracts.ts", "validation.ts", "surfaceSampling.ts", "pca.ts", "cameraFit.ts"]) {
    const source = readFileSync(new URL(name, root), "utf8");
    assert.doesNotMatch(source, /from\s+["'][^"']*(?:field|three|optical|history|ui)[^"']*["']/i, name);
  }
  const adapter = readFileSync(new URL("cloudSdfAdapter.ts", root), "utf8");
  assert.match(adapter, /from "\.\.\/field\.ts"/);
  const worker = readFileSync(new URL("sampling.worker.ts", root), "utf8");
  assert.match(worker, /positions\.buffer/);
});
