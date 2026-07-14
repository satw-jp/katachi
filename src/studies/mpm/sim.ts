// ---------------------------------------------------------------------------
// MLS-MPM core: P2G -> grid update -> G2P, once per substep. Structure
// follows Hu et al. 2018 ("A Moving Least Squares Material Point Method...",
// SIGGRAPH 2018) and its widely-cited ~88-line reference implementation
// (taichi mpm88 example) — quadratic B-spline kernel, APIC-style affine
// momentum transfer, stress folded into the P2G affine matrix. Ported to 3D,
// CPU TypeScript (see README "Setup" for why CPU over WebGPU this session).
//
// Constitutive law (T2d-mpm.md §1 "構成則が相のつまみ" — this is the one
// part of the file that isn't just "MLS-MPM 88 lines in 3D"; see
// computeCauchyStress for the two real constitutive laws and their blend.
// ---------------------------------------------------------------------------

import type { Mat3 } from "./mat3.ts";
import { IDENTITY3, mat3Add, mat3Det, mat3Mul, mat3Outer, mat3Scale, mat3Transpose, mat3VecMul } from "./mat3.ts";
import type { MpmParticle } from "./particle.ts";
import type { MpmParams } from "./params.ts";

/** World domain span, sketch units, same axes as S1/S2/S2b (x,z centered on 0; y from the ground up). Fixed regardless of gridN (grid resolution just subdivides this box finer/coarser). */
export const DOMAIN_SIZE = 8;
export const DOMAIN_HALF = DOMAIN_SIZE / 2;

/**
 * Fixed simulation timestep, seconds. MLS-MPM (explicit) needs dt small
 * relative to dx and wave speed sqrt(E/rho) for stability (a CFL-like
 * condition). At gridN=48 (dx=0.167) and this Study's tuned stiffness range,
 * 1/6000s kept every configuration tried during tuning stable — see README
 * Observation for the blow-up cases hit at larger dt during tuning.
 */
export const DT = 1 / 6000;

/**
 * Grid boundary margin, in cells. The quadratic B-spline kernel reads a
 * 3-cell neighborhood around each particle, so particles within BOUND cells
 * of any edge would read/write out-of-bounds indices — the grid update pass
 * below treats cells inside this margin as solid walls on all six faces
 * (T2d-mpm.md §1 "壁はあってもなくてもよい" — kept, primarily as this safety
 * backstop). Consequence worth being honest about: the simulated FLOOR is
 * not at world y=0, it's at y = BOUND*dx (marginWorld() below) — the
 * renderer positions its ground plane there, not at y=0, to match.
 */
export const BOUND = 3;

/** World-space height of the simulated floor (and inset of the side/ceiling walls) for a given grid resolution. */
export function marginWorld(gridN: number): number {
  return BOUND * (DOMAIN_SIZE / gridN);
}

export interface Grid {
  n: number;
  dx: number;
  /** mass per cell, length n^3 */
  mass: Float64Array;
  /** velocity per cell (vx,vy,vz), length n^3*3. Holds MOMENTUM during P2G, VELOCITY after the grid-update pass. */
  vel: Float64Array;
}

export function makeGrid(n: number): Grid {
  return { n, dx: DOMAIN_SIZE / n, mass: new Float64Array(n * n * n), vel: new Float64Array(n * n * n * 3) };
}

function clearGrid(g: Grid): void {
  g.mass.fill(0);
  g.vel.fill(0);
}

function cellIndex(g: Grid, i: number, j: number, k: number): number {
  return (i * g.n + j) * g.n + k;
}

/** Quadratic B-spline base cell + per-axis weights (Hu et al. 2018 / mpm88's kernel), for one scalar coordinate. */
function quadraticWeights(coord: number, dx: number): { base: number; w: [number, number, number]; fx: number } {
  const cell = coord / dx;
  const base = Math.floor(cell - 0.5);
  const fx = cell - base;
  const w0 = 0.5 * (1.5 - fx) ** 2;
  const w1 = 0.75 - (fx - 1) ** 2;
  const w2 = 0.5 * (fx - 0.5) ** 2;
  return { base, w: [w0, w1, w2], fx };
}

/**
 * Cauchy stress, blended by `phase` between two REAL constitutive laws
 * (T2d-mpm.md §1 — "本物の名前を持つ量"). Both formulas are standard
 * continuum mechanics, chosen specifically because they need no SVD (kept
 * the CPU implementation simple — see README "Setup" for the alternative
 * (corotated/SVD-based Neo-Hookean, as in mpm88) that was NOT used and why):
 *
 *  SOLID — compressible Neo-Hookean (e.g. Bonet & Wood, "Nonlinear
 *  Continuum Mechanics for Finite Element Analysis", 2nd ed., eq. 5.28-ish
 *  family; this exact form is also used verbatim in several MPM elasticity
 *  tutorials):
 *    sigma = (mu/J)(F F^T - I) + (lambda/J) ln(J) I
 *    mu = E / (2(1+nu)),  lambda = E nu / ((1+nu)(1-2nu))   [Lame parameters]
 *
 *  FLUID — weakly-compressible Newtonian viscous fluid:
 *    sigma = -p I + 2 mu_f D,   p = K (1/J - 1),   D = sym(C) = (C + C^T)/2
 *  p is a simple linear compressibility EOS (K = bulk modulus; common in
 *  weakly-compressible SPH/MPM fluid solvers, e.g. Ram et al. 2015's or
 *  Fang et al. 2019's MPM fluids — those typically use a Tait/gamma-law EOS
 *  p = K((J^-gamma)-1) with gamma~7; this Study uses the gamma=1 linear
 *  special case for simplicity, noted as a deliberate simplification in
 *  README, not the literature default). D is the strain-rate tensor; C
 *  (the APIC/MLS-MPM affine matrix, already ~ the local velocity gradient
 *  by construction — Jiang et al. 2015, "The Affine Particle-In-Cell
 *  Method") stands in for the true ∇v, which MLS-MPM never otherwise
 *  computes explicitly. This IS a real, named constitutive law (Newtonian
 *  viscosity), just missing the deviatoric trace-removal term
 *  (2/3 tr(D) I) a fully rigorous formulation would subtract — noted as a
 *  known simplification in README, not hidden.
 */
function computeCauchyStress(F: Mat3, C: Mat3, phase: number, p: MpmParams): Mat3 {
  const J = Math.max(mat3Det(F), 1e-6);
  const mu = p.youngsModulusPa / (2 * (1 + p.poissonRatio));
  const lambda = (p.youngsModulusPa * p.poissonRatio) / ((1 + p.poissonRatio) * (1 - 2 * p.poissonRatio));
  const Ft = mat3Transpose(F);
  const FFt = mat3Mul(F, Ft);
  const solid = mat3Add(mat3Scale(mat3Add(FFt, mat3Scale(IDENTITY3, -1)), mu / J), mat3Scale(IDENTITY3, (lambda / J) * Math.log(J)));

  const pressure = p.fluidBulkModulusPa * (1 / J - 1);
  const D = mat3Scale(mat3Add(C, mat3Transpose(C)), 0.5);
  const fluid = mat3Add(mat3Scale(IDENTITY3, -pressure), mat3Scale(D, 2 * p.fluidViscosityPaS));

  const out: Mat3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 9; i++) out[i] = solid[i] + (fluid[i] - solid[i]) * phase;
  return out;
}

/**
 * One MLS-MPM substep: P2G (scatter mass+momentum+stress-force) -> grid
 * update (gravity, boundaries) -> G2P (gather velocity+affine gradient,
 * advect, update F). Mutates `particles` and `grid` in place. Pure with
 * respect to its inputs otherwise (same inputs -> same outputs, single-
 * threaded fixed-order JS — no GPU-style summation nondeterminism; see
 * README "履歴と決定性" for why the Study still follows the
 * explicit-freeze-args design regardless).
 */
export function substep(particles: MpmParticle[], grid: Grid, params: MpmParams, dt: number): void {
  clearGrid(grid);
  const n = grid.n;
  const dx = grid.dx;
  const invDx = 1 / dx;

  // --- P2G ------------------------------------------------------------
  for (const pt of particles) {
    const wx = quadraticWeights(pt.x + DOMAIN_HALF, dx);
    const wy = quadraticWeights(pt.y, dx);
    const wz = quadraticWeights(pt.z + DOMAIN_HALF, dx);

    const stress = computeCauchyStress(pt.F, pt.C, params.phase, params);
    const kirchhoff = mat3Scale(stress, Math.max(mat3Det(pt.F), 1e-6));
    const stressTerm = mat3Scale(kirchhoff, -dt * pt.volume0 * 4 * invDx * invDx);
    const affine = mat3Add(stressTerm, mat3Scale(pt.C, pt.mass));

    for (let i = 0; i < 3; i++) {
      const gi = wx.base + i;
      if (gi < 0 || gi >= n) continue;
      for (let j = 0; j < 3; j++) {
        const gj = wy.base + j;
        if (gj < 0 || gj >= n) continue;
        for (let k = 0; k < 3; k++) {
          const gk = wz.base + k;
          if (gk < 0 || gk >= n) continue;
          const weight = wx.w[i] * wy.w[j] * wz.w[k];
          if (weight <= 0) continue;
          const dpos: [number, number, number] = [(i - wx.fx) * dx, (j - wy.fx) * dx, (k - wz.fx) * dx];
          const affContrib = mat3VecMul(affine, dpos);
          const idx = cellIndex(grid, gi, gj, gk);
          const massContrib = weight * pt.mass;
          grid.mass[idx] += massContrib;
          grid.vel[idx * 3 + 0] += massContrib * pt.vx + weight * affContrib[0];
          grid.vel[idx * 3 + 1] += massContrib * pt.vy + weight * affContrib[1];
          grid.vel[idx * 3 + 2] += massContrib * pt.vz + weight * affContrib[2];
        }
      }
    }
  }

  // --- Grid update: momentum -> velocity, gravity, boundaries ----------
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        const idx = cellIndex(grid, i, j, k);
        const m = grid.mass[idx];
        if (m <= 0) continue;
        let vx = grid.vel[idx * 3 + 0] / m;
        let vy = grid.vel[idx * 3 + 1] / m;
        let vz = grid.vel[idx * 3 + 2] / m;
        vy -= params.gravity * dt;

        if (i < BOUND && vx < 0) vx = 0;
        if (i > n - 1 - BOUND && vx > 0) vx = 0;
        if (k < BOUND && vz < 0) vz = 0;
        if (k > n - 1 - BOUND && vz > 0) vz = 0;
        if (j < BOUND) {
          // Ground: no penetration + a little friction (not a physically
          // calibrated friction coefficient — a display/stability choice,
          // like sag.ts's SOFTNESS_STIFFNESS_FLOOR; noted in README).
          if (vy < 0) vy = 0;
          vx *= 0.7;
          vz *= 0.7;
        }
        if (j > n - 1 - BOUND && vy > 0) vy = 0;

        grid.vel[idx * 3 + 0] = vx;
        grid.vel[idx * 3 + 1] = vy;
        grid.vel[idx * 3 + 2] = vz;
      }
    }
  }

  // --- G2P --------------------------------------------------------------
  for (const pt of particles) {
    const wx = quadraticWeights(pt.x + DOMAIN_HALF, dx);
    const wy = quadraticWeights(pt.y, dx);
    const wz = quadraticWeights(pt.z + DOMAIN_HALF, dx);

    let nvx = 0;
    let nvy = 0;
    let nvz = 0;
    let C: Mat3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];

    for (let i = 0; i < 3; i++) {
      const gi = wx.base + i;
      if (gi < 0 || gi >= n) continue;
      for (let j = 0; j < 3; j++) {
        const gj = wy.base + j;
        if (gj < 0 || gj >= n) continue;
        for (let k = 0; k < 3; k++) {
          const gk = wz.base + k;
          if (gk < 0 || gk >= n) continue;
          const weight = wx.w[i] * wy.w[j] * wz.w[k];
          if (weight <= 0) continue;
          const idx = cellIndex(grid, gi, gj, gk);
          const gv: [number, number, number] = [grid.vel[idx * 3 + 0], grid.vel[idx * 3 + 1], grid.vel[idx * 3 + 2]];
          nvx += weight * gv[0];
          nvy += weight * gv[1];
          nvz += weight * gv[2];
          const dpos: [number, number, number] = [(i - wx.fx) * dx, (j - wy.fx) * dx, (k - wz.fx) * dx];
          const outer = mat3Outer(gv, dpos);
          C = mat3Add(C, mat3Scale(outer, weight * 4 * invDx * invDx));
        }
      }
    }

    pt.vx = nvx;
    pt.vy = nvy;
    pt.vz = nvz;
    pt.C = C;
    pt.x += nvx * dt;
    pt.y += nvy * dt;
    pt.z += nvz * dt;

    // F update: (I + dt*C) F, then blend toward the isotropic (volume-only)
    // form by `phase` — see README "Setup" for why (fluids shouldn't
    // remember shed shear the way an elastic solid does; this is the
    // mechanism, a deliberate simplification, not textbook MLS-MPM88's
    // discrete per-material F-reset).
    const Fraw = mat3Mul(mat3Add(IDENTITY3, mat3Scale(pt.C, dt)), pt.F);
    const J = Math.max(mat3Det(Fraw), 1e-6);
    const isoScale = Math.cbrt(J);
    const Fiso = mat3Scale(IDENTITY3, isoScale);
    const Fnew: Mat3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 9; i++) Fnew[i] = Fraw[i] + (Fiso[i] - Fraw[i]) * params.phase;
    pt.F = Fnew;

    // Safety clamp: keep particles inside the domain the grid actually
    // covers (the grid BC above should already prevent this in practice —
    // this is a backstop against a stray substep, not the primary
    // mechanism).
    const margin = BOUND * dx;
    if (pt.x < -DOMAIN_HALF + margin) {
      pt.x = -DOMAIN_HALF + margin;
      if (pt.vx < 0) pt.vx = 0;
    }
    if (pt.x > DOMAIN_HALF - margin) {
      pt.x = DOMAIN_HALF - margin;
      if (pt.vx > 0) pt.vx = 0;
    }
    if (pt.z < -DOMAIN_HALF + margin) {
      pt.z = -DOMAIN_HALF + margin;
      if (pt.vz < 0) pt.vz = 0;
    }
    if (pt.z > DOMAIN_HALF - margin) {
      pt.z = DOMAIN_HALF - margin;
      if (pt.vz > 0) pt.vz = 0;
    }
    if (pt.y < margin) {
      pt.y = margin;
      if (pt.vy < 0) pt.vy = 0;
    }
    if (pt.y > DOMAIN_SIZE - margin) {
      pt.y = DOMAIN_SIZE - margin;
      if (pt.vy > 0) pt.vy = 0;
    }
  }
}

export function runSteps(particles: MpmParticle[], grid: Grid, params: MpmParams, steps: number): void {
  for (let s = 0; s < steps; s++) substep(particles, grid, params, DT);
}
