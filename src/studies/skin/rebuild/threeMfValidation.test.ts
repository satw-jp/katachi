import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBambu3mf, buildBambu3mfPackageEntries } from "../bambu3mf.ts";
import { validateSkin3mf } from "./threeMfValidation.ts";

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
