// ---------------------------------------------------------------------------
// Operation history for S-interior-growth — 正本 = 場＋手の履歴 (RESEARCH.md §3).
// Same precedent as S-pack's packVoids / S-skin's packPatches: the op that
// grows a batch of candidates carries the FULL result (all accepted/rejected
// units, edges, reason counts), so replay never re-runs the RNG walk.
//
// Stage 1A.1 (docs/sonnet-instruction-20260724-katachi-interior-growth-
// author-feedback.md §8): the FabricationEnvelope shape changed (angle-based,
// no more nullable lateral/span fields) and `targetLongestMm` was replaced by
// a printer preset + build-volume fit. `parseRecipe` migrates OLD Phase-1A
// recipes on the way in rather than breaking them — "旧Phase 1A recipeを
// 破壊しない". Migration never touches the input file on disk, only the
// in-memory entries this Study replays from.
// ---------------------------------------------------------------------------

import { recordHistoryEntry } from "../../lib/history.ts";
import { parseRecipeEntries, serializeRecipeEnvelope, type RecipeEnvelope } from "../../lib/recipe.ts";
import {
  DEFAULT_FABRICATION_ENVELOPE,
  DEFAULT_GROWTH_PARAMS,
  DEFAULT_PRINTER_PRESET_ID,
  computeDerivedLateralAllowance,
  findPrinterPreset,
  type FabricationEnvelope,
  type GrowthParams,
  type HostFixtureId,
  type PrinterPresetId,
  type Vec3,
} from "./field.ts";
import { computeAutoBudget, type GrowthResult } from "./growth.ts";

export type Op =
  | { op: "setHost"; args: { hostId: HostFixtureId } }
  | { op: "setEnvelope"; args: { envelope: FabricationEnvelope } }
  | { op: "setParams"; args: { params: GrowthParams } }
  | { op: "setPrinterPreset"; args: { printerPresetId: PrinterPresetId } }
  | { op: "setCustomBuildVolume"; args: { buildVolumeMm: Vec3 } }
  | { op: "generateCandidates"; args: { results: GrowthResult[] } }
  | { op: "clear"; args: Record<string, never> };

export interface HistoryEntry {
  t: number;
  op: Op["op"];
  args: Op["args"];
}

export type Recipe = RecipeEnvelope<"interior-growth", HistoryEntry>;

export interface InteriorGrowthState {
  hostId: HostFixtureId;
  envelope: FabricationEnvelope;
  params: GrowthParams;
  printerPresetId: PrinterPresetId;
  /** Only meaningful when printerPresetId === "custom" (§2 "CustomだけはX/Y/Zを数値入力できる"). */
  customBuildVolumeMm: Vec3;
  /** Latest 3-candidate batch (field-only / coin-constrained / ring-constrained). Empty until "3候補生成" has run at least once. */
  results: GrowthResult[];
}

export function createEmptyState(): InteriorGrowthState {
  return {
    hostId: "box",
    envelope: { ...DEFAULT_FABRICATION_ENVELOPE },
    params: { ...DEFAULT_GROWTH_PARAMS },
    printerPresetId: DEFAULT_PRINTER_PRESET_ID,
    customBuildVolumeMm: { ...findPrinterPreset("custom").buildVolumeMm },
    results: [],
  };
}

export function record(history: HistoryEntry[], state: InteriorGrowthState, op: Op["op"], args: Op["args"]): HistoryEntry {
  return recordHistoryEntry(history, state, (t) => ({ t, op, args }) as HistoryEntry, applyEntry);
}

export function applyEntry(state: InteriorGrowthState, entry: HistoryEntry): void {
  const op = entry as Op;
  switch (op.op) {
    case "setHost":
      state.hostId = op.args.hostId;
      state.results = [];
      break;
    case "setEnvelope":
      state.envelope = { ...op.args.envelope };
      state.results = [];
      break;
    case "setParams":
      state.params = { ...op.args.params };
      state.results = [];
      break;
    case "setPrinterPreset":
      state.printerPresetId = op.args.printerPresetId;
      state.results = [];
      break;
    case "setCustomBuildVolume":
      state.customBuildVolumeMm = { ...op.args.buildVolumeMm };
      state.results = [];
      break;
    case "generateCandidates":
      state.results = op.args.results;
      break;
    case "clear":
      state.results = [];
      break;
  }
}

export function replay(entries: HistoryEntry[]): InteriorGrowthState {
  const state = createEmptyState();
  for (const entry of entries) applyEntry(state, entry);
  return state;
}

export function serializeRecipe(entries: HistoryEntry[]): string {
  return serializeRecipeEnvelope("interior-growth", entries);
}

// ---------------------------------------------------------------------------
// Legacy migration (§8). Detected structurally (old envelope shape has
// `maxLateralAdvancePerLayerMm`/`maxUnsupportedSpanMm` keys and lacks
// `supportThresholdAngleDeg`) — no separate schema-version field was ever
// added to the shared RecipeEnvelope wrapper (same precedent as S-skin's
// coinBulge addition: "Recipe formatVersion stays 1…handled generically").
// ---------------------------------------------------------------------------

interface LegacyEnvelopeShape {
  buildAxis?: Vec3;
  layerHeightMm?: number | null;
  maxLateralAdvancePerLayerMm?: number | null;
  maxUnsupportedSpanMm?: number | null;
}

function isLegacyEnvelope(raw: unknown): raw is LegacyEnvelopeShape {
  return !!raw && typeof raw === "object" && !("supportThresholdAngleDeg" in raw);
}

/** Old nullable layer/lateral -> new angle-based shape. When the old envelope had a real (non-null) layerHeightMm+maxLateralAdvancePerLayerMm pair, the equivalent angle is recovered exactly via `atan(layerHeight/lateral)`; otherwise the new Stage-1A.1 defaults are used (old "未入力" had no angle concept to invert). */
function migrateEnvelope(raw: unknown): FabricationEnvelope {
  if (!isLegacyEnvelope(raw)) return raw as FabricationEnvelope;
  const buildAxis = raw.buildAxis ?? { x: 0, y: 1, z: 0 };
  const layerHeightMm = typeof raw.layerHeightMm === "number" && raw.layerHeightMm > 0 ? raw.layerHeightMm : DEFAULT_FABRICATION_ENVELOPE.layerHeightMm;
  let supportThresholdAngleDeg = DEFAULT_FABRICATION_ENVELOPE.supportThresholdAngleDeg;
  if (typeof raw.maxLateralAdvancePerLayerMm === "number" && raw.maxLateralAdvancePerLayerMm > 0) {
    supportThresholdAngleDeg = (Math.atan(layerHeightMm / raw.maxLateralAdvancePerLayerMm) * 180) / Math.PI;
  }
  return {
    buildAxis,
    layerHeightMm,
    supportThresholdAngleDeg,
    derivedMaxLateralAdvancePerLayerMm: computeDerivedLateralAllowance(layerHeightMm, supportThresholdAngleDeg),
  };
}

/**
 * Old stored GrowthResult objects (from a `generateCandidates` op) may
 * predate several schema generations, each detected structurally and
 * backfilled with honest "unknown" values — never fabricated as if
 * measured (§7.2 "古い結果の未測定値を0として捏造しない"):
 *
 * - Phase 1A / Stage 1A.1 (pre primaryPathUnitIds/heightCoverage/
 *   topReached/autoBudget): those fields backfilled with 0/false/empty.
 * - S2 (has primaryPathUnitIds etc., but predates the S2.1 fields below):
 *   S2.1 audit-fix §7.2 — detected via `algorithmVersion`'s OWN absence,
 *   NOT via primaryPathUnitIds (that was the actual bug: an S2-era result
 *   already had primaryPathUnitIds, so the old check let it through
 *   unmigrated, silently leaving algorithmVersion/coverageCurve/etc.
 *   undefined). `algorithmVersion` backfilled to the sentinel
 *   `"legacy-pre-s2.1"`, and regionCount/reachedRegionCount/
 *   zeroGainAcceptedCount/coverageCurve/incrementalFinalDrift/scoreWeights
 *   all backfilled to `null` (not 0/[] — the UI shows "未記録" for null).
 * - Pre-`actualPlateContactCount` (anything stored before the O2 audit-fix
 *   split the plate metrics apart): backfilled to `null`, never 0.
 */
function migrateStoredResult(raw: unknown): { result: GrowthResult; legacyMigrated: boolean } {
  const r = raw as GrowthResult & { envelope: unknown };
  const envelope = migrateEnvelope(r.envelope);
  const hasPrimaryPathFields = "primaryPathUnitIds" in (raw as object);
  const hasS21Fields = "algorithmVersion" in (raw as object);
  const base: GrowthResult & { envelope: unknown } = hasPrimaryPathFields
    ? { ...r, envelope }
    : {
        ...r,
        envelope,
        primaryPathUnitIds: [],
        heightCoverage: 0,
        topReached: false,
        autoBudget: computeAutoBudget(r.hostId, envelope.buildAxis, r.params?.unitRadius ?? DEFAULT_GROWTH_PARAMS.unitRadius),
      };
  // O2 fields (launch points / region assignment / route cost) and the
  // per-unit `role` label arrived with the connected-base + multi-source
  // rewrite. Detected the same structural way, and backfilled to null /
  // "unknown" — never to 0 or a guessed category, since nothing measured them
  // when those results were made.
  const hasO2Fields = "launchPointCount" in (raw as object);
  const withO2 = hasO2Fields
    ? base
    : {
        ...base,
        launchPointCount: null,
        assignedRegionCount: null,
        meanAssignedRouteCost: null,
        meanSingleSourceRouteCost: null,
        units: (r.units ?? []).map((u) => ("role" in (u as object) ? u : { ...u, role: "unknown" as const })),
      };

  // O2 audit-fix §2.2/§2.4-5: `actualPlateContactCount` (measured AFTER the
  // connected base, from each unit's own lowest material) replaced the old
  // ambiguous `plateContactCount`. A stored result that predates it never
  // measured this, so it is backfilled to `null` — never 0, which would read
  // as "measured, and nothing touches the plate". The UI shows "未記録".
  const hasActualPlateContact = "actualPlateContactCount" in (raw as object);
  const withPlateContact = hasActualPlateContact ? withO2 : { ...withO2, actualPlateContactCount: null };

  if (hasS21Fields) {
    return {
      result: withPlateContact as GrowthResult,
      legacyMigrated: !hasPrimaryPathFields || !hasO2Fields || !hasActualPlateContact,
    };
  }
  return {
    result: {
      ...withPlateContact,
      algorithmVersion: "legacy-pre-s2.1",
      regionCount: null,
      reachedRegionCount: null,
      zeroGainAcceptedCount: null,
      coverageCurve: null,
      incrementalFinalDrift: null,
      scoreWeights: null,
    } as GrowthResult,
    legacyMigrated: true,
  };
}

export interface ParsedRecipe {
  entries: HistoryEntry[];
  legacyMigrated: boolean;
}

export function parseRecipe(text: string): ParsedRecipe {
  const raw = parseRecipeEntries<HistoryEntry>(text);
  let legacyMigrated = false;
  const entries: HistoryEntry[] = [];
  for (const entry of raw) {
    const op = (entry as { op: string }).op;
    if (op === "setTargetLongestMm") {
      // No direct equivalent under the printer-preset model (§2) — the
      // default printer preset applies instead. Dropped, not silently
      // reinterpreted as something it wasn't.
      legacyMigrated = true;
      continue;
    }
    if (op === "setEnvelope") {
      const args = (entry as unknown as { args: { envelope: unknown } }).args;
      if (isLegacyEnvelope(args.envelope)) legacyMigrated = true;
      entries.push({ ...entry, args: { envelope: migrateEnvelope(args.envelope) } } as HistoryEntry);
      continue;
    }
    if (op === "generateCandidates") {
      const args = (entry as unknown as { args: { results: unknown[] } }).args;
      const results = args.results.map((r) => {
        const resultEnvelope = (r as { envelope: unknown }).envelope;
        const { result, legacyMigrated: thisResultMigrated } = migrateStoredResult(r);
        if (isLegacyEnvelope(resultEnvelope) || thisResultMigrated) legacyMigrated = true;
        return result;
      });
      entries.push({ ...entry, args: { results } } as HistoryEntry);
      continue;
    }
    entries.push(entry);
  }
  return { entries, legacyMigrated };
}
