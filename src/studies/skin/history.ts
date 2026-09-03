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
import { currentBallIdCounter, DEFAULT_FIELD_PARAMS, growBalls, resetBallIdCounter } from "../cloud-sculpt/field.ts";

/** Preserve the v0.48 SKIN opening host without changing S1 current defaults. */
export const DEFAULT_SKIN_HOST_PARAMS: FieldParams = { ...DEFAULT_FIELD_PARAMS, seed: "katachi" };
import type { HistoryEntry as S1HistoryEntry } from "../cloud-sculpt/history.ts";
import { parseRecipe as parseS1Recipe, replay as replayS1 } from "../cloud-sculpt/history.ts";
import type { MotifShapeParams, Patch, SkinMode, SkinParams } from "./field.ts";
import { currentPatchIdCounter, DEFAULT_SKIN_PARAMS, resetPatchIdCounter } from "./field.ts";
import { editEligibility, isPatchEditIntent, isValidReplacementPatch, samePatchStructure, type PatchEditIntent } from "./elementTransform.ts";
import {
  pruneAnnotations,
  updateAnnotation,
  type ElementAnnotation,
  type ElementAnnotationValue,
  type SurfaceElementReference,
} from "../../lib/elementAnnotations.ts";

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

export interface NPartitionSelection {
  groups: number[][];
  seedIds: number[];
  adjacencyThreshold: number;
  confirmedAt: string;
}

export type SkinOp =
  | { op: "growHost"; args: { params: FieldParams } }
  | { op: "setHostParam"; args: { key: keyof FieldParams; value: number | string } }
  | { op: "loadHostFromS1Recipe"; args: { balls: Ball[]; params: FieldParams; source?: string } }
  | { op: "setSkinParam"; args: { key: keyof SkinParams; value: number | string | boolean } }
  | { op: "packPatches"; args: { patches: Patch[]; /** Missing in legacy recipes means a new set. */ identity?: "replace" | "preserve" } }
  | { op: "applySurfacePreset"; args: { presetId: "dense-flower-v6-style"; params: SkinParams; patches: Patch[] } }
  | { op: "addPatch"; args: { patch: Patch } }
  | { op: "removePatch"; args: { id: number } }
  /** Realized author edit. Replay replaces this exact result; it never
   * re-projects or re-runs the transform. */
  | { op: "editPatch"; args: { patch: Patch; intent: PatchEditIntent } }
  | { op: "reshapePatch"; args: { patch: Patch; params: MotifShapeParams } }
  | { op: "clearPatches"; args: Record<string, never> }
  | { op: "setMode"; args: { mode: SkinMode } }
  | { op: "confirmPartition"; args: { selection: PartitionSelection } }
  | { op: "confirmNPartition"; args: { selection: NPartitionSelection } }
  | { op: "clearPartition"; args: Record<string, never> }
  | { op: "setAnnotation"; args: { reference: SurfaceElementReference; value: ElementAnnotationValue } }
  | { op: "removeAnnotation"; args: { reference: SurfaceElementReference } }
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
  /** Generation-native 2..6 group plan. Kept separate from legacy A/B so
   * old recipes and the audited A/B export gate remain replay-compatible. */
  nPartition: NPartitionSelection | null;
  /** Monotonic scope for Patch IDs.  IDs can restart after a full pack. */
  patchSetRevision: number;
  annotations: ElementAnnotation[];
}

const MOTIF_PARAM_KEYS: Array<keyof MotifShapeParams> = [
  "irregularity", "coinHoleRatio", "flatRingHoleRatio", "ringNodeCount", "ringTubeR", "ringWobbleR", "ringWobblePos",
  "flowerMotifPreset", "flowerPetalCount", "flowerShowCore", "flowerOpening", "flowerNeck", "flowerCoreSize",
  "flowerCupping", "flowerCoreLift", "flowerGrowthDifference", "flowerExpansion",
];

function validMotifParams(value: unknown): value is MotifShapeParams {
  if (!value || typeof value !== "object") return false;
  const params = value as Partial<MotifShapeParams>;
  return Number.isFinite(params.irregularity) &&
    (params.coinHoleRatio === undefined || Number.isFinite(params.coinHoleRatio)) &&
    Number.isFinite(params.flatRingHoleRatio) &&
    Number.isFinite(params.ringNodeCount) &&
    Number.isFinite(params.ringTubeR) &&
    Number.isFinite(params.ringWobbleR) &&
    Number.isFinite(params.ringWobblePos) &&
    typeof params.flowerMotifPreset === "string" &&
    Number.isFinite(params.flowerPetalCount) &&
    typeof params.flowerShowCore === "boolean" &&
    Number.isFinite(params.flowerOpening) &&
    Number.isFinite(params.flowerNeck) &&
    Number.isFinite(params.flowerCoreSize) &&
    Number.isFinite(params.flowerCupping) &&
    Number.isFinite(params.flowerCoreLift) &&
    Number.isFinite(params.flowerGrowthDifference) &&
    Number.isFinite(params.flowerExpansion);
}

function sameMotifParams(a: MotifShapeParams | undefined, b: MotifShapeParams): boolean {
  return !!a && MOTIF_PARAM_KEYS.every((key) => key === "coinHoleRatio"
    ? (a.coinHoleRatio ?? 0) === (b.coinHoleRatio ?? 0)
    : a[key] === b[key]);
}

function hasRelationalPoints(patch: Patch): boolean {
  return patch.points.some((point) => point.role === "bridge" || point.role === "surfaceConnector");
}

export function createEmptyState(): SkinState {
  return {
    host: [],
    hostParams: { ...DEFAULT_SKIN_HOST_PARAMS },
    patches: [],
    skinParams: { ...DEFAULT_SKIN_PARAMS },
    mode: "plate",
    partition: null,
    nPartition: null,
    patchSetRevision: 0,
    annotations: [],
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
      state.partition = null;
      state.nPartition = null;
      break;
    }
    case "setHostParam": {
      (state.hostParams as unknown as Record<string, unknown>)[op.args.key] = op.args.value;
      // `k` changes the current host field immediately; the other controls
      // are followed by growHost. In both cases an earlier physical split no
      // longer belongs to the current host.
      state.partition = null;
      state.nPartition = null;
      break;
    }
    case "loadHostFromS1Recipe": {
      state.hostParams = { ...op.args.params };
      state.host = op.args.balls.map((b) => ({ ...b }));
      state.partition = null;
      state.nPartition = null;
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
        ...(p.motifPlacement !== undefined ? { motifPlacement: p.motifPlacement } : {}),
        ...(p.ringDiameter !== undefined ? { ringDiameter: p.ringDiameter } : {}),
        quadCellId: p.quadCellId,
        surfaceCellId: p.surfaceCellId,
        surfaceCellKind: p.surfaceCellKind,
        motifParams: p.motifParams ? { ...p.motifParams } : undefined,
        points: p.points.map((pt) => ({ ...pt })),
      }));
      state.partition = null;
      state.nPartition = null;
      if (op.args.identity !== "preserve") {
        state.patchSetRevision += 1;
        state.annotations = [];
      } else {
        const existing = new Set(state.patches.map((patch) => patch.id));
        state.annotations = pruneAnnotations(state.annotations, (reference) =>
          reference.domain !== "surface" || (reference.setRevision === state.patchSetRevision && existing.has(reference.patchId)),
        );
      }
      break;
    }
    case "applySurfacePreset": {
      // Older preset entries predate newer global shape controls. Merge
      // defaults first so their absent keys replay as the historical value.
      state.skinParams = { ...DEFAULT_SKIN_PARAMS, ...op.args.params };
      state.patches = op.args.patches.map((patch) => ({
        ...patch,
        motifParams: patch.motifParams ? { ...patch.motifParams } : undefined,
        points: patch.points.map((point) => ({ ...point })),
      }));
      state.partition = null;
      state.nPartition = null;
      state.patchSetRevision += 1;
      state.annotations = [];
      break;
    }
    case "addPatch": {
      const p = op.args.patch;
      state.patches.push({
        id: p.id,
        shape: p.shape ?? "coin",
        ...(p.motifPlacement !== undefined ? { motifPlacement: p.motifPlacement } : {}),
        ...(p.ringDiameter !== undefined ? { ringDiameter: p.ringDiameter } : {}),
        quadCellId: p.quadCellId,
        surfaceCellId: p.surfaceCellId,
        surfaceCellKind: p.surfaceCellKind,
        motifParams: p.motifParams ? { ...p.motifParams } : undefined,
        points: p.points.map((pt) => ({ ...pt })),
      });
      state.partition = null;
      state.nPartition = null;
      break;
    }
    case "reshapePatch": {
      const replacement = op.args.patch;
      const index = state.patches.findIndex((patch) => patch.id === replacement.id);
      if (
        index < 0 ||
        replacement.shape !== state.patches[index].shape ||
        replacement.quadCellId !== state.patches[index].quadCellId ||
        replacement.surfaceCellId !== state.patches[index].surfaceCellId ||
        replacement.surfaceCellKind !== state.patches[index].surfaceCellKind ||
        !isValidReplacementPatch(replacement) ||
        !validMotifParams(op.args.params) ||
        !sameMotifParams(replacement.motifParams, op.args.params) ||
        hasRelationalPoints(state.patches[index]) ||
        hasRelationalPoints(replacement) ||
        (replacement.shape === "flower" && state.patches.some((patch) =>
          patch.shape === "flower" && patch.points.some((point) => point.role === "bridge"),
        ))
      ) break;
      state.patches[index] = {
        ...replacement,
        motifParams: { ...op.args.params },
        points: replacement.points.map((point) => ({ ...point })),
      };
      state.partition = null;
      state.nPartition = null;
      break;
    }
    case "removePatch": {
      const { id } = op.args;
      state.patches = state.patches.filter((p) => p.id !== id);
      state.annotations = pruneAnnotations(state.annotations, (reference) =>
        reference.domain !== "surface" || reference.patchId !== id || reference.setRevision !== state.patchSetRevision,
      );
      state.partition = null;
      state.nPartition = null;
      break;
    }
    case "editPatch": {
      const replacement = op.args.patch;
      const index = state.patches.findIndex((patch) => patch.id === replacement.id);
      if (
        index < 0 ||
        !isPatchEditIntent(op.args.intent) ||
        !isValidReplacementPatch(replacement) ||
        !samePatchStructure(state.patches[index], replacement) ||
        !editEligibility(state.patches, replacement.id).ok
      ) break;
      state.patches[index] = {
        ...replacement,
        points: replacement.points.map((point) => ({ ...point })),
      };
      // Identity and review annotations intentionally survive a local edit,
      // while any physical split no longer describes the altered geometry.
      state.partition = null;
      state.nPartition = null;
      break;
    }
    case "clearPatches": {
      state.patches = [];
      state.patchSetRevision += 1;
      state.annotations = [];
      state.partition = null;
      state.nPartition = null;
      break;
    }
    case "setMode": {
      state.mode = op.args.mode;
      break;
    }
    case "confirmPartition": {
      const s = op.args.selection;
      state.nPartition = null;
      state.partition = {
        groupA: [...s.groupA],
        groupB: [...s.groupB],
        seedIds: [...s.seedIds],
        adjacencyThreshold: s.adjacencyThreshold,
        confirmedAt: s.confirmedAt,
      };
      break;
    }
    case "confirmNPartition": {
      const selection = op.args.selection;
      state.partition = null;
      state.nPartition = {
        groups: selection.groups.map((group) => [...group]),
        seedIds: [...selection.seedIds],
        adjacencyThreshold: selection.adjacencyThreshold,
        confirmedAt: selection.confirmedAt,
      };
      break;
    }
    case "clearPartition": {
      state.partition = null;
      state.nPartition = null;
      break;
    }
    case "setAnnotation": {
      const { reference, value } = op.args;
      const exists = state.patches.some((patch) => patch.id === reference.patchId);
      if (reference.setRevision === state.patchSetRevision && exists) {
        state.annotations = updateAnnotation(state.annotations, reference, value);
      }
      break;
    }
    case "removeAnnotation": {
      const { reference } = op.args;
      state.annotations = state.annotations.filter((annotation) =>
        annotation.reference.domain !== "surface" ||
        annotation.reference.setRevision !== reference.setRevision ||
        annotation.reference.patchId !== reference.patchId,
      );
      break;
    }
    case "clearAll": {
      state.host = [];
      state.patches = [];
      state.partition = null;
      state.nPartition = null;
      state.patchSetRevision += 1;
      state.annotations = [];
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

/**
 * Restore-plan replay. The production replay contract owns the shared id
 * counters, so planning snapshots and restores them around the exact same
 * replay instead of introducing a second replay implementation.
 */
export function replayDetached(entries: SkinHistoryEntry[]): SkinState {
  const ballCounter = currentBallIdCounter();
  const patchCounter = currentPatchIdCounter();
  try {
    return replay(entries);
  } finally {
    resetBallIdCounter(ballCounter);
    resetPatchIdCounter(patchCounter);
  }
}

/** Commit the id-counter portion of an already validated replay. */
export function syncReplayIdCounters(state: SkinState): void {
  resetBallIdCounter(state.host.reduce((maximum, ball) => Math.max(maximum, ball.id), 0) + 1);
  resetPatchIdCounter(state.patches.reduce((maximum, patch) => Math.max(maximum, patch.id), 0) + 1);
}

export interface UndoHistoryResult {
  history: SkinHistoryEntry[];
  state: SkinState;
  undone: SkinHistoryEntry | null;
}

export interface RedoHistoryResult {
  history: SkinHistoryEntry[];
  state: SkinState;
}

/**
 * Return a replayed copy with the most recent author operation removed.
 *
 * S-skin starts with one `growHost` entry so the page has a visible base
 * form. That baseline is deliberately retained: after the first surface
 * packing, one undo returns to the host-only state instead of an empty,
 * confusing canvas. The input array is never mutated.
 */
export function undoLastHistoryEntry(entries: SkinHistoryEntry[]): UndoHistoryResult {
  if (entries.length <= 1) {
    const history = [...entries];
    return { history, state: replay(history), undone: null };
  }
  const history = entries.slice(0, -1);
  return {
    history,
    state: replay(history),
    undone: entries[entries.length - 1] ?? null,
  };
}

/** Reapply one previously undone authoring operation without mutating input. */
export function redoHistoryEntry(entries: SkinHistoryEntry[], entry: SkinHistoryEntry): RedoHistoryResult {
  const history = [...entries, entry];
  return { history, state: replay(history) };
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
