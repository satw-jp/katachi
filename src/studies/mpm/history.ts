// ---------------------------------------------------------------------------
// S2c's operation history. Same shape as every other Study
// ([{t, op, args}], export/import JSON) with one deliberate deviation from
// S2b's `freeze`, per T2d-mpm.md §3 (a confirmed design decision — "従うこと"):
//
//   GPU parallel float summation order is not fixed, so a WebGPU
//   implementation's simulation trajectory would not be bit-reproducible
//   across replays. Rather than have `freeze`'s reproducibility depend on
//   an implementation detail (CPU vs GPU), the op carries the frozen
//   Ball[] RESULT explicitly in its args (like addBall carries explicit
//   coordinates) — replay never re-runs physics to recover a freeze, it
//   just re-applies the recorded ball list. This makes 正本 reproduction
//   (completion condition 4) independent of whether a future revisit
//   swaps this Study's CPU core for a WebGPU one.
//
// `run` (simulate N substeps) IS re-executed on replay, because this CPU
// implementation happens to be deterministic (single-threaded, fixed
// iteration order — see sim.ts's substep doc comment) — replaying `run`
// reconstructs the same visible simulation, which is a bonus this Study
// gets from choosing CPU, not a requirement the design depends on: nothing
// about 正本 correctness (freeze reproduction) requires `run` replay to be
// exact, only that `freeze`'s own explicit args are re-applied faithfully.
// ---------------------------------------------------------------------------

import type { Ball } from "../cloud-sculpt/field.ts";
import { resetBallIdCounter } from "../cloud-sculpt/field.ts";
import type { MpmParams } from "./params.ts";
import { DEFAULT_MPM_PARAMS } from "./params.ts";
import { makeParticle, type MpmParticle } from "./particle.ts";
import { seedParticlesFromBalls } from "./seeding.ts";
import { makeGrid, runSteps } from "./sim.ts";

/**
 * Bookkeeping for a `seedMesh` op -- traceability metadata only, never
 * consulted by applyEntry/replay (positions in the op's own args are the
 * only thing replay needs, same principle as `freeze`'s explicit Ball[]).
 */
export interface MeshSeedSource {
  fileName: string;
  triangleCount: number;
  voxelSize: number;
  scale: number;
  truncated: boolean;
  requestedCount: number;
}

export type MpmOp =
  | { op: "seed"; args: { balls: Ball[]; params: MpmParams } }
  // T2f-import-stl.md §3: no new op was wanted if `seed` could carry the
  // result -- but `seed` always RECOMPUTES particles from balls via
  // rejection sampling (seedParticlesFromBalls), and a mesh import has no
  // Ball[] source to recompute from. So this is the smallest new op that
  // fits: like `freeze`, it carries its OWN result explicitly (the filled
  // particle positions), not the STL triangle data (which would bloat the
  // recipe and isn't needed for replay -- only the fill result is).
  | {
      op: "seedMesh";
      args: { positions: { x: number; y: number; z: number }[]; totalVolume0: number; params: MpmParams; source: MeshSeedSource };
    }
  | { op: "setParam"; args: { key: keyof MpmParams; value: number | string } }
  | { op: "run"; args: { steps: number } }
  | { op: "freeze"; args: { balls: Ball[] } }
  | { op: "clear"; args: Record<string, never> };

export interface MpmHistoryEntry {
  t: number;
  op: MpmOp["op"];
  args: MpmOp["args"];
}

export interface MpmRecipe {
  formatVersion: 1;
  studyId: "mpm";
  exportedAt: string;
  entries: MpmHistoryEntry[];
}

export interface MpmState {
  /** The balls last seeded (the S1-shaped source this Study started from). */
  sourceBalls: Ball[];
  params: MpmParams;
  particles: MpmParticle[];
  /** All frozen results recorded so far (most recent last). Each is a 正本-grade Ball[] snapshot, explicit in the history. */
  frozen: Ball[][];
}

export function createEmptyState(): MpmState {
  return { sourceBalls: [], params: { ...DEFAULT_MPM_PARAMS }, particles: [], frozen: [] };
}

export function record(
  history: MpmHistoryEntry[],
  state: MpmState,
  op: MpmOp["op"],
  args: MpmOp["args"],
): MpmHistoryEntry {
  const entry: MpmHistoryEntry = { t: Date.now(), op, args } as MpmHistoryEntry;
  history.push(entry);
  applyEntry(state, entry);
  return entry;
}

export function applyEntry(state: MpmState, entry: MpmHistoryEntry): void {
  const op = entry as MpmOp;
  switch (op.op) {
    case "seed": {
      state.sourceBalls = op.args.balls.map((b) => ({ ...b }));
      state.params = { ...op.args.params };
      state.particles = seedParticlesFromBalls(
        state.sourceBalls,
        state.params.particlesPerUnitVolume,
        state.params.densityKgM3,
        `${state.params.gridN}`,
      );
      break;
    }
    case "seedMesh": {
      // Mirrors "seed"'s effect on state (replace sourceBalls/params/particles
      // wholesale) but builds MpmParticle[] directly from the stored fill
      // positions instead of re-sampling from a Ball[] -- there is no ball
      // source for a mesh import. Per-particle mass/volume are derived from
      // the CURRENT params.densityKgM3 (captured in this op's own args.params,
      // same as "seed") and the stored totalVolume0 estimate, exactly like
      // seedParticlesFromBalls conserves each ball's total mass.
      state.sourceBalls = [];
      state.params = { ...op.args.params };
      const positions = op.args.positions;
      const count = positions.length;
      const perParticleVolume = count > 0 ? op.args.totalVolume0 / count : 0;
      const perParticleMass = perParticleVolume * state.params.densityKgM3;
      state.particles = positions.map((p, i) => makeParticle(i + 1, p.x, p.y, p.z, perParticleMass, perParticleVolume));
      break;
    }
    case "setParam": {
      (state.params as unknown as Record<string, unknown>)[op.args.key] = op.args.value;
      break;
    }
    case "run": {
      const grid = makeGrid(state.params.gridN);
      runSteps(state.particles, grid, state.params, op.args.steps);
      break;
    }
    case "freeze": {
      state.frozen.push(op.args.balls.map((b) => ({ ...b })));
      break;
    }
    case "clear": {
      state.sourceBalls = [];
      state.particles = [];
      state.frozen = [];
      break;
    }
  }
}

export function replay(entries: MpmHistoryEntry[]): MpmState {
  resetBallIdCounter(1);
  const state = createEmptyState();
  for (const entry of entries) applyEntry(state, entry);
  return state;
}

export function serializeRecipe(entries: MpmHistoryEntry[]): string {
  const recipe: MpmRecipe = { formatVersion: 1, studyId: "mpm", exportedAt: new Date().toISOString(), entries };
  return JSON.stringify(recipe, null, 2);
}

export function parseRecipe(text: string): MpmHistoryEntry[] {
  const data = JSON.parse(text) as Partial<MpmRecipe> | MpmHistoryEntry[];
  if (Array.isArray(data)) return data as MpmHistoryEntry[];
  if (data && Array.isArray(data.entries)) return data.entries;
  throw new Error("認識できないレシピ形式です（entries 配列が見つかりません）");
}

/** Export the latest frozen result in S1's own recipe format (a single `grow`-free ball dump, read back in as a bare addBall sequence — S1's parseRecipe accepts a bare entries array, and addBall is the simplest legal S1 op per ball). */
export function serializeFrozenAsS1Recipe(balls: Ball[]): string {
  const entries = [
    { t: Date.now(), op: "clear", args: {} },
    ...balls.map((b) => ({ t: Date.now(), op: "addBall", args: { id: b.id, x: b.x, y: b.y, z: b.z, r: b.r } })),
  ];
  return JSON.stringify({ formatVersion: 1, studyId: "cloud-sculpt", exportedAt: new Date().toISOString(), entries }, null, 2);
}
