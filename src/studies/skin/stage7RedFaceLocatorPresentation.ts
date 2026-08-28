import {
  dryWebSupportSeparationTriangleKey,
  type DryWebSupportSeparationPresentation,
} from "./dryWebSupportSeparationPresentation.ts";

/**
 * Stage 7's diagnostic face ID is deliberately not a Surface Pattern patch
 * ID. It is the zero-based ordinal in the current exact post-Dry-Web
 * `afterDangerPositions` buffer. That buffer is already ordered by the exact
 * diagnosis result, so the ID can be reconstructed without changing the
 * worker protocol or persisting another identifier.
 */
export type Stage7RedFaceLocatorState = "missing" | "running" | "stale" | "current";

export interface Stage7RedFaceLocatorInput {
  /** The caller's canonical post-Dry-Web exact-result boundary. */
  readonly current: boolean;
  /** True while the existing Dry Web graph or exact recheck is running. */
  readonly running: boolean;
  /** True when a prior result exists but no longer passes that boundary. */
  readonly stale: boolean;
  readonly separation: DryWebSupportSeparationPresentation | null;
  /** Current exact result ordering, not a newly generated or reclassified mesh. */
  readonly afterDangerPositions: Float32Array | null;
}

export interface Stage7RedFaceLocatorPresentation {
  readonly state: Stage7RedFaceLocatorState;
  /** True only when a current exact result has at least one red face. */
  readonly enabled: boolean;
  readonly count: number;
  /** Zero-based ordinals in `afterDangerPositions`; never patch IDs. */
  readonly faceIds: readonly number[];
  /** Independent red-face position copy for the presentation layer. */
  readonly redPositions: Float32Array;
  readonly status: string;
}

export interface Stage7RedFaceLocatorOverlayPolicy {
  readonly mode: "normal" | "red-only";
  readonly dimNonRed: boolean;
  /** The renderer must remove its presentation group when this is true. */
  readonly clearOverlay: boolean;
}

const EMPTY_POSITIONS = (): Float32Array => new Float32Array(0);
const MAX_STATUS_FACE_IDS = 12;
const RED_FACE_LOCATOR_MARKER_MIN_RADIUS = 0.11;
const RED_FACE_LOCATOR_MARKER_MAX_RADIUS = 0.36;
const RED_FACE_LOCATOR_MARKER_EXTENT_RATIO = 0.035;

function isFiniteTriangleBuffer(value: Float32Array | null): value is Float32Array {
  if (!value || value.length % 9 !== 0) return false;
  for (let index = 0; index < value.length; index++) {
    if (!Number.isFinite(value[index])) return false;
  }
  return true;
}

/**
 * Return one centroid per exact red triangle, preserving the source order.
 * This is a display-only copy: it never edits the diagnosis buffer and
 * malformed/non-finite input fails closed to an empty marker list.
 */
export function stage7RedFaceLocatorFaceCentroids(
  redPositions: Float32Array | null,
): Float32Array {
  if (!isFiniteTriangleBuffer(redPositions)) return EMPTY_POSITIONS();
  const centroids = new Float32Array(redPositions.length / 3);
  for (let offset = 0, output = 0; offset < redPositions.length; offset += 9) {
    centroids[output++] = (redPositions[offset] + redPositions[offset + 3] + redPositions[offset + 6]) / 3;
    centroids[output++] = (redPositions[offset + 1] + redPositions[offset + 4] + redPositions[offset + 7]) / 3;
    centroids[output++] = (redPositions[offset + 2] + redPositions[offset + 5] + redPositions[offset + 8]) / 3;
  }
  return centroids;
}

/**
 * Derive a deterministic glyph radius from the current base mesh bounds.
 * The clamp keeps small faces findable without assigning geometric meaning
 * to the marker; invalid or degenerate bounds fail closed.
 */
export function stage7RedFaceLocatorMarkerRadius(
  basePositions: Float32Array | null,
): number {
  if (!basePositions || basePositions.length === 0 || basePositions.length % 3 !== 0) return 0;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let offset = 0; offset < basePositions.length; offset += 3) {
    const x = basePositions[offset];
    const y = basePositions[offset + 1];
    const z = basePositions[offset + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  if (!(extent > 0) || !Number.isFinite(extent)) return 0;
  return Math.min(
    RED_FACE_LOCATOR_MARKER_MAX_RADIUS,
    Math.max(RED_FACE_LOCATOR_MARKER_MIN_RADIUS, extent * RED_FACE_LOCATOR_MARKER_EXTENT_RATIO),
  );
}

function emptyPresentation(
  state: Exclude<Stage7RedFaceLocatorState, "current">,
  status: string,
): Stage7RedFaceLocatorPresentation {
  return {
    state,
    enabled: false,
    count: 0,
    faceIds: [],
    redPositions: EMPTY_POSITIONS(),
    status,
  };
}

function currentStatus(faceIds: readonly number[]): string {
  if (faceIds.length === 0) return "赤 0面 / 診断face ID なし";
  const shown = faceIds.slice(0, MAX_STATUS_FACE_IDS).join(", ");
  const suffix = faceIds.length > MAX_STATUS_FACE_IDS ? " …" : "";
  return `赤 ${faceIds.length.toLocaleString()}面 / 診断face ID ${shown}${suffix}`;
}

/**
 * Reconstruct red-face ordinals from the exact result ordering. Matching is
 * multiset-based so repeated triangle values remain deterministic; a missing
 * or extra red triangle fails closed instead of inventing an ID.
 */
export function createStage7RedFaceLocatorPresentation(
  input: Stage7RedFaceLocatorInput,
): Stage7RedFaceLocatorPresentation {
  if (input.running) {
    return emptyPresentation("running", "Dry Web付加後Surfaceを再診断中です。赤面の診断face IDは表示しません。");
  }
  if (input.stale) {
    return emptyPresentation("stale", "Dry Web付加後の支持分離が古くなっています。赤面の診断face IDは表示しません。");
  }
  if (!input.current) {
    return emptyPresentation("missing", "Dry Web付加後の支持分離が未確認です。赤面の診断face IDは表示しません。");
  }
  const separation = input.separation;
  if (separation?.state !== "current"
    || !isFiniteTriangleBuffer(input.afterDangerPositions)
    || !isFiniteTriangleBuffer(separation.unresolvedPositions)
    || !Number.isInteger(separation.unresolvedFaceCount)
    || separation.unresolvedFaceCount < 0
    || separation.unresolvedFaceCount !== separation.unresolvedPositions.length / 9) {
    return emptyPresentation("missing", "Dry Web付加後の赤面情報を確認できません。診断face IDは表示しません。");
  }

  const unresolvedCounts = new Map<string, number>();
  for (let offset = 0; offset < separation.unresolvedPositions.length; offset += 9) {
    const key = dryWebSupportSeparationTriangleKey(separation.unresolvedPositions, offset);
    unresolvedCounts.set(key, (unresolvedCounts.get(key) ?? 0) + 1);
  }
  const faceIds: number[] = [];
  for (let offset = 0, faceId = 0; offset < input.afterDangerPositions.length; offset += 9, faceId++) {
    const key = dryWebSupportSeparationTriangleKey(input.afterDangerPositions, offset);
    const remaining = unresolvedCounts.get(key) ?? 0;
    if (remaining <= 0) continue;
    faceIds.push(faceId);
    if (remaining === 1) unresolvedCounts.delete(key);
    else unresolvedCounts.set(key, remaining - 1);
  }
  if (faceIds.length !== separation.unresolvedFaceCount || unresolvedCounts.size > 0) {
    return emptyPresentation("missing", "現在のexact赤面と診断情報が一致しません。診断face IDは表示しません。");
  }

  return {
    state: "current",
    enabled: faceIds.length > 0,
    count: faceIds.length,
    faceIds: Object.freeze(faceIds.slice()),
    redPositions: separation.unresolvedPositions.slice(),
    status: currentStatus(faceIds),
  };
}

/** Pure display mapping used by the caller to enforce OFF cleanup. */
export function stage7RedFaceLocatorOverlayPolicy(
  presentation: Stage7RedFaceLocatorPresentation,
  visible: boolean,
): Stage7RedFaceLocatorOverlayPolicy {
  const active = visible && presentation.state === "current" && presentation.enabled;
  return {
    mode: active ? "red-only" : "normal",
    dimNonRed: active,
    clearOverlay: !active,
  };
}
