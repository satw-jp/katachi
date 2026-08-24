import {
  createSupportReachabilityIndex,
  type SupportReachabilityClassification,
} from "./supportReachability.ts";

/** Stable v088 routing contract shared by the CLI, Worker, and app. */
export const OVERHANG_SUPPORT_POLICY = "outside-breakaway-scaffold-inside-dry-web-v1" as const;

export type OverhangTargetSource = "diagnosed-face" | "explicit-profile";
export type OverhangTargetClass = SupportReachabilityClassification;

export interface OverhangPointMm {
  xMm: number;
  yMm: number;
  zMm: number;
}

/** One input target before deterministic ID assignment. */
export interface OverhangTargetInput {
  source: OverhangTargetSource;
  /** A diagnosed face is exactly nine numbers (three vertices). */
  positionsMm?: Float32Array | readonly number[];
  /** An explicit Profile target is a single point. */
  positionMm?: OverhangPointMm;
  xMm?: number;
  yMm?: number;
  zMm?: number;
  patchId?: number;
  normal?: OverhangPointMm;
  contactRadiusMm?: number;
  contactOverlapMm?: number;
}

export interface OverhangExplicitTargetMm extends OverhangPointMm {
  contactRadiusMm?: number;
  contactOverlapMm?: number;
  patchId?: number;
}

export interface OverhangAssignmentEntry {
  /** `diagnosed-face:000000` or `explicit-profile:000000`. */
  id: string;
  source: OverhangTargetSource;
  sourceIndex: number;
  classification: OverhangTargetClass;
  positionsMm?: Float32Array;
  positionMm?: OverhangPointMm;
  patchId?: number;
  normal?: OverhangPointMm;
  contactRadiusMm?: number;
  contactOverlapMm?: number;
  reason?: string;
}

export interface OverhangAssignmentCounts {
  total: number;
  inside: number;
  outside: number;
  unresolved: number;
  duplicate: number;
  unassigned: number;
}

export interface OverhangAssignmentLedger {
  policy: typeof OVERHANG_SUPPORT_POLICY;
  entries: OverhangAssignmentEntry[];
  counts: OverhangAssignmentCounts;
}

export interface OverhangSupportPolicyInput {
  /** Preferred direct form when a caller already has mixed targets. */
  targets?: readonly OverhangTargetInput[];
  /** Convenience form used by diagnosis + Profile callers. */
  diagnosedFaces?: Float32Array | readonly (Float32Array | readonly number[])[];
  explicitTargets?: readonly OverhangExplicitTargetMm[];
  finalSurfacePositionsMm: Float32Array;
  /** BODY can contribute additional lower occlusion; malformed BODY fails closed. */
  bodyPositionsMm?: Float32Array;
}

export interface OverhangDryWebTarget {
  assignmentId: string;
  patchId?: number;
  position: { x: number; y: number; z: number };
  normal?: { x: number; y: number; z: number };
  markerRadius: number;
  reachedByInternal: boolean;
  basis: "finalMesh";
}

export interface OverhangSupportPolicyResult extends OverhangAssignmentLedger {
  /** Only outside diagnosed faces may flow to the scaffold builder. */
  outsideFacePositionsMm: Float32Array;
  /** Only outside Profile points may flow to the scaffold builder. */
  outsideExplicitTargetsMm: OverhangExplicitTargetMm[];
  /** Only inside assignments may flow to targeted Dry Web. */
  insideTargets: OverhangDryWebTarget[];
}

function sourcePrefix(source: OverhangTargetSource): string {
  return source === "diagnosed-face" ? "diagnosed-face" : "explicit-profile";
}

function stableId(source: OverhangTargetSource, sourceIndex: number): string {
  return `${sourcePrefix(source)}:${String(sourceIndex).padStart(6, "0")}`;
}

function finitePoint(point: OverhangPointMm | undefined): OverhangPointMm | null {
  if (!point || ![point.xMm, point.yMm, point.zMm].every(Number.isFinite)) return null;
  return { xMm: point.xMm, yMm: point.yMm, zMm: point.zMm };
}

function asPoint(target: OverhangTargetInput): OverhangPointMm | null {
  return finitePoint(target.positionMm) ?? finitePoint({ xMm: target.xMm!, yMm: target.yMm!, zMm: target.zMm! });
}

function asFace(target: OverhangTargetInput): Float32Array | null {
  if (!target.positionsMm || target.positionsMm.length !== 9) return null;
  const positions = new Float32Array(target.positionsMm);
  if (!Array.from(positions).every(Number.isFinite)) return null;
  return positions;
}

function normalOrUndefined(normal: OverhangPointMm | undefined): { x: number; y: number; z: number } | undefined {
  const point = finitePoint(normal);
  if (!point) return undefined;
  const length = Math.hypot(point.xMm, point.yMm, point.zMm);
  return length > 1e-8
    ? { x: point.xMm / length, y: point.yMm / length, z: point.zMm / length }
    : undefined;
}

function explicitToInput(target: OverhangExplicitTargetMm): OverhangTargetInput {
  return {
    source: "explicit-profile",
    positionMm: { xMm: target.xMm, yMm: target.yMm, zMm: target.zMm },
    patchId: target.patchId,
    contactRadiusMm: target.contactRadiusMm,
    contactOverlapMm: target.contactOverlapMm,
  };
}

function flattenFaces(faces: Float32Array | readonly (Float32Array | readonly number[])[] | undefined): Array<Float32Array | readonly number[]> {
  if (!faces) return [];
  if (faces instanceof Float32Array) {
    if (faces.length % 9 !== 0) return [faces];
    const result: Float32Array[] = [];
    for (let offset = 0; offset < faces.length; offset += 9) result.push(faces.slice(offset, offset + 9));
    return result;
  }
  return Array.from(faces);
}

/** Build a mixed diagnosed-face/Profile ledger with deterministic IDs. */
export function assignOverhangSupportTargets(input: OverhangSupportPolicyInput): OverhangSupportPolicyResult {
  const finalSurface = input.bodyPositionsMm
    ? new Float32Array([...input.finalSurfacePositionsMm, ...input.bodyPositionsMm])
    : input.finalSurfacePositionsMm;
  const reachability = createSupportReachabilityIndex(finalSurface);
  const targets = input.targets
    ? Array.from(input.targets)
    : [
      ...flattenFaces(input.diagnosedFaces).map((positionsMm): OverhangTargetInput => ({ source: "diagnosed-face", positionsMm })),
      ...(input.explicitTargets ?? []).map(explicitToInput),
    ];
  const sourceCounts: Record<OverhangTargetSource, number> = { "diagnosed-face": 0, "explicit-profile": 0 };
  const entries: OverhangAssignmentEntry[] = targets.map((target) => {
    const source = target.source;
    const sourceIndex = sourceCounts[source]++;
    const id = stableId(source, sourceIndex);
    if (source === "diagnosed-face") {
      const positionsMm = asFace(target);
      if (!positionsMm) {
        return { id, source, sourceIndex, classification: "unresolved", positionsMm: target.positionsMm ? new Float32Array(target.positionsMm) : undefined, patchId: target.patchId, normal: target.normal, contactRadiusMm: target.contactRadiusMm, contactOverlapMm: target.contactOverlapMm, reason: "malformed-or-nonfinite-diagnosed-face" };
      }
      const classification = reachability.classifyTriangle(positionsMm);
      return {
        id, source, sourceIndex, classification, positionsMm, patchId: target.patchId,
        normal: target.normal, contactRadiusMm: target.contactRadiusMm, contactOverlapMm: target.contactOverlapMm, ...(classification === "unresolved" ? { reason: "partially-occluded-or-unclassifiable" } : {}),
      };
    }
    const positionMm = asPoint(target);
    if (!positionMm) {
      return { id, source, sourceIndex, classification: "unresolved", positionMm: target.positionMm, patchId: target.patchId, normal: target.normal, contactRadiusMm: target.contactRadiusMm, contactOverlapMm: target.contactOverlapMm, reason: "malformed-or-nonfinite-explicit-target" };
    }
    const classification = reachability.classifyPoint(positionMm.xMm, positionMm.yMm, positionMm.zMm);
    return {
      id, source, sourceIndex, classification, positionMm, patchId: target.patchId,
      normal: target.normal, contactRadiusMm: target.contactRadiusMm, contactOverlapMm: target.contactOverlapMm, ...(classification === "unresolved" ? { reason: "unclassifiable-explicit-target" } : {}),
    };
  });
  const counts = summarizeOverhangAssignmentLedger({ policy: OVERHANG_SUPPORT_POLICY, entries });
  const outsideFaces: number[] = [];
  const outsideExplicit: OverhangExplicitTargetMm[] = [];
  const insideTargets: OverhangDryWebTarget[] = [];
  for (const entry of entries) {
    if (entry.classification === "outside" && entry.source === "diagnosed-face" && entry.positionsMm) {
      outsideFaces.push(...entry.positionsMm);
    } else if (entry.classification === "outside" && entry.source === "explicit-profile" && entry.positionMm) {
      outsideExplicit.push({ ...entry.positionMm, ...(entry.patchId === undefined ? {} : { patchId: entry.patchId }), ...(entry.contactRadiusMm === undefined ? {} : { contactRadiusMm: entry.contactRadiusMm }), ...(entry.contactOverlapMm === undefined ? {} : { contactOverlapMm: entry.contactOverlapMm }) });
    } else if (entry.classification === "inside") {
      const position = entry.positionMm ?? (entry.positionsMm
        ? { xMm: (entry.positionsMm[0] + entry.positionsMm[3] + entry.positionsMm[6]) / 3, yMm: (entry.positionsMm[1] + entry.positionsMm[4] + entry.positionsMm[7]) / 3, zMm: (entry.positionsMm[2] + entry.positionsMm[5] + entry.positionsMm[8]) / 3 }
        : null);
      if (!position) continue;
      insideTargets.push({
        assignmentId: entry.id, patchId: entry.patchId,
        position: { x: position.xMm, y: position.yMm, z: position.zMm },
        normal: normalOrUndefined(entry.normal), markerRadius: 0.035, reachedByInternal: false, basis: "finalMesh",
      });
    }
  }
  return {
    policy: OVERHANG_SUPPORT_POLICY, entries, counts,
    outsideFacePositionsMm: new Float32Array(outsideFaces), outsideExplicitTargetsMm: outsideExplicit, insideTargets,
  };
}

function emptyCounts(): OverhangAssignmentCounts {
  return { total: 0, inside: 0, outside: 0, unresolved: 0, duplicate: 0, unassigned: 0 };
}

/** Recompute counts from a ledger, retaining malformed entries as unresolved. */
export function summarizeOverhangAssignmentLedger(ledger: Pick<OverhangAssignmentLedger, "entries" | "policy">): OverhangAssignmentCounts {
  const counts = emptyCounts();
  counts.total = ledger.entries.length;
  const seen = new Set<string>();
  for (const entry of ledger.entries) {
    if (seen.has(entry.id)) counts.duplicate++;
    else seen.add(entry.id);
    if (entry.classification === "inside") counts.inside++;
    else if (entry.classification === "outside") counts.outside++;
    else if (entry.classification === "unresolved") counts.unresolved++;
    else counts.unassigned++;
  }
  counts.unassigned += Math.max(0, counts.total - counts.inside - counts.outside - counts.unresolved - counts.unassigned);
  return counts;
}

/** Fail closed for duplicate, missing, unresolved, or non-partitioned ledgers. */
export function validateOverhangAssignmentLedger(ledger: OverhangAssignmentLedger): OverhangAssignmentCounts {
  if (ledger.policy !== OVERHANG_SUPPORT_POLICY) throw new Error(`Unsupported overhang support policy: ${ledger.policy}`);
  const counts = summarizeOverhangAssignmentLedger(ledger);
  if (counts.total !== counts.inside + counts.outside + counts.unresolved) {
    throw new Error("Fail closed: overhang assignment ledger is not a complete partition");
  }
  if (counts.duplicate !== 0) throw new Error(`Fail closed: duplicate overhang assignments (${counts.duplicate})`);
  if (counts.unassigned !== 0) throw new Error(`Fail closed: unassigned overhang targets (${counts.unassigned})`);
  if (counts.unresolved !== 0) throw new Error(`Fail closed: unresolved overhang targets (${counts.unresolved})`);
  return counts;
}

/** Alias kept deliberately descriptive for callers that use “classify”. */
export const classifyOverhangTargets = assignOverhangSupportTargets;
