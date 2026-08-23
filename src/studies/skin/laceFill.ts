import type { Ball } from "../cloud-sculpt/field.ts";
import { fieldSdf } from "../cloud-sculpt/field.ts";
import { computeSamplingBounds } from "../cloud-sculpt/meshExport.ts";
import { hashSeed, makeRng } from "../cloud-sculpt/random.ts";
import {
  captureMotifShapeParams,
  freshPatchId,
  generateShapePoints,
  projectToSurface,
  type PackPatchesResult,
  type Patch,
  type Projected,
  type SkinParams,
} from "./field.ts";

type Vec3 = { x: number; y: number; z: number };

export interface LaceFillResult extends PackPatchesResult {
  lacePasses: number;
  laceMotifPlacement: SkinParams["laceMotifPlacement"];
  laceAdded: number;
  laceSmallestRadius: number | null;
  laceLargestRadius: number | null;
}

function fibonacciDirections(count: number, phase: number): Vec3[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, index) => {
    const y = 1 - (2 * (index + 0.5)) / count;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * index + phase * Math.PI * 2;
    return { x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius };
  });
}

function projectOuterRay(
  host: Ball[], hostK: number, center: Vec3, direction: Vec3, outerRadius: number,
): Projected | null {
  let outsideRadius = outerRadius;
  let outsideValue = fieldSdf(
    host, hostK,
    center.x + direction.x * outsideRadius,
    center.y + direction.y * outsideRadius,
    center.z + direction.z * outsideRadius,
  );
  for (let index = 95; index >= 0; index--) {
    const radius = (outerRadius * index) / 96;
    const point = {
      x: center.x + direction.x * radius,
      y: center.y + direction.y * radius,
      z: center.z + direction.z * radius,
    };
    const value = fieldSdf(host, hostK, point.x, point.y, point.z);
    if (outsideValue >= 0 && value <= 0) return projectToSurface(host, hostK, point.x, point.y, point.z, 32);
    outsideRadius = radius;
    outsideValue = value;
  }
  return null;
}

function surfaceClearance(patches: Patch[], point: Vec3): number {
  let clearance = Infinity;
  for (const patch of patches) for (const component of patch.points) {
    clearance = Math.min(
      clearance,
      Math.hypot(point.x - component.x, point.y - component.y, point.z - component.z) - component.r,
    );
  }
  return clearance;
}

/**
 * Adds motifs to the largest remaining surface gaps in several decreasing
 * size bands. The primary organization (random/quad/Voronoi/Goldberg) is
 * left intact; this is a deterministic post-process. Existing and newly
 * realized Patch points are returned explicitly, so recipe replay never
 * repeats this search.
 *
 * This stage deliberately does not globally swell flowers or insert a hidden
 * shell. `laceGap` is the visual rule: positive leaves lace openings,
 * negative allows local overlap. Print strength still needs the downstream
 * connection and partition checks.
 */
export function fillLargestSurfaceGaps(
  host: Ball[], hostK: number, existingPatches: Patch[], params: SkinParams,
): LaceFillResult {
  const patches = existingPatches.map((patch) => ({
    ...patch,
    points: patch.points.map((point) => ({ ...point })),
  }));
  const passes = Math.max(1, Math.min(6, Math.round(params.lacePasses)));
  const laceMotifPlacement = params.laceMotifPlacement ?? "surface";
  const laceParams = { ...params, motifPlacement: laceMotifPlacement };
  const minScale = Math.max(0.2, Math.min(1, params.laceMinScale));
  const candidateCount = Math.max(240, Math.min(4000, Math.round(params.attempts)));
  if (host.length === 0) return emptyResult(patches, passes, laceMotifPlacement);

  const bounds = computeSamplingBounds(host, hostK);
  const center = {
    x: (bounds.min.x + bounds.max.x) * 0.5,
    y: (bounds.min.y + bounds.max.y) * 0.5,
    z: (bounds.min.z + bounds.max.z) * 0.5,
  };
  let added = 0;
  let rejected = 0;
  let smallest = Infinity;
  let largest = 0;

  for (let pass = 0; pass < passes; pass++) {
    const t = passes === 1 ? 0 : pass / (passes - 1);
    const scale = 1 + (minScale - 1) * t;
    const minimumRadius = Math.max(0.012, params.minR * scale);
    const maximumRadius = Math.max(minimumRadius, params.maxR * scale);
    const rng = makeRng(hashSeed(`${params.seed}#lace-${pass}-${patches.length}`));
    const candidates = fibonacciDirections(candidateCount, rng())
      .map((direction, id) => {
        const surface = projectOuterRay(host, hostK, center, direction, bounds.longest * 1.2);
        return surface ? { id, surface, clearance: surfaceClearance(patches, surface) } : null;
      })
      .filter((candidate): candidate is { id: number; surface: Projected; clearance: number } => candidate !== null)
      .sort((a, b) => b.clearance - a.clearance || a.id - b.id);

    for (const candidate of candidates) {
      const available = surfaceClearance(patches, candidate.surface) - params.laceGap;
      const anchorRadius = Math.min(maximumRadius, available);
      if (anchorRadius < minimumRadius) { rejected++; continue; }
      const patchId = freshPatchId();
      const points = generateShapePoints(
        params.patchShape,
        host,
        hostK,
        candidate.surface,
        anchorRadius,
        laceParams,
        makeRng(hashSeed(`${params.seed}#lace-${pass}-${candidate.id}`)),
        patchId,
        patches,
      );
      if (points.length === 0) { rejected++; continue; }
      patches.push({
        id: patchId,
        shape: params.patchShape,
        motifPlacement: laceParams.motifPlacement ?? "surface",
        surfaceCellId: pass * candidateCount + candidate.id,
        surfaceCellKind: "lace",
        motifParams: captureMotifShapeParams(params),
        points,
      });
      added++;
      smallest = Math.min(smallest, anchorRadius);
      largest = Math.max(largest, anchorRadius);
    }
  }

  return {
    patches,
    placed: added,
    triedAndRejected: rejected,
    stoppedEarly: added === 0,
    flowerConnections: 0,
    flowerBridgePoints: 0,
    flowerFusedPatches: 0,
    flowerFusionRadius: 0,
    flowerFusionLocalized: false,
    flowerFusionAdjustedPoints: 0,
    flowerFusionEdgeCount: 0,
    flowerFusionOpenEdges: 0,
    quadConnectionShape: null,
    quadConnectionLocalized: false,
    quadConnectionAdjustedPoints: 0,
    quadConnectionEdgeCount: 0,
    quadConnectionOpenEdges: 0,
    quadConnectionMaxRadius: 0,
    lacePasses: passes,
    laceMotifPlacement,
    laceAdded: added,
    laceSmallestRadius: Number.isFinite(smallest) ? smallest : null,
    laceLargestRadius: added > 0 ? largest : null,
  };
}

function emptyResult(
  patches: Patch[], passes: number, laceMotifPlacement: SkinParams["laceMotifPlacement"],
): LaceFillResult {
  return {
    patches, placed: 0, triedAndRejected: 0, stoppedEarly: true,
    flowerConnections: 0, flowerBridgePoints: 0, flowerFusedPatches: 0, flowerFusionRadius: 0,
    flowerFusionLocalized: false, flowerFusionAdjustedPoints: 0, flowerFusionEdgeCount: 0,
    flowerFusionOpenEdges: 0, quadConnectionShape: null, quadConnectionLocalized: false,
    quadConnectionAdjustedPoints: 0, quadConnectionEdgeCount: 0, quadConnectionOpenEdges: 0,
    quadConnectionMaxRadius: 0, lacePasses: passes, laceMotifPlacement, laceAdded: 0,
    laceSmallestRadius: null, laceLargestRadius: null,
  };
}
