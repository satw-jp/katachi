export interface ReplaySeedResolution {
  readonly seed: number;
  readonly fixed: boolean;
}

const UINT32_MAX = 0xffff_ffff;

function normalizeSeed(value: number): number {
  return (Math.abs(Math.trunc(value)) >>> 0) || 1;
}

export function resolveReplaySeed(value: string | null): ReplaySeedResolution {
  if (value !== null && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return { seed: normalizeSeed(parsed), fixed: true };
  }
  const cryptoApi = globalThis.crypto;
  if (cryptoApi) {
    const values = new Uint32Array(1);
    cryptoApi.getRandomValues(values);
    return { seed: normalizeSeed(values[0] ?? 1), fixed: false };
  }
  return { seed: normalizeSeed(Date.now() % UINT32_MAX), fixed: false };
}

export function seededRandom(seed: number): () => number {
  let state = normalizeSeed(seed);
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}
