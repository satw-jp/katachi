function unitHash(index: number, seed: number): number {
  let value = (index ^ seed) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  value = (value ^ (value >>> 16)) >>> 0;
  return value / 0x1_0000_0000;
}

export function shouldDisplayPoint(index: number, seed: number, fraction: number): boolean {
  if (fraction <= 0) return false;
  if (fraction >= 1) return true;
  return unitHash(index, seed) < fraction;
}
