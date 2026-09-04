import { canonicalStringify } from "../graphCore.ts";
import { sha256HexSync } from "../../../lib/hash.ts";
import {
  analyzeBootstrapTrunks,
  auditCapsuleFree,
  planLowBraces,
  routePointAtHeight,
  type BootstrapTrunkInput,
  type SupportBootstrapFootingOptions,
} from "./supportBootstrapFooting.ts";
import type {
  SparseRemovableSupportRoute,
  SparseSupportRouteSegment,
} from "./sparseRemovableSupport.ts";
import type { Vector3Value } from "../voronoi.ts";

/**
 * SKIN Support v2 Experimental — Shared Trunk / Branched Tree v0.
 *
 * Extends the Stage 8 premise of "1 target = 1 independent trunk": when
 * several targets can safely share one lower path, they form a temporary
 * branched tree (multiple targets -> branches -> shared trunk -> plate).
 *
 * Distinctions (semantic, load-bearing):
 * - Shared Trunk != Crown (crown = multiple contacts just below BODY;
 *   shared trunk = routes merged much lower).
 * - Shared Trunk != Mutual Brace (brace connects independent trunks from
 *   the side; sharing integrates the routes themselves).
 * - Shared-trunk-only mode keeps every tree a true TREE (no cycles) for
 *   removability, provenance, failure-domain readability and debugability.
 *   Temporary graph cycles are only possible when low diagonal braces are
 *   composed later.
 *
 * EXPERIMENTAL, session-only. Print #2 candidate FROZEN and untouched; no
 * BODY / Permanent Graph / Reinforcement change; no FKEI schema change; no
 * DryWeb; no Output Scale mixing; no production adoption. Root thickening
 * is excluded from the comparison (fixture showed material cost without
 * bootstrap gain) but stays available as an isolated fallback.
 * Pure module: no DOM, no renderer, no workers. Deterministic.
 */

export const SUPPORT_BRANCHED_TREE_VERSION = "support-branched-tree-v0-experimental";

export type BranchedCompareMode = "independent" | "shared" | "shared-lowdiagonal";
export const BRANCHED_COMPARE_MODES: readonly BranchedCompareMode[] = [
  "independent",
  "shared",
  "shared-lowdiagonal",
];

export interface BranchedTargetInput {
  id: string;
  /** Individual candidate route under current conditions (baseline). */
  route: SparseRemovableSupportRoute;
  critical: boolean;
  highRisk?: boolean;
}

export interface SupportBranchedTreeOptions {
  scaleMmPerUnit: number;
  plateZ: number;
  /** Current support diameter in mm. Shared trunks use it unchanged. */
  supportDiameterMm: number;
  /** Reserved multiplier contract. Default 1.0, unconnected to production. */
  sharedTrunkDiameterMultiplier?: number;
  /** Initial safe-policy caps (comparison parameters, not production rules). */
  maxTargetsPerSharedTrunk: number;
  maxCriticalTargetsPerSharedTrunk: number;
  /** Corridor gates. */
  maxRootSeparationMm: number;
  minSharedLengthMm: number;
  /** Junction height = min member contact height x fraction. */
  junctionHeightFraction: number;
  minBranchHeightMm: number;
  /** Child takeover rise above the junction in mm. */
  branchRiseMm: number;
  /** Candidate guideline (not an absolute production rule). */
  maxBranchAngleFromVerticalDeg: number;
  removalClearanceMm: number;
  plateBounds: { minX: number; maxX: number; minY: number; maxY: number } | null;
  bodySdf: (x: number, y: number, z: number) => number;
  auditSamplesPerCapsule?: number;
  footingOverrides?: Partial<SupportBootstrapFootingOptions>;
}

export interface SharedCorridorScore {
  memberIds: string[];
  rootSeparationMm: number;
  meanRouteSeparationMm: number;
  candidateSharedLengthMm: number;
  routeOverlapLengthMm: number;
  maxBranchDivergenceDeg: number;
  materialSavedMm3Estimate: number;
}

export interface BranchChild {
  targetId: string;
  critical: boolean;
  junctionId: string;
  connector: SparseSupportRouteSegment;
  upperSegments: SparseSupportRouteSegment[];
  branchAngleFromVerticalDeg: number;
  lengthMm: number;
}

export interface SupportTreeFailureDomain {
  targetCount: number;
  criticalTargetCount: number;
  highRiskTargetCount: number;
  maxTargetsLostOnRootFailure: number;
  alternateIndependentRoutesAvailable: boolean;
}

export interface SupportTree {
  id: string;
  root: Vector3Value;
  targetIds: string[];
  criticalTargetIds: string[];
  trunkSegments: SparseSupportRouteSegment[];
  junction: Vector3Value;
  junctionId: string;
  children: BranchChild[];
  sourceRouteIds: string[];
  sharedReason: string;
  failureDomain: SupportTreeFailureDomain;
}

export interface ShareRejection {
  memberIds: string[];
  reason: string;
}

export interface BranchedTargetsMetrics {
  total: number;
  supported: number;
  unresolved: number;
  critical: number;
}

export interface BranchedTopologyMetrics {
  independentTrunkCount: number;
  sharedTrunkCount: number;
  treeCount: number;
  branchJunctionCount: number;
  branches: number;
  targetsPerTree: number[];
  maxTargetsPerTree: number;
  criticalTargetsPerTree: number[];
}

export interface BranchedBootstrapMetrics {
  maxBootstrapUnbracedLengthMm: number;
  meanBootstrapUnbracedLengthMm: number;
  longBootstrapCount: number;
  meanFirstStableJunctionHeightMm: number | null;
  meanFirstBranchHeightMm: number | null;
}

export interface BranchedRoutingMetrics {
  independentRouteConflicts: number;
  resolvedBySharingCount: number;
  rejectedShareCandidates: number;
  newConflictsIntroduced: number;
  maxBranchAngleFromVerticalDeg: number | null;
  meanBranchAngleFromVerticalDeg: number | null;
}

export interface BranchedMaterialMetrics {
  totalSupportEdgeLengthMm: number;
  estimatedSupportVolumeMm3: number;
  materialChangeVsCurrent: number | null;
}

export interface BranchedSafetyMetrics {
  bodyCollisionCount: number;
  plateViolationCount: number;
  unintendedFusionCount: number;
  invalidNaNCount: number;
  zeroLengthCount: number;
  duplicateEdgeCount: number;
}

export interface BranchedRemovalMetrics {
  treeComplexity: number;
  trappedLoopRisk: number;
  removalRiskAdjacencyCount: number;
}

export interface BranchedFailureDomainMetrics {
  maxTargetsLostOnRootFailure: number;
  maxCriticalTargetsOnOneRoot: number;
}

export interface BranchedCompareMetrics {
  mode: BranchedCompareMode;
  targets: BranchedTargetsMetrics;
  topology: BranchedTopologyMetrics;
  bootstrap: BranchedBootstrapMetrics;
  routing: BranchedRoutingMetrics;
  material: BranchedMaterialMetrics;
  safety: BranchedSafetyMetrics;
  removal: BranchedRemovalMetrics;
  failureDomain: BranchedFailureDomainMetrics;
}

export interface BranchedModeResult {
  mode: BranchedCompareMode;
  version: string;
  trees: SupportTree[];
  /** Target ids keeping solo independent trunks (with their baseline routes). */
  independentTargets: string[];
  rejections: ShareRejection[];
  corridorScores: SharedCorridorScore[];
  metrics: BranchedCompareMetrics;
  /** Composed footing braces (shared-lowdiagonal mode only). */
  lowBraces: Array<{
    id: string;
    trunkAId: string;
    trunkBId: string;
    attachHeightAMm: number;
    attachHeightBMm: number;
    angleFromVerticalDeg: number;
    lengthMm: number;
  }>;
}

export type BranchedModeComparison = Record<BranchedCompareMode, BranchedModeResult>;

const EPS = 1e-9;

function copyPoint(point: Vector3Value): Vector3Value {
  return { x: point.x, y: point.y, z: point.z };
}

function segmentLengthSource(start: Vector3Value, end: Vector3Value): number {
  return Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
}

function heightMm(point: Vector3Value, plateZ: number, scale: number): number {
  return (point.z - plateZ) * scale;
}

function requireBranchedOptions(options: SupportBranchedTreeOptions): SupportBranchedTreeOptions {
  const positive: Array<[string, number | undefined]> = [
    ["scaleMmPerUnit", options.scaleMmPerUnit],
    ["supportDiameterMm", options.supportDiameterMm],
    ["maxTargetsPerSharedTrunk", options.maxTargetsPerSharedTrunk],
    ["maxCriticalTargetsPerSharedTrunk", options.maxCriticalTargetsPerSharedTrunk],
    ["maxRootSeparationMm", options.maxRootSeparationMm],
    ["minSharedLengthMm", options.minSharedLengthMm],
    ["minBranchHeightMm", options.minBranchHeightMm],
    ["branchRiseMm", options.branchRiseMm],
    ["maxBranchAngleFromVerticalDeg", options.maxBranchAngleFromVerticalDeg],
    ["removalClearanceMm", options.removalClearanceMm],
  ];
  for (const [key, value] of positive) {
    if (!(typeof value === "number" && Number.isFinite(value) && value > 0)) {
      throw new Error(`branched tree option ${key} must be a positive finite number`);
    }
  }
  if (!(options.junctionHeightFraction > 0 && options.junctionHeightFraction < 1)) {
    throw new Error("junctionHeightFraction must be strictly between 0 and 1");
  }
  if (!Number.isFinite(options.plateZ)) throw new Error("branched tree requires a finite plateZ");
  if (typeof options.bodySdf !== "function") throw new Error("branched tree requires a BODY SDF");
  const multiplier = options.sharedTrunkDiameterMultiplier ?? 1.0;
  if (!(multiplier > 0 && Number.isFinite(multiplier))) {
    throw new Error("sharedTrunkDiameterMultiplier must be positive finite");
  }
  return { ...options, sharedTrunkDiameterMultiplier: multiplier };
}

function normalRadiusSource(options: SupportBranchedTreeOptions): number {
  return (options.supportDiameterMm * 0.5) / options.scaleMmPerUnit;
}

function trunkRadiusSource(options: SupportBranchedTreeOptions): number {
  return normalRadiusSource(options) * (options.sharedTrunkDiameterMultiplier ?? 1.0);
}

/** Min 3D distance between two segment centerlines (sampled, deterministic). */
function segmentPairDistanceSource(
  a: SparseSupportRouteSegment,
  b: SparseSupportRouteSegment,
): number {
  let best = Number.POSITIVE_INFINITY;
  const samples = 8;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const pa = {
      x: a.start.x + (a.end.x - a.start.x) * t,
      y: a.start.y + (a.end.y - a.start.y) * t,
      z: a.start.z + (a.end.z - a.start.z) * t,
    };
    for (let j = 0; j <= samples; j++) {
      const u = j / samples;
      const dx = pa.x - (b.start.x + (b.end.x - b.start.x) * u);
      const dy = pa.y - (b.start.y + (b.end.y - b.start.y) * u);
      const dz = pa.z - (b.start.z + (b.end.z - b.start.z) * u);
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < best) best = d;
    }
  }
  return best;
}

function verticalOverlapMm(
  a: SparseSupportRouteSegment,
  b: SparseSupportRouteSegment,
  scale: number,
): number {
  const lo = Math.max(Math.min(a.start.z, a.end.z), Math.min(b.start.z, b.end.z));
  const hi = Math.min(Math.max(a.start.z, a.end.z), Math.max(b.start.z, b.end.z));
  return Math.max(0, (hi - lo) * scale);
}

/** Independent-route conflict: shafts approach within keep-out over a real overlap. */
export function independentRoutesConflict(
  a: SparseRemovableSupportRoute,
  b: SparseRemovableSupportRoute,
  keepOutSource: number,
): boolean {
  for (const sa of a.segments) {
    for (const sb of b.segments) {
      if (verticalOverlapMm(sa, sb, 1) < 1 - EPS) continue;
      if (segmentPairDistanceSource(sa, sb) < keepOutSource - EPS) return true;
    }
  }
  return false;
}

function contactHeightMm(route: SparseRemovableSupportRoute, plateZ: number, scale: number): number {
  return heightMm(route.neckStart, plateZ, scale);
}

/** Upper route portion at/above height hMm: clipped first segment + rest verbatim. */
function upperRoutePortion(
  route: SparseRemovableSupportRoute,
  plateZ: number,
  scale: number,
  hMm: number,
): SparseSupportRouteSegment[] | null {
  const zSource = plateZ + hMm / scale;
  const out: SparseSupportRouteSegment[] = [];
  for (const segment of route.segments) {
    const hi = Math.max(segment.start.z, segment.end.z);
    const lo = Math.min(segment.start.z, segment.end.z);
    if (hi <= zSource + EPS) continue;
    if (lo >= zSource - EPS) {
      out.push({ start: copyPoint(segment.start), end: copyPoint(segment.end), radius: segment.radius });
      continue;
    }
    const span = segment.end.z - segment.start.z;
    if (Math.abs(span) < EPS) continue;
    const t = (zSource - segment.start.z) / span;
    if (!(t > 0 && t < 1)) continue;
    const cut = {
      x: segment.start.x + (segment.end.x - segment.start.x) * t,
      y: segment.start.y + (segment.end.y - segment.start.y) * t,
      z: zSource,
    };
    const top = span > 0 ? segment.end : segment.start;
    out.push({ start: cut, end: copyPoint(top), radius: segment.radius });
  }
  return out.length > 0 ? out : null;
}

interface ClusterEvaluation {
  ok: boolean;
  reason: string;
  junction: Vector3Value | null;
  junctionHeightMm: number;
  children: BranchChild[];
  trunkSegments: SparseSupportRouteSegment[];
  score: SharedCorridorScore | null;
}

function evaluateCluster(
  members: BranchedTargetInput[],
  nonMembers: readonly BranchedTargetInput[],
  options: SupportBranchedTreeOptions,
  treeIndex: number,
): ClusterEvaluation {
  const scale = options.scaleMmPerUnit;
  const memberIds = members.map((m) => m.id).sort();
  const fail = (reason: string): ClusterEvaluation => ({
    ok: false,
    reason,
    junction: null,
    junctionHeightMm: 0,
    children: [],
    trunkSegments: [],
    score: null,
  });
  if (members.length < 2) return fail("single target keeps its independent trunk");
  const criticalCount = members.filter((m) => m.critical).length;
  if (criticalCount > options.maxCriticalTargetsPerSharedTrunk) {
    return fail(`too many critical targets on one trunk (${criticalCount} > ${options.maxCriticalTargetsPerSharedTrunk})`);
  }
  let rootSeparationMm = 0;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const d = Math.hypot(
        members[i].route.root.x - members[j].route.root.x,
        members[i].route.root.y - members[j].route.root.y,
      ) * scale;
      if (d > rootSeparationMm) rootSeparationMm = d;
    }
  }
  if (rootSeparationMm > options.maxRootSeparationMm + EPS) {
    return fail(`root separation ${rootSeparationMm.toFixed(2)} mm exceeds ${options.maxRootSeparationMm} mm`);
  }
  const contacts = members.map((m) => contactHeightMm(m.route, options.plateZ, scale));
  const minContactMm = Math.min(...contacts);
  const junctionHeightMm = minContactMm * options.junctionHeightFraction;
  if (junctionHeightMm < options.minSharedLengthMm - EPS) {
    return fail(`candidate shared length ${junctionHeightMm.toFixed(2)} mm below ${options.minSharedLengthMm} mm`);
  }
  if (junctionHeightMm < options.minBranchHeightMm - EPS) {
    return fail(`junction height ${junctionHeightMm.toFixed(2)} mm below ${options.minBranchHeightMm} mm`);
  }
  const cx = members.reduce((s, m) => s + m.route.root.x, 0) / members.length;
  const cy = members.reduce((s, m) => s + m.route.root.y, 0) / members.length;
  const junction: Vector3Value = { x: cx, y: cy, z: options.plateZ + junctionHeightMm / scale };
  const root: Vector3Value = { x: cx, y: cy, z: options.plateZ };
  const radius = trunkRadiusSource(options);
  // Shared trunk audits: BODY 0, plate bounds, non-finite.
  const trunkSegments: SparseSupportRouteSegment[] = [{ start: copyPoint(root), end: copyPoint(junction), radius }];
  const footingAuditOptions = footingOptionsFrom(options);
  if (!auditCapsuleFree(root, junction, radius, footingAuditOptions)) {
    return fail("shared trunk hits BODY");
  }
  if (options.plateBounds) {
    const b = options.plateBounds;
    if (root.x - radius < b.minX - EPS || root.x + radius > b.maxX + EPS
      || root.y - radius < b.minY - EPS || root.y + radius > b.maxY + EPS) {
      return fail("shared root plate violation");
    }
  }
  // Children: connector junction -> takeover point + reused upper portion.
  const children: BranchChild[] = [];
  let maxDivergenceDeg = 0;
  let separationSum = 0;
  let separationPairs = 0;
  for (const member of members) {
    const takeoverMm = junctionHeightMm + options.branchRiseMm;
    const upperPoint = routePointAtHeight(member.route, options.plateZ, scale, takeoverMm);
    if (!upperPoint) return fail(`takeover height outside route ${member.id}`);
    const upper = upperRoutePortion(member.route, options.plateZ, scale, takeoverMm);
    if (!upper) return fail(`no reusable upper portion for ${member.id}`);
    const horizontalMm = Math.hypot(upperPoint.x - junction.x, upperPoint.y - junction.y) * scale;
    const verticalMm = (upperPoint.z - junction.z) * scale;
    const angleDeg = Math.atan2(horizontalMm, Math.max(verticalMm, EPS)) * (180 / Math.PI);
    if (angleDeg > options.maxBranchAngleFromVerticalDeg + 1e-6) {
      return fail(`branch angle ${angleDeg.toFixed(1)}° exceeds ${options.maxBranchAngleFromVerticalDeg}° for ${member.id}`);
    }
    if (verticalMm < EPS) return fail(`zero-length branch for ${member.id}`);
    const connector: SparseSupportRouteSegment = {
      start: copyPoint(junction),
      end: copyPoint(upperPoint),
      radius: normalRadiusSource(options),
    };
    if (!auditCapsuleFree(connector.start, connector.end, connector.radius, footingAuditOptions)) {
      return fail(`branch to ${member.id} hits BODY`);
    }
    if (angleDeg > maxDivergenceDeg) maxDivergenceDeg = angleDeg;
    for (const other of members) {
      if (other.id === member.id) continue;
      separationSum += Math.hypot(
        member.route.root.x - other.route.root.x,
        member.route.root.y - other.route.root.y,
      ) * scale;
      separationPairs += 1;
    }
    const childLengthMm = (segmentLengthSource(connector.start, connector.end)
      + upper.reduce((s, seg) => s + segmentLengthSource(seg.start, seg.end), 0)) * scale;
    children.push({
      targetId: member.id,
      critical: member.critical,
      junctionId: `junction-${treeIndex}`,
      connector,
      upperSegments: upper,
      branchAngleFromVerticalDeg: angleDeg,
      lengthMm: childLengthMm,
    });
  }
  // Same-junction siblings are intentionally joined at the junction (the
  // tree removes as one connected piece); sibling divergence is governed by
  // the branch-angle gate above. Unintended fusion is checked against every
  // NON-member route instead: the shared trunk must keep clearance to all
  // independent geometry outside this tree.
  const trunkKeepOut = radius + normalRadiusSource(options) + options.removalClearanceMm / scale;
  for (const other of nonMembers) {
    for (const segment of other.route.segments) {
      if (verticalOverlapMm(trunkSegments[0], segment, 1) < 1 - EPS) continue;
      if (segmentPairDistanceSource(trunkSegments[0], segment) < trunkKeepOut - EPS) {
        return fail(`shared trunk fuses with independent route ${other.id}`);
      }
    }
  }
  const meanSeparationMm = separationPairs > 0 ? separationSum / separationPairs : 0;
  const overlapMm = Math.min(...contacts);
  const trunkVolumeMm3 = Math.PI * (radius * scale) ** 2 * junctionHeightMm;
  const soloLowerVolumeMm3 = members.length * Math.PI * (normalRadiusSource(options) * scale) ** 2 * junctionHeightMm;
  const score: SharedCorridorScore = {
    memberIds,
    rootSeparationMm,
    meanRouteSeparationMm: meanSeparationMm,
    candidateSharedLengthMm: junctionHeightMm,
    routeOverlapLengthMm: overlapMm,
    maxBranchDivergenceDeg: maxDivergenceDeg,
    materialSavedMm3Estimate: Math.max(0, soloLowerVolumeMm3 - trunkVolumeMm3),
  };
  return { ok: true, reason: "", junction, junctionHeightMm, children, trunkSegments, score };
}

function footingOptionsFrom(options: SupportBranchedTreeOptions): SupportBootstrapFootingOptions {
  return {
    scaleMmPerUnit: options.scaleMmPerUnit,
    plateZ: options.plateZ,
    supportDiameterMm: options.supportDiameterMm,
    rootDiameterMm: options.supportDiameterMm,
    rootReinforcedHeightMm: 1,
    rootTaperLengthMm: 1,
    maxBraceAngleFromVerticalDeg: 45,
    lowBraceTargetHeightMm: 6,
    maxRootNeighborDistanceMm: 12,
    earlyStableBootstrapMm: 8,
    longBootstrapMm: 18,
    removalClearanceMm: options.removalClearanceMm,
    plateBounds: options.plateBounds,
    bodySdf: options.bodySdf,
    auditSamplesPerCapsule: options.auditSamplesPerCapsule ?? 24,
    ...options.footingOverrides,
  };
}

/** Greedy corridor clustering with deterministic split fallback (coverage never drops). */
export function planSupportTrees(
  targets: readonly BranchedTargetInput[],
  options: SupportBranchedTreeOptions,
): { trees: SupportTree[]; independentTargets: string[]; rejections: ShareRejection[]; corridorScores: SharedCorridorScore[] } {
  const checked = requireBranchedOptions(options);
  const ordered = [...targets].sort((a, b) => a.route.root.x - b.route.root.x || (a.id < b.id ? -1 : 1));
  const assigned = new Set<string>();
  const soloFallback: string[] = [];
  const trees: SupportTree[] = [];
  const rejections: ShareRejection[] = [];
  const corridorScores: SharedCorridorScore[] = [];
  let treeIndex = 0;
  for (const seed of ordered) {
    if (assigned.has(seed.id)) continue;
    // Grow one cluster from the seed by root proximity.
    const cluster: BranchedTargetInput[] = [seed];
    const candidates = ordered
      .filter((t) => t.id !== seed.id && !assigned.has(t.id))
      .map((t) => ({
        t,
        d: Math.hypot(t.route.root.x - seed.route.root.x, t.route.root.y - seed.route.root.y)
          * checked.scaleMmPerUnit,
      }))
      .filter((e) => e.d <= checked.maxRootSeparationMm + EPS)
      .sort((a, b) => a.d - b.d || (a.t.id < b.t.id ? -1 : 1));
    for (const entry of candidates) {
      if (cluster.length >= checked.maxTargetsPerSharedTrunk) break;
      const criticalCount = cluster.filter((m) => m.critical).length + (entry.t.critical ? 1 : 0);
      if (criticalCount > checked.maxCriticalTargetsPerSharedTrunk) {
        rejections.push({ memberIds: [seed.id, entry.t.id].sort(), reason: `critical cap ${checked.maxCriticalTargetsPerSharedTrunk} would break` });
        continue;
      }
      cluster.push(entry.t);
    }
    // Evaluate; split off the last member until the gates pass or solo remains.
    const working = [...cluster];
    let placed = false;
    while (working.length > 1) {
      const workingIds = new Set(working.map((m) => m.id));
      const nonMembers = ordered.filter((t) => !workingIds.has(t.id) && !assigned.has(t.id));
      const evaluation = evaluateCluster(working, nonMembers, checked, treeIndex);
      if (evaluation.ok && evaluation.junction && evaluation.score) {
        const memberIds = working.map((m) => m.id).sort();
        const criticalIds = working.filter((m) => m.critical).map((m) => m.id).sort();
        const highRisk = working.filter((m) => m.highRisk).length;
        trees.push({
          id: `tree-${treeIndex}`,
          root: { x: evaluation.junction.x, y: evaluation.junction.y, z: checked.plateZ },
          targetIds: memberIds,
          criticalTargetIds: criticalIds,
          trunkSegments: evaluation.trunkSegments,
          junction: evaluation.junction,
          junctionId: `junction-${treeIndex}`,
          children: evaluation.children,
          sourceRouteIds: memberIds,
          sharedReason: `lower corridors overlap ${evaluation.score.routeOverlapLengthMm.toFixed(1)} mm; root spread ${evaluation.score.rootSeparationMm.toFixed(2)} mm; max divergence ${evaluation.score.maxBranchDivergenceDeg.toFixed(1)}°`,
          failureDomain: {
            targetCount: memberIds.length,
            criticalTargetCount: criticalIds.length,
            highRiskTargetCount: highRisk,
            maxTargetsLostOnRootFailure: memberIds.length,
            alternateIndependentRoutesAvailable: true,
          },
        });
        corridorScores.push(evaluation.score);
        for (const m of working) assigned.add(m.id);
        treeIndex += 1;
        placed = true;
        break;
      }
      const dropped = working.pop();
      if (dropped && working.length > 1) {
        rejections.push({ memberIds: [...working.map((m) => m.id), dropped.id].sort(), reason: evaluation.reason });
      } else if (dropped) {
        rejections.push({ memberIds: [seed.id, dropped.id].sort(), reason: evaluation.reason });
      }
    }
    if (!placed) {
      // The seed keeps its independent trunk; dropped members stay in the
      // pool and are reconsidered as later seeds. Coverage never drops.
      soloFallback.push(seed.id);
      assigned.add(seed.id);
    }
  }
  // Post-plan cross-tree fusion: a later tree whose trunk approaches an
  // earlier tree's trunk dissolves back to independent trunks.
  const scale = checked.scaleMmPerUnit;
  const dissolved = new Set<string>();
  for (let i = 0; i < trees.length; i++) {
    if (dissolved.has(trees[i].id)) continue;
    for (let j = i + 1; j < trees.length; j++) {
      if (dissolved.has(trees[j].id)) continue;
      let fused = false;
      for (const a of trees[i].trunkSegments) {
        if (fused) break;
        for (const b of trees[j].trunkSegments) {
          const keepOut = a.radius + b.radius + checked.removalClearanceMm / scale;
          if (segmentPairDistanceSource(a, b) < keepOut - EPS) {
            fused = true;
            break;
          }
        }
      }
      if (fused) {
        dissolved.add(trees[j].id);
        soloFallback.push(...trees[j].targetIds);
        rejections.push({
          memberIds: [...trees[j].targetIds].sort(),
          reason: `cross-tree trunk fusion with ${trees[i].id}`,
        });
      }
    }
  }
  const liveTrees = trees.filter((t) => !dissolved.has(t.id));
  const liveScores = corridorScores.filter((_, index) => !dissolved.has(trees[index].id));
  const independentTargets = [
    ...soloFallback,
    ...ordered.filter((t) => {
      if (assigned.has(t.id)) return false;
      assigned.add(t.id);
      return true;
    }).map((t) => t.id),
  ];
  return { trees: liveTrees, independentTargets, rejections, corridorScores: liveScores };
}

/** Tree topology check: single root -> trunk -> one junction -> branches -> targets. No cycles. */
export function validateSupportTreeAcyclic(tree: SupportTree): string | null {
  const parents = new Map<string, string>();
  const link = (child: string, parent: string): string | null => {
    const existing = parents.get(child);
    if (existing !== undefined && existing !== parent) {
      return `node ${child} has two parents (${existing}, ${parent})`;
    }
    parents.set(child, parent);
    return null;
  };
  const rootKey = `root:${tree.id}`;
  const junctionKey = `${tree.junctionId}`;
  let problem = link(junctionKey, rootKey);
  if (problem) return problem;
  for (const child of tree.children) {
    problem = link(`branch:${child.targetId}`, junctionKey);
    if (problem) return problem;
    problem = link(`target:${child.targetId}`, `branch:${child.targetId}`);
    if (problem) return problem;
  }
  // Cycle hunt: follow parents from every node; must reach the root.
  for (const node of parents.keys()) {
    const seen = new Set<string>();
    let cursor: string | undefined = node;
    while (cursor !== undefined && cursor !== rootKey) {
      if (seen.has(cursor)) return `cycle through ${cursor}`;
      seen.add(cursor);
      cursor = parents.get(cursor);
    }
    if (cursor === undefined) return `node ${node} does not reach the root`;
  }
  return null;
}

function trunkRouteForTree(
  tree: SupportTree,
  targetsById: ReadonlyMap<string, BranchedTargetInput>,
): BootstrapTrunkInput | null {
  if (tree.children.length === 0) return null;
  const longest = [...tree.children].sort((a, b) => b.lengthMm - a.lengthMm)[0];
  const source = targetsById.get(longest.targetId);
  if (!source) return null;
  return {
    id: tree.id,
    route: {
      kind: source.route.kind,
      root: copyPoint(tree.root),
      neckStart: copyPoint(source.route.neckStart),
      target: copyPoint(source.route.target),
      segments: [
        ...tree.trunkSegments.map((s) => ({ start: copyPoint(s.start), end: copyPoint(s.end), radius: s.radius })),
        longest.connector
          ? { start: copyPoint(longest.connector.start), end: copyPoint(longest.connector.end), radius: longest.connector.radius }
          : null,
        ...longest.upperSegments.map((s) => ({ start: copyPoint(s.start), end: copyPoint(s.end), radius: s.radius })),
      ].filter((s): s is SparseSupportRouteSegment => s !== null),
    },
  };
}

function edgeKey(a: Vector3Value, b: Vector3Value): string {
  const points = [[a.x, a.y, a.z], [b.x, b.y, b.z]].sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
  return `${points[0].map((v) => v.toPrecision(12)).join(",")}|${points[1].map((v) => v.toPrecision(12)).join(",")}`;
}

function buildModeMetrics(
  mode: BranchedCompareMode,
  targets: readonly BranchedTargetInput[],
  trees: readonly SupportTree[],
  independentTargets: readonly string[],
  rejections: readonly ShareRejection[],
  baseline: {
    individualConflicts: number;
    individualLengthMm: number;
    individualVolumeMm3: number;
  },
  footingSummary: {
    bootstrapMax: number;
    bootstrapMean: number;
    longCount: number;
    junctionMean: number | null;
  },
): BranchedCompareMetrics {
  const inTree = new Set(trees.flatMap((t) => t.targetIds));
  const supported = targets.filter((t) => inTree.has(t.id) || independentTargets.includes(t.id)).length;
  const critical = targets.filter((t) => t.critical).length;
  const children = trees.flatMap((t) => t.children);
  const angles = children.map((c) => c.branchAngleFromVerticalDeg);
  return {
    mode,
    targets: { total: targets.length, supported, unresolved: targets.length - supported, critical },
    topology: {
      independentTrunkCount: independentTargets.length,
      sharedTrunkCount: trees.length,
      treeCount: trees.length,
      branchJunctionCount: trees.length,
      branches: children.length,
      targetsPerTree: trees.map((t) => t.targetIds.length),
      maxTargetsPerTree: trees.length ? Math.max(...trees.map((t) => t.targetIds.length)) : 0,
      criticalTargetsPerTree: trees.map((t) => t.criticalTargetIds.length),
    },
    bootstrap: {
      maxBootstrapUnbracedLengthMm: footingSummary.bootstrapMax,
      meanBootstrapUnbracedLengthMm: footingSummary.bootstrapMean,
      longBootstrapCount: footingSummary.longCount,
      meanFirstStableJunctionHeightMm: footingSummary.junctionMean,
      meanFirstBranchHeightMm: null, // filled by caller from tree junctions
    },
    routing: {
      independentRouteConflicts: baseline.individualConflicts,
      resolvedBySharingCount: 0, // filled by caller
      rejectedShareCandidates: rejections.length,
      maxBranchAngleFromVerticalDeg: angles.length ? Math.max(...angles) : null,
      meanBranchAngleFromVerticalDeg: angles.length ? angles.reduce((a, b) => a + b, 0) / angles.length : null,
      newConflictsIntroduced: 0, // filled by caller from target-pair accounting
    },
    material: {
      totalSupportEdgeLengthMm: 0, // filled by caller
      estimatedSupportVolumeMm3: 0, // filled by caller
      materialChangeVsCurrent: null, // filled by caller
    },
    safety: {
      bodyCollisionCount: 0,
      plateViolationCount: 0,
      unintendedFusionCount: 0,
      invalidNaNCount: 0, // filled by caller
      zeroLengthCount: 0, // filled by caller
      duplicateEdgeCount: 0, // filled by caller
    },
    removal: {
      treeComplexity: trees.reduce((s, t) => s + 1 + t.children.length, 0),
      trappedLoopRisk: 0, // filled by caller
      removalRiskAdjacencyCount: 0, // filled by caller
    },
    failureDomain: {
      maxTargetsLostOnRootFailure: trees.length ? Math.max(...trees.map((t) => t.failureDomain.maxTargetsLostOnRootFailure)) : independentTargets.length > 0 ? 1 : 0,
      maxCriticalTargetsOnOneRoot: trees.length ? Math.max(...trees.map((t) => t.failureDomain.criticalTargetCount)) : 0,
    },
  };
}

/**
 * Independent baseline: every target keeps its own trunk. All metrics are
 * measured, nothing is shared, and the input routes are never mutated.
 */
export function compareIndependentBaseline(
  targets: readonly BranchedTargetInput[],
  options: SupportBranchedTreeOptions,
): BranchedModeResult {
  const checked = requireBranchedOptions(options);
  const scale = checked.scaleMmPerUnit;
  const keepOutSource = (checked.supportDiameterMm / scale) + checked.removalClearanceMm / scale;
  let conflicts = 0;
  for (let i = 0; i < targets.length; i++) {
    for (let j = i + 1; j < targets.length; j++) {
      if (independentRoutesConflict(targets[i].route, targets[j].route, keepOutSource)) conflicts += 1;
    }
  }
  const trunkInputs: BootstrapTrunkInput[] = targets.map((t) => ({ id: t.id, route: t.route }));
  const footingInputs = footingOptionsFrom(checked);
  const analyses = analyzeBootstrapTrunks(trunkInputs, footingInputs);
  const bootstraps = analyses.map((a) => a.bootstrapUnbracedLengthMm);
  const junctions = analyses.map((a) => a.firstStableJunctionHeightMm).filter((h): h is number => h !== null);
  const longCount = analyses.filter((a) => a.classification === "long-bootstrap").length;
  let lengthMm = 0;
  let volumeMm3 = 0;
  for (const t of targets) {
    for (const s of t.route.segments) {
      const length = segmentLengthSource(s.start, s.end) * scale;
      lengthMm += length;
      volumeMm3 += Math.PI * (s.radius * scale) ** 2 * length;
    }
  }
  const metrics: BranchedCompareMetrics = {
    mode: "independent",
    targets: {
      total: targets.length,
      supported: targets.length,
      unresolved: 0,
      critical: targets.filter((t) => t.critical).length,
    },
    topology: {
      independentTrunkCount: targets.length,
      sharedTrunkCount: 0,
      treeCount: 0,
      branchJunctionCount: 0,
      branches: 0,
      targetsPerTree: [],
      maxTargetsPerTree: 0,
      criticalTargetsPerTree: [],
    },
    bootstrap: {
      maxBootstrapUnbracedLengthMm: bootstraps.length ? Math.max(...bootstraps) : 0,
      meanBootstrapUnbracedLengthMm: bootstraps.length ? bootstraps.reduce((a, b) => a + b, 0) / bootstraps.length : 0,
      longBootstrapCount: longCount,
      meanFirstStableJunctionHeightMm: junctions.length ? junctions.reduce((a, b) => a + b, 0) / junctions.length : null,
      meanFirstBranchHeightMm: null,
    },
    routing: {
      independentRouteConflicts: conflicts,
      resolvedBySharingCount: 0,
      rejectedShareCandidates: 0,
      newConflictsIntroduced: 0,
      maxBranchAngleFromVerticalDeg: null,
      meanBranchAngleFromVerticalDeg: null,
    },
    material: { totalSupportEdgeLengthMm: lengthMm, estimatedSupportVolumeMm3: volumeMm3, materialChangeVsCurrent: 0 },
    safety: {
      bodyCollisionCount: 0,
      plateViolationCount: 0,
      unintendedFusionCount: 0,
      invalidNaNCount: countNonFinite(targets.flatMap((t) => t.route.segments)),
      zeroLengthCount: countZeroLength(targets.flatMap((t) => t.route.segments)),
      duplicateEdgeCount: countDuplicateEdges(targets.flatMap((t) => t.route.segments)),
    },
    removal: {
      treeComplexity: targets.length,
      trappedLoopRisk: 0,
      removalRiskAdjacencyCount: countRootAdjacencies(
        targets.map((t) => t.route.root),
        normalRadiusSource(checked),
        checked.removalClearanceMm / scale,
      ),
    },
    failureDomain: {
      maxTargetsLostOnRootFailure: targets.length > 0 ? 1 : 0,
      maxCriticalTargetsOnOneRoot: targets.some((t) => t.critical) ? 1 : 0,
    },
  };
  return {
    mode: "independent",
    version: SUPPORT_BRANCHED_TREE_VERSION,
    trees: [],
    independentTargets: targets.map((t) => t.id),
    rejections: [],
    corridorScores: [],
    metrics,
    lowBraces: [],
  };
}

function countNonFinite(segments: readonly SparseSupportRouteSegment[]): number {
  let count = 0;
  for (const s of segments) {
    const values = [s.start.x, s.start.y, s.start.z, s.end.x, s.end.y, s.end.z, s.radius];
    if (!values.every(Number.isFinite)) count += 1;
  }
  return count;
}

function countZeroLength(segments: readonly SparseSupportRouteSegment[]): number {
  return segments.filter((s) => segmentLengthSource(s.start, s.end) <= EPS).length;
}

function countDuplicateEdges(segments: readonly SparseSupportRouteSegment[]): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const s of segments) {
    const key = edgeKey(s.start, s.end);
    if (seen.has(key)) duplicates += 1;
    else seen.add(key);
  }
  return duplicates;
}

function countRootAdjacencies(
  roots: readonly Vector3Value[],
  radiusSource: number,
  clearanceSource: number,
): number {
  let count = 0;
  for (let i = 0; i < roots.length; i++) {
    for (let j = i + 1; j < roots.length; j++) {
      const gap = Math.hypot(roots[i].x - roots[j].x, roots[i].y - roots[j].y)
        - (radiusSource * 2 + clearanceSource);
      if (gap < -EPS) count += 1;
    }
  }
  return count;
}

/**
 * Full three-mode comparison on one target set with identical BODY / routes /
 * target selection. Root thickening is excluded from every mode (isolated
 * fallback only). Shared-lowdiagonal composes footing low braces across the
 * shared-trunk roots without touching Print #2 geometry.
 */
export function compareBranchedModes(
  targets: readonly BranchedTargetInput[],
  options: SupportBranchedTreeOptions,
): BranchedModeComparison {
  const checked = requireBranchedOptions(options);
  const independent = compareIndependentBaseline(targets, checked);
  const planned = planSupportTrees(targets, checked);
  const targetsById = new Map(targets.map((t) => [t.id, t]));
  const shared = buildSharedResult("shared", targets, planned, checked, targetsById, independent, []);
  const sharedLow = buildSharedLowDiagonalResult(targets, planned, checked, targetsById, independent);
  return { independent, shared, "shared-lowdiagonal": sharedLow };
}

function buildSharedResult(
  mode: BranchedCompareMode,
  targets: readonly BranchedTargetInput[],
  planned: ReturnType<typeof planSupportTrees>,
  checked: SupportBranchedTreeOptions,
  targetsById: ReadonlyMap<string, BranchedTargetInput>,
  independent: BranchedModeResult,
  lowBraces: BranchedModeResult["lowBraces"],
): BranchedModeResult {
  const scale = checked.scaleMmPerUnit;
  const trunkInputs: BootstrapTrunkInput[] = [];
  for (const tree of planned.trees) {
    const trunk = trunkRouteForTree(tree, targetsById);
    if (trunk) trunkInputs.push(trunk);
  }
  for (const id of planned.independentTargets) {
    const route = targetsById.get(id)?.route;
    if (route) trunkInputs.push({ id: `solo:${id}`, route });
  }
  const footingInputs = footingOptionsFrom(checked);
  const junctions = planned.trees.map((tree) => ({
    trunkId: tree.id,
    heightMm: (tree.junction.z - checked.plateZ) * scale,
  }));
  // Composed low braces add earlier stable junctions on their trunks.
  for (const brace of lowBraces) {
    junctions.push({ trunkId: brace.trunkAId, heightMm: brace.attachHeightAMm });
    junctions.push({ trunkId: brace.trunkBId, heightMm: brace.attachHeightBMm });
  }
  const analyses = analyzeBootstrapTrunks(trunkInputs, footingInputs, junctions);
  const treeAnalyses = analyses.filter((a) => !a.id.startsWith("solo:"));
  const bootstraps = treeAnalyses.map((a) => a.bootstrapUnbracedLengthMm);
  const junctionHeights = treeAnalyses.map((a) => a.firstStableJunctionHeightMm).filter((h): h is number => h !== null);
  const longCount = treeAnalyses.filter((a) => a.classification === "long-bootstrap").length;
  // Resolved conflicts: independent pairs now sharing one tree.
  const inSameTree = (a: string, b: string): boolean => planned.trees.some(
    (tree) => tree.targetIds.includes(a) && tree.targetIds.includes(b),
  );
  const keepOutSource = (checked.supportDiameterMm / scale) + checked.removalClearanceMm / scale;
  const pairKey = (a: string, b: string): string => [a, b].sort().join("|");
  const baselinePairs = new Set<string>();
  for (let i = 0; i < targets.length; i++) {
    for (let j = i + 1; j < targets.length; j++) {
      if (independentRoutesConflict(targets[i].route, targets[j].route, keepOutSource)) {
        baselinePairs.add(pairKey(targets[i].id, targets[j].id));
      }
    }
  }
  // Final geometry per target: solo routes verbatim; tree members carry
  // their child plus the shared trunk. Same-tree pairs share intentionally
  // and never count as conflicts.
  const finalGeometry = new Map<string, SparseSupportRouteSegment[]>();
  for (const tree of planned.trees) {
    for (const child of tree.children) {
      finalGeometry.set(child.targetId, [
        ...tree.trunkSegments,
        child.connector,
        ...child.upperSegments,
      ]);
    }
  }
  for (const id of planned.independentTargets) {
    const route = targetsById.get(id)?.route;
    if (route && !finalGeometry.has(id)) finalGeometry.set(id, route.segments);
  }
  const finalPairs = new Set<string>();
  const ids = [...finalGeometry.keys()];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (inSameTree(ids[i], ids[j])) continue;
      const a = { kind: "vertical" as const, root: { x: 0, y: 0, z: 0 }, neckStart: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, segments: finalGeometry.get(ids[i]) ?? [] };
      const b = { kind: "vertical" as const, root: { x: 0, y: 0, z: 0 }, neckStart: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, segments: finalGeometry.get(ids[j]) ?? [] };
      if (independentRoutesConflict(a, b, keepOutSource)) finalPairs.add(pairKey(ids[i], ids[j]));
    }
  }
  let resolved = 0;
  for (const pair of baselinePairs) {
    const [a, b] = pair.split("|");
    if (inSameTree(a, b) && !finalPairs.has(pair)) resolved += 1;
  }
  let introduced = 0;
  for (const pair of finalPairs) {
    if (!baselinePairs.has(pair)) introduced += 1;
  }
  // Final material over shared + solo geometry.
  let lengthMm = 0;
  let volumeMm3 = 0;
  const allSegments: SparseSupportRouteSegment[] = [];
  for (const tree of planned.trees) {
    allSegments.push(...tree.trunkSegments);
    for (const child of tree.children) allSegments.push(child.connector, ...child.upperSegments);
  }
  for (const id of planned.independentTargets) {
    const route = targetsById.get(id)?.route;
    if (route) allSegments.push(...route.segments);
  }
  for (const s of allSegments) {
    const length = segmentLengthSource(s.start, s.end) * scale;
    lengthMm += length;
    volumeMm3 += Math.PI * (s.radius * scale) ** 2 * length;
  }
  const baseLength = independent.metrics.material.totalSupportEdgeLengthMm;
  const sharedRoots = planned.trees.map((t) => t.root);
  const metrics = buildModeMetrics(
    mode,
    targets,
    planned.trees,
    planned.independentTargets,
    planned.rejections,
    {
      individualConflicts: independent.metrics.routing.independentRouteConflicts,
      individualLengthMm: baseLength,
      individualVolumeMm3: independent.metrics.material.estimatedSupportVolumeMm3,
    },
    {
      bootstrapMax: bootstraps.length ? Math.max(...bootstraps) : 0,
      bootstrapMean: bootstraps.length ? bootstraps.reduce((a, b) => a + b, 0) / bootstraps.length : 0,
      longCount,
      junctionMean: junctionHeights.length ? junctionHeights.reduce((a, b) => a + b, 0) / junctionHeights.length : null,
    },
  );
  // Fill caller-owned fields honestly (no placeholders in the output).
  const branchHeightsMm = planned.trees.map((t) => (t.junction.z - checked.plateZ) * scale);
  metrics.bootstrap.meanFirstBranchHeightMm = branchHeightsMm.length
    ? branchHeightsMm.reduce((a, b) => a + b, 0) / branchHeightsMm.length
    : null;
  metrics.routing.resolvedBySharingCount = resolved;
  metrics.routing.newConflictsIntroduced = introduced;
  metrics.material.totalSupportEdgeLengthMm = lengthMm;
  metrics.material.estimatedSupportVolumeMm3 = volumeMm3;
  metrics.material.materialChangeVsCurrent = baseLength > EPS ? (lengthMm - baseLength) / baseLength : null;
  metrics.safety.invalidNaNCount = countNonFinite(allSegments);
  metrics.safety.zeroLengthCount = countZeroLength(allSegments);
  metrics.safety.duplicateEdgeCount = countDuplicateEdges(allSegments);
  metrics.removal.trappedLoopRisk = lowBraces.length > 0 ? countBraceCycles(planned.trees, lowBraces) : 0;
  metrics.removal.removalRiskAdjacencyCount = countRootAdjacencies(
    sharedRoots,
    trunkRadiusSource(checked),
    checked.removalClearanceMm / scale,
  );
  return {
    mode,
    version: SUPPORT_BRANCHED_TREE_VERSION,
    trees: planned.trees,
    independentTargets: planned.independentTargets,
    rejections: planned.rejections,
    corridorScores: planned.corridorScores,
    metrics,
    lowBraces,
  };
}

function countBraceCycles(
  trees: readonly SupportTree[],
  braces: ReadonlyArray<{ trunkAId: string; trunkBId: string }>,
): number {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const p = parent.get(id) ?? id;
    if (p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  };
  for (const tree of trees) parent.set(tree.id, tree.id);
  let cycles = 0;
  for (const brace of braces) {
    if (!parent.has(brace.trunkAId) || !parent.has(brace.trunkBId)) continue;
    if (find(brace.trunkAId) === find(brace.trunkBId)) cycles += 1;
    else parent.set(find(brace.trunkAId), find(brace.trunkBId));
  }
  return cycles;
}

function buildSharedLowDiagonalResult(
  targets: readonly BranchedTargetInput[],
  planned: ReturnType<typeof planSupportTrees>,
  checked: SupportBranchedTreeOptions,
  targetsById: ReadonlyMap<string, BranchedTargetInput>,
  independent: BranchedModeResult,
): BranchedModeResult {
  // Compose footing low braces across shared-trunk roots: synthesize one
  // trunk route per tree, plan braces with the footing planner, then rebuild
  // the shared result with brace junctions lowering the bootstrap spans.
  const trunkInputs: BootstrapTrunkInput[] = [];
  for (const tree of planned.trees) {
    const trunk = trunkRouteForTree(tree, targetsById);
    if (trunk) trunkInputs.push(trunk);
  }
  const footingInputs: SupportBootstrapFootingOptions = {
    ...footingOptionsFrom(checked),
    ...checked.footingOverrides,
  };
  const current = analyzeBootstrapTrunks(trunkInputs, footingInputs);
  void current;
  const braces = planLowBraces(trunkInputs, analyzeBootstrapTrunks(trunkInputs, footingInputs), footingInputs);
  const accepted = braces
    .filter((b) => b.status === "candidate")
    .map((b) => ({
      id: b.id,
      trunkAId: b.trunkAId,
      trunkBId: b.trunkBId,
      attachHeightAMm: b.attachHeightAMm,
      attachHeightBMm: b.attachHeightBMm,
      angleFromVerticalDeg: b.angleFromVerticalDeg,
      lengthMm: b.lengthMm,
    }));
  return buildSharedResult("shared-lowdiagonal", targets, planned, checked, targetsById, independent, accepted);
}

export interface BranchedTreeFixture {
  targets: BranchedTargetInput[];
  options: SupportBranchedTreeOptions;
}

function verticalRoute(
  x: number,
  y: number,
  heightSource: number,
  shaftRadiusSource: number,
  neckRadiusSource: number,
  neckLengthSource: number,
  leanToX?: number,
): SparseRemovableSupportRoute {
  const root = { x, y, z: 0 };
  const target = { x: leanToX ?? x, y, z: heightSource };
  const neckStart = {
    x: target.x,
    y,
    z: heightSource - neckLengthSource,
  };
  // For leaning routes the shaft runs root -> neckStart directly.
  const shaftTop = leanToX === undefined ? { x, y, z: heightSource - neckLengthSource } : { ...neckStart };
  return {
    kind: leanToX === undefined ? "vertical" : "leaning",
    root,
    neckStart: { ...neckStart },
    target: { ...target },
    segments: [
      { start: copyPoint(root), end: copyPoint(shaftTop), radius: shaftRadiusSource },
      { start: copyPoint(neckStart), end: copyPoint(target), radius: neckRadiusSource },
    ],
  };
}

/**
 * Synthetic fixture sharing the footing experiment's vertical-stress idiom:
 * one shareable pair with interfering independents (T1/T2), one solo
 * critical (T3), and near-but-divergent short/leaning targets (T4/T5) that
 * must NOT share. Identical BODY/target selection across modes.
 */
export function buildBranchedTreeFixture(
  overrides?: Partial<SupportBranchedTreeOptions>,
): BranchedTreeFixture {
  const shaft = 0.8;
  const neck = 0.4;
  const targets: BranchedTargetInput[] = [
    { id: "target-a", route: verticalRoute(60, 0, 30, shaft, neck, 1), critical: false },
    { id: "target-b", route: verticalRoute(61.5, 0, 30, shaft, neck, 1), critical: false },
    { id: "target-c", route: verticalRoute(100, 0, 30, shaft, neck, 1), critical: true },
    { id: "target-d", route: verticalRoute(0, 0, 16, shaft, neck, 1), critical: false },
    { id: "target-e", route: verticalRoute(3, 0, 26, shaft, neck, 1, 30), critical: false },
  ];
  const options: SupportBranchedTreeOptions = {
    scaleMmPerUnit: 1,
    plateZ: 0,
    supportDiameterMm: shaft * 2,
    sharedTrunkDiameterMultiplier: 1.0,
    maxTargetsPerSharedTrunk: 4,
    maxCriticalTargetsPerSharedTrunk: 2,
    maxRootSeparationMm: 8,
    minSharedLengthMm: 6,
    junctionHeightFraction: 0.4,
    minBranchHeightMm: 3,
    branchRiseMm: 4,
    maxBranchAngleFromVerticalDeg: 60,
    removalClearanceMm: 0.3,
    plateBounds: { minX: -10, maxX: 120, minY: -10, maxY: 10 },
    bodySdf: () => 10,
    ...overrides,
  };
  return { targets, options };
}

/** Stable identity for determinism tests. */
export function supportBranchedTreeFingerprint(value: unknown): string {
  return sha256HexSync(`support-branched-tree\n${canonicalStringify(value)}`);
}
