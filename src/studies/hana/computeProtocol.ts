import type {
  HanaFinalizationResultV0,
  HanaFinalizationSnapshotV0,
} from "./finalizationCore.ts";

export const HANA_COMPUTE_PROTOCOL_VERSION = "katachi.hana-compute-wire.v0" as const;

interface HanaBinaryArrayDescriptor {
  offset: number;
  byteLength: number;
  elementType: "Float32" | "Uint32";
  elementCount: number;
}

interface HanaBinaryResultHeader {
  format: typeof HANA_COMPUTE_PROTOCOL_VERSION;
  resultFormat: HanaFinalizationResultV0["format"];
  protocolVersion: typeof HANA_COMPUTE_PROTOCOL_VERSION;
  requestId: string;
  documentRevision: number;
  objectId: string;
  objectRevision: number;
  generationId: number;
  algorithmVersion: string;
  bounds: HanaFinalizationResultV0["bounds"];
  counts: HanaFinalizationResultV0["counts"];
  timings: HanaFinalizationResultV0["timings"];
  validation: HanaFinalizationResultV0["validation"];
  arrays: {
    positions: HanaBinaryArrayDescriptor;
    normals: HanaBinaryArrayDescriptor;
    indices: HanaBinaryArrayDescriptor;
  };
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function uint8View(value: ArrayBuffer | Uint8Array): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

function copyBytes(target: Uint8Array, offset: number, source: ArrayBufferView): void {
  target.set(new Uint8Array(source.buffer, source.byteOffset, source.byteLength), offset);
}

function descriptor(
  offset: number,
  value: Float32Array | Uint32Array,
): HanaBinaryArrayDescriptor {
  return {
    offset,
    byteLength: value.byteLength,
    elementType: value instanceof Uint32Array ? "Uint32" : "Float32",
    elementCount: value.length,
  };
}

/** Header + raw typed-array payload; arrays are never base64 encoded. */
export function encodeHanaFinalizationResult(result: HanaFinalizationResultV0): ArrayBuffer {
  const positions = descriptor(0, result.positions);
  const normals = descriptor(result.positions.byteLength, result.normals);
  const indices = descriptor(result.positions.byteLength + result.normals.byteLength, result.indices);
  const header: HanaBinaryResultHeader = {
    format: HANA_COMPUTE_PROTOCOL_VERSION,
    resultFormat: result.format,
    protocolVersion: HANA_COMPUTE_PROTOCOL_VERSION,
    requestId: result.requestId,
    documentRevision: result.documentRevision,
    objectId: result.objectId,
    objectRevision: result.objectRevision,
    generationId: result.generationId,
    algorithmVersion: result.algorithmVersion,
    bounds: result.bounds,
    counts: result.counts,
    timings: result.timings,
    validation: result.validation,
    arrays: { positions, normals, indices },
  };
  const encodedHeader = textEncoder.encode(JSON.stringify(header));
  const payloadLength = positions.byteLength + normals.byteLength + indices.byteLength;
  const encoded = new Uint8Array(4 + encodedHeader.byteLength + payloadLength);
  new DataView(encoded.buffer).setUint32(0, encodedHeader.byteLength, false);
  encoded.set(encodedHeader, 4);
  const payloadOffset = 4 + encodedHeader.byteLength;
  copyBytes(encoded, payloadOffset + positions.offset, result.positions);
  copyBytes(encoded, payloadOffset + normals.offset, result.normals);
  copyBytes(encoded, payloadOffset + indices.offset, result.indices);
  return encoded.buffer;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum) throw new Error(`Invalid ${label}`);
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Invalid ${label}`);
  return value;
}

function validateDescriptor(value: unknown, label: string, expectedType: HanaBinaryArrayDescriptor["elementType"]): HanaBinaryArrayDescriptor {
  const source = record(value, label);
  const elementType = source.elementType as HanaBinaryArrayDescriptor["elementType"];
  if (elementType !== expectedType) throw new Error(`${label} element type mismatch`);
  const elementSize = expectedType === "Float32" ? 4 : 4;
  const byteLength = integer(source.byteLength, `${label}.byteLength`);
  const offset = integer(source.offset, `${label}.offset`);
  const elementCount = integer(source.elementCount, `${label}.elementCount`);
  if (byteLength % elementSize !== 0 || byteLength !== elementCount * elementSize) throw new Error(`${label} byte length mismatch`);
  if (offset % elementSize !== 0) throw new Error(`${label} offset alignment mismatch`);
  return { offset, byteLength, elementType, elementCount };
}

function arrayView(
  bytes: Uint8Array,
  payloadOffset: number,
  descriptorValue: HanaBinaryArrayDescriptor,
  type: "Float32" | "Uint32",
  payloadLength: number,
): Float32Array | Uint32Array {
  if (descriptorValue.offset + descriptorValue.byteLength > payloadLength) throw new Error("Binary array is outside payload");
  const absoluteOffset = bytes.byteOffset + payloadOffset + descriptorValue.offset;
  if (absoluteOffset % 4 !== 0) throw new Error("Binary array is not aligned");
  return type === "Float32"
    ? new Float32Array(bytes.buffer, absoluteOffset, descriptorValue.elementCount)
    : new Uint32Array(bytes.buffer, absoluteOffset, descriptorValue.elementCount);
}

/** Bounds-check and decode a binary result without interpreting arbitrary offsets. */
export function decodeHanaFinalizationResult(value: ArrayBuffer | Uint8Array, maxBytes = 64 * 1024 * 1024): HanaFinalizationResultV0 {
  const bytes = uint8View(value);
  if (bytes.byteLength > maxBytes) throw new Error("Binary result exceeds size limit");
  if (bytes.byteLength < 4) throw new Error("Binary result header is truncated");
  const headerLength = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, false);
  if (headerLength <= 0 || headerLength > bytes.byteLength - 4) throw new Error("Invalid binary result header length");
  const headerStart = bytes.byteOffset + 4;
  let parsed: Record<string, unknown>;
  try {
    parsed = record(JSON.parse(textDecoder.decode(new Uint8Array(bytes.buffer, headerStart, headerLength))), "binary header");
  } catch (error) {
    throw new Error(`Malformed binary result header: ${error instanceof Error ? error.message : "unknown"}`);
  }
  if (parsed.format !== HANA_COMPUTE_PROTOCOL_VERSION || parsed.protocolVersion !== HANA_COMPUTE_PROTOCOL_VERSION) throw new Error("Unsupported compute protocol");
  if (parsed.resultFormat !== "katachi.hana-finalization-result.v0") throw new Error("Unsupported compute result format");
  const arrays = record(parsed.arrays, "binary arrays");
  const positions = validateDescriptor(arrays.positions, "positions", "Float32");
  const normals = validateDescriptor(arrays.normals, "normals", "Float32");
  const indices = validateDescriptor(arrays.indices, "indices", "Uint32");
  const payloadOffset = 4 + headerLength;
  const payloadLength = bytes.byteLength - payloadOffset;
  const descriptors = [positions, normals, indices].sort((a, b) => a.offset - b.offset);
  let cursor = 0;
  for (const item of descriptors) {
    if (item.offset !== cursor) throw new Error("Binary array offsets must be contiguous");
    cursor += item.byteLength;
  }
  if (cursor !== payloadLength) throw new Error("Binary payload length mismatch");
  const bounds = record(parsed.bounds, "result bounds");
  const counts = record(parsed.counts, "result counts");
  const timings = record(parsed.timings, "result timings");
  const validation = record(parsed.validation, "result validation");
  const requestId = parsed.requestId;
  const objectId = parsed.objectId;
  const algorithmVersion = parsed.algorithmVersion;
  if (typeof requestId !== "string" || typeof objectId !== "string" || typeof algorithmVersion !== "string") throw new Error("Result identity is invalid");
  return {
    format: "katachi.hana-finalization-result.v0",
    requestId,
    documentRevision: integer(parsed.documentRevision, "documentRevision"),
    objectId,
    objectRevision: integer(parsed.objectRevision, "objectRevision"),
    generationId: integer(parsed.generationId, "generationId"),
    algorithmVersion,
    positions: arrayView(bytes, payloadOffset, positions, "Float32", payloadLength) as Float32Array,
    normals: arrayView(bytes, payloadOffset, normals, "Float32", payloadLength) as Float32Array,
    indices: arrayView(bytes, payloadOffset, indices, "Uint32", payloadLength) as Uint32Array,
    bounds: bounds as unknown as HanaFinalizationResultV0["bounds"],
    counts: counts as unknown as HanaFinalizationResultV0["counts"],
    timings: Object.fromEntries(Object.entries(timings).map(([key, item]) => [key, finiteNumber(item, `timings.${key}`)])) as unknown as HanaFinalizationResultV0["timings"],
    validation: validation as unknown as HanaFinalizationResultV0["validation"],
  };
}

export function serializeHanaFinalizationRequest(snapshot: HanaFinalizationSnapshotV0): string {
  return JSON.stringify(snapshot);
}
