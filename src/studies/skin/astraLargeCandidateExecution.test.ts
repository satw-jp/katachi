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

function cubeStl(): ArrayBuffer {
  const vertices = [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0], [-1, -1, 2], [1, -1, 2], [1, 1, 2], [-1, 1, 2]];
  const faces: Array<[number, number, number, number]> = [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [4, 0, 3, 7]];
  const buffer = new ArrayBuffer(84 + faces.length * 2 * 50); const view = new DataView(buffer); view.setUint32(80, faces.length * 2, true); let offset = 84;
  for (const [a, b, c, d] of faces) for (const triangle of [[a, b, c], [a, c, d]]) { for (let index = 0; index < 3; index += 1) view.setFloat32(offset + 12 + index * 12, vertices[triangle[index]][0], true); for (let index = 0; index < 3; index += 1) view.setFloat32(offset + 16 + index * 12, vertices[triangle[index]][1], true); for (let index = 0; index < 3; index += 1) view.setFloat32(offset + 20 + index * 12, vertices[triangle[index]][2], true); offset += 50; }
  return buffer;
}

const interpretation = { unitStatus: "explicit" as const, mmPerSourceUnit: 1, upAxis: "y" as const, handedness: "right" as const, importPolicyVersion: "large-candidate-test-v0" };

test("chunked binary STL reader preserves exact Float32 positions and source SHA", async () => {
  const bytes = cubeStl(); const result = await readLargeBinaryStl(new Blob([bytes]), { retainPositions: true, translationZ: 3, chunkBytes: 100 });
  const expected = parseBinaryStlPositions(bytes); for (let index = 2; index < expected.length; index += 3) expected[index] += 3;
  assert.deepEqual(Array.from(result.positions!), Array.from(expected));
  assert.equal(result.sourceSha256, await sha256Hex(bytes)); assert.equal(result.triangleCount, 12); assert.equal(result.finite, true); assert.equal(result.degenerateTriangleCount, 0);
  assert.deepEqual(result.bounds.min, { x: -1, y: -1, z: 3 }); assert.deepEqual(result.bounds.max, { x: 1, y: 1, z: 5 });
});

test("chunked binary STL header rejects byte-length mismatch", () => {
  const bytes = cubeStl(); const header = bytes.slice(0, 84); new DataView(header).setUint32(80, 13, true);
  assert.throws(() => validateLargeBinaryStlHeader(header, bytes.byteLength), /byte-length mismatch/);
});

test("packed Candidate query matches External Host closest distance and signed sign", async () => {
  const bytes = cubeStl(); const source = await createImportedHostSource(bytes, { filename: "cube.stl", interpretation }); const host = createImportedHostInstance(source, { translation: { x: 0, y: 0, z: 0 }, rotation: [0, 0, 0, 1], uniformScale: 1 }); const positions = parseBinaryStlPositions(bytes); const packed = buildPackedCandidateQuery(positions);
  for (const point of [{ x: 0, y: 0, z: 1 }, { x: 3, y: 0, z: 1 }, { x: 0, y: 0, z: 3 }]) {
    const expected = host.query.closestSurface(point); const actual = packed.closestSurface(point); assert.ok(expected && actual); assert.ok(Math.abs(expected.distance - actual.distance) < 1e-5);
  }
  assert.ok(host.signedVolumeQuery); assert.ok(packed.signedDistance({ x: 0, y: 0, z: 1 }) < 0); assert.ok(packed.signedDistance({ x: 3, y: 0, z: 1 }) > 0); assert.ok(Math.abs(Math.abs(packed.signedDistance({ x: 0, y: 0, z: 1 })) - Math.abs(host.signedVolumeQuery.signedDistance({ x: 0, y: 0, z: 1 }))) < 1e-5);
  packed.release(); assert.throws(() => packed.closestSurface({ x: 0, y: 0, z: 1 }), /released/);
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
