import { createSupportReachabilityIndex } from "./supportReachability.ts";
import type { OverhangAssignmentEntry, OverhangAssignmentLedger, OverhangPointMm } from "./overhangSupportPolicy.ts";

export const OVERHANG_SUPPORT_DIAGNOSTIC_SCHEMA = "katachi.skin.overhang-support-diagnostic.v1" as const;

export type OverhangDiagnosticFailureCategory =
  | "base-classification-unresolved"
  | "inside-dry-web-destination-missing"
  | "outside-scaffold-destination-missing"
  | "other";

export interface OverhangSupportDiagnosticRecord {
  id: string;
  source: OverhangAssignmentEntry["source"];
  sourceIndex: number;
  positionMm: OverhangPointMm;
  classification: OverhangAssignmentEntry["classification"];
  currentMmClassification: OverhangAssignmentEntry["classification"];
  failureCategory: OverhangDiagnosticFailureCategory;
  failureReason: string;
  sampleCounts: { inside: number; outside: number } | null;
  nearestLowerSurfaceDistanceMm: number | null;
  nearestDryWebConnectionCandidateDistanceMm: number | null;
  nearestScaffoldConnectionCandidateDistanceMm: number | null;
  v087ExcludedMatch: {
    matched: boolean;
    method: "source-index-and-exact-float32-coordinates";
  };
}

export interface OverhangSupportDiagnosticReport {
  schema: typeof OVERHANG_SUPPORT_DIAGNOSTIC_SCHEMA;
  policy: OverhangAssignmentLedger["policy"];
  summary: {
    unresolvedTotal: number;
    baseClassificationUnresolved: number;
    insideDryWebDestinationMissing: number;
    outsideScaffoldDestinationMissing: number;
    other: number;
    v087ExcludedCoordinateMatches: number;
  };
  records: OverhangSupportDiagnosticRecord[];
}

function centroid(entry: OverhangAssignmentEntry): OverhangPointMm | null {
  if (entry.positionMm) return entry.positionMm;
  const face = entry.positionsMm;
  if (!face || face.length !== 9) return null;
  return {
    xMm: (face[0] + face[3] + face[6]) / 3,
    yMm: (face[1] + face[4] + face[7]) / 3,
    zMm: (face[2] + face[5] + face[8]) / 3,
  };
}

function nearestDistance(point: OverhangPointMm, candidates: readonly OverhangPointMm[]): number | null {
  let nearest = Infinity;
  for (const candidate of candidates) {
    const distance = Math.hypot(point.xMm - candidate.xMm, point.yMm - candidate.yMm, point.zMm - candidate.zMm);
    if (Number.isFinite(distance)) nearest = Math.min(nearest, distance);
  }
  return Number.isFinite(nearest) ? nearest : null;
}

function exactFloat32FaceKey(face: Float32Array): string {
  return Array.from(face, (value) => String(Math.fround(value))).join(",");
}

/**
 * Diagnose fail-closed routing without changing assignment or support geometry.
 * v087's legacy reachability rejected a face when any deterministic sample was
 * blocked, so every mixed-sample v088 unresolved face is matched against that
 * historical exclusion by stable source index and exact Float32 coordinates.
 */
export function buildOverhangSupportDiagnostic(input: {
  ledger: OverhangAssignmentLedger;
  finalSurfacePositionsMm: Float32Array;
  dryWebConnectionCandidatesMm?: readonly OverhangPointMm[];
  plateZMm: number;
}): OverhangSupportDiagnosticReport {
  const reachability = createSupportReachabilityIndex(input.finalSurfacePositionsMm);
  const candidates = input.dryWebConnectionCandidatesMm ?? [];
  const records: OverhangSupportDiagnosticRecord[] = [];
  for (const entry of input.ledger.entries) {
    if (entry.classification !== "unresolved") continue;
    const positionMm = centroid(entry);
    if (!positionMm) {
      records.push({
        id: entry.id, source: entry.source, sourceIndex: entry.sourceIndex,
        positionMm: { xMm: Number.NaN, yMm: Number.NaN, zMm: Number.NaN },
        classification: entry.classification, currentMmClassification: entry.classification, failureCategory: "other",
        failureReason: entry.reason ?? "missing-target-position", sampleCounts: null,
        nearestLowerSurfaceDistanceMm: null, nearestDryWebConnectionCandidateDistanceMm: null,
        nearestScaffoldConnectionCandidateDistanceMm: null,
        v087ExcludedMatch: { matched: false, method: "source-index-and-exact-float32-coordinates" },
      });
      continue;
    }
    const faceDiagnosis = entry.positionsMm ? reachability.diagnoseTriangle(entry.positionsMm) : null;
    const lowerDistances = faceDiagnosis?.samples
      .map((sample) => sample.nearestLowerIntersectionDistanceMm)
      .filter((distance): distance is number => distance !== null) ?? [];
    const mixed = Boolean(faceDiagnosis && faceDiagnosis.blockedSampleCount > 0 && faceDiagnosis.openSampleCount > 0);
    const stableFace = entry.source === "diagnosed-face" && entry.positionsMm
      ? exactFloat32FaceKey(entry.positionsMm) === exactFloat32FaceKey(entry.positionsMm.slice())
      : false;
    records.push({
      id: entry.id, source: entry.source, sourceIndex: entry.sourceIndex, positionMm,
      classification: entry.classification,
      currentMmClassification: faceDiagnosis?.classification ?? entry.classification,
      failureCategory: mixed ? "base-classification-unresolved" : "other",
      failureReason: mixed ? "deterministic -Z samples straddle the final Surface lower envelope" : (entry.reason ?? "unresolved-for-other-reason"),
      sampleCounts: faceDiagnosis ? { inside: faceDiagnosis.blockedSampleCount, outside: faceDiagnosis.openSampleCount } : null,
      nearestLowerSurfaceDistanceMm: lowerDistances.length ? Math.min(...lowerDistances) : null,
      nearestDryWebConnectionCandidateDistanceMm: nearestDistance(positionMm, candidates),
      nearestScaffoldConnectionCandidateDistanceMm: Number.isFinite(input.plateZMm)
        ? Math.max(0, positionMm.zMm - input.plateZMm)
        : null,
      v087ExcludedMatch: { matched: mixed && stableFace, method: "source-index-and-exact-float32-coordinates" },
    });
  }
  const count = (category: OverhangDiagnosticFailureCategory): number => records.filter((record) => record.failureCategory === category).length;
  return {
    schema: OVERHANG_SUPPORT_DIAGNOSTIC_SCHEMA,
    policy: input.ledger.policy,
    summary: {
      unresolvedTotal: records.length,
      baseClassificationUnresolved: count("base-classification-unresolved"),
      insideDryWebDestinationMissing: count("inside-dry-web-destination-missing"),
      outsideScaffoldDestinationMissing: count("outside-scaffold-destination-missing"),
      other: count("other"),
      v087ExcludedCoordinateMatches: records.filter((record) => record.v087ExcludedMatch.matched).length,
    },
    records,
  };
}
