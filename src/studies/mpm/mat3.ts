// ---------------------------------------------------------------------------
// Minimal row-major 3x3 matrix helpers for the MLS-MPM core (sim.ts). Kept
// as flat 9-number arrays (not a class) so the hot P2G/G2P loops stay
// allocation-light and easy to inline. Pure functions only — this module is
// the "CPU reference implementation, written as pure functions" the task
// doc recommends even for a WebGPU path; here it IS the implementation
// (T2d-mpm.md: CPU chosen for this Study, see README "Setup").
// ---------------------------------------------------------------------------

export type Mat3 = [number, number, number, number, number, number, number, number, number];

export const IDENTITY3: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function mat3Identity(): Mat3 {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

export function mat3Zero(): Mat3 {
  return [0, 0, 0, 0, 0, 0, 0, 0, 0];
}

export function mat3Add(a: Mat3, b: Mat3): Mat3 {
  const out = mat3Zero();
  for (let i = 0; i < 9; i++) out[i] = a[i] + b[i];
  return out;
}

export function mat3Scale(a: Mat3, s: number): Mat3 {
  const out = mat3Zero();
  for (let i = 0; i < 9; i++) out[i] = a[i] * s;
  return out;
}

export function mat3Lerp(a: Mat3, b: Mat3, t: number): Mat3 {
  const out = mat3Zero();
  for (let i = 0; i < 9; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

export function mat3Transpose(a: Mat3): Mat3 {
  return [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];
}

export function mat3Mul(a: Mat3, b: Mat3): Mat3 {
  const out = mat3Zero();
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = a[r * 3 + 0] * b[0 * 3 + c] + a[r * 3 + 1] * b[1 * 3 + c] + a[r * 3 + 2] * b[2 * 3 + c];
    }
  }
  return out;
}

export function mat3Det(a: Mat3): number {
  return (
    a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6])
  );
}

export function mat3VecMul(a: Mat3, v: [number, number, number]): [number, number, number] {
  return [
    a[0] * v[0] + a[1] * v[1] + a[2] * v[2],
    a[3] * v[0] + a[4] * v[1] + a[5] * v[2],
    a[6] * v[0] + a[7] * v[1] + a[8] * v[2],
  ];
}

/** Outer product v (column) x w (row), as a 3x3 matrix. */
export function mat3Outer(v: [number, number, number], w: [number, number, number]): Mat3 {
  return [v[0] * w[0], v[0] * w[1], v[0] * w[2], v[1] * w[0], v[1] * w[1], v[1] * w[2], v[2] * w[0], v[2] * w[1], v[2] * w[2]];
}
