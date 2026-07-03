// ---------------------------------------------------------------------------
// The operation history — "正本 = 場＋手の履歴" (RESEARCH.md §3, §5).
// Every knob turn and every hand-touch is appended here as {t, op, args}.
// The field state is never the source of truth by itself: replaying this
// list from an empty field must reproduce the same shape bit-for-bit.
// ---------------------------------------------------------------------------

import type { Ball, FieldParams } from "./field.ts";
import { DEFAULT_FIELD_PARAMS, growBalls, resetBallIdCounter } from "./field.ts";

export type Op =
  | { op: "grow"; args: { params: FieldParams } }
  | { op: "setParam"; args: { key: keyof FieldParams; value: number | string } }
  | { op: "addBall"; args: { id: number; x: number; y: number; z: number; r: number } }
  | { op: "removeBall"; args: { id: number } }
  | { op: "moveBall"; args: { id: number; x: number; y: number; z: number } }
  | { op: "clear"; args: Record<string, never> };

export interface HistoryEntry {
  t: number;
  op: Op["op"];
  args: Op["args"];
}

export interface Recipe {
  formatVersion: 1;
  studyId: "cloud-sculpt";
  exportedAt: string;
  entries: HistoryEntry[];
}

/** In-memory state derived by replaying (or live-applying) the history. */
export interface SculptState {
  balls: Ball[];
  params: FieldParams;
}

export function createEmptyState(): SculptState {
  return { balls: [], params: { ...DEFAULT_FIELD_PARAMS } };
}

/** Append one entry and apply it to `state` in place. Returns the new entry. */
export function record(
  history: HistoryEntry[],
  state: SculptState,
  op: Op["op"],
  args: Op["args"],
): HistoryEntry {
  const entry: HistoryEntry = { t: Date.now(), op, args } as HistoryEntry;
  history.push(entry);
  applyEntry(state, entry);
  return entry;
}

/** Apply a single history entry to a mutable state (used live and on replay). */
export function applyEntry(state: SculptState, entry: HistoryEntry): void {
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
    case "clear": {
      state.balls = [];
      break;
    }
  }
}

/**
 * Replay a full entry list from scratch. This is the function the
 * "export -> reload -> import -> same shape" guarantee rests on: it must
 * not depend on any state other than what's in `entries`.
 */
export function replay(entries: HistoryEntry[]): SculptState {
  resetBallIdCounter(1);
  const state = createEmptyState();
  for (const entry of entries) applyEntry(state, entry);
  // Ball ids in addBall entries are recorded explicitly, so re-sync the
  // counter to be above the highest id seen, in case sculpting continues
  // after an import.
  const maxId = state.balls.reduce((m, b) => Math.max(m, b.id), 0);
  resetBallIdCounter(maxId + 1);
  return state;
}

export function serializeRecipe(entries: HistoryEntry[]): string {
  const recipe: Recipe = {
    formatVersion: 1,
    studyId: "cloud-sculpt",
    exportedAt: new Date().toISOString(),
    entries,
  };
  return JSON.stringify(recipe, null, 2);
}

export function parseRecipe(text: string): HistoryEntry[] {
  const data = JSON.parse(text) as Partial<Recipe> | HistoryEntry[];
  // Accept either the wrapped {formatVersion, entries} object, or a bare
  // array of entries (the "素朴でよい" [{t, op, args}] form from the task doc).
  if (Array.isArray(data)) return data as HistoryEntry[];
  if (data && Array.isArray(data.entries)) return data.entries;
  throw new Error("認識できないレシピ形式です（entries 配列が見つかりません）");
}
