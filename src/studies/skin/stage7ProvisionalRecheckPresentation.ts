/**
 * Stage 7 provisional exact comparison is evidence about one independent
 * planned graph.  It deliberately has no graph, renderer, cache, history, or
 * printability meaning.  Counts are hidden until both the captured baseline
 * and the provisional result are still current.
 */

export type Stage7ProvisionalRecheckState = "missing" | "running" | "stale" | "error" | "current";
export type Stage7ProvisionalRecheckStatus = "improved" | "unchanged" | "worse";

export interface Stage7ProvisionalRecheckCounts {
  readonly teal: number;
  readonly orange: number;
  readonly red: number;
}

export interface Stage7ProvisionalRecheckPresentationInput {
  /** The plan/source/settings identity guard supplied by the caller. */
  readonly actionReady: boolean;
  /** A Worker is currently evaluating the independent provisional graph. */
  readonly running: boolean;
  /** The stored provisional result still matches its captured identities. */
  readonly current: boolean;
  /** A result existed but its plan/source/settings no longer match. */
  readonly stale: boolean;
  /** A terminal Worker error. Errors take precedence over stale/current. */
  readonly error: string | null;
  readonly baseline: Stage7ProvisionalRecheckCounts | null;
  readonly provisional: Stage7ProvisionalRecheckCounts | null;
  /** Operation-local elapsed time; previous canonical elapsed time is excluded. */
  readonly elapsedMs: number | null;
}

export interface Stage7ProvisionalRecheckPresentation {
  readonly state: Stage7ProvisionalRecheckState;
  /** Whether the explicit `仮Graphで再診断` action may start or rerun. */
  readonly enabled: boolean;
  /** True only when current baseline and provisional counts are exposed. */
  readonly current: boolean;
  readonly baseline: Stage7ProvisionalRecheckCounts | null;
  readonly provisional: Stage7ProvisionalRecheckCounts | null;
  readonly deltas: Stage7ProvisionalRecheckCounts | null;
  readonly baselineTeal: number | null;
  readonly baselineOrange: number | null;
  readonly baselineRed: number | null;
  readonly provisionalTeal: number | null;
  readonly provisionalOrange: number | null;
  readonly provisionalRed: number | null;
  /** Signed provisional minus baseline delta for each color. */
  readonly tealDelta: number | null;
  readonly orangeDelta: number | null;
  readonly redDelta: number | null;
  /** Positive means fewer provisional red faces; negative means more. */
  readonly redReduction: number | null;
  readonly status: Stage7ProvisionalRecheckStatus | null;
  readonly elapsedSeconds: number | null;
  readonly reason: string;
}

function validCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validCounts(value: Stage7ProvisionalRecheckCounts | null): value is Stage7ProvisionalRecheckCounts {
  return value !== null && validCount(value.teal) && validCount(value.orange) && validCount(value.red);
}

function cloneCounts(value: Stage7ProvisionalRecheckCounts): Stage7ProvisionalRecheckCounts {
  return Object.freeze({ teal: value.teal, orange: value.orange, red: value.red });
}

function emptyOutput(
  state: Exclude<Stage7ProvisionalRecheckState, "current">,
  enabled: boolean,
  reason: string,
  elapsedMs: number | null,
): Stage7ProvisionalRecheckPresentation {
  const elapsedSeconds = elapsedMs !== null && Number.isFinite(elapsedMs) && elapsedMs >= 0
    ? elapsedMs / 1000
    : null;
  return {
    state,
    enabled,
    current: false,
    baseline: null,
    provisional: null,
    deltas: null,
    baselineTeal: null,
    baselineOrange: null,
    baselineRed: null,
    provisionalTeal: null,
    provisionalOrange: null,
    provisionalRed: null,
    tealDelta: null,
    orangeDelta: null,
    redDelta: null,
    redReduction: null,
    status: null,
    elapsedSeconds,
    reason,
  };
}

function stateReason(input: Stage7ProvisionalRecheckPresentationInput): string {
  if (input.running) return "仮Graph exact比較を実行中です。旧比較countは表示しません。";
  if (input.error) return `仮Graph exact比較に失敗しました: ${input.error}`;
  if (input.stale) return "仮Graph exact比較のplan/source/settingsが古くなりました。countは表示しません。";
  if (!input.actionReady) return "currentの仮Graph計画・exact baseline・source/settingsがそろっていません。";
  return "仮Graph計画はcurrentです。「仮Graphで再診断」で有限解像度の比較を実行できます。";
}

/**
 * Pure presentation boundary for the provisional Stage 7 checkpoint.
 * Counts never leak from a missing/running/stale/error input, and all values
 * are copied before being returned so the caller's canonical facts remain
 * immutable.
 */
export function createStage7ProvisionalRecheckPresentation(
  input: Stage7ProvisionalRecheckPresentationInput | null,
): Stage7ProvisionalRecheckPresentation {
  if (!input) return emptyOutput("missing", false, "仮Graph exact比較は未確認です。countは表示しません。", null);
  const elapsedMs = input.elapsedMs;
  if (input.running) {
    return emptyOutput("running", false, stateReason(input), elapsedMs);
  }
  if (input.error) {
    // A terminal error leaves the plan untouched, so the explicit action may
    // be retried when its identity guard is still ready.
    return emptyOutput("error", Boolean(input.actionReady), stateReason(input), elapsedMs);
  }
  if (input.stale) {
    return emptyOutput("stale", Boolean(input.actionReady), stateReason(input), elapsedMs);
  }
  if (!input.current || !validCounts(input.baseline) || !validCounts(input.provisional)) {
    return emptyOutput("missing", Boolean(input.actionReady), stateReason(input), elapsedMs);
  }

  const baseline = cloneCounts(input.baseline);
  const provisional = cloneCounts(input.provisional);
  const deltas = Object.freeze({
    teal: provisional.teal - baseline.teal,
    orange: provisional.orange - baseline.orange,
    red: provisional.red - baseline.red,
  });
  const redReduction = baseline.red - provisional.red;
  const status: Stage7ProvisionalRecheckStatus = redReduction > 0
    ? "improved"
    : redReduction < 0
      ? "worse"
      : "unchanged";
  const safeElapsedMs = elapsedMs !== null && Number.isFinite(elapsedMs) && elapsedMs >= 0 ? elapsedMs : null;
  return {
    state: "current",
    enabled: Boolean(input.actionReady),
    current: true,
    baseline,
    provisional,
    deltas,
    baselineTeal: baseline.teal,
    baselineOrange: baseline.orange,
    baselineRed: baseline.red,
    provisionalTeal: provisional.teal,
    provisionalOrange: provisional.orange,
    provisionalRed: provisional.red,
    tealDelta: deltas.teal,
    orangeDelta: deltas.orange,
    redDelta: deltas.red,
    redReduction,
    status,
    elapsedSeconds: safeElapsedMs === null ? null : safeElapsedMs / 1000,
    reason: redReduction > 0
      ? `red ${provisional.red} candidate（baseline ${baseline.red} → provisional ${provisional.red}）。これは有限解像度のexact比較で、printabilityを示しません。`
      : redReduction < 0
        ? `赤面が${Math.abs(redReduction)}面増えました。これは有限解像度のexact比較で、printabilityを示しません。`
        : `red ${provisional.red} candidate。赤面数は変わりません（${provisional.red}面）。これは有限解像度のexact比較で、printabilityを示しません。`,
  };
}
