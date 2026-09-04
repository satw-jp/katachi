import type { InternalStructureGraph, Vector3Value } from "../voronoi.ts";

/** One accepted Stage 5B surface-to-web route.  The route keeps both ends
 * explicit so a contact can be audited independently from its member count. */
export interface SkinRebuildPermanentReinforcementRoute {
  regionId?: number;
  motifPatchId: number;
  surfaceContact: Vector3Value;
  latticeContact: Vector3Value;
  latticeEdgeIds: number[];
  previewEdgeIds: number[];
  /** True only when this route was selected to avoid a prior web landing for
   * the same Motif. */
  redundant: boolean;
}

export interface SkinRebuildPermanentReinforcementRegionMetricInput {
  complete: boolean;
  surfaceContactCount: number;
  uncoveredSurfaceContactCount: number;
}

export interface SkinRebuildPermanentReinforcementRedundancyMetrics {
  reinforcedRegions: number;
  surfaceContacts: number;
  reinforcementMembers: number;
  partial: number;
  noRoute: number;
  oneContactDependencyCount: number;
  weakMotifCount: number;
  distributedContactMotifCount: number;
  disconnectedComponentCount: number;
  minimumStrutDiameterMm: number;
}

export interface SkinRebuildPermanentReinforcementRedundancyInput {
  beforeGraph: InternalStructureGraph;
  afterGraph: InternalStructureGraph;
  reinforcementGraph: InternalStructureGraph;
  motifPatchIds: readonly number[];
  routes: readonly SkinRebuildPermanentReinforcementRoute[];
  regions: readonly SkinRebuildPermanentReinforcementRegionMetricInput[];
  surfaceSampleCount: number;
  minimumStrutDiameterMm: number;
}

export interface SkinRebuildPermanentReinforcementRedundancyReport {
  before: SkinRebuildPermanentReinforcementRedundancyMetrics;
  after: SkinRebuildPermanentReinforcementRedundancyMetrics;
  redundantRouteCount: number;
  redundantEdgeIds: number[];
  redundantPreviewEdgeIds: number[];
  singlePointDependencyPreviewEdgeIds: number[];
}

function finiteGraphStats(graph: InternalStructureGraph): boolean {
  if (!graph || typeof graph !== "object" || !graph.stats || typeof graph.stats !== "object") return false;
  return Object.values(graph.stats).every((value) => value === undefined || Number.isFinite(value));
}

function finiteVector(point: Vector3Value): boolean {
  return Boolean(point && typeof point === "object")
    && [point.x, point.y, point.z].every(Number.isFinite);
}

function positionKey(point: Vector3Value): string {
  return `${point.x.toPrecision(16)},${point.y.toPrecision(16)},${point.z.toPrecision(16)}`;
}

function graphComponentCount(graph: InternalStructureGraph): number {
  if (graph.nodes.length === 0) return 0;
  const parent = Int32Array.from({ length: graph.nodes.length }, (_, index) => index);
  const find = (value: number): number => {
    let root = value;
    while (parent[root] !== root) root = parent[root];
    while (parent[value] !== value) {
      const next = parent[value];
      parent[value] = root;
      value = next;
    }
    return root;
  };
  for (const edge of graph.edges) {
    if (edge.start < 0 || edge.end < 0 || edge.start >= parent.length || edge.end >= parent.length) continue;
    const first = find(edge.start);
    const second = find(edge.end);
    if (first !== second) parent[Math.max(first, second)] = Math.min(first, second);
  }
  return new Set(parent.map((_, index) => find(index))).size;
}

function graphEdgeIdsForRoutes(routes: readonly SkinRebuildPermanentReinforcementRoute[]): Set<number> {
  return new Set(routes.flatMap((route) => route.latticeEdgeIds.filter(Number.isInteger)));
}

function previewEdgeIdsForLatticeEdges(
  lattice: InternalStructureGraph,
  preview: InternalStructureGraph,
  latticeEdgeIds: ReadonlySet<number>,
): number[] {
  const endpointKeys = new Set(
    [...latticeEdgeIds].flatMap((edgeId) => {
      const edge = lattice.edges.find((candidate) => candidate.id === edgeId);
      const start = edge ? lattice.nodes[edge.start]?.position : undefined;
      const end = edge ? lattice.nodes[edge.end]?.position : undefined;
      return start && end ? [`${positionKey(start)}|${positionKey(end)}`, `${positionKey(end)}|${positionKey(start)}`] : [];
    }),
  );
  return preview.edges
    .filter((edge) => {
      const start = preview.nodes[edge.start]?.position;
      const end = preview.nodes[edge.end]?.position;
      if (!start || !end) return false;
      return endpointKeys.has(`${positionKey(start)}|${positionKey(end)}`)
        || endpointKeys.has(`${positionKey(end)}|${positionKey(start)}`);
    })
    .map((edge) => edge.id)
    .sort((first, second) => first - second);
}

function motifContactCounts(
  motifPatchIds: readonly number[],
  routes: readonly SkinRebuildPermanentReinforcementRoute[],
): Map<number, { surfaces: Set<string>; landings: Set<string> }> {
  const counts = new Map<number, { surfaces: Set<string>; landings: Set<string> }>(
    [...new Set(motifPatchIds)].map((patchId) => [patchId, { surfaces: new Set(), landings: new Set() }]),
  );
  for (const route of routes) {
    if (!Number.isInteger(route.motifPatchId)) continue;
    const count = counts.get(route.motifPatchId) ?? { surfaces: new Set(), landings: new Set() };
    count.surfaces.add(positionKey(route.surfaceContact));
    count.landings.add(positionKey(route.latticeContact));
    counts.set(route.motifPatchId, count);
  }
  return counts;
}

function metricsFor(
  graph: InternalStructureGraph,
  motifPatchIds: readonly number[],
  routes: readonly SkinRebuildPermanentReinforcementRoute[],
  regions: readonly SkinRebuildPermanentReinforcementRegionMetricInput[],
  surfaceSampleCount: number,
  minimumStrutDiameterMm: number,
): SkinRebuildPermanentReinforcementRedundancyMetrics {
  const contacts = new Set(routes.map((route) => positionKey(route.surfaceContact)));
  const routeEdgeIds = graphEdgeIdsForRoutes(routes);
  const motifCounts = motifContactCounts(motifPatchIds, routes);
  let oneContactDependencyCount = 0;
  let weakMotifCount = 0;
  let distributedContactMotifCount = 0;
  for (const { surfaces, landings } of motifCounts.values()) {
    if (surfaces.size === 1) oneContactDependencyCount++;
    if (surfaces.size <= 2) weakMotifCount++;
    if (surfaces.size >= 3 && landings.size >= 3) distributedContactMotifCount++;
  }
  const routedRegionIds = new Set(
    routes.map((route) => route.regionId).filter((regionId): regionId is number => Number.isInteger(regionId)),
  );
  const reinforcedRegions = routedRegionIds.size > 0
    ? routedRegionIds.size
    : regions.filter((region) => region.surfaceContactCount > 0).length;
  const partial = regions.filter((region) => !region.complete).length;
  return {
    reinforcedRegions,
    surfaceContacts: contacts.size,
    reinforcementMembers: routeEdgeIds.size,
    partial,
    noRoute: Math.max(0, Math.floor(surfaceSampleCount) - contacts.size),
    oneContactDependencyCount,
    weakMotifCount,
    distributedContactMotifCount,
    disconnectedComponentCount: graphComponentCount(graph),
    minimumStrutDiameterMm: Number.isFinite(minimumStrutDiameterMm) && minimumStrutDiameterMm > 0
      ? minimumStrutDiameterMm
      : 0,
  };
}

/** Reject malformed worker graph data before it can become a metrics claim or
 * a debug overlay. This is intentionally structural; Base containment remains
 * the authoritative geometric screen in Stage 5B. */
export function isSkinRebuildPermanentReinforcementGraphFinite(
  graph: InternalStructureGraph,
): boolean {
  if (!graph || typeof graph !== "object" || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return false;
  if (graph.kind !== "targetedGrid" && graph.kind !== "voronoiEdge") return false;
  if (!finiteGraphStats(graph)) return false;
  if (!graph.nodes.every((node, index) => node.id === index && node.radius > 0 && Number.isFinite(node.radius) && finiteVector(node.position))) return false;
  return graph.edges.every((edge, index) => edge.id === index
    && edge.start !== edge.end
    && Number.isInteger(edge.start)
    && Number.isInteger(edge.end)
    && edge.start >= 0
    && edge.end >= 0
    && edge.start < graph.nodes.length
    && edge.end < graph.nodes.length
    && edge.radius > 0
    && Number.isFinite(edge.radius));
}

function isPermanentReinforcementRouteFinite(
  route: SkinRebuildPermanentReinforcementRoute,
): boolean {
  return Boolean(route && typeof route === "object")
    && Number.isInteger(route.motifPatchId)
    && (route.regionId === undefined || Number.isInteger(route.regionId))
    && finiteVector(route.surfaceContact)
    && finiteVector(route.latticeContact)
    && Array.isArray(route.latticeEdgeIds)
    && Array.isArray(route.previewEdgeIds)
    && route.latticeEdgeIds.length > 0
    && route.latticeEdgeIds.every((edgeId) => Number.isInteger(edgeId) && edgeId >= 0)
    && route.previewEdgeIds.every((edgeId) => Number.isInteger(edgeId) && edgeId >= 0)
    && typeof route.redundant === "boolean";
}

export function analyzeSkinRebuildPermanentReinforcementRedundancy(
  input: SkinRebuildPermanentReinforcementRedundancyInput,
): SkinRebuildPermanentReinforcementRedundancyReport {
  if (!input || typeof input !== "object"
    || !Array.isArray(input.motifPatchIds)
    || !input.motifPatchIds.every((patchId) => Number.isInteger(patchId))
    || !Array.isArray(input.routes)
    || !Array.isArray(input.regions)
    || !input.regions.every((region) => Boolean(region && typeof region === "object")
      && typeof region.complete === "boolean"
      && Number.isFinite(region.surfaceContactCount)
      && Number.isFinite(region.uncoveredSurfaceContactCount)
      && region.surfaceContactCount >= 0
      && region.uncoveredSurfaceContactCount >= 0)
    || !Number.isSafeInteger(input.surfaceSampleCount)
    || input.surfaceSampleCount < 0
    || !Number.isFinite(input.minimumStrutDiameterMm)
    || input.minimumStrutDiameterMm <= 0) {
    throw new Error("Stage 5B redundancy input contains invalid or non-finite data");
  }
  if (!isSkinRebuildPermanentReinforcementGraphFinite(input.beforeGraph)
    || !isSkinRebuildPermanentReinforcementGraphFinite(input.afterGraph)
    || !isSkinRebuildPermanentReinforcementGraphFinite(input.reinforcementGraph)) {
    throw new Error("Stage 5B redundancy graph contains invalid or non-finite data");
  }
  if (!input.routes.every(isPermanentReinforcementRouteFinite)) {
    throw new Error("Stage 5B redundancy route contains invalid or non-finite data");
  }
  const afterEdgeIds = new Set(input.afterGraph.edges.map((edge) => edge.id));
  if (input.routes.some((route) => route.latticeEdgeIds.some((edgeId: number) => !afterEdgeIds.has(edgeId)))) {
    throw new Error("Stage 5B redundancy route references an edge absent from the after graph");
  }
  const baseRoutes = input.routes.filter((route) => !route.redundant);
  const allRoutes = [...input.routes];
  const before = metricsFor(
    input.beforeGraph,
    input.motifPatchIds,
    baseRoutes,
    input.regions,
    input.surfaceSampleCount,
    input.minimumStrutDiameterMm,
  );
  const after = metricsFor(
    input.afterGraph,
    input.motifPatchIds,
    allRoutes,
    input.regions,
    input.surfaceSampleCount,
    input.minimumStrutDiameterMm,
  );
  const redundantRoutes = input.routes.filter((route) => route.redundant);
  const redundantEdgeIds = [...graphEdgeIdsForRoutes(redundantRoutes)].sort((first, second) => first - second);
  const redundantPreviewEdgeIds = previewEdgeIdsForLatticeEdges(
    input.afterGraph,
    input.reinforcementGraph,
    new Set(redundantEdgeIds),
  );
  const afterMotifCounts = motifContactCounts(input.motifPatchIds, allRoutes);
  const singlePointMotifIds = new Set(
    [...afterMotifCounts.entries()]
      .filter(([, count]) => count.surfaces.size === 1)
      .map(([patchId]) => patchId),
  );
  const singlePointDependencyEdgeIds = graphEdgeIdsForRoutes(
    input.routes.filter((route) => singlePointMotifIds.has(route.motifPatchId)),
  );
  return {
    before,
    after,
    redundantRouteCount: redundantRoutes.length,
    redundantEdgeIds,
    redundantPreviewEdgeIds,
    singlePointDependencyPreviewEdgeIds: previewEdgeIdsForLatticeEdges(
      input.afterGraph,
      input.reinforcementGraph,
      singlePointDependencyEdgeIds,
    ),
  };
}
