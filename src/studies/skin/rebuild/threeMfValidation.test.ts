import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBambu3mf, buildBambu3mfPackageEntries, buildIndexedObjectModelStreamingFixture } from "../bambu3mf.ts";
import { validateSkin3mf, type Skin3mfValidationTelemetry } from "./threeMfValidation.ts";

const BODY_TRIANGLE = new Float32Array([
  0, 0, 0,
  1, 0, 0,
  0, 1, 0,
]);

const SUPPORT_TRIANGLE = new Float32Array([
  0, 0, 1,
  1, 0, 1,
  0, 1, 1,
]);

function writeUint16(target: Uint8Array, offset: number, value: number): void {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setUint16(offset, value, true);
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setUint32(offset, value >>> 0, true);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    let value = (crc ^ byte) & 0xff;
    for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    crc = (crc >>> 8) ^ value;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(entries: Array<{ name: string; data: Uint8Array }>): ArrayBuffer {
  const encoder = new TextEncoder();
  const encoded = entries.map((entry) => ({ ...entry, nameBytes: encoder.encode(entry.name) }));
  const localBytes = encoded.reduce((sum, entry) => sum + 30 + entry.nameBytes.length + entry.data.length, 0);
  const centralBytes = encoded.reduce((sum, entry) => sum + 46 + entry.nameBytes.length, 0);
  const output = new Uint8Array(localBytes + centralBytes + 22);
  const central: Array<{ entry: typeof encoded[number]; offset: number }> = [];
  let cursor = 0;
  for (const entry of encoded) {
    const offset = cursor;
    writeUint32(output, cursor, 0x04034b50);
    writeUint16(output, cursor + 4, 20);
    writeUint16(output, cursor + 8, 0);
    writeUint16(output, cursor + 10, 0);
    writeUint32(output, cursor + 14, crc32(entry.data));
    writeUint32(output, cursor + 18, entry.data.length);
    writeUint32(output, cursor + 22, entry.data.length);
    writeUint16(output, cursor + 26, entry.nameBytes.length);
    writeUint16(output, cursor + 28, 0);
    cursor += 30;
    output.set(entry.nameBytes, cursor);
    cursor += entry.nameBytes.length;
    output.set(entry.data, cursor);
    cursor += entry.data.length;
    central.push({ entry, offset });
  }
  const centralOffset = cursor;
  for (const item of central) {
    const entry = item.entry;
    writeUint32(output, cursor, 0x02014b50);
    writeUint16(output, cursor + 4, 20);
    writeUint16(output, cursor + 6, 20);
    writeUint16(output, cursor + 8, 0);
    writeUint16(output, cursor + 10, 0);
    writeUint32(output, cursor + 16, crc32(entry.data));
    writeUint32(output, cursor + 20, entry.data.length);
    writeUint32(output, cursor + 24, entry.data.length);
    writeUint16(output, cursor + 28, entry.nameBytes.length);
    writeUint16(output, cursor + 30, 0);
    writeUint16(output, cursor + 32, 0);
    writeUint32(output, cursor + 42, item.offset);
    cursor += 46;
    output.set(entry.nameBytes, cursor);
    cursor += entry.nameBytes.length;
  }
  writeUint32(output, cursor, 0x06054b50);
  writeUint16(output, cursor + 8, encoded.length);
  writeUint16(output, cursor + 10, encoded.length);
  writeUint32(output, cursor + 12, cursor - centralOffset);
  writeUint32(output, cursor + 16, centralOffset);
  return output.buffer;
}

function baseEntries(support = false): Array<{ name: string; data: Uint8Array }> {
  return buildBambu3mfPackageEntries(
    support
      ? [
        { name: "BODY", role: "body", positions: BODY_TRIANGLE },
        { name: "SKIN_REBUILD_PRINT_SUPPORT", role: "printable_support", positions: SUPPORT_TRIANGLE },
      ]
      : [{ name: "BODY", role: "body", positions: BODY_TRIANGLE }],
    {
      title: support ? "BODY plus Support" : "BODY-only",
      supportType: "normal(manual)",
      date: "2026-09-02",
      mergePrintableSupportIntoBody: false,
    },
  ).entries;
}

function replaceEntry(
  entries: Array<{ name: string; data: Uint8Array }>,
  name: string,
  replace: (text: string) => string,
): Array<{ name: string; data: Uint8Array }> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  return entries.map((entry) => entry.name === name
    ? { name: entry.name, data: encoder.encode(replace(decoder.decode(entry.data))) }
    : { name: entry.name, data: new Uint8Array(entry.data) });
}

async function assertInvalid(archive: ArrayBuffer, message: RegExp): Promise<void> {
  const report = await validateSkin3mf(archive);
  assert.equal(report.valid, false);
  assert.match(report.errors.join("\n"), message);
}

function readUint16(target: Uint8Array, offset: number): number {
  return new DataView(target.buffer, target.byteOffset, target.byteLength).getUint16(offset, true);
}

function readUint32(target: Uint8Array, offset: number): number {
  return new DataView(target.buffer, target.byteOffset, target.byteLength).getUint32(offset, true);
}

interface PreparedZipEntry { name: string; payload: Uint8Array; method: number; crc: number; uncompressedSize: number }

function preparedZip(entries: PreparedZipEntry[]): ArrayBuffer {
  const encoder = new TextEncoder();
  const encoded = entries.map((entry) => ({ ...entry, nameBytes: encoder.encode(entry.name) }));
  const localBytes = encoded.reduce((sum, entry) => sum + 30 + entry.nameBytes.length + entry.payload.length, 0);
  const centralBytes = encoded.reduce((sum, entry) => sum + 46 + entry.nameBytes.length, 0);
  const output = new Uint8Array(localBytes + centralBytes + 22);
  const central: Array<{ entry: typeof encoded[number]; offset: number }> = [];
  let cursor = 0;
  for (const entry of encoded) {
    const offset = cursor; writeUint32(output, cursor, 0x04034b50); writeUint16(output, cursor + 4, 20); writeUint16(output, cursor + 8, entry.method);
    writeUint32(output, cursor + 14, entry.crc); writeUint32(output, cursor + 18, entry.payload.length); writeUint32(output, cursor + 22, entry.uncompressedSize); writeUint16(output, cursor + 26, entry.nameBytes.length);
    cursor += 30; output.set(entry.nameBytes, cursor); cursor += entry.nameBytes.length; output.set(entry.payload, cursor); cursor += entry.payload.length; central.push({ entry, offset });
  }
  const centralOffset = cursor;
  for (const { entry, offset } of central) {
    writeUint32(output, cursor, 0x02014b50); writeUint16(output, cursor + 4, 20); writeUint16(output, cursor + 6, 20); writeUint16(output, cursor + 10, entry.method);
    writeUint32(output, cursor + 16, entry.crc); writeUint32(output, cursor + 20, entry.payload.length); writeUint32(output, cursor + 24, entry.uncompressedSize); writeUint16(output, cursor + 28, entry.nameBytes.length); writeUint32(output, cursor + 42, offset);
    cursor += 46; output.set(entry.nameBytes, cursor); cursor += entry.nameBytes.length;
  }
  writeUint32(output, cursor, 0x06054b50); writeUint16(output, cursor + 8, encoded.length); writeUint16(output, cursor + 10, encoded.length); writeUint32(output, cursor + 12, cursor - centralOffset); writeUint32(output, cursor + 16, centralOffset);
  return output.buffer;
}

function firstPreparedEntry(archive: ArrayBuffer, name: string): PreparedZipEntry {
  const bytes = new Uint8Array(archive);
  assert.equal(readUint32(bytes, 0), 0x04034b50);
  const method = readUint16(bytes, 8), crc = readUint32(bytes, 14), compressedSize = readUint32(bytes, 18), uncompressedSize = readUint32(bytes, 22), nameLength = readUint16(bytes, 26), extraLength = readUint16(bytes, 28);
  const payloadStart = 30 + nameLength + extraLength;
  return { name, method, crc, uncompressedSize, payload: bytes.slice(payloadStart, payloadStart + compressedSize) };
}

async function reportsByMode(archive: ArrayBuffer, chunkBytes = 31) {
  const legacy = await validateSkin3mf(archive, {}, { modelMode: "legacy" });
  const streaming = await validateSkin3mf(archive, {}, { modelMode: "streaming", compressedInputChunkBytes: chunkBytes });
  return { legacy, streaming };
}

function withInvalidUtf8(entries: Array<{ name: string; data: Uint8Array }>): Array<{ name: string; data: Uint8Array }> {
  return entries.map((entry) => entry.name === "3D/Objects/object_1.model"
    ? { name: entry.name, data: Uint8Array.from([...entry.data.subarray(0, 20), 0xff, ...entry.data.subarray(20)]) }
    : { name: entry.name, data: entry.data.slice() });
}

function corruptStoredPayloadCrc(archive: ArrayBuffer, entryName: string): ArrayBuffer {
  const bytes = new Uint8Array(archive.slice(0));
  let cursor = 0;
  while (readUint32(bytes, cursor) === 0x04034b50) {
    const size = readUint32(bytes, cursor + 18);
    const nameLength = new DataView(bytes.buffer).getUint16(cursor + 26, true);
    const extraLength = new DataView(bytes.buffer).getUint16(cursor + 28, true);
    const nameStart = cursor + 30;
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLength));
    const payloadStart = nameStart + nameLength + extraLength;
    if (name === entryName) { bytes[payloadStart + size - 1] ^= 1; return bytes.buffer; }
    cursor = payloadStart + size;
  }
  throw new Error(`entry not found: ${entryName}`);
}

test("valid BODY-only 3MF validates its compressed package, mesh, bounds and no-support contract", async () => {
  const result = await buildBambu3mf([
    { name: "BODY", role: "body", positions: BODY_TRIANGLE },
  ], { title: "BODY-only", supportType: "normal(manual)", date: "2026-09-02" });
  const report = await validateSkin3mf(result.archive, {
    expectedUnit: "millimeter",
    expectedBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 0 } },
    expectedTriangleCount: 1,
    expectedSupportPresent: false,
  });
  assert.equal(report.valid, true, report.errors.join("\n"));
  assert.equal(report.objectCount, 1);
  assert.equal(report.componentCount, 1);
  assert.equal(report.buildItemCount, 1);
  assert.equal(report.vertexCount, 3);
  assert.equal(report.triangleCount, 1);
  assert.deepEqual(report.bounds, { x: 1, y: 1, z: 0 });
});
test("valid BODY plus Support 3MF validates separate support structure", async () => {
  const result = await buildBambu3mf([
    { name: "BODY", role: "body", positions: BODY_TRIANGLE },
    { name: "SKIN_REBUILD_PRINT_SUPPORT", role: "printable_support", positions: SUPPORT_TRIANGLE },
  ], { title: "BODY plus Support", supportType: "normal(manual)", date: "2026-09-02" });
  const report = await validateSkin3mf(result.archive, {
    expectedBounds: { x: 1, y: 1, z: 1 },
    expectedTriangleCount: 2,
    expectedSupportPresent: true,
  });
  assert.equal(report.valid, true, report.errors.join("\n"));
  assert.equal(report.objectCount, 2);
  assert.equal(report.componentCount, 2);
  assert.equal(report.supportPresent, true);
});

test("invalid 3MF fixtures fail closed for container, XML, mesh, reference, relationship and unit damage", async () => {
  await assertInvalid(new Uint8Array([0x50, 0x4b, 0x03]).buffer, /invalid 3MF ZIP container/);

  const entries = baseEntries();
  await assertInvalid(storedZip(entries.filter((entry) => entry.name !== "3D/3dmodel.model")), /missing required entry: 3D\/3dmodel\.model/);
  await assertInvalid(storedZip(replaceEntry(entries, "3D/3dmodel.model", () => "<model><resources>")), /malformed XML in \/3D\/3dmodel\.model/);
  await assertInvalid(storedZip(replaceEntry(entries, "3D/Objects/object_1.model", (text) => text.replace('v3="2"', 'v3="3"'))), /triangle index out of range/);
  await assertInvalid(storedZip(replaceEntry(entries, "3D/Objects/object_1.model", (text) => text.replace('x="0"', 'x="NaN"'))), /non-finite vertex coordinate/);
  await assertInvalid(storedZip(replaceEntry(entries, "3D/3dmodel.model", (text) => text.replace('objectid="1"', 'objectid="99"'))), /missing object reference/);
  await assertInvalid(storedZip(replaceEntry(entries, "3D/3dmodel.model", (text) => text.replace('unit="millimeter"', 'unit="inch"'))), /unsupported unit/);
  await assertInvalid(storedZip(replaceEntry(entries, "3D/_rels/3dmodel.model.rels", () => "<Relationships/>")), /model relationships do not reference/);
});

test("forced streaming preserves the complete legacy report across every small input boundary", async () => {
  const commentAndCdata = replaceEntry(baseEntries(), "3D/Objects/object_1.model", (text) => text.replace(
    "<model ",
    "<!-- boundary-safe comment --><![CDATA[ \n ]]><model ",
  ));
  const splitEntity = replaceEntry(baseEntries(), "3D/Objects/object_1.model", (text) => text.replace('x="0"', 'x="&#48;"'));
  const wrongRoot = replaceEntry(baseEntries(), "3D/Objects/object_1.model", (text) => text
    .replace("<model ", "<wrong ")
    .replace("</model>", "</wrong>"));
  const archives = [
    storedZip(baseEntries(true)),
    storedZip(commentAndCdata),
    storedZip(splitEntity),
    storedZip(wrongRoot),
    storedZip(replaceEntry(baseEntries(), "3D/Objects/object_1.model", (text) => text.replace('v3="2"', 'v3="3"'))),
    storedZip(replaceEntry(baseEntries(), "3D/Objects/object_1.model", (text) => text.replace('x="0"', 'x="NaN"'))),
    storedZip(replaceEntry(baseEntries(), "3D/Objects/object_1.model", (text) => text.slice(0, -9))),
    storedZip(withInvalidUtf8(baseEntries())),
    corruptStoredPayloadCrc(storedZip(baseEntries()), "3D/Objects/object_1.model"),
  ];
  for (let chunkBytes = 1; chunkBytes <= 64; chunkBytes++) {
    for (const archive of archives) {
      const { legacy, streaming } = await reportsByMode(archive, chunkBytes);
      assert.deepEqual(streaming, legacy, `report mismatch at ${chunkBytes}-byte chunks`);
    }
  }
});

test("streaming telemetry proves bounded input, decode and parser buffers", async () => {
  const telemetry: Array<{ largestCompressedInputChunkBytes: number; largestDecodedTextChunkCharacters: number; largestParserBufferCharacters: number }> = [];
  const report = await validateSkin3mf(storedZip(baseEntries(true)), {}, {
    modelMode: "streaming",
    compressedInputChunkBytes: 7,
    onTelemetry: (value) => telemetry.push(value),
  });
  assert.equal(report.valid, true, report.errors.join("\n"));
  assert.ok(telemetry.length > 0);
  assert.ok(telemetry.every((value) => value.largestCompressedInputChunkBytes <= 7));
  assert.ok(telemetry.every((value) => value.largestDecodedTextChunkCharacters <= 7));
  assert.ok(telemetry.every((value) => value.largestParserBufferCharacters < 1024));
});

test("large synthetic validator gate parses a >538 MB object model with bounded buffers", { skip: process.env.KATACHI_RUN_LARGE_3MF_VALIDATOR !== "1", timeout: 900_000 }, async () => {
  const vertexCount = 1_000_002;
  const triangleCount = 13_200_000;
  const vertices = new Float32Array(vertexCount * 3);
  for (let index = 0; index < vertexCount; index++) {
    vertices[index * 3] = index % 1000; vertices[index * 3 + 1] = Math.floor(index / 1000) % 1000; vertices[index * 3 + 2] = index % 17;
  }
  const indices = new Uint32Array(triangleCount * 3);
  for (let offset = 0; offset < indices.length; offset += 3) { indices[offset] = 0; indices[offset + 1] = 1; indices[offset + 2] = 2; }
  const fixture = await buildIndexedObjectModelStreamingFixture([{ role: "body", mesh: { vertices, indices, removedDegenerateTriangles: 0 } }]);
  assert.ok(fixture.xmlBytes > 538_000_000);
  const largeModel = firstPreparedEntry(fixture.archive, "3D/Objects/object_1.model");
  const archive = preparedZip(baseEntries().map((entry) => entry.name === largeModel.name
    ? largeModel
    : { name: entry.name, payload: entry.data, method: 0, crc: crc32(entry.data), uncompressedSize: entry.data.length }));
  const telemetry: Skin3mfValidationTelemetry[] = [];
  const report = await validateSkin3mf(archive, { expectedTriangleCount: triangleCount }, { modelMode: "streaming", onTelemetry: (value) => telemetry.push(value) });
  assert.equal(report.valid, true, report.errors.join("\n"));
  assert.ok(telemetry.some((value) => value.uncompressedBytes === fixture.xmlBytes));
  assert.ok(telemetry.every((value) => value.largestCompressedInputChunkBytes <= 1024 * 1024));
  console.log("large3mfValidatorSynthetic", JSON.stringify({
    vertexCount, triangleCount, xmlBytes: fixture.xmlBytes, compressedBytes: fixture.compressedBytes,
    largestCompressedInputChunkBytes: Math.max(...telemetry.map((value) => value.largestCompressedInputChunkBytes)),
    largestInflatedChunkBytes: Math.max(...telemetry.map((value) => value.largestInflatedChunkBytes)),
    largestDecodedTextChunkCharacters: Math.max(...telemetry.map((value) => value.largestDecodedTextChunkCharacters)),
    largestParserBufferCharacters: Math.max(...telemetry.map((value) => value.largestParserBufferCharacters)),
  }));
});
