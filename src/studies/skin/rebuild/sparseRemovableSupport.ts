import type {
  InternalStructureEdge,
  InternalStructureGraph,
  InternalStructureNode,
  Vector3Value,
} from "../voronoi.ts";

/** A current final-artwork face after Stage 4 responsibility projection. */
export interface SparseRemovableSupportFace {
  /** The retained Stage 4 Outside region id. */
  regionId: number;
  /** The exact Stage 3 Pattern owner selected by Stage 4, or -1 when the
   * stored responsibility has no owner. */
  ownerPatchId: number;
  /** Representative point from the Stage 7 final-artwork triangle. */
  position: Vector3Value;
  /** Representative outward triangle normal. */
  normal: Vector3Value;
  /** Stable Stage 7 face identity for diagnostics. */
  faceIndex: number;
  /** Optional source area, used only for deterministic tie-breaking. */
  area?: number;
}

export type SparseSupportRouteKind = "vertical" | "leaning";
export type SparseSupportRejectReason =
  | "body"
  | "spacing"
  | "removability"
  | "unsupported"
  | "coverage";

export interface SparseRemovableSupportTarget {
  id: string;
  regionId: number;
  /** The exact Stage 3 Pattern owner copied through Stage 4/7 projection. */
  ownerPatchId: number;
  position: Vector3Value;
  normal: Vector3Value;
  sourceFaceIndices: number[];
}

export interface SparseRemovableSupportCandidate {
  id: string;
  target: SparseRemovableSupportTarget;
  /** Other critical targets reached by this same sparse contact footprint. */
  coversCriticalTargetIds: string[];
  /** Route priority is stable and lower is attempted first. */
  priority: number;
}

export interface SparseSupportRouteSegment {
  start: Vector3Value;
  end: Vector3Value;
  radius: number;
}

export interface SparseRemovableSupportRoute {
  kind: SparseSupportRouteKind;
  root: Vector3Value;
  neckStart: Vector3Value;
  target: Vector3Value;
  segments: SparseSupportRouteSegment[];
}

export interface SparseSupportRouteAttempt {
  kind: SparseSupportRouteKind;
  accepted: boolean;
  reason?: SparseSupportRejectReason;
  detail?: string;
}

export interface SparseSupportDebugCriticalTarget {
  id: string;
  regionId: number;
  ownerPatchId: number;
  position: Vector3Value;
  sourceFaceIndices: number[];
}

export interface SparseSupportDebugRejectedCandidate {
  id: string;
  regionId: number;
  ownerPatchId: number;
  position: Vector3Value;
  reason: SparseSupportRejectReason;
  routeKind?: SparseSupportRouteKind;
  detail: string;
}

export interface SparseRemovableSupportDebug {
  /** Bounded presentation facts for yellow critical-target markers. */
  criticalTargets: SparseSupportDebugCriticalTarget[];
  /** Bounded presentation facts for translucent-red rejected candidates. */
  rejectedCandidates: SparseSupportDebugRejectedCandidate[];
  /** Full bounded route-attempt facts for a text/debug inspector. */
  routeAttempts: Array<{
    candidateId: string;
    regionId: number;
    attempts: SparseSupportRouteAttempt[];
  }>;
  /** Accepted offset-route bend points. Presentation-only. */
  acceptedBendPoints: Vector3Value[];
  /** At most one BODY-rejected route per bounded debug candidate. */
  rejectedCollisionRoutes: Array<{
    candidateId: string;
    segments: SparseSupportRouteSegment[];
    bendPoint?: Vector3Value;
  }>;
}

export interface SparseRemovableSupportDiagnostics {
  /** Count of Stage 4 Outside responsibility regions represented in input. */
  outsideRegionCount: number;
  /** Number of Stage 7 faces projected to Outside before sparsification. */
  rawCandidateCount: number;
  /** Number of bounded critical representatives selected for routing. */
  criticalTargetCount: number;
  coveredTargetCount: number;
  unsupportedTargetCount: number;
  generatedSupportCount: number;
  rejectedByBody: number;
  rejectedBySpacing: number;
  rejectedByRemovability: number;
  /** Stage 4 Inside faces never enter this builder. */
  insideDerivedSupportCount: 0;
  verticalCount: number;
  leaningCount: number;
  /** Total straight + bounded offset/bend candidates evaluated. */
  routeCandidateCount: number;
  /** Straight routes that reproduced the former BODY collision. */
  straightRejectedByBody: number;
  /** Accepted routes with a vertical main shaft and upper bend. */
  offsetBendCount: number;
  /** Accepted routes are admitted only after the BODY audit. This explicit
   * export-gate fact must remain zero; rejected candidate routes are counted
   * separately by rejectedByBody. */
  acceptedBodyCollisionCount: 0;
  /** Explicitly a finite diagnostic, never a print-success claim. */
  experimental: true;
  removalGap: number;
  shaftRadius: number;
  neckRadius: number;
}

export type SparseExperimentalExportGateDecision =
  | { state: "hard-block"; message: string }
  | { state: "approval-required"; message: string }
  | { state: "ready"; message: string };

export interface SparseExperimentalExportGateInput {
  stage4Current: boolean;
  stage8Current: boolean;
  diagnosticsAvailable: boolean;
  acceptedBodyCollisionCount: number;
  unsupportedTargetCount: number;
  approvalCurrent: boolean;
}

export function evaluateSparseExperimentalExportGate(
  input: SparseExperimentalExportGateInput,
): SparseExperimentalExportGateDecision {
  if (!input.stage4Current) {
    return { state: "hard-block", message: "Stage 4 responsibility is unavailable or stale" };
  }
  if (!input.stage8Current || !input.diagnosticsAvailable) {
    return { state: "hard-block", message: "Current Stage 8 Sparse Support diagnostics are unavailable" };
  }
  if (!Number.isInteger(input.acceptedBodyCollisionCount) || input.acceptedBodyCollisionCount !== 0) {
    return { state: "hard-block", message: "Accepted removable support still collides with BODY" };
  }
  if (!Number.isInteger(input.unsupportedTargetCount) || input.unsupportedTargetCount < 0) {
    return { state: "hard-block", message: "Sparse Support unresolved-target diagnostics are invalid" };
  }
  if (input.unsupportedTargetCount > 0 && !input.approvalCurrent) {
    return {
      state: "approval-required",
      message: `${input.unsupportedTargetCount} support targets remain unresolved. Experimental print may fail.`,
    };
  }
  return {
    state: "ready",
    message: input.unsupportedTargetCount > 0
      ? `${input.unsupportedTargetCount} unresolved targets explicitly accepted for this experimental export.`
      : "Sparse Support export diagnostics are current.",
  };
}

export interface SparseRemovableSupportRequest {
  /** Stage 7 representatives already projected to Stage 4 Outside regions. */
  projectedOutsideFaces: readonly SparseRemovableSupportFace[];
  /** Optional explicit Stage 4 count; otherwise distinct input ids are used. */
  outsideRegionCount?: number;
  /** Source-unit build-plate Z. Every accepted route starts exactly here. */
  plateZ: number;
  /** Existing support shaft radius in source units. */
  shaftRadius: number;
  /** Short final contact neck radius in source units. */
  neckRadius: number;
  /** Authoritative finished BODY SDF. Missing proof fails closed. */
  bodySdf?: (x: number, y: number, z: number) => number;
  /** Optional target field used only to attribute terminal contact.  It is
   * never subtracted from bodySdf and therefore is not treated as a BODY
   * partition.  It must be the field for target.ownerPatchId; a missing or
   * non-finite field fails closed when the terminal segment reaches BODY. */
  targetSdf?: (target: SparseRemovableSupportTarget, x: number, y: number, z: number) => number;
  /** Field for all non-owner BODY surfaces and the permanent finalGraph. It
   * is checked independently of targetSdf; it is never inferred by
   * subtracting targetSdf from bodySdf. */
  otherBodySdf?: (target: SparseRemovableSupportTarget, x: number, y: number, z: number) => number;
  /** Source-unit spacing between accepted support capsules. */
  removalGap?: number;
  /** Physical gap convenience input. Requires scaleMmPerUnit. */
  removalGapMm?: number;
  scaleMmPerUnit?: number;
  /** Physical contact neck convenience input. Requires scaleMmPerUnit. */
  contactNeckDiameterMm?: number;
  /** Final contact suffix length. Defaults to a small radius-relative value. */
  neckLength?: number;
  /** Low-start-band width in source units. */
  lowStartBand?: number;
  /** Maximum representatives per Stage 4 region. Clamped to 3 in v0.1. */
  maxCandidatesPerRegion?: number;
  /** Maximum bounded leaning roots attempted after the vertical route. */
  maxLeaningRoutes?: number;
  /** Radius of a target footprint for greedy coverage. */
  coverageRadius?: number;
  /** Source radius used by the target attribution helper. */
  targetRadius?: number;
  /** Maximum target-owned suffix length/depth. */
  maximumOverlapLength?: number;
  maximumDepth?: number;
  /** Optional rectangular plate boundary. Unknown bounds do not grant extra
   * proof; they simply leave the finite plate-reachability check available. */
  plateBounds?: { minX: number; maxX: number; minY: number; maxY: number };
  /** Bound presentation payload size independently of geometry. */
  maxDebugCandidates?: number;
  /** Route-only revision: preserve the already-reviewed owner contact neck,
   * while still checking it against every non-owner BODY surface. */
  preserveContactNeck?: boolean;
  /** Route-only revision for the reviewed 6.5+7 target set. BODY clearance
   * remains a hard gate, while support-to-support spacing is used only as the
   * final tie-breaker so the already-approved target count is not rewritten. */
  spacingAsSelectionPreference?: boolean;
}

export interface SparseRemovableSupportResult {
  graph: InternalStructureGraph;
  diagnostics: SparseRemovableSupportDiagnostics;
  debug: SparseRemovableSupportDebug;
  candidates: SparseRemovableSupportCandidate[];
  acceptedRoutes: Array<{ candidateId: string; route: SparseRemovableSupportRoute }>;
}

const EPSILON = 1e-9;
const MAX_INTERVALS = 32_768;
const MAX_ADAPTIVE_DEPTH = 12;
const MAX_ADAPTIVE_SAMPLES = 131_072;
const DEFAULT_REMOVAL_GAP_MM = 0.35;
const DEFAULT_NECK_DIAMETER_MM = 0.6;
const MIN_NECK_CLEARANCE_FACTOR = 1.25;
const DEFAULT_MAX_CANDIDATES_PER_REGION = 3;
const DEFAULT_MAX_LEANING_ROUTES = 30;
const DEFAULT_DEBUG_CANDIDATES = 96;
/** A1 mini's 180 mm XY build span, centered at (90, 90) by the existing 3MF export. */
const A1_MINI_PLATE_HALF_SPAN_MM = 90;

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function finitePoint(point: Vector3Value): boolean {
  return finite(point.x) && finite(point.y) && finite(point.z);
}

/**
 * Derive the physical A1 mini XY proof from the exact final BODY source mesh.
 * The existing Bambu 3MF exporter centers that BODY bbox at the A1 mini plate
 * center (90, 90) mm.  This deliberately does not use an artwork or sampling
 * bbox as the plate boundary; invalid source positions or scale fail closed.
 */
export function deriveA1MiniPlateBoundsFromBodyPositions(
  bodyPositions: Float32Array,
  targetLongestMm: number,
): NonNullable<SparseRemovableSupportRequest["plateBounds"]> | undefined {
  if (!(bodyPositions instanceof Float32Array)
    || bodyPositions.length < 3 || bodyPositions.length % 3 !== 0
    || !finite(targetLongestMm) || !(targetLongestMm > EPSILON)) return undefined;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < bodyPositions.length; index += 3) {
    const x = bodyPositions[index];
    const y = bodyPositions[index + 1];
    const z = bodyPositions[index + 2];
    if (!finite(x) || !finite(y) || !finite(z)) return undefined;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  if (![minX, maxX, minY, maxY, minZ, maxZ].every(finite)
    || minX > maxX || minY > maxY || minZ > maxZ) return undefined;
  // Match the export contract: targetLongestMm is applied using the actual
  // final BODY mesh longest XYZ extent, not the coarser sampling estimate.
  const sourceLongest = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  const scaleMmPerUnit = targetLongestMm / sourceLongest;
  if (!finite(sourceLongest) || !(sourceLongest > EPSILON)
    || !finite(scaleMmPerUnit) || !(scaleMmPerUnit > EPSILON)) return undefined;
  const halfSpan = A1_MINI_PLATE_HALF_SPAN_MM / scaleMmPerUnit;
  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;
  if (![halfSpan, centerX, centerY].every(finite)) return undefined;
  return {
    minX: centerX - halfSpan,
    maxX: centerX + halfSpan,
    minY: centerY - halfSpan,
    maxY: centerY + halfSpan,
  };
}

function clonePoint(point: Vector3Value): Vector3Value {
  return { x: point.x, y: point.y, z: point.z };
}

function distance(a: Vector3Value, b: Vector3Value): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function horizontalDistance(a: Vector3Value, b: Vector3Value): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerp(a: Vector3Value, b: Vector3Value, t: number): Vector3Value {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function oneLipschitzLowerBound(first: number, second: number, intervalLength: number): number {
  if (!finite(first) || !finite(second) || !finite(intervalLength) || intervalLength < 0) return Number.NaN;
  const tolerance = 1e-9 * Math.max(1, Math.abs(first), Math.abs(second), intervalLength);
  if (Math.abs(first - second) > intervalLength + tolerance) return Number.NaN;
  if (Math.abs(first - second) >= intervalLength) return Math.min(first, second);
  return (first + second - intervalLength) * 0.5;
}

function oneLipschitzUpperBound(first: number, second: number, intervalLength: number): number {
  if (!finite(first) || !finite(second) || !finite(intervalLength) || intervalLength < 0) return Number.NaN;
  const tolerance = 1e-9 * Math.max(1, Math.abs(first), Math.abs(second), intervalLength);
  if (Math.abs(first - second) > intervalLength + tolerance) return Number.NaN;
  if (Math.abs(first - second) >= intervalLength) return Math.max(first, second);
  return (first + second + intervalLength) * 0.5;
}

function routeAngleFromVertical(start: Vector3Value, end: Vector3Value): number {
  const routeLength = distance(start, end);
  if (!(routeLength > EPSILON)) return 90;
  return Math.atan2(horizontalDistance(start, end), Math.abs(end.z - start.z)) * 180 / Math.PI;
}

function segmentSegmentDistance(
  firstStart: Vector3Value,
  firstEnd: Vector3Value,
  secondStart: Vector3Value,
  secondEnd: Vector3Value,
): number {
  // Real-Time Collision Detection, Christer Ericson, closest points on two
  // segments.  This exact segment distance is the hard support-spacing test;
  // endpoints alone are deliberately insufficient.
  const ux = firstEnd.x - firstStart.x;
  const uy = firstEnd.y - firstStart.y;
  const uz = firstEnd.z - firstStart.z;
  const vx = secondEnd.x - secondStart.x;
  const vy = secondEnd.y - secondStart.y;
  const vz = secondEnd.z - secondStart.z;
  const wx = firstStart.x - secondStart.x;
  const wy = firstStart.y - secondStart.y;
  const wz = firstStart.z - secondStart.z;
  const a = ux * ux + uy * uy + uz * uz;
  const b = ux * vx + uy * vy + uz * vz;
  const c = vx * vx + vy * vy + vz * vz;
  const d = ux * wx + uy * wy + uz * wz;
  const e = vx * wx + vy * wy + vz * wz;
  const denominator = a * c - b * b;
  let s = 0;
  let t = 0;
  if (a <= EPSILON && c <= EPSILON) return distance(firstStart, secondStart);
  if (a <= EPSILON) {
    t = c > EPSILON ? Math.max(0, Math.min(1, e / c)) : 0;
  } else if (c <= EPSILON) {
    s = Math.max(0, Math.min(1, -d / a));
  } else {
    if (denominator > EPSILON) s = Math.max(0, Math.min(1, (b * e - c * d) / denominator));
    const tNominal = b * s + e;
    if (tNominal <= 0) {
      t = 0;
      s = Math.max(0, Math.min(1, -d / a));
    } else if (tNominal >= c) {
      t = 1;
      s = Math.max(0, Math.min(1, (b - d) / a));
    } else t = tNominal / c;
  }
  const dx = wx + s * ux - t * vx;
  const dy = wy + s * uy - t * vy;
  const dz = wz + s * uz - t * vz;
  return Math.hypot(dx, dy, dz);
}

function emptyGraph(): InternalStructureGraph {
  return {
    kind: "targetedGrid",
    nodes: [],
    edges: [],
    stats: {
      inputPoints: 0,
      delaunayTetrahedra: 0,
      candidateEdges: 0,
      clippedEdges: 0,
      removedShortEdges: 0,
      removedOutsideEdges: 0,
      removedIsolatedEdges: 0,
      requestedTargets: 0,
      connectedTargets: 0,
      rejectedByBodyIntersection: 0,
      acceptedSupportCount: 0,
      unsupportedCount: 0,
      gridNodeCount: 0,
      gridEdgeCount: 0,
    },
  };
}

class SparseGraphBuilder {
  readonly nodes: InternalStructureNode[] = [];
  readonly edges: InternalStructureEdge[] = [];
  private readonly nodeByPosition = new Map<string, number>();
  private readonly edgeKeys = new Set<string>();

  private key(point: Vector3Value): string {
    return `${point.x.toPrecision(16)},${point.y.toPrecision(16)},${point.z.toPrecision(16)}`;
  }

  addNode(point: Vector3Value, radius: number): number {
    const key = this.key(point);
    const existing = this.nodeByPosition.get(key);
    if (existing !== undefined) {
      this.nodes[existing].radius = Math.max(this.nodes[existing].radius, radius);
      return existing;
    }
    const id = this.nodes.length;
    this.nodes.push({ id, position: clonePoint(point), radius });
    this.nodeByPosition.set(key, id);
    return id;
  }

  addEdge(start: number, end: number, radius: number): boolean {
    if (start === end || !this.nodes[start] || !this.nodes[end]) return false;
    const key = start < end ? `${start}:${end}` : `${end}:${start}`;
    if (this.edgeKeys.has(key)) return false;
    this.edgeKeys.add(key);
    this.edges.push({ id: this.edges.length, start, end, radius });
    return true;
  }

  graph(): InternalStructureGraph {
    return {
      kind: "targetedGrid",
      nodes: this.nodes.map((node) => ({ ...node, position: clonePoint(node.position) })),
      edges: this.edges.map((edge) => ({ ...edge })),
      stats: {
        ...emptyGraph().stats,
        inputPoints: this.nodes.length,
        candidateEdges: this.edges.length,
        requestedTargets: 0,
        connectedTargets: 0,
        gridNodeCount: this.nodes.length,
        gridEdgeCount: this.edges.length,
      },
    };
  }
}

function normalizeRequest(input: SparseRemovableSupportRequest): Required<Pick<
  SparseRemovableSupportRequest,
  "plateZ" | "shaftRadius" | "neckRadius"
>> & {
  projectedOutsideFaces: readonly SparseRemovableSupportFace[];
  outsideRegionCount: number;
  bodySdf?: (x: number, y: number, z: number) => number;
  targetSdf?: (target: SparseRemovableSupportTarget, x: number, y: number, z: number) => number;
  otherBodySdf?: (target: SparseRemovableSupportTarget, x: number, y: number, z: number) => number;
  removalGap: number;
  neckLength: number;
  lowStartBand: number;
  maxCandidatesPerRegion: number;
  maxLeaningRoutes: number;
  coverageRadius: number;
  targetRadius: number;
  maximumOverlapLength: number;
  maximumDepth: number;
  plateBounds?: SparseRemovableSupportRequest["plateBounds"];
  maxDebugCandidates: number;
  preserveContactNeck: boolean;
  spacingAsSelectionPreference: boolean;
} {
  const projectedOutsideFaces = input.projectedOutsideFaces ?? [];
  const scale = input.scaleMmPerUnit;
  const removalGap = input.removalGap
    ?? (input.removalGapMm !== undefined && scale !== undefined && finite(scale) && scale > 0
      ? input.removalGapMm / scale!
      : DEFAULT_REMOVAL_GAP_MM / 100);
  const requestedNeckLength = input.neckLength
    ?? (input.contactNeckDiameterMm !== undefined && scale !== undefined && finite(scale) && scale > 0
      ? input.contactNeckDiameterMm / scale!
      : Math.max(input.neckRadius * 3, DEFAULT_NECK_DIAMETER_MM / 10));
  // The shaft must finish outside the BODY before the narrower terminal neck
  // begins. This is a source-unit transition bound, not a change to the
  // serialized neck diameter; the neck remains the separate 0.6 mm research
  // contact geometry while its length includes a bounded shaft-radius margin.
  const neckLength = Math.max(requestedNeckLength, input.shaftRadius * MIN_NECK_CLEARANCE_FACTOR);
  const lowStartBand = input.lowStartBand ?? Math.max(input.shaftRadius * 3, 0.12);
  const maxCandidatesPerRegion = Math.max(1, Math.min(3,
    Math.floor(input.maxCandidatesPerRegion ?? DEFAULT_MAX_CANDIDATES_PER_REGION)));
  const maxLeaningRoutes = Math.max(0, Math.min(30,
    Math.floor(input.maxLeaningRoutes ?? DEFAULT_MAX_LEANING_ROUTES)));
  const coverageRadius = input.coverageRadius ?? Math.max(input.shaftRadius * 2.5, removalGap * 2);
  const targetRadius = input.targetRadius ?? Math.max(input.neckRadius * 2, input.shaftRadius);
  const maximumOverlapLength = input.maximumOverlapLength ?? Math.max(neckLength * 1.5, input.shaftRadius * 3);
  const maximumDepth = input.maximumDepth ?? Math.max(targetRadius + input.shaftRadius, neckLength);
  const regionIds = new Set(projectedOutsideFaces
    .filter((face) => Number.isInteger(face.regionId) && face.regionId >= 0)
    .map((face) => face.regionId));
  const outsideRegionCount = input.outsideRegionCount === undefined
    ? regionIds.size
    : Math.max(0, Math.floor(input.outsideRegionCount));
  return {
    projectedOutsideFaces,
    outsideRegionCount,
    plateZ: input.plateZ,
    shaftRadius: input.shaftRadius,
    neckRadius: input.neckRadius,
    bodySdf: input.bodySdf,
    targetSdf: input.targetSdf,
    otherBodySdf: input.otherBodySdf,
    removalGap,
    neckLength,
    lowStartBand,
    maxCandidatesPerRegion,
    maxLeaningRoutes,
    coverageRadius,
    targetRadius,
    maximumOverlapLength,
    maximumDepth,
    plateBounds: input.plateBounds,
    maxDebugCandidates: Math.max(0, Math.min(256, Math.floor(input.maxDebugCandidates ?? DEFAULT_DEBUG_CANDIDATES))),
    preserveContactNeck: input.preserveContactNeck === true,
    spacingAsSelectionPreference: input.spacingAsSelectionPreference === true,
  };
}

function validNormalizedRequest(request: ReturnType<typeof normalizeRequest>): boolean {
  return finite(request.plateZ)
    && finite(request.shaftRadius) && request.shaftRadius > EPSILON
    && finite(request.neckRadius) && request.neckRadius > EPSILON
    && finite(request.removalGap) && request.removalGap >= 0
    && finite(request.neckLength) && request.neckLength > EPSILON
    && finite(request.lowStartBand) && request.lowStartBand > 0
    && finite(request.coverageRadius) && request.coverageRadius >= 0
    && finite(request.targetRadius) && request.targetRadius >= 0
    && finite(request.maximumOverlapLength) && request.maximumOverlapLength >= 0
    && finite(request.maximumDepth) && request.maximumDepth >= 0;
}

function candidateTargetId(regionId: number, index: number): string {
  return `outside-${regionId}-${index}`;
}

/**
 * Deterministically reduce all projected Outside faces to at most three
 * critical targets per Stage 4 region.  The lowest printable start band is
 * always selected first.  Additional representatives are admitted only when
 * that band has a meaningful spatial span, so a dense 489-face diagnosis does
 * not become 489 support requests.
 */
export function extractSparseRemovableSupportTargets(
  faces: readonly SparseRemovableSupportFace[],
  options: Pick<SparseRemovableSupportRequest, "shaftRadius" | "removalGap" | "lowStartBand" | "maxCandidatesPerRegion">,
): {
  targets: SparseRemovableSupportTarget[];
  rawCandidateCount: number;
  outsideRegionCount: number;
  /** Finite Outside demand whose Stage 4 owner patch was unavailable. */
  unownedCandidateCount: number;
} {
  const shaftRadius = options.shaftRadius;
  const removalGap = options.removalGap ?? 0;
  const lowStartBand = options.lowStartBand ?? Math.max(shaftRadius * 3, 0.12);
  const maxPerRegion = Math.max(1, Math.min(3, Math.floor(options.maxCandidatesPerRegion ?? 3)));
  const groups = new Map<number, SparseRemovableSupportFace[]>();
  const representedRegionIds = new Set<number>();
  let unownedCandidateCount = 0;
  for (const face of faces) {
    if (!Number.isInteger(face.regionId) || face.regionId < 0) continue;
    representedRegionIds.add(face.regionId);
    if (!Number.isInteger(face.ownerPatchId) || face.ownerPatchId < 0) {
      if (finitePoint(face.position)) unownedCandidateCount++;
      continue;
    }
    if (!finitePoint(face.position)) continue;
    const group = groups.get(face.regionId) ?? [];
    group.push(face);
    groups.set(face.regionId, group);
  }
  const targetRegions = [...groups.keys()].sort((a, b) => a - b);
  const targets: SparseRemovableSupportTarget[] = [];
  const separation = Math.max(shaftRadius * 3, removalGap * 2, 0.08);
  for (const regionId of targetRegions) {
    const sorted = [...groups.get(regionId)!].sort((first, second) =>
      first.position.z - second.position.z
      || first.position.x - second.position.x
      || first.position.y - second.position.y
      || first.faceIndex - second.faceIndex);
    const minimumZ = sorted[0].position.z;
    const lowBand = sorted.filter((face) => face.position.z <= minimumZ + lowStartBand + EPSILON);
    const pool = lowBand.length > 0 ? lowBand : [sorted[0]];
    const selected: SparseRemovableSupportFace[] = [pool[0]];
    while (selected.length < maxPerRegion && selected.length < pool.length) {
      let best: SparseRemovableSupportFace | null = null;
      let bestDistance = Number.NEGATIVE_INFINITY;
      for (const face of pool) {
        if (selected.includes(face)) continue;
        const nearest = Math.min(...selected.map((other) => distance(face.position, other.position)));
        if (nearest > bestDistance + EPSILON
          || (Math.abs(nearest - bestDistance) <= EPSILON
            && (!best || face.faceIndex < best.faceIndex))) {
          best = face;
          bestDistance = nearest;
        }
      }
      // A low span that does not warrant spatial separation remains one
      // critical target even when the region contains many faces.
      if (!best || bestDistance < separation) break;
      selected.push(best);
    }
    selected.sort((first, second) => first.position.z - second.position.z
      || first.position.x - second.position.x
      || first.position.y - second.position.y
      || first.faceIndex - second.faceIndex);
    selected.forEach((face, index) => {
      targets.push({
        id: candidateTargetId(regionId, index),
        regionId,
        ownerPatchId: face.ownerPatchId,
        position: clonePoint(face.position),
        normal: clonePoint(face.normal),
        sourceFaceIndices: [face.faceIndex],
      });
    });
  }
  return {
    targets,
    rawCandidateCount: faces.length,
    outsideRegionCount: representedRegionIds.size,
    unownedCandidateCount,
  };
}

function targetCoverage(
  targets: readonly SparseRemovableSupportTarget[],
  target: SparseRemovableSupportTarget,
  coverageRadius: number,
): string[] {
  return targets
    .filter((candidate) => candidate.regionId === target.regionId
      && distance(candidate.position, target.position) <= coverageRadius + EPSILON)
    .map((candidate) => candidate.id)
    .sort();
}

function makeCandidates(
  targets: readonly SparseRemovableSupportTarget[],
  coverageRadius: number,
): SparseRemovableSupportCandidate[] {
  return targets.map((target, index) => ({
    id: target.id,
    target,
    coversCriticalTargetIds: targetCoverage(targets, target, coverageRadius),
    priority: index,
  }));
}

function pointInsidePlateBounds(point: Vector3Value, bounds: SparseRemovableSupportRequest["plateBounds"]): boolean {
  if (!bounds) return false;
  return finite(bounds.minX) && finite(bounds.maxX) && finite(bounds.minY) && finite(bounds.maxY)
    && bounds.minX <= bounds.maxX && bounds.minY <= bounds.maxY
    && point.x >= bounds.minX - EPSILON && point.x <= bounds.maxX + EPSILON
    && point.y >= bounds.minY - EPSILON && point.y <= bounds.maxY + EPSILON;
}

function finitePlateBounds(bounds: SparseRemovableSupportRequest["plateBounds"]): boolean {
  if (!bounds) return false;
  return finite(bounds.minX) && finite(bounds.maxX)
    && finite(bounds.minY) && finite(bounds.maxY)
    && bounds.minX <= bounds.maxX && bounds.minY <= bounds.maxY;
}

type SparseHorizontalDirection = { x: number; y: number };

function normalizeHorizontalDirection(
  direction: Pick<Vector3Value, "x" | "y">,
): SparseHorizontalDirection | null {
  const length = Math.hypot(direction.x, direction.y);
  if (!finite(length) || !(length > EPSILON)) return null;
  return { x: direction.x / length, y: direction.y / length };
}

/**
 * Keep the bounded v0 route set spatially diverse. The first direction is the
 * target triangle's outward XY normal (when available), so a root descends on
 * the outside of a side overhang. Remaining directions cover both tangential
 * sides, the opposite direction, and their diagonals. This is only candidate
 * ordering; every route still passes the unchanged BODY/keep-out audit.
 */
export function enumerateSparseRemovableSupportLeaningDirections(
  normal: Pick<Vector3Value, "x" | "y">,
): SparseHorizontalDirection[] {
  const outward = normalizeHorizontalDirection(normal) ?? { x: 1, y: 0 };
  const requested = [
    outward,
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];
  const unique: SparseHorizontalDirection[] = [];
  for (const direction of requested) {
    const normalized = normalizeHorizontalDirection(direction);
    if (!normalized) continue;
    if (unique.some((existing) => Math.abs(existing.x - normalized.x) < 1e-9
      && Math.abs(existing.y - normalized.y) < 1e-9)) continue;
    unique.push(normalized);
  }
  return unique;
}

function boundedContactNeckLength(
  neckLength: number,
  shaftRadius: number,
  neckRadius: number,
): number {
  return Math.min(neckLength,
    Math.max(shaftRadius * MIN_NECK_CLEARANCE_FACTOR, neckRadius * 1.5));
}

/**
 * Place the terminal neck just outside the target along the already-resolved
 * Stage 4/7 outward normal.  A support target is expected to be a lower
 * overhang, so an upward or tangent normal cannot safely define a descending
 * contact and is rejected instead of falling back to a target-centred neck.
 */
function contactStartForTarget(
  target: SparseRemovableSupportTarget,
  neckLength: number,
  shaftRadius: number,
  neckRadius: number,
): Vector3Value | null {
  if (!finitePoint(target.position) || !finitePoint(target.normal)) return null;
  const normalLength = Math.hypot(target.normal.x, target.normal.y, target.normal.z);
  if (!finite(normalLength) || !(normalLength > EPSILON)) return null;
  const outward = {
    x: target.normal.x / normalLength,
    y: target.normal.y / normalLength,
    z: target.normal.z / normalLength,
  };
  if (!finitePoint(outward) || !(outward.z < -EPSILON)) return null;
  const actualNeckLength = boundedContactNeckLength(neckLength, shaftRadius, neckRadius);
  if (!finite(actualNeckLength) || !(actualNeckLength > EPSILON)) return null;
  const contactStart = {
    x: target.position.x + outward.x * actualNeckLength,
    y: target.position.y + outward.y * actualNeckLength,
    z: target.position.z + outward.z * actualNeckLength,
  };
  if (!finitePoint(contactStart) || !(contactStart.z < target.position.z - EPSILON)) return null;
  return contactStart;
}

function buildRoute(
  target: SparseRemovableSupportTarget,
  plateZ: number,
  shaftRadius: number,
  neckRadius: number,
  neckLength: number,
  kind: SparseSupportRouteKind,
  root: Vector3Value,
): SparseRemovableSupportRoute | null {
  const rise = target.position.z - plateZ;
  if (!(rise > EPSILON) || !finitePoint(root)) return null;
  const neckStart = contactStartForTarget(target, neckLength, shaftRadius, neckRadius);
  // A contact start below the plate cannot be reached by a supported shaft;
  // retain the existing fail-closed route contract rather than serializing a
  // non-normal-aligned neck-only shortcut.
  if (!neckStart || !(neckStart.z > plateZ + EPSILON)) return null;
  return {
    kind,
    root: clonePoint(root),
    neckStart,
    target: clonePoint(target.position),
    segments: [
      { start: clonePoint(root), end: neckStart, radius: shaftRadius },
      { start: neckStart, end: clonePoint(target.position), radius: neckRadius },
    ],
  };
}

function buildVerticalRoute(
  target: SparseRemovableSupportTarget,
  request: ReturnType<typeof normalizeRequest>,
): SparseRemovableSupportRoute | null {
  const contactStart = contactStartForTarget(target, request.neckLength,
    request.shaftRadius, request.neckRadius);
  if (!contactStart) return null;
  return buildRoute(target, request.plateZ, request.shaftRadius, request.neckRadius,
    request.neckLength, "vertical", {
      x: contactStart.x,
      y: contactStart.y,
      z: request.plateZ,
    });
}

function buildOffsetBendRoute(
  target: SparseRemovableSupportTarget,
  request: ReturnType<typeof normalizeRequest>,
  direction: SparseHorizontalDirection,
  offset: number,
  approachAngleDegrees = 35,
): SparseRemovableSupportRoute | null {
  const contactStart = contactStartForTarget(target, request.neckLength,
    request.shaftRadius, request.neckRadius);
  if (!contactStart || !finite(offset) || !(offset > EPSILON)) return null;
  // A bounded 35/45-degree upper approach keeps the lower member vertical
  // while changing only bend height. The final contact neck stays unchanged.
  const approachAngleRadians = approachAngleDegrees * Math.PI / 180;
  const approachRise = offset / Math.tan(approachAngleRadians);
  const bendZ = contactStart.z - approachRise;
  if (!finite(bendZ) || !(bendZ > request.plateZ + EPSILON)) return null;
  const root = {
    x: contactStart.x + direction.x * offset,
    y: contactStart.y + direction.y * offset,
    z: request.plateZ,
  };
  if (!pointInsidePlateBounds(root, request.plateBounds)) return null;
  const bend = { x: root.x, y: root.y, z: bendZ };
  return {
    kind: "leaning",
    root: clonePoint(root),
    neckStart: clonePoint(contactStart),
    target: clonePoint(target.position),
    segments: [
      { start: clonePoint(root), end: clonePoint(bend), radius: request.shaftRadius },
      { start: clonePoint(bend), end: clonePoint(contactStart), radius: request.shaftRadius },
      { start: clonePoint(contactStart), end: clonePoint(target.position), radius: request.neckRadius },
    ],
  };
}

function buildLeaningRoutes(
  target: SparseRemovableSupportTarget,
  request: ReturnType<typeof normalizeRequest>,
): SparseRemovableSupportRoute[] {
  // A leaning root needs an explicit finite physical XY plate proof; unknown
  // bounds never grant it. Direction selection below is only a bounded search
  // ordering and does not relax any BODY or permanent-Web keep-out check.
  if (request.maxLeaningRoutes <= 0 || !finitePlateBounds(request.plateBounds)) return [];
  const directions = enumerateSparseRemovableSupportLeaningDirections(target.normal);
  const routes: SparseRemovableSupportRoute[] = [];
  // Three small physical rings (6.4 / 9.6 / 12.8 mm with the existing
  // 1.6 mm shaft) and two bend heights move the main shaft away from the BODY
  // without changing target density or invoking a global path solver.
  const offsets = [request.shaftRadius * 8, request.shaftRadius * 12, request.shaftRadius * 16];
  for (const approachAngleDegrees of [35, 45]) {
    for (const offset of offsets) {
      for (const direction of directions) {
        const route = buildOffsetBendRoute(target, request, direction, offset, approachAngleDegrees);
        if (route) routes.push(route);
        if (routes.length >= request.maxLeaningRoutes) return routes;
      }
    }
  }
  return routes;
}

export interface SparseSupportRouteAudit {
  accepted: boolean;
  reason?: SparseSupportRejectReason;
  detail: string;
  sampleCount: number;
}

function auditCapsuleAgainstBody(
  segment: SparseSupportRouteSegment,
  bodySdf: ((x: number, y: number, z: number) => number) | undefined,
  terminal: boolean,
  target: SparseRemovableSupportTarget,
  request: ReturnType<typeof normalizeRequest>,
): SparseSupportRouteAudit {
  if (!bodySdf) return { accepted: false, reason: "body", detail: "authoritative finished BODY SDF is unavailable", sampleCount: 0 };
  if (terminal && (!request.targetSdf || !request.otherBodySdf)) {
    return { accepted: false, reason: "body", detail: "terminal owner-target and non-owner BODY SDFs are unavailable", sampleCount: 0 };
  }
  const routeLength = distance(segment.start, segment.end);
  if (!(routeLength > EPSILON) || !finitePoint(segment.start) || !finitePoint(segment.end)) {
    return { accepted: false, reason: "removability", detail: "zero-length or non-finite segment", sampleCount: 0 };
  }
  const maximumStep = Math.max(segment.radius * 0.2, 1e-5);
  const intervals = Math.max(2, Math.ceil(routeLength / maximumStep));
  if (intervals > MAX_INTERVALS) {
    return { accepted: false, reason: "unsupported", detail: "keep-out subdivision budget exhausted", sampleCount: 0 };
  }
  const intervalLength = routeLength / intervals;
  if (!finite(intervalLength) || !(intervalLength > 0)) {
    return { accepted: false, reason: "unsupported", detail: "keep-out interval is not finite", sampleCount: 0 };
  }
  type KeepOutSample = { body: number; target: number; other: number };
  type ContactRegion = { start: number; end: number };
  const samples = new Map<number, KeepOutSample>();
  let sampleCount = 0;
  const evaluateAt = (t: number): KeepOutSample | null => {
    if (!finite(t) || t < 0 || t > 1) return null;
    const cached = samples.get(t);
    if (cached) return cached;
    if (sampleCount >= MAX_ADAPTIVE_SAMPLES) return null;
    const point = lerp(segment.start, segment.end, t);
    let bodyDistance: number;
    let targetDistance = 1e5;
    let otherBodyDistance = 1e5;
    sampleCount++;
    try {
      bodyDistance = bodySdf(point.x, point.y, point.z);
      if (terminal) {
        targetDistance = request.targetSdf!(target, point.x, point.y, point.z);
        otherBodyDistance = request.otherBodySdf!(target, point.x, point.y, point.z);
      }
    } catch {
      return null;
    }
    if (!finite(bodyDistance) || !finite(targetDistance) || !finite(otherBodyDistance)) return null;
    const sample = { body: bodyDistance, target: targetDistance, other: otherBodyDistance };
    samples.set(t, sample);
    return sample;
  };
  for (let index = 0; index <= intervals; index++) {
    if (!evaluateAt(index / intervals)) {
      return { accepted: false, reason: "body", detail: "BODY/target SDF evaluation failed", sampleCount };
    }
  }
  const firstSample = evaluateAt(0);
  const lastSample = evaluateAt(1);
  if (!firstSample || !lastSample) {
    return { accepted: false, reason: "body", detail: "BODY/target SDF endpoint evaluation failed", sampleCount };
  }
  const threshold = segment.radius + 1e-7;
  if (firstSample.body <= threshold) {
    return { accepted: false, reason: "body", detail: "plate root is born inside finished BODY", sampleCount };
  }
  if (terminal && lastSample.target > threshold) {
    return { accepted: false, reason: "body", detail: "terminal contact is not attributed to the target", sampleCount };
  }
  if (terminal && (firstSample.other <= threshold || lastSample.other <= threshold)) {
    return { accepted: false, reason: "body", detail: "non-owner BODY is not clear at a route endpoint", sampleCount };
  }
  const targetEndpointAllowance = terminal
    ? threshold - lastSample.target
    : Number.NaN;
  const certifyInterval = (
    t0: number,
    t1: number,
    first: KeepOutSample,
    second: KeepOutSample,
    depth: number,
  ): ContactRegion[] | null => {
    const segmentLength = routeLength * (t1 - t0);
    if (!finite(segmentLength) || !(segmentLength >= 0)) return null;
    const bodyLowerBound = oneLipschitzLowerBound(first.body, second.body, segmentLength);
    const targetLowerBound = oneLipschitzLowerBound(first.target, second.target, segmentLength);
    const targetUpperBound = oneLipschitzUpperBound(first.target, second.target, segmentLength);
    const otherLowerBound = oneLipschitzLowerBound(first.other, second.other, segmentLength);
    if (![bodyLowerBound, targetLowerBound, targetUpperBound, otherLowerBound].every(finite)) return null;
    if (terminal) {
      // This field is independently generated from every non-owner BODY
      // surface and the permanent finalGraph.  A possible capsule overlap is
      // a hard rejection, including at the terminal endpoint; it cannot be
      // licensed by the owner target's endpoint cone.
      const otherPossibleStart = Math.max(0, first.other - threshold);
      const otherPossibleEnd = Math.min(segmentLength, segmentLength - second.other + threshold);
      if (!finite(otherPossibleStart) || !finite(otherPossibleEnd)
        || otherPossibleStart <= otherPossibleEnd + 1e-7) {
        return null;
      }
    }
    if (bodyLowerBound > threshold) return [];
    // Any unresolved BODY overlap away from an explicitly target-attributed
    // terminal contact is a hard collision rejection. Refine the conservative
    // Lipschitz interval before declaring that overlap: a short, genuinely
    // clear capsule can otherwise be false-rejected when its first interval's
    // lower bound straddles the radius threshold. Exhaustion still returns a
    // collision region (or an unsupported proof failure below), never an
    // uncertain acceptance.
    if (!terminal || !request.targetSdf || !request.otherBodySdf || !finite(targetEndpointAllowance)
      || targetEndpointAllowance < -1e-7) {
      // A sampled endpoint already inside the radius is a witnessed contact;
      // it does not need adaptive subdivision and remains a hard rejection.
      if (first.body <= threshold || second.body <= threshold) {
        return [{ start: Math.max(t0, 0), end: Math.min(t1, 1) }];
      }
      if (depth >= MAX_ADAPTIVE_DEPTH) {
        return [{ start: Math.max(t0, 0), end: Math.min(t1, 1) }];
      }
      const midpoint = (t0 + t1) * 0.5;
      if (!(midpoint > t0) || !(midpoint < t1)) {
        return [{ start: Math.max(t0, 0), end: Math.min(t1, 1) }];
      }
      const middle = evaluateAt(midpoint);
      if (!middle) return null;
      const left = certifyInterval(t0, midpoint, first, middle, depth + 1);
      if (!left) return null;
      const right = certifyInterval(midpoint, t1, middle, second, depth + 1);
      if (!right) return null;
      return [...left, ...right];
    }
    const bodyPossibleStart = Math.max(0, first.body - threshold);
    const bodyPossibleEnd = Math.min(segmentLength, segmentLength - second.body + threshold);
    if (bodyPossibleStart > bodyPossibleEnd + 1e-7) return [];
    const possibleT0 = t0 + (segmentLength > 0 ? bodyPossibleStart / routeLength : 0);
    const possibleT1 = t0 + (segmentLength > 0 ? bodyPossibleEnd / routeLength : 0);
    if (!finite(possibleT0) || !finite(possibleT1)
      || possibleT0 < t0 - 1e-7 || possibleT1 > t1 + 1e-7
      || possibleT0 > possibleT1 + 1e-7) return null;
    const possibleFirst = evaluateAt(Math.max(t0, Math.min(t1, possibleT0)));
    const possibleSecond = evaluateAt(Math.max(t0, Math.min(t1, possibleT1)));
    if (!possibleFirst || !possibleSecond) return null;
    const possibleLength = routeLength * Math.max(0, possibleT1 - possibleT0);
    const possibleTargetLowerBound = oneLipschitzLowerBound(
      possibleFirst.target, possibleSecond.target, possibleLength,
    );
    const possibleTargetUpperBound = oneLipschitzUpperBound(
      possibleFirst.target, possibleSecond.target, possibleLength,
    );
    if (!finite(possibleTargetLowerBound) || !finite(possibleTargetUpperBound)) return null;
    const endpointConeOwnsContact = routeLength * (1 - possibleT0)
      <= targetEndpointAllowance + 1e-7;
    const intervalUpperOwnsContact = possibleTargetUpperBound <= threshold;
    if (endpointConeOwnsContact || intervalUpperOwnsContact) {
      return [{ start: possibleT0, end: possibleT1 }];
    }
    if (depth >= MAX_ADAPTIVE_DEPTH) return null;
    const midpoint = (t0 + t1) * 0.5;
    if (!(midpoint > t0) || !(midpoint < t1)) return null;
    const middle = evaluateAt(midpoint);
    if (!middle) return null;
    const left = certifyInterval(t0, midpoint, first, middle, depth + 1);
    if (!left) return null;
    const right = certifyInterval(midpoint, t1, middle, second, depth + 1);
    if (!right) return null;
    return [...left, ...right];
  };
  const contactRegions: ContactRegion[] = [];
  for (let index = 0; index <= intervals; index++) {
    if (index >= intervals) break;
    const first = evaluateAt(index / intervals);
    const second = evaluateAt((index + 1) / intervals);
    if (!first || !second) {
      return { accepted: false, reason: "body", detail: "BODY/target SDF evaluation failed", sampleCount };
    }
    const regions = certifyInterval(index / intervals, (index + 1) / intervals, first, second, 0);
    if (!regions) {
      return { accepted: false, reason: "unsupported", detail: "keep-out subdivision proof exhausted", sampleCount };
    }
    contactRegions.push(...regions);
  }
  if (contactRegions.length === 0) {
    return { accepted: true, detail: "bounded BODY keep-out clear", sampleCount };
  }
  if (!terminal) {
    // A shaft is never an intended contact segment. Even when the possible
    // overlap happens to form a suffix of this segment, only the explicit
    // terminal/contact-neck segment may use target attribution.
    return { accepted: false, reason: "body", detail: "BODY contact on a non-terminal shaft segment", sampleCount };
  }
  contactRegions.sort((first, second) => first.start - second.start || first.end - second.end);
  for (let index = 1; index < contactRegions.length; index++) {
    if (contactRegions[index].start > contactRegions[index - 1].end + 1e-7) {
      return { accepted: false, reason: "body", detail: "BODY overlap is separated from terminal suffix", sampleCount };
    }
  }
  const firstPossible = contactRegions[0].start;
  const lastPossible = contactRegions[contactRegions.length - 1].end;
  if (lastPossible < 1 - 1e-7) {
    return { accepted: false, reason: "body", detail: "BODY overlap is not a terminal suffix", sampleCount };
  }
  const overlapLength = routeLength * (1 - firstPossible);
  const terminalDepth = Math.max(0, -lastSample.target);
  if (overlapLength > request.maximumOverlapLength + 1e-7
    || terminalDepth > request.maximumDepth + 1e-7) {
    return { accepted: false, reason: "body", detail: "terminal overlap exceeds finite contact bounds", sampleCount };
  }
  return { accepted: true, detail: "terminal BODY contact is finite and target-attributed", sampleCount };
}

/** Focused pure audit entry point used by the sparse regression fixtures. It
 * deliberately takes the same request fields as the builder, so tests exercise
 * the actual target/remainder audit rather than a second collision algorithm. */
export function auditSparseRemovableSupportCapsule(
  segment: SparseSupportRouteSegment,
  request: SparseRemovableSupportRequest,
  target: SparseRemovableSupportTarget,
  terminal = true,
): SparseSupportRouteAudit {
  const normalized = normalizeRequest(request);
  return auditCapsuleAgainstBody(segment, normalized.bodySdf, terminal, target, normalized);
}

function auditRoute(
  route: SparseRemovableSupportRoute,
  request: ReturnType<typeof normalizeRequest>,
  acceptedSegments: readonly SparseSupportRouteSegment[],
  target: SparseRemovableSupportTarget,
): SparseSupportRouteAudit {
  const plateReachable = route.kind === "vertical"
    ? (request.plateBounds === undefined || pointInsidePlateBounds(route.root, request.plateBounds))
    : finitePlateBounds(request.plateBounds) && pointInsidePlateBounds(route.root, request.plateBounds);
  if (!finitePoint(route.root) || Math.abs(route.root.z - request.plateZ) > EPSILON
    || !plateReachable) {
    return { accepted: false, reason: "removability", detail: route.kind === "leaning"
      ? "leaning route lacks explicit finite physical plate XY bounds"
      : "route is not build-plate reachable", sampleCount: 0 };
  }
  if (route.segments.length === 0 || route.segments.some((segment) =>
    !finitePoint(segment.start) || !finitePoint(segment.end) || !(segment.radius > EPSILON)
    || routeAngleFromVertical(segment.start, segment.end) > 45 + 1e-6)) {
    return { accepted: false, reason: "removability", detail: "route segment exceeds the 45-degree serialization limit", sampleCount: 0 };
  }
  let sampleCount = 0;
  for (const [index, segment] of route.segments.entries()) {
    const terminal = index === route.segments.length - 1;
    const audited = terminal && request.preserveContactNeck
      ? auditCapsuleAgainstBody(
        segment,
        request.otherBodySdf
          ? (x, y, z) => request.otherBodySdf!(target, x, y, z)
          : undefined,
        false,
        target,
        request,
      )
      : auditCapsuleAgainstBody(segment, request.bodySdf, terminal, target, request);
    sampleCount += audited.sampleCount;
    if (!audited.accepted) return { ...audited, sampleCount };
  }
  for (const segment of route.segments) {
    for (const previous of acceptedSegments) {
      const clearance = segment.radius + previous.radius + request.removalGap;
      const actual = segmentSegmentDistance(segment.start, segment.end, previous.start, previous.end);
      if (!finite(actual) || actual <= clearance + 1e-7) {
        return { accepted: false, reason: "spacing", detail: `capsule spacing ${actual.toFixed(6)} is below ${clearance.toFixed(6)}`, sampleCount };
      }
    }
  }
  return { accepted: true, detail: "plate, BODY and capsule-spacing screens passed", sampleCount };
}

function routeSpacingIsClear(
  route: SparseRemovableSupportRoute,
  acceptedSegments: readonly SparseSupportRouteSegment[],
  removalGap: number,
): boolean {
  for (const segment of route.segments) {
    for (const previous of acceptedSegments) {
      const clearance = segment.radius + previous.radius + removalGap;
      const actual = segmentSegmentDistance(segment.start, segment.end, previous.start, previous.end);
      if (!finite(actual) || actual <= clearance + 1e-7) return false;
    }
  }
  return true;
}

function routeMaximumAngle(route: SparseRemovableSupportRoute): number {
  return Math.max(...route.segments.map((segment) => routeAngleFromVertical(segment.start, segment.end)));
}

function routeLength(route: SparseRemovableSupportRoute): number {
  return route.segments.reduce((total, segment) => total + distance(segment.start, segment.end), 0);
}

function appendRouteToGraph(builder: SparseGraphBuilder, route: SparseRemovableSupportRoute): void {
  for (const segment of route.segments) {
    const start = builder.addNode(segment.start, segment.radius);
    const end = builder.addNode(segment.end, segment.radius);
    builder.addEdge(start, end, segment.radius);
  }
}

/**
 * Build the Stage 8 v0.1 sparse removable support graph.  The implementation
 * is intentionally pure: it consumes projected final-artwork facts and an
 * authoritative BODY evaluator, then returns a separate graph, finite
 * diagnostics and bounded debug facts.  No BODY or permanent-web geometry is
 * modified and no mechanical, slicer, nipper-access or print-success claim is
 * made.
 */
export function buildSparseRemovableSupport(
  input: SparseRemovableSupportRequest,
): SparseRemovableSupportResult {
  const request = normalizeRequest(input);
  const extracted = extractSparseRemovableSupportTargets(request.projectedOutsideFaces, request);
  const targets = extracted.targets;
  const candidates = makeCandidates(targets, request.coverageRadius)
    .sort((first, second) => first.target.regionId - second.target.regionId || first.priority - second.priority);
  const builder = new SparseGraphBuilder();
  const acceptedSegments: SparseSupportRouteSegment[] = [];
  const acceptedRoutes: Array<{ candidateId: string; route: SparseRemovableSupportRoute }> = [];
  const coveredTargetIds = new Set<string>();
  const rejectedCandidates: SparseSupportDebugRejectedCandidate[] = [];
  const routeAttempts: SparseRemovableSupportDebug["routeAttempts"] = [];
  const rejectedCollisionRoutes: SparseRemovableSupportDebug["rejectedCollisionRoutes"] = [];
  let rejectedByBody = 0;
  let rejectedBySpacing = 0;
  let rejectedByRemovability = extracted.unownedCandidateCount;
  let verticalCount = 0;
  let leaningCount = 0;
  let routeCandidateCount = 0;
  let straightRejectedByBody = 0;
  let offsetBendCount = 0;
  const anyFiniteFace = request.projectedOutsideFaces.some((face) => finitePoint(face.position));
  const requestValid = validNormalizedRequest(request);

  // Ownerless projected Outside faces remain visible as unsupported demand,
  // but cannot be given a target contact field. Keep these debug facts bounded
  // and deterministic while ensuring no route is attempted.
  for (const face of request.projectedOutsideFaces) {
    if (!Number.isInteger(face.regionId) || face.regionId < 0
      || (Number.isInteger(face.ownerPatchId) && face.ownerPatchId >= 0)
      || !finitePoint(face.position)) continue;
    const id = `unowned-${face.regionId}-${face.faceIndex}`;
    if (routeAttempts.length < request.maxDebugCandidates) {
      routeAttempts.push({
        candidateId: id,
        regionId: face.regionId,
        attempts: [{
          kind: "vertical",
          accepted: false,
          reason: "unsupported",
          detail: "Stage 4 owner Patch id unavailable; no target contact attempted",
        }],
      });
    }
    if (rejectedCandidates.length < request.maxDebugCandidates) {
      rejectedCandidates.push({
        id,
        regionId: face.regionId,
        ownerPatchId: -1,
        position: clonePoint(face.position),
        reason: "unsupported",
        routeKind: "vertical",
        detail: "Stage 4 owner Patch id unavailable; no target contact attempted",
      });
    }
  }

  for (const candidate of candidates) {
    const uncovered = candidate.coversCriticalTargetIds.filter((id) => !coveredTargetIds.has(id));
    if (uncovered.length === 0) {
      if (routeAttempts.length < request.maxDebugCandidates) {
        routeAttempts.push({ candidateId: candidate.id, regionId: candidate.target.regionId, attempts: [{
          kind: "vertical", accepted: false, reason: "coverage", detail: "coverage already supplied by an accepted support",
        }] });
      }
      continue;
    }
    const attempts: SparseSupportRouteAttempt[] = [];
    let accepted: SparseRemovableSupportRoute | null = null;
    let bodyFailure = false;
    let spacingFailure = false;
    let removabilityFailure = false;
    const preferenceCandidates: Array<{
      route: SparseRemovableSupportRoute;
      spacingClear: boolean;
      order: number;
    }> = [];
    const routeOptions: SparseRemovableSupportRoute[] = requestValid
      ? [
        buildVerticalRoute(candidate.target, request),
        ...buildLeaningRoutes(candidate.target, request),
      ].filter((route): route is SparseRemovableSupportRoute => route !== null)
      : [];
    routeCandidateCount += routeOptions.length;
    if (routeOptions.length === 0) {
      attempts.push({ kind: "vertical", accepted: false, reason: "unsupported", detail: "support settings or target fields are not finite" });
      removabilityFailure = true;
    }
    for (const [routeIndex, route] of routeOptions.entries()) {
      const audited = auditRoute(
        route,
        request,
        request.spacingAsSelectionPreference ? [] : acceptedSegments,
        candidate.target,
      );
      const spacingClear = routeSpacingIsClear(route, acceptedSegments, request.removalGap);
      attempts.push({
        kind: route.kind,
        accepted: audited.accepted,
        ...(audited.reason ? { reason: audited.reason } : {}),
        detail: request.spacingAsSelectionPreference && audited.accepted
          ? `${audited.detail}; support spacing ${spacingClear ? "clear" : "used as final preference"}`
          : audited.detail,
      });
      if (audited.accepted) {
        if (!request.spacingAsSelectionPreference) {
          accepted = route;
          break;
        }
        preferenceCandidates.push({ route, spacingClear, order: routeIndex });
        continue;
      }
      if (audited.reason === "body") {
        bodyFailure = true;
        if (routeIndex === 0) straightRejectedByBody++;
        if (rejectedCollisionRoutes.length < request.maxDebugCandidates
          && !rejectedCollisionRoutes.some((entry) => entry.candidateId === candidate.id)) {
          rejectedCollisionRoutes.push({
            candidateId: candidate.id,
            segments: route.segments.map((segment) => ({
              start: clonePoint(segment.start),
              end: clonePoint(segment.end),
              radius: segment.radius,
            })),
            ...(route.segments.length > 2 ? { bendPoint: clonePoint(route.segments[0].end) } : {}),
          });
        }
      }
      if (audited.reason === "spacing") spacingFailure = true;
      if (audited.reason === "removability" || audited.reason === "unsupported") removabilityFailure = true;
    }
    if (!accepted && preferenceCandidates.length > 0) {
      preferenceCandidates.sort((first, second) =>
        routeMaximumAngle(first.route) - routeMaximumAngle(second.route)
        || routeLength(first.route) - routeLength(second.route)
        || Number(second.spacingClear) - Number(first.spacingClear)
        || first.order - second.order);
      accepted = preferenceCandidates[0].route;
    }
    if (routeAttempts.length < request.maxDebugCandidates) {
      routeAttempts.push({ candidateId: candidate.id, regionId: candidate.target.regionId, attempts });
    }
    if (accepted) {
      appendRouteToGraph(builder, accepted);
      acceptedSegments.push(...accepted.segments);
      acceptedRoutes.push({ candidateId: candidate.id, route: accepted });
      for (const id of uncovered) coveredTargetIds.add(id);
      if (accepted.kind === "vertical") verticalCount++;
      else {
        leaningCount++;
        if (accepted.segments.length > 2) offsetBendCount++;
      }
      continue;
    }
    if (bodyFailure) rejectedByBody++;
    if (spacingFailure) rejectedBySpacing++;
    if (removabilityFailure || (!bodyFailure && !spacingFailure)) rejectedByRemovability++;
    const lastAttempt = attempts[attempts.length - 1];
    if (rejectedCandidates.length < request.maxDebugCandidates) {
      rejectedCandidates.push({
        id: candidate.id,
        regionId: candidate.target.regionId,
        ownerPatchId: candidate.target.ownerPatchId,
        position: clonePoint(candidate.target.position),
        reason: lastAttempt?.reason ?? "unsupported",
        ...(lastAttempt?.kind ? { routeKind: lastAttempt.kind } : {}),
        detail: lastAttempt?.detail ?? "no bounded route was available",
      });
    }
  }
  const unsupportedTargetCount = Math.max(0,
    targets.length + extracted.unownedCandidateCount - coveredTargetIds.size);
  const graph = builder.graph();
  graph.stats.requestedTargets = targets.length;
  graph.stats.connectedTargets = coveredTargetIds.size;
  graph.stats.rejectedByBodyIntersection = rejectedByBody;
  graph.stats.acceptedSupportCount = acceptedRoutes.length;
  graph.stats.unsupportedCount = unsupportedTargetCount;
  const debug: SparseRemovableSupportDebug = {
    criticalTargets: targets.slice(0, request.maxDebugCandidates).map((target) => ({
      id: target.id,
      regionId: target.regionId,
      ownerPatchId: target.ownerPatchId,
      position: clonePoint(target.position),
      sourceFaceIndices: [...target.sourceFaceIndices],
    })),
    rejectedCandidates,
    routeAttempts,
    acceptedBendPoints: acceptedRoutes
      .filter(({ route }) => route.segments.length > 2)
      .map(({ route }) => clonePoint(route.segments[0].end)),
    rejectedCollisionRoutes,
  };
  const diagnostics: SparseRemovableSupportDiagnostics = {
    outsideRegionCount: request.outsideRegionCount,
    rawCandidateCount: request.projectedOutsideFaces.length,
    criticalTargetCount: targets.length,
    coveredTargetCount: coveredTargetIds.size,
    unsupportedTargetCount,
    generatedSupportCount: acceptedRoutes.length,
    rejectedByBody,
    rejectedBySpacing,
    rejectedByRemovability,
    insideDerivedSupportCount: 0,
    verticalCount,
    leaningCount,
    routeCandidateCount,
    straightRejectedByBody,
    offsetBendCount,
    acceptedBodyCollisionCount: 0,
    experimental: true,
    removalGap: request.removalGap,
    shaftRadius: request.shaftRadius,
    neckRadius: request.neckRadius,
  };
  // Keep malformed/non-finite input visible as a fail-closed unsupported
  // result even when there were no extractable faces to route.
  if (!requestValid || (!anyFiniteFace && request.projectedOutsideFaces.length > 0)) {
    diagnostics.rejectedByRemovability += diagnostics.criticalTargetCount === 0 ? 1 : 0;
  }
  return { graph, diagnostics, debug, candidates, acceptedRoutes };
}

/** Compatibility spelling used by callers that keep the Study prefix. */
export const buildSkinRebuildSparseRemovableSupport = buildSparseRemovableSupport;
