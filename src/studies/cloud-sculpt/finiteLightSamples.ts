/** Canonical aperture (xy) and angular sun-disk (zw) samples shared by CPU and WebGPU. */
export const FINITE_LIGHT_SAMPLE_STRIDE = 4;

export function generateFiniteLightSamples(count: number, seed: string): Float32Array {
  const safeCount = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  const output = new Float32Array(safeCount * FINITE_LIGHT_SAMPLE_STRIDE);
  const seedHash = hashString(seed);
  for (let index = 0; index < safeCount; index++) {
    const offset = index * FINITE_LIGHT_SAMPLE_STRIDE;
    output[offset] = Math.fround(uintToSignedUnit(hash32((index ^ seedHash) >>> 0)));
    output[offset + 1] = Math.fround(
      uintToSignedUnit(hash32((index ^ seedHash ^ 0x9e3779b9) >>> 0)),
    );
    const diskRadius = Math.sqrt(
      uintToUnit(hash32((index ^ seedHash ^ 0x243f6a88) >>> 0)),
    );
    const diskAngle = Math.PI * 2
      * uintToUnit(hash32((index ^ seedHash ^ 0xb7e15162) >>> 0));
    output[offset + 2] = Math.fround(Math.cos(diskAngle) * diskRadius);
    output[offset + 3] = Math.fround(Math.sin(diskAngle) * diskRadius);
  }
  return output;
}

function hash32(input: number): number {
  let value = input >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value ^= value >>> 16;
  return value >>> 0;
}

function uintToSignedUnit(value: number): number {
  return uintToUnit(value) * 2 - 1;
}

function uintToUnit(value: number): number {
  return value / 0x1_0000_0000;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
