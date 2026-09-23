import { sha256Hex } from "../../../lib/hash.ts";

export const LOCKED_MOTIF_INPUT = Object.freeze({
  fileName: "motif_63_D_BACKARC.npz",
  sha256: "ddb793d271fda8bd649676381b2deed48580f6192d84169a5032f99a81ca8c8f",
  byteLength: 617600,
  vertexCount: 32574,
  faceCount: 65144,
  frameFileName: "patch_identity.json",
  frameSha256: "73d046104e38bc95c53805607a9b3ed04ad8634db97cfb049456377647ca4884",
  frameByteLength: 38916,
  representativeMotifId: 63,
  origin: [-16.28129638331396, -18.325485257684107, 41.984232773182214] as const,
  frame: [
    [0.7105091272164754, 0.5550013433045643, -0.43260870203015067],
    [-0.23339633903282564, -0.394108295159017, -0.8889346436116254],
    [-0.6638545993424739, 0.7325654650725643, -0.15048225913662047],
  ] as const,
  localBounds: {
    min: [-5.433579554741701, -5.036082413537697, -1.407531449181486] as const,
    max: [5.433580143345844, 5.036082396921641, 1.7318658129416904] as const,
  },
  backAnchorLocal: [0, 0, -1.4075314471755909] as const,
  backAnchorSourceFaceIndex: 37194,
  backAnchorBarycentric: [0.9999961628927884, 0.0000037821915138674943, 0.00000005491569781317983] as const,
});

export interface MotifPrototype {
  readonly sourceBytes: Uint8Array;
  readonly sourceHash: string;
  readonly frameBytes: Uint8Array;
  readonly frameHash: string;
  readonly frame: Readonly<Record<string, unknown>>;
  readonly vertices: Float32Array;
  readonly indices: Uint32Array;
  readonly anchorLocal: readonly [number, number, number];
  readonly sourceVertexCount: number;
  readonly sourceFaceCount: number;
}

interface ZipEntry {
  readonly name: string;
  readonly method: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localOffset: number;
}

function readZipEntries(bytes: Uint8Array): readonly ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minimum = Math.max(0, bytes.byteLength - 65557);
  let endOffset = -1;
  for (let offset = bytes.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("Motif NPZ is not a complete ZIP archive");
  if (view.getUint16(endOffset + 4, true) !== 0 || view.getUint16(endOffset + 6, true) !== 0) {
    throw new Error("Multi-disk motif archives are not supported");
  }
  const entryCount = view.getUint16(endOffset + 10, true);
  const centralSize = view.getUint32(endOffset + 12, true);
  const centralOffset = view.getUint32(endOffset + 16, true);
  if (entryCount !== 2 || centralOffset + centralSize > endOffset) {
    throw new Error("Motif NPZ must contain exactly the locked two-array payload");
  }
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const entries: ZipEntry[] = [];
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > bytes.byteLength || view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error("Motif NPZ has a malformed central directory");
    }
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    const next = nameEnd + extraLength + commentLength;
    if (next > bytes.byteLength || [compressedSize, uncompressedSize, localOffset].includes(0xffffffff)) {
      throw new Error("ZIP64 or truncated motif entries are not supported");
    }
    entries.push({ name: decoder.decode(bytes.subarray(nameStart, nameEnd)), method, compressedSize, uncompressedSize, localOffset });
    cursor = next;
  }
  if (cursor !== centralOffset + centralSize) throw new Error("Motif NPZ central directory length is inconsistent");
  const names = entries.map((entry) => entry.name).sort();
  if (names[0] !== "faces.npy" || names[1] !== "vertices.npy") {
    throw new Error("Motif NPZ must contain faces.npy and vertices.npy only");
  }
  return Object.freeze(entries);
}

async function extractZipEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = entry.localOffset;
  if (offset + 30 > bytes.byteLength || view.getUint32(offset, true) !== 0x04034b50) {
    throw new Error(`Motif NPZ entry ${entry.name} has a malformed local header`);
  }
  const nameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const dataOffset = offset + 30 + nameLength + extraLength;
  const dataEnd = dataOffset + entry.compressedSize;
  if (dataEnd > bytes.byteLength) throw new Error(`Motif NPZ entry ${entry.name} is truncated`);
  const compressed = bytes.subarray(dataOffset, dataEnd);
  let output: ArrayBuffer;
  if (entry.method === 0) {
    output = compressed.slice().buffer;
  } else if (entry.method === 8) {
    if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot decompress the locked NPZ format");
    const stream = new Blob([compressed.slice().buffer]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    output = await new Response(stream).arrayBuffer();
  } else {
    throw new Error(`Motif NPZ compression method ${entry.method} is not supported`);
  }
  if (output.byteLength !== entry.uncompressedSize) throw new Error(`Motif NPZ entry ${entry.name} expanded to an unexpected length`);
  return new Uint8Array(output);
}

interface NpyArray {
  readonly type: "float32" | "int32";
  readonly shape: readonly [number, number];
  readonly dataOffset: number;
  readonly view: DataView;
}

function parseNpy(bytes: Uint8Array, expectedType: string, expectedRows: number, label: string): NpyArray {
  if (bytes.byteLength < 12 || bytes[0] !== 0x93 || new TextDecoder().decode(bytes.subarray(1, 6)) !== "NUMPY") {
    throw new Error(`${label} is not a valid NPY array`);
  }
  const major = bytes[6];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLengthBytes = major === 1 ? 2 : major === 2 || major === 3 ? 4 : 0;
  if (headerLengthBytes === 0) throw new Error(`${label} uses an unsupported NPY version`);
  const headerOffset = 8 + headerLengthBytes;
  const headerLength = headerLengthBytes === 2 ? view.getUint16(8, true) : view.getUint32(8, true);
  const dataOffset = headerOffset + headerLength;
  if (dataOffset > bytes.byteLength) throw new Error(`${label} NPY header is truncated`);
  const header = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(headerOffset, dataOffset));
  const descr = /['"]descr['"]\s*:\s*['"]([^'"]+)['"]/.exec(header)?.[1];
  const fortran = /['"]fortran_order['"]\s*:\s*(True|False)/.exec(header)?.[1];
  const shapeText = /['"]shape['"]\s*:\s*\(([^)]*)\)/.exec(header)?.[1];
  const shape = shapeText?.split(",").map((part) => part.trim()).filter(Boolean).map(Number);
  if (descr !== expectedType || fortran !== "False" || shape?.length !== 2 || shape[0] !== expectedRows || shape[1] !== 3) {
    throw new Error(`${label} NPY dtype/layout/shape does not match the locked source`);
  }
  const type = expectedType === "<f4" ? "float32" : "int32";
  const byteLength = shape[0] * shape[1] * 4;
  if (dataOffset + byteLength !== bytes.byteLength) throw new Error(`${label} NPY payload length does not match its header`);
  return { type, shape: [shape[0], shape[1]], dataOffset, view };
}

function vector3(value: unknown, label: string): readonly [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3 || !value.every((item) => typeof item === "number" && Number.isFinite(item))) {
    throw new Error(`${label} must contain three finite numbers`);
  }
  return [value[0] as number, value[1] as number, value[2] as number];
}

function validateFrame(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Motif frame JSON must be an object");
  const frame = value as Record<string, unknown>;
  if (frame.representative_motif_id !== LOCKED_MOTIF_INPUT.representativeMotifId) throw new Error("Motif frame does not identify motif 63");
  const origin = vector3(frame.center_mm, "motif frame origin");
  const matrix = frame.local_to_world_basis_columns;
  if (!Array.isArray(matrix) || matrix.length !== 3) throw new Error("Motif frame basis must be a 3x3 matrix");
  const rows = matrix.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== 3 || !row.every((item) => typeof item === "number" && Number.isFinite(item))) {
      throw new Error(`Motif frame basis row ${rowIndex} is invalid`);
    }
    return row as number[];
  });
  const tolerance = 1e-12;
  for (let row = 0; row < 3; row += 1) {
    if (Math.abs(origin[row] - LOCKED_MOTIF_INPUT.origin[row]) > tolerance) throw new Error("Motif frame origin differs from the locked identity");
    for (let column = 0; column < 3; column += 1) {
      if (Math.abs(rows[row][column] - LOCKED_MOTIF_INPUT.frame[row][column]) > tolerance) {
        throw new Error("Motif frame basis differs from the locked identity");
      }
    }
  }
  const motifs = frame.motifs;
  if (!Array.isArray(motifs) || !motifs.some((motif) => motif && typeof motif === "object" && (motif as { id?: unknown }).id === 63)) {
    throw new Error("Motif frame has no original motifs[id=63] record");
  }
  return Object.freeze(frame);
}

export async function loadMotifPrototype(motifInput: ArrayBuffer | ArrayBufferView, frameInput: ArrayBuffer | ArrayBufferView): Promise<MotifPrototype> {
  const copy = (input: ArrayBuffer | ArrayBufferView): Uint8Array => input instanceof ArrayBuffer
    ? new Uint8Array(input.slice(0))
    : new Uint8Array(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength));
  const sourceBytes = copy(motifInput);
  const frameBytes = copy(frameInput);
  const [sourceHash, frameHash] = await Promise.all([
    sha256Hex(sourceBytes.buffer as ArrayBuffer),
    sha256Hex(frameBytes.buffer as ArrayBuffer),
  ]);
  if (sourceBytes.byteLength !== LOCKED_MOTIF_INPUT.byteLength || sourceHash !== LOCKED_MOTIF_INPUT.sha256) {
    throw new Error("Motif NPZ does not match the locked D BACKARC source");
  }
  if (frameBytes.byteLength !== LOCKED_MOTIF_INPUT.frameByteLength || frameHash !== LOCKED_MOTIF_INPUT.frameSha256) {
    throw new Error("Motif frame JSON does not match the locked patch_identity source");
  }
  let parsedFrame: unknown;
  try {
    parsedFrame = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(frameBytes));
  } catch {
    throw new Error("Motif frame JSON is not valid UTF-8 JSON");
  }
  const frame = validateFrame(parsedFrame);
  const entries = readZipEntries(sourceBytes);
  const [verticesBytes, facesBytes] = await Promise.all([
    extractZipEntry(sourceBytes, entries.find((entry) => entry.name === "vertices.npy")!),
    extractZipEntry(sourceBytes, entries.find((entry) => entry.name === "faces.npy")!),
  ]);
  const verticesArray = parseNpy(verticesBytes, "<f4", LOCKED_MOTIF_INPUT.vertexCount, "vertices.npy");
  const facesArray = parseNpy(facesBytes, "<i4", LOCKED_MOTIF_INPUT.faceCount, "faces.npy");
  const localVertices = new Float32Array(LOCKED_MOTIF_INPUT.vertexCount * 3);
  const frameRows = LOCKED_MOTIF_INPUT.frame;
  const origin = LOCKED_MOTIF_INPUT.origin;
  const localMin = [Infinity, Infinity, Infinity];
  const localMax = [-Infinity, -Infinity, -Infinity];
  for (let vertex = 0; vertex < LOCKED_MOTIF_INPUT.vertexCount; vertex += 1) {
    const source: [number, number, number] = [0, 0, 0];
    for (let axis = 0; axis < 3; axis += 1) {
      const value = verticesArray.view.getFloat32(verticesArray.dataOffset + (vertex * 3 + axis) * 4, true);
      if (!Number.isFinite(value)) throw new Error(`vertices.npy has a non-finite value at vertex ${vertex}`);
      source[axis] = value;
    }
    const delta = [source[0] - origin[0], source[1] - origin[1], source[2] - origin[2]];
    for (let localAxis = 0; localAxis < 3; localAxis += 1) {
      const local = delta[0] * frameRows[0][localAxis] + delta[1] * frameRows[1][localAxis] + delta[2] * frameRows[2][localAxis];
      localVertices[vertex * 3 + localAxis] = local;
      localMin[localAxis] = Math.min(localMin[localAxis], local);
      localMax[localAxis] = Math.max(localMax[localAxis], local);
    }
  }
  for (let axis = 0; axis < 3; axis += 1) {
    if (Math.abs(localMin[axis] - LOCKED_MOTIF_INPUT.localBounds.min[axis]) > 1e-4
      || Math.abs(localMax[axis] - LOCKED_MOTIF_INPUT.localBounds.max[axis]) > 1e-4) {
      throw new Error("Motif local bounds do not match the locked frame conversion");
    }
  }
  const indices = new Uint32Array(LOCKED_MOTIF_INPUT.faceCount * 3);
  for (let index = 0; index < indices.length; index += 1) {
    const value = facesArray.view.getInt32(facesArray.dataOffset + index * 4, true);
    if (value < 0 || value >= LOCKED_MOTIF_INPUT.vertexCount) throw new Error(`faces.npy has an invalid vertex index at ${index}`);
    indices[index] = value;
  }
  return Object.freeze({
    sourceBytes,
    sourceHash,
    frameBytes,
    frameHash,
    frame,
    vertices: localVertices,
    indices,
    anchorLocal: LOCKED_MOTIF_INPUT.backAnchorLocal,
    sourceVertexCount: LOCKED_MOTIF_INPUT.vertexCount,
    sourceFaceCount: LOCKED_MOTIF_INPUT.faceCount,
  });
}
