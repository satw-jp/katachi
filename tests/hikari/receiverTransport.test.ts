import assert from "node:assert/strict";
import test from "node:test";
import { transmissionForShapePath } from "../../src/studies/cloud-sculpt/opticalScene.ts";
import {
  applyShadowContainedSupport,
  blurCoverageEnergyNormalized,
  blurFluxRgbEnergyNormalized,
  blurLossFluxRgbEnergyNormalized,
  composePairedReceiverDirectRgb,
  createReceiverTransportField,
  finalizeEnergyLedger,
  integrateCoverageFlux,
  integrateFluxRgb,
  integrateLossFluxRgb,
  measureSupportLeakage,
  splatBilinearFluxRgb,
  splatBilinearLossFluxRgb,
  splatBilinearCoverageFlux,
  splatBilinearStraightFluxRgb,
  summarizeReceiverField,
  type FluxRgb,
  type ReceiverFieldSpec,
  type ReceiverTransportField,
} from "../../src/studies/cloud-sculpt/receiverTransport.ts";
import { receiverReconstructionRadius } from "../../src/studies/cloud-sculpt/optics.ts";

const BASE_SPEC: ReceiverFieldSpec = {
  receiverId: "test-receiver",
  sceneRevision: "scene-1",
  lightRevision: "light-1",
  width: 16,
  height: 16,
  minU: -4,
  minV: -4,
  sizeU: 8,
  sizeV: 8,
};

test("bilinear splat and normalized blur preserve integrated RGB flux", () => {
  const field = createReceiverTransportField(BASE_SPEC);
  splatBilinearFluxRgb(field, 0.35, -0.65, { r: 2, g: 3, b: 5 });
  const nonZeroTexels = countNonZeroTexels(field);
  assert.equal(nonZeroTexels, 4);
  assertRgbClose(integrateFluxRgb(field), { r: 2, g: 3, b: 5 }, 1e-6);

  const blurred = blurFluxRgbEnergyNormalized(field, 2);
  assertRgbRelative(integrateFluxRgb(blurred), { r: 2, g: 3, b: 5 }, 5e-6);
});

test("coverage splat and blur preserve scalar flux at center and edge", () => {
  const field = createReceiverTransportField(BASE_SPEC);
  splatBilinearCoverageFlux(field, 0.35, -0.65, 2);
  splatBilinearCoverageFlux(field, BASE_SPEC.minU, BASE_SPEC.minV, 3);
  assert.ok(Math.abs(integrateCoverageFlux(field) - 5) <= 1e-6);
  const blurred = blurCoverageEnergyNormalized(field, 2);
  assert.ok(Math.abs(integrateCoverageFlux(blurred) - 5) <= 5e-6);
});

test("low-sample reconstruction widens the kernel without changing high-quality fields", () => {
  assert.equal(receiverReconstructionRadius(16384), 3);
  assert.equal(receiverReconstructionRadius(4096), 6);
  assert.equal(receiverReconstructionRadius(2048), 8);
  assert.equal(receiverReconstructionRadius(1024), 12);
  assert.equal(receiverReconstructionRadius(Number.NaN), 12);
});

test("low-sample coverage reconstruction closes point-pattern gaps and preserves flux", () => {
  const field = createReceiverTransportField({
    ...BASE_SPEC,
    width: 64,
    height: 64,
    minU: -32,
    minV: -32,
    sizeU: 64,
    sizeV: 64,
  });
  splatBilinearCoverageFlux(field, -10, 0, 1);
  splatBilinearCoverageFlux(field, 10, 0, 1);
  const highQuality = blurCoverageEnergyNormalized(
    field,
    receiverReconstructionRadius(16384),
  );
  const safeCpu = blurCoverageEnergyNormalized(
    field,
    receiverReconstructionRadius(1024),
  );
  const midpoint = 32 * field.width + 32;
  assert.equal(highQuality.geometricCoverage[midpoint], 0);
  assert.ok(safeCpu.geometricCoverage[midpoint] > 0);
  assert.ok(Math.abs(integrateCoverageFlux(safeCpu) - 2) <= 1e-5);
});

test("straight baseline splat stays separate from transported deposits", () => {
  const field = createReceiverTransportField(BASE_SPEC);
  splatBilinearStraightFluxRgb(field, 0, 0, { r: 2, g: 3, b: 4 });
  assertRgbClose(sumRgbArray(field.straightThroughputRgb), { r: 2, g: 3, b: 4 }, 1e-6);
  assertRgbClose(integrateFluxRgb(field), { r: 0, g: 0, b: 0 }, 0);
});

test("receiver non-arrival splat stays separate and its blur preserves RGB flux", () => {
  const field = createReceiverTransportField(BASE_SPEC);
  splatBilinearLossFluxRgb(field, 0.25, -0.4, { r: 0.2, g: 0.5, b: 0.8 }, 2);
  assertRgbClose(integrateLossFluxRgb(field), { r: 0.4, g: 1, b: 1.6 }, 1e-6);
  assertRgbClose(integrateFluxRgb(field), { r: 0, g: 0, b: 0 }, 0);

  const blurred = blurLossFluxRgbEnergyNormalized(field, 3);
  assertRgbRelative(integrateLossFluxRgb(blurred), { r: 0.4, g: 1, b: 1.6 }, 5e-6);
  assertRgbClose(integrateFluxRgb(blurred), { r: 0, g: 0, b: 0 }, 0);
});

test("paired receiver replacement redistributes baseline without additive creation", () => {
  const baseline = { r: 1, g: 1, b: 1 };
  const shadowed = composePairedReceiverDirectRgb(baseline, 1, { r: 0, g: 0, b: 0 }, 1);
  const focused = composePairedReceiverDirectRgb(baseline, 0, { r: 1, g: 1, b: 1 }, 1);
  const untouched = composePairedReceiverDirectRgb(baseline, 0, { r: 0, g: 0, b: 0 }, 1);
  assertRgbClose(shadowed, { r: 0, g: 0, b: 0 }, 0);
  assertRgbClose(focused, { r: 2, g: 2, b: 2 }, 0);
  assertRgbClose(untouched, baseline, 0);
  assertRgbClose(
    {
      r: shadowed.r + focused.r + untouched.r,
      g: shadowed.g + focused.g + untouched.g,
      b: shadowed.b + focused.b + untouched.b,
    },
    { r: 3, g: 3, b: 3 },
    0,
  );
});

test("receiver summary reports absolute flux, peak irradiance, and centroid", () => {
  const field = createReceiverTransportField({
    ...BASE_SPEC,
    width: 4,
    height: 4,
    minU: 0,
    minV: 0,
    sizeU: 4,
    sizeV: 4,
  });
  splatBilinearFluxRgb(field, 1.5, 2.5, { r: 2, g: 1, b: 0.5 });
  const summary = summarizeReceiverField(field);
  assert.deepEqual(summary.integratedFluxRgb, { r: 2, g: 1, b: 0.5 });
  assert.deepEqual(summary.peakIrradianceRgb, { r: 2, g: 1, b: 0.5 });
  assert.deepEqual(summary.fluxCentroid, { u: 1.5, v: 2.5 });
  assert.equal(summary.nonzeroTexels, 1);
});

test("weighted duplicate samples are invariant to emitted sample count", () => {
  const samples = [
    { u: -1.2, v: -0.9, flux: { r: 0.9, g: 0.7, b: 0.4 } },
    { u: 0.4, v: -0.2, flux: { r: 0.5, g: 0.6, b: 0.8 } },
    { u: 1.1, v: 0.8, flux: { r: 0.2, g: 0.4, b: 0.9 } },
    { u: -0.3, v: 1.4, flux: { r: 0.7, g: 0.3, b: 0.2 } },
  ];
  const once = createReceiverTransportField(BASE_SPEC);
  for (const sample of samples) {
    splatBilinearFluxRgb(once, sample.u, sample.v, sample.flux, 1 / samples.length);
  }

  const repeated = createReceiverTransportField(BASE_SPEC);
  const repetitionCount = 4;
  for (let repetition = 0; repetition < repetitionCount; repetition++) {
    for (const sample of samples) {
      splatBilinearFluxRgb(
        repeated,
        sample.u,
        sample.v,
        sample.flux,
        1 / (samples.length * repetitionCount),
      );
    }
  }
  assertArraysClose(repeated.depositedFluxRgb, once.depositedFluxRgb, 2e-6);
  assertRgbClose(integrateFluxRgb(repeated), integrateFluxRgb(once), 2e-6);
});

test("increasing Beer-Lambert absorption never increases deposited flux", () => {
  const coefficients = [0, 0.01, 0.05];
  const totals = coefficients.map((coefficient) => {
    const transmission = transmissionForShapePath(
      1,
      { absorptionPerMm: { r: coefficient, g: coefficient, b: coefficient } },
      { mmPerShapeUnit: 20, source: "author" },
    );
    const field = createReceiverTransportField(BASE_SPEC);
    splatBilinearFluxRgb(field, 0, 0, transmission);
    return integrateFluxRgb(field);
  });
  assert.ok(totals[0].r > totals[1].r && totals[1].r > totals[2].r);
  assert.ok(totals[0].g > totals[1].g && totals[1].g > totals[2].g);
  assert.ok(totals[0].b > totals[1].b && totals[1].b > totals[2].b);
  assertRgbClose(totals[1], { r: Math.exp(-0.2), g: Math.exp(-0.2), b: Math.exp(-0.2) }, 1e-6);
  assertRgbClose(totals[2], { r: Math.exp(-1), g: Math.exp(-1), b: Math.exp(-1) }, 1e-6);
});

test("fixed bounds preserve absolute HDR scale and reject outside-domain samples", () => {
  const low = createReceiverTransportField(BASE_SPEC);
  const high = createReceiverTransportField(BASE_SPEC);
  splatBilinearFluxRgb(low, 0.2, -0.3, { r: 1, g: 0.5, b: 0.25 });
  splatBilinearFluxRgb(high, 0.2, -0.3, { r: 2, g: 1, b: 0.5 });

  assert.equal(high.minU, low.minU);
  assert.equal(high.minV, low.minV);
  assert.equal(high.sizeU, low.sizeU);
  assert.equal(high.sizeV, low.sizeV);
  assert.equal(high.texelArea, low.texelArea);
  for (let index = 0; index < low.depositedFluxRgb.length; index++) {
    assert.ok(Math.abs(high.depositedFluxRgb[index] - low.depositedFluxRgb[index] * 2) <= 1e-7);
  }

  const before = integrateFluxRgb(low);
  const outside = splatBilinearFluxRgb(low, 20, 20, { r: 3, g: 4, b: 5 });
  assertRgbClose(outside.depositedRgb, { r: 0, g: 0, b: 0 }, 0);
  assertRgbClose(outside.escapedRgb, { r: 3, g: 4, b: 5 }, 0);
  assertRgbClose(integrateFluxRgb(low), before, 0);
  assert.equal(low.minU, BASE_SPEC.minU);
  assert.equal(low.sizeU, BASE_SPEC.sizeU);
});

test("integrated flux and centroid remain stable across 128 and 256 grids", () => {
  const samples = [
    { u: -1.3, v: 0.7, flux: { r: 0.8, g: 0.7, b: 0.6 } },
    { u: 0.25, v: -0.4, flux: { r: 1.1, g: 0.9, b: 0.5 } },
    { u: 1.7, v: 1.2, flux: { r: 0.3, g: 0.6, b: 1.2 } },
  ];
  const field128 = createReceiverTransportField({ ...BASE_SPEC, width: 128, height: 128 });
  const field256 = createReceiverTransportField({ ...BASE_SPEC, width: 256, height: 256 });
  for (const sample of samples) {
    splatBilinearFluxRgb(field128, sample.u, sample.v, sample.flux);
    splatBilinearFluxRgb(field256, sample.u, sample.v, sample.flux);
  }
  assertRgbRelative(integrateFluxRgb(field128), integrateFluxRgb(field256), 5e-6);
  const centroid128 = fluxCentroid(field128);
  const centroid256 = fluxCentroid(field256);
  const quarterTexel128U = field128.sizeU / field128.width * 0.25;
  const quarterTexel128V = field128.sizeV / field128.height * 0.25;
  assert.ok(Math.abs(centroid128.u - centroid256.u) <= quarterTexel128U);
  assert.ok(Math.abs(centroid128.v - centroid256.v) <= quarterTexel128V);
});

test("shadow-contained support rejects flux beyond one-texel expansion", () => {
  const spec = { ...BASE_SPEC, width: 9, height: 9, minU: 0, minV: 0, sizeU: 9, sizeV: 9 };
  const field = createReceiverTransportField(spec);
  const support = new Float32Array(spec.width * spec.height);
  support[4 * spec.width + 4] = 1;
  splatBilinearFluxRgb(field, texelCenter(spec, 4), texelCenterV(spec, 4), { r: 1, g: 1, b: 1 });
  splatBilinearFluxRgb(field, texelCenter(spec, 5), texelCenterV(spec, 4), { r: 0.5, g: 0.5, b: 0.5 });
  splatBilinearFluxRgb(field, texelCenter(spec, 7), texelCenterV(spec, 4), { r: 2, g: 1, b: 0.25 });

  const before = measureSupportLeakage(field, support, 1);
  assert.ok(before.ratio > 0.4);
  const contained = applyShadowContainedSupport(field, support, 1);
  assertRgbClose(contained.rejectedFluxRgb, { r: 2, g: 1, b: 0.25 }, 1e-6);
  const retained = integrateFluxRgb(contained.field);
  assertRgbClose(
    {
      r: retained.r + contained.rejectedFluxRgb.r,
      g: retained.g + contained.rejectedFluxRgb.g,
      b: retained.b + contained.rejectedFluxRgb.b,
    },
    integrateFluxRgb(field),
    1e-6,
  );
  const after = measureSupportLeakage(contained.field, support, 1);
  assert.ok(after.ratio <= 0.005);
  assertRgbClose(after.outsideFluxRgb, { r: 0, g: 0, b: 0 }, 0);
});

test("energy ledger exposes a closed balance and a non-zero residual", () => {
  const closed = finalizeEnergyLedger({
    incidentRgb: { r: 10, g: 8, b: 6 },
    depositedRgb: { r: 5, g: 4, b: 3 },
    absorbedRgb: { r: 2, g: 2, b: 1 },
    reflectedRgb: { r: 1, g: 1, b: 1 },
    escapedRgb: { r: 1.5, g: 0.5, b: 0.5 },
    supportRejectedRgb: { r: 0.5, g: 0.5, b: 0.5 },
  });
  assertRgbClose(closed.residualRgb, { r: 0, g: 0, b: 0 }, 1e-12);
  assert.ok(closed.relativeResidual <= 1e-12);

  const open = finalizeEnergyLedger({
    incidentRgb: { r: 1, g: 1, b: 1 },
    depositedRgb: { r: 0.8, g: 0.7, b: 0.6 },
  });
  assertRgbClose(open.residualRgb, { r: 0.2, g: 0.3, b: 0.4 }, 1e-12);
  assert.ok(Math.abs(open.relativeResidual - 0.4) <= 1e-12);

  const independentlyUnresolved = finalizeEnergyLedger({
    incidentRgb: { r: 1, g: 1, b: 1 },
    unresolvedLossRgb: { r: 0.25, g: 0.2, b: 0.1 },
  });
  assertRgbClose(
    independentlyUnresolved.unresolvedLossRgb,
    { r: 0.25, g: 0.2, b: 0.1 },
    0,
  );
  assertRgbClose(
    independentlyUnresolved.residualRgb,
    { r: 0.75, g: 0.8, b: 0.9 },
    1e-12,
  );
  assert.ok(Math.abs(independentlyUnresolved.relativeResidual - 0.9) <= 1e-12);
});

function countNonZeroTexels(field: ReceiverTransportField): number {
  let count = 0;
  for (let offset = 0; offset < field.depositedFluxRgb.length; offset += 3) {
    if (field.depositedFluxRgb[offset] !== 0
      || field.depositedFluxRgb[offset + 1] !== 0
      || field.depositedFluxRgb[offset + 2] !== 0) count++;
  }
  return count;
}

function fluxCentroid(field: ReceiverTransportField): { u: number; v: number } {
  let weightedU = 0;
  let weightedV = 0;
  let total = 0;
  for (let y = 0; y < field.height; y++) {
    for (let x = 0; x < field.width; x++) {
      const offset = (y * field.width + x) * 3;
      const weight = field.depositedFluxRgb[offset]
        + field.depositedFluxRgb[offset + 1]
        + field.depositedFluxRgb[offset + 2];
      weightedU += (field.minU + (x + 0.5) * field.sizeU / field.width) * weight;
      weightedV += (field.minV + (y + 0.5) * field.sizeV / field.height) * weight;
      total += weight;
    }
  }
  return { u: weightedU / total, v: weightedV / total };
}

function texelCenter(spec: ReceiverFieldSpec, x: number): number {
  return spec.minU + (x + 0.5) * spec.sizeU / spec.width;
}

function texelCenterV(spec: ReceiverFieldSpec, y: number): number {
  return spec.minV + (y + 0.5) * spec.sizeV / spec.height;
}

function assertArraysClose(actual: Float32Array, expected: Float32Array, tolerance: number): void {
  assert.equal(actual.length, expected.length);
  for (let index = 0; index < actual.length; index++) {
    assert.ok(
      Math.abs(actual[index] - expected[index]) <= tolerance,
      `array[${index}] ${actual[index]} != ${expected[index]}`,
    );
  }
}

function assertRgbClose(actual: FluxRgb, expected: FluxRgb, tolerance: number): void {
  for (const channel of ["r", "g", "b"] as const) {
    assert.ok(
      Math.abs(actual[channel] - expected[channel]) <= tolerance,
      `${channel}: ${actual[channel]} != ${expected[channel]}`,
    );
  }
}

function assertRgbRelative(actual: FluxRgb, expected: FluxRgb, relativeTolerance: number): void {
  for (const channel of ["r", "g", "b"] as const) {
    const scale = Math.max(Math.abs(expected[channel]), 1e-12);
    assert.ok(
      Math.abs(actual[channel] - expected[channel]) / scale <= relativeTolerance,
      `${channel}: ${actual[channel]} != ${expected[channel]}`,
    );
  }
}

function sumRgbArray(values: Float32Array): FluxRgb {
  const sum = { r: 0, g: 0, b: 0 };
  for (let offset = 0; offset < values.length; offset += 3) {
    sum.r += values[offset];
    sum.g += values[offset + 1];
    sum.b += values[offset + 2];
  }
  return sum;
}
