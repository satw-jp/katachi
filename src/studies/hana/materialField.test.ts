import assert from "node:assert/strict";
import test from "node:test";

import type { HanaSmoothCenterlinePoint } from "./smoothCenterline.ts";
import {
  buildPointField,
  buildPointFieldMesh,
  buildPointFieldMeshCooperative,
  createPointFieldEvaluationStats,
  diagnosePointField,
  HanaPointFieldMeshCancelledError,
  materialSampleCount,
  pointFieldSdf,
  pointFieldSdfBruteForce,
  sampleMaterialSamples,
} from "./materialField.ts";

const SURFACE_FIXTURE_SAMPLE_COUNT = 64;

function centerlineFixture(): HanaSmoothCenterlinePoint[] {
  return [
    { position: { x: 0, y: 0, z: 0 }, sourceT: 0, pressure: 0.2, time: 0, segmentIndex: 0, segmentT: 0 },
    { position: { x: 1, y: 0, z: 0 }, sourceT: 0.2, pressure: 0.3, time: 10, segmentIndex: 0, segmentT: 0.5 },
    { position: { x: 1, y: 0, z: 2 }, sourceT: 0.7, pressure: 0.4, time: 25, segmentIndex: 1, segmentT: 0.5 },
    { position: { x: 4, y: 0, z: 2 }, sourceT: 1, pressure: 0.5, time: 40, segmentIndex: 2, segmentT: 1 },
  ];
}

function surfaceSamples(): ReturnType<typeof sampleMaterialSamples> {
  return Array.from({ length: SURFACE_FIXTURE_SAMPLE_COUNT }, (_, index) => ({
    position: { x: -3 + index * 6 / (SURFACE_FIXTURE_SAMPLE_COUNT - 1), y: 0, z: 0 },
    sourceT: index / (SURFACE_FIXTURE_SAMPLE_COUNT - 1),
    pressure: 0.25,
    time: index,
  }));
}

function longCenterlineFixture(): HanaSmoothCenterlinePoint[] {
  const count = 249;
  const length = 68.33;
  return Array.from({ length: count }, (_, index) => ({
    position: { x: index * length / (count - 1), y: 0, z: 0 },
    sourceT: index / (count - 1),
    pressure: 0.2 + index / count,
    time: index * 35,
    segmentIndex: Math.floor(index / 8),
    segmentT: (index % 8) / 8,
  }));
}

function maxAdjacentSpacing(samples: ReturnType<typeof sampleMaterialSamples>): number {
  let maximum = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const from = samples[index - 1].position;
    const to = samples[index].position;
    maximum = Math.max(maximum, Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z));
  }
  return maximum;
}

test("Material Samples are deterministic, spacing-driven, and non-destructive", () => {
  const centerline = centerlineFixture();
  const radius = 0.5;
  const before = structuredClone(centerline);
  const samples = sampleMaterialSamples(centerline, radius);
  assert.equal(samples.length, materialSampleCount(centerline, radius));
  assert.deepEqual(samples[0].position, centerline[0].position);
  assert.deepEqual(samples.at(-1)?.position, centerline.at(-1)?.position);
  assert.equal(samples[0].sourceT, 0);
  assert.equal(samples.at(-1)?.sourceT, 1);
  assert.ok(samples.every((sample, index) => (
    Number.isFinite(sample.position.x)
    && Number.isFinite(sample.position.y)
    && Number.isFinite(sample.position.z)
    && Number.isFinite(sample.sourceT)
    && Number.isFinite(sample.pressure)
    && Number.isFinite(sample.time)
    && (index === 0 || sample.sourceT >= samples[index - 1].sourceT)
  )));
  assert.ok(maxAdjacentSpacing(samples) <= radius * 1.01);
  assert.deepEqual(sampleMaterialSamples(centerline, radius), samples);
  assert.deepEqual(centerline, before);

  const thin = sampleMaterialSamples(centerline, 0.25);
  const thick = sampleMaterialSamples(centerline, 1);
  assert.ok(thin.length > thick.length);
});

test("Long Material Samples stay continuous and exceed the former 64-point limit", () => {
  const centerline = longCenterlineFixture();
  const radius = 0.18;
  const before = structuredClone(centerline);
  const samples = sampleMaterialSamples(centerline, radius);
  assert.ok(samples.length > 64);
  assert.equal(samples.length, Math.ceil(68.33 / radius) + 1);
  assert.equal(samples[0].sourceT, 0);
  assert.equal(samples.at(-1)?.sourceT, 1);
  assert.ok(maxAdjacentSpacing(samples) <= radius * 1.01);
  assert.ok(samples.every((sample, index) => (
    Number.isFinite(sample.position.x)
    && Number.isFinite(sample.position.y)
    && Number.isFinite(sample.position.z)
    && Number.isFinite(sample.sourceT)
    && Number.isFinite(sample.pressure)
    && Number.isFinite(sample.time)
    && (index === 0 || sample.sourceT >= samples[index - 1].sourceT)
  )));
  assert.deepEqual(sampleMaterialSamples(centerline, radius), samples);
  assert.deepEqual(centerline, before);

  const field = buildPointField(samples, radius);
  for (let index = 1; index < samples.length; index += 1) {
    const from = samples[index - 1].position;
    const to = samples[index].position;
    const midpoint = {
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2,
      z: (from.z + to.z) / 2,
    };
    assert.ok(pointFieldSdf(field, midpoint.x, midpoint.y, midpoint.z) < 0);
  }

  const mesh = buildPointFieldMesh(field, 48);
  assert.ok(mesh.triangles.length > 0);
  assert.ok(mesh.triangles.every((triangle) => [triangle.a, triangle.b, triangle.c].every((point) => (
    Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)
  ))));
  const diagnostics = diagnosePointField(field, 48, mesh);
  assert.equal(diagnostics.sampleCount, samples.length);
  assert.equal(diagnostics.radius, radius);
  assert.ok(diagnostics.bounds.longest > 68);
  assert.ok(diagnostics.maxAdjacentSpacing <= radius * 1.01);
  assert.ok(diagnostics.medianAdjacentSpacing <= radius * 1.01);
  assert.ok(diagnostics.gridShape.nx > 0 && diagnostics.gridShape.ny > 0 && diagnostics.gridShape.nz > 0);
  assert.ok(diagnostics.gridSpacing.x > 0 && diagnostics.gridSpacing.y > 0 && diagnostics.gridSpacing.z > 0);
  assert.ok(diagnostics.negativeGridNodeCount > 0);
  assert.equal(diagnostics.triangleCount, mesh.triangles.length);
  assert.equal(diagnostics.componentCount, 1);
});

test("Point Field uses equal-radius smooth-union spheres without mutating samples", () => {
  const samples = surfaceSamples().slice(28, 36);
  const before = structuredClone(samples);
  const field = buildPointField(samples, 0.18);
  assert.equal(field.radius, 0.18);
  assert.equal(field.blendK, 0.09);
  assert.ok(pointFieldSdf(field, samples[0].position.x, 0, 0) < 0);
  assert.ok(pointFieldSdf(field, 0, 5, 0) > 0);
  assert.deepEqual(buildPointField(samples, 0.18), field);
  const thin = buildPointField(samples, 0.1);
  const thick = buildPointField(samples, 0.2);
  assert.ok(pointFieldSdf(thick, 0, 0.3, 0) < pointFieldSdf(thin, 0, 0.3, 0));
  assert.equal(pointFieldSdf(field, 0.1, 0.2, 0.3), pointFieldSdf(field, 0.1, 0.2, 0.3));
  assert.deepEqual(samples, before);
});

test("Point Field CPU surface is a finite non-empty mesh", () => {
  const field = buildPointField(surfaceSamples(), 0.18);
  const preview = buildPointFieldMesh(field, 32);
  assert.ok(preview.triangles.length > 0);
  assert.ok(preview.triangles.every((triangle) => [triangle.a, triangle.b, triangle.c].every((point) => (
    Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)
  ))));
  const mesh = buildPointFieldMesh(field, 48);
  assert.ok(mesh.triangles.length > 0);
  assert.ok(mesh.triangles.every((triangle) => [triangle.a, triangle.b, triangle.c].every((point) => (
    Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)
  ))));
  assert.ok(Number.isFinite(mesh.sourceBounds.longest));
  assert.ok(Number.isFinite(mesh.mmBounds.longest));
});

test("Cooperative final surface extraction preserves the synchronous mesh", async () => {
  const field = buildPointField(surfaceSamples(), 0.18);
  const synchronous = buildPointFieldMesh(field, 24);
  const cooperative = await buildPointFieldMeshCooperative(field, 24, undefined, {
    yieldToBrowser: async () => {},
  });
  assert.deepEqual(cooperative, synchronous);
});

test("Cooperative final surface extraction stops when superseded", async () => {
  const field = buildPointField(surfaceSamples(), 0.18);
  await assert.rejects(
    () => buildPointFieldMeshCooperative(field, 24, undefined, {
      yieldToBrowser: async () => {},
      shouldContinue: () => false,
    }),
    HanaPointFieldMeshCancelledError,
  );
});

test("Point Field spatial queries preserve the smooth-union result", () => {
  const field = buildPointField(surfaceSamples(), 0.18);
  const stats = createPointFieldEvaluationStats();
  const mesh = buildPointFieldMesh(field, 32, stats);
  assert.ok(mesh.triangles.length > 0);
  assert.ok(stats.queryCount > 0);
  assert.ok(stats.candidateEvaluationCount < stats.queryCount * field.samples.length);
  for (let index = 0; index < field.samples.length; index += 1) {
    const sample = field.samples[index].position;
    const accelerated = pointFieldSdf(field, sample.x + 0.04, 0.03, sample.z + 0.02);
    const reference = pointFieldSdfBruteForce(field, sample.x + 0.04, 0.03, sample.z + 0.02);
    assert.ok(Math.abs(accelerated - reference) <= 1e-6);
  }
});
