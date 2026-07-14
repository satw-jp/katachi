// ---------------------------------------------------------------------------
// The material point: position/velocity plus the two per-particle tensors
// MLS-MPM needs — F (deformation gradient, tracks elastic strain) and C
// (affine velocity gradient, the APIC/MLS reconstruction of local ∇v used
// both to transfer angular momentum and, here, as the fluid's strain-rate
// tensor — see sim.ts's computeCauchyStress). mass/volume0 are fixed at
// seed time (particle.ts... this file); pos/vel/F/C evolve every substep.
// ---------------------------------------------------------------------------

import { IDENTITY3, type Mat3 } from "./mat3.ts";

export interface MpmParticle {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Deformation gradient (elastic memory of shape). Identity = undeformed. */
  F: Mat3;
  /** Affine velocity gradient (APIC/MLS-MPM), reconstructed from the grid each G2P. */
  C: Mat3;
  /** Particle mass, kg (sketch-scale — see params.ts). */
  mass: number;
  /** Reference (rest) volume, m³ (sketch-scale). Used as Vp0 in the P2G stress-to-force term. */
  volume0: number;
}

export function makeParticle(id: number, x: number, y: number, z: number, mass: number, volume0: number): MpmParticle {
  return { id, x, y, z, vx: 0, vy: 0, vz: 0, F: [...IDENTITY3] as Mat3, C: [0, 0, 0, 0, 0, 0, 0, 0, 0], mass, volume0 };
}
