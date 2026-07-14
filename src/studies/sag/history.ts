// ---------------------------------------------------------------------------
// S2b's operation history. Same backbone as S1/S2 (正本 = 場＋手の履歴),
// with SagParams (FieldParams + softness) in place of FieldParams. The
// deformed (sagged) shape is NEVER recorded here — only the rest shape and
// the knob turns that produced it (T2b-sag.md §1, "一番大事な設計の線").
// The deformed positions are always re-derived by deform.ts from
// {balls, params.softness} — a pure function, so replay + recompute
// reproduces the same sag every time.
//
// T2c-liquid-freeze.md §2 adds ONE exception to "deformed is never in the
// history": `freeze`. It still doesn't store the deformed shape as data —
// it stores the INTENT ("bake whatever the current deform resolves to, then
// zero softness") and re-derives the actual coordinates via computeDeform
// every time it's applied (grow, live edit, or replay). Because
// computeDeform is a pure function of (state.balls, state.params.softness)
// at the moment `freeze` runs, and replay always rebuilds state
// deterministically up to that point, replaying a history containing
// `freeze` always bakes the same coordinates (T2c-liquid-freeze.md §2
// "replay 決定性" — the same principle as snapToGround-style ops elsewhere
// in the project: the op is a deterministic recipe step, not a snapshot).
// ---------------------------------------------------------------------------

import type { Ball } from "../cloud-sculpt/field.ts";
import { growBalls, resetBallIdCounter } from "../cloud-sculpt/field.ts";
import { computeDeform } from "./deform.ts";
import type { SagParams } from "./params.ts";
import { DEFAULT_SAG_PARAMS } from "./params.ts";

export type Op =
  | { op: "grow"; args: { params: SagParams } }
  | { op: "setParam"; args: { key: keyof SagParams; value: number | string } }
  | { op: "addBall"; args: { id: number; x: number; y: number; z: number; r: number } }
  | { op: "removeBall"; args: { id: number } }
  | { op: "moveBall"; args: { id: number; x: number; y: number; z: number } }
  | { op: "setBallRadius"; args: { id: number; r: number } }
  | { op: "clear"; args: Record<string, never> }
  | { op: "freeze"; args: Record<string, never> };

export interface HistoryEntry {
  t: number;
  op: Op["op"];
  args: Op["args"];
}

export interface Recipe {
  formatVersion: 1;
  studyId: "sag";
  exportedAt: string;
  entries: HistoryEntry[];
}

/** Rest state derived by replaying (or live-applying) the history. The 正本 — sag is never part of it. */
export interface SagState {
  balls: Ball[];
  params: SagParams;
}

export function createEmptyState(): SagState {
  return { balls: [], params: { ...DEFAULT_SAG_PARAMS } };
}

export function record(
  history: HistoryEntry[],
  state: SagState,
  op: Op["op"],
  args: Op["args"],
): HistoryEntry {
  const entry: HistoryEntry = { t: Date.now(), op, args } as HistoryEntry;
  history.push(entry);
  applyEntry(state, entry);
  return entry;
}

export function applyEntry(state: SagState, entry: HistoryEntry): void {
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
    case "freeze": {
      // Bake the current deform into the rest shape (導出物が正本に昇格する,
      // T2c-liquid-freeze.md §2), then zero softness — the frozen shape is
      // now itself a rest shape that owes nothing to any force ("固体 =
      // どの力にももう従わない"). computeDeform bypasses simulation entirely
      // at softness=0 (deform.ts), so immediately after this the deformed
      // and rest shapes are trivially identical — that identity IS the
      // ghost-matches-body check (completion condition 4).
      const result = computeDeform(state.balls, state.params.softness);
      state.balls = result.balls.map((b) => ({ ...b }));
      state.params = { ...state.params, softness: 0 };
      break;
    }
  }
}

export function replay(entries: HistoryEntry[]): SagState {
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
    studyId: "sag",
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
