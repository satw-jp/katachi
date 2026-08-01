import assert from "node:assert/strict";
import test from "node:test";
import {
  compareReceiverFields,
  type ReceiverParityThresholds,
} from "../../src/studies/cloud-sculpt/receiverParity.ts";
import {
  createReceiverTransportField,
  splatBilinearCoverageFlux,
  splatBilinearFluxRgb,
  type FluxRgb,
  type ReceiverFieldSpec,
  type ReceiverTransportField,
} from "../../src/studies/cloud-sculpt/receiverTransport.ts";

const SPEC: ReceiverFieldSpec = {
  receiverId: "receiver-a",
  sceneRevision: "scene-a",
  lightRevision: "light-a",
  width: 7,
  height: 7,
  minU: 0,
  minV: 0,
  sizeU: 7,
  sizeV: 7,
};

const PERMISSIVE_THRESHOLDS: ReceiverParityThresholds = {
  maxFluxRelativeError: 10,
  maxCentroidDistanceTexels: 10,
  maxEnvelopeDistanceTexels: 10,
  minSupportIou: 0,
  maxDepositNormalizedL1: 1,
  maxCoverageNormalizedL1: 1,
};

test("identical receiver fields pass every parity metric", () => {
  const field = fieldWithSingleTexel(3, 3, { r: 2, g: 1, b: 0.5 });
  const metrics = compareReceiverFields(field, field);
  assert.equal(metrics.compatible, true);
  assert.deepEqual(metrics.incompatibilities, []);
  assert.deepEqual(metrics.relativeFluxErrorRgb, { r: 0, g: 0, b: 0 });
  assert.equal(metrics.centroidDistanceTexels, 0);
  assert.equal(metrics.envelopeDistanceTexels, 0);
  assert.equal(metrics.supportIou, 1);
  assert.equal(metrics.normalizedDepositL1, 0);
  assert.equal(metrics.normalizedCoverageL1, 0);
  assert.equal(metrics.pass, true);
  assert.ok(Object.values(metrics.gates).every(Boolean));
});

test("amplitude error is separate from normalized spatial shape", () => {
  const reference = fieldWithSingleTexel(3, 3, { r: 1, g: 2, b: 3 });
  const candidate = fieldWithSingleTexel(3, 3, { r: 2, g: 4, b: 6 });
  const metrics = compareReceiverFields(reference, candidate);
  assert.deepEqual(metrics.relativeFluxErrorRgb, { r: 1, g: 1, b: 1 });
  assert.equal(metrics.normalizedDepositL1, 0);
  assert.equal(metrics.normalizedCoverageL1, 0);
  assert.equal(metrics.gates.flux, false);
  assert.equal(metrics.gates.depositShape, true);
  assert.equal(metrics.pass, false);
});

test("one-texel translation is reported in texel units and support IoU", () => {
  const reference = fieldWithSingleTexel(2, 3, { r: 1, g: 1, b: 1 });
  const candidate = fieldWithSingleTexel(3, 3, { r: 1, g: 1, b: 1 });
  const metrics = compareReceiverFields(reference, candidate, PERMISSIVE_THRESHOLDS);
  assert.ok(Math.abs(metrics.centroidDistanceTexels! - 1) <= 1e-12);
  assert.ok(Math.abs(metrics.envelopeDistanceTexels! - 1) <= 1e-12);
  assert.ok(Math.abs(metrics.supportIou - 0.5) <= 1e-12);
  assert.equal(metrics.normalizedDepositL1, 1);
  assert.equal(metrics.normalizedCoverageL1, 1);
  assert.equal(metrics.pass, true);
});

test("empty fields have defined parity semantics", () => {
  const emptyA = createReceiverTransportField(SPEC);
  const emptyB = createReceiverTransportField(SPEC);
  const emptyMetrics = compareReceiverFields(emptyA, emptyB);
  assert.equal(emptyMetrics.centroidDistanceTexels, 0);
  assert.equal(emptyMetrics.envelopeDistanceTexels, 0);
  assert.equal(emptyMetrics.supportIou, 1);
  assert.equal(emptyMetrics.normalizedDepositL1, 0);
  assert.equal(emptyMetrics.normalizedCoverageL1, 0);
  assert.equal(emptyMetrics.pass, true);

  const nonempty = fieldWithSingleTexel(3, 3, { r: 1, g: 1, b: 1 });
  const mixedMetrics = compareReceiverFields(emptyA, nonempty);
  assert.equal(mixedMetrics.centroidDistanceTexels, null);
  assert.equal(mixedMetrics.envelopeDistanceTexels, null);
  assert.equal(mixedMetrics.supportIou, 0);
  assert.equal(mixedMetrics.normalizedDepositL1, 1);
  assert.equal(mixedMetrics.normalizedCoverageL1, 1);
  assert.equal(mixedMetrics.pass, false);
});

test("receiver identity, revisions, and domain are structural gates", () => {
  const reference = fieldWithSingleTexel(3, 3, { r: 1, g: 1, b: 1 });
  const cases: Array<[string, ReceiverTransportField]> = [
    ["receiverId", fieldWithSpec({ ...SPEC, receiverId: "receiver-b" })],
    ["sceneRevision", fieldWithSpec({ ...SPEC, sceneRevision: "scene-b" })],
    ["lightRevision", fieldWithSpec({ ...SPEC, lightRevision: "light-b" })],
    ["width", fieldWithSpec({ ...SPEC, width: 8 })],
    ["minU", fieldWithSpec({ ...SPEC, minU: -1 })],
  ];
  for (const [expectedIssue, candidate] of cases) {
    const metrics = compareReceiverFields(reference, candidate, PERMISSIVE_THRESHOLDS);
    assert.equal(metrics.compatible, false);
    assert.ok(metrics.incompatibilities.includes(expectedIssue));
    assert.equal(metrics.gates.structure, false);
    assert.equal(metrics.pass, false);
  }
});

test("RGB channel imbalance cannot hide behind equal total luminance", () => {
  const reference = fieldWithSingleTexel(3, 3, { r: 1, g: 1, b: 1 });
  const candidate = fieldWithSingleTexel(3, 3, { r: 1.5, g: 1, b: 0.5 });
  const metrics = compareReceiverFields(reference, candidate);
  assertRgbClose(metrics.relativeFluxErrorRgb, { r: 0.5, g: 0, b: 0.5 });
  assert.equal(metrics.normalizedDepositL1, 0);
  assert.equal(metrics.gates.flux, false);
  assert.equal(metrics.pass, false);
});

test("coverage mismatch is independent from deposited-flux parity", () => {
  const reference = fieldWithSingleTexel(2, 3, { r: 1, g: 1, b: 1 });
  const candidate = fieldWithSingleTexel(2, 3, { r: 1, g: 1, b: 1 });
  candidate.geometricCoverage.fill(0);
  splatBilinearCoverageFlux(candidate, texelCenter(4), texelCenter(3), 1);
  const metrics = compareReceiverFields(reference, candidate);
  assert.deepEqual(metrics.relativeFluxErrorRgb, { r: 0, g: 0, b: 0 });
  assert.equal(metrics.normalizedDepositL1, 0);
  assert.equal(metrics.normalizedCoverageL1, 1);
  assert.ok(metrics.supportIou < 0.9);
  assert.equal(metrics.gates.coverageShape, false);
  assert.equal(metrics.pass, false);
});

test("comparison does not mutate either receiver field", () => {
  const reference = fieldWithSingleTexel(2, 3, { r: 1, g: 0.5, b: 0.25 });
  const candidate = fieldWithSingleTexel(3, 3, { r: 0.8, g: 0.6, b: 0.4 });
  const beforeReference = snapshot(reference);
  const beforeCandidate = snapshot(candidate);
  compareReceiverFields(reference, candidate, PERMISSIVE_THRESHOLDS);
  assert.deepEqual(snapshot(reference), beforeReference);
  assert.deepEqual(snapshot(candidate), beforeCandidate);
});

function fieldWithSingleTexel(
  x: number,
  y: number,
  flux: FluxRgb,
): ReceiverTransportField {
  const field = createReceiverTransportField(SPEC);
  splatBilinearCoverageFlux(field, texelCenter(x), texelCenter(y), 1);
  splatBilinearFluxRgb(field, texelCenter(x), texelCenter(y), flux);
  return field;
}

function fieldWithSpec(spec: ReceiverFieldSpec): ReceiverTransportField {
  const field = createReceiverTransportField(spec);
  const x = Math.min(3, spec.width - 1);
  const y = Math.min(3, spec.height - 1);
  const u = spec.minU + (x + 0.5) * spec.sizeU / spec.width;
  const v = spec.minV + (y + 0.5) * spec.sizeV / spec.height;
  splatBilinearCoverageFlux(field, u, v, 1);
  splatBilinearFluxRgb(field, u, v, { r: 1, g: 1, b: 1 });
  return field;
}

function texelCenter(index: number): number {
  return SPEC.minU + (index + 0.5) * SPEC.sizeU / SPEC.width;
}

function assertRgbClose(actual: FluxRgb, expected: FluxRgb): void {
  for (const channel of ["r", "g", "b"] as const) {
    assert.ok(Math.abs(actual[channel] - expected[channel]) <= 1e-12);
  }
}

function snapshot(field: ReceiverTransportField): unknown {
  return {
    receiverId: field.receiverId,
    sceneRevision: field.sceneRevision,
    lightRevision: field.lightRevision,
    width: field.width,
    height: field.height,
    minU: field.minU,
    minV: field.minV,
    sizeU: field.sizeU,
    sizeV: field.sizeV,
    texelArea: field.texelArea,
    geometricCoverage: Array.from(field.geometricCoverage),
    straightThroughputRgb: Array.from(field.straightThroughputRgb),
    depositedFluxRgb: Array.from(field.depositedFluxRgb),
  };
}
