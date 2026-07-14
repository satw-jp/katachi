// ---------------------------------------------------------------------------
// The bridge between S1's field (balls) and S2c's material (particles) —
// T2d-mpm.md §2 "種まき": scatter material points inside each ball's
// volume, and the reverse direction, "凍らせる": bin the current particle
// cloud back into a coarse ball list ("粒子→クラスタ/密度から球を当てる粗い
// 変換でよい", explicitly allowed to be crude).
// ---------------------------------------------------------------------------

import type { Ball } from "../cloud-sculpt/field.ts";
import { freshBallId } from "../cloud-sculpt/field.ts";
import { hashSeed, makeRng } from "../cloud-sculpt/random.ts";
import { makeParticle, type MpmParticle } from "./particle.ts";

function ballVolume(r: number): number {
  return (4 / 3) * Math.PI * r * r * r;
}

/**
 * Scatter material points inside `balls` by rejection sampling within each
 * ball's own sphere (independent per ball — overlapping balls will get
 * doubly-sampled in the overlap lens, which is fine: it's still "material
 * filling the S1 shape", not a strict partition). particlesPerUnitVolume
 * is a density knob (params.ts); each particle's mass/volume0 is set so the
 * TOTAL mass of a ball's particles equals density * that ball's volume
 * (mass conservation at seed time).
 */
export function seedParticlesFromBalls(
  balls: Ball[],
  particlesPerUnitVolume: number,
  densityKgM3: number,
  seed: string,
): MpmParticle[] {
  const particles: MpmParticle[] = [];
  let nextId = 1;
  for (const ball of balls) {
    const vol = ballVolume(ball.r);
    const count = Math.max(1, Math.round(vol * particlesPerUnitVolume));
    const rng = makeRng(hashSeed(`${seed}:mpm-seed:${ball.id}`));
    const perParticleVolume = vol / count;
    const perParticleMass = perParticleVolume * densityKgM3;
    for (let i = 0; i < count; i++) {
      // Uniform-in-volume rejection sampling inside the unit sphere, then
      // scale by ball radius/center.
      let x = 0;
      let y = 0;
      let z = 0;
      for (let attempt = 0; attempt < 30; attempt++) {
        x = rng() * 2 - 1;
        y = rng() * 2 - 1;
        z = rng() * 2 - 1;
        if (x * x + y * y + z * z <= 1) break;
      }
      particles.push(
        makeParticle(
          nextId++,
          ball.x + x * ball.r,
          ball.y + y * ball.r,
          ball.z + z * ball.r,
          perParticleMass,
          perParticleVolume,
        ),
      );
    }
  }
  return particles;
}

/**
 * Freeze: bin the current particle positions into a coarse spatial grid,
 * and turn every non-empty bin into one ball, centered on that bin's
 * particle centroid, sized so the ball's volume equals the bin's total
 * particle volume (mass/density -> volume -> radius of the equal-volume
 * sphere). A deliberately crude density->sphere conversion
 * (T2d-mpm.md §2 explicitly allows this). Deterministic given the same
 * particle snapshot (binning is order-independent — a running sum per
 * bin), but freeze does NOT rely on that: the resulting Ball[] is stored
 * explicitly in the history op's args (T2d-mpm.md §3), not recomputed on
 * replay.
 */
export function freezeParticlesToBalls(particles: MpmParticle[], densityKgM3: number, binSize: number): Ball[] {
  interface Bin {
    sx: number;
    sy: number;
    sz: number;
    count: number;
    volume: number;
  }
  const bins = new Map<string, Bin>();
  for (const pt of particles) {
    const ix = Math.floor(pt.x / binSize);
    const iy = Math.floor(pt.y / binSize);
    const iz = Math.floor(pt.z / binSize);
    const key = `${ix}:${iy}:${iz}`;
    let bin = bins.get(key);
    if (!bin) {
      bin = { sx: 0, sy: 0, sz: 0, count: 0, volume: 0 };
      bins.set(key, bin);
    }
    bin.sx += pt.x;
    bin.sy += pt.y;
    bin.sz += pt.z;
    bin.count += 1;
    bin.volume += pt.mass / densityKgM3;
  }

  const MIN_PARTICLES_PER_BIN = 2;
  const balls: Ball[] = [];
  for (const bin of bins.values()) {
    if (bin.count < MIN_PARTICLES_PER_BIN) continue;
    const r = Math.cbrt((3 * bin.volume) / (4 * Math.PI));
    if (!Number.isFinite(r) || r <= 0) continue;
    balls.push({
      id: freshBallId(),
      x: bin.sx / bin.count,
      y: bin.sy / bin.count,
      z: bin.sz / bin.count,
      r: Math.max(0.04, r),
    });
  }
  return balls;
}
