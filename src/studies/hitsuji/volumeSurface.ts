export type SurfacePhase = "positive" | "negative";

export interface SurfaceSelection {
  phase: SurfacePhase;
  threshold: number;
  include?: Uint8Array;
}

export function fillSurfaceField(
  target: Float32Array,
  source: Float32Array,
  selection: SurfaceSelection,
): void {
  if (target.length !== source.length) {
    throw new Error("Surface field size does not match the phase field");
  }
  if (selection.include && selection.include.length !== source.length) {
    throw new Error("Surface selection size does not match the phase field");
  }

  const sign = selection.phase === "positive" ? 1 : -1;
  const excludedValue = selection.threshold - 2;
  for (let index = 0; index < source.length; index++) {
    target[index] = selection.include?.[index] === 0 ? excludedValue : source[index] * sign;
  }
}

export function countBoundaryVoxels(
  field: Float32Array,
  size: number,
  threshold: number,
): number {
  let count = 0;
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (
          (x === 0 || x === size - 1 || y === 0 || y === size - 1 || z === 0 || z === size - 1) &&
          field[x + size * (y + size * z)] >= threshold
        ) {
          count++;
        }
      }
    }
  }
  return count;
}
