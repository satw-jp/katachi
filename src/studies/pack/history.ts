// ---------------------------------------------------------------------------
// S-pack's own operation history ("正本 = 場＋手の履歴", RESEARCH.md §3/§5),
// self-contained for this Study (studyId "pack") — mirrors foam/history.ts's
// pattern of importing cloud-sculpt's field/history machinery instead of
// copying it, but keeps an entirely separate recipe format.
//
// **This Study is the first to extend the 正本's vocabulary** (T9 §4): S1's
// recipe format has no way to express a void. So `pack`'s recipe is its own
// shape (studyId "pack", host balls + void UNITS + pack params, T14: units
// replace the flat void-ball list) rather than something that can round-trip
// through S1's serializeRecipe. S1 recipes can still be *read* two ways:
//  - as a HOST source (loadHostFromS1Recipe, unchanged from T9/T13) — replay
//    it with S1's own replay(), record the ball list as one entry.
//  - T14 §2: as a registered CLOUD PROTOTYPE ("単位として S1 レシピを読み込
//    む") — same replay machinery, but the result is registered as a unit
//    origin shape instead of becoming the host.
//
// `packUnits` carries its RESULTING unit list explicitly in its args (T9 §2 /
// T14: "詰める op は結果（各単位の球リストと単位境界）を引数に持つ現行の
// 流儀を維持" — same principle as mpm's `freeze`/`seedMesh`: replay never
// re-runs the greedy RNG walk to reproduce a pack, it just re-applies the
// recorded list, so 正本 reproduction does not depend on the packing
// algorithm being deterministic forever, only on this op's own args being
// replayed faithfully). `addUnit`/`removeUnit` (T14, replacing `addVoid`/
// `removeVoid`) follow the same discipline: manual placement stores the
// concrete generated PackUnit, not a seed to regenerate it from.
// ---------------------------------------------------------------------------

import type { Ball, FieldParams } from "../cloud-sculpt/field.ts";
import { DEFAULT_FIELD_PARAMS, growBalls, resetBallIdCounter } from "../cloud-sculpt/field.ts";
import type { HistoryEntry as S1HistoryEntry } from "../cloud-sculpt/history.ts";
import { parseRecipe as parseS1Recipe, replay as replayS1 } from "../cloud-sculpt/history.ts";
import type { CloudPrototype, PackMode, PackParams, PackUnit } from "./field.ts";
import { DEFAULT_PACK_PARAMS, computePrototypeFromBalls, resetUnitIdCounter, resetVoidIdCounter } from "./field.ts";

export type PackOp =
  | { op: "growHost"; args: { params: FieldParams } }
  | { op: "setHostParam"; args: { key: keyof FieldParams; value: number | string } }
  | { op: "loadHostFromS1Recipe"; args: { balls: Ball[]; params: FieldParams; source?: string } }
  // T15: value widened to include boolean (gridStagger/gridAlternate) and
  // string (gridAxis/placementMode use string-union types, same as before).
  | { op: "setPackParam"; args: { key: keyof PackParams; value: number | string | boolean } }
  // T14 (replaces T9/T13's packVoids/addVoid/removeVoid): results are now
  // UNIT lists/single units, not bare balls — see file header.
  | { op: "packUnits"; args: { units: PackUnit[] } }
  | { op: "addUnit"; args: { unit: PackUnit } }
  | { op: "removeUnit"; args: { id: number } }
  // T14 §2: registers a unit origin shape read from an S1 recipe. Replaying
  // this just re-registers the same prototype (order affects only FUTURE
  // packing after replay, never the replayed packUnits results themselves,
  // since those already carry their concrete unit data).
  | { op: "loadCloudPrototype"; args: { balls: Ball[]; k: number; source?: string } }
  | { op: "clearVoids"; args: Record<string, never> }
  // T13 §1: "地と図の反転" is its own op (not folded into packParams), same
  // reasoning as skin/history.ts's setMode — flipping it doesn't touch the
  // packing at all, but it IS part of what完了条件5 asks history export/
  // import to reproduce faithfully.
  | { op: "setMode"; args: { mode: PackMode } }
  | { op: "clearAll"; args: Record<string, never> };

export interface PackHistoryEntry {
  t: number;
  op: PackOp["op"];
  args: PackOp["args"];
}

export interface PackRecipe {
  formatVersion: 1;
  studyId: "pack";
  exportedAt: string;
  entries: PackHistoryEntry[];
}

export interface PackState {
  host: Ball[];
  hostParams: FieldParams;
  /** T14: replaces the flat `voids: Ball[]` — each entry now owns a GROUP of
   * balls plus its own circumscribing sphere and local blend k. */
  units: PackUnit[];
  packParams: PackParams;
  mode: PackMode;
  /** T14 §2: registered unit origin shapes, read from S1 recipes. Not reset
   * by clearAll (a "library" the author built up, not scene state) — same
   * convention as hostParams surviving clearAll in T9. */
  cloudPrototypes: CloudPrototype[];
}

export function createEmptyState(): PackState {
  return {
    host: [],
    hostParams: { ...DEFAULT_FIELD_PARAMS },
    units: [],
    packParams: { ...DEFAULT_PACK_PARAMS },
    mode: "carve",
    cloudPrototypes: [],
  };
}

export function record(
  history: PackHistoryEntry[],
  state: PackState,
  op: PackOp["op"],
  args: PackOp["args"],
): PackHistoryEntry {
  const entry: PackHistoryEntry = { t: Date.now(), op, args } as PackHistoryEntry;
  history.push(entry);
  applyEntry(state, entry);
  return entry;
}

export function applyEntry(state: PackState, entry: PackHistoryEntry): void {
  const op = entry as PackOp;
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
    case "setPackParam": {
      (state.packParams as unknown as Record<string, unknown>)[op.args.key] = op.args.value;
      break;
    }
    case "packUnits": {
      state.units = op.args.units.map((u) => ({
        ...u,
        center: { ...u.center },
        balls: u.balls.map((b) => ({ ...b })),
        normal: u.normal ? { ...u.normal } : undefined,
      }));
      break;
    }
    case "addUnit": {
      const u = op.args.unit;
      state.units.push({ ...u, center: { ...u.center }, balls: u.balls.map((b) => ({ ...b })), normal: u.normal ? { ...u.normal } : undefined });
      break;
    }
    case "removeUnit": {
      const { id } = op.args;
      state.units = state.units.filter((u) => u.id !== id);
      break;
    }
    case "loadCloudPrototype": {
      state.cloudPrototypes.push(computePrototypeFromBalls(op.args.balls, op.args.k, op.args.source));
      break;
    }
    case "clearVoids": {
      state.units = [];
      break;
    }
    case "setMode": {
      state.mode = op.args.mode;
      break;
    }
    case "clearAll": {
      state.host = [];
      state.units = [];
      break;
    }
  }
}

/**
 * Replay a full entry list from scratch. Both id counters (host balls, via
 * cloud-sculpt's shared counter; void balls AND units, via this Study's own)
 * are reset first and resynced afterward, mirroring cloud-sculpt/history.ts's
 * replay.
 */
export function replay(entries: PackHistoryEntry[]): PackState {
  resetBallIdCounter(1);
  resetVoidIdCounter(1);
  resetUnitIdCounter(1);
  const state = createEmptyState();
  for (const entry of entries) applyEntry(state, entry);
  const maxHostId = state.host.reduce((m, b) => Math.max(m, b.id), 0);
  resetBallIdCounter(maxHostId + 1);
  let maxVoidId = 0;
  let maxUnitId = 0;
  for (const u of state.units) {
    maxUnitId = Math.max(maxUnitId, u.id);
    for (const b of u.balls) maxVoidId = Math.max(maxVoidId, b.id);
  }
  resetVoidIdCounter(maxVoidId + 1);
  resetUnitIdCounter(maxUnitId + 1);
  return state;
}

export function serializeRecipe(entries: PackHistoryEntry[]): string {
  const recipe: PackRecipe = {
    formatVersion: 1,
    studyId: "pack",
    exportedAt: new Date().toISOString(),
    entries,
  };
  return JSON.stringify(recipe, null, 2);
}

export function parseRecipe(text: string): PackHistoryEntry[] {
  const data = JSON.parse(text) as Partial<PackRecipe> | PackHistoryEntry[];
  if (Array.isArray(data)) return data as PackHistoryEntry[];
  if (data && Array.isArray(data.entries)) return data.entries;
  throw new Error("認識できないレシピ形式です（entries 配列が見つかりません）");
}

/**
 * Read an S1 (cloud-sculpt) recipe JSON as a HOST source: replay it with
 * S1's own replay() (imported, not reimplemented) and return the ball list
 * it produces. The caller records this as a single loadHostFromS1Recipe
 * entry, same principle as foam's loadFromS1Recipe.
 */
export function loadHostFromS1Recipe(text: string): { balls: Ball[]; params: FieldParams } {
  const entries: S1HistoryEntry[] = parseS1Recipe(text);
  const s1State = replayS1(entries);
  return { balls: s1State.balls.map((b) => ({ ...b })), params: { ...s1State.params } };
}

/**
 * T14 §2: read an S1 recipe as a unit ORIGIN SHAPE (詰め材) instead of a
 * host. Same replay machinery as loadHostFromS1Recipe (S1's own replay(),
 * not reimplemented) — the caller records a loadCloudPrototype entry with
 * the raw balls+k; computePrototypeFromBalls (bounding-sphere normalization)
 * runs again on every replay/apply rather than being baked into the stored
 * entry, keeping the recipe format's stored data minimal (same "raw balls,
 * derive the rest" precedent loadHostFromS1Recipe already set).
 */
export function loadCloudPrototypeFromS1Recipe(text: string): { balls: Ball[]; k: number } {
  const entries: S1HistoryEntry[] = parseS1Recipe(text);
  const s1State = replayS1(entries);
  if (s1State.balls.length === 0) throw new Error("S1 レシピに球が含まれていません（原型にできません）");
  return { balls: s1State.balls.map((b) => ({ ...b })), k: s1State.params.k };
}
