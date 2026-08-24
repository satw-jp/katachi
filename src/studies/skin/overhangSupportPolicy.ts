import { createSupportReachabilityIndex, type SupportReachabilityClassification } from "./supportReachability.ts";

export const OVERHANG_SUPPORT_POLICY = "outside-breakaway-scaffold-inside-dry-web-v1" as const;
export type OverhangTargetSource = "diagnosed-face" | "explicit-profile";
export type OverhangTargetClass = SupportReachabilityClassification;
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
}
export type ClassifiedSupportSiteInput = OverhangAssignmentEntry;
export interface OverhangAssignmentCounts {
  total: number; inside: number; outside: number; unresolved: number; duplicate: number; unassigned: number;
  mixedFace: number; insideSupportSite: number; outsideSupportSite: number; unresolvedSupportSite: number; duplicateSupportSite: number;
}
export interface OverhangAssignmentLedger { policy: typeof OVERHANG_SUPPORT_POLICY; entries: OverhangAssignmentEntry[]; counts: OverhangAssignmentCounts }
export interface OverhangSupportPolicyInput {
  targets?: readonly OverhangTargetInput[]; diagnosedFaces?: Float32Array | readonly (Float32Array | readonly number[])[];
  explicitTargets?: readonly OverhangExplicitTargetMm[]; finalSurfacePositionsMm: Float32Array;
}
export interface OverhangDryWebTarget {
  assignmentId: string; patchId?: number; position: { x: number; y: number; z: number }; normal?: { x: number; y: number; z: number };
  markerRadius: number; reachedByInternal: boolean; basis: "finalMesh";
}
export interface OverhangSupportPolicyResult extends OverhangAssignmentLedger {
  outsideFacePositionsMm: Float32Array; outsideExplicitTargetsMm: OverhangExplicitTargetMm[]; insideTargets: OverhangDryWebTarget[];
  diagnosedFacePositionsMm: Float32Array; mixedFaceIndices: number[];
}
function stableId(source: OverhangTargetSource, sourceIndex: number, siteIndex: number): string {
  return `${source}:${String(sourceIndex).padStart(6, "0")}:site:${siteIndex}`;
}
function finitePoint(point: OverhangPointMm | undefined): OverhangPointMm | null {
  return point && [point.xMm, point.yMm, point.zMm].every(Number.isFinite) ? { ...point } : null;
}
function asPoint(target: OverhangTargetInput): OverhangPointMm | null {
  return finitePoint(target.positionMm) ?? finitePoint({ xMm: target.xMm!, yMm: target.yMm!, zMm: target.zMm! });
}
function asFace(target: OverhangTargetInput): Float32Array | null {
  if (!target.positionsMm || target.positionsMm.length !== 9) return null;
  const face = new Float32Array(target.positionsMm); return Array.from(face).every(Number.isFinite) ? face : null;
}
function normalOrUndefined(normal: OverhangPointMm | undefined): { x: number; y: number; z: number } | undefined {
  const point = finitePoint(normal); if (!point) return undefined; const length = Math.hypot(point.xMm, point.yMm, point.zMm);
  return length > 1e-8 ? { x: point.xMm / length, y: point.yMm / length, z: point.zMm / length } : undefined;
}
function flattenFaces(faces: OverhangSupportPolicyInput["diagnosedFaces"]): Array<Float32Array | readonly number[]> {
  if (!faces) return []; if (!(faces instanceof Float32Array)) return Array.from(faces);
  if (faces.length % 9 !== 0) return [faces]; const result: Float32Array[] = [];
  for (let offset = 0; offset < faces.length; offset += 9) result.push(faces.slice(offset, offset + 9)); return result;
}
function exactPointKey(point: OverhangPointMm): string { return `${Math.fround(point.xMm)},${Math.fround(point.yMm)},${Math.fround(point.zMm)}`; }
function near(a: OverhangPointMm, b: OverhangPointMm, toleranceMm: number): boolean {
  return Math.hypot(a.xMm - b.xMm, a.yMm - b.yMm, a.zMm - b.zMm) <= toleranceMm;
}
function emptyCounts(): OverhangAssignmentCounts {
  return { total: 0, inside: 0, outside: 0, unresolved: 0, duplicate: 0, unassigned: 0, mixedFace: 0,
    insideSupportSite: 0, outsideSupportSite: 0, unresolvedSupportSite: 0, duplicateSupportSite: 0 };
}
export function routeClassifiedSupportSites(input: {
  sites: readonly ClassifiedSupportSiteInput[];
  deduplicationToleranceMm: number;
  diagnosedFacePositionsMm?: Float32Array | readonly number[];
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
    if (entries.some(
      (other) => other.positionMm
        && !other.duplicateOf
        && near(entry.positionMm!, other.positionMm, input.deduplicationToleranceMm),
    )) continue;
    entries.push(entry);
  }
  const counts = summarizeOverhangAssignmentLedger({ policy: OVERHANG_SUPPORT_POLICY, entries }, mixedFace);
  const outsideExplicitTargetsMm: OverhangExplicitTargetMm[] = [];
  const insideTargets: OverhangDryWebTarget[] = [];
  for (const entry of entries) {
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
    entries,
    counts,
    outsideFacePositionsMm: new Float32Array(0),
    outsideExplicitTargetsMm,
    insideTargets,
    diagnosedFacePositionsMm: new Float32Array(input.diagnosedFacePositionsMm ?? []),
    mixedFaceIndices,
  };
}

export function assignOverhangSupportTargets(input: OverhangSupportPolicyInput): OverhangSupportPolicyResult {
  const reachability = createSupportReachabilityIndex(input.finalSurfacePositionsMm);
  const targets = input.targets ? Array.from(input.targets) : [
    ...flattenFaces(input.diagnosedFaces).map((positionsMm): OverhangTargetInput => ({ source: "diagnosed-face", positionsMm })),
    ...(input.explicitTargets ?? []).map((target): OverhangTargetInput => ({ source: "explicit-profile", positionMm: target, patchId: target.patchId, contactRadiusMm: target.contactRadiusMm, contactOverlapMm: target.contactOverlapMm })),
  ];
  const sourceCounts: Record<OverhangTargetSource, number> = { "diagnosed-face": 0, "explicit-profile": 0 };
  const rawEntries: OverhangAssignmentEntry[] = []; const diagnosedFaces: number[] = [];
  for (const target of targets) {
    const sourceIndex = sourceCounts[target.source]++;
    if (target.source === "diagnosed-face") {
      const face = asFace(target);
      if (!face) { rawEntries.push({ id: stableId(target.source, sourceIndex, 0), source: target.source, sourceIndex, siteIndex: 0, faceIndex: sourceIndex, classification: "unresolved", reason: "malformed-or-nonfinite-diagnosed-face" }); continue; }
      diagnosedFaces.push(...face);
      const diagnosis = reachability.diagnoseTriangle(face);
      diagnosis.samples.forEach((sample, siteIndex) => rawEntries.push({
        id: stableId(target.source, sourceIndex, siteIndex), source: target.source, sourceIndex, siteIndex, faceIndex: sourceIndex,
        classification: sample.classification, positionMm: { xMm: sample.xMm, yMm: sample.yMm, zMm: sample.zMm },
        patchId: target.patchId, normal: target.normal, contactRadiusMm: target.contactRadiusMm, contactOverlapMm: target.contactOverlapMm,
      }));
      if (diagnosis.samples.length !== 4) rawEntries.push({ id: stableId(target.source, sourceIndex, diagnosis.samples.length), source: target.source, sourceIndex, siteIndex: diagnosis.samples.length, faceIndex: sourceIndex, classification: "unresolved", reason: "unclassifiable-support-site" });
      continue;
    }
    const positionMm = asPoint(target);
    rawEntries.push({ id: stableId(target.source, sourceIndex, 0), source: target.source, sourceIndex, siteIndex: 0,
      classification: positionMm ? reachability.classifyPoint(positionMm.xMm, positionMm.yMm, positionMm.zMm) : "unresolved",
      positionMm: positionMm ?? undefined, patchId: target.patchId, normal: target.normal, contactRadiusMm: target.contactRadiusMm,
      contactOverlapMm: target.contactOverlapMm, ...(positionMm ? {} : { reason: "malformed-or-nonfinite-explicit-target" }) });
  }
  return routeClassifiedSupportSites({
    sites: rawEntries,
    deduplicationToleranceMm: reachability.lowerIntersectionEpsilonMm,
    diagnosedFacePositionsMm: diagnosedFaces,
  });
}
export function summarizeOverhangAssignmentLedger(ledger: Pick<OverhangAssignmentLedger, "entries" | "policy">, mixedFace = 0): OverhangAssignmentCounts {
  const counts = emptyCounts(); counts.total = ledger.entries.length; counts.mixedFace = mixedFace; const seen = new Set<string>();
  for (const entry of ledger.entries) {
    if (seen.has(entry.id) || entry.duplicateOf) counts.duplicate++; seen.add(entry.id);
    if (entry.classification === "inside") counts.inside++; else if (entry.classification === "outside") counts.outside++;
    else if (entry.classification === "unresolved") counts.unresolved++; else counts.unassigned++;
  }
  counts.insideSupportSite = counts.inside; counts.outsideSupportSite = counts.outside;
  counts.unresolvedSupportSite = counts.unresolved; counts.duplicateSupportSite = counts.duplicate; return counts;
}
export function validateOverhangAssignmentLedger(ledger: OverhangAssignmentLedger): OverhangAssignmentCounts {
  if (ledger.policy !== OVERHANG_SUPPORT_POLICY) throw new Error(`Unsupported overhang support policy: ${ledger.policy}`);
  const counts = summarizeOverhangAssignmentLedger(ledger, ledger.counts.mixedFace);
  if (counts.total !== counts.inside + counts.outside + counts.unresolved) throw new Error("Fail closed: support-site ledger is not a complete partition");
  if (counts.duplicateSupportSite !== 0) throw new Error(`Fail closed: duplicate support sites (${counts.duplicateSupportSite})`);
  if (counts.unassigned !== 0) throw new Error(`Fail closed: unassigned support sites (${counts.unassigned})`);
  if (counts.unresolvedSupportSite !== 0) throw new Error(`Fail closed: unresolved support sites (${counts.unresolvedSupportSite})`);
  return counts;
}
export const classifyOverhangTargets = assignOverhangSupportTargets;
