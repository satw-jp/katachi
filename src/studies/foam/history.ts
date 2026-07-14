// ---------------------------------------------------------------------------
// Foam's own operation history — "正本 = 場＋手の履歴" (RESEARCH.md §3, §5),
// self-contained for this Study. The underlying ball list is the same kind
// of object S1 uses (field.ts, imported not copied), but foam records its
// own {t, op, args} entries and its own recipe file (studyId "foam") so
// export -> reload -> import never depends on cloud-sculpt's op semantics.
//
// S1 recipes can still be *read*: loadFromS1Recipe() replays a cloud-sculpt
// recipe with cloud-sculpt's own replay() (imported, not reimplemented) and
// then records the resulting ball list here as a single "loadBalls" entry —
// so once loaded, foam's own history is the only thing that matters again.
// ---------------------------------------------------------------------------

import type { Ball, FieldParams } from "../cloud-sculpt/field.ts";
import { DEFAULT_FIELD_PARAMS, growBalls, resetBallIdCounter } from "../cloud-sculpt/field.ts";
import type { HistoryEntry as S1HistoryEntry } from "../cloud-sculpt/history.ts";
import { parseRecipe as parseS1Recipe, replay as replayS1 } from "../cloud-sculpt/history.ts";
import type { FoamParams } from "./cell.ts";
import { DEFAULT_FOAM_PARAMS } from "./cell.ts";

export type FoamOp =
  | { op: "grow"; args: { params: FieldParams } }
  | { op: "setFieldParam"; args: { key: keyof FieldParams; value: number | string } }
  | { op: "setFoamParam"; args: { key: keyof FoamParams; value: number } }
  | { op: "loadBalls"; args: { balls: Ball[]; params: FieldParams; source?: string } }
  | { op: "clear"; args: Record<string, never> };

export interface FoamHistoryEntry {
  t: number;
  op: FoamOp["op"];
  args: FoamOp["args"];
}

export interface FoamRecipe {
  formatVersion: 1;
  studyId: "foam";
  exportedAt: string;
  entries: FoamHistoryEntry[];
}

export interface FoamState {
  balls: Ball[];
  fieldParams: FieldParams;
  foamParams: FoamParams;
}

export function createEmptyFoamState(): FoamState {
  return {
    balls: [],
    fieldParams: { ...DEFAULT_FIELD_PARAMS },
    foamParams: { ...DEFAULT_FOAM_PARAMS },
  };
}

export function record(
  history: FoamHistoryEntry[],
  state: FoamState,
  op: FoamOp["op"],
  args: FoamOp["args"],
): FoamHistoryEntry {
  const entry: FoamHistoryEntry = { t: Date.now(), op, args } as FoamHistoryEntry;
  history.push(entry);
  applyFoamEntry(state, entry);
  return entry;
}

export function applyFoamEntry(state: FoamState, entry: FoamHistoryEntry): void {
  const op = entry as FoamOp;
  switch (op.op) {
    case "grow": {
      state.fieldParams = { ...op.args.params };
      state.balls = growBalls(state.fieldParams);
      break;
    }
    case "setFieldParam": {
      (state.fieldParams as unknown as Record<string, unknown>)[op.args.key] = op.args.value;
      break;
    }
    case "setFoamParam": {
      (state.foamParams as unknown as Record<string, unknown>)[op.args.key] = op.args.value;
      break;
    }
    case "loadBalls": {
      state.fieldParams = { ...op.args.params };
      state.balls = op.args.balls.map((b) => ({ ...b }));
      break;
    }
    case "clear": {
      state.balls = [];
      break;
    }
  }
}

export function replayFoam(entries: FoamHistoryEntry[]): FoamState {
  resetBallIdCounter(1);
  const state = createEmptyFoamState();
  for (const entry of entries) applyFoamEntry(state, entry);
  const maxId = state.balls.reduce((m, b) => Math.max(m, b.id), 0);
  resetBallIdCounter(maxId + 1);
  return state;
}

export function serializeFoamRecipe(entries: FoamHistoryEntry[]): string {
  const recipe: FoamRecipe = {
    formatVersion: 1,
    studyId: "foam",
    exportedAt: new Date().toISOString(),
    entries,
  };
  return JSON.stringify(recipe, null, 2);
}

export function parseFoamRecipe(text: string): FoamHistoryEntry[] {
  const data = JSON.parse(text) as Partial<FoamRecipe> | FoamHistoryEntry[];
  if (Array.isArray(data)) return data as FoamHistoryEntry[];
  if (data && Array.isArray(data.entries)) return data.entries;
  throw new Error("認識できないレシピ形式です（entries 配列が見つかりません）");
}

/**
 * Read an S1 (cloud-sculpt) recipe JSON, replay it with S1's own replay()
 * to get the ball list it produces, and fold that into a single foam
 * "loadBalls" entry. Balls only — S1's op-by-op history is not imported.
 */
export function loadFromS1Recipe(text: string): { balls: Ball[]; params: FieldParams } {
  const entries: S1HistoryEntry[] = parseS1Recipe(text);
  const s1State = replayS1(entries);
  return { balls: s1State.balls.map((b) => ({ ...b })), params: { ...s1State.params } };
}
