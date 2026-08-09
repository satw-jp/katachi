// ---------------------------------------------------------------------------
// S-skin's own operation history ("正本 = 場＋手の履歴"), self-contained
// (studyId "skin") -- mirrors pack/history.ts's pattern: import cloud-
// sculpt's host machinery instead of copying it, keep an entirely separate
// recipe format (patches have no representation in S1's or pack's recipes).
//
// `packPatches` carries the RESULTING patch list explicitly in its args
// (T10 §2: "op packPatches は結果（アンカー・副点・サイズ）を引数に持つ" --
// same principle as pack's packVoids / mpm's freeze: replay never re-runs
// the greedy RNG walk, it just re-applies the recorded list).
//
// `setMode` is its own op (not folded into skinParams) so that switching
// between "プレートが実" and "形態が実" is itself part of the recorded
// history and survives export -> import, even though flipping it doesn't
// touch the packing at all -- T10 完了条件5 asks for full reproduction via
// history, and the mode toggle is the one piece of UI state this Study's
// "眼目" hinges on.
// ---------------------------------------------------------------------------

import type { Ball, FieldParams } from "../cloud-sculpt/field.ts";
import { DEFAULT_FIELD_PARAMS, growBalls, resetBallIdCounter } from "../cloud-sculpt/field.ts";
import type { HistoryEntry as S1HistoryEntry } from "../cloud-sculpt/history.ts";
import { parseRecipe as parseS1Recipe, replay as replayS1 } from "../cloud-sculpt/history.ts";
import type { Patch, SkinMode, SkinParams } from "./field.ts";
import { DEFAULT_SKIN_PARAMS, resetPatchIdCounter } from "./field.ts";

/** T13 "coin由来A/B分割": author-confirmed patch grouping. Carries the FULL
 * A/B Patch id lists (not just the seeds) so replay reproduces the exact
 * same split without re-running proposeGroupsFromSeeds -- seedIds and
 * adjacencyThreshold are kept alongside purely as a record of how the
 * author arrived at this grouping (instruction §6 "作者確定"), not as
 * inputs replay depends on. */
export interface PartitionSelection {
  groupA: number[];
  groupB: number[];
  seedIds: number[];
  adjacencyThreshold: number;
  confirmedAt: string;
}

export type SkinOp =
  | { op: "growHost"; args: { params: FieldParams } }
  | { op: "setHostParam"; args: { key: keyof FieldParams; value: number | string } }
  | { op: "loadHostFromS1Recipe"; args: { balls: Ball[]; params: FieldParams; source?: string } }
  | { op: "setSkinParam"; args: { key: keyof SkinParams; value: number | string } }
  | { op: "packPatches"; args: { patches: Patch[] } }
  | { op: "addPatch"; args: { patch: Patch } }
  | { op: "removePatch"; args: { id: number } }
  | { op: "clearPatches"; args: Record<string, never> }
  | { op: "setMode"; args: { mode: SkinMode } }
  | { op: "confirmPartition"; args: { selection: PartitionSelection } }
  | { op: "clearPartition"; args: Record<string, never> }
  | { op: "clearAll"; args: Record<string, never> };

export interface SkinHistoryEntry {
  t: number;
  op: SkinOp["op"];
  args: SkinOp["args"];
}

export interface SkinRecipe {
  formatVersion: 1;
  studyId: "skin";
  exportedAt: string;
  entries: SkinHistoryEntry[];
}

export interface SkinState {
  host: Ball[];
  hostParams: FieldParams;
  patches: Patch[];
  skinParams: SkinParams;
  mode: SkinMode;
  /** T13: null until the author has confirmed an A/B grouping. Any patch
   * mutation (pack/add/remove/clear) invalidates a stale confirmation --
   * applyEntry clears it on those ops so a replayed recipe never shows a
   * confirmed split whose patch set has since changed. */
  partition: PartitionSelection | null;
}

export function createEmptyState(): SkinState {
  return {
    host: [],
    hostParams: { ...DEFAULT_FIELD_PARAMS },
    patches: [],
    skinParams: { ...DEFAULT_SKIN_PARAMS },
    mode: "plate",
    partition: null,
  };
}

export function record(
  history: SkinHistoryEntry[],
  state: SkinState,
  op: SkinOp["op"],
  args: SkinOp["args"],
): SkinHistoryEntry {
  const entry: SkinHistoryEntry = { t: Date.now(), op, args } as SkinHistoryEntry;
  history.push(entry);
  applyEntry(state, entry);
  return entry;
}

export function applyEntry(state: SkinState, entry: SkinHistoryEntry): void {
  const op = entry as SkinOp;
  switch (op.op) {
    case "growHost": {
      state.hostParams = { ...op.args.params };
      state.host = growBalls(state.hostParams);
      break;
    }
    case "setHostParam": {
      (state.hostParams as unknown as Record<string, unknown>)[op.args.key] = op.args.value;
      break;
    }
    case "loadHostFromS1Recipe": {
      state.hostParams = { ...op.args.params };
      state.host = op.args.balls.map((b) => ({ ...b }));
      break;
    }
    case "setSkinParam": {
      (state.skinParams as unknown as Record<string, unknown>)[op.args.key] = op.args.value;
      break;
    }
    case "packPatches": {
      // shape fallback (?? "coin") keeps pre-T11 recipes (recorded before
      // Patch had a `shape` field) replayable without change.
      state.patches = op.args.patches.map((p) => ({
        id: p.id,
        shape: p.shape ?? "coin",
        points: p.points.map((pt) => ({ ...pt })),
      }));
      state.partition = null;
      break;
    }
    case "addPatch": {
      const p = op.args.patch;
      state.patches.push({ id: p.id, shape: p.shape ?? "coin", points: p.points.map((pt) => ({ ...pt })) });
      state.partition = null;
      break;
    }
    case "removePatch": {
      const { id } = op.args;
      state.patches = state.patches.filter((p) => p.id !== id);
      state.partition = null;
      break;
    }
    case "clearPatches": {
      state.patches = [];
      state.partition = null;
      break;
    }
    case "setMode": {
      state.mode = op.args.mode;
      break;
    }
    case "confirmPartition": {
      const s = op.args.selection;
      state.partition = {
        groupA: [...s.groupA],
        groupB: [...s.groupB],
        seedIds: [...s.seedIds],
        adjacencyThreshold: s.adjacencyThreshold,
        confirmedAt: s.confirmedAt,
      };
      break;
    }
    case "clearPartition": {
      state.partition = null;
      break;
    }
    case "clearAll": {
      state.host = [];
      state.patches = [];
      state.partition = null;
      break;
    }
  }
}

/**
 * Replay a full entry list from scratch. Both id counters (host balls, via
 * cloud-sculpt's shared counter; patches, via this Study's own) are reset
 * first and resynced afterward, mirroring pack/history.ts's replay.
 */
export function replay(entries: SkinHistoryEntry[]): SkinState {
  resetBallIdCounter(1);
  resetPatchIdCounter(1);
  const state = createEmptyState();
  for (const entry of entries) applyEntry(state, entry);
  const maxHostId = state.host.reduce((m, b) => Math.max(m, b.id), 0);
  resetBallIdCounter(maxHostId + 1);
  const maxPatchId = state.patches.reduce((m, p) => Math.max(m, p.id), 0);
  resetPatchIdCounter(maxPatchId + 1);
  return state;
}

export function serializeRecipe(entries: SkinHistoryEntry[]): string {
  const recipe: SkinRecipe = {
    formatVersion: 1,
    studyId: "skin",
    exportedAt: new Date().toISOString(),
    entries,
  };
  return JSON.stringify(recipe, null, 2);
}

export function parseRecipe(text: string): SkinHistoryEntry[] {
  const data = JSON.parse(text) as Partial<SkinRecipe> | SkinHistoryEntry[];
  if (Array.isArray(data)) return data as SkinHistoryEntry[];
  if (data && Array.isArray(data.entries)) return data.entries;
  throw new Error("認識できないレシピ形式です（entries 配列が見つかりません）");
}

/**
 * Read an S1 (cloud-sculpt) recipe JSON as a HOST source: replay it with
 * S1's own replay() (imported, not reimplemented) and return the ball list
 * it produces. Same pattern as pack's loadHostFromS1Recipe / foam's
 * loadFromS1Recipe.
 */
export function loadHostFromS1Recipe(text: string): { balls: Ball[]; params: FieldParams } {
  const entries: S1HistoryEntry[] = parseS1Recipe(text);
  const s1State = replayS1(entries);
  return { balls: s1State.balls.map((b) => ({ ...b })), params: { ...s1State.params } };
}
