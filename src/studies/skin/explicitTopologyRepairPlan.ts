import type { Stage7RedFaceReinforcementPlan } from "./stage7RedFaceReinforcementPlan.ts";
import type {
  InternalStructureEdge,
  InternalStructureGraph,
  InternalStructureNode,
  Vector3Value,
} from "./voronoi.ts";
import { A1_MINI_PLA_04_02 } from "./internalPrintGate.ts";

export interface ExplicitTopologyRepairNode {
  readonly id: number;
  /** Candidate geometry is stored in the graph's source units. */
  readonly position: Vector3Value;
  readonly radius: number;
}

export interface ExplicitTopologyRepairEdge {
  readonly id: number;
  readonly start: number;
  readonly end: number;
  readonly radius: number;
}

/** Existing runtime identities captured when the explicit candidate is registered. */
export interface ExplicitTopologyRepairIdentity {
  readonly canonicalGraphIdentity: InternalStructureGraph;
  readonly surfaceIdentity: object;
  readonly dryWebIdentity: object;
  readonly artworkGraphIdentity: object;
  readonly targetedSupportSourceIdentity: object;
  readonly paintRevision: number;
  readonly surfaceFingerprint: string;
  readonly resolution: number;
  readonly mode: string;
  readonly supportSettingsKey: string;
}

export interface ExplicitTopologyRepairCurrentness {
  readonly canonicalGraphIdentity: InternalStructureGraph | null;
  readonly surfaceIdentity: object | null;
  readonly dryWebIdentity: object | null;
  readonly artworkGraphIdentity: object | null;
  readonly targetedSupportSourceIdentity: object | null;
  readonly paintRevision: number;
  readonly surfaceFingerprint: string;
  readonly resolution: number;
  readonly mode: string;
  readonly supportSettingsKey: string;
}

export interface ExplicitTopologyRepairPlanInput {
  readonly baselineGraph: InternalStructureGraph | null;
  readonly nodes: readonly ExplicitTopologyRepairNode[];
  readonly edges: readonly ExplicitTopologyRepairEdge[];
  readonly scaleMmPerUnit: number;
  readonly targetDiameterMm: number;
  readonly reason: string;
  readonly topologyEvidence: NonNullable<Stage7RedFaceReinforcementPlan["facts"]["topologyEvidence"]>;
  readonly identity: ExplicitTopologyRepairIdentity;
}

export interface ExplicitTopologyRepairPlanResult {
  readonly plan: Stage7RedFaceReinforcementPlan;
  readonly identity: ExplicitTopologyRepairIdentity;
}

/** Existing Stage 7 adoption/Undo bindings use strict scale identity. This
 * helper keeps that equality fail-closed for a missing or invalid live scale;
 * it is not an epsilon or replacement currentness model. */
export function explicitTopologyRepairAdoptionScaleIsCurrent(
  boundScaleMmPerUnit: number,
  currentScaleMmPerUnit: number | null | undefined,
): boolean {
  return Number.isFinite(boundScaleMmPerUnit)
    && boundScaleMmPerUnit > 0
    && typeof currentScaleMmPerUnit === "number"
    && Number.isFinite(currentScaleMmPerUnit)
    && currentScaleMmPerUnit > 0
    && currentScaleMmPerUnit === boundScaleMmPerUnit;
}

/** The one-time scale used by the read-only candidate validation run. This is
 * provenance only; current readiness deliberately does not require equality
 * with it. */
export const PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_VALIDATION_SCALE_MM_PER_UNIT = 21.335120456771964;
export const PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_RADIUS = 0.045;

/** Exact source-space geometry captured from the reviewed high-precision mm
 * candidate. These coordinates must not be reconstructed from display strings
 * or divided at runtime by the validation scale. */
export const PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_SOURCE_NODES: readonly ExplicitTopologyRepairNode[] = Object.freeze([
  Object.freeze({ id: 2471, position: Object.freeze({ x: 1.7426377880155963, y: -0.9324262748993122, z: -0.020968251934676625 }), radius: PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_RADIUS }),
  Object.freeze({ id: 2472, position: Object.freeze({ x: 1.6328900471282257, y: -0.9293096390602819, z: 0.151380587646076 }), radius: PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_RADIUS }),
  Object.freeze({ id: 2473, position: Object.freeze({ x: 1.5231423062408542, y: -0.9261930032212519, z: 0.3237294272268287 }), radius: PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_RADIUS }),
  Object.freeze({ id: 2474, position: Object.freeze({ x: 1.4133945653534832, y: -0.9230763673822215, z: 0.4960782668075813 }), radius: PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_RADIUS }),
]);

export const PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_EDGES: readonly ExplicitTopologyRepairEdge[] = Object.freeze([
  Object.freeze({ id: 2401, start: 2471, end: 2472, radius: PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_RADIUS }),
  Object.freeze({ id: 2402, start: 2472, end: 2473, radius: PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_RADIUS }),
  Object.freeze({ id: 2403, start: 2473, end: 2474, radius: PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_RADIUS }),
]);

export interface ExplicitTopologyRepairEndpointOverlap {
  readonly patchId: number;
  readonly endpointNodeId: number;
  readonly overlapMm: number;
}

export interface ExplicitTopologyRepairPhysicalEdge {
  readonly edgeId: number;
  readonly lengthMm: number;
  readonly angleFromVerticalDeg: number;
  readonly exposedSpanMm: number;
}

export interface ExplicitTopologyRepairReadinessCondition {
  readonly name: string;
  readonly expected: unknown;
  readonly current: unknown;
  readonly pass: boolean;
  readonly passed: boolean;
  readonly reason: string;
}

export interface ExplicitTopologyRepairReadinessInput {
  /** Existing current canonical graph; this boundary never mutates it. */
  readonly baselineGraph: InternalStructureGraph | null;
  readonly candidateNodes: readonly ExplicitTopologyRepairNode[];
  readonly candidateEdges: readonly ExplicitTopologyRepairEdge[];
  readonly identity: ExplicitTopologyRepairIdentity | null;
  readonly currentness: ExplicitTopologyRepairCurrentness | null;
  /** Exact post-attachment result identity, not just a non-null result. */
  readonly exactCurrent: boolean;
  readonly unresolvedFaceCount: number | null;
  readonly currentScaleMmPerUnit: number | null | undefined;
  readonly targetLongestMm: number | null | undefined;
  readonly validationScaleMmPerUnit: number;
  /** Final current Surface SDF in source units. */
  readonly surfaceSdf: ((point: Vector3Value) => number) | null;
  /** Endpoint-specific Patch SDF overlap evidence in millimetres. */
  readonly endpointOverlaps: readonly ExplicitTopologyRepairEndpointOverlap[];
}

export interface ExplicitTopologyRepairReadiness {
  readonly available: boolean;
  readonly conditions: readonly ExplicitTopologyRepairReadinessCondition[];
  readonly firstFailureReason: string | null;
  readonly reason: string;
  readonly currentScaleMmPerUnit: number | null;
  readonly validationScaleMmPerUnit: number;
  readonly physicalEdges: readonly ExplicitTopologyRepairPhysicalEdge[];
  readonly endpointOverlaps: readonly ExplicitTopologyRepairEndpointOverlap[];
}

const EXPLICIT_REPAIR_EXPECTED_TARGET_LONGEST_MM = 80;
const EXPLICIT_REPAIR_EXPECTED_BASELINE_NODE_COUNT = 2471;
const EXPLICIT_REPAIR_EXPECTED_BASELINE_EDGE_COUNT = 2401;
const EXPLICIT_REPAIR_EXPECTED_EDGE_COUNT = 3;
const EXPLICIT_REPAIR_EXPECTED_ENDPOINTS = Object.freeze([
  Object.freeze({ patchId: 6, endpointNodeId: 2471 }),
  Object.freeze({ patchId: 22, endpointNodeId: 2474 }),
]);
const EXPLICIT_REPAIR_MIN_SOURCE_LENGTH = 1e-8;

function sameVector(a: Vector3Value | undefined, b: Vector3Value | undefined): boolean {
  return Boolean(a && b)
    && a!.x === b!.x
    && a!.y === b!.y
    && a!.z === b!.z;
}

function finiteVector(point: Vector3Value | undefined): boolean {
  return Boolean(point)
    && Number.isFinite(point!.x)
    && Number.isFinite(point!.y)
    && Number.isFinite(point!.z);
}

function sameNumberArray(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function explicitRepairIdentityReferencesPresent(
  identity: ExplicitTopologyRepairIdentity | null,
  current: ExplicitTopologyRepairCurrentness | null,
): boolean {
  return Boolean(
    identity
    && current
    && identity.canonicalGraphIdentity
    && identity.surfaceIdentity
    && identity.dryWebIdentity
    && identity.artworkGraphIdentity
    && identity.targetedSupportSourceIdentity
    && current.canonicalGraphIdentity
    && current.surfaceIdentity
    && current.dryWebIdentity
    && current.artworkGraphIdentity
    && current.targetedSupportSourceIdentity,
  );
}

function graphIds(graph: InternalStructureGraph | null, key: "nodes" | "edges"): number[] {
  if (!graph || !Array.isArray(graph[key])) return [];
  return graph[key].map((item) => item.id);
}

function candidateSourceGeometryMatches(nodes: readonly ExplicitTopologyRepairNode[]): boolean {
  return nodes.length === PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_SOURCE_NODES.length
    && nodes.every((node, index) => {
      const expected = PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_SOURCE_NODES[index];
      return node.id === expected.id
        && node.radius === expected.radius
        && sameVector(node.position, expected.position);
    });
}

function measureExplicitRepairPhysicalEdges(
  nodes: readonly ExplicitTopologyRepairNode[],
  edges: readonly ExplicitTopologyRepairEdge[],
  scaleMmPerUnit: number,
  surfaceSdf: ((point: Vector3Value) => number) | null,
): ExplicitTopologyRepairPhysicalEdge[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  return edges.map((edge) => {
    const start = nodesById.get(edge.start);
    const end = nodesById.get(edge.end);
    if (!start || !end || !finiteVector(start.position) || !finiteVector(end.position)
      || !Number.isFinite(scaleMmPerUnit) || !(scaleMmPerUnit > 0)) {
      return { edgeId: edge.id, lengthMm: Number.NaN, angleFromVerticalDeg: Number.NaN, exposedSpanMm: Number.NaN };
    }
    const dx = end.position.x - start.position.x;
    const dy = end.position.y - start.position.y;
    const dz = end.position.z - start.position.z;
    const sourceLength = Math.hypot(dx, dy, dz);
    if (!Number.isFinite(sourceLength) || sourceLength <= EXPLICIT_REPAIR_MIN_SOURCE_LENGTH) {
      return { edgeId: edge.id, lengthMm: Number.NaN, angleFromVerticalDeg: Number.NaN, exposedSpanMm: Number.NaN };
    }
    const lengthMm = sourceLength * scaleMmPerUnit;
    const angleFromVerticalDeg = Math.acos(Math.min(1, Math.max(0, Math.abs(dz) / sourceLength))) * 180 / Math.PI;
    let exposedSpanMm = Number.NaN;
    if (typeof surfaceSdf === "function") {
      const sampleStep = Math.max(EXPLICIT_REPAIR_MIN_SOURCE_LENGTH, Math.min(start.radius, end.radius) * 0.25);
      const samples = Math.max(2, Math.ceil(sourceLength / sampleStep));
      const intervalLength = sourceLength / samples;
      let consecutiveExposed = 0;
      let maxExposedSource = 0;
      let valid = true;
      for (let sample = 0; sample < samples; sample++) {
        const t = (sample + 0.5) / samples;
        const point = {
          x: start.position.x + dx * t,
          y: start.position.y + dy * t,
          z: start.position.z + dz * t,
        };
        const sdf = surfaceSdf(point);
        if (!Number.isFinite(sdf)) {
          valid = false;
          break;
        }
        if (sdf > 0) {
          consecutiveExposed += intervalLength;
          maxExposedSource = Math.max(maxExposedSource, consecutiveExposed);
        } else {
          consecutiveExposed = 0;
        }
      }
      exposedSpanMm = valid ? maxExposedSource * scaleMmPerUnit : Number.NaN;
    }
    return { edgeId: edge.id, lengthMm, angleFromVerticalDeg, exposedSpanMm };
  });
}

/**
 * Fail-closed readiness boundary for the fixed Patch 6 candidate. The
 * candidate geometry is source-space data; physical observations are measured
 * against the current scale and current final Surface SDF. The validation
 * scale is reported as evidence only and is intentionally not a currentness
 * equality condition.
 */
export function evaluateExplicitTopologyRepairReadiness(
  input: ExplicitTopologyRepairReadinessInput,
): ExplicitTopologyRepairReadiness {
  const conditions: ExplicitTopologyRepairReadinessCondition[] = [];
  let firstFailureReason: string | null = null;
  const add = (
    name: string,
    expected: unknown,
    current: unknown,
    passed: boolean,
    failureReason: string,
  ): void => {
    const reason = passed ? "" : failureReason;
    conditions.push({ name, expected, current, passed, pass: passed, reason });
    if (!passed && firstFailureReason === null) firstFailureReason = `${name}: ${failureReason}`;
  };

  const baseline = input.baselineGraph;
  const candidateNodes = Array.isArray(input.candidateNodes) ? input.candidateNodes : [];
  const candidateEdges = Array.isArray(input.candidateEdges) ? input.candidateEdges : [];
  const baselineValid = baseline !== null && validBaselineGraph(baseline);
  const nodeIds = graphIds(baseline, "nodes");
  const edgeIds = graphIds(baseline, "edges");
  const nextNodeId = nextId(nodeIds);
  const nextEdgeId = nextId(edgeIds);
  const candidateNodeIds = candidateNodes.map((node) => node.id);
  const candidateEdgeIds = candidateEdges.map((edge) => edge.id);
  const expectedNodeIds = PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_SOURCE_NODES.map((node) => node.id);
  const expectedEdgeIds = PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_EDGES.map((edge) => edge.id);
  const candidateNodeSet = new Set(candidateNodeIds);
  const candidateEdgeSet = new Set(candidateEdgeIds);
  const baselineNodeSet = new Set(nodeIds);
  const baselineEdgeSet = new Set(edgeIds);
  const currentScale = typeof input.currentScaleMmPerUnit === "number" && Number.isFinite(input.currentScaleMmPerUnit)
    ? input.currentScaleMmPerUnit
    : null;

  add("targetedGrid kind", "targetedGrid", baseline?.kind ?? null, baseline?.kind === "targetedGrid", "current Graph is not targetedGrid");
  add("canonical Graph structure", "valid node/edge IDs and finite geometry", baselineValid, baselineValid, "canonical Graph structure is invalid");
  add(
    "canonical Graph counts",
    `${EXPLICIT_REPAIR_EXPECTED_BASELINE_NODE_COUNT} node / ${EXPLICIT_REPAIR_EXPECTED_BASELINE_EDGE_COUNT} edge`,
    baseline ? `${baseline.nodes.length} node / ${baseline.edges.length} edge` : null,
    baselineValid
      && baseline!.nodes.length === EXPLICIT_REPAIR_EXPECTED_BASELINE_NODE_COUNT
      && baseline!.edges.length === EXPLICIT_REPAIR_EXPECTED_BASELINE_EDGE_COUNT,
    "current canonical Graph count differs from the reviewed baseline",
  );
  add(
    "canonical Graph object identity",
    "identity.canonicalGraphIdentity === baselineGraph",
    input.identity?.canonicalGraphIdentity === baseline,
    input.identity !== null && input.identity.canonicalGraphIdentity === baseline,
    "canonical Graph object identity is not bound to the current baseline",
  );
  add(
    "exact Surface result current",
    true,
    input.exactCurrent,
    input.exactCurrent === true,
    "current exact Surface result is missing or stale",
  );
  add(
    "exact unresolved faces",
    0,
    input.unresolvedFaceCount,
    input.exactCurrent === true && input.unresolvedFaceCount === 0,
    "current exact result still has unresolved faces",
  );

  const identityRefsPresent = explicitRepairIdentityReferencesPresent(input.identity, input.currentness);
  add(
    "required identity objects",
    "Graph / Surface / Dry Web / Artwork / target identities present",
    identityRefsPresent,
    identityRefsPresent,
    "required current identity object is missing",
  );
  const identityScalarsCurrent = identityRefsPresent
    && explicitTopologyRepairPlanIsCurrent(input.identity!, input.currentness!);
  add(
    "existing scalar identities",
    "strict reference/scalar identity match",
    identityScalarsCurrent,
    identityScalarsCurrent,
    "Surface / Dry Web / Artwork / target / Paint scalar identity drifted",
  );

  const sourceGeometryCurrent = candidateSourceGeometryMatches(candidateNodes);
  add(
    "fixed source-space candidate geometry",
    PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_SOURCE_NODES.map((node) => node.position),
    candidateNodes.map((node) => node.position),
    sourceGeometryCurrent,
    "candidate coordinates are not the reviewed source-space geometry",
  );
  add(
    "candidate node count",
    PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_SOURCE_NODES.length,
    candidateNodes.length,
    candidateNodes.length === PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_SOURCE_NODES.length,
    "candidate must contain exactly four nodes",
  );
  add(
    "deterministic node IDs",
    expectedNodeIds,
    candidateNodeIds,
    baselineValid
      && nextNodeId !== null
      && sameNumberArray(candidateNodeIds, expectedNodeIds)
      && sameNumberArray(expectedNodeIds, expectedNodeIds.map((_id, index) => nextNodeId + index)),
    "candidate node IDs do not follow the deterministic next-ID contract",
  );
  add(
    "node ID collision check",
    "candidate IDs absent from baseline and unique",
    candidateNodeIds,
    candidateNodeSet.size === candidateNodeIds.length && candidateNodeIds.every((id) => !baselineNodeSet.has(id)),
    "candidate node ID collides with the baseline or another candidate",
  );
  add(
    "candidate edge count",
    EXPLICIT_REPAIR_EXPECTED_EDGE_COUNT,
    candidateEdges.length,
    candidateEdges.length === EXPLICIT_REPAIR_EXPECTED_EDGE_COUNT,
    "candidate must contain exactly three edges",
  );
  add(
    "deterministic edge IDs",
    expectedEdgeIds,
    candidateEdgeIds,
    baselineValid
      && nextEdgeId !== null
      && sameNumberArray(candidateEdgeIds, expectedEdgeIds)
      && sameNumberArray(expectedEdgeIds, expectedEdgeIds.map((_id, index) => nextEdgeId + index)),
    "candidate edge IDs do not follow the deterministic next-ID contract",
  );
  add(
    "edge ID collision check",
    "candidate IDs absent from baseline and unique",
    candidateEdgeIds,
    candidateEdgeSet.size === candidateEdgeIds.length && candidateEdgeIds.every((id) => !baselineEdgeSet.has(id)),
    "candidate edge ID collides with the baseline or another candidate",
  );
  const candidateEndpointIds = new Set([...nodeIds, ...candidateNodeIds]);
  add(
    "candidate edge topology",
    PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_EDGES.map((edge) => `${edge.start}->${edge.end}`),
    candidateEdges.map((edge) => `${edge.start}->${edge.end}`),
    candidateEdges.length === PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_EDGES.length
      && candidateEdges.every((edge, index) => {
        const expected = PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_EDGES[index];
        return edge.start === expected.start
          && edge.end === expected.end
          && edge.start !== edge.end
          && candidateEndpointIds.has(edge.start)
          && candidateEndpointIds.has(edge.end);
      }),
    "candidate edge endpoint topology is invalid",
  );

  const scaleCurrent = currentScale !== null && currentScale > 0;
  add("current finite scale", "> 0 and finite", currentScale, scaleCurrent, "current scale is not finite and positive");
  const validationScaleCurrent = Number.isFinite(input.validationScaleMmPerUnit)
    && input.validationScaleMmPerUnit === PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_VALIDATION_SCALE_MM_PER_UNIT;
  add(
    "validation scale provenance",
    PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_VALIDATION_SCALE_MM_PER_UNIT,
    input.validationScaleMmPerUnit,
    validationScaleCurrent,
    "validation scale provenance differs from the reviewed validation run",
  );
  add(
    "targetLongestMm identity",
    EXPLICIT_REPAIR_EXPECTED_TARGET_LONGEST_MM,
    input.targetLongestMm,
    input.targetLongestMm === EXPLICIT_REPAIR_EXPECTED_TARGET_LONGEST_MM,
    "targetLongestMm is not the reviewed 80 mm identity",
  );

  const physicalEdges = scaleCurrent
    ? measureExplicitRepairPhysicalEdges(candidateNodes, candidateEdges, currentScale!, input.surfaceSdf)
    : candidateEdges.map((edge) => ({ edgeId: edge.id, lengthMm: Number.NaN, angleFromVerticalDeg: Number.NaN, exposedSpanMm: Number.NaN }));
  add(
    "physical edge measurements",
    "each length / angle / exposed span is finite",
    physicalEdges,
    physicalEdges.length === EXPLICIT_REPAIR_EXPECTED_EDGE_COUNT
      && physicalEdges.every((edge) => Number.isFinite(edge.lengthMm)
        && Number.isFinite(edge.angleFromVerticalDeg)
        && Number.isFinite(edge.exposedSpanMm)),
    "current Surface SDF could not produce finite edge measurements",
  );
  for (const edge of physicalEdges) {
    add(
      `edge ${edge.edgeId} length`,
      "> 0 mm",
      edge.lengthMm,
      Number.isFinite(edge.lengthMm) && edge.lengthMm > 0,
      "edge length is not finite and positive",
    );
    add(
      `edge ${edge.edgeId} angle`,
      `<= ${A1_MINI_PLA_04_02.maxAngleFromVerticalDeg}°`,
      edge.angleFromVerticalDeg,
      Number.isFinite(edge.angleFromVerticalDeg) && edge.angleFromVerticalDeg <= A1_MINI_PLA_04_02.maxAngleFromVerticalDeg,
      "edge angle exceeds the A1 profile limit",
    );
    add(
      `edge ${edge.edgeId} exposed span`,
      `<= ${A1_MINI_PLA_04_02.maxBridgeMm} mm`,
      edge.exposedSpanMm,
      Number.isFinite(edge.exposedSpanMm) && edge.exposedSpanMm <= A1_MINI_PLA_04_02.maxBridgeMm,
      "edge exposed span exceeds the A1 profile limit",
    );
  }

  const candidateRadii = [...candidateNodes.map((node) => node.radius), ...candidateEdges.map((edge) => edge.radius)];
  const radiusCurrent = candidateRadii.length > 0
    && candidateRadii.every((radius) => radius === PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_RADIUS);
  add(
    "candidate radius",
    PATCH_6_EXPLICIT_TOPOLOGY_REPAIR_RADIUS,
    candidateRadii,
    radiusCurrent,
    "candidate node/edge radius differs from the reviewed 0.045 source-unit radius",
  );
  const diameterMm = scaleCurrent && candidateEdges.length > 0
    ? Math.min(...candidateEdges.map((edge) => edge.radius)) * 2 * currentScale!
    : Number.NaN;
  add(
    "minimum physical diameter",
    `>= ${A1_MINI_PLA_04_02.minStrutDiameterMm} mm`,
    diameterMm,
    Number.isFinite(diameterMm) && diameterMm >= A1_MINI_PLA_04_02.minStrutDiameterMm,
    "candidate physical diameter is below the A1 profile minimum",
  );

  const endpointOverlaps = Array.isArray(input.endpointOverlaps) ? input.endpointOverlaps : [];
  for (const expected of EXPLICIT_REPAIR_EXPECTED_ENDPOINTS) {
    const matches = endpointOverlaps.filter((overlap) =>
      overlap.patchId === expected.patchId && overlap.endpointNodeId === expected.endpointNodeId);
    const overlapMm = matches.length === 1 ? matches[0].overlapMm : Number.NaN;
    add(
      `Patch ${expected.patchId} endpoint overlap`,
      `>= ${A1_MINI_PLA_04_02.minSurfaceOverlapMm} mm`,
      overlapMm,
      matches.length === 1
        && Number.isFinite(overlapMm)
        && overlapMm >= A1_MINI_PLA_04_02.minSurfaceOverlapMm,
      matches.length === 1 ? "endpoint overlap is below the A1 Surface overlap minimum" : "endpoint-specific Patch overlap evidence is missing or duplicated",
    );
  }

  const available = firstFailureReason === null;
  const reason = firstFailureReason
    ?? (currentScale === null
      ? "Patch 6候補を使用できます（current scale未取得）"
      : `Patch 6候補を使用できます: current scale ${currentScale.toFixed(12)} / validation provenance scale ${input.validationScaleMmPerUnit.toFixed(12)}（provenance only）`);
  return {
    available,
    conditions: Object.freeze(conditions),
    firstFailureReason,
    reason,
    currentScaleMmPerUnit: currentScale,
    validationScaleMmPerUnit: input.validationScaleMmPerUnit,
    physicalEdges: Object.freeze(physicalEdges),
    endpointOverlaps: Object.freeze(endpointOverlaps.slice()),
  };
}

function cloneValue<T>(value: T): T {
  if (value instanceof Float32Array) return new Float32Array(value) as T;
  if (value instanceof Float64Array) return new Float64Array(value) as T;
  if (value instanceof Uint32Array) return new Uint32Array(value) as T;
  if (Array.isArray(value)) return value.map((item) => cloneValue(item)) as T;
  if (value && typeof value === "object") {
    const clone: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) clone[key] = cloneValue(item);
    return clone as T;
  }
  return value;
}

function invalidPlan(reason: string, targetDiameterMm: number, radius: number): Stage7RedFaceReinforcementPlan {
  return {
    state: "invalid",
    reason,
    graph: null,
    facts: Object.freeze({
      planSource: "explicit-topology-repair",
      baseNodeCount: 0,
      provisionalNodeCount: 0,
      baseEdgeCount: 0,
      provisionalEdgeCount: 0,
      sourceEdgesSplit: 0,
      junctionNodesAdded: 0,
      redEndpointNodesAdded: 0,
      reinforcementEdgesAdded: 0,
      targetDiameterMm,
      reinforcementRadius: radius,
      candidateFaceIds: Object.freeze([]),
    }),
  };
}

function finitePoint(point: Vector3Value): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

function validBaselineGraph(graph: InternalStructureGraph): boolean {
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || !graph.stats || typeof graph.stats !== "object") return false;
  const nodeIds = new Set<number>();
  for (const node of graph.nodes) {
    if (!Number.isSafeInteger(node.id) || nodeIds.has(node.id) || !finitePoint(node.position)
      || !Number.isFinite(node.radius) || node.radius < 0) return false;
    nodeIds.add(node.id);
  }
  const edgeIds = new Set<number>();
  for (const edge of graph.edges) {
    if (!Number.isSafeInteger(edge.id) || edgeIds.has(edge.id)
      || !Number.isSafeInteger(edge.start) || !Number.isSafeInteger(edge.end)
      || !nodeIds.has(edge.start) || !nodeIds.has(edge.end)
      || !Number.isFinite(edge.radius) || edge.radius < 0) return false;
    edgeIds.add(edge.id);
  }
  return true;
}

function nextId(ids: readonly number[]): number | null {
  if (ids.some((id) => !Number.isSafeInteger(id))) return null;
  const max = ids.length > 0 ? Math.max(...ids) : -1;
  return max < Number.MAX_SAFE_INTEGER ? max + 1 : null;
}

/**
 * Convert one already-reviewed, fixed topology repair into the existing Stage
 * 7 provisional-plan meaning. The baseline graph is cloned; this function has
 * no canonical mutation capability.
 */
export function createExplicitTopologyRepairPlan(
  input: ExplicitTopologyRepairPlanInput,
): ExplicitTopologyRepairPlanResult {
  const baseline = input.baselineGraph;
  const radius = input.nodes[0]?.radius ?? input.edges[0]?.radius ?? Number.NaN;
  const invalid = (reason: string): ExplicitTopologyRepairPlanResult => ({
    plan: invalidPlan(reason, input.targetDiameterMm, radius),
    identity: input.identity,
  });
  if (!baseline || baseline.kind !== "targetedGrid" || !validBaselineGraph(baseline)
    || input.identity.canonicalGraphIdentity !== baseline) {
    return invalid("current targetedGrid Graph identityが候補生成時点と一致しません。");
  }
  if (!Number.isFinite(input.scaleMmPerUnit) || !(input.scaleMmPerUnit > 0)
    || !Number.isFinite(input.targetDiameterMm) || !(input.targetDiameterMm > 0)
    || input.nodes.length === 0 || input.edges.length === 0 || input.reason.trim() === ""
    || !Number.isSafeInteger(input.identity.paintRevision) || input.identity.paintRevision < 0
    || !Number.isSafeInteger(input.identity.resolution) || input.identity.resolution <= 0
    || input.identity.surfaceFingerprint.length === 0 || input.identity.mode.length === 0
    || input.identity.supportSettingsKey.length === 0
    || !Number.isSafeInteger(input.topologyEvidence.resolution) || input.topologyEvidence.resolution <= 0
    || !Number.isSafeInteger(input.topologyEvidence.baselineComponents) || input.topologyEvidence.baselineComponents <= 0
    || !Number.isSafeInteger(input.topologyEvidence.provisionalComponents) || input.topologyEvidence.provisionalComponents <= 0) {
    return invalid("明示topology repair candidateの入力が不正です。");
  }
  const baselineNodeIds = new Set(baseline.nodes.map((node) => node.id));
  const baselineEdgeIds = new Set(baseline.edges.map((edge) => edge.id));
  const expectedNodeId = nextId([...baselineNodeIds]);
  const expectedEdgeId = nextId([...baselineEdgeIds]);
  if (expectedNodeId === null || expectedEdgeId === null) return invalid("Graph IDを安全に割り当てられません。");

  const newNodeIds = new Set<number>();
  const provisionalNodes: InternalStructureNode[] = baseline.nodes.map((node) => cloneValue(node));
  for (const [index, node] of input.nodes.entries()) {
    if (node.id !== expectedNodeId + index || baselineNodeIds.has(node.id) || newNodeIds.has(node.id)
      || !finitePoint(node.position) || !Number.isFinite(node.radius) || !(node.radius > 0)) {
      return invalid("明示node ID・座標・radiusがcanonical Graphの決定的な追番契約と一致しません。");
    }
    newNodeIds.add(node.id);
    provisionalNodes.push({
      id: node.id,
      position: cloneValue(node.position),
      radius: node.radius,
    });
  }

  const newEdgeIds = new Set<number>();
  const provisionalEdges: InternalStructureEdge[] = baseline.edges.map((edge) => cloneValue(edge));
  const availableNodeIds = new Set([...baselineNodeIds, ...newNodeIds]);
  for (const [index, edge] of input.edges.entries()) {
    if (edge.id !== expectedEdgeId + index || baselineEdgeIds.has(edge.id) || newEdgeIds.has(edge.id)
      || !availableNodeIds.has(edge.start) || !availableNodeIds.has(edge.end) || edge.start === edge.end
      || !Number.isFinite(edge.radius) || !(edge.radius > 0)) {
      return invalid("明示edge ID・endpoint・radiusがcanonical Graphの決定的な追番契約と一致しません。");
    }
    newEdgeIds.add(edge.id);
    provisionalEdges.push({ id: edge.id, start: edge.start, end: edge.end, radius: edge.radius });
  }

  const graph = cloneValue(baseline);
  graph.nodes = provisionalNodes;
  graph.edges = provisionalEdges;
  graph.stats = {
    ...cloneValue(baseline.stats),
    gridNodeCount: provisionalNodes.length,
    gridEdgeCount: provisionalEdges.length,
  };
  return {
    identity: input.identity,
    plan: {
      state: "current",
      reason: input.reason,
      graph,
      facts: Object.freeze({
        planSource: "explicit-topology-repair",
        topologyEvidence: Object.freeze({ ...input.topologyEvidence }),
        baseNodeCount: baseline.nodes.length,
        provisionalNodeCount: graph.nodes.length,
        baseEdgeCount: baseline.edges.length,
        provisionalEdgeCount: graph.edges.length,
        sourceEdgesSplit: 0,
        junctionNodesAdded: 0,
        redEndpointNodesAdded: 0,
        reinforcementEdgesAdded: input.edges.length,
        targetDiameterMm: input.targetDiameterMm,
        reinforcementRadius: radius,
        candidateFaceIds: Object.freeze([]),
      }),
    },
  };
}

/** Strict reference/scalar check; coordinate equality is deliberately irrelevant. */
export function explicitTopologyRepairPlanIsCurrent(
  identity: ExplicitTopologyRepairIdentity,
  current: ExplicitTopologyRepairCurrentness,
): boolean {
  return identity.canonicalGraphIdentity === current.canonicalGraphIdentity
    && identity.surfaceIdentity === current.surfaceIdentity
    && identity.dryWebIdentity === current.dryWebIdentity
    && identity.artworkGraphIdentity === current.artworkGraphIdentity
    && identity.targetedSupportSourceIdentity === current.targetedSupportSourceIdentity
    && identity.paintRevision === current.paintRevision
    && identity.surfaceFingerprint === current.surfaceFingerprint
    && identity.resolution === current.resolution
    && identity.mode === current.mode
    && identity.supportSettingsKey === current.supportSettingsKey;
}
