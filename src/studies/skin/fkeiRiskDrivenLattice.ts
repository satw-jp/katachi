// Versioned, detached checkpoint payload for the one reviewed Risk-driven
// Permanent Lattice v0 candidate.  This module intentionally never imports
// either planner: hydration is validation plus deterministic graph append.

import {
  augmentRiskDrivenPermanentLatticeGraph,
  type RiskDrivenPermanentLatticeAnchor,
  type RiskDrivenPermanentLatticeBranch,
  type RiskDrivenPermanentLatticeCandidate,
  type RiskDrivenPermanentLatticeEdge,
  type RiskDrivenPermanentLatticeGraph,
  type RiskDrivenPermanentLatticeNode,
  type RiskDrivenPermanentLatticeSpine,
} from "./riskDrivenPermanentLattice.ts";
import type { InternalStructureGraph, Vector3Value } from "./voronoi.ts";
import type { Ball, Patch, SkinMode } from "./field.ts";
import { sha256HexSync } from "../../lib/hash.ts";
import { canonicalStringify } from "./graphCore.ts";

export const FKEI_RISK_DRIVEN_LATTICE_SCHEMA_VERSION = 1 as const;
export const FKEI_RISK_DRIVEN_LATTICE_PRODUCER = "katachi.skin.risk-driven-permanent-lattice-v0" as const;
export const FKEI_CANONICAL_DRY_WEB_SCHEMA_VERSION = 1 as const;

export interface FkeiExactDiagnosisSummary {
  readonly teal: number;
  readonly orange: number;
  readonly red: number;
  /** Immutable external verification file; this is a summary, not face data. */
  readonly provenanceSha256: string;
  /** SHA-256 over every compact fact below; detects count/provenance edits. */
  readonly summarySha256: string;
}

export interface FkeiCanonicalDryWebArtifact {
  readonly schemaVersion: typeof FKEI_CANONICAL_DRY_WEB_SCHEMA_VERSION;
  readonly producer: typeof FKEI_RISK_DRIVEN_LATTICE_PRODUCER;
  readonly inputBinding: {
    readonly shapeFingerprint: string;
    readonly patchSetRevision: number;
    readonly paintRevision: number;
    readonly artworkGraphSourceKey: string;
    readonly canonicalRequestSha256: string;
    /** SHA-256 of the saved canonical graph's canonical JSON.  It binds the
     * compact checkpoint to the reviewed geometry, not merely its counts. */
    readonly canonicalGraphSha256: string;
    readonly surfaceResolution: number;
    readonly surfaceTargetLongestMm: number;
    readonly surfaceAngleThresholdDeg: number;
    readonly exactDiagnosisProvenanceSha256: string;
  };
  /** The actual canonical graph, not a generated substitute. */
  readonly graph: InternalStructureGraph;
  /** Exact source-space Shape factors from the immutable canonical request.
   * This is used only to avoid re-running an older procedural host recipe
   * whose floating-point replay no longer matches its persisted identity. */
  readonly shapeSnapshot: {
    readonly mode: SkinMode;
    readonly patchSetRevision: number;
    readonly host: readonly Ball[];
    readonly hostK: number;
    readonly thickness: number;
    readonly roundK: number;
    readonly coinBulge: number;
    readonly coinBulgeBalance: number;
    readonly quadMeshJoinWidth: number;
    readonly patches: readonly Patch[];
  };
  /** Honest compact provenance only: per-face replay data is unavailable. */
  readonly exactDiagnosisSummary: FkeiExactDiagnosisSummary;
}

export interface FkeiRiskDrivenLatticeArtifact {
  readonly schemaVersion: typeof FKEI_RISK_DRIVEN_LATTICE_SCHEMA_VERSION;
  readonly producer: typeof FKEI_RISK_DRIVEN_LATTICE_PRODUCER;
  readonly inputBinding: FkeiCanonicalDryWebArtifact["inputBinding"] & {
    readonly canonicalGraphNodes: number;
    readonly canonicalGraphEdges: number;
  };
  readonly planSha256: string;
  readonly validationSha256: string;
  readonly stlSha256: string;
  /** SHA-256 over the saved lattice semantic payload (not just topology). */
  readonly semanticSha256: string;
  readonly settings: {
    readonly thresholdDeg: number;
    readonly meshStep: number;
    readonly scaleMmPerUnit: number;
    readonly diameterMm: number;
    readonly maximumSegmentLengthMm: number;
    readonly maximumAngleFromVerticalDeg: number;
  };
  readonly graph: RiskDrivenPermanentLatticeGraph;
  readonly anchors: readonly RiskDrivenPermanentLatticeAnchor[];
  readonly selectedCandidates: readonly RiskDrivenPermanentLatticeCandidate[];
  readonly spines: readonly RiskDrivenPermanentLatticeSpine[];
  readonly branches: readonly RiskDrivenPermanentLatticeBranch[];
  readonly generationFacts: {
    readonly canonicalNodeCount: number;
    readonly canonicalEdgeCount: number;
    readonly latticeNodeCount: number;
    readonly latticeEdgeCount: number;
    readonly augmentedNodeCount: number;
    readonly augmentedEdgeCount: number;
    readonly sharedSpineCount: number;
    readonly savedDiameterMm: number;
    readonly triangleCount: number;
  };
  readonly sourceSpace: { readonly resolution: number; readonly targetLongestMm: number };
}

export interface FkeiRiskDrivenLatticeHydration {
  readonly canonicalGraph: InternalStructureGraph;
  readonly latticeGraph: RiskDrivenPermanentLatticeGraph;
  readonly augmentedGraph: InternalStructureGraph;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value);
  if (actual.length !== expected.length || actual.some((key) => !expected.includes(key))) throw new Error(`${label} has unsupported keys`);
}
function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}
function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${label} must be a non-negative safe integer`);
  return value as number;
}
function finite(value: unknown, label: string, positive = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || (positive && value <= 0)) throw new Error(`${label} must be a ${positive ? "positive " : ""}finite number`);
  return value;
}
function vector(value: unknown, label: string): Vector3Value {
  const item = object(value, label); keys(item, ["x", "y", "z"], label);
  return { x: finite(item.x, `${label}.x`), y: finite(item.y, `${label}.y`), z: finite(item.z, `${label}.z`) };
}
function array(value: unknown, label: string, max = 100_000): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${label} must be a bounded array`);
  return value;
}
function sameBinding(a: FkeiCanonicalDryWebArtifact["inputBinding"], b: FkeiCanonicalDryWebArtifact["inputBinding"]): boolean {
  return a.shapeFingerprint === b.shapeFingerprint && a.patchSetRevision === b.patchSetRevision
    && a.paintRevision === b.paintRevision && a.artworkGraphSourceKey === b.artworkGraphSourceKey
    && a.canonicalRequestSha256 === b.canonicalRequestSha256
    && a.canonicalGraphSha256 === b.canonicalGraphSha256
    && a.surfaceResolution === b.surfaceResolution
    && a.surfaceTargetLongestMm === b.surfaceTargetLongestMm
    && a.surfaceAngleThresholdDeg === b.surfaceAngleThresholdDeg
    && a.exactDiagnosisProvenanceSha256 === b.exactDiagnosisProvenanceSha256;
}

function binding(value: unknown, label: string): FkeiCanonicalDryWebArtifact["inputBinding"] {
  const item = object(value, label); keys(item, ["shapeFingerprint", "patchSetRevision", "paintRevision", "artworkGraphSourceKey", "canonicalRequestSha256", "canonicalGraphSha256", "surfaceResolution", "surfaceTargetLongestMm", "surfaceAngleThresholdDeg", "exactDiagnosisProvenanceSha256"], label);
  return {
    shapeFingerprint: string(item.shapeFingerprint, `${label}.shapeFingerprint`),
    patchSetRevision: integer(item.patchSetRevision, `${label}.patchSetRevision`),
    paintRevision: integer(item.paintRevision, `${label}.paintRevision`),
    artworkGraphSourceKey: string(item.artworkGraphSourceKey, `${label}.artworkGraphSourceKey`),
    canonicalRequestSha256: string(item.canonicalRequestSha256, `${label}.canonicalRequestSha256`),
    canonicalGraphSha256: string(item.canonicalGraphSha256, `${label}.canonicalGraphSha256`),
    surfaceResolution: integer(item.surfaceResolution, `${label}.surfaceResolution`),
    surfaceTargetLongestMm: finite(item.surfaceTargetLongestMm, `${label}.surfaceTargetLongestMm`, true),
    surfaceAngleThresholdDeg: finite(item.surfaceAngleThresholdDeg, `${label}.surfaceAngleThresholdDeg`),
    exactDiagnosisProvenanceSha256: string(item.exactDiagnosisProvenanceSha256, `${label}.exactDiagnosisProvenanceSha256`),
  };
}

function sha256(value: string, label: string): string {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error(`${label} must be a lowercase SHA-256 digest`);
  return value;
}

/** Exact, deterministic byte identity for the graph portion carried in a
 * compact checkpoint.  canonicalStringify prevents object-key order from
 * becoming a hidden source of false stale/valid results. */
export function fkeiCanonicalDryWebGraphSha256(graph: InternalStructureGraph): string {
  return sha256HexSync(canonicalStringify(graph));
}

export function fkeiExactDiagnosisSummarySha256(summary: Omit<FkeiExactDiagnosisSummary, "summarySha256">): string {
  return sha256HexSync(canonicalStringify({
    teal: summary.teal,
    orange: summary.orange,
    red: summary.red,
    provenanceSha256: summary.provenanceSha256,
  }));
}

/** Semantic identity intentionally includes coordinates, roles, settings and
 * cross-reference collections.  Node/edge counts alone are never identity. */
export function fkeiRiskDrivenLatticeSemanticSha256(artifact: Pick<FkeiRiskDrivenLatticeArtifact,
  "inputBinding" | "settings" | "graph" | "anchors" | "selectedCandidates" | "spines" | "branches" | "generationFacts" | "sourceSpace"
>): string {
  return sha256HexSync(canonicalStringify({
    inputBinding: artifact.inputBinding,
    settings: artifact.settings,
    graph: artifact.graph,
    anchors: artifact.anchors,
    selectedCandidates: artifact.selectedCandidates,
    spines: artifact.spines,
    branches: artifact.branches,
    generationFacts: artifact.generationFacts,
    sourceSpace: artifact.sourceSpace,
  }));
}

/** Runtime currentness for the two saved graph layers.  The live graph must
 * be the exact reviewed canonical graph; matching Shape/Paint inputs alone
 * cannot authorize an overlay after a graph replacement. */
export function fkeiRestoredRiskDrivenCheckpointGraphIsCurrent(
  canonical: FkeiCanonicalDryWebArtifact,
  lattice: FkeiRiskDrivenLatticeArtifact,
  liveCanonicalGraph: InternalStructureGraph | null,
): boolean {
  try {
    return liveCanonicalGraph !== null
      && fkeiCanonicalDryWebGraphSha256(liveCanonicalGraph) === canonical.inputBinding.canonicalGraphSha256
      && lattice.semanticSha256 === fkeiRiskDrivenLatticeSemanticSha256(lattice);
  } catch {
    return false;
  }
}

/** The checkpoint's Shape snapshot must be independently usable as the
 * authoritative Shape identity.  Keeping this here lets document validation
 * reject an archive before Open needs to construct a runtime state. */
export function fkeiCanonicalShapeSnapshotFingerprint(snapshot: FkeiCanonicalDryWebArtifact["shapeSnapshot"]): string {
  return JSON.stringify({
    mode: snapshot.mode,
    hostK: snapshot.hostK,
    host: snapshot.host.map((ball) => [ball.x, ball.y, ball.z, ball.r]),
    thickness: snapshot.thickness,
    roundK: snapshot.roundK,
    coinBulge: snapshot.coinBulge,
    coinBulgeBalance: snapshot.coinBulgeBalance,
    quadMeshJoinWidth: snapshot.quadMeshJoinWidth,
    patches: snapshot.patches.map((patch) => [
      patch.id,
      patch.shape,
      patch.points.map((point) => [point.x, point.y, point.z, point.r, point.role ?? ""]),
    ]),
  });
}

/** Strictly validate an immutable graph without invoking any generator. */
export function validateFkeiCanonicalDryWebGraph(value: unknown, label = "canonicalDryWeb.graph"): InternalStructureGraph {
  const item = object(value, label); keys(item, ["kind", "nodes", "edges", "stats"], label);
  if (item.kind !== "targetedGrid") throw new Error(`${label}.kind must be targetedGrid`);
  const nodes = array(item.nodes, `${label}.nodes`, 10_000);
  const edges = array(item.edges, `${label}.edges`, 20_000);
  const nodeIds = new Set<number>();
  const parsedNodes = nodes.map((raw, index) => {
    const node = object(raw, `${label}.nodes[${index}]`); keys(node, ["id", "position", "radius"], `${label}.nodes[${index}]`);
    const id = integer(node.id, `${label}.nodes[${index}].id`); if (id !== index || nodeIds.has(id)) throw new Error(`${label}.nodes must have contiguous unique IDs`); nodeIds.add(id);
    return { id, position: vector(node.position, `${label}.nodes[${index}].position`), radius: finite(node.radius, `${label}.nodes[${index}].radius`, true) };
  });
  const edgeIds = new Set<number>();
  const parsedEdges = edges.map((raw, index) => {
    const edge = object(raw, `${label}.edges[${index}]`); keys(edge, ["id", "start", "end", "radius"], `${label}.edges[${index}]`);
    const id = integer(edge.id, `${label}.edges[${index}].id`); const start = integer(edge.start, `${label}.edges[${index}].start`); const end = integer(edge.end, `${label}.edges[${index}].end`);
    if (id !== index || edgeIds.has(id) || start === end || !nodeIds.has(start) || !nodeIds.has(end)) throw new Error(`${label}.edges has invalid IDs or endpoint references`); edgeIds.add(id);
    return { id, start, end, radius: finite(edge.radius, `${label}.edges[${index}].radius`, true) };
  });
  const stats = object(item.stats, `${label}.stats`);
  for (const [key, value] of Object.entries(stats)) integer(value, `${label}.stats.${key}`);
  return { kind: "targetedGrid", nodes: parsedNodes, edges: parsedEdges, stats: { ...stats } as unknown as InternalStructureGraph["stats"] };
}

export function validateFkeiCanonicalDryWebArtifact(value: unknown): FkeiCanonicalDryWebArtifact {
  const item = object(value, "canonicalDryWeb"); keys(item, ["schemaVersion", "producer", "inputBinding", "graph", "shapeSnapshot", "exactDiagnosisSummary"], "canonicalDryWeb");
  if (item.schemaVersion !== 1 || item.producer !== FKEI_RISK_DRIVEN_LATTICE_PRODUCER) throw new Error("canonicalDryWeb schema/producer is unsupported");
  const summary = object(item.exactDiagnosisSummary, "canonicalDryWeb.exactDiagnosisSummary"); keys(summary, ["teal", "orange", "red", "provenanceSha256", "summarySha256"], "canonicalDryWeb.exactDiagnosisSummary");
  const exactDiagnosisSummary = { teal: integer(summary.teal, "canonicalDryWeb.exactDiagnosisSummary.teal"), orange: integer(summary.orange, "canonicalDryWeb.exactDiagnosisSummary.orange"), red: integer(summary.red, "canonicalDryWeb.exactDiagnosisSummary.red"), provenanceSha256: string(summary.provenanceSha256, "canonicalDryWeb.exactDiagnosisSummary.provenanceSha256"), summarySha256: sha256(string(summary.summarySha256, "canonicalDryWeb.exactDiagnosisSummary.summarySha256"), "canonicalDryWeb.exactDiagnosisSummary.summarySha256") };
  if (exactDiagnosisSummary.summarySha256 !== fkeiExactDiagnosisSummarySha256(exactDiagnosisSummary)) throw new Error("canonicalDryWeb exact diagnosis summary SHA-256 does not match compact evidence");
  const graph = validateFkeiCanonicalDryWebGraph(item.graph);
  if (sha256(binding(item.inputBinding, "canonicalDryWeb.inputBinding").canonicalGraphSha256, "canonicalDryWeb.inputBinding.canonicalGraphSha256") !== fkeiCanonicalDryWebGraphSha256(graph)) {
    throw new Error("canonicalDryWeb canonical graph SHA-256 does not match reviewed geometry");
  }
  const shape = object(item.shapeSnapshot, "canonicalDryWeb.shapeSnapshot"); keys(shape, ["mode", "patchSetRevision", "host", "hostK", "thickness", "roundK", "coinBulge", "coinBulgeBalance", "quadMeshJoinWidth", "patches"], "canonicalDryWeb.shapeSnapshot");
  if (shape.mode !== "plate" && shape.mode !== "window") throw new Error("canonicalDryWeb.shapeSnapshot.mode is invalid");
  const host = array(shape.host, "canonicalDryWeb.shapeSnapshot.host", 100).map((raw, index) => { const ball = object(raw, `canonicalDryWeb.shapeSnapshot.host[${index}]`); keys(ball, ["id", "x", "y", "z", "r"], `canonicalDryWeb.shapeSnapshot.host[${index}]`); return { id: integer(ball.id, "canonicalDryWeb host.id"), x: finite(ball.x, "canonicalDryWeb host.x"), y: finite(ball.y, "canonicalDryWeb host.y"), z: finite(ball.z, "canonicalDryWeb host.z"), r: finite(ball.r, "canonicalDryWeb host.r", true) }; });
  const patchIds = new Set<number>();
  const patches = array(shape.patches, "canonicalDryWeb.shapeSnapshot.patches", 20_000).map((raw, index) => {
    const patch = object(raw, `canonicalDryWeb.shapeSnapshot.patches[${index}]`);
    if (typeof patch.id !== "number" || !Number.isSafeInteger(patch.id) || patchIds.has(patch.id) || !["coin", "flatRing", "ring3d", "flower"].includes(String(patch.shape))) throw new Error("canonicalDryWeb patch id/shape is invalid");
    patchIds.add(patch.id);
    const points = array(patch.points, `canonicalDryWeb.shapeSnapshot.patches[${index}].points`, 10_000);
    if (points.length === 0) throw new Error("canonicalDryWeb patch has no points");
    for (const [pointIndex, rawPoint] of points.entries()) {
      const point = object(rawPoint, `canonicalDryWeb patch[${index}].points[${pointIndex}]`);
      for (const coordinate of ["x", "y", "z", "r"] as const) finite(point[coordinate], `canonicalDryWeb patch point.${coordinate}`, coordinate === "r");
      if (point.role !== undefined && point.role !== "motif" && point.role !== "bridge" && point.role !== "surfaceConnector") throw new Error("canonicalDryWeb patch point role is invalid");
      for (const [key, field] of Object.entries(point)) if (!["x", "y", "z", "r", "role", "baseR", "fusionBaseR", "fusionR", "meshJoinR", "contactR", "contactScale", "ringPrimary"].includes(key) || ((key !== "role" && key !== "ringPrimary") && !Number.isFinite(field))) throw new Error("canonicalDryWeb patch point is malformed");
    }
    return patch as unknown as Patch;
  });
  const shapeSnapshot = { mode: shape.mode, patchSetRevision: integer(shape.patchSetRevision, "canonicalDryWeb shape.patchSetRevision"), host, hostK: finite(shape.hostK, "canonicalDryWeb shape.hostK"), thickness: finite(shape.thickness, "canonicalDryWeb shape.thickness", true), roundK: finite(shape.roundK, "canonicalDryWeb shape.roundK"), coinBulge: finite(shape.coinBulge, "canonicalDryWeb shape.coinBulge"), coinBulgeBalance: finite(shape.coinBulgeBalance, "canonicalDryWeb shape.coinBulgeBalance"), quadMeshJoinWidth: finite(shape.quadMeshJoinWidth, "canonicalDryWeb shape.quadMeshJoinWidth"), patches } as FkeiCanonicalDryWebArtifact["shapeSnapshot"];
  return { schemaVersion: 1, producer: FKEI_RISK_DRIVEN_LATTICE_PRODUCER, inputBinding: binding(item.inputBinding, "canonicalDryWeb.inputBinding"), graph, shapeSnapshot, exactDiagnosisSummary };
}

export function validateFkeiRiskDrivenLatticeArtifact(value: unknown, canonical: FkeiCanonicalDryWebArtifact): FkeiRiskDrivenLatticeArtifact {
  const item = object(value, "riskDrivenLattice");
  keys(item, ["schemaVersion", "producer", "inputBinding", "planSha256", "validationSha256", "stlSha256", "semanticSha256", "settings", "graph", "anchors", "selectedCandidates", "spines", "branches", "generationFacts", "sourceSpace"], "riskDrivenLattice");
  if (item.schemaVersion !== 1 || item.producer !== FKEI_RISK_DRIVEN_LATTICE_PRODUCER) throw new Error("riskDrivenLattice schema/producer is unsupported");
  const input = object(item.inputBinding, "riskDrivenLattice.inputBinding"); keys(input, ["shapeFingerprint", "patchSetRevision", "paintRevision", "artworkGraphSourceKey", "canonicalRequestSha256", "canonicalGraphSha256", "surfaceResolution", "surfaceTargetLongestMm", "surfaceAngleThresholdDeg", "exactDiagnosisProvenanceSha256", "canonicalGraphNodes", "canonicalGraphEdges"], "riskDrivenLattice.inputBinding");
  const inputBinding = {
    ...binding(Object.fromEntries(Object.entries(input).filter(([key]) => key !== "canonicalGraphNodes" && key !== "canonicalGraphEdges")), "riskDrivenLattice.inputBinding"),
    canonicalGraphNodes: integer(input.canonicalGraphNodes, "riskDrivenLattice.inputBinding.canonicalGraphNodes"),
    canonicalGraphEdges: integer(input.canonicalGraphEdges, "riskDrivenLattice.inputBinding.canonicalGraphEdges"),
  };
  if (!sameBinding(inputBinding, canonical.inputBinding) || inputBinding.canonicalGraphNodes !== canonical.graph.nodes.length || inputBinding.canonicalGraphEdges !== canonical.graph.edges.length) throw new Error("riskDrivenLattice input binding does not exactly match canonical Dry Web");
  const settingsRaw = object(item.settings, "riskDrivenLattice.settings"); keys(settingsRaw, ["thresholdDeg", "meshStep", "scaleMmPerUnit", "diameterMm", "maximumSegmentLengthMm", "maximumAngleFromVerticalDeg"], "riskDrivenLattice.settings");
  const settings = { thresholdDeg: finite(settingsRaw.thresholdDeg, "riskDrivenLattice.settings.thresholdDeg", true), meshStep: finite(settingsRaw.meshStep, "riskDrivenLattice.settings.meshStep", true), scaleMmPerUnit: finite(settingsRaw.scaleMmPerUnit, "riskDrivenLattice.settings.scaleMmPerUnit", true), diameterMm: finite(settingsRaw.diameterMm, "riskDrivenLattice.settings.diameterMm", true), maximumSegmentLengthMm: finite(settingsRaw.maximumSegmentLengthMm, "riskDrivenLattice.settings.maximumSegmentLengthMm", true), maximumAngleFromVerticalDeg: finite(settingsRaw.maximumAngleFromVerticalDeg, "riskDrivenLattice.settings.maximumAngleFromVerticalDeg", true) };
  const graphRaw = object(item.graph, "riskDrivenLattice.graph"); keys(graphRaw, ["kind", "nodes", "edges", "stats"], "riskDrivenLattice.graph");
  const nodesRaw = array(graphRaw.nodes, "riskDrivenLattice.graph.nodes", 1000); const edgesRaw = array(graphRaw.edges, "riskDrivenLattice.graph.edges", 1000);
  const allowedRoles = new Set(["surface-anchor", "spine", "junction", "branch", "risk-target"]);
  const nodeIds = new Set<number>();
  const nodes: RiskDrivenPermanentLatticeNode[] = nodesRaw.map((raw, index) => { const node = object(raw, `riskDrivenLattice.graph.nodes[${index}]`); const allowed = ["id", "position", "radius", "role", "anchorId", "candidateId", "spineId"]; if (Object.keys(node).some((key) => !allowed.includes(key))) throw new Error("riskDrivenLattice node has unsupported keys"); const id = integer(node.id, `riskDrivenLattice.graph.nodes[${index}].id`); if (id !== index || nodeIds.has(id) || typeof node.role !== "string" || !allowedRoles.has(node.role)) throw new Error("riskDrivenLattice node ID/role is invalid"); nodeIds.add(id); return { id, position: vector(node.position, `riskDrivenLattice.graph.nodes[${index}].position`), radius: finite(node.radius, `riskDrivenLattice.graph.nodes[${index}].radius`, true), role: node.role as RiskDrivenPermanentLatticeNode["role"], ...(node.anchorId === undefined ? {} : { anchorId: integer(node.anchorId, "riskDrivenLattice node.anchorId") }), ...(node.candidateId === undefined ? {} : { candidateId: integer(node.candidateId, "riskDrivenLattice node.candidateId") }), ...(node.spineId === undefined ? {} : { spineId: integer(node.spineId, "riskDrivenLattice node.spineId") }) }; });
  const edgeIds = new Set<number>();
  const edges: RiskDrivenPermanentLatticeEdge[] = edgesRaw.map((raw, index) => { const edge = object(raw, `riskDrivenLattice.graph.edges[${index}]`); const allowed = ["id", "start", "end", "radius", "role", "diameterMm", "physicalLengthMm", "horizontalMm", "verticalMm", "angleFromVerticalDeg", "candidateId", "spineId"]; if (Object.keys(edge).some((key) => !allowed.includes(key))) throw new Error("riskDrivenLattice edge has unsupported keys"); const id = integer(edge.id, `riskDrivenLattice.graph.edges[${index}].id`); const start = integer(edge.start, "riskDrivenLattice edge.start"); const end = integer(edge.end, "riskDrivenLattice edge.end"); if (id !== index || edgeIds.has(id) || start === end || !nodeIds.has(start) || !nodeIds.has(end) || (edge.role !== "spine" && edge.role !== "branch")) throw new Error("riskDrivenLattice edge ID/role/endpoint is invalid"); edgeIds.add(id); return { id, start, end, radius: finite(edge.radius, "riskDrivenLattice edge.radius", true), role: edge.role, diameterMm: finite(edge.diameterMm, "riskDrivenLattice edge.diameterMm", true), physicalLengthMm: finite(edge.physicalLengthMm, "riskDrivenLattice edge.physicalLengthMm", true), horizontalMm: finite(edge.horizontalMm, "riskDrivenLattice edge.horizontalMm"), verticalMm: finite(edge.verticalMm, "riskDrivenLattice edge.verticalMm"), angleFromVerticalDeg: finite(edge.angleFromVerticalDeg, "riskDrivenLattice edge.angleFromVerticalDeg"), ...(edge.candidateId === undefined ? {} : { candidateId: integer(edge.candidateId, "riskDrivenLattice edge.candidateId") }), ...(edge.spineId === undefined ? {} : { spineId: integer(edge.spineId, "riskDrivenLattice edge.spineId") }) }; });
  if (graphRaw.kind !== "targetedGrid") throw new Error("riskDrivenLattice graph kind is unsupported");
  const stats = object(graphRaw.stats, "riskDrivenLattice.graph.stats"); for (const [key, stat] of Object.entries(stats)) integer(stat, `riskDrivenLattice.graph.stats.${key}`);
  const graph = { kind: "targetedGrid" as const, nodes, edges, stats: { ...stats } as unknown as RiskDrivenPermanentLatticeGraph["stats"] };
  const anchorIds = new Set<number>();
  const anchors = array(item.anchors, "riskDrivenLattice.anchors", 100).map((raw, index) => { const anchor = object(raw, `riskDrivenLattice.anchors[${index}]`); keys(anchor, ["id", "diagnosisFaceId", "position", "angleDeg", "candidateIds"], `riskDrivenLattice.anchors[${index}]`); const id = integer(anchor.id, "riskDrivenLattice anchor.id"); if (id !== index || anchorIds.has(id)) throw new Error("riskDrivenLattice anchors must have contiguous unique IDs"); anchorIds.add(id); const candidateIds = array(anchor.candidateIds, "riskDrivenLattice anchor candidateIds", 20).map((candidateId) => integer(candidateId, "riskDrivenLattice anchor candidateId")); if (new Set(candidateIds).size !== candidateIds.length) throw new Error("riskDrivenLattice anchor candidate IDs are duplicate"); return { id, diagnosisFaceId: integer(anchor.diagnosisFaceId, "riskDrivenLattice anchor.diagnosisFaceId"), position: vector(anchor.position, "riskDrivenLattice anchor.position"), angleDeg: finite(anchor.angleDeg, "riskDrivenLattice anchor.angleDeg"), candidateIds } as RiskDrivenPermanentLatticeAnchor; });
  const candidateIds = new Set<number>(); const clusterIds = new Set<number>();
  const candidates = array(item.selectedCandidates, "riskDrivenLattice.selectedCandidates", 20).map((raw, index) => { const candidate = object(raw, `riskDrivenLattice.selectedCandidates[${index}]`); keys(candidate, ["id", "sourceRank", "riskClusterId", "position", "affectedRiskArea", "remainingRiskArea", "requiredLatticeLength", "supportGain", "anchorId"], `riskDrivenLattice.selectedCandidates[${index}]`); const id = integer(candidate.id, "riskDrivenLattice candidate.id"); const clusterId = integer(candidate.riskClusterId, "riskDrivenLattice candidate.riskClusterId"); if (id !== index || candidateIds.has(id) || clusterIds.has(clusterId) || !anchorIds.has(integer(candidate.anchorId, "riskDrivenLattice candidate.anchorId"))) throw new Error("riskDrivenLattice candidate IDs/cluster/anchor references are invalid"); candidateIds.add(id); clusterIds.add(clusterId); return { id, sourceRank: integer(candidate.sourceRank, "riskDrivenLattice candidate.sourceRank"), riskClusterId: clusterId, position: vector(candidate.position, "riskDrivenLattice candidate.position"), affectedRiskArea: finite(candidate.affectedRiskArea, "riskDrivenLattice candidate.affectedRiskArea"), remainingRiskArea: finite(candidate.remainingRiskArea, "riskDrivenLattice candidate.remainingRiskArea"), requiredLatticeLength: finite(candidate.requiredLatticeLength, "riskDrivenLattice candidate.requiredLatticeLength", true), supportGain: finite(candidate.supportGain, "riskDrivenLattice candidate.supportGain"), anchorId: integer(candidate.anchorId, "riskDrivenLattice candidate.anchorId") } as RiskDrivenPermanentLatticeCandidate; });
  const spineIds = new Set<number>();
  const spines = array(item.spines, "riskDrivenLattice.spines", 20).map((raw, index) => { const spine = object(raw, `riskDrivenLattice.spines[${index}]`); keys(spine, ["id", "anchorId", "candidateIds", "nodeIds", "edgeIds"], `riskDrivenLattice.spines[${index}]`); const id = integer(spine.id, "riskDrivenLattice spine.id"); const anchorId = integer(spine.anchorId, "riskDrivenLattice spine.anchorId"); const candidateRefs = array(spine.candidateIds, "riskDrivenLattice spine.candidateIds", 20).map((value) => integer(value, "riskDrivenLattice spine.candidateId")); const nodeRefs = array(spine.nodeIds, "riskDrivenLattice spine.nodeIds", 100).map((value) => integer(value, "riskDrivenLattice spine.nodeId")); const edgeRefs = array(spine.edgeIds, "riskDrivenLattice spine.edgeIds", 100).map((value) => integer(value, "riskDrivenLattice spine.edgeId")); if (id !== index || spineIds.has(id) || !anchorIds.has(anchorId) || candidateRefs.length === 0 || new Set(candidateRefs).size !== candidateRefs.length || candidateRefs.some((value) => !candidateIds.has(value)) || nodeRefs.some((value) => !nodeIds.has(value)) || edgeRefs.some((value) => !edgeIds.has(value))) throw new Error("riskDrivenLattice spine references are invalid"); spineIds.add(id); return { id, anchorId, candidateIds: candidateRefs, nodeIds: nodeRefs, edgeIds: edgeRefs } as RiskDrivenPermanentLatticeSpine; });
  const branchCandidateIds = new Set<number>();
  const branches = array(item.branches, "riskDrivenLattice.branches", 20).map((raw, index) => { const branch = object(raw, `riskDrivenLattice.branches[${index}]`); keys(branch, ["candidateId", "spineId", "junctionNodeId", "targetNodeId", "edgeIds"], `riskDrivenLattice.branches[${index}]`); const candidateId = integer(branch.candidateId, "riskDrivenLattice branch.candidateId"); const spineId = integer(branch.spineId, "riskDrivenLattice branch.spineId"); const junctionNodeId = integer(branch.junctionNodeId, "riskDrivenLattice branch.junctionNodeId"); const targetNodeId = integer(branch.targetNodeId, "riskDrivenLattice branch.targetNodeId"); const edgeRefs = array(branch.edgeIds, "riskDrivenLattice branch.edgeIds", 100).map((value) => integer(value, "riskDrivenLattice branch.edgeId")); if (branchCandidateIds.has(candidateId) || !candidateIds.has(candidateId) || !spineIds.has(spineId) || !nodeIds.has(junctionNodeId) || !nodeIds.has(targetNodeId) || junctionNodeId === targetNodeId || edgeRefs.length === 0 || edgeRefs.some((value) => !edgeIds.has(value))) throw new Error("riskDrivenLattice branch references are invalid"); branchCandidateIds.add(candidateId); return { candidateId, spineId, junctionNodeId, targetNodeId, edgeIds: edgeRefs } as RiskDrivenPermanentLatticeBranch; });
  if (branchCandidateIds.size !== candidateIds.size || anchors.some((anchor) => anchor.candidateIds.some((candidateId) => !candidateIds.has(candidateId))) || candidates.some((candidate) => !anchors[candidate.anchorId]?.candidateIds.includes(candidate.id))) throw new Error("riskDrivenLattice anchor/candidate cross-field parity failed");
  const generationRaw = object(item.generationFacts, "riskDrivenLattice.generationFacts"); keys(generationRaw, ["canonicalNodeCount", "canonicalEdgeCount", "latticeNodeCount", "latticeEdgeCount", "augmentedNodeCount", "augmentedEdgeCount", "sharedSpineCount", "savedDiameterMm", "triangleCount"], "riskDrivenLattice.generationFacts");
  const generationFacts = { canonicalNodeCount: integer(generationRaw.canonicalNodeCount, "generation canonicalNodeCount"), canonicalEdgeCount: integer(generationRaw.canonicalEdgeCount, "generation canonicalEdgeCount"), latticeNodeCount: integer(generationRaw.latticeNodeCount, "generation latticeNodeCount"), latticeEdgeCount: integer(generationRaw.latticeEdgeCount, "generation latticeEdgeCount"), augmentedNodeCount: integer(generationRaw.augmentedNodeCount, "generation augmentedNodeCount"), augmentedEdgeCount: integer(generationRaw.augmentedEdgeCount, "generation augmentedEdgeCount"), sharedSpineCount: integer(generationRaw.sharedSpineCount, "generation sharedSpineCount"), savedDiameterMm: finite(generationRaw.savedDiameterMm, "generation savedDiameterMm", true), triangleCount: integer(generationRaw.triangleCount, "generation triangleCount") };
  if (generationFacts.canonicalNodeCount !== inputBinding.canonicalGraphNodes || generationFacts.canonicalEdgeCount !== inputBinding.canonicalGraphEdges || generationFacts.latticeNodeCount !== nodes.length || generationFacts.latticeEdgeCount !== edges.length || generationFacts.augmentedNodeCount !== generationFacts.canonicalNodeCount + generationFacts.latticeNodeCount || generationFacts.augmentedEdgeCount !== generationFacts.canonicalEdgeCount + generationFacts.latticeEdgeCount) throw new Error("riskDrivenLattice generation facts are internally inconsistent");
  const sourceSpace = object(item.sourceSpace, "riskDrivenLattice.sourceSpace"); keys(sourceSpace, ["resolution", "targetLongestMm"], "riskDrivenLattice.sourceSpace"); const sourceSpaceValue = { resolution: integer(sourceSpace.resolution, "riskDrivenLattice sourceSpace.resolution"), targetLongestMm: finite(sourceSpace.targetLongestMm, "riskDrivenLattice sourceSpace.targetLongestMm", true) }; if (sourceSpaceValue.resolution <= 0) throw new Error("riskDrivenLattice source resolution is invalid");
  if (sourceSpaceValue.resolution !== 128 || sourceSpaceValue.targetLongestMm !== 80
    || settings.thresholdDeg !== inputBinding.surfaceAngleThresholdDeg
    || settings.diameterMm / settings.scaleMmPerUnit / 2 !== nodes[0]?.radius
    || nodes.some((node) => node.radius !== nodes[0]?.radius)
    || edges.some((edge) => edge.radius !== nodes[0]?.radius || edge.diameterMm !== settings.diameterMm || edge.physicalLengthMm > settings.maximumSegmentLengthMm || edge.angleFromVerticalDeg > settings.maximumAngleFromVerticalDeg)
    || generationFacts.sharedSpineCount !== spines.filter((spine) => spine.candidateIds.length > 1).length
    || branches.some((branch) => !spines[branch.spineId]?.candidateIds.includes(branch.candidateId)
      || !spines[branch.spineId]?.nodeIds.includes(branch.junctionNodeId)
      || !spines[branch.spineId]?.nodeIds.includes(branch.targetNodeId)
      || branch.edgeIds.some((edgeId) => edges[edgeId]?.candidateId !== branch.candidateId || edges[edgeId]?.spineId !== branch.spineId))) {
    throw new Error("riskDrivenLattice reviewed semantic/settings/source-space parity failed");
  }
  const parsed = { schemaVersion: 1 as const, producer: FKEI_RISK_DRIVEN_LATTICE_PRODUCER, inputBinding, planSha256: string(item.planSha256, "riskDrivenLattice.planSha256"), validationSha256: string(item.validationSha256, "riskDrivenLattice.validationSha256"), stlSha256: string(item.stlSha256, "riskDrivenLattice.stlSha256"), semanticSha256: sha256(string(item.semanticSha256, "riskDrivenLattice.semanticSha256"), "riskDrivenLattice.semanticSha256"), settings, graph, anchors, selectedCandidates: candidates, spines, branches, generationFacts, sourceSpace: sourceSpaceValue };
  if (parsed.semanticSha256 !== fkeiRiskDrivenLatticeSemanticSha256(parsed)) throw new Error("riskDrivenLattice semantic SHA-256 does not match saved lattice payload");
  return parsed;
}

/** Pure reconstruction. It appends saved local geometry to saved canonical
 * geometry and proves the advertised counts; it never calls the planner. */
export function hydrateFkeiRiskDrivenLatticeArtifact(canonical: FkeiCanonicalDryWebArtifact, artifact: FkeiRiskDrivenLatticeArtifact): FkeiRiskDrivenLatticeHydration {
  if (!sameBinding(canonical.inputBinding, artifact.inputBinding)) throw new Error("riskDrivenLattice hydration binding mismatch");
  const augmentedGraph = augmentRiskDrivenPermanentLatticeGraph(canonical.graph, artifact.graph);
  if (augmentedGraph.nodes.length !== artifact.generationFacts.augmentedNodeCount || augmentedGraph.edges.length !== artifact.generationFacts.augmentedEdgeCount) throw new Error("riskDrivenLattice hydration augmented parity failed");
  return { canonicalGraph: canonical.graph, latticeGraph: artifact.graph, augmentedGraph };
}
