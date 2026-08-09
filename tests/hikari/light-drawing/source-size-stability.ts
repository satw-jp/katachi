import {
  evaluateLd2ReadinessGates,
  evaluateLd2MaxTexelNegativeEvidenceGates,
  replayLd2Radius2Metrics,
  runLd2SourceSize,
  type Ld2Case,
  type Ld2Estimator,
  type Ld2GateEvaluation,
  type Ld2Run,
} from "../../../src/studies/cloud-sculpt/lightDrawing/ld2SourceSize.ts";

/** The only four fixed CPU runs used by the stability diagnostic. */
export const LD2_STABILITY_RUN_ROLES = Object.freeze([
  Object.freeze({ id: "primary16", sampleCount: 16384, estimator: "primary" }),
  Object.freeze({ id: "primary32", sampleCount: 32768, estimator: "primary" }),
  Object.freeze({ id: "audit16", sampleCount: 16384, estimator: "audit" }),
  Object.freeze({ id: "audit32", sampleCount: 32768, estimator: "audit" }),
] as const);

export type Ld2StabilityRunRole = typeof LD2_STABILITY_RUN_ROLES[number];
export type Ld2StabilityRunId = Ld2StabilityRunRole["id"];

/**
 * Fixed 2 × 3 visual matrix. Audit-16 is intentionally quantitative-only.
 * The order is row-major: {5°, 20°} × {primary16, primary32, audit32}.
 */
export const LD2_STABILITY_PANEL_ORDER = Object.freeze([
  Object.freeze({ diameterDegrees: 5, runId: "primary16" }),
  Object.freeze({ diameterDegrees: 5, runId: "primary32" }),
  Object.freeze({ diameterDegrees: 5, runId: "audit32" }),
  Object.freeze({ diameterDegrees: 20, runId: "primary16" }),
  Object.freeze({ diameterDegrees: 20, runId: "primary32" }),
  Object.freeze({ diameterDegrees: 20, runId: "audit32" }),
] as const);

export interface Ld2StabilityPanel {
  readonly diameterDegrees: 5 | 20;
  readonly runId: "primary16" | "primary32" | "audit32";
  readonly item: Ld2Case;
}

export interface Ld2StabilityBundle {
  readonly runs: Readonly<Record<Ld2StabilityRunId, Ld2Run>>;
  readonly panels: readonly Ld2StabilityPanel[];
  /** The unchanged evaluator result for the radius-8 qualification field. */
  readonly gates: Ld2GateEvaluation;
  /** Pure radius-2 replay of the old failed evidence; it never reruns LD2. */
  readonly radius2NegativeEvidence: Ld2GateEvaluation;
  /** Pure radius-8 max-texel diagnostic replay; never the active gate. */
  readonly radius8MaxTexelNegativeEvidence: Ld2GateEvaluation;
}

export type Ld2StabilityRunner = (sampleCount: number, estimator: Ld2Estimator) => Ld2Run;
export type Ld2StabilityEvaluator = (primary16: Ld2Run, primary32: Ld2Run, audit16: Ld2Run, audit32: Ld2Run) => Ld2GateEvaluation;
export type Ld2Radius2Replay = (run: Ld2Run) => Ld2Run;

/**
 * Builds one immutable diagnostic bundle. Its default dependencies call the
 * existing runner exactly four times and pass those exact objects once to the
 * unchanged evaluator. This function makes no retries, display decisions, or
 * estimator changes.
 */
export function createLd2SourceSizeStabilityBundle(
  run: Ld2StabilityRunner = runLd2SourceSize,
  evaluate: Ld2StabilityEvaluator = evaluateLd2ReadinessGates,
  replayRadius2: Ld2Radius2Replay = replayLd2Radius2Metrics,
  evaluateMaxTexel: Ld2StabilityEvaluator = evaluateLd2MaxTexelNegativeEvidenceGates,
): Ld2StabilityBundle {
  const primary16 = run(16384, "primary");
  const primary32 = run(32768, "primary");
  const audit16 = run(16384, "audit");
  const audit32 = run(32768, "audit");
  const runs = Object.freeze({ primary16, primary32, audit16, audit32 });
  const gates = evaluate(primary16, primary32, audit16, audit32);
  const radius8MaxTexelNegativeEvidence = evaluateMaxTexel(primary16, primary32, audit16, audit32);
  const radius2NegativeEvidence = evaluateMaxTexel(
    replayRadius2(primary16), replayRadius2(primary32), replayRadius2(audit16), replayRadius2(audit32),
  );
  for (const failure of gates.failures) Object.freeze(failure);
  Object.freeze(gates.failures);
  Object.freeze(gates);
  for (const failure of radius8MaxTexelNegativeEvidence.failures) Object.freeze(failure);
  Object.freeze(radius8MaxTexelNegativeEvidence.failures);
  Object.freeze(radius8MaxTexelNegativeEvidence);
  for (const failure of radius2NegativeEvidence.failures) Object.freeze(failure);
  Object.freeze(radius2NegativeEvidence.failures);
  Object.freeze(radius2NegativeEvidence);
  const panels = Object.freeze(LD2_STABILITY_PANEL_ORDER.map(({ diameterDegrees, runId }) => Object.freeze({
    diameterDegrees,
    runId,
    item: caseAtDiameter(runs[runId], diameterDegrees),
  })));
  return Object.freeze({ runs, panels, gates, radius8MaxTexelNegativeEvidence, radius2NegativeEvidence });
}

function caseAtDiameter(run: Ld2Run, diameterDegrees: 5 | 20): Ld2Case {
  const item = run.cases.find((candidate) => candidate.diameterDegrees === diameterDegrees);
  if (!item) throw new RangeError(`fixed LD2 stability panel ${diameterDegrees}° is missing from ${run.estimator}/${run.sampleCount}`);
  return item;
}
