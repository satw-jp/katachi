import assert from "node:assert/strict";
import { test } from "node:test";
import { sha256Hex } from "../../lib/hash.ts";
import { readLargeBinaryStl, validateLargeBinaryStlHeader } from "./astraLargeCandidateStl.ts";
import { buildPackedCandidateQuery } from "./astraPackedCandidateQuery.ts";
import { createImportedHostInstance, createImportedHostSource } from "./externalStlHost.ts";
import { parseBinaryStlPositions } from "./bambu3mf.ts";
import { createPackedSupportReachabilityIndex, createSupportReachabilityIndex } from "./supportReachability.ts";
import { detectSkinRebuildOverhangRegions, detectSkinRebuildOverhangRegionsFromPositions } from "./rebuild/overhangRegions.ts";
import { isLargeCandidateMessageCurrent } from "./astraLargeCandidateWorkerProtocol.ts";
import { makeDeferredPrintPlacement, makeSourceSpaceExecutionFingerprint, sourceFaceIndexForExecutionFace } from "./astraLargeCandidateSourceSpace.ts";

function cubeStl(): ArrayBuffer {
  const vertices = [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0], [-1, -1, 2], [1, -1, 2], [1, 1, 2], [-1, 1, 2]];
  const faces: Array<[number, number, number, number]> = [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [4, 0, 3, 7]];
  const buffer = new ArrayBuffer(84 + faces.length * 2 * 50); const view = new DataView(buffer); view.setUint32(80, faces.length * 2, true); let offset = 84;
  for (const [a, b, c, d] of faces) for (const triangle of [[a, b, c], [a, c, d]]) { for (let index = 0; index < 3; index += 1) view.setFloat32(offset + 12 + index * 12, vertices[triangle[index]][0], true); for (let index = 0; index < 3; index += 1) view.setFloat32(offset + 16 + index * 12, vertices[triangle[index]][1], true); for (let index = 0; index < 3; index += 1) view.setFloat32(offset + 20 + index * 12, vertices[triangle[index]][2], true); offset += 50; }
  return buffer;
}

function stlFromTriangles(triangles: readonly (readonly (readonly [number, number, number])[])[]): ArrayBuffer {
  const buffer = new ArrayBuffer(84 + triangles.length * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triangles.length, true);
  triangles.forEach((triangle, face) => triangle.forEach((vertex, vertexIndex) => vertex.forEach((value, axis) => {
    view.setFloat32(84 + face * 50 + 12 + vertexIndex * 12 + axis * 4, value, true);
  })));
  return buffer;
}

function crossMagnitudeOfTriangle(positions: Float32Array, offset = 0): number {
  const abx = positions[offset + 3] - positions[offset]; const aby = positions[offset + 4] - positions[offset + 1]; const abz = positions[offset + 5] - positions[offset + 2];
  const acx = positions[offset + 6] - positions[offset]; const acy = positions[offset + 7] - positions[offset + 1]; const acz = positions[offset + 8] - positions[offset + 2];
  return Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx);
}

const interpretation = { unitStatus: "explicit" as const, mmPerSourceUnit: 1, upAxis: "y" as const, handedness: "right" as const, importPolicyVersion: "large-candidate-test-v0" };

test("chunked source-space binary STL reader preserves exact Float32 positions and source SHA", async () => {
  const bytes = cubeStl(); const result = await readLargeBinaryStl(new Blob([bytes]), { retainPositions: true, chunkBytes: 100 });
  const expected = parseBinaryStlPositions(bytes);
  assert.deepEqual(Array.from(result.positions!), Array.from(expected));
  assert.equal(result.sourceSha256, await sha256Hex(bytes)); assert.equal(result.triangleCount, 12); assert.equal(result.executionTriangleCount, 12); assert.equal(result.finite, true); assert.equal(result.nearDegenerateCount, 0); assert.equal(result.exactZeroTriangleCount, 0);
  assert.deepEqual(result.executionSourceFaceIndices && Array.from(result.executionSourceFaceIndices.slice(0, 3)), [0, 1, 2]);
  assert.deepEqual(result.bounds.min, { x: -1, y: -1, z: 0 }); assert.deepEqual(result.bounds.max, { x: 1, y: 1, z: 2 });
});

test("chunked binary STL header rejects byte-length mismatch", () => {
  const bytes = cubeStl(); const header = bytes.slice(0, 84); new DataView(header).setUint32(80, 13, true);
  assert.throws(() => validateLargeBinaryStlHeader(header, bytes.byteLength), /byte-length mismatch/);
});

test("source exact-zero canonicalization removes exact duplicate and collinear faces only", async () => {
  const bytes = stlFromTriangles([
    [[0, 0, 0], [1, 0, 0], [0, 0, 0]],
    [[0, 0, 0], [1, 0, 0], [2, 0, 0]],
    [[0, 0, 0], [1, 0, 0], [0, 1e-12, 0]],
  ]);
  const result = await readLargeBinaryStl(new Blob([bytes]), { retainPositions: true, chunkBytes: 100 });
  assert.equal(result.finite, true);
  assert.equal(result.nearDegenerateCount, 3);
  assert.equal(result.exactZeroTriangleCount, 2);
  assert.deepEqual(result.removedExactZeroSourceFaceIndices, [0, 1]);
  assert.equal(result.executionTriangleCount, 1);
  assert.deepEqual(Array.from(result.executionSourceFaceIndices!), [2]);
  assert.ok(crossMagnitudeOfTriangle(result.positions!) > 0);
});

test("non-finite source triangles fail closed and are not canonicalized away", async () => {
  const bytes = stlFromTriangles([[[Number.NaN, 0, 0], [1, 0, 0], [0, 1, 0]]]);
  const result = await readLargeBinaryStl(new Blob([bytes]), { retainPositions: true });
  assert.equal(result.finite, false);
  assert.equal(result.exactZeroTriangleCount, 0);
  assert.equal(result.executionTriangleCount, 1);
  assert.deepEqual(result.removedExactZeroSourceFaceIndices, []);
});

test("source-space execution preserves the six-class tiny face under translation collapse", async () => {
  const bytes = stlFromTriangles([[
    [49.439998626708984, 22.32000160217285, 32.63999938964844],
    [49.439998626708984, 22.32000160217285, 32.64000701904297],
    [49.439998626708984, 22.079999923706055, 32.86864471435547],
  ]]);
  const result = await readLargeBinaryStl(new Blob([bytes]), { retainPositions: true });
  const translated = Float32Array.from(result.positions!, (value, index) => index % 3 === 2 ? Math.fround(value + 48.029293060302734) : value);
  assert.ok(crossMagnitudeOfTriangle(result.positions!) > 0);
  assert.equal(crossMagnitudeOfTriangle(translated), 0);
  assert.equal(result.exactZeroTriangleCount, 0);
  assert.equal(result.executionTriangleCount, 1);
  assert.equal(result.executionSourceFaceIndices![0], 0);
});

test("source face provenance and execution fingerprint are deterministic", async () => {
  assert.equal(sourceFaceIndexForExecutionFace(0, [1, 4]), 0);
  assert.equal(sourceFaceIndexForExecutionFace(1, [1, 4]), 2);
  assert.equal(sourceFaceIndexForExecutionFace(3, [1, 4]), 5);
  const placement = makeDeferredPrintPlacement(48.029293060302734);
  const input = { sourceSha256: "source", sourceGeometrySha256: "source-geometry", executionGeometrySha256: "execution-geometry", sourceTriangleCount: 3, executionTriangleCount: 1, removedExactZeroSourceFaceIndices: [0, 1], placement, sourceInterpretationVersion: "test" };
  const first = await makeSourceSpaceExecutionFingerprint(input);
  const second = await makeSourceSpaceExecutionFingerprint({ ...input, removedExactZeroSourceFaceIndices: [0, 2] });
  const third = await makeSourceSpaceExecutionFingerprint({ ...input, placement: makeDeferredPrintPlacement(49) });
  assert.equal(first, await makeSourceSpaceExecutionFingerprint(input));
  assert.notEqual(first, second);
  assert.notEqual(first, third);
});

test("packed Candidate spatial query preserves parity, telemetry, and release", async () => {
  const bytes = cubeStl(); const source = await createImportedHostSource(bytes, { filename: "cube.stl", interpretation }); const host = createImportedHostInstance(source, { translation: { x: 0, y: 0, z: 0 }, rotation: [0, 0, 0, 1], uniformScale: 1 }); const positions = parseBinaryStlPositions(bytes); const packed = buildPackedCandidateQuery(positions); const profiled = buildPackedCandidateQuery(positions, undefined, { telemetry: true });
  assert.equal(packed.readTelemetry().enabled, false);
  assert.equal(profiled.readTelemetry().enabled, true);
  assert.equal(packed.stats.totalTypedArrayBytes, profiled.stats.totalTypedArrayBytes);
  for (const point of [{ x: 0, y: 0, z: 1 }, { x: 3, y: 0, z: 1 }, { x: 0, y: 0, z: 3 }]) {
    const expected = host.query.closestSurface(point); const actual = packed.closestSurface(point); const instrumented = profiled.closestSurface(point); assert.ok(expected && actual && instrumented); assert.ok(Math.abs(expected.distance - actual.distance) < 1e-5); assert.deepEqual(instrumented, actual);
  }
  assert.ok(host.signedVolumeQuery); assert.ok(packed.signedDistance({ x: 0, y: 0, z: 1 }) < 0); assert.ok(packed.signedDistance({ x: 3, y: 0, z: 1 }) > 0); assert.ok(Math.abs(Math.abs(packed.signedDistance({ x: 0, y: 0, z: 1 })) - Math.abs(host.signedVolumeQuery.signedDistance({ x: 0, y: 0, z: 1 }))) < 1e-5);
  profiled.signedDistance({ x: 0, y: 0, z: 1 }); const telemetry = profiled.readTelemetry(); assert.equal(telemetry.signedDistanceCalls, 1); assert.equal(telemetry.rayIntersectionCalls, 1); assert.ok(telemetry.closestSurfaceTrianglesTested > 0); profiled.resetTelemetry(); assert.equal(profiled.readTelemetry().signedDistanceCalls, 0);
  packed.release(); profiled.release(); assert.throws(() => packed.closestSurface({ x: 0, y: 0, z: 1 }), /released/); assert.throws(() => profiled.closestSurface({ x: 0, y: 0, z: 1 }), /released/);
});

test("buffer-native overhang detector is exact-parity on fixture", () => {
  const positions = new Float32Array([0, 0, 2, 0, 1, 2, 1, 0, 2, 1, 0, 2, 0, 1, 2, 1, 1, 2, 20, 0, 2, 21, 0, 2, 20, 1, 2]);
  const triangles = Array.from({ length: positions.length / 9 }, (_, face) => ({ a: { x: positions[face * 9], y: positions[face * 9 + 1], z: positions[face * 9 + 2] }, b: { x: positions[face * 9 + 3], y: positions[face * 9 + 4], z: positions[face * 9 + 5] }, c: { x: positions[face * 9 + 6], y: positions[face * 9 + 7], z: positions[face * 9 + 8] } }));
  const legacy = detectSkinRebuildOverhangRegions(triangles, 45, 0, 0.1); const packed = detectSkinRebuildOverhangRegionsFromPositions(positions, 45, 0, 0.1);
  assert.equal(packed.faceCount, legacy.faceCount); assert.equal(packed.regionCount, legacy.regionCount); assert.deepEqual(Array.from(packed.positions), Array.from(legacy.positions)); assert.deepEqual(Array.from(packed.faceRegionIds), Array.from(legacy.faceRegionIds)); assert.ok(Math.abs(packed.areaSourceSquared - legacy.areaSourceSquared) < 1e-6);
});

test("packed lower-envelope index preserves outside/inside/unresolved classification", () => {
  const triangle = (z: number, x = 0): Float32Array => new Float32Array([x, 0, z, x + 2, 0, z, x, 2, z]);
  const surface = new Float32Array([...triangle(4, 10), ...triangle(1)]); const candidate = new Float32Array([...triangle(4, 10), ...triangle(2)]);
  const legacy = createSupportReachabilityIndex(surface); const packed = createPackedSupportReachabilityIndex(surface);
  assert.equal(packed.classifyTriangle(candidate, 0), legacy.classifyTriangle(candidate, 0)); assert.equal(packed.classifyTriangle(candidate, 9), legacy.classifyTriangle(candidate, 9)); assert.deepEqual(packed.diagnoseTriangle(candidate, 9), legacy.diagnoseTriangle(candidate, 9));
});

test("stale worker generations are rejected and release state is fail-closed", () => {
  assert.equal(isLargeCandidateMessageCurrent(4, 4), true); assert.equal(isLargeCandidateMessageCurrent(3, 4), false); assert.equal(isLargeCandidateMessageCurrent(5, 4), false);
});
