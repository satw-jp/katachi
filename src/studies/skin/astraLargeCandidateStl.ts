import { IncrementalSha256 } from "../../lib/sha256Streaming.ts";

export interface LargeStlReadResult {
  readonly positions?: Float32Array;
  readonly sourceSha256: string;
  readonly triangleCount: number;
  readonly finite: boolean;
  readonly degenerateTriangleCount: number;
  readonly bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
  readonly byteLength: number;
}

export interface LargeStlReadOptions {
  readonly retainPositions: boolean;
  readonly translationZ: number;
  readonly chunkBytes?: number;
  readonly onProgress?: (stage: "Reading STL" | "Hashing" | "Parsing packed positions", completed: number, total: number) => void;
  readonly isCancelled?: () => boolean;
}

function bounds(): LargeStlReadResult["bounds"] { return { min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } }; }
function updateBounds(target: LargeStlReadResult["bounds"], x: number, y: number, z: number): void {
  target.min.x = Math.min(target.min.x, x); target.min.y = Math.min(target.min.y, y); target.min.z = Math.min(target.min.z, z);
  target.max.x = Math.max(target.max.x, x); target.max.y = Math.max(target.max.y, y); target.max.z = Math.max(target.max.z, z);
}

export function validateLargeBinaryStlHeader(headerBytes: ArrayBuffer, byteLength: number): { triangleCount: number; expectedByteLength: number } {
  if (headerBytes.byteLength !== 84) throw new Error("Binary STL header is truncated");
  const triangleCount = new DataView(headerBytes).getUint32(80, true);
  const expectedByteLength = 84 + triangleCount * 50;
  if (expectedByteLength !== byteLength) throw new Error(`Binary STL byte-length mismatch: expected ${expectedByteLength}, got ${byteLength}`);
  return { triangleCount, expectedByteLength };
}

export async function readLargeBinaryStl(file: Blob, options: LargeStlReadOptions): Promise<LargeStlReadResult> {
  const chunkBytes = options.chunkBytes ?? 8 * 1024 * 1024;
  if (!(chunkBytes > 0) || !Number.isInteger(chunkBytes)) throw new Error("large STL chunk size must be a positive integer");
  const headerBytes = await file.slice(0, 84).arrayBuffer();
  const { triangleCount } = validateLargeBinaryStlHeader(headerBytes, file.size);
  const hasher = new IncrementalSha256(); hasher.update(headerBytes);
  const positions = options.retainPositions ? new Float32Array(triangleCount * 9) : undefined;
  const targetBounds = bounds(); let finite = true; let degenerateTriangleCount = 0; let target = 0;
  const values = new Float32Array(9);
  const bodyChunkBytes = Math.max(50, Math.floor(chunkBytes / 50) * 50);
  for (let bodyOffset = 84; bodyOffset < file.size; bodyOffset += bodyChunkBytes) {
    if (options.isCancelled?.()) throw new Error("CANCELLED");
    const chunk = await file.slice(bodyOffset, Math.min(file.size, bodyOffset + bodyChunkBytes)).arrayBuffer();
    hasher.update(chunk);
    const view = new DataView(chunk);
    for (let local = 0; local < chunk.byteLength; local += 50) {
      for (let index = 0; index < 9; index += 1) values[index] = view.getFloat32(local + 12 + index * 4, true) + (index % 3 === 2 ? options.translationZ : 0);
      for (let index = 0; index < 9; index += 3) updateBounds(targetBounds, values[index], values[index + 1], values[index + 2]);
      if (positions) positions.set(values, target);
      target += 9;
      const finiteFace = values.every(Number.isFinite); finite &&= finiteFace;
      if (finiteFace) {
        const abx = values[3] - values[0]; const aby = values[4] - values[1]; const abz = values[5] - values[2];
        const acx = values[6] - values[0]; const acy = values[7] - values[1]; const acz = values[8] - values[2];
        if (!(Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx) > 1e-10)) degenerateTriangleCount++;
      }
    }
    options.onProgress?.(options.retainPositions ? "Parsing packed positions" : "Reading STL", Math.min(file.size, bodyOffset + chunk.byteLength), file.size);
    await Promise.resolve();
  }
  options.onProgress?.("Hashing", file.size, file.size);
  return { positions, sourceSha256: hasher.digestHex(), triangleCount, finite, degenerateTriangleCount, bounds: targetBounds, byteLength: file.size };
}
