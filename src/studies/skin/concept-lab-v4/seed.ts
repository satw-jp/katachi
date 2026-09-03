export interface SeedResolution {
  readonly seed: number;
  readonly fixed: boolean;
}

const UINT32 = 0x1_0000_0000;

function normalizeSeed(seed: number): number {
  return (Math.abs(Math.trunc(seed)) >>> 0) || 1;
}

export function resolveConceptLabSeed(value: string | null): SeedResolution {
  if (value !== null && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return { seed: normalizeSeed(parsed), fixed: true };
  }
  if (globalThis.crypto) {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return { seed: normalizeSeed(values[0] ?? 1), fixed: false };
  }
  return { seed: normalizeSeed(Date.now() % UINT32), fixed: false };
}

export function makeSeededRandom(seed: number): () => number {
  let state = normalizeSeed(seed);
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / UINT32;
  };
}
