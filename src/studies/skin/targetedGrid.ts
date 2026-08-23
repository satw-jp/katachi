import type { Ball } from "../cloud-sculpt/field.ts";
import type { MotifLowestPoint } from "./motifLowestPoint.ts";
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
  target: MotifLowestPoint,
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

function closestMaterialPair(patchA: Patch, patchB: Patch): Omit<PatchLinkCandidate, "patchA" | "patchB"> | null {
  let best: Omit<PatchLinkCandidate, "patchA" | "patchB"> | null = null;
  for (const pointA of ownPoints(patchA)) {
    for (const pointB of ownPoints(patchB)) {
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
  targets: MotifLowestPoint[],
  supportCount: number,
  radius: number,
): InternalStructureGraph {
  const safeRadius = clamp(Number.isFinite(radius) ? radius : 0.045, 0.005, 1);
  const extraRequested = clamp(Math.round(Number.isFinite(supportCount) ? supportCount : 28), 0, 4000);
  const finalTargets = targets
    .filter((target) => target.basis === "finalMesh")
    .slice()
    .sort((a, b) => a.patchId - b.patchId);
  const usefulPatches = patches.filter((patch) => patch.points.length > 0).slice().sort((a, b) => a.id - b.id);
  const stats: InternalStructureStats = {
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
  if (host.length === 0 || usefulPatches.length === 0 || finalTargets.length === 0) {
    return { kind: "targetedGrid", nodes: [], edges: [], stats };
  }

  // 0.255 source units is kept just below 5 mm for the current 80 mm output.
  // The gate independently measures the exact mm exposure from Surface SDF.
  const maxExposedGap = Math.max(0.255, safeRadius * 4.5);
  const candidates: PatchLinkCandidate[] = [];
  for (let patchA = 0; patchA < usefulPatches.length; patchA++) {
    for (let patchB = patchA + 1; patchB < usefulPatches.length; patchB++) {
      const closest = closestMaterialPair(usefulPatches[patchA], usefulPatches[patchB]);
      if (!closest || closest.exposedGap > maxExposedGap) continue;
      stats.candidateEdges++;
      candidates.push({ patchA, patchB, ...closest });
    }
  }
  candidates.sort((a, b) =>
    a.exposedGap - b.exposedGap || a.centreDistance - b.centreDistance ||
    a.patchA - b.patchA || a.patchB - b.patchB);

  const nodes: InternalStructureNode[] = [];
  const edges: InternalStructureEdge[] = [];
  const nodeKeys = new Map<string, number>();
  const edgeKeys = new Set<string>();
  const quantum = Math.max(safeRadius * 0.05, 1e-6);
  const addNode = (position: Vector3Value): number => {
    const key = `${Math.round(position.x / quantum)},${Math.round(position.y / quantum)},${Math.round(position.z / quantum)}`;
    const existing = nodeKeys.get(key);
    if (existing !== undefined) return existing;
    const id = nodes.length;
    nodes.push({ id, position: { x: position.x, y: position.y, z: position.z }, radius: safeRadius });
    nodeKeys.set(key, id);
    return id;
  };
  const addEdge = (start: number, end: number): boolean => {
    if (start === end) return false;
    const key = start < end ? `${start}:${end}` : `${end}:${start}`;
    if (edgeKeys.has(key)) return false;
    edgeKeys.add(key);
    edges.push({ id: edges.length, start, end, radius: safeRadius });
    return true;
  };

  const patchComponents = new Components(usefulPatches.length);
  const chosen: PatchLinkCandidate[] = [];
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
  let extras = 0;
  for (const candidate of candidates) {
    if (extras >= extraRequested) break;
    const key = `${candidate.patchA}:${candidate.patchB}`;
    if (chosenKeys.has(key)) continue;
    chosen.push(candidate);
    chosenKeys.add(key);
    extras++;
  }
  for (const candidate of chosen) {
    addEdge(addNode(candidate.pointA), addNode(candidate.pointB));
  }

  const patchById = new Map(usefulPatches.map((patch) => [patch.id, patch]));
  const centre = hostCentre(host);
  let contactedTargets = 0;
  for (const target of finalTargets) {
    const patch = patchById.get(target.patchId);
    if (!patch) continue;
    const nearest = ownPoints(patch).slice().sort((a, b) =>
      distance(target.position, a) - a.r - (distance(target.position, b) - b.r))[0];
    if (!nearest) continue;
    const contact = surfaceContact(target, centre, safeRadius, nearest);
    addEdge(addNode(contact), addNode(nearest));
    contactedTargets++;
  }

  stats.connectedTargets = roots.size === 1 ? contactedTargets : Math.min(contactedTargets, Math.max(...roots.values()));
  stats.gridNodeCount = nodes.length;
  stats.gridEdgeCount = edges.length;
  return { kind: "targetedGrid", nodes, edges, stats };
}
