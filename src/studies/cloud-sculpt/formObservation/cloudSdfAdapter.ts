import { fieldSdf, type Ball } from "../field.ts";
import type { FormGeometry, SdfBall, Vec3 } from "./contracts.ts";
import { evaluateSerializedSdf } from "./surfaceSampling.ts";

export interface CloudSdfAdapterInput {
  readonly balls: readonly Ball[];
  readonly k: number;
  readonly sourceId: string;
  readonly revision: string;
}

function canonicalNumber(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError("Cloud SDF values must be finite");
  return Object.is(value, -0) ? 0 : value;
}

function sha256(message: string): string {
  const bytes = new TextEncoder().encode(message);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  const hash = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const words = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const a = words[index - 15]; const b = words[index - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + choice + constants[index] + words[index]) >>> 0;
      const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0; hash[1] = (hash[1] + b) >>> 0; hash[2] = (hash[2] + c) >>> 0; hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0; hash[5] = (hash[5] + f) >>> 0; hash[6] = (hash[6] + g) >>> 0; hash[7] = (hash[7] + h) >>> 0;
  }
  return Array.from(hash, (word) => word.toString(16).padStart(8, "0")).join("");
}

function canonicalBalls(balls: readonly Ball[]): readonly SdfBall[] {
  if (balls.length === 0) throw new RangeError("Cloud SDF needs at least one ball");
  return balls.map((ball) => {
    const center: Vec3 = [canonicalNumber(ball.x), canonicalNumber(ball.y), canonicalNumber(ball.z)];
    const radius = canonicalNumber(ball.r);
    if (radius <= 0) throw new RangeError("Cloud SDF ball radii must be positive");
    return { center, radius };
  });
}

function conservativeBounds(balls: readonly SdfBall[], k: number): FormGeometry["representation"]["conservativeBounds"] {
  // Smooth-min can lower a field below each primitive by up to k/4 per blend.
  const margin = (k * Math.max(1, balls.length - 1)) / 4 + Number.EPSILON;
  let minX = Number.POSITIVE_INFINITY; let minY = Number.POSITIVE_INFINITY; let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY; let maxY = Number.NEGATIVE_INFINITY; let maxZ = Number.NEGATIVE_INFINITY;
  for (const ball of balls) {
    minX = Math.min(minX, ball.center[0] - ball.radius - margin); minY = Math.min(minY, ball.center[1] - ball.radius - margin); minZ = Math.min(minZ, ball.center[2] - ball.radius - margin);
    maxX = Math.max(maxX, ball.center[0] + ball.radius + margin); maxY = Math.max(maxY, ball.center[1] + ball.radius + margin); maxZ = Math.max(maxZ, ball.center[2] + ball.radius + margin);
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

export function adaptCloudSdf(input: CloudSdfAdapterInput): FormGeometry {
  if (typeof input.sourceId !== "string" || typeof input.revision !== "string") throw new RangeError("Cloud SDF sourceId and revision are required");
  const smoothness = canonicalNumber(input.k);
  if (smoothness < 0) throw new RangeError("Cloud SDF smoothness must be non-negative");
  const balls = canonicalBalls(input.balls);
  const representation = { kind: "sdf-ball-union" as const, balls, smoothness, conservativeBounds: conservativeBounds(balls, smoothness) };
  const contentHash = sha256(JSON.stringify({ kind: representation.kind, balls: representation.balls, smoothness: representation.smoothness }));
  return {
    sourceId: input.sourceId,
    revision: input.revision,
    contentHash,
    sourceKind: "cloud-sdf",
    coordinateSystem: { handedness: "right", canonicalUp: "y", sourceUp: "y", sourceToCanonical: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], provenance: "author" },
    physicalScale: { mmPerShapeUnit: null, provenance: "unknown" },
    representation,
    warnings: ["Physical scale is unknown.", "Surface points are an approximate SDF-derived observation."],
  };
}

/** Convenience overload for the existing Cloud Sculpt field call site. */
export function createCloudSdfGeometry(balls: readonly Ball[], k: number, sourceId: string, revision: string): FormGeometry {
  return adaptCloudSdf({ balls, k, sourceId, revision });
}

function ballsForField(geometry: FormGeometry): Ball[] {
  if (geometry.representation.kind !== "sdf-ball-union") throw new RangeError("Unsupported FORM representation");
  return geometry.representation.balls.map((ball, index) => ({ id: index, x: ball.center[0], y: ball.center[1], z: ball.center[2], r: ball.radius }));
}

/** Explicit seam proving the portable representation preserves Cloud Sculpt SDF values. */
export function evaluateCloudSdfEquivalence(geometry: FormGeometry, point: Vec3): { readonly adapter: number; readonly field: number; readonly difference: number } {
  if (geometry.representation.kind !== "sdf-ball-union") throw new RangeError("Unsupported FORM representation");
  const adapter = evaluateSerializedSdf(geometry, point[0], point[1], point[2]);
  const field = fieldSdf(ballsForField(geometry), geometry.representation.smoothness, point[0], point[1], point[2]);
  return { adapter, field, difference: Math.abs(adapter - field) };
}
