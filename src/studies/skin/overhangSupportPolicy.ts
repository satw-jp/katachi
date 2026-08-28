import type { BaseFootprint2d } from "./baseFootprint.ts";
import {
  createSupportReachabilityIndex,
  type SupportReachabilityFacts,
  type SupportReachabilityIndex,
  type SupportReachabilitySampleDiagnosis,
  type SupportReachabilityClassification,
} from "./supportReachability.ts";
import {
  applySupportPaintOverrides,
  type SupportPaintApplicationFacts,
  type SupportPaintMode,
  type SupportPaintV1,
} from "./supportPaint.ts";

export const LEGACY_OVERHANG_SUPPORT_POLICY = "outside-breakaway-scaffold-inside-dry-web-v1" as const;
export const OVERHANG_SUPPORT_POLICY = "downward-surface-ray-outside-scaffold-inside-dry-web-v2" as const;
export const OVERHANG_SUPPORT_RAY_METHOD = "support-free-surface-downward-ray-v1" as const;
export type OverhangTargetSource = "diagnosed-face" | "explicit-profile";
export type OverhangTargetClass = SupportReachabilityClassification;
export type OverhangSiteRayResult = "plate-visible" | "body-blocked" | "ray-unresolved";
export interface OverhangPointMm { xMm: number; yMm: number; zMm: number }
export interface OverhangTargetInput {
  source: OverhangTargetSource; positionsMm?: Float32Array | readonly number[]; positionMm?: OverhangPointMm;
  xMm?: number; yMm?: number; zMm?: number; patchId?: number; normal?: OverhangPointMm;
  contactRadiusMm?: number; contactOverlapMm?: number;
}
export interface OverhangExplicitTargetMm extends OverhangPointMm { contactRadiusMm?: number; contactOverlapMm?: number; patchId?: number }
export interface OverhangAssignmentEntry {
  id: string; source: OverhangTargetSource; sourceIndex: number; siteIndex: number; faceIndex?: number;
  classification: OverhangTargetClass; positionMm?: OverhangPointMm; patchId?: number; normal?: OverhangPointMm;
  contactRadiusMm?: number; contactOverlapMm?: number; duplicateOf?: string; reason?: string;
  rayResult?: OverhangSiteRayResult;
  nearestLowerSurfaceDistanceMm?: number | null;
  automaticClassification?: OverhangTargetClass;
  supportPaintStrokeOrder?: number;
  supportPaintMode?: SupportPaintMode;
  manuallyPainted?: boolean;
  manuallyOverridden?: boolean;
}
export type ClassifiedSupportSiteInput = OverhangAssignmentEntry;
export interface OverhangAssignmentCounts {
  total: number; inside: number; outside: number; unresolved: number; duplicate: number; unassigned: number;
  mixedFace: number; insideSupportSite: number; outsideSupportSite: number; unresolvedSupportSite: number; duplicateSupportSite: number;
}
export interface OverhangSupportRayFacts extends SupportReachabilityFacts {
  method: typeof OVERHANG_SUPPORT_RAY_METHOD;
  surfaceSource: "support-free-final-surface";
  rayDirection: "negative-z";
}
export interface OverhangAssignmentLedger {
  policy: typeof OVERHANG_SUPPORT_POLICY;
  entries: OverhangAssignmentEntry[];
  counts: OverhangAssignmentCounts;
  baseFootprint?: BaseFootprint2d | null;
  rayFacts?: OverhangSupportRayFacts | null;
  paintFacts?: SupportPaintApplicationFacts | null;
}
export interface OverhangSupportPolicyInput {
  targets?: readonly OverhangTargetInput[];
  diagnosedFaces?: Float32Array | readonly (Float32Array | readonly number[])[];
  explicitTargets?: readonly OverhangExplicitTargetMm[];
  supportSurfacePositionsMm: Float32Array;
  /** Display evidence only. It never participates in routing. */
  baseFootprint?: BaseFootprint2d | null;
  /** Optional author override applied after automatic Surface-ray classification. */
  supportPaint?: SupportPaintV1 | null;
}
export interface OverhangDryWebTarget {
  assignmentId: string; patchId?: number; position: { x: number; y: number; z: number }; normal?: { x: number; y: number; z: number };
  markerRadius: number; reachedByInternal: boolean; basis: "finalMesh";
}
export interface OverhangSupportPolicyResult extends OverhangAssignmentLedger {
  baseFootprint: BaseFootprint2d | null;
  rayFacts: OverhangSupportRayFacts | null;
  paintFacts: SupportPaintApplicationFacts | null;
  outsideFacePositionsMm: Float32Array;
  outsideExplicitTargetsMm: OverhangExplicitTargetMm[];
  insideTargets: OverhangDryWebTarget[];
  diagnosedFacePositionsMm: Float32Array;
  mixedFaceIndices: number[];
}

const VERTEX_BIASED_WEIGHT = 0.8;

function stableId(source: OverhangTargetSource, sourceIndex: number, siteIndex: number): string {
  return source + ":" + String(sourceIndex).padStart(6, "0") + ":site:" + siteIndex;
}

function finitePoint(point: OverhangPointMm | undefined): OverhangPointMm | null {
  return point && [point.xMm, point.yMm, point.zMm].every(Number.isFinite) ? { ...point } : null;
}

function asPoint(target: OverhangTargetInput): OverhangPointMm | null {
  return finitePoint(target.positionMm) ?? finitePoint({ xMm: target.xMm!, yMm: target.yMm!, zMm: target.zMm! });
}

function asFace(target: OverhangTargetInput): Float32Array | null {
  if (!target.positionsMm || target.positionsMm.length !== 9) return null;
  const face = new Float32Array(target.positionsMm);
  if (!Array.from(face).every(Number.isFinite)) return null;
  const abx = face[3] - face[0];
  const aby = face[4] - face[1];
  const abz = face[5] - face[2];
  const acx = face[6] - face[0];
  const acy = face[7] - face[1];
  const acz = face[8] - face[2];
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  return nx === 0 && ny === 0 && nz === 0 ? null : face;
}

function sampleFace(face: Float32Array): OverhangPointMm[] {
  const vertices: OverhangPointMm[] = [
    { xMm: face[0], yMm: face[1], zMm: face[2] },
    { xMm: face[3], yMm: face[4], zMm: face[5] },
    { xMm: face[6], yMm: face[7], zMm: face[8] },
  ];
  const samples: OverhangPointMm[] = [{
    xMm: (vertices[0].xMm + vertices[1].xMm + vertices[2].xMm) / 3,
    yMm: (vertices[0].yMm + vertices[1].yMm + vertices[2].yMm) / 3,
    zMm: (vertices[0].zMm + vertices[1].zMm + vertices[2].zMm) / 3,
  }];
  for (let vertex = 0; vertex < 3; vertex++) {
    const point = vertices[vertex];
    const otherA = vertices[(vertex + 1) % 3];
    const otherB = vertices[(vertex + 2) % 3];
    samples.push({
      xMm: point.xMm * VERTEX_BIASED_WEIGHT + (otherA.xMm + otherB.xMm) * (1 - VERTEX_BIASED_WEIGHT) / 2,
      yMm: point.yMm * VERTEX_BIASED_WEIGHT + (otherA.yMm + otherB.yMm) * (1 - VERTEX_BIASED_WEIGHT) / 2,
      zMm: point.zMm * VERTEX_BIASED_WEIGHT + (otherA.zMm + otherB.zMm) * (1 - VERTEX_BIASED_WEIGHT) / 2,
    });
  }
  return samples;
}

function faceNormal(face: Float32Array): OverhangPointMm | undefined {
  const abx = face[3] - face[0];
  const aby = face[4] - face[1];
  const abz = face[5] - face[2];
  const acx = face[6] - face[0];
  const acy = face[7] - face[1];
  const acz = face[8] - face[2];
  const xMm = aby * acz - abz * acy;
  const yMm = abz * acx - abx * acz;
  const zMm = abx * acy - aby * acx;
  const length = Math.hypot(xMm, yMm, zMm);
  return length > 1e-12 ? { xMm: xMm / length, yMm: yMm / length, zMm: zMm / length } : undefined;
}

function normalOrUndefined(normal: OverhangPointMm | undefined): { x: number; y: number; z: number } | undefined {
  const point = finitePoint(normal);
  if (!point) return undefined;
  const length = Math.hypot(point.xMm, point.yMm, point.zMm);
  return length > 1e-8 ? { x: point.xMm / length, y: point.yMm / length, z: point.zMm / length } : undefined;
}

function flattenFaces(faces: OverhangSupportPolicyInput["diagnosedFaces"]): Array<Float32Array | readonly number[]> {
  if (!faces) return [];
  if (!(faces instanceof Float32Array)) return Array.from(faces);
  if (faces.length % 9 !== 0) return [faces];
  const result: Float32Array[] = [];
  for (let offset = 0; offset < faces.length; offset += 9) result.push(faces.slice(offset, offset + 9));
  return result;
}

function exactPointKey(point: OverhangPointMm): string {
  return Math.fround(point.xMm) + "," + Math.fround(point.yMm) + "," + Math.fround(point.zMm);
}

function hasFinitePosition(point: OverhangPointMm | undefined): point is OverhangPointMm {
  return point !== undefined
    && Number.isFinite(point.xMm)
    && Number.isFinite(point.yMm)
    && Number.isFinite(point.zMm);
}

function hasUsableDeduplicationTolerance(toleranceMm: number): boolean {
  return Number.isFinite(toleranceMm) && toleranceMm > 0;
}

function near(a: OverhangPointMm, b: OverhangPointMm, toleranceMm: number): boolean {
  return Math.hypot(a.xMm - b.xMm, a.yMm - b.yMm, a.zMm - b.zMm) <= toleranceMm;
}

type SpatialBucket = [number, number, number];

const SPATIAL_NEIGHBOR_OFFSETS: SpatialBucket[] = [];
for (let z = -1; z <= 1; z += 1) {
  for (let y = -1; y <= 1; y += 1) {
    for (let x = -1; x <= 1; x += 1) {
      SPATIAL_NEIGHBOR_OFFSETS.push([x, y, z]);
    }
  }
}

/**
 * Incremental index for the accepted, positioned entries in one ledger pass.
 * A cell has the same length as the tolerance, so two points within the
 * Euclidean tolerance can differ by at most one cell on each axis. The
 * neighbouring-cell scan is only a candidate filter; `near` remains the exact
 * Euclidean acceptance test. Non-finite positions are deliberately not indexed
 * because the old comparison cannot consider them near any finite position.
 */
class IncrementalNearSiteIndex {
  private readonly buckets = new Map<string, OverhangAssignmentEntry[]>();
  /** Compatibility path for zero/+Infinity (and malformed positions). */
  private readonly acceptedEntries: OverhangAssignmentEntry[] = [];

  constructor(private readonly cellSizeMm: number) {}

  private cellFor(point: OverhangPointMm): SpatialBucket {
    return [
      Math.floor(point.xMm / this.cellSizeMm),
      Math.floor(point.yMm / this.cellSizeMm),
      Math.floor(point.zMm / this.cellSizeMm),
    ];
  }

  private static key(cell: SpatialBucket): string {
    return cell[0] + "," + cell[1] + "," + cell[2];
  }

  hasNear(point: OverhangPointMm): boolean {
    if (!hasUsableDeduplicationTolerance(this.cellSizeMm)) {
      // Keep the old literal `Math.hypot(...) <= tolerance` semantics for
      // tolerances that cannot define a bucket. In particular, +Infinity
      // accepts every pair of finite points, while NaN/negative values accept
      // none. This path is intentionally linear because production uses the
      // finite positive Surface epsilon; it is a compatibility guard only.
      if (this.cellSizeMm === 0 || this.cellSizeMm === Number.POSITIVE_INFINITY) {
        for (const candidate of this.acceptedEntries) {
          if (candidate.positionMm && near(point, candidate.positionMm, this.cellSizeMm)) return true;
        }
      }
      return false;
    }
    if (!hasFinitePosition(point)) return false;
    const [cellX, cellY, cellZ] = this.cellFor(point);
    for (const [offsetX, offsetY, offsetZ] of SPATIAL_NEIGHBOR_OFFSETS) {
      const candidates = this.buckets.get(IncrementalNearSiteIndex.key([
        cellX + offsetX,
        cellY + offsetY,
        cellZ + offsetZ,
      ]));
      if (!candidates) continue;
      for (const candidate of candidates) {
        if (candidate.positionMm && near(point, candidate.positionMm, this.cellSizeMm)) return true;
      }
    }
    return false;
  }

  add(entry: OverhangAssignmentEntry): void {
    // The old entries.some predicate considered accepted entries with a
    // positioned value (including malformed values, which simply fail near),
    // but never entries carrying duplicateOf. Retain that candidate set for
    // compatibility fallbacks, then index only finite positions for buckets.
    if (entry.duplicateOf || !entry.positionMm) return;
    this.acceptedEntries.push(entry);
    if (!hasUsableDeduplicationTolerance(this.cellSizeMm) || !hasFinitePosition(entry.positionMm)) return;
    const cell = this.cellFor(entry.positionMm);
    const key = IncrementalNearSiteIndex.key(cell);
    const candidates = this.buckets.get(key);
    if (candidates) candidates.push(entry);
    else this.buckets.set(key, [entry]);
  }
}

function emptyCounts(): OverhangAssignmentCounts {
  return {
    total: 0, inside: 0, outside: 0, unresolved: 0, duplicate: 0, unassigned: 0, mixedFace: 0,
    insideSupportSite: 0, outsideSupportSite: 0, unresolvedSupportSite: 0, duplicateSupportSite: 0,
  };
}

export function toOverhangSupportRayFacts(index: SupportReachabilityIndex): OverhangSupportRayFacts {
  return {
    method: OVERHANG_SUPPORT_RAY_METHOD,
    surfaceSource: "support-free-final-surface",
    rayDirection: "negative-z",
    meshScaleMm: index.meshScaleMm,
    lowerIntersectionEpsilonMm: index.lowerIntersectionEpsilonMm,
    gridCellSizeMm: index.gridCellSizeMm,
    gridCellCount: index.gridCellCount,
    surfaceTriangleCount: index.surfaceTriangleCount,
    invalidSurfaceTriangleCount: index.invalidSurfaceTriangleCount,
  };
}

function classifyRayDiagnosis(diagnosis: SupportReachabilitySampleDiagnosis | null): {
  classification: OverhangTargetClass;
  rayResult: OverhangSiteRayResult;
  nearestLowerSurfaceDistanceMm: number | null;
  reason: string;
} {
  if (!diagnosis) {
    return {
      classification: "unresolved",
      rayResult: "ray-unresolved",
      nearestLowerSurfaceDistanceMm: null,
      reason: "downward-surface-ray-unresolved",
    };
  }
  if (diagnosis.classification === "inside") {
    return {
      classification: "inside",
      rayResult: "body-blocked",
      nearestLowerSurfaceDistanceMm: diagnosis.nearestLowerIntersectionDistanceMm,
      reason: "body-blocked",
    };
  }
  return {
    classification: "outside",
    rayResult: "plate-visible",
    nearestLowerSurfaceDistanceMm: null,
    reason: "plate-visible",
  };
}

export interface OverhangRawClassificationResult {
  entries: OverhangAssignmentEntry[];
  diagnosedFacePositionsMm: Float32Array;
}

/**
 * Classify targets without applying exact/near deduplication, Paint, or
 * routing. Keeping this phase pure lets a coordinator classify contiguous
 * dangerous-face chunks and then run the historical single route globally.
 * Source offsets are used by chunks so sourceIndex/faceIndex remain the same
 * values as the single-pass oracle.
 */
export function classifyRawOverhangTargets(input: {
  rayIndex: SupportReachabilityIndex;
  targets: readonly OverhangTargetInput[];
  diagnosedFaceSourceIndexOffset?: number;
  explicitSourceIndexOffset?: number;
  onDiagnosedFaceComplete?: (completedFaceCount: number, totalFaceCount: number) => void;
}): OverhangRawClassificationResult {
  const sourceCounts: Record<OverhangTargetSource, number> = {
    "diagnosed-face": input.diagnosedFaceSourceIndexOffset ?? 0,
    "explicit-profile": input.explicitSourceIndexOffset ?? 0,
  };
  const totalDiagnosedFaces = input.targets.reduce(
    (count, target) => count + (target.source === "diagnosed-face" ? 1 : 0),
    0,
  );
  let completedDiagnosedFaces = 0;
  const rawEntries: OverhangAssignmentEntry[] = [];
  const diagnosedFaces: number[] = [];
  const reportDiagnosedFace = (): void => {
    completedDiagnosedFaces++;
    input.onDiagnosedFaceComplete?.(completedDiagnosedFaces, totalDiagnosedFaces);
  };

  for (const target of input.targets) {
    const sourceIndex = sourceCounts[target.source]++;
    if (target.source === "diagnosed-face") {
      const face = asFace(target);
      if (!face) {
        rawEntries.push({
          id: stableId(target.source, sourceIndex, 0),
          source: target.source,
          sourceIndex,
          siteIndex: 0,
          faceIndex: sourceIndex,
          classification: "unresolved",
          rayResult: "ray-unresolved",
          reason: "malformed-or-nonfinite-diagnosed-face",
        });
        reportDiagnosedFace();
        continue;
      }
      diagnosedFaces.push(...face);
      const sampledNormal = target.normal ?? faceNormal(face);
      sampleFace(face).forEach((positionMm, siteIndex) => {
        const routed = classifyRayDiagnosis(input.rayIndex.diagnosePoint(positionMm.xMm, positionMm.yMm, positionMm.zMm));
        rawEntries.push({
          id: stableId(target.source, sourceIndex, siteIndex),
          source: target.source,
          sourceIndex,
          siteIndex,
          faceIndex: sourceIndex,
          positionMm,
          classification: routed.classification,
          rayResult: routed.rayResult,
          nearestLowerSurfaceDistanceMm: routed.nearestLowerSurfaceDistanceMm,
          reason: routed.reason,
          patchId: target.patchId,
          normal: sampledNormal,
          contactRadiusMm: target.contactRadiusMm,
          contactOverlapMm: target.contactOverlapMm,
        });
      });
      reportDiagnosedFace();
      continue;
    }
    const positionMm = asPoint(target);
    const routed = positionMm
      ? classifyRayDiagnosis(input.rayIndex.diagnosePoint(positionMm.xMm, positionMm.yMm, positionMm.zMm))
      : {
          classification: "unresolved" as const,
          rayResult: "ray-unresolved" as const,
          nearestLowerSurfaceDistanceMm: null,
          reason: "malformed-or-nonfinite-explicit-target",
        };
    rawEntries.push({
      id: stableId(target.source, sourceIndex, 0),
      source: target.source,
      sourceIndex,
      siteIndex: 0,
      classification: routed.classification,
      rayResult: routed.rayResult,
      nearestLowerSurfaceDistanceMm: routed.nearestLowerSurfaceDistanceMm,
      positionMm: positionMm ?? undefined,
      patchId: target.patchId,
      normal: target.normal,
      contactRadiusMm: target.contactRadiusMm,
      contactOverlapMm: target.contactOverlapMm,
      reason: routed.reason,
    });
  }
  return { entries: rawEntries, diagnosedFacePositionsMm: new Float32Array(diagnosedFaces) };
}

export function routeClassifiedSupportSites(input: {
  sites: readonly ClassifiedSupportSiteInput[];
  deduplicationToleranceMm: number;
  diagnosedFacePositionsMm?: Float32Array | readonly number[];
  baseFootprint?: BaseFootprint2d | null;
  rayFacts?: OverhangSupportRayFacts | null;
  supportSurfacePositionsMm?: Float32Array;
  supportPaint?: SupportPaintV1 | null;
}): OverhangSupportPolicyResult {
  const faceClasses = new Map<number, Set<OverhangTargetClass>>();
  for (const site of input.sites) {
    if (site.faceIndex === undefined) continue;
    const classes = faceClasses.get(site.faceIndex) ?? new Set<OverhangTargetClass>();
    classes.add(site.classification);
    faceClasses.set(site.faceIndex, classes);
  }
  const mixedFaceIndices = Array.from(faceClasses.entries())
    .filter(([, classes]) => classes.has("inside") && classes.has("outside"))
    .map(([faceIndex]) => faceIndex);
  const mixedFace = mixedFaceIndices.length;
  const exact = new Map<string, OverhangAssignmentEntry>();
  const nearSiteIndex = new IncrementalNearSiteIndex(input.deduplicationToleranceMm);
  const entries: OverhangAssignmentEntry[] = [];
  for (const site of input.sites) {
    const entry = { ...site };
    if (!entry.positionMm) {
      entries.push(entry);
      continue;
    }
    const key = exactPointKey(entry.positionMm);
    const identical = exact.get(key);
    if (identical) {
      entries.push({ ...entry, duplicateOf: identical.id });
      continue;
    }
    exact.set(key, entry);
    if (nearSiteIndex.hasNear(entry.positionMm)) continue;
    entries.push(entry);
    nearSiteIndex.add(entry);
  }
  const automaticEntries = entries.map((entry) => ({
    ...entry,
    automaticClassification: entry.automaticClassification ?? entry.classification,
  }));
  const painted = input.supportSurfacePositionsMm
    ? applySupportPaintOverrides({
        sites: automaticEntries,
        supportSurfacePositionsMm: input.supportSurfacePositionsMm,
        supportPaint: input.supportPaint,
      })
    : null;
  const routedEntries = (painted?.sites ?? automaticEntries) as OverhangAssignmentEntry[];
  const counts = summarizeOverhangAssignmentLedger({ policy: OVERHANG_SUPPORT_POLICY, entries: routedEntries }, mixedFace);
  const outsideExplicitTargetsMm: OverhangExplicitTargetMm[] = [];
  const insideTargets: OverhangDryWebTarget[] = [];
  for (const entry of routedEntries) {
    if (entry.duplicateOf || !entry.positionMm) continue;
    if (entry.classification === "outside") {
      outsideExplicitTargetsMm.push({
        ...entry.positionMm,
        ...(entry.patchId === undefined ? {} : { patchId: entry.patchId }),
        ...(entry.contactRadiusMm === undefined ? {} : { contactRadiusMm: entry.contactRadiusMm }),
        ...(entry.contactOverlapMm === undefined ? {} : { contactOverlapMm: entry.contactOverlapMm }),
      });
    } else if (entry.classification === "inside") {
      insideTargets.push({
        assignmentId: entry.id,
        patchId: entry.patchId,
        position: { x: entry.positionMm.xMm, y: entry.positionMm.yMm, z: entry.positionMm.zMm },
        normal: normalOrUndefined(entry.normal),
        markerRadius: 0.035,
        reachedByInternal: false,
        basis: "finalMesh",
      });
    }
  }
  return {
    policy: OVERHANG_SUPPORT_POLICY,
    entries: routedEntries,
    counts,
    baseFootprint: input.baseFootprint ?? null,
    rayFacts: input.rayFacts ?? null,
    paintFacts: painted?.facts ?? null,
    outsideFacePositionsMm: new Float32Array(0),
    outsideExplicitTargetsMm,
    insideTargets,
    diagnosedFacePositionsMm: new Float32Array(input.diagnosedFacePositionsMm ?? []),
    mixedFaceIndices,
  };
}

export function assignOverhangSupportTargets(input: OverhangSupportPolicyInput): OverhangSupportPolicyResult {
  const rayIndex = createSupportReachabilityIndex(input.supportSurfacePositionsMm);
  const facts = toOverhangSupportRayFacts(rayIndex);
  const targets = input.targets ? Array.from(input.targets) : [
    ...flattenFaces(input.diagnosedFaces).map((positionsMm): OverhangTargetInput => ({ source: "diagnosed-face", positionsMm })),
    ...(input.explicitTargets ?? []).map((target): OverhangTargetInput => ({
      source: "explicit-profile",
      positionMm: target,
      patchId: target.patchId,
      contactRadiusMm: target.contactRadiusMm,
      contactOverlapMm: target.contactOverlapMm,
    })),
  ];
  const raw = classifyRawOverhangTargets({ rayIndex, targets });
  return routeClassifiedSupportSites({
    sites: raw.entries,
    deduplicationToleranceMm: facts.lowerIntersectionEpsilonMm,
    diagnosedFacePositionsMm: raw.diagnosedFacePositionsMm,
    baseFootprint: input.baseFootprint ?? null,
    rayFacts: facts,
    supportSurfacePositionsMm: input.supportSurfacePositionsMm,
    supportPaint: input.supportPaint,
  });
}

/** Reapply author strokes without rebuilding the automatic Surface-ray index. */
export function applySupportPaintToPolicyResult(
  automaticResult: OverhangSupportPolicyResult,
  supportSurfacePositionsMm: Float32Array,
  supportPaint?: SupportPaintV1 | null,
): OverhangSupportPolicyResult {
  return routeClassifiedSupportSites({
    sites: automaticResult.entries.map((entry) => ({
      ...entry,
      classification: entry.automaticClassification ?? entry.classification,
    })),
    deduplicationToleranceMm: automaticResult.rayFacts?.lowerIntersectionEpsilonMm ?? 1e-6,
    diagnosedFacePositionsMm: automaticResult.diagnosedFacePositionsMm,
    baseFootprint: automaticResult.baseFootprint,
    rayFacts: automaticResult.rayFacts,
    supportSurfacePositionsMm,
    supportPaint,
  });
}

export function summarizeOverhangAssignmentLedger(
  ledger: Pick<OverhangAssignmentLedger, "entries" | "policy">,
  mixedFace = 0,
): OverhangAssignmentCounts {
  const counts = emptyCounts();
  counts.total = ledger.entries.length;
  counts.mixedFace = mixedFace;
  const seen = new Set<string>();
  for (const entry of ledger.entries) {
    if (seen.has(entry.id) || entry.duplicateOf) counts.duplicate++;
    seen.add(entry.id);
    if (entry.classification === "inside") counts.inside++;
    else if (entry.classification === "outside") counts.outside++;
    else if (entry.classification === "unresolved") counts.unresolved++;
    else counts.unassigned++;
  }
  counts.insideSupportSite = counts.inside;
  counts.outsideSupportSite = counts.outside;
  counts.unresolvedSupportSite = counts.unresolved;
  counts.duplicateSupportSite = counts.duplicate;
  return counts;
}

export function validateOverhangAssignmentLedger(ledger: OverhangAssignmentLedger): OverhangAssignmentCounts {
  if (ledger.policy !== OVERHANG_SUPPORT_POLICY) {
    throw new Error("Unsupported overhang support policy: " + ledger.policy);
  }
  const counts = summarizeOverhangAssignmentLedger(ledger, ledger.counts.mixedFace);
  if (counts.total !== counts.inside + counts.outside + counts.unresolved) {
    throw new Error("Fail closed: support-site ledger is not a complete partition");
  }
  if (counts.duplicateSupportSite !== 0) {
    throw new Error("Fail closed: duplicate support sites (" + counts.duplicateSupportSite + ")");
  }
  if (counts.unassigned !== 0) {
    throw new Error("Fail closed: unassigned support sites (" + counts.unassigned + ")");
  }
  if (counts.unresolvedSupportSite !== 0) {
    throw new Error("Fail closed: unresolved support sites (" + counts.unresolvedSupportSite + ")");
  }
  return counts;
}

export const classifyOverhangTargets = assignOverhangSupportTargets;
