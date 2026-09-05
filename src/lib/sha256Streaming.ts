const INITIAL = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
] as const;

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function hex(bytes: Uint8Array): string {
  let result = "";
  for (const byte of bytes) result += byte.toString(16).padStart(2, "0");
  return result;
}

/** Dependency-free incremental SHA-256 for Blob/stream ingestion. */
export class IncrementalSha256 {
  private readonly hash = new Uint32Array(INITIAL);
  private readonly pending = new Uint8Array(64);
  private pendingLength = 0;
  private byteLength = 0;

  update(input: ArrayBuffer | ArrayBufferView): this {
    const bytes = input instanceof ArrayBuffer
      ? new Uint8Array(input)
      : new Uint8Array(input.buffer as ArrayBuffer, input.byteOffset, input.byteLength);
    this.byteLength += bytes.byteLength;
    let offset = 0;
    if (this.pendingLength > 0) {
      const copied = Math.min(64 - this.pendingLength, bytes.byteLength);
      this.pending.set(bytes.subarray(0, copied), this.pendingLength);
      this.pendingLength += copied;
      offset += copied;
      if (this.pendingLength === 64) {
        this.compress(this.pending, 0, this.hash);
        this.pendingLength = 0;
      }
    }
    while (offset + 64 <= bytes.byteLength) {
      this.compress(bytes, offset, this.hash);
      offset += 64;
    }
    if (offset < bytes.byteLength) {
      this.pending.set(bytes.subarray(offset), 0);
      this.pendingLength = bytes.byteLength - offset;
    }
    return this;
  }

  digest(): Uint8Array {
    const state = new Uint32Array(this.hash);
    const finalBlock = new Uint8Array(128);
    finalBlock.set(this.pending.subarray(0, this.pendingLength));
    finalBlock[this.pendingLength] = 0x80;
    const bitLength = this.byteLength * 8;
    const blockLength = this.pendingLength < 56 ? 64 : 128;
    const view = new DataView(finalBlock.buffer);
    view.setUint32(blockLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);
    view.setUint32(blockLength - 4, bitLength >>> 0, false);
    for (let offset = 0; offset < blockLength; offset += 64) this.compress(finalBlock, offset, state);
    const output = new Uint8Array(32);
    const outputView = new DataView(output.buffer);
    for (let index = 0; index < state.length; index += 1) outputView.setUint32(index * 4, state[index], false);
    return output;
  }

  digestHex(): string { return hex(this.digest()); }

  private compress(bytes: Uint8Array, offset: number, state: Uint32Array): void {
    const schedule = new Uint32Array(64);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let index = 0; index < 16; index += 1) schedule[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const a = schedule[index - 15];
      const b = schedule[index - 2];
      schedule[index] = (schedule[index - 16]
        + (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3))
        + schedule[index - 7]
        + (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10))) >>> 0;
    }
    let a = state[0];
    let b = state[1];
    let c = state[2];
    let d = state[3];
    let e = state[4];
    let f = state[5];
    let g = state[6];
    let h = state[7];
    for (let index = 0; index < 64; index += 1) {
      const sigma1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const choose = (e & f) ^ (~e & g);
      const t1 = (h + sigma1 + choose + K[index] + schedule[index]) >>> 0;
      const sigma0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (sigma0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }
}

export async function sha256Blob(blob: Blob, chunkBytes = 8 * 1024 * 1024, onProgress?: (read: number, total: number) => void): Promise<string> {
  if (!(chunkBytes > 0) || !Number.isInteger(chunkBytes)) throw new Error("SHA-256 chunk size must be a positive integer");
  const hasher = new IncrementalSha256();
  for (let offset = 0; offset < blob.size; offset += chunkBytes) {
    const chunk = await blob.slice(offset, Math.min(blob.size, offset + chunkBytes)).arrayBuffer();
    hasher.update(chunk);
    onProgress?.(Math.min(blob.size, offset + chunk.byteLength), blob.size);
  }
  return hasher.digestHex();
}
