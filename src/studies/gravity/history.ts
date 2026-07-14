// ---------------------------------------------------------------------------
// S2's operation history. Same backbone as cloud-sculpt/history.ts (正本 =
// 場＋手の履歴), extended with one new op: snapToGround. The strain color is
// NOT recorded here — it is a pure derived view of the field (physics.ts),
// recomputed every frame from state.balls. Only hands touching the field are
// history (T2-gravity.md §4).
// ---------------------------------------------------------------------------

import type { Ball, FieldParams } from "../cloud-sculpt/field.ts";
import { DEFAULT_FIELD_PARAMS, growBalls, resetBallIdCounter } from "../cloud-sculpt/field.ts";

export type Op =
  | { op: "grow"; args: { params: FieldParams } }
  | { op: "setParam"; args: { key: keyof FieldParams; value: number | string } }
  | { op: "addBall"; args: { id: number; x: number; y: number; z: number; r: number } }
  | { op: "removeBall"; args: { id: number } }
  | { op: "moveBall"; args: { id: number; x: number; y: number; z: number } }
  | { op: "setBallRadius"; args: { id: number; r: number } }
  | { op: "clear"; args: Record<string, never> }
  // Snap the whole field down (or up) so its lowest point touches y=0.
  // No args: the shift is a deterministic function of the current balls,
  // so replay reproduces the same delta without needing to store it.
  | { op: "snapToGround"; args: Record<string, never> };

export interface HistoryEntry {
  t: number;
  op: Op["op"];
  args: Op["args"];
}

export interface Recipe {
  formatVersion: 1;
  studyId: "gravity";
  exportedAt: string;
  entries: HistoryEntry[];
}

export interface GravityState {
  balls: Ball[];
  params: FieldParams;
}

export function createEmptyState(): GravityState {
  return { balls: [], params: { ...DEFAULT_FIELD_PARAMS } };
}

export function record(
  history: HistoryEntry[],
  state: GravityState,
  op: Op["op"],
  args: Op["args"],
): HistoryEntry {
  const entry: HistoryEntry = { t: Date.now(), op, args } as HistoryEntry;
  history.push(entry);
  applyEntry(state, entry);
  return entry;
}

/** How far the field's lowest point (ball surface) sits below y=0 — negative means it's floating above. */
function lowestPoint(balls: Ball[]): number {
  let min = Infinity;
  for (const b of balls) min = Math.min(min, b.y - b.r);
  return balls.length === 0 ? 0 : min;
}

export function applyEntry(state: GravityState, entry: HistoryEntry): void {
  const op = entry as Op;
  switch (op.op) {
    case "grow": {
      state.params = { ...op.args.params };
      state.balls = growBalls(state.params);
      break;
    }
    case "setParam": {
      (state.params as unknown as Record<string, unknown>)[op.args.key] = op.args.value;
      break;
    }
    case "addBall": {
      const { id, x, y, z, r } = op.args;
      state.balls.push({ id, x, y, z, r });
      break;
    }
    case "removeBall": {
      const { id } = op.args;
      state.balls = state.balls.filter((b) => b.id !== id);
      break;
    }
    case "moveBall": {
      const { id, x, y, z } = op.args;
      const ball = state.balls.find((b) => b.id === id);
      if (ball) {
        ball.x = x;
        ball.y = y;
        ball.z = z;
      }
      break;
    }
    case "setBallRadius": {
      const { id, r } = op.args;
      const ball = state.balls.find((b) => b.id === id);
      if (ball) ball.r = Math.max(0.05, r);
      break;
    }
    case "clear": {
      state.balls = [];
      break;
    }
    case "snapToGround": {
      const delta = -lowestPoint(state.balls);
      for (const b of state.balls) b.y += delta;
      break;
    }
  }
}

export function replay(entries: HistoryEntry[]): GravityState {
  resetBallIdCounter(1);
  const state = createEmptyState();
  for (const entry of entries) applyEntry(state, entry);
  const maxId = state.balls.reduce((m, b) => Math.max(m, b.id), 0);
  resetBallIdCounter(maxId + 1);
  return state;
}

export function serializeRecipe(entries: HistoryEntry[]): string {
  const recipe: Recipe = {
    formatVersion: 1,
    studyId: "gravity",
    exportedAt: new Date().toISOString(),
    entries,
  };
  return JSON.stringify(recipe, null, 2);
}

export function parseRecipe(text: string): HistoryEntry[] {
  const data = JSON.parse(text) as Partial<Recipe> | HistoryEntry[];
  if (Array.isArray(data)) return data as HistoryEntry[];
  if (data && Array.isArray(data.entries)) return data.entries;
  throw new Error("認識できないレシピ形式です（entries 配列が見つかりません）");
}
