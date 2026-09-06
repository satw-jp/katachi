import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertClassicZip32Value,
  boundedUtf8Chunks,
  buildBambu3mf,
  buildBambu3mfPackageEntries,
  buildIndexedObjectModelStreamingFixture,
  crc32,
  crc32Chunks,
  ZIP32_MAX,
} from "./bambu3mf.ts";
import { validateSkin3mf } from "./rebuild/threeMfValidation.ts";

const BODY = new Float32Array([
  0, 0, 1, 1, 0, 1, 0, 1, 1,
  0, 0, 1, 0, 1, 1, -1, 0, 1,
]);
const SUPPORT = new Float32Array([0, 0, -2, 0.2, 0, -2, 0, 0.2, -2]);
const OPTIONS = { title: "stream parity", supportType: "normal(manual)" as const, date: "2026-09-06", mergePrintableSupportIntoBody: false };

function readUint16(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

async function inflate(payload: Uint8Array): Promise<Uint8Array> {
  const copy = payload.slice();
  const stream = new Blob([copy.buffer]).stream().pipeThrough(new DecompressionStream("deflate-raw" as never));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function zipEntries(archive: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(archive);
  const result = new Map<string, Uint8Array>();
  let cursor = 0;
  while (readUint32(bytes, cursor) === 0x04034b50) {
    const method = readUint16(bytes, cursor + 8);
    const compressedSize = readUint32(bytes, cursor + 18);
    const nameLength = readUint16(bytes, cursor + 26);
    const extraLength = readUint16(bytes, cursor + 28);
    const nameStart = cursor + 30;
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLength));
    const payloadStart = nameStart + nameLength + extraLength;
    const payload = bytes.subarray(payloadStart, payloadStart + compressedSize);
    result.set(name, method === 8 ? await inflate(payload) : payload.slice());
    cursor = payloadStart + compressedSize;
  }
  return result;
}

test("streamed small packages preserve every uncompressed XML byte", async () => {
  for (const volumes of [
    [{ name: "BODY", role: "body" as const, positions: BODY }],
    [
      { name: "ASTRA_A_ARTWORK", role: "body" as const, positions: BODY },
      { name: "SKIN_A_PRINT_SUPPORT", role: "printable_support" as const, positions: SUPPORT },
    ],
  ]) {
    const legacy = buildBambu3mfPackageEntries(volumes, OPTIONS);
    const streamed = await buildBambu3mf(volumes, OPTIONS, { serializationChunkBytes: 64 });
    const extracted = await zipEntries(streamed.archive);
    for (const entry of legacy.entries) assert.deepEqual(extracted.get(entry.name), entry.data, entry.name);
    assert.equal(streamed.stats.bodyFaces, legacy.stats.bodyFaces);
    assert.equal(streamed.stats.bodyVertices, legacy.stats.bodyVertices);
    assert.equal(streamed.stats.bodyRemovedDegenerateTriangles, legacy.stats.bodyRemovedDegenerateTriangles);
    assert.deepEqual(streamed.stats.placementTranslationMm, legacy.stats.placementTranslationMm);
    assert.equal(streamed.stats.largestSerializationChunkBytes, 64);
    assert.equal((await validateSkin3mf(streamed.archive)).valid, true);
  }
});

test("bounded UTF-8 chunks split elements deterministically and incremental CRC matches", () => {
  const parts = ['<vertex x="123.5" y="456.5" z="789.5"/>\n', '<triangle v1="0" v2="1" v3="2"/>\n'];
  const chunksA = [...boundedUtf8Chunks(parts, 64)];
  const chunksB = [...boundedUtf8Chunks(parts, 64)];
  assert.deepEqual(chunksA, chunksB);
  assert.ok(chunksA.every((chunk) => chunk.byteLength <= 64));
  const joined = new Uint8Array(chunksA.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunksA) { joined.set(chunk, offset); offset += chunk.byteLength; }
  assert.equal(new TextDecoder().decode(joined), parts.join(""));
  assert.equal(crc32Chunks(chunksA), crc32(joined));
});

test("streamed object model is deterministic with exact size and CRC accounting", async () => {
  const mesh = {
    vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2]),
    removedDegenerateTriangles: 0,
  };
  const first = await buildIndexedObjectModelStreamingFixture([{ role: "body", mesh }], { serializationChunkBytes: 64 });
  const second = await buildIndexedObjectModelStreamingFixture([{ role: "body", mesh }], { serializationChunkBytes: 64 });
  assert.deepEqual(new Uint8Array(first.archive), new Uint8Array(second.archive));
  const xml = (await zipEntries(first.archive)).get("3D/Objects/object_1.model");
  assert.ok(xml);
  assert.equal(first.xmlBytes, xml.byteLength);
  assert.equal(first.crc, crc32(xml));
  assert.equal(first.largestSerializationChunkBytes, 64);
  assert.match(new TextDecoder().decode(xml), /<vertices>[\s\S]*<triangles>[\s\S]*<\/model>\n$/);
});

test("classic ZIP32 bounds fail closed", () => {
  assert.doesNotThrow(() => assertClassicZip32Value(ZIP32_MAX, "fixture"));
  assert.throws(() => assertClassicZip32Value(ZIP32_MAX + 1, "fixture"), /ZIP64 is required/);
  assert.throws(() => assertClassicZip32Value(Number.NaN, "fixture"), /ZIP64 is required/);
});

test("synthetic object model exceeds the former giant-string scale without a giant string", { skip: process.env.KATACHI_RUN_LARGE_3MF_SYNTHETIC !== "1", timeout: 900_000 }, async () => {
  const vertexCount = 1_000_002;
  const triangleCount = 13_200_000;
  const vertices = new Float32Array(vertexCount * 3);
  for (let index = 0; index < vertexCount; index++) {
    vertices[index * 3] = index % 1000;
    vertices[index * 3 + 1] = Math.floor(index / 1000) % 1000;
    vertices[index * 3 + 2] = index % 17;
  }
  const indices = new Uint32Array(triangleCount * 3);
  for (let offset = 0; offset < indices.length; offset += 3) {
    indices[offset] = 0; indices[offset + 1] = 1; indices[offset + 2] = 2;
  }
  const result = await buildIndexedObjectModelStreamingFixture([{
    role: "body",
    mesh: { vertices, indices, removedDegenerateTriangles: 0 },
  }]);
  assert.ok(result.xmlBytes > 536_870_888, `expected > former V8 string scale, received ${result.xmlBytes}`);
  assert.ok(result.archive.byteLength > 0);
  assert.ok(result.compressedBytes > 0);
  assert.ok(result.largestSerializationChunkBytes <= 1024 * 1024);
  assert.equal(readUint32(new Uint8Array(result.archive), 0), 0x04034b50);
  console.log("large3mfSynthetic", JSON.stringify({ vertexCount, triangleCount, xmlBytes: result.xmlBytes, compressedBytes: result.compressedBytes, archiveBytes: result.archive.byteLength, largestSerializationChunkBytes: result.largestSerializationChunkBytes, invalidStringLength: false }));
});
