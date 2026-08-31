import type { SkinMeshResult } from "./meshExport.ts";
import type { InternalStructureMode } from "./field.ts";
import type { InternalStructureGraph, Vector3Value } from "./voronoi.ts";

const EPSILON = 1e-8;

export interface InternalPrintProfile {
  id: string;
  label: string;
  nozzleDiameterMm: number;
  layerHeightMm: number;
  minStrutDiameterMm: number;
  maxBridgeMm: number;
  maxAngleFromVerticalDeg: number;
  minVoxelsAcrossDiameter: number;
  minSurfaceOverlapMm: number;
}

/**
 * Conservative project gate for the author's stated setup. Values other
 * than nozzle/layer are Katachi safety margins, not official Bambu limits.
 */
export const A1_MINI_PLA_04_02: InternalPrintProfile = {
  id: "bambu-a1-mini-pla-04-02",
  label: "Bambu Lab A1 mini · 0.4 mm nozzle · PLA · 0.2 mm layer",
  nozzleDiameterMm: 0.4,
  layerHeightMm: 0.2,
  minStrutDiameterMm: 0.8,
  maxBridgeMm: 5,
  maxAngleFromVerticalDeg: 45,
  minVoxelsAcrossDiameter: 2.5,
  minSurfaceOverlapMm: 0.2,
};

export interface InternalPrintGateReport {
  ok: boolean;
  profileId: string;
  reasons: string[];
  watertight: boolean;
  meshComponents: number;
  removedDegenerateTriangles: number;
  graphComponents: number;
  surfaceAnchorNodes: number;
  buildPlateAnchorNodes: number;
  floatingGraphComponents: number;
  unsupportedNodes: number;
  unsupportedEdges: number;
  overlongBridges: number;
  bridgeEdges: number;
  minDiameterMm: number;
  voxelStepMm: number;
  voxelsAcrossDiameter: number;
  maxBridgeMm: number;
  maxObservedBridgeMm: number;
}

/** Runtime-only Stage 8 policy.  It is intentionally not part of FKEI. */
export type RemovableSupportMode = "off" | "automatic";

/**
 * Decide whether an Internal-gate result may be used for BODY export while
 * removable support is explicitly disabled.  A normal OK report is always
 * accepted.  The disabled policy waives only the three support-demand facts;
 * every structural/material metric that the current gate reports remains
 * fail-closed.  Reasons are deliberately not inspected, so this stays
 * independent of localized UI wording.
 */
export function internalPrintGateAllowsSupportDisabledExport(
  report: InternalPrintGateReport,
  mode: RemovableSupportMode,
  profile: Pick<InternalPrintProfile, "minStrutDiameterMm" | "minVoxelsAcrossDiameter"> = A1_MINI_PLA_04_02,
): boolean {
  if (report.ok) return true;
  if (mode !== "off") return false;
  const finiteNonNegativeInteger = (value: number): boolean => Number.isInteger(value) && value >= 0;
  return report.watertight
    && report.meshComponents === 1
    && report.removedDegenerateTriangles === 0
    && finiteNonNegativeInteger(report.graphComponents)
    && report.graphComponents > 0
    && finiteNonNegativeInteger(report.surfaceAnchorNodes)
    && finiteNonNegativeInteger(report.buildPlateAnchorNodes)
    && report.surfaceAnchorNodes + report.buildPlateAnchorNodes > 0
    && report.floatingGraphComponents === 0
    && Number.isFinite(report.minDiameterMm)
    && report.minDiameterMm + 1e-6 >= profile.minStrutDiameterMm
    && Number.isFinite(report.voxelStepMm)
    && report.voxelStepMm > 0
    && Number.isFinite(report.voxelsAcrossDiameter)
    && report.voxelsAcrossDiameter + 1e-6 >= profile.minVoxelsAcrossDiameter
    && finiteNonNegativeInteger(report.unsupportedNodes)
    && finiteNonNegativeInteger(report.unsupportedEdges)
    && finiteNonNegativeInteger(report.overlongBridges)
    && finiteNonNegativeInteger(report.bridgeEdges)
    && Number.isFinite(report.maxBridgeMm)
    && report.maxBridgeMm >= 0
    && Number.isFinite(report.maxObservedBridgeMm)
    && report.maxObservedBridgeMm >= 0;
}

export interface InternalPrintGateInput {
  graph: InternalStructureGraph | null;
  mesh: Pick<SkinMeshResult, "watertight" | "connectedComponents" | "scaleMmPerUnit" | "removedSavedDegenerateTriangleCount">;
  resolution: number;
  targetLongestMm: number;
  profile?: InternalPrintProfile;
  /** Surface-only SDF. Negative means the Internal node centre is inside the
   * already printable outer SKIN; the unioned Internal field must not be used. */
  surfaceSdf: (point: Vector3Value) => number;
  /** Source-space Z of the build plate before the final mesh is translated
   * to Z=0. Nodes whose strut reaches this plane are printable roots. */
  buildPlateZSource?: number;
}

export type InternalAngleScreeningClassification = "selfSupportingAngle" | "angleRisk";

export interface InternalAngleScreeningEdge {
  /** Position in the source graph's edge array. */
  edgeIndex: number;
  edgeId: number;
  angleFromVerticalDeg: number | null;
  classification: InternalAngleScreeningClassification;
}

export interface InternalAngleScreeningReport {
  profileId: string;
  thresholdDeg: number;
  edges: InternalAngleScreeningEdge[];
  selfSupportingAngleCount: number;
  angleRiskCount: number;
}

/**
 * Output readiness is stricter than preview readiness: when an artwork
 * Internal Structure mode is selected, a missing or empty graph must stop the
 * caller before it can start a Worker or emit a BODY artifact. `none` keeps
 * the pre-existing Surface-only output path valid.
 */
export function internalStructureOutputBlockReason(
  mode: InternalStructureMode,
  graph: InternalStructureGraph | null,
): string | null {
  if (mode === "none" || (graph !== null && graph.edges.length > 0)) return null;
  return "選択したInternal Structureが未生成または空です。生成後に出力してください";
}

/**
 * Fast, display-only FDM angle screen for an existing Internal graph.
 * 0° is vertical in the +Z print direction and 90° is horizontal. This
 * deliberately assesses angle only; it does not inspect anchoring, bridge
 * length, diameter, watertightness, layer continuity, or print success.
 * Edge endpoints are node IDs (not array positions). Invalid endpoint
 * references and degenerate/non-finite edges are red so a malformed graph can
 * never be presented as self-supporting.
 */
export function screenInternalStructureAngles(
  graph: InternalStructureGraph | null,
  profile: Pick<InternalPrintProfile, "id" | "maxAngleFromVerticalDeg"> = A1_MINI_PLA_04_02,
): InternalAngleScreeningReport {
  const thresholdDeg = profile.maxAngleFromVerticalDeg;
  const edges: InternalAngleScreeningEdge[] = [];
  let selfSupportingAngleCount = 0;
  let angleRiskCount = 0;
  const nodes = graph?.nodes ?? [];
  const nodeIndex = new Map(nodes.map((node, index) => [node.id, index]));

  for (let edgeIndex = 0; edgeIndex < (graph?.edges.length ?? 0); edgeIndex++) {
    const edge = graph!.edges[edgeIndex];
    const start = nodeIndex.has(edge.start) ? nodes[nodeIndex.get(edge.start)!] : undefined;
    const end = nodeIndex.has(edge.end) ? nodes[nodeIndex.get(edge.end)!] : undefined;
    let angleFromVerticalDeg: number | null = null;
    const startPosition = start?.position;
    const endPosition = end?.position;
    if (startPosition && endPosition) {
      const dx = endPosition.x - startPosition.x;
      const dy = endPosition.y - startPosition.y;
      const dz = endPosition.z - startPosition.z;
      const length = Math.hypot(dx, dy, dz);
      if (
        Number.isFinite(dx) && Number.isFinite(dy) && Number.isFinite(dz)
        && Number.isFinite(length) && length > EPSILON
      ) {
        const verticalRatio = Math.min(1, Math.max(0, Math.abs(dz) / length));
        angleFromVerticalDeg = Math.acos(verticalRatio) * 180 / Math.PI;
      }
    }
    const selfSupporting = angleFromVerticalDeg !== null
      && Number.isFinite(angleFromVerticalDeg)
      && angleFromVerticalDeg <= thresholdDeg + 1e-6;
    if (selfSupporting) selfSupportingAngleCount++;
    else angleRiskCount++;
    edges.push({
      edgeIndex,
      edgeId: edge.id,
      angleFromVerticalDeg,
      classification: selfSupporting ? "selfSupportingAngle" : "angleRisk",
    });
  }

  return {
    profileId: profile.id,
    thresholdDeg,
    edges,
    selfSupportingAngleCount,
    angleRiskCount,
  };
}

function distance(a: Vector3Value, b: Vector3Value): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function graphComponents(graph: InternalStructureGraph): number[][] {
  const indexById = new Map(graph.nodes.map((node, index) => [node.id, index]));
  const adjacency = graph.nodes.map(() => [] as number[]);
  for (const edge of graph.edges) {
    const a = indexById.get(edge.start);
    const b = indexById.get(edge.end);
    if (a === undefined || b === undefined) continue;
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
  const seen = new Set<number>();
  const result: number[][] = [];
  for (let start = 0; start < graph.nodes.length; start++) {
    if (seen.has(start)) continue;
    const component: number[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      for (const next of adjacency[current]) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    result.push(component);
  }
  return result;
}

export function evaluateInternalPrintGate(input: InternalPrintGateInput): InternalPrintGateReport {
  const profile = input.profile ?? A1_MINI_PLA_04_02;
  const graph = input.graph;
  const scale = Math.max(EPSILON, input.mesh.scaleMmPerUnit);
  const voxelStepMm = Math.max(EPSILON, input.targetLongestMm / Math.max(8, Math.round(input.resolution)));
  const reasons: string[] = [];
  if (!graph || graph.nodes.length === 0 || graph.edges.length === 0) {
    return {
      ok: false,
      profileId: profile.id,
      reasons: ["Internal Structureがありません"],
      watertight: input.mesh.watertight.ok,
      meshComponents: input.mesh.connectedComponents,
      removedDegenerateTriangles: input.mesh.removedSavedDegenerateTriangleCount ?? 0,
      graphComponents: 0,
      surfaceAnchorNodes: 0,
      buildPlateAnchorNodes: 0,
      floatingGraphComponents: 0,
      unsupportedNodes: 0,
      unsupportedEdges: 0,
      overlongBridges: 0,
      bridgeEdges: 0,
      minDiameterMm: 0,
      voxelStepMm,
      voxelsAcrossDiameter: 0,
      maxBridgeMm: profile.maxBridgeMm,
      maxObservedBridgeMm: 0,
    };
  }

  const nodeIndex = new Map(graph.nodes.map((node, index) => [node.id, index]));
  const minimumRadius = Math.min(...graph.edges.map((edge) => edge.radius));
  const minDiameterMm = minimumRadius * 2 * scale;
  const voxelsAcrossDiameter = minDiameterMm / voxelStepMm;
  const components = graphComponents(graph);
  const overlapSource = profile.minSurfaceOverlapMm / scale;
  const surfaceAnchored = new Set<number>();
  const buildPlateAnchored = new Set<number>();
  for (const [index, node] of graph.nodes.entries()) {
    if (input.surfaceSdf(node.position) <= -Math.min(node.radius * 0.25, overlapSource)) surfaceAnchored.add(index);
    if (input.buildPlateZSource !== undefined
      && node.position.z - node.radius <= input.buildPlateZSource + EPSILON) {
      buildPlateAnchored.add(index);
    }
  }
  const anchored = new Set([...surfaceAnchored, ...buildPlateAnchored]);
  const floatingGraphComponents = components.filter((component) => !component.some((index) => anchored.has(index))).length;

  type EdgeInfo = {
    a: number;
    b: number;
    lower: number;
    upper: number;
    exposedLengthMm: number;
    angleDeg: number;
    selfSupporting: boolean;
  };
  const edgeInfos: EdgeInfo[] = [];
  for (const edge of graph.edges) {
    const a = nodeIndex.get(edge.start);
    const b = nodeIndex.get(edge.end);
    if (a === undefined || b === undefined) continue;
    const pa = graph.nodes[a].position;
    const pb = graph.nodes[b].position;
    const sourceLength = distance(pa, pb);
    if (sourceLength <= EPSILON) continue;
    const lower = pa.z <= pb.z ? a : b;
    const upper = lower === a ? b : a;
    const dz = Math.abs(pb.z - pa.z);
    const angleDeg = Math.acos(Math.min(1, dz / sourceLength)) * 180 / Math.PI;
    // Only the consecutive centreline interval outside the existing Surface
    // is a bridge. A tie may run centre-to-centre through two thick flowers;
    // counting that embedded material as unsupported span would overstate the
    // real bridge by both motif radii. Sampling remains conservative: any
    // positive Surface SDF interval counts in full.
    const sampleStep = Math.max(EPSILON, Math.min(graph.nodes[a].radius, graph.nodes[b].radius) * 0.25);
    const samples = Math.max(2, Math.ceil(sourceLength / sampleStep));
    const intervalLength = sourceLength / samples;
    let consecutiveExposed = 0;
    let maxExposedSource = 0;
    for (let sample = 0; sample < samples; sample++) {
      const t = (sample + 0.5) / samples;
      const point = {
        x: pa.x + (pb.x - pa.x) * t,
        y: pa.y + (pb.y - pa.y) * t,
        z: pa.z + (pb.z - pa.z) * t,
      };
      if (input.surfaceSdf(point) > 0) {
        consecutiveExposed += intervalLength;
        maxExposedSource = Math.max(maxExposedSource, consecutiveExposed);
      } else {
        consecutiveExposed = 0;
      }
    }
    edgeInfos.push({
      a, b, lower, upper,
      exposedLengthMm: maxExposedSource * scale,
      angleDeg,
      selfSupporting: angleDeg <= profile.maxAngleFromVerticalDeg + 1e-6,
    });
  }

  // Surface-fused nodes are independently printable roots. Only edges no
  // steeper than the profile limit may propagate support upward. Horizontal
  // rails never create a new supported endpoint; they are bridges and need
  // both endpoints to have been established independently.
  const supported = new Set(anchored);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edgeInfos) {
      if (!edge.selfSupporting || !supported.has(edge.lower) || supported.has(edge.upper)) continue;
      supported.add(edge.upper);
      changed = true;
    }
  }

  let unsupportedEdges = 0;
  let overlongBridges = 0;
  let bridgeEdges = 0;
  let maxObservedBridgeMm = 0;
  for (const edge of edgeInfos) {
    if (edge.selfSupporting) {
      if (!supported.has(edge.lower)) unsupportedEdges++;
      continue;
    }
    bridgeEdges++;
    maxObservedBridgeMm = Math.max(maxObservedBridgeMm, edge.exposedLengthMm);
    if (edge.exposedLengthMm > profile.maxBridgeMm + 1e-6) overlongBridges++;
    if (!supported.has(edge.a) || !supported.has(edge.b)) unsupportedEdges++;
  }
  const unsupportedNodes = graph.nodes.length - supported.size;
  const removedDegenerateTriangles = input.mesh.removedSavedDegenerateTriangleCount ?? 0;

  if (!input.mesh.watertight.ok) reasons.push(`最終meshが水密ではありません（開いた辺${input.mesh.watertight.openEdges}）`);
  if (input.mesh.connectedComponents !== 1) reasons.push(`最終meshが${input.mesh.connectedComponents}部品に分かれています`);
  if (removedDegenerateTriangles > 0) reasons.push(`STL座標で退化する面が${removedDegenerateTriangles}枚あります`);
  if (minDiameterMm + 1e-6 < profile.minStrutDiameterMm) {
    reasons.push(`最低線径${minDiameterMm.toFixed(2)} mm < 合格値${profile.minStrutDiameterMm.toFixed(2)} mm`);
  }
  if (voxelsAcrossDiameter + 1e-6 < profile.minVoxelsAcrossDiameter) {
    reasons.push(`線径が最終meshで${voxelsAcrossDiameter.toFixed(1)} voxelしかありません`);
  }
  if (anchored.size === 0) reasons.push("外殻へ十分に融合したInternal起点がありません");
  if (floatingGraphComponents > 0) reasons.push(`外殻へ融合しないInternal連結群が${floatingGraphComponents}個あります`);
  if (unsupportedNodes > 0) reasons.push(`下から積層できないInternal nodeが${unsupportedNodes}個あります`);
  if (unsupportedEdges > 0) reasons.push(`造形順で支えられないInternal edgeが${unsupportedEdges}本あります`);
  if (overlongBridges > 0) reasons.push(`保守的bridge上限${profile.maxBridgeMm.toFixed(1)} mmを超えるedgeが${overlongBridges}本あります`);

  return {
    ok: reasons.length === 0,
    profileId: profile.id,
    reasons,
    watertight: input.mesh.watertight.ok,
    meshComponents: input.mesh.connectedComponents,
    removedDegenerateTriangles,
    graphComponents: components.length,
    surfaceAnchorNodes: surfaceAnchored.size,
    buildPlateAnchorNodes: buildPlateAnchored.size,
    floatingGraphComponents,
    unsupportedNodes,
    unsupportedEdges,
    overlongBridges,
    bridgeEdges,
    minDiameterMm,
    voxelStepMm,
    voxelsAcrossDiameter,
    maxBridgeMm: profile.maxBridgeMm,
    maxObservedBridgeMm,
  };
}
