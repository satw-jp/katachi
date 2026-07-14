// ---------------------------------------------------------------------------
// S-rings' own operation history — "正本 = 場＋手の履歴" (RESEARCH.md §3, §5),
// self-contained for this Study (mirrors cloud-sculpt/history.ts and
// foam/history.ts's pattern). The underlying ball type is the shared
// field.ts Ball (imported, not copied); rings adds a "unit" layer of
// history ops (addRing/moveRing/rotateRing/duplicateRing/removeRing) on
// top, per T8 §2.
// ---------------------------------------------------------------------------

import type { Ball } from "../cloud-sculpt/field.ts";
import { freshBallId, resetBallIdCounter } from "../cloud-sculpt/field.ts";
import type { RingGroup, RingRecipe, Vec3 } from "./ring.ts";
import {
  DEFAULT_RING_RECIPE,
  generateRingBalls,
  resetRingIdCounter,
  rotatePoint,
  rotateVector,
  vAdd,
} from "./ring.ts";

export type RingOp =
  | { op: "addRing"; args: { ringId: number; recipe: RingRecipe } }
  | { op: "moveRing"; args: { ringId: number; dx: number; dy: number; dz: number } }
  | { op: "rotateRing"; args: { ringId: number; axis: Vec3; angle: number; pivot: Vec3 } }
  | { op: "duplicateRing"; args: { sourceRingId: number; newRingId: number; offset: Vec3 } }
  | { op: "removeRing"; args: { ringId: number } }
  | { op: "setK"; args: { value: number } }
  | { op: "clear"; args: Record<string, never> };

export interface RingHistoryEntry {
  t: number;
  op: RingOp["op"];
  args: RingOp["args"];
}

export interface RingsRecipeFile {
  formatVersion: 1;
  studyId: "rings";
  exportedAt: string;
  entries: RingHistoryEntry[];
}

/** In-memory state derived by replaying (or live-applying) the history. */
export interface RingsState {
  balls: Ball[];
  k: number;
  groups: RingGroup[];
}

export const DEFAULT_K = 0.35;

export function createEmptyRingsState(): RingsState {
  return { balls: [], k: DEFAULT_K, groups: [] };
}

export function record(
  history: RingHistoryEntry[],
  state: RingsState,
  op: RingOp["op"],
  args: RingOp["args"],
): RingHistoryEntry {
  const entry: RingHistoryEntry = { t: Date.now(), op, args } as RingHistoryEntry;
  history.push(entry);
  applyEntry(state, entry);
  return entry;
}

function ballMap(state: RingsState): Map<number, Ball> {
  const m = new Map<number, Ball>();
  for (const b of state.balls) m.set(b.id, b);
  return m;
}

export function applyEntry(state: RingsState, entry: RingHistoryEntry): void {
  const op = entry as RingOp;
  switch (op.op) {
    case "addRing": {
      const { ringId, recipe } = op.args;
      const newBalls = generateRingBalls(recipe);
      state.balls.push(...newBalls);
      state.groups.push({
        id: ringId,
        ballIds: newBalls.map((b) => b.id),
        center: { ...recipe.center },
        axis: { ...recipe.axis },
        recipe,
      });
      break;
    }
    case "moveRing": {
      const { ringId, dx, dy, dz } = op.args;
      const group = state.groups.find((g) => g.id === ringId);
      if (!group) break;
      const m = ballMap(state);
      for (const id of group.ballIds) {
        const b = m.get(id);
        if (b) {
          b.x += dx;
          b.y += dy;
          b.z += dz;
        }
      }
      group.center = vAdd(group.center, { x: dx, y: dy, z: dz });
      break;
    }
    case "rotateRing": {
      const { ringId, axis, angle, pivot } = op.args;
      const group = state.groups.find((g) => g.id === ringId);
      if (!group) break;
      const m = ballMap(state);
      for (const id of group.ballIds) {
        const b = m.get(id);
        if (b) {
          const p = rotatePoint({ x: b.x, y: b.y, z: b.z }, pivot, axis, angle);
          b.x = p.x;
          b.y = p.y;
          b.z = p.z;
        }
      }
      group.center = rotatePoint(group.center, pivot, axis, angle);
      // Axis is a direction, not a point: rotate it as a vector (no pivot).
      group.axis = rotateVector(group.axis, axis, angle);
      break;
    }
    case "duplicateRing": {
      const { sourceRingId, newRingId, offset } = op.args;
      const source = state.groups.find((g) => g.id === sourceRingId);
      if (!source) break;
      const m = ballMap(state);
      const newBallIds: number[] = [];
      for (const id of source.ballIds) {
        const b = m.get(id);
        if (!b) continue;
        const nb: Ball = {
          id: freshBallId(),
          x: b.x + offset.x,
          y: b.y + offset.y,
          z: b.z + offset.z,
          r: b.r,
        };
        state.balls.push(nb);
        newBallIds.push(nb.id);
      }
      state.groups.push({
        id: newRingId,
        ballIds: newBallIds,
        center: vAdd(source.center, offset),
        axis: { ...source.axis },
        recipe: { ...source.recipe, center: vAdd(source.recipe.center, offset) },
      });
      break;
    }
    case "removeRing": {
      const { ringId } = op.args;
      const group = state.groups.find((g) => g.id === ringId);
      if (!group) break;
      const removeIds = new Set(group.ballIds);
      state.balls = state.balls.filter((b) => !removeIds.has(b.id));
      state.groups = state.groups.filter((g) => g.id !== ringId);
      break;
    }
    case "setK": {
      state.k = op.args.value;
      break;
    }
    case "clear": {
      state.balls = [];
      state.groups = [];
      break;
    }
  }
}

/**
 * Replay a full entry list from scratch. Same contract as cloud-sculpt's
 * replay(): must not depend on anything other than what's in `entries`, so
 * export -> reload -> import reproduces the same shape and the same groups.
 */
export function replay(entries: RingHistoryEntry[]): RingsState {
  resetBallIdCounter(1);
  resetRingIdCounter(1);
  const state = createEmptyRingsState();
  for (const entry of entries) applyEntry(state, entry);
  const maxBallId = state.balls.reduce((m, b) => Math.max(m, b.id), 0);
  resetBallIdCounter(maxBallId + 1);
  const maxRingId = state.groups.reduce((m, g) => Math.max(m, g.id), 0);
  resetRingIdCounter(maxRingId + 1);
  return state;
}

export function serializeRecipe(entries: RingHistoryEntry[]): string {
  const recipe: RingsRecipeFile = {
    formatVersion: 1,
    studyId: "rings",
    exportedAt: new Date().toISOString(),
    entries,
  };
  return JSON.stringify(recipe, null, 2);
}

export function parseRecipe(text: string): RingHistoryEntry[] {
  const data = JSON.parse(text) as Partial<RingsRecipeFile> | RingHistoryEntry[];
  if (Array.isArray(data)) return data as RingHistoryEntry[];
  if (data && Array.isArray(data.entries)) return data.entries;
  throw new Error("認識できないレシピ形式です（entries 配列が見つかりません）");
}

export function nextDefaultRecipe(existingCount: number): RingRecipe {
  // Vary center/axis/seed a little per successive ring so "輪を追加" repeated
  // a few times doesn't stack rings exactly on top of each other.
  const angle = existingCount * 1.3;
  return {
    ...DEFAULT_RING_RECIPE,
    center: { x: Math.cos(angle) * 0.6 * existingCount, y: 0, z: Math.sin(angle) * 0.6 * existingCount },
    seed: `ring-${existingCount + 1}`,
  };
}
