import { IncrementalSha256 } from "../../lib/sha256Streaming.ts";

export const ASTRA_LARGE_CANDIDATE_CANONICALIZATION_VERSION = "astra-candidate-source-f32-exact-zero-v0";

export interface LargeStlReadResult {
  readonly positions?: Float32Array;
  readonly executionSourceFaceIndices?: Uint32Array;
  readonly sourceSha256: string;
  readonly sourceGeometrySha256: string;
  readonly executionGeometrySha256: string;
  readonly triangleCount: number;
  readonly executionTriangleCount: number;
  readonly finite: boolean;
  readonly nearDegenerateCount: number;
  readonly exactZeroTriangleCount: number;
  readonly removedExactZeroSourceFaceIndices: readonly number[];
  readonly bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
  readonly byteLength: number;
}

export interface LargeStlReadOptions {
  readonly retainPositions: boolean;
  readonly chunkBytes?: number;
  readonly onProgress?: (stage: "Reading STL" | "Hashing" | "Parsing source-space positions", completed: number, total: number) => void;
  readonly isCancelled?: () => boolean;
}

function bounds(): LargeStlReadResult["bounds"] {
  return { min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } };
}

function updateBounds(target: LargeStlReadResult["bounds"], x: number, y: number, z: number): void {
  target.min.x = Math.min(target.min.x, x); target.min.y = Math.min(target.min.y, y); target.min.z = Math.min(target.min.z, z);
  target.max.x = Math.max(target.max.x, x); target.max.y = Math.max(target.max.y, y); target.max.z = Math.max(target.max.z, z);
}

export function validateLargeBinaryStlHeader(headerBytes: ArrayBuffer, byteLength: number): { triangleCount: number; expectedByteLength: number } {
  if (headerBytes.byteLength !== 84) throw new Error("Binary STL header is truncated");
  const triangleCount = new DataView(headerBytes).getUint32(80, true);
  const expectedByteLength = 84 + triangleCount * 50;
  if (expectedByteLength !== byteLength) throw new Error("Binary STL byte-length mismatch: expected " + expectedByteLength + ", got " + byteLength);
  return { triangleCount, expectedByteLength };
}

function sourceValues(view: DataView, local: number, target: Float32Array): void {
  for (let index = 0; index < 9; index += 1) target[index] = view.getFloat32(local + 12 + index * 4, true);
}

function crossMagnitude(values: Float32Array): { nx: number; ny: number; nz: number; magnitude: number } {
  const abx = values[3] - values[0]; const aby = values[4] - values[1]; const abz = values[5] - values[2];
  const acx = values[6] - values[0]; const acy = values[7] - values[1]; const acz = values[8] - values[2];
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  return { nx, ny, nz, magnitude: Math.hypot(nx, ny, nz) };
}

function finiteValues(values: Float32Array): boolean {
  return values.every(Number.isFinite);
}

function copyVertexBytes(target: Uint8Array, targetOffset: number, chunk: ArrayBuffer, sourceOffset: number): void {
  target.set(new Uint8Array(chunk, sourceOffset, 36), targetOffset);
}

export async function readLargeBinaryStl(file: Blob, options: LargeStlReadOptions): Promise<LargeStlReadResult> {
  const chunkBytes = options.chunkBytes ?? 8 * 1024 * 1024;
  if (!(chunkBytes > 0) || !Number.isInteger(chunkBytes)) throw new Error("large STL chunk size must be a positive integer");
  const headerBytes = await file.slice(0, 84).arrayBuffer();
  const { triangleCount } = validateLargeBinaryStlHeader(headerBytes, file.size);
  const sourceHasher = new IncrementalSha256();
  const sourceGeometryHasher = new IncrementalSha256();
  const executionGeometryHasher = new IncrementalSha256();
  sourceHasher.update(headerBytes);
  const targetBounds = bounds();
  const removedExactZeroSourceFaceIndices: number[] = [];
  const values = new Float32Array(9);
  let finite = true;
  let nearDegenerateCount = 0;
  let exactZeroTriangleCount = 0;
  const bodyChunkBytes = Math.max(50, Math.floor(chunkBytes / 50) * 50);

  for (let bodyOffset = 84; bodyOffset < file.size; bodyOffset += bodyChunkBytes) {
    if (options.isCancelled?.()) throw new Error("CANCELLED");
    const chunk = await file.slice(bodyOffset, Math.min(file.size, bodyOffset + bodyChunkBytes)).arrayBuffer();
    sourceHasher.update(chunk);
    const view = new DataView(chunk);
    const faceCount = chunk.byteLength / 50;
    const sourceGeometryBytes = new Uint8Array(faceCount * 36);
    const executionGeometryBytes = new Uint8Array(faceCount * 36);
    let executionGeometryByteLength = 0;
    for (let local = 0, localFace = 0; local < chunk.byteLength; local += 50, localFace += 1) {
      const sourceFaceIndex = (bodyOffset - 84) / 50 + localFace;
      copyVertexBytes(sourceGeometryBytes, localFace * 36, chunk, local + 12);
      sourceValues(view, local, values);
      const finiteFace = finiteValues(values);
      finite &&= finiteFace;
      if (finiteFace) {
        for (let index = 0; index < 9; index += 3) updateBounds(targetBounds, values[index], values[index + 1], values[index + 2]);
        const cross = crossMagnitude(values);
        if (!(cross.magnitude > 1e-10)) nearDegenerateCount += 1;
        const exactZero = cross.nx === 0 && cross.ny === 0 && cross.nz === 0;
        if (exactZero) {
          exactZeroTriangleCount += 1;
          removedExactZeroSourceFaceIndices.push(sourceFaceIndex);
        } else {
          copyVertexBytes(executionGeometryBytes, executionGeometryByteLength, chunk, local + 12);
          executionGeometryByteLength += 36;
        }
      } else {
        copyVertexBytes(executionGeometryBytes, executionGeometryByteLength, chunk, local + 12);
        executionGeometryByteLength += 36;
      }
    }
    sourceGeometryHasher.update(sourceGeometryBytes);
    executionGeometryHasher.update(executionGeometryBytes.subarray(0, executionGeometryByteLength));
    options.onProgress?.("Reading STL", Math.min(file.size, bodyOffset + chunk.byteLength), file.size);
    await Promise.resolve();
  }

  const positions = options.retainPositions ? new Float32Array((triangleCount - exactZeroTriangleCount) * 9) : undefined;
  const executionSourceFaceIndices = options.retainPositions ? new Uint32Array(triangleCount - exactZeroTriangleCount) : undefined;
  if (positions && executionSourceFaceIndices) {
    let removeCursor = 0;
    let executionFace = 0;
    for (let bodyOffset = 84; bodyOffset < file.size; bodyOffset += bodyChunkBytes) {
      if (options.isCancelled?.()) throw new Error("CANCELLED");
      const chunk = await file.slice(bodyOffset, Math.min(file.size, bodyOffset + bodyChunkBytes)).arrayBuffer();
      const view = new DataView(chunk);
      for (let local = 0, localFace = 0; local < chunk.byteLength; local += 50, localFace += 1) {
        const sourceFaceIndex = (bodyOffset - 84) / 50 + localFace;
        sourceValues(view, local, values);
        if (removeCursor < removedExactZeroSourceFaceIndices.length && removedExactZeroSourceFaceIndices[removeCursor] === sourceFaceIndex) {
          removeCursor += 1;
          continue;
        }
        positions.set(values, executionFace * 9);
        executionSourceFaceIndices[executionFace] = sourceFaceIndex;
        executionFace += 1;
      }
      options.onProgress?.("Parsing source-space positions", Math.min(file.size, bodyOffset + chunk.byteLength), file.size);
      await Promise.resolve();
    }
    if (executionFace !== positions.length / 9 || removeCursor !== removedExactZeroSourceFaceIndices.length) {
      throw new Error("Source exact-zero canonicalization pass count mismatch");
    }
  }
  options.onProgress?.("Hashing", file.size, file.size);
  return {
    positions,
    executionSourceFaceIndices,
    sourceSha256: sourceHasher.digestHex(),
    sourceGeometrySha256: sourceGeometryHasher.digestHex(),
    executionGeometrySha256: executionGeometryHasher.digestHex(),
    triangleCount,
    executionTriangleCount: triangleCount - exactZeroTriangleCount,
    finite,
    nearDegenerateCount,
    exactZeroTriangleCount,
    removedExactZeroSourceFaceIndices: Object.freeze(removedExactZeroSourceFaceIndices.slice()),
    bounds: targetBounds,
    byteLength: file.size,
  };
}
