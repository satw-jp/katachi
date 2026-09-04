import { canonicalStringify } from "../graphCore.ts";
import { sha256HexSync } from "../../../lib/hash.ts";
import {
  buildBranchedTreeFixture,
  compareBranchedModes,
  type BranchedModeComparison,
  type BranchedTargetInput,
  type SupportBranchedTreeOptions,
} from "./supportBranchedTree.ts";
import type { SparseRemovableSupportRoute } from "./sparseRemovableSupport.ts";

/**
 * SKIN Support v2 Experimental — Multi-Fixture / Author Organic Fixture Intake v0.
 *
 * Keeps the Synthetic Vertical Stress Fixture as the regression / physics
 * stress test while opening the same Support v2 analysis to a future Author
 * Organic Fixture. The fixture contract is portable, experimental and
 * development-only: it is NOT the production FKEI (which is unchanged), it
 * is never authoritative, and it carries derived evidence — never a new
 * authoring model.
 *
 * CORE RULES (fail-closed, explicit):
 * - Author geometry is NEVER generated here. Unit tests use tiny neutral
 *   numerical fixtures labeled TEST FIXTURE, never "Author Organic Fixture".
 *   An unloaded author slot reads NOT LOADED; nothing is synthesized.
 * - Same parameters, same algorithm on both fixture kinds. No
 *   `if (author) easierThreshold` special-casing exists in this file.
 * - Unknown physical scale stays unknown (null). Import never silently
 *   rescales to 80/120 mm or anything else; coordinates pass through
 *   verbatim and any analysis-scale assumption is recorded in provenance.
 * - Multi-component / open spatial BODY arrangements are stored and
 *   audited by proximity; they are never auto-invalidated (print safety
 *   stays a separate diagnosis).
 * - Invalid loads never destroy existing valid state (registry rule).
 */

export const SUPPORT_EXPERIMENT_FIXTURE_SCHEMA = "katachi.support-experiment-fixture.v1" as const;
export type SupportExperimentFixtureKind = "synthetic" | "author";
/** Brute-force soup audit cap: bigger imports must be downsampled first. */
export const SUPPORT_FIXTURE_MAX_SOUP_TRIANGLES = 5000;

export interface SupportExperimentFixturePhysical {
  /** Null = unknown. Never silently defaulted to 80/120. */
  targetLongestMm: number | null;
  supportDiameterMm: number | null;
  permanentDiameterMm: number | null;
}

export interface SupportExperimentFixtureBody {
  kind: "empty-space" | "triangle-soup";
  /** Coordinate frame of positions. Imports never rescale across frames. */
  units: "source";
  components: Array<{ id: string; triangleCount: number }>;
  /** Flat xyz triplets in source units. Empty when kind is empty-space. */
  positions: number[];
}

export interface SupportExperimentFixtureTarget {
  id: string;
  route: SparseRemovableSupportRoute;
  critical: boolean;
  highRisk?: boolean;
}

export interface SupportExperimentFixture {
  schema: typeof SUPPORT_EXPERIMENT_FIXTURE_SCHEMA;
  id: string;
  label: string;
  kind: SupportExperimentFixtureKind;
  provenance: {
    source: string;
    sourceFingerprint: string;
    capturedAt?: string;
    analysisScaleNote?: string;
  };
  physical: SupportExperimentFixturePhysical;
  plateZ: number;
  body: SupportExperimentFixtureBody;
  targets: SupportExperimentFixtureTarget[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function fail(message: string): never {
  throw new Error(`invalid support experiment fixture: ${message}`);
}

function checkPoint(point: unknown, where: string): asserts point is { x: number; y: number; z: number } {
  if (typeof point !== "object" || point === null) fail(`${where} is not a point`);
  const p = point as Record<string, unknown>;
  if (!isFiniteNumber(p["x"]) || !isFiniteNumber(p["y"]) || !isFiniteNumber(p["z"])) {
    fail(`${where} has non-finite coordinates`);
  }
}

function checkRoute(route: unknown, targetId: string): asserts route is SparseRemovableSupportRoute {
  if (typeof route !== "object" || route === null) fail(`target ${targetId} route is not an object`);
  const r = route as Record<string, unknown>;
  if (r["kind"] !== "vertical" && r["kind"] !== "leaning") {
    fail(`target ${targetId} route kind must be vertical|leaning`);
  }
  checkPoint(r["root"], `target ${targetId} root`);
  checkPoint(r["neckStart"], `target ${targetId} neckStart`);
  checkPoint(r["target"], `target ${targetId} target point`);
  if (!Array.isArray(r["segments"]) || r["segments"].length === 0) {
    fail(`target ${targetId} has no route segments`);
  }
  r["segments"].forEach((segment: unknown, index: number) => {
    if (typeof segment !== "object" || segment === null) {
      fail(`target ${targetId} segment ${index} is not an object (malformed segment ref)`);
    }
    const s = segment as Record<string, unknown>;
    // Missing start/end fail here as malformed segment refs (never silently skipped).
    checkPoint(s["start"], `target ${targetId} segment ${index} start`);
    checkPoint(s["end"], `target ${targetId} segment ${index} end`);
    if (!isFiniteNumber(s["radius"]) || (s["radius"] as number) <= 0) {
      fail(`target ${targetId} segment ${index} has invalid radius`);
    }
    const a = s["start"] as { x: number; y: number; z: number };
    const b = s["end"] as { x: number; y: number; z: number };
    if (Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) <= 1e-12) {
      fail(`target ${targetId} segment ${index} is zero-length`);
    }
  });
}

/** Fail-closed validation. Returns a deep-cloned, canonical document. */
export function validateSupportExperimentFixture(value: unknown): SupportExperimentFixture {
  if (typeof value !== "object" || value === null) fail("document is not an object");
  const doc = value as Record<string, unknown>;
  if (doc["schema"] !== SUPPORT_EXPERIMENT_FIXTURE_SCHEMA) {
    fail(`unsupported schema version ${JSON.stringify(doc["schema"])}`);
  }
  if (typeof doc["id"] !== "string" || doc["id"].length === 0) fail("missing fixture id");
  if (typeof doc["label"] !== "string" || doc["label"].length === 0) fail("missing fixture label");
  if (doc["kind"] !== "synthetic" && doc["kind"] !== "author") fail("kind must be synthetic|author");
  const provenance = doc["provenance"] as Record<string, unknown> | undefined;
  if (typeof provenance !== "object" || provenance === null) fail("missing provenance");
  if (typeof provenance["source"] !== "string" || provenance["source"].length === 0) {
    fail("missing provenance.source");
  }
  if (typeof provenance["sourceFingerprint"] !== "string" || provenance["sourceFingerprint"].length === 0) {
    fail("missing provenance.sourceFingerprint");
  }
  const physical = doc["physical"] as Record<string, unknown> | undefined;
  if (typeof physical !== "object" || physical === null) fail("missing physical scale evidence");
  for (const key of ["targetLongestMm", "supportDiameterMm", "permanentDiameterMm"] as const) {
    const v = physical[key];
    if (v !== null && !(isFiniteNumber(v) && v > 0)) fail(`malformed physical value ${key}`);
  }
  if (!isFiniteNumber(doc["plateZ"])) fail("missing finite plateZ");
  const body = doc["body"] as Record<string, unknown> | undefined;
  if (typeof body !== "object" || body === null) fail("missing BODY evidence");
  if (body["kind"] !== "empty-space" && body["kind"] !== "triangle-soup") {
    fail("body.kind must be empty-space|triangle-soup");
  }
  if (body["units"] !== "source") fail("body.units must be source (no silent rescale)");
  if (!Array.isArray(body["components"])) fail("body.components must be an array");
  if (!Array.isArray(body["positions"])) fail("body.positions must be an array");
  const positions = body["positions"] as unknown[];
  if (positions.length % 9 !== 0) fail("body.positions length must be a multiple of 9");
  if (!positions.every((v) => isFiniteNumber(v))) fail("body.positions must be finite");
  if (body["kind"] === "empty-space" && positions.length !== 0) {
    fail("empty-space BODY must carry no positions");
  }
  if (positions.length / 9 > SUPPORT_FIXTURE_MAX_SOUP_TRIANGLES) {
    fail(`triangle soup exceeds the v0 audit cap (${SUPPORT_FIXTURE_MAX_SOUP_TRIANGLES}); downsample before import`);
  }
  if (!Array.isArray(doc["targets"]) || (doc["targets"] as unknown[]).length === 0) {
    fail("fixture carries no targets");
  }
  const seen = new Set<string>();
  for (const target of doc["targets"] as unknown[]) {
    if (typeof target !== "object" || target === null) fail("target entry is not an object");
    const t = target as Record<string, unknown>;
    if (typeof t["id"] !== "string" || t["id"].length === 0) fail("target has an invalid id");
    if (seen.has(t["id"] as string)) fail(`duplicate target id ${t["id"]}`);
    seen.add(t["id"] as string);
    if (typeof t["critical"] !== "boolean") fail(`target ${t["id"]} critical flag must be boolean`);
    checkRoute(t["route"], t["id"] as string);
  }
  // Canonical deep clone so later mutation of the input cannot corrupt state.
  return JSON.parse(canonicalStringify(doc)) as SupportExperimentFixture;
}

export function serializeSupportExperimentFixture(fixture: SupportExperimentFixture): string {
  return `${JSON.stringify(validateSupportExperimentFixture(fixture), null, 2)}\n`;
}

export function parseSupportExperimentFixture(text: string): SupportExperimentFixture {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    fail("file is not valid JSON");
  }
  return validateSupportExperimentFixture(parsed);
}

export function supportExperimentFixtureFingerprint(value: unknown): string {
  return sha256HexSync(`support-experiment-fixture\n${canonicalStringify(value)}`);
}

/** Unsigned distance from point to triangle (exact, deterministic). */
function pointTriangleDistance(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): number {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return Math.hypot(apx, apy, apz);
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return Math.hypot(bpx, bpy, bpz);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return Math.hypot(apx - abx * v, apy - aby * v, apz - abz * v);
  }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return Math.hypot(cpx, cpy, cpz);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return Math.hypot(apx - acx * w, apy - acy * w, apz - acz * w);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return Math.hypot(bpx + (cpx - bpx) * w, bpy + (cpy - bpy) * w, bpz + (cpz - bpz) * w);
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return Math.hypot(apx - abx * v - acx * w, apy - aby * v - acy * w, apz - abz * v - acz * w);
}

/**
 * BODY SDF over triangle-soup evidence. Unsigned distance to the supplied
 * surface: exact clearance for closed solids; a documented proximity audit
 * (not a print-safety proof) for open or multi-component arrangements,
 * which are never auto-invalidated. Brute force within the v0 import cap.
 */
export function buildTriangleSoupSdf(positions: readonly number[]): (x: number, y: number, z: number) => number {
  if (positions.length === 0 || positions.length % 9 !== 0) {
    throw new Error("triangle soup positions must be a non-empty multiple of 9");
  }
  if (positions.length / 9 > SUPPORT_FIXTURE_MAX_SOUP_TRIANGLES) {
    throw new Error("triangle soup exceeds the v0 audit cap");
  }
  const flat = Float64Array.from(positions);
  return (x: number, y: number, z: number): number => {
    let best = Number.POSITIVE_INFINITY;
    for (let o = 0; o < flat.length; o += 9) {
      const d = pointTriangleDistance(
        x, y, z,
        flat[o], flat[o + 1], flat[o + 2],
        flat[o + 3], flat[o + 4], flat[o + 5],
        flat[o + 6], flat[o + 7], flat[o + 8],
      );
      if (d < best) best = d;
    }
    return best;
  };
}

export interface FixtureAnalysisInput {
  targets: BranchedTargetInput[];
  bodySdf: (x: number, y: number, z: number) => number;
  options: SupportBranchedTreeOptions;
}

export interface FixtureAnalysisScale {
  /** Explicit analysis scale (source units -> mm). Never inferred silently. */
  scaleMmPerUnit: number;
  plateZ?: number;
  baseOptions?: Partial<SupportBranchedTreeOptions>;
}

/**
 * Adapt any validated fixture to the shared analysis path. Empty-space BODY
 * audits trivially pass (no BODY evidence supplied); triangle-soup BODY is
 * audited by exact surface distance. Route coordinates pass through
 * verbatim — unknown physical scale never triggers a rescale.
 */
export function fixtureAnalysisInput(
  fixture: SupportExperimentFixture,
  analysis: FixtureAnalysisScale,
): FixtureAnalysisInput {
  const checked = validateSupportExperimentFixture(fixture);
  if (!(analysis.scaleMmPerUnit > 0 && Number.isFinite(analysis.scaleMmPerUnit))) {
    throw new Error("fixture analysis requires an explicit positive scaleMmPerUnit");
  }
  const plateZ = analysis.plateZ ?? checked.plateZ;
  if (!Number.isFinite(plateZ)) throw new Error("fixture analysis requires a finite plateZ");
  // Empty space carries no BODY evidence: audits trivially pass with a large
  // finite clearance (Infinity would fail the finite-SDF audit gate).
  const bodySdf = checked.body.kind === "empty-space"
    ? () => 1e9
    : buildTriangleSoupSdf(checked.body.positions);
  const options: SupportBranchedTreeOptions = {
    scaleMmPerUnit: analysis.scaleMmPerUnit,
    plateZ,
    supportDiameterMm: 1.6,
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
    ...analysis.baseOptions,
    // The BODY SDF always follows the fixture evidence (never overridable
    // into a weaker audit through baseOptions).
    bodySdf,
  };
  return {
    targets: checked.targets.map((t) => ({
      id: t.id,
      route: {
        kind: t.route.kind,
        root: { ...t.route.root },
        neckStart: { ...t.route.neckStart },
        target: { ...t.route.target },
        segments: t.route.segments.map((s) => ({
          start: { ...s.start },
          end: { ...s.end },
          radius: s.radius,
        })),
      },
      critical: t.critical,
      ...(t.highRisk === undefined ? {} : { highRisk: t.highRisk }),
    })),
    bodySdf,
    options,
  };
}

/** The canonical Synthetic Vertical Stress Fixture as a fixture document. */
export function syntheticVerticalStressFixtureDocument(): SupportExperimentFixture {
  const built = buildBranchedTreeFixture();
  const targets: SupportExperimentFixtureTarget[] = built.targets.map((t) => ({
    id: t.id,
    route: {
      kind: t.route.kind,
      root: { ...t.route.root },
      neckStart: { ...t.route.neckStart },
      target: { ...t.route.target },
      segments: t.route.segments.map((s) => ({
        start: { ...s.start },
        end: { ...s.end },
        radius: s.radius,
      })),
    },
    critical: t.critical,
    ...(t.highRisk === undefined ? {} : { highRisk: t.highRisk }),
  }));
  return validateSupportExperimentFixture({
    schema: SUPPORT_EXPERIMENT_FIXTURE_SCHEMA,
    id: "synthetic-vertical-stress-v0",
    label: "Synthetic Vertical Stress Fixture",
    kind: "synthetic",
    provenance: {
      source: "synthetic-vertical-stress-fixture",
      sourceFingerprint: supportExperimentFixtureFingerprint({ targets }),
      capturedAt: "2026-09-04",
    },
    // Synthetic evidence has no measured physical scale: support shaft
    // radius is authored (1.6 mm diameter at unit scale), longest dimension
    // stays unknown rather than silently becoming 80/120.
    physical: { targetLongestMm: null, supportDiameterMm: 1.6, permanentDiameterMm: null },
    plateZ: built.options.plateZ,
    body: { kind: "empty-space", units: "source", components: [], positions: [] },
    targets,
  });
}

export interface FixtureModeComparison {
  fixtureId: string;
  kind: SupportExperimentFixtureKind;
  optionsFingerprint: string;
  analysisScaleNote: string;
  physical: SupportExperimentFixturePhysical;
  comparison: BranchedModeComparison;
}

/** One shared code path for both fixture kinds (same params object). */
export function compareFixtureModes(
  fixture: SupportExperimentFixture,
  analysis: FixtureAnalysisScale,
): FixtureModeComparison {
  const input = fixtureAnalysisInput(fixture, analysis);
  const comparison = compareBranchedModes(input.targets, input.options);
  const physical = validateSupportExperimentFixture(fixture).physical;
  // Functions never enter fingerprints: the SDF always follows fixture
  // evidence, recorded here as a marker.
  const { bodySdf: _audit, ...fingerprintable } = input.options;
  void _audit;
  return {
    fixtureId: fixture.id,
    kind: fixture.kind,
    optionsFingerprint: supportExperimentFixtureFingerprint({
      ...fingerprintable,
      bodySdf: "fixture-evidence",
    }),
    analysisScaleNote: physical.targetLongestMm === null && physical.supportDiameterMm === null
      ? `physical scale unknown — analysis assumes ${input.options.scaleMmPerUnit} mm per source unit (assumption, not measurement)`
      : `physical evidence targetLongestMm=${physical.targetLongestMm ?? "unknown"} supportDiameterMm=${physical.supportDiameterMm ?? "unknown"}`,
    physical: { ...physical },
    comparison,
  };
}

export interface CrossFixtureComparison {
  synthetic: FixtureModeComparison | null;
  author: FixtureModeComparison | null;
  warnings: string[];
}

/** Observation-only cross-fixture warnings (no automatic FAIL thresholds). */
export function detectOrganicGeneralizationWarnings(
  synthetic: BranchedModeComparison,
  author: BranchedModeComparison,
): string[] {
  const warnings: string[] = [];
  const s = synthetic.shared.metrics;
  const a = author.shared.metrics;
  const sMean = s.routing.meanBranchAngleFromVerticalDeg;
  const aMean = a.routing.meanBranchAngleFromVerticalDeg;
  if (aMean !== null && (sMean === null || aMean > sMean + 5)) {
    warnings.push(`observation: author branch angles worse (mean ${aMean.toFixed(1)}° vs synthetic ${sMean?.toFixed(1) ?? "—"}°)`);
  }
  if (a.topology.treeCount === 0 && s.topology.treeCount > 0) {
    warnings.push("observation: shared corridor opportunities disappear on the author fixture");
  }
  if (a.routing.rejectedShareCandidates > s.routing.rejectedShareCandidates) {
    warnings.push(`observation: BODY collision rejects increase (${a.routing.rejectedShareCandidates} vs ${s.routing.rejectedShareCandidates})`);
  }
  if (a.bootstrap.meanBootstrapUnbracedLengthMm > s.bootstrap.meanBootstrapUnbracedLengthMm + 1) {
    warnings.push(`observation: author bootstrap longer (mean ${a.bootstrap.meanBootstrapUnbracedLengthMm.toFixed(1)} vs ${s.bootstrap.meanBootstrapUnbracedLengthMm.toFixed(1)} mm)`);
  }
  if (a.failureDomain.maxTargetsLostOnRootFailure > s.failureDomain.maxTargetsLostOnRootFailure) {
    warnings.push("observation: author failure domain larger than synthetic");
  }
  if (a.targets.unresolved > s.targets.unresolved) {
    warnings.push(`observation: author unresolved targets increase (${a.targets.unresolved} vs ${s.targets.unresolved})`);
  }
  if (a.removal.treeComplexity > s.removal.treeComplexity) {
    warnings.push(`observation: author removal complexity higher (${a.removal.treeComplexity} vs ${s.removal.treeComplexity})`);
  }
  return warnings;
}

export interface SupportExperimentRegistry {
  getSynthetic(): SupportExperimentFixture;
  getAuthor(): SupportExperimentFixture | null;
  getActive(): SupportExperimentFixture;
  getActiveId(): string;
  setActive(id: string): void;
  /** Validates first: invalid loads never destroy existing valid state. */
  setAuthorFixture(value: unknown): SupportExperimentFixture;
  clearAuthor(): void;
}

/** Synthetic + at most one Author slot. Invalid imports preserve state. */
export function createSupportExperimentRegistry(): SupportExperimentRegistry {
  const synthetic = syntheticVerticalStressFixtureDocument();
  let author: SupportExperimentFixture | null = null;
  let activeId = synthetic.id;
  return {
    getSynthetic: () => synthetic,
    getAuthor: () => author,
    getActive: () => {
      if (activeId === synthetic.id) return synthetic;
      if (author && activeId === author.id) return author;
      return synthetic;
    },
    getActiveId: () => activeId,
    setActive: (id: string) => {
      if (id !== synthetic.id && (!author || id !== author.id)) {
        throw new Error(`unknown fixture id ${id}`);
      }
      activeId = id;
    },
    setAuthorFixture: (value: unknown) => {
      const checked = validateSupportExperimentFixture(value);
      if (checked.kind !== "author") throw new Error("author slot accepts only kind=author fixtures");
      author = checked;
      activeId = checked.id;
      return checked;
    },
    clearAuthor: () => {
      author = null;
      activeId = synthetic.id;
    },
  };
}

export interface SupportExperimentCaptureEvidence {
  id: string;
  label: string;
  kind: SupportExperimentFixtureKind;
  provenance: { source: string; sourceFingerprint: string; capturedAt?: string };
  physical: SupportExperimentFixturePhysical;
  plateZ: number;
  body: SupportExperimentFixtureBody;
  targets: SupportExperimentFixtureTarget[];
}

/**
 * Pure capture adapter: derived SKIN evidence -> validated fixture document.
 * Builds a fresh validated copy; the input evidence is never mutated and no
 * production state (Golden project, FKEI) is touched. Wiring this into a
 * production UI is out of scope — the experimental viewer offers an explicit
 * capture/download utility on top of this function.
 */
export function captureSupportExperimentFixture(
  evidence: SupportExperimentCaptureEvidence,
): SupportExperimentFixture {
  return validateSupportExperimentFixture({
    schema: SUPPORT_EXPERIMENT_FIXTURE_SCHEMA,
    id: evidence.id,
    label: evidence.label,
    kind: evidence.kind,
    provenance: { ...evidence.provenance },
    physical: { ...evidence.physical },
    plateZ: evidence.plateZ,
    body: {
      kind: evidence.body.kind,
      units: evidence.body.units,
      components: evidence.body.components.map((c) => ({ ...c })),
      positions: [...evidence.body.positions],
    },
    targets: evidence.targets.map((t) => ({
      id: t.id,
      route: {
        kind: t.route.kind,
        root: { ...t.route.root },
        neckStart: { ...t.route.neckStart },
        target: { ...t.route.target },
        segments: t.route.segments.map((s) => ({
          start: { ...s.start },
          end: { ...s.end },
          radius: s.radius,
        })),
      },
      critical: t.critical,
      ...(t.highRisk === undefined ? {} : { highRisk: t.highRisk }),
    })),
  });
}
