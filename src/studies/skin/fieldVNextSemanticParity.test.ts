import assert from "node:assert/strict";
import type { Ball } from "../cloud-sculpt/field.ts";
import {
  compositeSdf,
  type Patch,
  type PatchShape,
  type SkinMode,
} from "./field.ts";
import { packFieldGpuPayload, encodeGpuShapeCode } from "./fieldGpuPayload.ts";
import { buildFieldPrimitiveStore } from "./fieldPrimitiveStore.ts";
import {
  compareFieldVNextSemantics,
  FIELD_VNEXT_PARITY_TOLERANCE,
  type FieldSample,
  type FieldVNextParityReport,
} from "./fieldVNextSemantic.ts";
import { evaluateVNextShader } from "./fieldVNextShader.ts";

const host: Ball[] = [
  { id: 1, x: 0, y: 0, z: 0, r: 2 },
  { id: 2, x: 0.7, y: 0.2, z: -0.3, r: 0.85 },
  { id: 3, x: -0.85, y: 0.15, z: 0.45, r: 0.7 },
];
const hostK = 0.23;
const thickness = 0.42;
const roundK = 0.13;

const samples: FieldSample[] = [
  { x: 0, y: 0, z: 0 },
  { x: 1.65, y: 0, z: 0 },
  { x: 1.8, y: 0, z: 0 },
  { x: 2, y: 0, z: 0 },
  { x: 2.2, y: 0, z: 0 },
  { x: 2.45, y: 0, z: 0 },
  { x: 2, y: 0.35, z: 0 },
  { x: 2.05, y: -0.32, z: 0.18 },
  { x: 1.72, y: 0.18, z: -0.2 },
  { x: 2.75, y: 0.8, z: -0.45 },
  { x: 3.5, y: 0, z: 0 },
  { x: -2.15, y: 0.1, z: 0.2 },
  { x: -1.35, y: -0.55, z: 0.7 },
  { x: 0.5, y: 2.25, z: 0.2 },
  { x: 0.1, y: -2.4, z: -0.6 },
];

function point(x: number, y: number, z: number, r: number) {
  return { x, y, z, r };
}

function patch(id: number, shape: PatchShape, points: Patch["points"]): Patch {
  return { id, shape, points };
}

const mixedPatches: Patch[] = [
  patch(17, "coin", [
    point(2.02, 0, 0, 0.3),
    point(2.1, 0.12, -0.05, 0.22),
  ]),
  patch(42, "flatRing", [
    point(1.96, 0.4, 0.1, 0.19),
    point(1.86, 0.48, 0.04, 0.16),
    point(2.03, 0.3, 0.18, 0.14),
  ]),
  patch(99, "ring3d", [
    point(2.18, -0.35, 0.14, 0.25),
    point(2.35, -0.23, 0.22, 0.2),
    point(2.12, -0.52, 0.08, 0.18),
  ]),
  patch(123, "flower", [
    point(1.98, -0.55, -0.1, 0.24),
    point(2.12, -0.68, -0.05, 0.17),
    point(1.84, -0.65, -0.2, 0.16),
  ]),
];

function makePayload(patches: ReadonlyArray<Patch>, maxTextureSize = 256) {
  const store = buildFieldPrimitiveStore(patches);
  return { store, payload: packFieldGpuPayload(store.primitives, maxTextureSize) };
}

function runParityCase(
  name: string,
  patches: Patch[],
  mode: SkinMode,
  coinBulge: number,
  coinBulgeBalance: number,
  caseSamples = samples,
  caseRoundK = roundK,
): FieldVNextParityReport {
  const { payload } = makePayload(patches);
  const legacy = (x: number, y: number, z: number) => compositeSdf(
    mode,
    host,
    hostK,
    thickness,
    patches,
    caseRoundK,
    x,
    y,
    z,
    coinBulge,
    coinBulgeBalance,
  );
  const vNext = (sample: FieldSample) => evaluateVNextShader(
    sample,
    payload,
    {
      mode,
      host,
      hostK,
      thickness,
      roundK: caseRoundK,
      coinBulge,
      coinBulgeBalance,
    },
  ).sdf;
  const report = compareFieldVNextSemantics(legacy, vNext, caseSamples);
  assert.equal(report.mismatchCount, 0, `${name}: ${JSON.stringify(report)}`);
  assert.ok(
    report.maxAbsoluteError <= FIELD_VNEXT_PARITY_TOLERANCE,
    `${name}: max error ${report.maxAbsoluteError} > ${FIELD_VNEXT_PARITY_TOLERANCE}`,
  );
  console.log(`  ${name}: ${JSON.stringify(report)}`);
  return report;
}

console.log("=== FIELD vNext Legacy Semantic Parity ===\n");
console.log(`Explicit tolerance: ${FIELD_VNEXT_PARITY_TOLERANCE}`);

console.log("Test 1: empty payload preserves plate-nothing and window-shell semantics");
runParityCase("empty plate", [], "plate", 0, 0);
runParityCase("empty window", [], "window", 0, 0);

console.log("Test 2: each Legacy shape and mixed ownership/order in plate and window");
for (const shape of ["coin", "flatRing", "ring3d", "flower"] as const) {
  runParityCase(`${shape} plate`, [mixedPatches.find((candidate) => candidate.shape === shape)!], "plate", 0, 0);
  runParityCase(`${shape} window`, [mixedPatches.find((candidate) => candidate.shape === shape)!], "window", 0, 0);
}
runParityCase("mixed plate coinBulge=0", mixedPatches, "plate", 0, 0);
runParityCase("mixed plate hard union", mixedPatches, "plate", 0, 0, samples, 0);
runParityCase("mixed window", mixedPatches, "window", 0, 0);

console.log("Test 3: positive coinBulge with balance -1, intermediate, 0, and +1");
for (const balance of [-1, -0.35, 0, 0.35, 1]) {
  runParityCase(`mixed plate coinBulge=0.48 balance=${balance}`, mixedPatches, "plate", 0.48, balance);
}

console.log("Test 4: coinBulge is plate-only; window remains the same semantic branch");
const windowBulgeZero = runParityCase("window coinBulge=0", mixedPatches, "window", 0, 0);
const windowBulgePositive = runParityCase("window coinBulge=0.48 balance=0.35", mixedPatches, "window", 0.48, 0.35);
assert.equal(windowBulgeZero.mismatchCount, windowBulgePositive.mismatchCount);
assert.equal(windowBulgeZero.maxAbsoluteError, windowBulgePositive.maxAbsoluteError);

console.log("Test 5: payload ownership and canonical point order are preserved");
{
  const { store, payload } = makePayload(mixedPatches);
  assert.equal(payload.primitiveCount, store.primitiveCount);
  assert.equal(payload.metadata[0], 0, "GPU owner is patch slot, not Patch.id");
  for (let index = 0; index < store.primitiveCount; index++) {
    const primitive = store.primitives[index];
    const geometryOffset = index * 4;
    const metadataOffset = index * 4;
    assert.ok(Math.abs(payload.geometry[geometryOffset] - primitive.position.x) <= 1e-6);
    assert.ok(Math.abs(payload.geometry[geometryOffset + 1] - primitive.position.y) <= 1e-6);
    assert.ok(Math.abs(payload.geometry[geometryOffset + 2] - primitive.position.z) <= 1e-6);
    assert.ok(Math.abs(payload.geometry[geometryOffset + 3] - primitive.radius) <= 1e-6);
    assert.equal(payload.metadata[metadataOffset], primitive.patchIndex);
    assert.equal(payload.metadata[metadataOffset + 1], encodeGpuShapeCode(primitive.shape));
    assert.equal(payload.metadata[metadataOffset + 2], primitive.pointIndex);
  }
  console.log(`  ownership/order: ${store.primitiveCount} primitives PASS`);
}

console.log("Test 6: 255 and 256 points remain complete and semantically parity-safe");
for (const count of [255, 256]) {
  const points = Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return point(
      2 + 0.12 * Math.cos(angle),
      0.55 * Math.sin(angle),
      0.32 * Math.cos(angle * 2),
      0.08 + 0.01 * ((index % 5) / 4),
    );
  });
  const boundaryPatch = [patch(707, "coin", points)];
  const { store, payload } = makePayload(boundaryPatch, 16);
  assert.equal(store.primitiveCount, count);
  assert.equal(payload.primitiveCount, count);
  assert.ok(payload.width * payload.height >= count);
  runParityCase(`coin ${count}`, boundaryPatch, "plate", 0.48, 0.35, samples.slice(0, 12));
}

console.log("\n=== FIELD vNext Legacy Semantic Parity PASSED ===\n");
