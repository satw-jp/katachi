// ---------------------------------------------------------------------------
// Library — SHA-256 hex digest.
//
// 昇格の経緯 (Optimizer/docs/sonnet-instruction-20260726-katachi-r1-r2-library-
// first-extraction.md §4): この関数は 2 Study に同じ内容で二重に存在していた。
//
//   - src/studies/skin/main.ts            (private, ArrayBuffer | string)
//   - src/studies/interior-growth/meshExport.ts (export, ArrayBuffer)
//
// どちらも Web Crypto の `crypto.subtle.digest("SHA-256", bytes)` を呼び、
// 結果を lowercase 64 文字 hex にするだけで、差は「文字列入力を受けるか」
// だけだった。R0 の重複調査（docs/architecture/katachi-dependency-duplication-
// map-20260725.md）で Library 昇格候補の最小例として挙がり、Q1（`src/lib` を
// 正式 Library とする）の作者承認を受けて最初の昇格対象になった。
//
// なぜ最初がこれなのか: 依存 Study 数がより多い候補（`vertexShader` は 7 Study）
// もあるが、この関数は既存の自動テストで検証でき、実画面の目視確認が 2 画面で
// 済む。「小さく戻せる」ことを規模より優先した（reorganization plan R2）。
//
// 依存は増やさない。Web Crypto を優先し、利用できないブラウザでは下の
// dependency-free fallback を使う。Node 専用 API は使わない。
// ---------------------------------------------------------------------------

const SHA256_INITIAL_HASH = [
  0x6a09e667,
  0xbb67ae85,
  0x3c6ef372,
  0xa54ff53a,
  0x510e527f,
  0x9b05688c,
  0x1f83d9ab,
  0x5be0cd19,
] as const;

const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

export interface Sha256TestOptions {
  /** Deterministically exercise the browser fallback from tests. */
  forceFallback?: boolean;
}

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Dependency-free SHA-256 for browser contexts where WebCrypto is unavailable.
 * The input is already bytes, so ArrayBuffer provenance remains byte-exact.
 */
function sha256Fallback(bytes: Uint8Array): Uint8Array {
  const paddedLength = Math.ceil((bytes.byteLength + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.byteLength] = 0x80;

  // SHA-256 appends the original length as a big-endian uint64. ArrayBuffer
  // sizes are well below Number.MAX_SAFE_INTEGER in supported browsers, and
  // splitting the bit length this way preserves the full uint64 field.
  const bitLength = bytes.byteLength * 8;
  const paddedView = new DataView(padded.buffer);
  paddedView.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);
  paddedView.setUint32(paddedLength - 4, bitLength >>> 0, false);

  let h0: number = SHA256_INITIAL_HASH[0];
  let h1: number = SHA256_INITIAL_HASH[1];
  let h2: number = SHA256_INITIAL_HASH[2];
  let h3: number = SHA256_INITIAL_HASH[3];
  let h4: number = SHA256_INITIAL_HASH[4];
  let h5: number = SHA256_INITIAL_HASH[5];
  let h6: number = SHA256_INITIAL_HASH[6];
  let h7: number = SHA256_INITIAL_HASH[7];
  const schedule = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      schedule[i] = paddedView.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const word15 = schedule[i - 15];
      const word2 = schedule[i - 2];
      const smallSigma0 = rotateRight(word15, 7) ^ rotateRight(word15, 18) ^ (word15 >>> 3);
      const smallSigma1 = rotateRight(word2, 17) ^ rotateRight(word2, 19) ^ (word2 >>> 10);
      schedule[i] = (schedule[i - 16] + smallSigma0 + schedule[i - 7] + smallSigma1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const bigSigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + bigSigma1 + choose + SHA256_ROUND_CONSTANTS[i] + schedule[i]) >>> 0;
      const bigSigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (bigSigma0 + majority) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const digest = new Uint8Array(32);
  const digestView = new DataView(digest.buffer);
  digestView.setUint32(0, h0, false);
  digestView.setUint32(4, h1, false);
  digestView.setUint32(8, h2, false);
  digestView.setUint32(12, h3, false);
  digestView.setUint32(16, h4, false);
  digestView.setUint32(20, h5, false);
  digestView.setUint32(24, h6, false);
  digestView.setUint32(28, h7, false);
  return digest;
}

/**
 * Synchronous SHA-256 for validation boundaries that cannot defer parsing.
 * This deliberately uses the same dependency-free implementation as the
 * async helper below; callers still receive the canonical lowercase digest.
 */
export function sha256HexSync(data: ArrayBuffer | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  return bytesToHex(sha256Fallback(bytes));
}

/**
 * `data` の SHA-256 を lowercase 64 文字の hex 文字列で返す。
 *
 * `string` を受ける形は削れない: S-skin は保存する STL の bytes だけでなく、
 * 読み込んだ recipe の**テキスト**も hash して来歴に残している
 * (`importedRecipeSha256`)。文字列は UTF-8 bytes へ変換してから digest する
 * （`TextEncoder` の既定が UTF-8。移行前の skin 実装と同じ振る舞い）。
 *
 * 返り値は常に 64 文字。`toString(16)` は 0x0f のような値を 1 文字で返すため、
 * `padStart(2, "0")` が無いと長さが揺れる — 移行前の 2 実装と同じ処理を保つ。
 */
export async function sha256Hex(
  data: ArrayBuffer | string,
  options?: Sha256TestOptions,
): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  const subtle = options?.forceFallback ? undefined : globalThis.crypto?.subtle;
  if (subtle && typeof subtle.digest === "function") {
    // Do not catch digest failures: a real WebCrypto error must remain visible
    // instead of silently changing provenance to a different implementation.
    const digest = await subtle.digest("SHA-256", bytes);
    return bytesToHex(new Uint8Array(digest));
  }
  return sha256HexSync(data);
}
