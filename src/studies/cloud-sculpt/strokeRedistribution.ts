export type StrokeRgbField = Float64Array;

function blockHash(x: number, y: number): number {
  let value = Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 1, 0x85ebca77);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  return value >>> 0;
}

/**
 * Redistribute RGB light into one short deterministic stroke per block.
 * Every source texel contributes once to its block sum and that exact sum is
 * divided equally across the selected stroke texels. Shadow coverage is not
 * an input and therefore cannot be enlarged or darkened by this operation.
 */
export function redistributeLightToBlockStrokes(
  source: ArrayLike<number>,
  width: number,
  height: number,
  blockSize = 4,
): StrokeRgbField {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error("stroke field dimensions must be positive integers");
  }
  if (!Number.isInteger(blockSize) || blockSize <= 0) {
    throw new Error("stroke block size must be a positive integer");
  }
  if (source.length !== width * height * 3) {
    throw new Error("stroke RGB field length does not match its dimensions");
  }

  const result = new Float64Array(source.length);
  for (let blockY = 0; blockY < height; blockY += blockSize) {
    for (let blockX = 0; blockX < width; blockX += blockSize) {
      const blockWidth = Math.min(blockSize, width - blockX);
      const blockHeight = Math.min(blockSize, height - blockY);
      const sum = [0, 0, 0];
      for (let y = 0; y < blockHeight; y++) {
        for (let x = 0; x < blockWidth; x++) {
          const sourceOffset = ((blockY + y) * width + blockX + x) * 3;
          sum[0] += source[sourceOffset] ?? 0;
          sum[1] += source[sourceOffset + 1] ?? 0;
          sum[2] += source[sourceOffset + 2] ?? 0;
        }
      }

      const hash = blockHash(blockX / blockSize, blockY / blockSize);
      const direction = hash & 3;
      const offset = (hash >>> 2) % (direction < 2 ? (direction === 0 ? blockHeight : blockWidth) : blockHeight);
      const active: Array<[number, number]> = [];
      if (direction === 0) {
        for (let x = 0; x < blockWidth; x++) active.push([x, offset]);
      } else if (direction === 1) {
        for (let y = 0; y < blockHeight; y++) active.push([offset, y]);
      } else {
        for (let x = 0; x < blockWidth; x++) {
          const signedX = direction === 2 ? x : -x;
          const y = ((signedX + offset) % blockHeight + blockHeight) % blockHeight;
          active.push([x, y]);
        }
      }

      for (const [x, y] of active) {
        const targetOffset = ((blockY + y) * width + blockX + x) * 3;
        result[targetOffset] = sum[0] / active.length;
        result[targetOffset + 1] = sum[1] / active.length;
        result[targetOffset + 2] = sum[2] / active.length;
      }
    }
  }
  return result;
}
