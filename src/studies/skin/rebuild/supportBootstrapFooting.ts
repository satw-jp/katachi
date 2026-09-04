import { canonicalStringify } from "../graphCore.ts";
import { sha256HexSync } from "../../../lib/hash.ts";
import type {
  SparseRemovableSupportRoute,
  SparseSupportRouteSegment,
} from "./sparseRemovableSupport.ts";
import type { Vector3Value } from "../voronoi.ts";

/**
 * SKIN Support v2 Experimental — Footing / Bootstrap Stability v0.
 *
 * Physical evidence (Print #2 observation): some removable supports fold
 * early, and trunks with a long free section between the build plate and
 * their first stable junction fail before any later brace can help. This
 * module analyses that critical phase independently of total support length:
 *
 *   Plate -> Root -> Bootstrap unbraced section -> First stable junction
 *     -> Trunk / Brace / BODY contact
 *
 * EXPERIMENTAL, session-only. Nothing here changes the frozen Print #2
 * candidate, BODY, the Permanent Graph / Reinforcement, FKEI, DryWeb, or
 * production defaults. Root thickening diameters are derived temporary
 * properties, not production settings. No branched support is implemented;
 * the metrics are reusable for a future shared-trunk analysis, and the
 * principles (first stable junction, bootstrap free length, root stability,
 * local triangulation, member angle, neighbor spacing) are recorded for a
 * future Permanent Web without sharing algorithms (removable = temporary,
 * permanent = artwork).
 *
 * Pure module: no DOM, no renderer, no workers. All geometry is computed in
 * source units; mm values are derived with scaleMmPerUnit. Inputs are never
 * mutated. Deterministic: same input -> same result (pinned by test).
 */

export const SUPPORT_BOOTSTRAP_FOOTING_VERSION = "support-bootstrap-footing-v0-experimental";

export type BootstrapClassification = "early-stable" | "mid" | "long-bootstrap";
export type BootstrapCompareMode = "current" | "root" | "brace" | "combined";
export const BOOTSTRAP_COMPARE_MODES: readonly BootstrapCompareMode[] = [
  "current",
  "root",
  "brace",
  "combined",
];

export interface BootstrapPlateBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface SupportBootstrapFootingOptions {
  /** Source-units to mm. Fixture uses 1. */
  scaleMmPerUnit: number;
  /** Source-unit build-plate Z. Every accepted route starts here. */
  plateZ: number;
  /** Normal trunk diameter in mm (reference; never rewritten). */
  supportDiameterMm: number;
  /** Thickened root diameter in mm (derived temporary property). */
  rootDiameterMm: number;
  /** Full-thickening height above the plate in mm. */
  rootReinforcedHeightMm: number;
  /** Taper length from thickened to normal diameter in mm. */
  rootTaperLengthMm: number;
  /** Brace diameter in mm. Defaults to supportDiameterMm. */
  braceDiameterMm?: number;
  /** Initial candidate ceiling; NOT an absolute production rule. */
  maxBraceAngleFromVerticalDeg: number;
  /** Low junction target band above the plate in mm. */
  lowBraceTargetHeightMm: number;
  /** Neighbor search radius on the plate in mm. */
  maxRootNeighborDistanceMm: number;
  /** bootstrap <= this -> EARLY-STABLE (no reinforcement). */
  earlyStableBootstrapMm: number;
  /** bootstrap <= this -> MID (thickening); above -> LONG-BOOTSTRAP. */
  longBootstrapMm: number;
  /** Keep-out clearance between neighboring root footprints in mm. */
  removalClearanceMm: number;
  plateBounds: BootstrapPlateBounds | null;
  /** Authoritative finished BODY SDF (source units). Missing fails closed. */
  bodySdf: (x: number, y: number, z: number) => number;
  /** Capsule audit samples. Default 24. */
  auditSamplesPerCapsule?: number;
}

export interface BootstrapTrunkInput {
  id: string;
  route: SparseRemovableSupportRoute;
}

export interface BootstrapRootNeighbor {
  id: string;
  distanceMm: number;
}

export interface BootstrapTrunkMetrics {
  id: string;
  classification: BootstrapClassification;
  rootPosition: Vector3Value;
  rootDiameterMm: number;
  /** Applied reinforcement height in this mode result (0 = current). */
  rootReinforcedHeightMm: number;
  firstStableJunctionHeightMm: number | null;
  bootstrapUnbracedLengthMm: number;
  longestLaterUnbracedLengthMm: number;
  nearestRootNeighbor: BootstrapRootNeighbor | null;
  firstBodyContactHeightMm: number | null;
  braceCount: number;
  lowBraceCount: number;
}

export interface BootstrapTaperPoint {
  heightMm: number;
  radiusSource: number;
}

export type RootThickeningStatus = "applied" | "shrunk" | "rejected";

export interface RootThickeningCandidate {
  trunkId: string;
  status: RootThickeningStatus;
  rejectReason: string | null;
  appliedRootDiameterMm: number;
  profile: BootstrapTaperPoint[];
  segments: SparseSupportRouteSegment[];
  extraVolumeMm3: number;
}

export interface LowBraceCandidate {
  id: string;
  trunkAId: string;
  trunkBId: string;
  start: Vector3Value;
  end: Vector3Value;
  attachHeightAMm: number;
  attachHeightBMm: number;
  angleFromVerticalDeg: number;
  status: "candidate" | "rejected";
  rejectReason: string | null;
  lengthMm: number;
  extraVolumeMm3: number;
}

export interface BootstrapCompareMetrics {
  mode: BootstrapCompareMode;
  trunkCount: number;
  maxBootstrapUnbracedLengthMm: number;
  meanBootstrapUnbracedLengthMm: number;
  longBootstrapCount: number;
  meanFirstStableJunctionHeightMm: number | null;
  rootReinforcedCount: number;
  lowBraceCount: number;
  totalExtraSupportVolumeMm3: number;
  /** Accepted BODY collisions. Always 0 by construction; rejects are counted separately. */
  bodyCollisionCount: number;
  bodyRejectedCount: number;
  supportConnectedComponents: number;
  removalRiskAdjacencyCount: number;
}

export interface BootstrapModeResult {
  mode: BootstrapCompareMode;
  version: string;
  trunks: BootstrapTrunkMetrics[];
  thickenings: RootThickeningCandidate[];
  braces: LowBraceCandidate[];
  compare: BootstrapCompareMetrics;
}

export type BootstrapModeComparison = Record<BootstrapCompareMode, BootstrapModeResult>;

const EPS = 1e-9;
/** Deterministic shrink ladder for root thickening under BODY pressure. */
const ROOT_SHRINK_FACTORS = [1, 0.9, 0.8, 0.7] as const;
/** Deterministic taper subdivisions (lower section + taper). */
const TAPER_SUBDIVISIONS = 4;

function copyPoint(point: Vector3Value): Vector3Value {
  return { x: point.x, y: point.y, z: point.z };
}

function segmentLengthSource(start: Vector3Value, end: Vector3Value): number {
  return Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
}

function heightMm(point: Vector3Value, plateZ: number, scale: number): number {
  return (point.z - plateZ) * scale;
}

function plateDistanceMm(a: Vector3Value, b: Vector3Value, scale: number): number {
  return Math.hypot(a.x - b.x, a.y - b.y) * scale;
}

function requireOptions(options: SupportBootstrapFootingOptions): Required<
  Pick<
    SupportBootstrapFootingOptions,
    "scaleMmPerUnit" | "supportDiameterMm" | "rootDiameterMm" | "rootReinforcedHeightMm"
    | "rootTaperLengthMm" | "maxBraceAngleFromVerticalDeg" | "lowBraceTargetHeightMm"
    | "maxRootNeighborDistanceMm" | "earlyStableBootstrapMm" | "longBootstrapMm"
    | "removalClearanceMm"
  >
> & SupportBootstrapFootingOptions {
  const fields = {
    scaleMmPerUnit: options.scaleMmPerUnit,
    supportDiameterMm: options.supportDiameterMm,
    rootDiameterMm: options.rootDiameterMm,
    rootReinforcedHeightMm: options.rootReinforcedHeightMm,
    rootTaperLengthMm: options.rootTaperLengthMm,
    maxBraceAngleFromVerticalDeg: options.maxBraceAngleFromVerticalDeg,
    lowBraceTargetHeightMm: options.lowBraceTargetHeightMm,
    maxRootNeighborDistanceMm: options.maxRootNeighborDistanceMm,
    earlyStableBootstrapMm: options.earlyStableBootstrapMm,
    longBootstrapMm: options.longBootstrapMm,
    removalClearanceMm: options.removalClearanceMm,
  } as const;
  for (const [key, value] of Object.entries(fields)) {
    if (!(typeof value === "number" && Number.isFinite(value) && value >= 0)
      || (key !== "removalClearanceMm" && !(value > 0))) {
      throw new Error(`bootstrap footing option ${key} must be a positive finite number`);
    }
  }
  if (!(options.earlyStableBootstrapMm < options.longBootstrapMm)) {
    throw new Error("earlyStableBootstrapMm must be below longBootstrapMm");
  }
  if (typeof options.bodySdf !== "function") throw new Error("bootstrap footing requires a BODY SDF");
  if (!(Number.isFinite(options.plateZ))) throw new Error("bootstrap footing requires a finite plateZ");
  return { ...options, ...fields };
}

/** Walk the route polyline; return the point at height hMm, or null. */
export function routePointAtHeight(
  route: SparseRemovableSupportRoute,
  plateZ: number,
  scale: number,
  hMm: number,
): Vector3Value | null {
  const zSource = plateZ + hMm / scale;
  for (const segment of route.segments) {
    const lo = Math.min(segment.start.z, segment.end.z);
    const hi = Math.max(segment.start.z, segment.end.z);
    if (zSource + EPS >= lo && zSource - EPS <= hi) {
      const span = segment.end.z - segment.start.z;
      if (Math.abs(span) < EPS) return copyPoint(segment.start);
      const t = (zSource - segment.start.z) / span;
      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * t,
        y: segment.start.y + (segment.end.y - segment.start.y) * t,
        z: zSource,
      };
    }
  }
  return null;
}

/** Polyline length in mm from the root up to height hMm. */
function polylineLengthToHeightMm(
  route: SparseRemovableSupportRoute,
  plateZ: number,
  scale: number,
  hMm: number,
): number {
  const zSource = plateZ + hMm / scale;
  let lengthSource = 0;
  let cursor = copyPoint(route.root);
  for (const segment of route.segments) {
    const a = segment.start;
    const b = segment.end;
    if (zSource >= Math.max(a.z, b.z) - EPS) {
      lengthSource += segmentLengthSource(cursor, b);
      cursor = copyPoint(b);
      continue;
    }
    if (zSource > Math.min(a.z, b.z) + EPS) {
      const span = b.z - a.z;
      if (Math.abs(span) > EPS) {
        const t = (zSource - a.z) / span;
        const cut = {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          z: zSource,
        };
        lengthSource += segmentLengthSource(cursor, cut);
      }
    }
    break;
  }
  return lengthSource * scale;
}

/** Keep the open sub-segment strictly inside (zLo, zHi); null when empty. */
function clipSegmentToBand(
  segment: SparseSupportRouteSegment,
  zLoSource: number,
  zHiSource: number,
): SparseSupportRouteSegment | null {
  const points: Vector3Value[] = [segment.start, segment.end];
  for (const z of [zLoSource, zHiSource]) {
    if (!Number.isFinite(z)) continue;
    const span = segment.end.z - segment.start.z;
    if (Math.abs(span) < EPS) continue;
    const t = (z - segment.start.z) / span;
    if (t > EPS && t < 1 - EPS) {
      points.push({
        x: segment.start.x + (segment.end.x - segment.start.x) * t,
        y: segment.start.y + (segment.end.y - segment.start.y) * t,
        z,
      });
    }
  }
  points.sort((a, b) => {
    const da = Math.hypot(a.x - segment.start.x, a.y - segment.start.y, a.z - segment.start.z);
    const db = Math.hypot(b.x - segment.start.x, b.y - segment.start.y, b.z - segment.start.z);
    return da - db;
  });
  let best: SparseSupportRouteSegment | null = null;
  for (let i = 0; i + 1 < points.length; i++) {
    const mid = {
      x: (points[i].x + points[i + 1].x) / 2,
      y: (points[i].y + points[i + 1].y) / 2,
      z: (points[i].z + points[i + 1].z) / 2,
    };
    if (mid.z > zLoSource + EPS && mid.z < zHiSource - EPS) {
      const candidate = { start: points[i], end: points[i + 1], radius: segment.radius };
      const length = segmentLengthSource(candidate.start, candidate.end);
      if (!best || length > segmentLengthSource(best.start, best.end)) best = candidate;
    }
  }
  return best;
}

function classifyBootstrap(bootstrapMm: number, options: SupportBootstrapFootingOptions): BootstrapClassification {
  if (bootstrapMm <= options.earlyStableBootstrapMm + EPS) return "early-stable";
  if (bootstrapMm <= options.longBootstrapMm + EPS) return "mid";
  return "long-bootstrap";
}

/** Sampled capsule audit: every sample must keep radius clearance from BODY. */
export function auditCapsuleFree(
  start: Vector3Value,
  end: Vector3Value,
  radiusSource: number,
  options: SupportBootstrapFootingOptions,
): boolean {
  const samples = Math.max(2, Math.floor(options.auditSamplesPerCapsule ?? 24));
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const x = start.x + (end.x - start.x) * t;
    const y = start.y + (end.y - start.y) * t;
    const z = start.z + (end.z - start.z) * t;
    const sdf = options.bodySdf(x, y, z);
    if (!(Number.isFinite(sdf)) || sdf < radiusSource - EPS) return false;
  }
  return true;
}

function frustumVolumeMm3(r1Source: number, r2Source: number, heightMm: number, scale: number): number {
  const r1 = r1Source * scale;
  const r2 = r2Source * scale;
  return (Math.PI * heightMm) / 3 * (r1 * r1 + r1 * r2 + r2 * r2);
}

function nearestNeighbor(
  id: string,
  root: Vector3Value,
  inputs: readonly BootstrapTrunkInput[],
  scale: number,
): BootstrapRootNeighbor | null {
  let best: BootstrapRootNeighbor | null = null;
  for (const other of inputs) {
    if (other.id === id) continue;
    const distanceMm = plateDistanceMm(root, other.route.root, scale);
    if (!Number.isFinite(distanceMm)) continue;
    if (!best || distanceMm < best.distanceMm - EPS
      || (Math.abs(distanceMm - best.distanceMm) <= EPS && other.id < best.id)) {
      best = { id: other.id, distanceMm };
    }
  }
  return best;
}

export interface BootstrapJunctionInput {
  trunkId: string;
  heightMm: number;
}

function analyzeOneTrunk(
  input: BootstrapTrunkInput,
  inputs: readonly BootstrapTrunkInput[],
  options: SupportBootstrapFootingOptions,
  junctions: readonly BootstrapJunctionInput[],
  rootReinforcedHeightMm: number,
  braceCounts: ReadonlyMap<string, { total: number; low: number }>,
): BootstrapTrunkMetrics {
  const scale = options.scaleMmPerUnit;
  const bodyContactHeightMm = input.route.segments.length > 0
    ? heightMm(input.route.neckStart, options.plateZ, scale)
    : null;
  let junctionHeightMm = bodyContactHeightMm;
  for (const junction of junctions) {
    if (junction.trunkId !== input.id) continue;
    if (!(junction.heightMm > EPS)) continue;
    if (junctionHeightMm === null || junction.heightMm < junctionHeightMm) {
      junctionHeightMm = junction.heightMm;
    }
  }
  const bootstrapMm = junctionHeightMm !== null
    ? polylineLengthToHeightMm(input.route, options.plateZ, scale, junctionHeightMm)
    : 0;
  // Longest later span strictly above the junction and strictly below the
  // terminal neck/contact band (neck material never counts as free span).
  // Segments crossing a boundary are clipped so braced trunks report the
  // free length that remains above their first junction.
  const junctionZSource = options.plateZ + (junctionHeightMm ?? 0) / scale;
  const neckZSource = bodyContactHeightMm !== null
    ? options.plateZ + bodyContactHeightMm / scale
    : Number.POSITIVE_INFINITY;
  let longestLaterMm = 0;
  for (const segment of input.route.segments) {
    const clipped = clipSegmentToBand(segment, junctionZSource, neckZSource);
    if (!clipped) continue;
    const spanMm = segmentLengthSource(clipped.start, clipped.end) * scale;
    if (spanMm > longestLaterMm) longestLaterMm = spanMm;
  }
  const counts = braceCounts.get(input.id) ?? { total: 0, low: 0 };
  return {
    id: input.id,
    classification: classifyBootstrap(bootstrapMm, options),
    rootPosition: copyPoint(input.route.root),
    rootDiameterMm: options.supportDiameterMm,
    rootReinforcedHeightMm,
    firstStableJunctionHeightMm: junctionHeightMm,
    bootstrapUnbracedLengthMm: bootstrapMm,
    longestLaterUnbracedLengthMm: longestLaterMm,
    nearestRootNeighbor: nearestNeighbor(input.id, input.route.root, inputs, scale),
    firstBodyContactHeightMm: bodyContactHeightMm,
    braceCount: counts.total,
    lowBraceCount: counts.low,
  };
}

export function analyzeBootstrapTrunks(
  inputs: readonly BootstrapTrunkInput[],
  options: SupportBootstrapFootingOptions,
  junctions: readonly BootstrapJunctionInput[] = [],
  braceCounts: ReadonlyMap<string, { total: number; low: number }> = new Map(),
  rootReinforcedHeightMm = 0,
): BootstrapTrunkMetrics[] {
  const checked = requireOptions(options);
  return inputs.map((input) => analyzeOneTrunk(input, inputs, checked, junctions, rootReinforcedHeightMm, braceCounts));
}

function buildThickeningSegments(
  root: Vector3Value,
  plateZ: number,
  scale: number,
  reinforcedHeightMm: number,
  taperLengthMm: number,
  rootRadiusSource: number,
  normalRadiusSource: number,
): { segments: SparseSupportRouteSegment[]; profile: BootstrapTaperPoint[]; extraVolumeMm3: number } {
  const z0 = plateZ;
  const z1 = plateZ + reinforcedHeightMm / scale;
  const z2 = z1 + taperLengthMm / scale;
  const segments: SparseSupportRouteSegment[] = [];
  let extraVolumeMm3 = 0;
  const at = (z: number): Vector3Value => ({ x: root.x, y: root.y, z });
  // Lower section at full thickened radius (never a giant plate-covering foot:
  // bounded by reinforcedHeightMm and audited against neighbors/BODY/plate).
  segments.push({ start: at(z0), end: at(z1), radius: rootRadiusSource });
  extraVolumeMm3 += Math.PI * (rootRadiusSource * scale) ** 2 * reinforcedHeightMm;
  const profile: BootstrapTaperPoint[] = [
    { heightMm: 0, radiusSource: rootRadiusSource },
    { heightMm: reinforcedHeightMm, radiusSource: rootRadiusSource },
  ];
  let previous = { z: z1, r: rootRadiusSource };
  for (let i = 1; i <= TAPER_SUBDIVISIONS; i++) {
    const t = i / TAPER_SUBDIVISIONS;
    const z = z1 + (z2 - z1) * t;
    const r = rootRadiusSource + (normalRadiusSource - rootRadiusSource) * t;
    segments.push({ start: at(previous.z), end: at(z), radius: (previous.r + r) / 2 });
    extraVolumeMm3 += frustumVolumeMm3(previous.r, r, (taperLengthMm / TAPER_SUBDIVISIONS), scale);
    previous = { z, r };
    if (i === TAPER_SUBDIVISIONS) {
      profile.push({ heightMm: reinforcedHeightMm + taperLengthMm, radiusSource: normalRadiusSource });
    } else {
      profile.push({ heightMm: reinforcedHeightMm + taperLengthMm * t, radiusSource: r });
    }
  }
  return { segments, profile, extraVolumeMm3 };
}

export function planRootThickenings(
  inputs: readonly BootstrapTrunkInput[],
  metrics: readonly BootstrapTrunkMetrics[],
  options: SupportBootstrapFootingOptions,
): RootThickeningCandidate[] {
  const checked = requireOptions(options);
  const scale = checked.scaleMmPerUnit;
  const normalRadiusSource = (checked.supportDiameterMm * 0.5) / scale;
  const clearanceSource = checked.removalClearanceMm / scale;
  const byId = new Map(inputs.map((input) => [input.id, input]));
  const out: RootThickeningCandidate[] = [];
  for (const metric of metrics) {
    // Selective only: EARLY-STABLE trunks get no reinforcement (test 1).
    if (metric.classification === "early-stable") continue;
    const input = byId.get(metric.id);
    if (!input) continue;
    const root = input.route.root;
    if (Math.abs(root.z - checked.plateZ) > 1e-6) {
      out.push({
        trunkId: metric.id, status: "rejected", rejectReason: "root not on plate",
        appliedRootDiameterMm: checked.supportDiameterMm, profile: [], segments: [], extraVolumeMm3: 0,
      });
      continue;
    }
    let chosen: { factor: number; status: RootThickeningStatus } | null = null;
    let rejectReason: string | null = null;
    for (const factor of ROOT_SHRINK_FACTORS) {
      const diameterMm = checked.rootDiameterMm * factor;
      if (diameterMm <= checked.supportDiameterMm + EPS) {
        rejectReason = "unintentional neighboring fusion at normal diameter";
        break;
      }
      const rMaxSource = (diameterMm * 0.5) / scale;
      // Neighbor fusion: thickened footprint must keep clearance to every
      // other root shaft. Intentional brace junctions are separate objects
      // and never count as fusion.
      let fused = false;
      for (const other of inputs) {
        if (other.id === metric.id) continue;
        const gap = plateDistanceMm(root, other.route.root, scale)
          - (diameterMm * 0.5 + checked.supportDiameterMm * 0.5 + checked.removalClearanceMm);
        if (gap < -EPS) {
          fused = true;
          rejectReason = `unintentional neighboring fusion with ${other.id}`;
          break;
        }
      }
      if (fused) continue;
      // Plate footprint: stay inside bounds with the thickened radius.
      if (checked.plateBounds) {
        const b = checked.plateBounds;
        if (root.x - rMaxSource < b.minX - EPS || root.x + rMaxSource > b.maxX + EPS
          || root.y - rMaxSource < b.minY - EPS || root.y + rMaxSource > b.maxY + EPS) {
          rejectReason = "plate violation";
          continue;
        }
      }
      // BODY audit over the lower section + taper sub-capsules.
      const built = buildThickeningSegments(
        root, checked.plateZ, scale, checked.rootReinforcedHeightMm,
        checked.rootTaperLengthMm, rMaxSource, normalRadiusSource,
      );
      const collides = built.segments.some(
        (segment) => !auditCapsuleFree(segment.start, segment.end, segment.radius, checked),
      );
      if (collides) {
        rejectReason = "root thickening hits BODY";
        continue;
      }
      chosen = { factor, status: factor === 1 ? "applied" : "shrunk" };
      const full = buildThickeningSegments(
        root, checked.plateZ, scale, checked.rootReinforcedHeightMm,
        checked.rootTaperLengthMm, rMaxSource, normalRadiusSource,
      );
      out.push({
        trunkId: metric.id,
        status: chosen.status,
        rejectReason: null,
        appliedRootDiameterMm: diameterMm,
        profile: full.profile,
        segments: full.segments,
        extraVolumeMm3: full.extraVolumeMm3,
      });
      break;
    }
    if (!chosen) {
      out.push({
        trunkId: metric.id, status: "rejected", rejectReason: rejectReason ?? "no valid thickening",
        appliedRootDiameterMm: checked.supportDiameterMm, profile: [], segments: [], extraVolumeMm3: 0,
      });
    }
  }
  void clearanceSource;
  return out;
}

export interface BraceEndpointPick {
  heightAMm: number;
  heightBMm: number;
}

function braceAngleFromVerticalDeg(horizontalMm: number, verticalMm: number): number {
  return Math.atan2(horizontalMm, Math.max(verticalMm, EPS)) * (180 / Math.PI);
}

export function planLowBraces(
  inputs: readonly BootstrapTrunkInput[],
  metrics: readonly BootstrapTrunkMetrics[],
  options: SupportBootstrapFootingOptions,
): LowBraceCandidate[] {
  const checked = requireOptions(options);
  const scale = checked.scaleMmPerUnit;
  const braceRadiusSource = ((checked.braceDiameterMm ?? checked.supportDiameterMm) * 0.5) / scale;
  const byId = new Map(inputs.map((input) => [input.id, input]));
  const metricById = new Map(metrics.map((metric) => [metric.id, metric]));
  const initiators = metrics
    .filter((metric) => metric.classification === "long-bootstrap")
    .map((metric) => metric.id)
    .sort();
  const paired = new Set<string>();
  const out: LowBraceCandidate[] = [];
  let braceIndex = 0;
  for (const initiatorId of initiators) {
    if (paired.has(initiatorId)) continue;
    const initiator = byId.get(initiatorId);
    const initiatorMetric = metricById.get(initiatorId);
    if (!initiator || !initiatorMetric) continue;
    const neighbors = inputs
      .filter((other) => other.id !== initiatorId && !paired.has(other.id))
      .map((other) => ({
        other,
        distanceMm: plateDistanceMm(initiator.route.root, other.route.root, scale),
      }))
      .filter((entry) => entry.distanceMm <= checked.maxRootNeighborDistanceMm + EPS)
      .sort((a, b) => a.distanceMm - b.distanceMm || (a.other.id < b.other.id ? -1 : 1));
    if (neighbors.length === 0) continue;
    const partner = neighbors[0].other;
    const partnerMetric = metricById.get(partner.id);
    const spanMm = Math.min(
      checked.lowBraceTargetHeightMm,
      Math.min(initiatorMetric.bootstrapUnbracedLengthMm, partnerMetric?.bootstrapUnbracedLengthMm ?? 0),
    );
    // Deterministic low/high attach fractions inside the plate-near band.
    const picks: BraceEndpointPick[] = [
      { heightAMm: spanMm * 0.15, heightBMm: spanMm * 0.85 },
      { heightAMm: spanMm * 0.85, heightBMm: spanMm * 0.15 },
    ];
    let placed: LowBraceCandidate | null = null;
    let lastReject: string | null = spanMm <= 1 + EPS ? "trunks too short for low brace" : null;
    for (const pick of picks) {
      const id = `low-brace-${braceIndex}`;
      if (spanMm <= 1 + EPS) {
        lastReject = "trunks too short for low brace";
        continue;
      }
      const start = routePointAtHeight(initiator.route, checked.plateZ, scale, pick.heightAMm);
      const end = routePointAtHeight(partner.route, checked.plateZ, scale, pick.heightBMm);
      if (!start || !end) {
        lastReject = "attach height outside trunk";
        continue;
      }
      const horizontalMm = plateDistanceMm(start, end, scale);
      const verticalMm = Math.abs(pick.heightAMm - pick.heightBMm);
      const angleDeg = braceAngleFromVerticalDeg(horizontalMm, verticalMm);
      if (angleDeg > checked.maxBraceAngleFromVerticalDeg + 1e-6) {
        lastReject = `brace angle ${angleDeg.toFixed(1)}° exceeds ${checked.maxBraceAngleFromVerticalDeg}°`;
        continue;
      }
      if (Math.min(start.z, end.z) < checked.plateZ - EPS) {
        lastReject = "plate violation";
        continue;
      }
      if (!auditCapsuleFree(start, end, braceRadiusSource, checked)) {
        lastReject = "BODY between roots";
        continue;
      }
      const lengthMm = segmentLengthSource(start, end) * scale;
      placed = {
        id,
        trunkAId: initiatorId,
        trunkBId: partner.id,
        start,
        end,
        attachHeightAMm: pick.heightAMm,
        attachHeightBMm: pick.heightBMm,
        angleFromVerticalDeg: angleDeg,
        status: "candidate",
        rejectReason: null,
        lengthMm,
        extraVolumeMm3: Math.PI * (braceRadiusSource * scale) ** 2 * lengthMm,
      };
      break;
    }
    if (placed) {
      out.push(placed);
      braceIndex += 1;
      paired.add(initiatorId);
      paired.add(partner.id);
    } else if (lastReject) {
      out.push({
        id: `low-brace-${braceIndex}`,
        trunkAId: initiatorId,
        trunkBId: partner.id,
        start: copyPoint(initiator.route.root),
        end: copyPoint(partner.route.root),
        attachHeightAMm: 0,
        attachHeightBMm: 0,
        angleFromVerticalDeg: Number.NaN,
        status: "rejected",
        rejectReason: lastReject,
        lengthMm: 0,
        extraVolumeMm3: 0,
      });
      braceIndex += 1;
      paired.add(initiatorId);
    }
  }
  return out;
}

function unionFind(ids: readonly string[]): { find: (id: string) => string; union: (a: string, b: string) => void; count: () => number } {
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (id: string): string => {
    const p = parent.get(id) ?? id;
    if (p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  };
  return {
    find,
    union: (a, b) => {
      parent.set(find(a), find(b));
    },
    count: () => new Set(ids.map(find)).size,
  };
}

function removalRiskAdjacencies(
  inputs: readonly BootstrapTrunkInput[],
  appliedRadiusById: ReadonlyMap<string, number>,
  normalRadiusSource: number,
  clearanceSource: number,
  scale: number,
  intentionalPairs: ReadonlySet<string>,
): number {
  let count = 0;
  for (let i = 0; i < inputs.length; i++) {
    for (let j = i + 1; j < inputs.length; j++) {
      const a = inputs[i];
      const b = inputs[j];
      const key = [a.id, b.id].sort().join("|");
      if (intentionalPairs.has(key)) continue;
      const rA = appliedRadiusById.get(a.id) ?? normalRadiusSource;
      const rB = appliedRadiusById.get(b.id) ?? normalRadiusSource;
      const gapSource = Math.hypot(a.route.root.x - b.route.root.x, a.route.root.y - b.route.root.y)
        - (rA + rB + clearanceSource);
      if (gapSource < -EPS) count += 1;
    }
  }
  void scale;
  return count;
}

function buildModeResult(
  mode: BootstrapCompareMode,
  inputs: readonly BootstrapTrunkInput[],
  options: SupportBootstrapFootingOptions,
  thickenings: readonly RootThickeningCandidate[],
  braces: readonly LowBraceCandidate[],
): BootstrapModeResult {
  const checked = requireOptions(options);
  const scale = checked.scaleMmPerUnit;
  const acceptedBraces = braces.filter((brace) => brace.status === "candidate");
  const junctions: BootstrapJunctionInput[] = [];
  const braceCounts = new Map<string, { total: number; low: number }>();
  const intentionalPairs = new Set<string>();
  for (const brace of acceptedBraces) {
    junctions.push({ trunkId: brace.trunkAId, heightMm: brace.attachHeightAMm });
    junctions.push({ trunkId: brace.trunkBId, heightMm: brace.attachHeightBMm });
    intentionalPairs.add([brace.trunkAId, brace.trunkBId].sort().join("|"));
    for (const id of [brace.trunkAId, brace.trunkBId]) {
      const entry = braceCounts.get(id) ?? { total: 0, low: 0 };
      entry.total += 1;
      if (Math.max(brace.attachHeightAMm, brace.attachHeightBMm) <= checked.lowBraceTargetHeightMm + EPS) {
        entry.low += 1;
      }
      braceCounts.set(id, entry);
    }
  }
  const acceptedThickenings = thickenings.filter((t) => t.status !== "rejected");
  const reinforcedById = new Map(acceptedThickenings.map((t) => [t.trunkId, checked.rootReinforcedHeightMm]));
  const maxReinforced = acceptedThickenings.length > 0 ? checked.rootReinforcedHeightMm : 0;
  const trunks = inputs.map((input) => analyzeOneTrunk(
    input,
    inputs,
    checked,
    junctions,
    reinforcedById.get(input.id) ?? 0,
    braceCounts,
  ));
  void maxReinforced;
  const appliedRadiusById = new Map<string, number>();
  const normalRadiusSource = (checked.supportDiameterMm * 0.5) / scale;
  for (const t of acceptedThickenings) {
    appliedRadiusById.set(t.trunkId, (t.appliedRootDiameterMm * 0.5) / scale);
  }
  const components = unionFind(inputs.map((input) => input.id));
  for (const brace of acceptedBraces) components.union(brace.trunkAId, brace.trunkBId);
  const bodyRejectedCount = thickenings.filter(
    (t) => t.status === "rejected" && (t.rejectReason ?? "").includes("BODY"),
  ).length + braces.filter(
    (b) => b.status === "rejected" && (b.rejectReason ?? "").includes("BODY"),
  ).length;
  const bootstraps = trunks.map((t) => t.bootstrapUnbracedLengthMm);
  const junctionHeights = trunks
    .map((t) => t.firstStableJunctionHeightMm)
    .filter((h): h is number => h !== null);
  const compare: BootstrapCompareMetrics = {
    mode,
    trunkCount: trunks.length,
    maxBootstrapUnbracedLengthMm: bootstraps.length ? Math.max(...bootstraps) : 0,
    meanBootstrapUnbracedLengthMm: bootstraps.length
      ? bootstraps.reduce((a, b) => a + b, 0) / bootstraps.length
      : 0,
    longBootstrapCount: trunks.filter((t) => t.classification === "long-bootstrap").length,
    meanFirstStableJunctionHeightMm: junctionHeights.length
      ? junctionHeights.reduce((a, b) => a + b, 0) / junctionHeights.length
      : null,
    rootReinforcedCount: acceptedThickenings.length,
    lowBraceCount: acceptedBraces.length,
    totalExtraSupportVolumeMm3: [...acceptedThickenings, ...acceptedBraces]
      .reduce((sum, item) => sum + item.extraVolumeMm3, 0),
    bodyCollisionCount: 0,
    bodyRejectedCount,
    supportConnectedComponents: components.count(),
    removalRiskAdjacencyCount: removalRiskAdjacencies(
      inputs, appliedRadiusById, normalRadiusSource, checked.removalClearanceMm / scale, scale, intentionalPairs,
    ),
  };
  return {
    mode,
    version: SUPPORT_BOOTSTRAP_FOOTING_VERSION,
    trunks,
    thickenings: [...thickenings],
    braces: [...braces],
    compare,
  };
}

/**
 * A/B/C/D comparison on one trunk set with identical BODY / routes / target
 * selection. Mode current performs analysis only and returns zero candidates
 * (existing Print #2 topology unchanged).
 */
export function compareBootstrapModes(
  inputs: readonly BootstrapTrunkInput[],
  options: SupportBootstrapFootingOptions,
): BootstrapModeComparison {
  const checked = requireOptions(options);
  const currentMetrics = analyzeBootstrapTrunks(inputs, checked);
  const thickenings = planRootThickenings(inputs, currentMetrics, checked);
  const braces = planLowBraces(inputs, currentMetrics, checked);
  return {
    current: buildModeResult(modeOf("current"), inputs, checked, [], []),
    root: buildModeResult(modeOf("root"), inputs, checked, thickenings, []),
    brace: buildModeResult(modeOf("brace"), inputs, checked, [], braces),
    combined: buildModeResult(modeOf("combined"), inputs, checked, thickenings, braces),
  };
}

function modeOf(mode: BootstrapCompareMode): BootstrapCompareMode {
  return mode;
}

export interface VerticalStressFixture {
  inputs: BootstrapTrunkInput[];
  options: SupportBootstrapFootingOptions;
}

function verticalRoute(
  x: number,
  y: number,
  heightSource: number,
  shaftRadiusSource: number,
  neckRadiusSource: number,
  neckLengthSource: number,
): SparseRemovableSupportRoute {
  const root = { x, y, z: 0 };
  const target = { x, y, z: heightSource };
  const neckStart = { x, y, z: heightSource - neckLengthSource };
  return {
    kind: "vertical",
    root,
    neckStart,
    target,
    segments: [
      { start: copyPoint(root), end: copyPoint(neckStart), radius: shaftRadiusSource },
      { start: copyPoint(neckStart), end: copyPoint(target), radius: neckRadiusSource },
    ],
  };
}

/**
 * Synthetic Vertical Stress Fixture: identical BODY/target selection across
 * modes (empty BODY SDF; contacts attributed at targets), trunks spanning
 * short / mid / long-isolated / long-paired bootstrap lengths.
 */
export function buildVerticalStressFixture(
  overrides?: Partial<SupportBootstrapFootingOptions>,
): VerticalStressFixture {
  const shaftRadiusSource = 0.8;
  const neckRadiusSource = 0.4;
  const inputs: BootstrapTrunkInput[] = [
    { id: "trunk-short", route: verticalRoute(0, 0, 6, shaftRadiusSource, neckRadiusSource, 1) },
    { id: "trunk-mid", route: verticalRoute(30, 0, 14, shaftRadiusSource, neckRadiusSource, 1) },
    { id: "trunk-long-a", route: verticalRoute(60, 0, 30, shaftRadiusSource, neckRadiusSource, 1) },
    { id: "trunk-long-b", route: verticalRoute(64, 0, 30, shaftRadiusSource, neckRadiusSource, 1) },
    { id: "trunk-long-solo", route: verticalRoute(100, 0, 30, shaftRadiusSource, neckRadiusSource, 1) },
  ];
  const options: SupportBootstrapFootingOptions = {
    scaleMmPerUnit: 1,
    plateZ: 0,
    supportDiameterMm: shaftRadiusSource * 2,
    rootDiameterMm: 2.4,
    rootReinforcedHeightMm: 4,
    rootTaperLengthMm: 6,
    maxBraceAngleFromVerticalDeg: 45,
    lowBraceTargetHeightMm: 6,
    maxRootNeighborDistanceMm: 12,
    earlyStableBootstrapMm: 8,
    longBootstrapMm: 18,
    removalClearanceMm: 0.3,
    plateBounds: { minX: -10, maxX: 120, minY: -10, maxY: 10 },
    bodySdf: () => 10,
    ...overrides,
  };
  return { inputs, options };
}

export interface BootstrapDebugScene {
  roots: Array<{ id: string; position: Vector3Value; radiusSource: number }>;
  junctions: Array<{ trunkId: string; position: Vector3Value }>;
  bootstrapSegments: SparseSupportRouteSegment[];
  thickenedSegments: SparseSupportRouteSegment[];
  braces: SparseSupportRouteSegment[];
  rejected: Array<{ id: string; position: Vector3Value; reason: string }>;
}

/** Presentation-only marker/segment facts for the experimental viewer. */
export function bootstrapDebugScene(result: BootstrapModeResult): BootstrapDebugScene {
  const roots = result.trunks.map((trunk) => ({
    id: trunk.id,
    position: copyPoint(trunk.rootPosition),
    radiusSource: trunk.rootDiameterMm * 0.5,
  }));
  const junctions: BootstrapDebugScene["junctions"] = [];
  const bootstrapSegments: SparseSupportRouteSegment[] = [];
  for (const trunk of result.trunks) {
    if (trunk.firstStableJunctionHeightMm === null) continue;
    const junction: Vector3Value = {
      x: trunk.rootPosition.x,
      y: trunk.rootPosition.y,
      z: trunk.rootPosition.z + trunk.firstStableJunctionHeightMm,
    };
    junctions.push({ trunkId: trunk.id, position: junction });
    bootstrapSegments.push({
      start: copyPoint(trunk.rootPosition),
      end: junction,
      radius: (trunk.rootDiameterMm * 0.5) * 0.6,
    });
  }
  // NOTE: fixture scale is 1 unit = 1 mm; the viewer renders source units and
  // labels mm from the same numbers. Production wiring must apply the real scale.
  const thickenedSegments = result.thickenings
    .filter((t) => t.status !== "rejected")
    .flatMap((t) => t.segments.map((s) => ({
      start: copyPoint(s.start),
      end: copyPoint(s.end),
      radius: s.radius,
    })));
  const braces = result.braces
    .filter((b) => b.status === "candidate")
    .map((b) => ({
      start: copyPoint(b.start),
      end: copyPoint(b.end),
      radius: 0.8,
    }));
  const rejected: BootstrapDebugScene["rejected"] = [
    ...result.thickenings
      .filter((t) => t.status === "rejected")
      .map((t) => ({
        id: `${t.trunkId}:thickening`,
        position: {
          x: result.trunks.find((tr) => tr.id === t.trunkId)?.rootPosition.x ?? 0,
          y: result.trunks.find((tr) => tr.id === t.trunkId)?.rootPosition.y ?? 0,
          z: result.trunks.find((tr) => tr.id === t.trunkId)?.rootPosition.z ?? 0,
        },
        reason: t.rejectReason ?? "rejected",
      })),
    ...result.braces
      .filter((b) => b.status === "rejected")
      .map((b) => ({ id: b.id, position: copyPoint(b.start), reason: b.rejectReason ?? "rejected" })),
  ];
  return { roots, junctions, bootstrapSegments, thickenedSegments, braces, rejected };
}

/** Stable identity for determinism tests (same input -> same result). */
export function supportBootstrapFootingFingerprint(value: unknown): string {
  return sha256HexSync(`support-bootstrap-footing\n${canonicalStringify(value)}`);
}
