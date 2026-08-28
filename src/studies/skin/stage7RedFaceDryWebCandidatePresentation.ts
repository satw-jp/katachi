import type { InternalStructureGraph, InternalStructureEdge, Vector3Value } from "./voronoi.ts";
import type { Stage7RedFaceLocatorPresentation } from "./stage7RedFaceLocatorPresentation.ts";
import { stage7RedFaceLocatorFaceCentroids } from "./stage7RedFaceLocatorPresentation.ts";

/** The presentation cap is deliberately small: this preview is a visual
 * bridge, not a generation or reinforcement pass. The canonical red-face
 * order remains the order supplied by Stage 7's exact locator. */
export const STAGE7_RED_FACE_DRY_WEB_CANDIDATE_PREVIEW_LIMIT = 128;

export type Stage7RedFaceDryWebCandidateState = "missing" | "running" | "stale" | "current";

export interface Stage7RedFaceDryWebCandidate {
  readonly faceId: number;
  readonly start: Vector3Value;
  readonly end: Vector3Value;
  readonly edgeId: number;
  readonly edgeOrder: number;
  readonly length: number;
}

export interface Stage7RedFaceDryWebCandidateInput {
  /** True only when the caller's existing current graph/exact guards pass. */
  readonly current: boolean;
  /** Explicit caller-side scope guard; non-targeted graphs are never accepted. */
  readonly targetedGrid: boolean;
  /** True while the current Dry Web or exact recheck is running. */
  readonly running: boolean;
  /** A prior graph/exact result exists but no longer passes current guards. */
  readonly stale: boolean;
  /** Stage 7's canonical current red-face presentation. */
  readonly redFaceLocator: Stage7RedFaceLocatorPresentation | null;
  /** The only graph accepted here is the current targeted-grid graph. */
  readonly graph: InternalStructureGraph | null;
}

export interface Stage7RedFaceDryWebCandidatePresentation {
  readonly state: Stage7RedFaceDryWebCandidateState;
  readonly reason: string;
  readonly enabled: boolean;
  readonly totalRedFaceCount: number;
  readonly previewedCandidateCount: number;
  readonly candidates: readonly Stage7RedFaceDryWebCandidate[];
  /** Independent XYZ line pairs: six values per candidate. */
  readonly linePositions: Float32Array;
  readonly minLength: number | null;
  readonly meanLength: number | null;
  readonly maxLength: number | null;
  readonly previewLimit: number;
  readonly skippedEdgeCount: number;
}

const EMPTY_LINE_POSITIONS = (): Float32Array => new Float32Array(0);

function emptyPresentation(
  state: Exclude<Stage7RedFaceDryWebCandidateState, "current">,
  reason: string,
): Stage7RedFaceDryWebCandidatePresentation {
  return {
    state,
    reason,
    enabled: false,
    totalRedFaceCount: 0,
    previewedCandidateCount: 0,
    candidates: [],
    linePositions: EMPTY_LINE_POSITIONS(),
    minLength: null,
    meanLength: null,
    maxLength: null,
    previewLimit: STAGE7_RED_FACE_DRY_WEB_CANDIDATE_PREVIEW_LIMIT,
    skippedEdgeCount: 0,
  };
}

function isFinitePoint(value: Vector3Value | undefined): value is Vector3Value {
  if (!value) return false;
  return Number.isFinite(value.x)
    && Number.isFinite(value.y)
    && Number.isFinite(value.z);
}

function isValidNode(value: unknown): value is { id: number; position: Vector3Value } {
  if (!value || typeof value !== "object") return false;
  const node = value as { id?: unknown; position?: unknown };
  return Number.isSafeInteger(node.id)
    && isFinitePoint(node.position as Vector3Value | undefined);
}

function isValidEdge(value: unknown): value is InternalStructureEdge {
  if (!value || typeof value !== "object") return false;
  const edge = value as Partial<InternalStructureEdge>;
  const radius = edge.radius;
  return Number.isSafeInteger(edge.id)
    && Number.isSafeInteger(edge.start)
    && Number.isSafeInteger(edge.end)
    && typeof radius === "number"
    && Number.isFinite(radius)
    && radius >= 0;
}

function closestPointOnSegment(
  point: Vector3Value,
  start: Vector3Value,
  end: Vector3Value,
): { point: Vector3Value; distanceSq: number } | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const lengthSq = dx * dx + dy * dy + dz * dz;
  if (!Number.isFinite(lengthSq)) return null;
  const offsetX = point.x - start.x;
  const offsetY = point.y - start.y;
  const offsetZ = point.z - start.z;
  const dot = offsetX * dx + offsetY * dy + offsetZ * dz;
  if (!Number.isFinite(dot)) return null;
  const t = lengthSq > 0 ? Math.max(0, Math.min(1, dot / lengthSq)) : 0;
  if (!Number.isFinite(t)) return null;
  const closest = {
    x: start.x + dx * t,
    y: start.y + dy * t,
    z: start.z + dz * t,
  };
  if (!isFinitePoint(closest)) return null;
  const distanceX = point.x - closest.x;
  const distanceY = point.y - closest.y;
  const distanceZ = point.z - closest.z;
  const distanceSq = distanceX * distanceX + distanceY * distanceY + distanceZ * distanceZ;
  return Number.isFinite(distanceSq) ? { point: closest, distanceSq } : null;
}

function graphNodesById(graph: InternalStructureGraph): Map<number, Vector3Value> | null {
  if (!Array.isArray(graph.nodes)) return null;
  const nodes = new Map<number, Vector3Value>();
  for (const value of graph.nodes) {
    if (!isValidNode(value)) return null;
    if (nodes.has(value.id)) return null;
    nodes.set(value.id, {
      x: value.position.x,
      y: value.position.y,
      z: value.position.z,
    });
  }
  return nodes;
}

function currentReason(
  candidateCount: number,
  totalRedFaceCount: number,
  skippedEdgeCount: number,
): string {
  const previewText = `最近傍edgeへの直線候補preview · preview ${candidateCount} / total ${totalRedFaceCount}`;
  if (skippedEdgeCount > 0) return `${previewText} · ${skippedEdgeCount} edge(s) skipped as unavailable`;
  return previewText;
}

/**
 * Build one deterministic nearest-edge straight-line candidate per current
 * exact red face. This function is presentation-only: it reads the caller's
 * canonical red-face centroids and the current targeted-grid graph, never
 * mutates either, and never creates graph entities or reinforcement geometry.
 */
export function createStage7RedFaceDryWebCandidatePresentation(
  input: Stage7RedFaceDryWebCandidateInput | null,
): Stage7RedFaceDryWebCandidatePresentation {
  if (!input) return emptyPresentation("missing", "current targetedGrid graphとexact赤面がそろっていません。候補線は表示しません。");
  if (input.running) return emptyPresentation("running", "Dry Web生成または付加後exact再診断を実行中です。候補線は表示しません。");
  if (input.stale) return emptyPresentation("stale", "Dry Web graphまたはexact赤面が古くなっています。候補線は表示しません。");
  if (!input.targetedGrid || !input.current || !input.redFaceLocator || input.redFaceLocator.state !== "current") {
    return emptyPresentation("missing", "current targetedGrid graphとexact赤面がそろっていません。候補線は表示しません。");
  }
  if (input.graph?.kind !== "targetedGrid") {
    return emptyPresentation("missing", "current targetedGrid graphがありません。候補線は表示しません。");
  }

  const locator = input.redFaceLocator;
  const redPositions = locator.redPositions as Float32Array | null | undefined;
  const faceIds = locator.faceIds as readonly number[] | null | undefined;
  const centroids = stage7RedFaceLocatorFaceCentroids(redPositions ?? null);
  if (!locator.enabled || locator.count <= 0 || !Number.isInteger(locator.count)
    || !Array.isArray(faceIds)
    || locator.count !== faceIds.length
    || !faceIds.every((faceId) => Number.isSafeInteger(faceId))
    || locator.count !== centroids.length / 3
    || redPositions === null || redPositions === undefined
    || redPositions.length !== locator.count * 9) {
    if (locator.count === 0 && centroids.length === 0 && redPositions?.length === 0) {
      return {
        state: "current",
        reason: "current exact赤面は0面です。最近傍edgeへの直線候補previewはありません。",
        enabled: false,
        totalRedFaceCount: 0,
        previewedCandidateCount: 0,
        candidates: [],
        linePositions: EMPTY_LINE_POSITIONS(),
        minLength: null,
        meanLength: null,
        maxLength: null,
        previewLimit: STAGE7_RED_FACE_DRY_WEB_CANDIDATE_PREVIEW_LIMIT,
        skippedEdgeCount: 0,
      };
    }
    return emptyPresentation("missing", "current exact赤面情報が不正です。候補線は表示しません。");
  }

  const nodes = graphNodesById(input.graph);
  if (!nodes || !Array.isArray(input.graph.edges)) {
    return emptyPresentation("missing", "current targetedGrid graphのnode/edge情報が不正です。候補線は表示しません。");
  }
  const validEdges: Array<{ edge: InternalStructureEdge; order: number; start: Vector3Value; end: Vector3Value }> = [];
  let skippedEdgeCount = 0;
  for (const [order, value] of input.graph.edges.entries()) {
    if (!isValidEdge(value)) {
      skippedEdgeCount++;
      continue;
    }
    const start = nodes.get(value.start);
    const end = nodes.get(value.end);
    if (!start || !end) {
      skippedEdgeCount++;
      continue;
    }
    validEdges.push({ edge: value, order, start, end });
  }
  if (validEdges.length === 0) {
    return emptyPresentation(
      "missing",
      input.graph.edges.length > 0
        ? "current targetedGrid graphに有効なedgeがありません。候補線は表示しません。"
        : "current targetedGrid graphにedgeがありません。候補線は表示しません。",
    );
  }

  const totalRedFaceCount = locator.count;
  const candidates: Stage7RedFaceDryWebCandidate[] = [];
  const lineValues: number[] = [];
  const previewFaceCount = Math.min(totalRedFaceCount, STAGE7_RED_FACE_DRY_WEB_CANDIDATE_PREVIEW_LIMIT);
  for (let faceIndex = 0; faceIndex < previewFaceCount; faceIndex++) {
    const offset = faceIndex * 3;
    const start = {
      x: centroids[offset],
      y: centroids[offset + 1],
      z: centroids[offset + 2],
    };
    if (!isFinitePoint(start)) continue;
    let best: {
      edge: InternalStructureEdge;
      order: number;
      end: Vector3Value;
      distanceSq: number;
    } | null = null;
    for (const valid of validEdges) {
      const closest = closestPointOnSegment(start, valid.start, valid.end);
      if (!closest) {
        skippedEdgeCount++;
        continue;
      }
      if (!best
        || closest.distanceSq < best.distanceSq
        || (closest.distanceSq === best.distanceSq
          && (valid.order < best.order || (valid.order === best.order && valid.edge.id < best.edge.id)))) {
        best = {
          edge: valid.edge,
          order: valid.order,
          end: closest.point,
          distanceSq: closest.distanceSq,
        };
      }
    }
    if (!best) continue;
    const length = Math.sqrt(best.distanceSq);
    if (!Number.isFinite(length)) continue;
    const candidate: Stage7RedFaceDryWebCandidate = {
      faceId: faceIds[faceIndex],
      start: { x: start.x, y: start.y, z: start.z },
      end: { x: best.end.x, y: best.end.y, z: best.end.z },
      edgeId: best.edge.id,
      edgeOrder: best.order,
      length,
    };
    candidates.push(candidate);
    lineValues.push(
      candidate.start.x, candidate.start.y, candidate.start.z,
      candidate.end.x, candidate.end.y, candidate.end.z,
    );
  }

  const linePositions = new Float32Array(lineValues);
  const lengths = candidates.map((candidate) => candidate.length);
  const minLength = lengths.length > 0 ? Math.min(...lengths) : null;
  const maxLength = lengths.length > 0 ? Math.max(...lengths) : null;
  const meanLength = lengths.length > 0
    ? lengths.reduce((total, length) => total + length, 0) / lengths.length
    : null;
  const previewedCandidateCount = candidates.length;
  const reason = currentReason(previewedCandidateCount, totalRedFaceCount, skippedEdgeCount);
  return {
    state: "current",
    reason,
    enabled: previewedCandidateCount > 0,
    totalRedFaceCount,
    previewedCandidateCount,
    candidates: candidates.map((candidate) => ({
      ...candidate,
      start: { ...candidate.start },
      end: { ...candidate.end },
    })),
    linePositions,
    minLength,
    meanLength,
    maxLength,
    previewLimit: STAGE7_RED_FACE_DRY_WEB_CANDIDATE_PREVIEW_LIMIT,
    skippedEdgeCount,
  };
}
