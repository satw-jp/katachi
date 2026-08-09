import assert from "node:assert/strict";
import test from "node:test";

import {
  LD1_FIXED_CENTRAL_DIRECTION,
  makeLd1Config,
  makeLd1SourceDirectionBasis,
  mapLd1SourceDiskDirection,
  runLd1Reference,
  runLd1ReferenceWithSamples,
} from "../../../src/studies/cloud-sculpt/lightDrawing/ld1Reference.ts";
import {
  LD2_SOURCE_ANGULAR_DIAMETERS,
  LD2_READINESS_RECONSTRUCTION_RADIUS_TEXELS,
  LD2_READINESS_LOCAL_CONCENTRATION_PHYSICAL_SIDE,
  LD2_READINESS_LOCAL_CONCENTRATION_TEXEL_PITCH,
  LD2_READINESS_LOCAL_CONCENTRATION_WINDOW_TEXELS,
  LD2_TRACE_ROI,
  evaluateLd2ReadinessGates,
  evaluateLd2MaxTexelNegativeEvidenceGates,
  generateLd2IntegrationSamples,
  orientationDifferenceRadians,
  measureLd2LocalConcentration,
  relativeDifference,
  replayLd2Radius2Metrics,
  runLd2SourceSize,
} from "../../../src/studies/cloud-sculpt/lightDrawing/ld2SourceSize.ts";
import { generateFiniteLightSamples } from "../../../src/studies/cloud-sculpt/finiteLightSamples.ts";
import type { ReceiverTransportField } from "../../../src/studies/cloud-sculpt/receiverTransport.ts";

const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => a.x * b.x + a.y * b.y + a.z * b.z;
const length = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z);

function syntheticLuminanceField(width: number, height: number, values: ReadonlyArray<readonly [number, number, number]>): ReceiverTransportField {
  const depositedFluxRgb = new Float32Array(width * height * 3);
  for (let index = 0; index < values.length; index++) depositedFluxRgb.set(values[index], index * 3);
  return { width, height, minU: 0, minV: 0, sizeU: width, sizeV: height, depositedFluxRgb } as ReceiverTransportField;
}

test("the opt-in diameter mapper uses tangent half-angle disk coordinates and an orthonormal circular basis", () => {
  const basis = makeLd1SourceDirectionBasis();
  assert.ok(Math.abs(length(basis.central) - 1) < 1e-14);
  assert.ok(Math.abs(length(basis.tangentU) - 1) < 1e-14);
  assert.ok(Math.abs(length(basis.tangentV) - 1) < 1e-14);
  assert.ok(Math.abs(dot(basis.central, basis.tangentU)) < 1e-14);
  assert.ok(Math.abs(dot(basis.central, basis.tangentV)) < 1e-14);
  assert.ok(Math.abs(dot(basis.tangentU, basis.tangentV)) < 1e-14);
  assert.deepEqual(basis.central, LD1_FIXED_CENTRAL_DIRECTION);
  const angle = 20; const slope = Math.tan(angle * Math.PI / 180 / 2);
  const edge = mapLd1SourceDiskDirection(1, 0, angle, basis);
  assert.ok(Math.abs(dot(edge, basis.central) - 1 / Math.sqrt(1 + slope * slope)) < 1e-14);
  const plus = mapLd1SourceDiskDirection(.37, -.42, angle, basis);
  const minus = mapLd1SourceDiskDirection(-.37, .42, angle, basis);
  assert.ok(Math.abs(dot(plus, basis.tangentU) + dot(minus, basis.tangentU)) < 1e-14);
  assert.ok(Math.abs(dot(plus, basis.tangentV) + dot(minus, basis.tangentV)) < 1e-14);
  for (const point of [[0, 0], [.9, -.1], [-.4, .8]] as const) assert.ok(Math.abs(length(mapLd1SourceDiskDirection(point[0], point[1], angle)) - 1) < 1e-14);
});

test("diameter model validation is explicit and legacy null remains a deterministic replay", () => {
  assert.equal(makeLd1Config().sourceAngularDiameterDegrees, null);
  for (const diameter of [-.001, 20.001, NaN, Infinity]) assert.throws(() => makeLd1Config({ sourceAngularDiameterDegrees: diameter }), RangeError);
  const a = runLd1Reference({ sampleCount: 768, fieldWidth: 64, fieldHeight: 64 });
  const b = runLd1Reference({ sampleCount: 768, fieldWidth: 64, fieldHeight: 64, sourceAngularDiameterDegrees: null });
  assert.deepEqual([...a.on.field.depositedFluxRgb], [...b.on.field.depositedFluxRgb]);
});

test("explicit sample entry point validates its bounded 4D domain and reproduces a supplied legacy buffer", () => {
  const options = { sampleCount: 8, fieldWidth: 8, fieldHeight: 8 };
  const samples = generateFiniteLightSamples(8, "hikari-opt-ld-1-candidate-v1");
  assert.deepEqual([...runLd1Reference(options).on.field.depositedFluxRgb], [...runLd1ReferenceWithSamples(samples, options).on.field.depositedFluxRgb]);
  assert.throws(() => runLd1ReferenceWithSamples(new Float32Array(31), options), RangeError);
  const nonFinite = samples.slice(); nonFinite[0] = NaN;
  assert.throws(() => runLd1ReferenceWithSamples(nonFinite, options), RangeError);
  const apertureOutside = samples.slice(); apertureOutside[1] = 1.01;
  assert.throws(() => runLd1ReferenceWithSamples(apertureOutside, options), RangeError);
  const diskOutside = samples.slice(); diskOutside[2] = 1; diskOutside[3] = 1;
  assert.throws(() => runLd1ReferenceWithSamples(diskOutside, options), RangeError);
});

test("finite source disk samples are deterministic shared-prefix input with radial and quadrant balance", () => {
  const a = generateFiniteLightSamples(16384, "hikari-opt-ld-1-candidate-v1"); const b = generateFiniteLightSamples(32768, "hikari-opt-ld-1-candidate-v1");
  assert.deepEqual([...a], [...b.subarray(0, a.length)]);
  let inner = 0; const quadrants = [0, 0, 0, 0];
  for (let i = 0; i < a.length; i += 4) { const x = a[i + 2]; const y = a[i + 3]; if (x * x + y * y <= .25) inner++; quadrants[(x >= 0 ? 1 : 0) + (y >= 0 ? 2 : 0)]++; }
  assert.ok(Math.abs(inner / 16384 - .25) < .02);
  for (const count of quadrants) assert.ok(Math.abs(count / 16384 - .25) < .02);
});

test("primary and audit scrambled Sobol buffers are frozen, prefix-invariant, bounded, and balanced", () => {
  const seed = "hikari-opt-ld-1-candidate-v1";
  assert.deepEqual([...generateLd2IntegrationSamples(2, seed, "primary")], [.9804568886756897, .9014102816581726, .7881618142127991, -.5104033350944519, -.333881676197052, -.9399343729019165, .5493941903114319, .24623580276966095]);
  assert.deepEqual([...generateLd2IntegrationSamples(2, seed, "audit")], [.9644321799278259, .5331271290779114, .3051590919494629, -.3356582522392273, -.3008806109428406, -.727878212928772, .5501039624214172, .46065905690193176]);
  for (const count of [0, -1, 32769, 1.5, NaN, Infinity]) assert.throws(() => generateLd2IntegrationSamples(count, seed, "primary"), RangeError);
  assert.throws(() => generateLd2IntegrationSamples(2, seed, "legacy-negative-evidence" as never), RangeError);
  const primary16 = generateLd2IntegrationSamples(16384, seed, "primary"); const primary32 = generateLd2IntegrationSamples(32768, seed, "primary");
  const audit16 = generateLd2IntegrationSamples(16384, seed, "audit"); const audit32 = generateLd2IntegrationSamples(32768, seed, "audit");
  assert.deepEqual([...primary16], [...primary32.subarray(0, primary16.length)]); assert.deepEqual([...audit16], [...audit32.subarray(0, audit16.length)]);
  assert.notDeepEqual([...primary16.subarray(0, 8)], [...audit16.subarray(0, 8)]);
  for (const samples of [primary16, audit16]) {
    let apertureX = 0; let apertureZ = 0; let radialSecondMoment = 0; const quadrants = [0, 0, 0, 0];
    for (let i = 0; i < samples.length; i += 4) { const x = samples[i]; const z = samples[i + 1]; const u = samples[i + 2]; const v = samples[i + 3]; assert.ok(Math.abs(x) <= 1 && Math.abs(z) <= 1 && u * u + v * v <= 1 + 1e-6); apertureX += x; apertureZ += z; radialSecondMoment += u * u + v * v; quadrants[(u >= 0 ? 1 : 0) + (v >= 0 ? 2 : 0)]++; }
    assert.ok(Math.abs(apertureX / 16384) < .002 && Math.abs(apertureZ / 16384) < .002);
    assert.ok(Math.abs(radialSecondMoment / 16384 - .5) < .002);
    for (const count of quadrants) assert.ok(Math.abs(count / 16384 - .25) < .01);
  }
});

test("LD2 canonical run is trace-identical, monotonic, closes terminals, and keeps the fixed ROI", () => {
  assert.deepEqual(LD2_SOURCE_ANGULAR_DIAMETERS, [.53, 5, 20]);
  assert.equal(LD2_READINESS_RECONSTRUCTION_RADIUS_TEXELS, 8, "512 / 128 × LD1 radius 2 is frozen before qualification");
  assert.equal(LD2_READINESS_LOCAL_CONCENTRATION_WINDOW_TEXELS, 17);
  assert.equal(LD2_READINESS_LOCAL_CONCENTRATION_TEXEL_PITCH, .00546875);
  assert.equal(LD2_READINESS_LOCAL_CONCENTRATION_PHYSICAL_SIDE, .09296875);
  assert.equal(2 * LD2_READINESS_RECONSTRUCTION_RADIUS_TEXELS * LD2_READINESS_LOCAL_CONCENTRATION_TEXEL_PITCH, 2 * 2 * (2.8 / 128), "radius half-width is physically equivalent to LD1 128² radius-2 footprint");
  assert.deepEqual(LD2_TRACE_ROI, { minU: -.95, maxU: 1.15, minV: -.30, maxV: .55 });
  const run = runLd2SourceSize(16384); const replay = runLd2SourceSize(16384);
  for (let i = 0; i < run.cases.length; i++) {
    const a = run.cases[i]; const b = replay.cases[i];
    assert.deepEqual([...a.result.on.reconstructedField.depositedFluxRgb], [...b.result.on.reconstructedField.depositedFluxRgb]);
    assert.deepEqual([...a.qualificationField.depositedFluxRgb], [...b.qualificationField.depositedFluxRgb]);
    assert.notStrictEqual(a.qualificationField, a.result.on.reconstructedField);
    assert.equal(a.metrics.supportLeakage, 0);
    for (const channel of ["r", "g", "b"] as const) assert.ok(Math.abs(a.metrics.terminalClosureResidual[channel]) < 2e-8);
  }
  for (let i = 1; i < run.cases.length; i++) {
    assert.ok(run.cases[i].metrics.peakConcentration < run.cases[i - 1].metrics.peakConcentration);
    assert.ok(run.cases[i].metrics.effectiveArea > run.cases[i - 1].metrics.effectiveArea);
  }
  assert.ok(orientationDifferenceRadians(run.cases[0].metrics.principalAxisRadians, run.cases[2].metrics.principalAxisRadians) <= 5 * Math.PI / 180);
});

test("local concentration uses a full-field complete-window summed-area formula with no padding or ROI", () => {
  const full = syntheticLuminanceField(17, 17, Array.from({ length: 17 * 17 }, () => [1, 1, 1] as const));
  assert.equal(measureLd2LocalConcentration(full), 1, "one complete 17×17 window contains the complete full-field denominator");
  const edgeValues = Array.from({ length: 18 * 17 }, () => [0, 0, 0] as [number, number, number]);
  edgeValues[0] = [1, 1, 1]; edgeValues[17] = [1, 1, 1];
  const edge = syntheticLuminanceField(18, 17, edgeValues);
  assert.equal(measureLd2LocalConcentration(edge), .5, "both complete edge-aligned windows see one of two full-field texels; no padded 17×17 window is allowed");
  assert.equal(measureLd2LocalConcentration(syntheticLuminanceField(16, 17, Array.from({ length: 16 * 17 }, () => [1, 1, 1] as const))), 0, "no incomplete window is considered");
});

test("legacy sampler and LD1 radius-2 reconstruction remain frozen negative evidence", () => {
  const low = runLd2SourceSize(16384, "legacy-negative-evidence"); const high = runLd2SourceSize(32768, "legacy-negative-evidence");
  const radius2Low = replayLd2Radius2Metrics(low); const radius2High = replayLd2Radius2Metrics(high);
  assert.ok(relativeDifference(radius2Low.cases[0].metrics.peakConcentration, radius2High.cases[0].metrics.peakConcentration) > .05);
  assert.equal(low.estimator, "legacy-negative-evidence");
});

test("fixed nested-Owen local-concentration gate qualifies while max-texel and radius-2 evidence remain exact", () => {
  const primary16 = runLd2SourceSize(16384, "primary"); const primary32 = runLd2SourceSize(32768, "primary");
  const audit16 = runLd2SourceSize(16384, "audit"); const audit32 = runLd2SourceSize(32768, "audit");
  for (const [low, high] of [[primary16, primary32], [audit16, audit32]] as const) {
    for (let i = 0; i < high.cases.length; i++) {
      const a = low.cases[i].metrics; const b = high.cases[i].metrics;
      for (const channel of ["r", "g", "b"] as const) assert.ok(relativeDifference(a.rawTransmission[channel], b.rawTransmission[channel]) <= .02);
      assert.equal(b.supportLeakage, 0); assert.deepEqual(b.tir, { r: 0, g: 0, b: 0 });
      for (const channel of ["r", "g", "b"] as const) assert.ok(Math.abs(b.terminalClosureResidual[channel]) < 2e-8);
      if (i > 0) { assert.ok(b.peakConcentration < high.cases[i - 1].metrics.peakConcentration); assert.ok(b.effectiveArea > high.cases[i - 1].metrics.effectiveArea); }
    }
    const baseline = high.cases[0].metrics;
    for (const item of high.cases.slice(1)) {
      for (const channel of ["r", "g", "b"] as const) assert.ok(relativeDifference(item.metrics.rawTransmission[channel], baseline.rawTransmission[channel]) <= .05);
      assert.ok(Math.hypot(item.metrics.centroid!.u - baseline.centroid!.u, item.metrics.centroid!.v - baseline.centroid!.v) <= .02);
      assert.ok(orientationDifferenceRadians(item.metrics.principalAxisRadians, baseline.principalAxisRadians) <= 5 * Math.PI / 180);
    }
  }
  const evaluation = evaluateLd2ReadinessGates(primary16, primary32, audit16, audit32);
  assert.equal(evaluation.qualified, true);
  assert.deepEqual(evaluation.failures, []);
  const maxTexelEvaluation = evaluateLd2MaxTexelNegativeEvidenceGates(primary16, primary32, audit16, audit32);
  assert.deepEqual(maxTexelEvaluation.failures.map(({ code, actual, threshold }) => [code, actual, threshold]), [
    ["primary:20:max-texel-concentration-convergence", .15190913729312328, .05],
    ["primary-audit:20:max-texel-concentration-discrepancy", .07365026383968129, .05],
  ]);
  const radius2Evaluation = evaluateLd2MaxTexelNegativeEvidenceGates(
    replayLd2Radius2Metrics(primary16), replayLd2Radius2Metrics(primary32),
    replayLd2Radius2Metrics(audit16), replayLd2Radius2Metrics(audit32),
  );
  const expectedFailures = [
    ["primary:5:max-texel-concentration-convergence", .06958298424832433],
    ["primary:5:effective-area-convergence", .06376472725673475],
    ["primary:20:max-texel-concentration-convergence", .36140647413220367],
    ["primary:20:effective-area-convergence", .10746259656889985],
    ["audit:5:max-texel-concentration-convergence", .06480383469980763],
    ["audit:5:effective-area-convergence", .0576548398129195],
    ["audit:20:max-texel-concentration-convergence", .23347356934817168],
    ["audit:20:effective-area-convergence", .09945447939925521],
  ] as const;
  assert.equal(radius2Evaluation.failures.length, expectedFailures.length);
  for (const [index, [code, actual]] of expectedFailures.entries()) {
    const failure = radius2Evaluation.failures[index];
    assert.equal(failure.code, code);
    assert.equal(failure.threshold, .05);
    assert.ok(Math.abs(failure.actual - actual) <= 1e-12, `${code} actual ${failure.actual} differs from frozen ${actual}`);
  }
});
