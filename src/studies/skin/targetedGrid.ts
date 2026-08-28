import type { Ball } from "../cloud-sculpt/field.ts";
import type { MotifLowestPoint } from "./motifLowestPoint.ts";
import type { OverhangDryWebTarget } from "./overhangSupportPolicy.ts";
import type { Patch, PatchPoint } from "./field.ts";
import type {
  InternalStructureEdge,
  InternalStructureGraph,
  InternalStructureNode,
  InternalStructureStats,
  Vector3Value,
} from "./voronoi.ts";

const EPSILON = 1e-8;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function distance(a: Vector3Value, b: Vector3Value): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function normalise(value: Vector3Value): Vector3Value {
  const length = Math.hypot(value.x, value.y, value.z);
  return length > EPSILON
    ? { x: value.x / length, y: value.y / length, z: value.z / length }
    : { x: 0, y: 0, z: 1 };
}

class Components {
  private readonly parent: number[];

  constructor(count: number) {
    this.parent = Array.from({ length: count }, (_, index) => index);
  }

  find(index: number): number {
    let root = index;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[index] !== index) {
      const next = this.parent[index];
      this.parent[index] = root;
      index = next;
    }
    return root;
  }

  join(a: number, b: number): boolean {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return false;
    this.parent[rootB] = rootA;
    return true;
  }
}

/**
 * Generator-derived contact evidence for one Surface Pattern.  A contact is
 * a material endpoint node from a chosen patch-to-patch link; target-connection
 * edges are deliberately not represented here.
 */
export interface TargetedGridPatchContactFact {
  patchId: number;
  contactNodeIds: number[];
  contactCount: number;
  /** Stable key made from the ascending patch IDs in this component. */
  componentKey: string;
  componentSize: number;
}

export interface TargetedGridContactFacts {
  usefulPatchCount: number;
  componentCount: number;
  mainComponentKey: string | null;
  mainComponentSize: number;
  patches: TargetedGridPatchContactFact[];
}

/** Runtime-only evidence explaining the selected contact floor per patch. */
export interface TargetedGridContactFloorPatchFact {
  patchId: number;
  selectedDistinctContactCount: number;
  candidateLinkCount: number;
  candidateDistinctContactCount: number;
  componentKey: string;
}

export interface TargetedGridContactFloorFacts {
  requiredContacts: number;
  mainComponentKey: string | null;
  patches: TargetedGridContactFloorPatchFact[];
}

/** The optional runtime addition carried by a targeted-grid graph. */
export interface TargetedGridInternalStructureStats extends InternalStructureStats {
  dryWebContactFacts?: TargetedGridContactFacts;
}

/**
 * Runtime-only provenance for one source target's exact graph connection.
 * Numeric source/node/edge IDs keep the assignmentId strings in the current
 * source list rather than copying them into the graph or its stats.
 */
export type TargetedGridTargetConnectionStatus = "connected" | "unresolved";

export interface TargetedGridTargetConnectionFact {
  sourceTargetIndex: number;
  contactNodeId: number | null;
  materialNodeId: number | null;
  edgeId: number | null;
  status: TargetedGridTargetConnectionStatus;
}

/** A typed targeted-grid result without changing the shared graph contract. */
export interface TargetedGridInternalStructureGraph extends Omit<InternalStructureGraph, "kind" | "stats"> {
  kind: "targetedGrid";
  stats: TargetedGridInternalStructureStats;
}

interface TargetedGridComponentRecord {
  indices: number[];
  patchIds: number[];
  key: string;
  firstPatchId: number;
}

function buildTargetedGridContactFacts(
  usefulPatches: readonly Patch[],
  patchComponents: Components,
  contactNodeIdsByPatch: readonly ReadonlySet<number>[],
): TargetedGridContactFacts {
  const indicesByRoot = new Map<number, number[]>();
  for (let index = 0; index < usefulPatches.length; index++) {
    const root = patchComponents.find(index);
    const indices = indicesByRoot.get(root);
    if (indices) indices.push(index);
    else indicesByRoot.set(root, [index]);
  }

  const components: TargetedGridComponentRecord[] = [...indicesByRoot.values()]
    .map((indices) => {
      const orderedIndices = indices.slice().sort((a, b) => usefulPatches[a].id - usefulPatches[b].id || a - b);
      const patchIds = orderedIndices.map((index) => usefulPatches[index].id);
      return {
        indices: orderedIndices,
        patchIds,
        key: patchIds.join(","),
        firstPatchId: patchIds[0] ?? Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => a.firstPatchId - b.firstPatchId || a.key.localeCompare(b.key));

  let mainComponent: TargetedGridComponentRecord | null = null;
  for (const component of components) {
    if (!mainComponent
      || component.indices.length > mainComponent.indices.length
      || (component.indices.length === mainComponent.indices.length
        && (component.firstPatchId < mainComponent.firstPatchId
          || (component.firstPatchId === mainComponent.firstPatchId && component.key < mainComponent.key)))) {
      mainComponent = component;
    }
  }

  const componentByPatchIndex = new Map<number, TargetedGridComponentRecord>();
  for (const component of components) {
    for (const index of component.indices) componentByPatchIndex.set(index, component);
  }
  const patches = usefulPatches
    .map((patch, index) => {
      const component = componentByPatchIndex.get(index)!;
      const contactNodeIds = [...(contactNodeIdsByPatch[index] ?? [])].sort((a, b) => a - b);
      return {
        patchId: patch.id,
        contactNodeIds,
        contactCount: contactNodeIds.length,
        componentKey: component.key,
        componentSize: component.indices.length,
      };
    })
    .sort((a, b) => a.patchId - b.patchId);

  return {
    usefulPatchCount: usefulPatches.length,
    componentCount: components.length,
    mainComponentKey: mainComponent?.key ?? null,
    mainComponentSize: mainComponent?.indices.length ?? 0,
    patches,
  };
}

function buildTargetedGridContactFloorFacts(
  requiredContacts: number,
  usefulPatches: readonly Patch[],
  candidateLinkCounts: readonly number[],
  candidateDistinctContactKeys: readonly ReadonlySet<string>[],
  contactFacts: TargetedGridContactFacts,
): TargetedGridContactFloorFacts {
  const selectedByPatchId = new Map(contactFacts.patches.map((patch) => [patch.patchId, patch]));
  return {
    requiredContacts,
    mainComponentKey: contactFacts.mainComponentKey,
    patches: usefulPatches
      .map((patch, index) => {
        const selected = selectedByPatchId.get(patch.id);
        if (!selected) throw new Error("contact floor patch fact is missing");
        return {
          patchId: patch.id,
          selectedDistinctContactCount: selected.contactCount,
          candidateLinkCount: candidateLinkCounts[index] ?? 0,
          candidateDistinctContactCount: candidateDistinctContactKeys[index]?.size ?? 0,
          componentKey: selected.componentKey,
        };
      })
      .sort((a, b) => a.patchId - b.patchId),
  };
}

function ownPoints(patch: Patch): PatchPoint[] {
  const own = patch.points.filter((point) => point.role !== "bridge" && point.role !== "surfaceConnector");
  return own.length > 0 ? own : patch.points;
}

function hostCentre(host: Ball[]): Vector3Value {
  const centre = host.reduce(
    (sum, ball) => ({ x: sum.x + ball.x, y: sum.y + ball.y, z: sum.z + ball.z }),
    { x: 0, y: 0, z: 0 },
  );
  const divisor = Math.max(1, host.length);
  return { x: centre.x / divisor, y: centre.y / divisor, z: centre.z / divisor };
}

function surfaceContact(
  target: Pick<MotifLowestPoint | OverhangDryWebTarget, "position" | "normal">,
  centre: Vector3Value,
  radius: number,
  materialPoint?: PatchPoint,
): Vector3Value {
  const inward = materialPoint
    ? normalise({
      x: materialPoint.x - target.position.x,
      y: materialPoint.y - target.position.y,
      z: materialPoint.z - target.position.z,
    })
    : normalise(target.normal ? {
      x: -target.normal.x,
      y: -target.normal.y,
      z: -target.normal.z,
    } : {
    x: centre.x - target.position.x,
    y: centre.y - target.position.y,
    z: centre.z - target.position.z,
    });
  // Keep 0.1r of the contact sphere across the diagnosed vertex while putting
  // its centre far enough inside the faceted final Surface to survive voxel
  // and normal interpolation error.
  const inset = radius * 0.98;
  return {
    x: target.position.x + inward.x * inset,
    y: target.position.y + inward.y * inset,
    z: target.position.z + inward.z * inset,
  };
}

interface PatchLinkCandidate {
  patchA: number;
  patchB: number;
  pointA: PatchPoint;
  pointB: PatchPoint;
  exposedGap: number;
  centreDistance: number;
}

export type TargetedGridProgressPhase =
  | "pair-search"
  | "candidate-ordering"
  | "tree"
  | "target-connections"
  | "complete";

export interface TargetedGridBuildProgress {
  phase: TargetedGridProgressPhase;
  completed: number;
  total: number;
}

export interface TargetedGridNearestSelectionStats {
  /** Number of targets resolved by the linear finite-score scan. */
  linearScans: number;
  /** Number of legacy slice/sort fallbacks used for malformed scores. */
  legacySorts: number;
  /** Total point visits made by the linear scans. */
  scannedPoints: number;
}

export interface TargetedGridBuildOptions {
  onProgress?: (progress: TargetedGridBuildProgress) => void;
  /** Author-selected artwork contact floor for an explicit Dry Web build.
   * Undefined retains the legacy builder fallback of one contact. */
  dryWebRequiredContacts?: number;
  /** Test-only reference switch. The default keeps the exact AABB pruning path. */
  pruneByAabb?: boolean;
  /** Test-only switch for deep-comparing the pre-optimization target path. */
  useLegacyTargetSelection?: boolean;
  /** Optional test instrumentation for target nearest-point selection. */
  nearestSelectionStats?: TargetedGridNearestSelectionStats;
  /** Original source-target indices; never use the sorted target index as identity. */
  targetSourceIndices?: readonly number[];
  /** Runtime-only exact target-to-graph mapping, kept outside the graph contract. */
  onTargetConnectionFacts?: (facts: readonly TargetedGridTargetConnectionFact[]) => void;
  /** Runtime-only explanation of the generated contact floor. */
  onContactFloorFacts?: (facts: TargetedGridContactFloorFacts) => void;
}

/** Normalize the generation-time artwork contact floor without changing the
 * legacy omitted-option builder contract. Non-finite explicit input fails
 * closed; the UI sends the already normalized 1/2/3 value. */
export function normalizeTargetedGridRequiredContacts(value: number | undefined): number {
  if (value === undefined) return 1;
  if (!Number.isFinite(value)) throw new Error("Dry Web required contacts must be finite");
  return clamp(Math.round(value), 1, 3);
}

function closestMaterialPair(
  pointsA: readonly PatchPoint[],
  pointsB: readonly PatchPoint[],
): Omit<PatchLinkCandidate, "patchA" | "patchB"> | null {
  let best: Omit<PatchLinkCandidate, "patchA" | "patchB"> | null = null;
  for (const pointA of pointsA) {
    for (const pointB of pointsB) {
      const centreDistance = distance(pointA, pointB);
      const exposedGap = Math.max(0, centreDistance - pointA.r - pointB.r);
      if (!best || exposedGap < best.exposedGap - EPSILON ||
        (Math.abs(exposedGap - best.exposedGap) <= EPSILON && centreDistance < best.centreDistance)) {
        best = { pointA, pointB, exposedGap, centreDistance };
      }
    }
  }
  return best;
}

interface MaterialBounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

function materialBounds(points: readonly PatchPoint[]): MaterialBounds | null {
  if (points.length === 0) return null;
  const bounds: MaterialBounds = {
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity,
  };
  for (const point of points) {
    // Negative/non-finite radii do not describe an enclosing material AABB;
    // leave these legacy inputs on the exact reference path.
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)
      || !Number.isFinite(point.r) || point.r < 0) return null;
    bounds.minX = Math.min(bounds.minX, point.x - point.r);
    bounds.minY = Math.min(bounds.minY, point.y - point.r);
    bounds.minZ = Math.min(bounds.minZ, point.z - point.r);
    bounds.maxX = Math.max(bounds.maxX, point.x + point.r);
    bounds.maxY = Math.max(bounds.maxY, point.y + point.r);
    bounds.maxZ = Math.max(bounds.maxZ, point.z + point.r);
  }
  return bounds;
}

function legacyNearestMaterialPoint(
  target: Vector3Value,
  points: readonly PatchPoint[],
  stats?: TargetedGridNearestSelectionStats,
): PatchPoint | undefined {
  stats && (stats.legacySorts++);
  return points.slice().sort((a, b) =>
    distance(target, a) - a.r - (distance(target, b) - b.r))[0];
}

/**
 * Select the same nearest material point as the old stable slice/sort path.
 * Finite scores use a stable linear arg-min (`<` keeps the first tie). Any
 * non-finite score falls back to the exact legacy comparator, whose NaN
 * behaviour is intentionally retained for malformed legacy inputs.
 */
export function selectNearestMaterialPoint(
  target: Vector3Value,
  points: readonly PatchPoint[],
  stats?: TargetedGridNearestSelectionStats,
): PatchPoint | undefined {
  let best: PatchPoint | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const point of points) {
    const score = distance(target, point) - point.r;
    if (!Number.isFinite(score)) return legacyNearestMaterialPoint(target, points, stats);
    if (best === undefined || score < bestScore) {
      best = point;
      bestScore = score;
    }
  }
  stats && (stats.linearScans++, stats.scannedPoints += points.length);
  return best;
}

function axisGap(minA: number, maxA: number, minB: number, maxB: number): number {
  if (maxA < minB) return minB - maxA;
  if (maxB < minA) return minA - maxB;
  return 0;
}

/**
 * The AABB encloses every material sphere in a patch. Therefore the distance
 * between two such boxes is a lower bound on the closest material gap. A
 * positive bound above maxExposedGap can safely skip the exact point-pair
 * search; overlapping boxes deliberately stay on the exact path.
 */
function materialAabbLowerBound(a: MaterialBounds, b: MaterialBounds): number {
  return Math.hypot(
    axisGap(a.minX, a.maxX, b.minX, b.maxX),
    axisGap(a.minY, a.maxY, b.minY, b.maxY),
    axisGap(a.minZ, a.maxZ, b.minZ, b.maxZ),
  );
}

function stageProgressReporter(
  phase: TargetedGridProgressPhase,
  total: number,
  onProgress: ((progress: TargetedGridBuildProgress) => void) | undefined,
): ((completed: number, force?: boolean) => void) | null {
  if (!onProgress) return null;
  // Keep a genuinely empty stage as 0/0; callers can distinguish that from
  // work that has one unit. The worker/UI treats an empty total as measured
  // indeterminate while non-empty pair search remains exact X/Y progress.
  const safeTotal = Math.max(0, total);
  const stride = safeTotal > 0 ? Math.max(1, Math.ceil(safeTotal / 99)) : 1;
  let lastReported = -1;
  return (completed: number, force = false): void => {
    const bounded = Math.max(0, Math.min(safeTotal, completed));
    if (!force && bounded !== safeTotal && bounded - lastReported < stride) return;
    if (bounded === lastReported) return;
    lastReported = bounded;
    onProgress({ phase, completed: bounded, total: safeTotal });
  };
}

/**
 * Dry, deterministic, Surface-rooted print web.
 *
 * A spanning tree is solved over *material gaps*, not motif-lowest-point
 * distances. Every chosen tie runs between two existing PatchPoint centres;
 * most of that segment is embedded in the motifs and only the empty interval
 * between their sphere envelopes is a bridge. Each red lowest point also gets
 * an inward contact joined to the nearest point of its own motif, so the
 * diagnostic target remains explicit without forcing all topology through
 * those widely separated low points. `supportCount` adds short redundant ties
 * after the minimum one-part web has been found.
 */
export function buildTargetedGridInternalStructure(
  host: Ball[],
  _hostK: number,
  patches: Patch[],
  targets: Array<MotifLowestPoint | OverhangDryWebTarget>,
  supportCount: number,
  radius: number,
  options: TargetedGridBuildOptions = {},
): TargetedGridInternalStructureGraph {
  const safeRadius = clamp(Number.isFinite(radius) ? radius : 0.045, 0.005, 1);
  const requiredContacts = normalizeTargetedGridRequiredContacts(options.dryWebRequiredContacts);
  const extraRequested = clamp(Math.round(Number.isFinite(supportCount) ? supportCount : 28), 0, 4000);
  if (options.targetSourceIndices && options.targetSourceIndices.length !== targets.length) {
    throw new Error("target source index length mismatch");
  }
  if (options.targetSourceIndices?.some((index) => !Number.isSafeInteger(index) || index < 0)) {
    throw new Error("target source index is invalid");
  }
  const finalTargets = targets
    .map((target, inputIndex) => ({
      target,
      sourceTargetIndex: options.targetSourceIndices?.[inputIndex] ?? inputIndex,
    }))
    .filter((entry) => entry.target.basis === "finalMesh")
    .slice()
    .sort((a, b) => (a.target.patchId ?? Number.MAX_SAFE_INTEGER) - (b.target.patchId ?? Number.MAX_SAFE_INTEGER)
      || ("assignmentId" in a.target ? a.target.assignmentId : "")
        .localeCompare("assignmentId" in b.target ? b.target.assignmentId : ""));
  const usefulPatches = patches.filter((patch) => patch.points.length > 0).slice().sort((a, b) => a.id - b.id);
  const quantum = Math.max(safeRadius * 0.05, 1e-6);
  const contactKey = (point: PatchPoint): string =>
    `${Math.round(point.x / quantum)},${Math.round(point.y / quantum)},${Math.round(point.z / quantum)}`;
  const candidateLinkCounts = usefulPatches.map(() => 0);
  const candidateDistinctContactKeys = usefulPatches.map(() => new Set<string>());
  const stats: TargetedGridInternalStructureStats = {
    inputPoints: targets.length,
    delaunayTetrahedra: 0,
    candidateEdges: 0,
    clippedEdges: 0,
    removedShortEdges: 0,
    removedOutsideEdges: 0,
    removedIsolatedEdges: 0,
    requestedTargets: finalTargets.length,
    connectedTargets: 0,
    gridNodeCount: 0,
    gridEdgeCount: 0,
  };
  const targetConnectionFacts: TargetedGridTargetConnectionFact[] = [];
  const emitTargetConnectionFacts = (): void => {
    options.onTargetConnectionFacts?.(targetConnectionFacts.map((fact) => ({ ...fact })));
  };
  const emitContactFloorFacts = (facts: TargetedGridContactFloorFacts): void => {
    options.onContactFloorFacts?.({
      requiredContacts: facts.requiredContacts,
      mainComponentKey: facts.mainComponentKey,
      patches: facts.patches.map((fact) => ({ ...fact })),
    });
  };
  const patchComponents = new Components(usefulPatches.length);
  const patchContactNodeIds = usefulPatches.map(() => new Set<number>());
  if (host.length === 0 || usefulPatches.length === 0 || finalTargets.length === 0) {
    for (const { sourceTargetIndex } of finalTargets) {
      targetConnectionFacts.push({
        sourceTargetIndex,
        contactNodeId: null,
        materialNodeId: null,
        edgeId: null,
        status: "unresolved",
      });
    }
    emitTargetConnectionFacts();
    stats.dryWebContactFacts = buildTargetedGridContactFacts(usefulPatches, patchComponents, patchContactNodeIds);
    emitContactFloorFacts(buildTargetedGridContactFloorFacts(
      requiredContacts,
      usefulPatches,
      candidateLinkCounts,
      candidateDistinctContactKeys,
      stats.dryWebContactFacts,
    ));
    options.onProgress?.({ phase: "complete", completed: 1, total: 1 });
    return { kind: "targetedGrid", nodes: [], edges: [], stats };
  }

  // 0.255 source units is kept just below 5 mm for the current 80 mm output.
  // The gate independently measures the exact mm exposure from Surface SDF.
  const maxExposedGap = Math.max(0.255, safeRadius * 4.5);
  // Material point ownership is immutable for this build. Reuse the exact
  // original order for both pair search and target connections instead of
  // filtering/copying every pair and every target.
  const patchPointLists = usefulPatches.map((patch) => ownPoints(patch));
  const patchPointsById = new Map<number, readonly PatchPoint[]>();
  const allMaterialPoints: PatchPoint[] = [];
  for (let index = 0; index < usefulPatches.length; index++) {
    const points = patchPointLists[index];
    patchPointsById.set(usefulPatches[index].id, points);
    for (const point of points) allMaterialPoints.push(point);
  }
  const patchBounds = options.pruneByAabb === false
    ? []
    : patchPointLists.map((points) => materialBounds(points));
  const candidates: PatchLinkCandidate[] = [];
  const pairTotal = usefulPatches.length * (usefulPatches.length - 1) / 2;
  const reportPairSearch = stageProgressReporter("pair-search", pairTotal, options.onProgress);
  reportPairSearch?.(0, true);
  let completedPairs = 0;
  for (let patchA = 0; patchA < usefulPatches.length; patchA++) {
    for (let patchB = patchA + 1; patchB < usefulPatches.length; patchB++) {
      completedPairs++;
      const boundsA = patchBounds[patchA];
      const boundsB = patchBounds[patchB];
      if (boundsA && boundsB && materialAabbLowerBound(boundsA, boundsB) > maxExposedGap) {
        reportPairSearch?.(completedPairs);
        continue;
      }
      const closest = closestMaterialPair(
        patchPointLists[patchA],
        patchPointLists[patchB],
      );
      reportPairSearch?.(completedPairs);
      if (!closest || closest.exposedGap > maxExposedGap) continue;
      stats.candidateEdges++;
      candidates.push({ patchA, patchB, ...closest });
      candidateLinkCounts[patchA]++;
      candidateLinkCounts[patchB]++;
      candidateDistinctContactKeys[patchA].add(contactKey(closest.pointA));
      candidateDistinctContactKeys[patchB].add(contactKey(closest.pointB));
    }
  }
  reportPairSearch?.(pairTotal, true);
  const reportCandidateOrdering = stageProgressReporter("candidate-ordering", 1, options.onProgress);
  reportCandidateOrdering?.(0, true);
  candidates.sort((a, b) =>
    a.exposedGap - b.exposedGap || a.centreDistance - b.centreDistance ||
    a.patchA - b.patchA || a.patchB - b.patchB);
  reportCandidateOrdering?.(1, true);

  const nodes: InternalStructureNode[] = [];
  const edges: InternalStructureEdge[] = [];
  const nodeKeys = new Map<string, number>();
  const edgeKeys = new Map<string, number>();
  const addNode = (position: Vector3Value): number => {
    const key = `${Math.round(position.x / quantum)},${Math.round(position.y / quantum)},${Math.round(position.z / quantum)}`;
    const existing = nodeKeys.get(key);
    if (existing !== undefined) return existing;
    const id = nodes.length;
    nodes.push({ id, position: { x: position.x, y: position.y, z: position.z }, radius: safeRadius });
    nodeKeys.set(key, id);
    return id;
  };
  const addEdge = (start: number, end: number): number | null => {
    if (start === end) return null;
    const key = start < end ? `${start}:${end}` : `${end}:${start}`;
    const existing = edgeKeys.get(key);
    if (existing !== undefined) return existing;
    const id = edges.length;
    edgeKeys.set(key, id);
    edges.push({ id, start, end, radius: safeRadius });
    return id;
  };

  const chosen: PatchLinkCandidate[] = [];
  const reportTree = stageProgressReporter("tree", 1, options.onProgress);
  reportTree?.(0, true);
  for (const candidate of candidates) {
    if (patchComponents.join(candidate.patchA, candidate.patchB)) chosen.push(candidate);
  }
  const roots = new Map<number, number>();
  for (let index = 0; index < usefulPatches.length; index++) {
    const root = patchComponents.find(index);
    roots.set(root, (roots.get(root) ?? 0) + 1);
  }
  stats.removedIsolatedEdges = Math.max(0, roots.size - 1);

  const chosenKeys = new Set(chosen.map((candidate) => `${candidate.patchA}:${candidate.patchB}`));
  // Keep the exact addNode quantization as a local planning fact, but do not
  // allocate graph nodes until the final chosen order is known. This leaves
  // omitted/required=1 builds byte-identical to the legacy path.
  const contactNodeKeysByPatch = usefulPatches.map(() => new Set<string>());
  const rememberCandidateContacts = (candidate: PatchLinkCandidate): void => {
    contactNodeKeysByPatch[candidate.patchA].add(contactKey(candidate.pointA));
    contactNodeKeysByPatch[candidate.patchB].add(contactKey(candidate.pointB));
  };
  for (const candidate of chosen) rememberCandidateContacts(candidate);

  // Preserve the spanning structure first. Then, in the same deterministic
  // candidate order, spend unused patch-to-patch candidates on deficient
  // patches only when the candidate adds a distinct generator contact node.
  // Target/support-derived edges are intentionally not part of this pass.
  if (requiredContacts > 1) {
    for (const candidate of candidates) {
      if (chosenKeys.has(`${candidate.patchA}:${candidate.patchB}`)) continue;
      const keyA = contactKey(candidate.pointA);
      const keyB = contactKey(candidate.pointB);
      const contributes = (contactNodeKeysByPatch[candidate.patchA].size < requiredContacts
        && !contactNodeKeysByPatch[candidate.patchA].has(keyA))
        || (contactNodeKeysByPatch[candidate.patchB].size < requiredContacts
          && !contactNodeKeysByPatch[candidate.patchB].has(keyB));
      if (!contributes) continue;
      chosen.push(candidate);
      chosenKeys.add(`${candidate.patchA}:${candidate.patchB}`);
      rememberCandidateContacts(candidate);
      if (contactNodeKeysByPatch.every((keys) => keys.size >= requiredContacts)) break;
    }
  }
  let extras = 0;
  for (const candidate of candidates) {
    if (extras >= extraRequested) break;
    const key = `${candidate.patchA}:${candidate.patchB}`;
    if (chosenKeys.has(key)) continue;
    chosen.push(candidate);
    chosenKeys.add(key);
    extras++;
  }
  reportTree?.(1, true);
  for (const candidate of chosen) {
    const pointA = addNode(candidate.pointA);
    const pointB = addNode(candidate.pointB);
    patchContactNodeIds[candidate.patchA].add(pointA);
    patchContactNodeIds[candidate.patchB].add(pointB);
    addEdge(pointA, pointB);
  }

  // This snapshot intentionally stops at the chosen patch-to-patch links.
  // The later red-target connection edges are diagnostic/support-derived
  // routing and must never inflate artwork contact counts.
  stats.dryWebContactFacts = buildTargetedGridContactFacts(
    usefulPatches,
    patchComponents,
    patchContactNodeIds,
  );
  emitContactFloorFacts(buildTargetedGridContactFloorFacts(
    requiredContacts,
    usefulPatches,
    candidateLinkCounts,
    candidateDistinctContactKeys,
    stats.dryWebContactFacts,
  ));

  const centre = hostCentre(host);
  let contactedTargets = 0;
  const reportTargetConnections = stageProgressReporter("target-connections", finalTargets.length, options.onProgress);
  reportTargetConnections?.(0, true);
  let completedTargets = 0;
  for (const { target, sourceTargetIndex } of finalTargets) {
    completedTargets++;
    reportTargetConnections?.(completedTargets);
    const nearbyPoints = target.patchId === undefined
      ? allMaterialPoints
      : patchPointsById.get(target.patchId) ?? allMaterialPoints;
    const nearest = options.useLegacyTargetSelection
      ? legacyNearestMaterialPoint(target.position, nearbyPoints, options.nearestSelectionStats)
      : selectNearestMaterialPoint(target.position, nearbyPoints, options.nearestSelectionStats);
    if (!nearest) {
      targetConnectionFacts.push({
        sourceTargetIndex,
        contactNodeId: null,
        materialNodeId: null,
        edgeId: null,
        status: "unresolved",
      });
      continue;
    }
    const contact = surfaceContact(target, centre, safeRadius, nearest);
    const contactNodeId = addNode(contact);
    const materialNodeId = addNode(nearest);
    const edgeId = addEdge(contactNodeId, materialNodeId);
    targetConnectionFacts.push({
      sourceTargetIndex,
      contactNodeId,
      materialNodeId,
      edgeId,
      status: "connected",
    });
    contactedTargets++;
  }
  reportTargetConnections?.(finalTargets.length, true);
  emitTargetConnectionFacts();

  stats.connectedTargets = roots.size === 1 ? contactedTargets : Math.min(contactedTargets, Math.max(...roots.values()));
  stats.gridNodeCount = nodes.length;
  stats.gridEdgeCount = edges.length;
  options.onProgress?.({ phase: "complete", completed: 1, total: 1 });
  return { kind: "targetedGrid", nodes, edges, stats };
}
