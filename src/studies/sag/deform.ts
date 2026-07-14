// ---------------------------------------------------------------------------
// The sag: a crude relaxation solve of the rest shape under its own weight.
// T2b-sag.md §2 defined the SOLID end (spring network, still used below
// LIQUID_BLEND_START). T2c-liquid-freeze.md §1 adds the LIQUID end (softness
// near 1): a second, independent relaxation with no persistent topology
// ("接続の記憶を持たない" — neighbor interactions are rebuilt from CURRENT
// positions every iteration, not the rest-shape overlap graph) plus a
// cohesion/repulsion pair force (a surface-tension sketch, not real fluid
// dynamics — AGENTS §1 "正直な計算"). The two solves are blended by a
// softness-driven crossfade so the mid-range (T2b's regime, e.g. softness
// 0.4) is untouched bit-for-bit, and only the top of the slider (softness
// beyond LIQUID_BLEND_START) drifts toward the liquid solve.
//
//   SOLID (spring, T2b, unchanged): S2's overlap graph (balls = nodes,
//   overlap = edge) doubles as a spring network. Spring stiffness ∝
//   (1 − softness) × contact cross-section (physics.ts's overlapArea,
//   imported not copied). Rest length = the balls' ORIGINAL distance (the
//   network remembers the rest-shape topology — that's the "固体は接続の
//   記憶を持つ" half of T2c's design).
//
//   LIQUID (new, T2c): every iteration, every pair within a cohesion cutoff
//   (a small multiple of the sum of their radii) feels a pairwise force
//   toward "just touching" (distance = r_i + r_j): push apart if closer
//   (repulsion — "重なりすぎは押し返す", prevents balls interpenetrating as
//   they all fall toward the ground), pull together if farther, up to the
//   cutoff (cohesion — "近い球は引き合い", a surface-tension sketch that
//   keeps the fallen balls as one pool instead of scattering). There is no
//   rest-length memory of the ORIGINAL rest shape at all — only the current
//   frame's geometry decides who pulls on whom. Combined with gravity and
//   the same hard ground constraint as the solid solve, balls that would
//   otherwise stack directly on top of each other get pushed sideways by
//   repulsion instead, which is the mechanism that turns a pile into a
//   spread-out puddle.
//
// Both solves — and the blend between them — are PURE functions of (rest
// balls, softness): same inputs, same deformed positions, every time. That
// purity is what makes "たわみ位置は履歴に無い、export→import で再現される"
// (T2b-sag.md §1) and now also `freeze`'s replay determinism
// (T2c-liquid-freeze.md §2) possible — the deformed shape is never stored,
// only recomputed from (rest balls, softness).
// ---------------------------------------------------------------------------

import type { Ball } from "../cloud-sculpt/field.ts";
import { ballVolume, overlapArea } from "../gravity/physics.ts";

/**
 * Base spring stiffness scale (arbitrary "sketch" units, not a material
 * constant). Chosen empirically against the S1/S2 default cloud (count=12,
 * radiusBase=0.7) so that softness=1 produces a visibly large, but not
 * numerically explosive, sag within SAG_ITERATIONS. See README "Setup" for
 * the tuning notes and what was tried.
 */
const K_BASE = 90;

/**
 * Stiffness never drops to exactly zero even at softness=1 (a small floor
 * keeps the mass-spring network from fully decohering into an unconnected
 * pile, which read as a rendering glitch more than "very soft" during
 * tuning). This is a display/stability choice, not a physical one.
 */
const SOFTNESS_STIFFNESS_FLOOR = 0.03;

/** Downward acceleration in the same arbitrary sketch units as K_BASE. */
const GRAVITY = 2.2;

const DT = 1 / 60;
const DAMPING = 0.9;
const ITERATIONS = 240;

/** A spring stretched (or compressed) beyond this multiple of its rest length is "壊れた" — reported, not fixed. */
const BREAK_STRETCH_RATIO = 4;

/**
 * Below this softness, the output is the SOLID (spring) solve alone —
 * bit-for-bit identical to T2b, so the mid-range example in
 * T2c-liquid-freeze.md §1 ("柔らかさ中間（例0.4）は既存のバネたわみのまま")
 * holds exactly, and the liquid solve isn't even run (no cost, no drift).
 * Above it, the two solves crossfade up to softness=1 (pure liquid).
 * Chosen empirically (see README Setup) so the fade has enough of the
 * slider's range to read as a transition rather than a snap.
 */
const LIQUID_BLEND_START = 0.65;

/**
 * Liquid pair-force stiffness when two balls are CLOSER than the overlap
 * target (repulsion — keeps a falling pile from interpenetrating, which is
 * what pushes it sideways into a puddle instead of a stack). Deliberately
 * stiffer than the cohesion stiffness below: pushing apart has to win over
 * gravity's constant downward pull, or balls would slowly crush into each
 * other instead of settling into a monolayer.
 */
const LIQUID_K_REPEL = 80;

/**
 * Liquid pair-force stiffness when two balls are FARTHER than the overlap
 * target but still within the cohesion cutoff (attraction — the
 * surface-tension sketch that keeps the puddle one body instead of
 * scattering into separate droplets). Deliberately weak relative to
 * LIQUID_K_REPEL: strong enough to catch a ball that's drifted just past
 * its neighbors during the energetic settling phase (see LIQUID_PHASE1_*
 * below) and pull it back into the pool, weak enough that it doesn't resist
 * the initial gravity-driven spreading. Tuned together with
 * LIQUID_COHESION_REACH — see that constant for the two failure modes that
 * were tried and rejected (README Setup has the measured numbers): too
 * weak/narrow → balls escape as stray droplets; too strong/wide → the pool
 * barely spreads from its starting footprint.
 */
const LIQUID_K_COHESION = 5;

/**
 * Equilibrium separation, as a fraction of (r_i + r_j) — where the pair
 * force is zero (repel below, cohere above). NOT "just touching" (that
 * would be 1.0): a first attempt used 1.0 and it settled into a puddle
 * that read as almost entirely RED, because "just touching" means almost
 * no overlap, and computeStrain's contact area (physics.ts's overlapArea)
 * collapses to ~0 right at that distance — dividing volume by a
 * near-zero neck is exactly the "支えが無いものは立てない" case S2's strain
 * model is designed to flag as maximally strained. Completion condition 2
 * ("落ち着いた池はほぼ青") needs real contact area, so the equilibrium is
 * calibrated instead against the REST SHAPE's own typical overlap depth
 * (S1's metaball field already relies on balls overlapping deeply to blend
 * smoothly — see README Setup for the measured d/(r_i+r_j) distribution,
 * centered well under 1.0). 0.6 sits in the middle of that measured range.
 */
const LIQUID_REST_RATIO = 0.6;

/**
 * Cohesion cutoff, as a multiple of (r_i + r_j). Pairs farther apart than
 * this feel no force at all. Kept close to 1.0 (barely past "just
 * touching") deliberately: a wider reach (tried up to 4×, README Setup)
 * makes the cohesion field encompass the whole original cluster, which
 * resists the gravity-driven spreading almost as much as it prevents stray
 * droplets — the pool stayed near its starting footprint instead of
 * flattening. This narrow reach only recaptures balls that are still local
 * to their recent neighbors, letting the far side of the cluster drift
 * away and settle independently (which is what makes it spread).
 */
const LIQUID_COHESION_REACH = 1.05;

/**
 * How deep (as a fraction of a ball's own radius) the liquid ground
 * constraint lets a ball settle below its own "just tangent" height
 * (y=r). The spring solver's ground rule (y>=r, an idealized point
 * contact) is kept byte-for-byte for softness < LIQUID_BLEND_START (no
 * regression). But a real sphere-on-plane point contact has an area of
 * exactly zero, and computeStrain (physics.ts, shared with S1/S2 — this
 * Study does not modify it, "やらないこと" in T2c-liquid-freeze.md) divides
 * the resting ball's volume by that ground-contact area. With ZERO
 * embedding, every grounded ball in the settled puddle would read at
 * maximum strain (raw = volume / ~0), which would make the pool solid RED
 * — the opposite of completion condition 2 ("落ち着いた池はほぼ青"). A puddle
 * that is genuinely "ベタッと" (flush/adherent) against the ground has a
 * real, non-point contact patch — this constant gives it one. 0.35 was
 * tuned (README Observation) against the S1/S2 default cloud's radius
 * range so that a ball supporting only its own weight (the common case in
 * a monolayer) reads solidly blue, not borderline.
 */
const LIQUID_GROUND_EMBED_RATIO = 0.35;

/**
 * Liquid gravity is its own, stronger constant than the spring solve's
 * GRAVITY (2.2) — RESEARCH v2 Y5 frames softness=1 as the end where "形は
 * 重力のもの" (the shape belongs to gravity), so the liquid end leans on it
 * harder on purpose. Practically: this also has to be strong enough to
 * reliably beat LIQUID_K_COHESION and flatten a pile within the fixed
 * iteration budget, rather than leaving a few balls resting on top of
 * their neighbors (an intermediate, "still a lumpy pile" result observed
 * during tuning at lower gravity).
 */
const LIQUID_GRAVITY = 3.5;

const LIQUID_DT = 1 / 60;

/**
 * Two-phase damping schedule ("simulated annealing", crudely). A single
 * fixed damping (tried first, matching the spring solve's style) either
 * stayed too rigid to escape the rest shape's starting arrangement (high
 * damping) or wobbled without properly settling (low damping for the whole
 * run). Splitting into an energetic phase (low damping — momentum carries
 * balls sideways out from under their neighbors, which is the actual
 * mechanism that turns a pile into a spread layer) followed by a settling
 * phase (higher damping — kills the leftover jitter so the pool comes to
 * rest instead of oscillating forever) reliably flattened every cloud
 * tried during tuning (README Observation: default field + 3 reseeds +
 * count 6/24). This two-phase idea has no equivalent in the spring solve,
 * which only needs one damping because its topology never reorganizes.
 */
const LIQUID_PHASE1_ITERATIONS = 300;
const LIQUID_PHASE1_DAMPING = 0.98;
const LIQUID_PHASE2_ITERATIONS = 500;
const LIQUID_PHASE2_DAMPING = 0.8;
const LIQUID_ITERATIONS = LIQUID_PHASE1_ITERATIONS + LIQUID_PHASE2_ITERATIONS;

export interface DeformResult {
  /** Same length, order, and ids as the input balls — positions (and only positions) solved. */
  balls: Ball[];
  /** Per-ball: true if any spring touching it exceeded BREAK_STRETCH_RATIO, or its position went non-finite. */
  broken: boolean[];
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Edge {
  i: number;
  j: number;
  rest: number;
  k: number;
}

/**
 * SOLID end: the spring-network solve from T2b, unchanged. A persistent
 * topology — edges are the REST shape's overlap graph, fixed for the whole
 * solve ("固体は接続の記憶を持つ" — the counterpoint to solveLiquid below).
 */
function solveSpring(balls: Ball[], softness: number): DeformResult {
  const n = balls.length;
  const stiffnessFactor = SOFTNESS_STIFFNESS_FLOOR + (1 - SOFTNESS_STIFFNESS_FLOOR) * (1 - softness);

  const edges: Edge[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = balls[i].x - balls[j].x;
      const dy = balls[i].y - balls[j].y;
      const dz = balls[i].z - balls[j].z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < balls[i].r + balls[j].r && d > 1e-6) {
        const area = overlapArea(balls[i].r, balls[j].r, d);
        edges.push({ i, j, rest: d, k: K_BASE * stiffnessFactor * Math.max(area, 1e-4) });
      }
    }
  }

  const pos: Vec3[] = balls.map((b) => ({ x: b.x, y: b.y, z: b.z }));
  const vel: Vec3[] = balls.map(() => ({ x: 0, y: 0, z: 0 }));
  const mass = balls.map((b) => Math.max(ballVolume(b.r), 1e-4));

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const force: Vec3[] = balls.map((_, i) => ({ x: 0, y: -GRAVITY * mass[i], z: 0 }));

    for (const e of edges) {
      const dx = pos[e.j].x - pos[e.i].x;
      const dy = pos[e.j].y - pos[e.i].y;
      const dz = pos[e.j].z - pos[e.i].z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
      const stretch = len - e.rest;
      const fmag = e.k * stretch; // >0 (stretched) pulls i toward j; <0 (compressed) pushes apart
      const nx = dx / len;
      const ny = dy / len;
      const nz = dz / len;
      force[e.i].x += nx * fmag;
      force[e.i].y += ny * fmag;
      force[e.i].z += nz * fmag;
      force[e.j].x -= nx * fmag;
      force[e.j].y -= ny * fmag;
      force[e.j].z -= nz * fmag;
    }

    for (let i = 0; i < n; i++) {
      vel[i].x = (vel[i].x + (force[i].x / mass[i]) * DT) * DAMPING;
      vel[i].y = (vel[i].y + (force[i].y / mass[i]) * DT) * DAMPING;
      vel[i].z = (vel[i].z + (force[i].z / mass[i]) * DT) * DAMPING;
      pos[i].x += vel[i].x * DT;
      pos[i].y += vel[i].y * DT;
      pos[i].z += vel[i].z * DT;

      // Ground: hard, non-penetrating constraint (T2b-sag.md §2 "地面貫入禁止").
      const r = balls[i].r;
      if (pos[i].y - r < 0) {
        pos[i].y = r;
        if (vel[i].y < 0) vel[i].y = 0;
      }
    }
  }

  const broken = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(pos[i].x) || !Number.isFinite(pos[i].y) || !Number.isFinite(pos[i].z)) {
      broken[i] = true;
      pos[i] = { x: balls[i].x, y: balls[i].y, z: balls[i].z }; // don't hand NaN to the renderer
    }
  }
  for (const e of edges) {
    const dx = pos[e.j].x - pos[e.i].x;
    const dy = pos[e.j].y - pos[e.i].y;
    const dz = pos[e.j].z - pos[e.i].z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len > e.rest * BREAK_STRETCH_RATIO || len < e.rest / BREAK_STRETCH_RATIO) {
      broken[e.i] = true;
      broken[e.j] = true;
    }
  }

  const deformed = balls.map((b, i) => ({ id: b.id, x: pos[i].x, y: pos[i].y, z: pos[i].z, r: b.r }));
  return { balls: deformed, broken };
}

/**
 * LIQUID end: "接続の記憶を持たない緩和" — every iteration rebuilds who
 * pushes/pulls whom from the CURRENT frame's positions (a plain O(n²) pair
 * scan; n is sculpting-scale here, so this is cheap), instead of solving a
 * topology fixed at the rest shape. Each pair within LIQUID_COHESION_REACH ×
 * (r_i+r_j) feels a force toward LIQUID_REST_RATIO × (r_i+r_j) — a deep,
 * field-typical overlap, NOT "just touching" (repel if closer than that,
 * cohere if farther, up to the reach) — see the constants above for why the
 * equilibrium sits well inside full contact and why the two stiffnesses
 * differ. This is intentionally NOT a function of softness: softness only
 * decides how much of this result gets blended in (see computeDeform
 * below), so the liquid physics itself doesn't need its own knob.
 */
function solveLiquid(balls: Ball[]): DeformResult {
  const n = balls.length;
  const pos: Vec3[] = balls.map((b) => ({ x: b.x, y: b.y, z: b.z }));
  const vel: Vec3[] = balls.map(() => ({ x: 0, y: 0, z: 0 }));
  const mass = balls.map((b) => Math.max(ballVolume(b.r), 1e-4));

  for (let iter = 0; iter < LIQUID_ITERATIONS; iter++) {
    const damping = iter < LIQUID_PHASE1_ITERATIONS ? LIQUID_PHASE1_DAMPING : LIQUID_PHASE2_DAMPING;
    const force: Vec3[] = balls.map((_, i) => ({ x: 0, y: -LIQUID_GRAVITY * mass[i], z: 0 }));

    // No persistent edge list: neighbors (and whether they attract or
    // repel) are decided fresh from `pos`, every iteration.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[j].x - pos[i].x;
        const dy = pos[j].y - pos[i].y;
        const dz = pos[j].z - pos[i].z;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const sumR = balls[i].r + balls[j].r;
        if (len >= sumR * LIQUID_COHESION_REACH) continue; // out of reach: no interaction at all
        const rest = sumR * LIQUID_REST_RATIO;
        const stretch = len - rest; // <0 closer than the overlap target (repel), >=0 farther (cohere)
        const k = stretch < 0 ? LIQUID_K_REPEL : LIQUID_K_COHESION;
        const fmag = k * stretch;
        const nx = dx / len;
        const ny = dy / len;
        const nz = dz / len;
        force[i].x += nx * fmag;
        force[i].y += ny * fmag;
        force[i].z += nz * fmag;
        force[j].x -= nx * fmag;
        force[j].y -= ny * fmag;
        force[j].z -= nz * fmag;
      }
    }

    for (let i = 0; i < n; i++) {
      vel[i].x = (vel[i].x + (force[i].x / mass[i]) * LIQUID_DT) * damping;
      vel[i].y = (vel[i].y + (force[i].y / mass[i]) * LIQUID_DT) * damping;
      vel[i].z = (vel[i].z + (force[i].z / mass[i]) * LIQUID_DT) * damping;
      pos[i].x += vel[i].x * LIQUID_DT;
      pos[i].y += vel[i].y * LIQUID_DT;
      pos[i].z += vel[i].z * LIQUID_DT;

      // Ground: hard constraint, but the floor sits LIQUID_GROUND_EMBED_RATIO
      // × r below "just tangent" — see that constant's comment for why (a
      // puddle's flattened contact patch, not a point). The solid solve
      // above is untouched (still floors at exactly y=r).
      const r = balls[i].r;
      const floor = r * (1 - LIQUID_GROUND_EMBED_RATIO);
      if (pos[i].y < floor) {
        pos[i].y = floor;
        if (vel[i].y < 0) vel[i].y = 0;
      }
    }
  }

  const broken = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(pos[i].x) || !Number.isFinite(pos[i].y) || !Number.isFinite(pos[i].z)) {
      broken[i] = true;
      pos[i] = { x: balls[i].x, y: balls[i].y, z: balls[i].z }; // don't hand NaN to the renderer
    }
  }
  // No BREAK_STRETCH_RATIO check here: the liquid solve has no rest lengths
  // to "break" — it settles into whatever geometry the pair forces and
  // gravity agree on. A ball resting on a single hair-thin point of contact
  // is a real (if rare) outcome of this solve, not a malfunction; T2c-
  // liquid-freeze.md §1 calls this out as an accepted exception to "the
  // pool is basically all blue" rather than something to suppress here.
  const deformed = balls.map((b, i) => ({ id: b.id, x: pos[i].x, y: pos[i].y, z: pos[i].z, r: b.r }));
  return { balls: deformed, broken };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Solve the rest shape's sag under gravity for a given softness.
 *
 * softness <= 0 is handled as an exact bypass (no simulation at all) so
 * "柔らかさ0でたわみゼロ、S2と同じ配置" (completion condition 1, T2b) holds
 * exactly, not just approximately at the limit of a stiff spring.
 *
 * Above 0, this is the SOLID (spring) solve alone until LIQUID_BLEND_START —
 * bit-for-bit the T2b result, so T2b's regression suite (completion
 * condition 6 of T2c) is untouched. From LIQUID_BLEND_START to 1, the
 * result crossfades (smoothstep, positions only) from the solid solve
 * toward the LIQUID solve, reaching pure liquid at softness=1
 * (T2c-liquid-freeze.md §1, "柔らかさで両者を混ぜる").
 */
export function computeDeform(balls: Ball[], softness: number): DeformResult {
  const n = balls.length;
  if (n === 0) return { balls: [], broken: [] };
  if (softness <= 0) {
    return { balls: balls.map((b) => ({ ...b })), broken: balls.map(() => false) };
  }

  const springResult = solveSpring(balls, softness);
  const liquidWeight = smoothstep(LIQUID_BLEND_START, 1, softness);
  if (liquidWeight <= 0) return springResult;

  const liquidResult = solveLiquid(balls);
  const blended = balls.map((b, i) => ({
    id: b.id,
    x: lerp(springResult.balls[i].x, liquidResult.balls[i].x, liquidWeight),
    y: lerp(springResult.balls[i].y, liquidResult.balls[i].y, liquidWeight),
    z: lerp(springResult.balls[i].z, liquidResult.balls[i].z, liquidWeight),
    r: b.r,
  }));
  // "壊れた" is a spring-topology concept (§ solveSpring); it fades out of
  // meaning as the blend approaches pure liquid, where nothing "breaks" —
  // only the liquid solve's own (rare) singular-contact exception applies,
  // which is recorded in the README rather than flagged here (see solveLiquid).
  const broken = liquidWeight < 1 ? springResult.broken : liquidResult.broken;
  return { balls: blended, broken };
}
