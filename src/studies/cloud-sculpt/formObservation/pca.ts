import type { FormPointSet, PcaResult, Vec3 } from "./contracts.ts";

const WORLD_BASIS: readonly [Vec3, Vec3, Vec3] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const AMBIGUITY_RATIO = 1e-5;

function dot(a: Vec3, b: Vec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a: Vec3, b: Vec3): Vec3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function normalize(a: Vec3): Vec3 {
  const length = Math.hypot(a[0], a[1], a[2]);
  return length > 0 ? [a[0] / length, a[1] / length, a[2] / length] : [1, 0, 0];
}
function signStable(vector: Vec3): Vec3 {
  let dominant = 0;
  if (Math.abs(vector[1]) > Math.abs(vector[dominant])) dominant = 1;
  if (Math.abs(vector[2]) > Math.abs(vector[dominant])) dominant = 2;
  return vector[dominant] < 0 ? [-vector[0], -vector[1], -vector[2]] : vector;
}

function ambiguous(values: readonly number[]): boolean {
  const scale = Math.max(Math.abs(values[0]), Math.abs(values[1]), Math.abs(values[2]), 1e-20);
  return Math.abs(values[0] - values[1]) / scale <= AMBIGUITY_RATIO || Math.abs(values[1] - values[2]) / scale <= AMBIGUITY_RATIO;
}

/** Jacobi diagonalisation is deterministic here because sweep and pivot order are fixed. */
function symmetricEigen(matrix: readonly number[]): { values: [number, number, number]; vectors: [Vec3, Vec3, Vec3] } {
  const a = matrix.slice();
  const v = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const rotate = (p: number, q: number): void => {
    const pp = p * 3 + p; const qq = q * 3 + q; const pq = p * 3 + q;
    const entry = a[pq];
    if (Math.abs(entry) < 1e-15) return;
    const theta = (a[qq] - a[pp]) / (2 * entry);
    const tangent = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
    const cosine = 1 / Math.sqrt(tangent * tangent + 1);
    const sine = tangent * cosine;
    for (let axis = 0; axis < 3; axis += 1) {
      if (axis === p || axis === q) continue;
      const ap = a[axis * 3 + p]; const aq = a[axis * 3 + q];
      a[axis * 3 + p] = a[p * 3 + axis] = cosine * ap - sine * aq;
      a[axis * 3 + q] = a[q * 3 + axis] = sine * ap + cosine * aq;
    }
    a[pp] -= tangent * entry;
    a[qq] += tangent * entry;
    a[pq] = a[q * 3 + p] = 0;
    for (let axis = 0; axis < 3; axis += 1) {
      const vp = v[axis * 3 + p]; const vq = v[axis * 3 + q];
      v[axis * 3 + p] = cosine * vp - sine * vq;
      v[axis * 3 + q] = sine * vp + cosine * vq;
    }
  };
  for (let sweep = 0; sweep < 16; sweep += 1) { rotate(0, 1); rotate(0, 2); rotate(1, 2); }
  const entries = [0, 1, 2].map((index) => ({ value: a[index * 3 + index], vector: normalize([v[index], v[3 + index], v[6 + index]] as Vec3) }));
  entries.sort((left, right) => right.value - left.value);
  return { values: [entries[0].value, entries[1].value, entries[2].value], vectors: [entries[0].vector, entries[1].vector, entries[2].vector] };
}

export function calculatePca(pointSet: Pick<FormPointSet, "positions" | "pointCount">): PcaResult {
  if (pointSet.pointCount <= 0 || pointSet.positions.length < pointSet.pointCount * 3) throw new RangeError("PCA requires finite points");
  let cx = 0; let cy = 0; let cz = 0;
  for (let index = 0; index < pointSet.pointCount * 3; index += 3) {
    const x = pointSet.positions[index]; const y = pointSet.positions[index + 1]; const z = pointSet.positions[index + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) throw new RangeError("PCA requires finite points");
    cx += x; cy += y; cz += z;
  }
  cx /= pointSet.pointCount; cy /= pointSet.pointCount; cz /= pointSet.pointCount;
  let xx = 0; let xy = 0; let xz = 0; let yy = 0; let yz = 0; let zz = 0;
  for (let index = 0; index < pointSet.pointCount * 3; index += 3) {
    const x = pointSet.positions[index] - cx; const y = pointSet.positions[index + 1] - cy; const z = pointSet.positions[index + 2] - cz;
    xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z;
  }
  const divisor = pointSet.pointCount;
  const eigen = symmetricEigen([xx / divisor, xy / divisor, xz / divisor, xy / divisor, yy / divisor, yz / divisor, xz / divisor, yz / divisor, zz / divisor]);
  if (ambiguous(eigen.values)) {
    return { centroid: [cx, cy, cz], basis: WORLD_BASIS, eigenvalues: eigen.values, ambiguous: true, basisProvenance: "world-axis-fallback", warning: "Principal direction is ambiguous because eigenvalues are near-equal; using the world-axis-stabilized fallback." };
  }
  const first = signStable(eigen.vectors[0]);
  const second = signStable(eigen.vectors[1]);
  const third = normalize(cross(first, second));
  return { centroid: [cx, cy, cz], basis: [first, second, third], eigenvalues: eigen.values, ambiguous: false, basisProvenance: "principal-components", warning: null };
}

export function determinantOfBasis(basis: readonly [Vec3, Vec3, Vec3]): number {
  return dot(cross(basis[0], basis[1]), basis[2]);
}
