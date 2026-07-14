// ---------------------------------------------------------------------------
// S2c's physical parameters. Unlike S2b's single "softness" knob (a sketch
// abstraction over an ad-hoc spring model), T2d-mpm.md §1 requires the
// constitutive law itself to be a real one (Neo-Hookean elastic solid /
// weakly-compressible viscous fluid) carrying REAL PHYSICAL QUANTITIES —
// Young's modulus, Poisson's ratio, density, viscosity — not an abstract
// 0..1 "softness". `phase` is the ONE UI-facing 0..1 knob (solid..fluid),
// used only to CROSSFADE BETWEEN the two constitutive laws (sim.ts); it does
// not replace the physical quantities, which are held and recorded
// independently, each with its own real unit (see README "Setup" for the
// equations and citations, and for why the numeric VALUES below are tuned
// to this Study's sketch-scale domain rather than calibrated to true SI
// magnitudes — same honesty pattern as sag.ts's GRAVITY=2.2).
// ---------------------------------------------------------------------------

export interface MpmParams {
  /** 0 = pure Neo-Hookean elastic solid, 1 = pure weakly-compressible viscous fluid. The one relational knob; everything else below is a named physical quantity. */
  phase: number;

  // --- Solid end: compressible Neo-Hookean elasticity -----------------------
  /** Young's modulus E, Pa (sketch-scale, see README). Stiffness of the elastic solid. */
  youngsModulusPa: number;
  /** Poisson's ratio ν, dimensionless (0..0.49). Volume-preservation tendency under strain. */
  poissonRatio: number;

  // --- Fluid end: weakly-compressible viscous fluid --------------------------
  /** Bulk modulus K, Pa (sketch-scale). Resistance to volume compression (pressure response). */
  fluidBulkModulusPa: number;
  /** Dynamic viscosity μ, Pa·s (sketch-scale). Resistance to shear flow. */
  fluidViscosityPaS: number;

  // --- Shared ---------------------------------------------------------------
  /** Reference material density ρ0, kg/m³ (sketch-scale) — sets particle mass from sampled volume. */
  densityKgM3: number;
  /** Gravitational acceleration, sketch units/s² (same convention as gravity.ts's GRAVITY / sag.ts's GRAVITY: not literally 9.81, tuned to this domain's scale). */
  gravity: number;

  // --- Seeding / grid ---------------------------------------------------------
  /** Target particle count per unit volume when seeding balls into material points. */
  particlesPerUnitVolume: number;
  /** Grid resolution (cells per axis). Changing this requires a reseed (like S1's count/radiusBase). */
  gridN: number;
  /** Sub-steps executed per `run` history step (fixed timestep dt is derived in sim.ts from CFL-safe defaults, not user-facing). */
  substepsPerRun: number;
}

export const DEFAULT_MPM_PARAMS: MpmParams = {
  phase: 0,
  youngsModulusPa: 4000,
  poissonRatio: 0.3,
  fluidBulkModulusPa: 3500,
  fluidViscosityPaS: 15,
  densityKgM3: 1000,
  gravity: 9.8,
  particlesPerUnitVolume: 150,
  gridN: 48,
  substepsPerRun: 40,
};
