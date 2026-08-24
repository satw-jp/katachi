import assert from "node:assert/strict";
import { test } from "node:test";
import { indexTriangleSoup } from "./bambu3mf.ts";
import { buildExternalPerimeterScaffold } from "./externalScaffold.ts";

const square = (z: number): Float32Array => new Float32Array([
  0, 0, z, 10, 0, z, 0, 10, z,
  10, 0, z, 10, 10, z, 0, 10, z,
]);
const smallTriangle = (x: number, y: number, z: number): number[] => [
  x - 0.2, y - 0.2, z, x + 0.2, y - 0.2, z, x, y + 0.2, z,
];
const bodyWithPlate = (...triangles: number[][]): Float32Array => new Float32Array([
  ...square(5),
  -5, -5, 0, -4, -5, 0, -5, -4, 0,
  ...triangles.flat(),
]);

test("outer hull band keeps perimeter candidates and excludes the interior", () => {
  const reachable = new Float32Array([...smallTriangle(0.8, 5, 5), ...smallTriangle(5, 5, 5)]);
  const result = buildExternalPerimeterScaffold(reachable, square(5), bodyWithPlate(), {
    coverageMode: "outerBand", perimeterBandMm: 1.2, spacingMm: 1, shaftRadiusMm: 0.2, baseRadiusMm: 0.3,
    tipRadiusMm: 0.12, xyClearanceMm: 0.05, contactOverlapMm: 0.1,
  });
  assert.equal(result.stats.reachableFaceCount, 2);
  assert.equal(result.stats.perimeterFaceCount, 1);
  assert.equal(result.stats.pillarCount, 1);
  assert.ok(result.positions.length > 0);
});

test("default coverage keeps plate-reachable candidates across the full field", () => {
  const reachable = new Float32Array([...smallTriangle(0.8, 5, 5), ...smallTriangle(5, 5, 5)]);
  const result = buildExternalPerimeterScaffold(reachable, square(5), bodyWithPlate(), {
    spacingMm: 1, shaftRadiusMm: 0.2, baseRadiusMm: 0.3,
    tipRadiusMm: 0.12, xyClearanceMm: 0.05, contactOverlapMm: 0.1,
  });
  assert.equal(result.stats.coverageFaceCount, 2);
  assert.equal(result.stats.perimeterFaceCount, 0);
  assert.equal(result.stats.pillarCount, 2);
  assert.equal(result.stats.plateZMm, -1);
  assert.ok(result.pillars.every((pillar) => pillar.plateZMm === -1));
  let minScaffoldZ = Infinity;
  for (let offset = 2; offset < result.positions.length; offset += 3) minScaffoldZ = Math.min(minScaffoldZ, result.positions[offset]);
  assert.equal(minScaffoldZ, -1);
});

test("a lower BODY intersection rejects a nominally reachable column", () => {
  const reachable = new Float32Array(smallTriangle(0.8, 5, 5));
  const blocker = new Float32Array(smallTriangle(0.8, 5, 2));
  const result = buildExternalPerimeterScaffold(reachable, square(5), bodyWithPlate(Array.from(blocker)), {
    perimeterBandMm: 1.2, spacingMm: 1, shaftRadiusMm: 0.2, baseRadiusMm: 0.3,
    tipRadiusMm: 0.12, xyClearanceMm: 0.05, contactOverlapMm: 0.1,
  });
  assert.equal(result.stats.collisionRejectedFaceCount, 1);
  assert.equal(result.stats.pillarCount, 0);
  assert.equal(result.positions.length, 0);
});

test("slice feedback keeps a plate rail even when BODY intersects its vertical path", () => {
  const blocker = new Float32Array(smallTriangle(5, 5, 2));
  const result = buildExternalPerimeterScaffold(
    new Float32Array(0),
    square(5),
    bodyWithPlate(Array.from(blocker)),
    {
      spacingMm: 1, shaftRadiusMm: 0.2, baseRadiusMm: 0.3,
      tipRadiusMm: 0.12, xyClearanceMm: 0.05, contactOverlapMm: 0.1,
    },
    [{ xMm: 5, yMm: 5, zMm: 4 }],
  );
  assert.equal(result.stats.explicitTargetCount, 1);
  assert.equal(result.stats.explicitTargetEmbeddedColumnCount, 1);
  assert.equal(result.stats.explicitTargetPillarCount, 1);
  assert.equal(result.stats.pillarCount, 1);
  assert.equal(result.pillars[0].plateAnchored, true);
  assert.equal(result.pillars[0].targetZMm, 4);
  assert.equal(result.pillars[0].contactRadiusMm, 0.12);
});

test("base-form interior policy removes internal columns but keeps an exterior column", () => {
  const reachable = new Float32Array([...smallTriangle(5, 5, 5), ...smallTriangle(0.8, 5, 5)]);
  const result = buildExternalPerimeterScaffold(
    reachable,
    square(5),
    bodyWithPlate(),
    {
      spacingMm: 1, shaftRadiusMm: 0.2, baseRadiusMm: 0.3,
      tipRadiusMm: 0.12, xyClearanceMm: 0.05, contactOverlapMm: 0.1,
    },
    [],
    {
      host: [{ id: 1, x: 5, y: 5, z: 2.5, r: 2.5 }],
      hostK: 0,
      scaleMmPerUnit: 1,
      rejectEmbeddedExplicitTargets: true,
    },
  );
  assert.equal(result.stats.baseInteriorRejectedFaceCount, 1);
  assert.equal(result.stats.pillarCount, 1);
  assert.ok(Math.abs(result.pillars[0].xMm - 0.8) < 1e-6);
});
test("next-candidate policy rejects an explicit slice-feedback rail that crosses BODY", () => {
  const blocker = new Float32Array(smallTriangle(5, 5, 2));
  const result = buildExternalPerimeterScaffold(
    new Float32Array(0),
    square(5),
    bodyWithPlate(Array.from(blocker)),
    { spacingMm: 1, shaftRadiusMm: 0.2, baseRadiusMm: 0.3, tipRadiusMm: 0.12, xyClearanceMm: 0.05, contactOverlapMm: 0.1 },
    [{ xMm: 5, yMm: 5, zMm: 4 }],
    {
      host: [{ id: 1, x: 100, y: 100, z: 100, r: 1 }],
      hostK: 0,
      scaleMmPerUnit: 1,
      rejectEmbeddedExplicitTargets: true,
    },
  );
  assert.equal(result.stats.explicitTargetEmbeddedColumnCount, 1);
  assert.equal(result.stats.explicitTargetCollisionRejectedCount, 1);
  assert.equal(result.stats.explicitTargetBaseInteriorRejectedCount, 0);
  assert.equal(result.stats.pillarCount, 0);
});
test("Bambu floating-shell feedback can enlarge only the contact bulb", () => {
  const result = buildExternalPerimeterScaffold(
    new Float32Array(0), square(10), bodyWithPlate(),
    { spacingMm: 1, shaftRadiusMm: 0.2, baseRadiusMm: 0.3, tipRadiusMm: 0.12, xyClearanceMm: 0.05, contactOverlapMm: 0.1 },
    [{ xMm: 5, yMm: 5, zMm: 4, contactRadiusMm: 1, contactOverlapMm: 1.2 }],
  );
  assert.equal(result.pillars[0].contactRadiusMm, 1);
  assert.equal(result.pillars[0].topZMm, 5.2);
});

test("nearby slice feedback targets keep the highest rail", () => {
  const result = buildExternalPerimeterScaffold(
    new Float32Array(0), square(10), bodyWithPlate(),
    { spacingMm: 1, shaftRadiusMm: 0.2, baseRadiusMm: 0.3, tipRadiusMm: 0.12, xyClearanceMm: 0.05, contactOverlapMm: 0.1 },
    [{ xMm: 5, yMm: 5, zMm: 4 }, { xMm: 5.05, yMm: 5.05, zMm: 8 }],
  );
  assert.equal(result.stats.explicitTargetPillarCount, 1);
  assert.equal(result.stats.explicitTargetSpacingRejectedCount, 1);
  assert.equal(result.pillars[0].targetZMm, 8);
});

test("generated scaffold pillars are deterministic closed meshes", () => {
  const reachable = new Float32Array([...smallTriangle(0.8, 3, 5), ...smallTriangle(0.8, 7, 5)]);
  const options = {
    perimeterBandMm: 1.2, spacingMm: 2, shaftRadiusMm: 0.2, baseRadiusMm: 0.3,
    tipRadiusMm: 0.12, xyClearanceMm: 0.05, contactOverlapMm: 0.1, sides: 8,
  };
  const first = buildExternalPerimeterScaffold(reachable, square(5), bodyWithPlate(), options);
  const second = buildExternalPerimeterScaffold(reachable, square(5), bodyWithPlate(), options);
  assert.deepEqual(Array.from(first.positions), Array.from(second.positions));
  assert.equal(first.stats.pillarCount, 2);
  const indexed = indexTriangleSoup(first.positions);
  const edgeUse = new Map<string, number>();
  for (let offset = 0; offset < indexed.indices.length; offset += 3) {
    const ids = [indexed.indices[offset], indexed.indices[offset + 1], indexed.indices[offset + 2]];
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as const) {
      const key = ids[a] < ids[b] ? `${ids[a]}:${ids[b]}` : `${ids[b]}:${ids[a]}`;
      edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
    }
  }
  assert.ok([...edgeUse.values()].every((count) => count === 2));
});


test("breakaway tips overlap the diagnosed target plane", () => {
  const result = buildExternalPerimeterScaffold(
    new Float32Array(smallTriangle(0.8, 5, 5)), square(5), bodyWithPlate(),
    { spacingMm: 1, shaftRadiusMm: 0.2, baseRadiusMm: 0.3, tipRadiusMm: 0.12,
      xyClearanceMm: 0.05, contactOverlapMm: 0.12 },
  );
  let maxZ = -Infinity;
  for (let offset = 2; offset < result.positions.length; offset += 3) maxZ = Math.max(maxZ, result.positions[offset]);
  assert.ok(maxZ > 5.11 && maxZ < 5.13);
});
