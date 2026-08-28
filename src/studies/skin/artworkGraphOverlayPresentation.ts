import type { ArtworkGraph } from "./artworkGraph.ts";
import type { DryWebArtworkGraphBoundaryStatus } from "./dryWebArtworkGraphBoundary.ts";
import type { Patch, PatchPoint } from "./field.ts";

/** These colors encode only whether the frozen graph snapshot is current. */
export const ARTWORK_GRAPH_CURRENT_MARKER_COLOR = "#19c7b6";
export const ARTWORK_GRAPH_STALE_MARKER_COLOR = "#d9483b";

export type ArtworkGraphOverlayMarkerStatus = "current" | "stale";
export type ArtworkGraphOverlayState = "current" | "stale" | "missing";

export interface ArtworkGraphOverlayPosition {
  x: number;
  y: number;
  z: number;
}

export interface ArtworkGraphOverlayMarker {
  nodeId: string;
  patchId: number;
  position: ArtworkGraphOverlayPosition;
  status: ArtworkGraphOverlayMarkerStatus;
  color: string;
}

export interface ArtworkGraphOverlayPresentation {
  enabled: boolean;
  status: ArtworkGraphOverlayState;
  markers: ArtworkGraphOverlayMarker[];
}

function finitePosition(point: Partial<PatchPoint> | undefined): ArtworkGraphOverlayPosition | null {
  if (
    !point
    || typeof point.x !== "number" || !Number.isFinite(point.x)
    || typeof point.y !== "number" || !Number.isFinite(point.y)
    || typeof point.z !== "number" || !Number.isFinite(point.z)
  ) {
    return null;
  }
  return { x: point.x, y: point.y, z: point.z };
}

function finitePositions(points: readonly (Partial<PatchPoint> | undefined)[]): ArtworkGraphOverlayPosition[] {
  return points
    .map((point) => finitePosition(point))
    .filter((point): point is ArtworkGraphOverlayPosition => point !== null);
}

function centroid(points: readonly ArtworkGraphOverlayPosition[]): ArtworkGraphOverlayPosition {
  if (points.length === 0) return { x: 0, y: 0, z: 0 };
  const sum = points.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y, z: sum.z + point.z }),
    { x: 0, y: 0, z: 0 },
  );
  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
    z: sum.z / points.length,
  };
}

/**
 * Return the stable author/display representative without changing the
 * snapshot. Only a solid coin has a distinguished points[0] anchor. Annular
 * coins and flat rings use their finite shape-point centroid; flower relation
 * bridges/connectors are excluded, and realized ring3d connectors are
 * excluded when ringPrimary metadata exists. Empty or non-finite selections
 * fall back to all finite points, then the origin for malformed legacy data.
 */
export function representativePatchPoint(
  patch: Pick<Patch, "shape" | "motifParams" | "points">,
): ArtworkGraphOverlayPosition {
  const { points } = patch;
  const isSolidCoin = patch.shape === "coin"
    && (patch.motifParams?.coinHoleRatio ?? 0) <= 1e-6;
  if (isSolidCoin) {
    const authorAnchor = finitePosition(points[0]);
    if (authorAnchor) return authorAnchor;
  }

  let shapePoints: readonly PatchPoint[] = points;
  if (patch.shape === "flower") {
    const ownPoints = points.filter((point) => point.role !== "bridge" && point.role !== "surfaceConnector");
    if (ownPoints.length > 0) shapePoints = ownPoints;
  } else if (patch.shape === "ring3d" && points.some((point) => point.ringPrimary !== undefined)) {
    const primaryPoints = points.filter((point) => point.ringPrimary === true);
    if (primaryPoints.length > 0) shapePoints = primaryPoints;
  }

  const selectedFinitePoints = finitePositions(shapePoints);
  if (selectedFinitePoints.length > 0) return centroid(selectedFinitePoints);
  return centroid(finitePositions(points));
}

export function createArtworkGraphOverlayPresentation(
  snapshot: ArtworkGraph | null,
  boundaryStatus: DryWebArtworkGraphBoundaryStatus,
  enabled: boolean,
): ArtworkGraphOverlayPresentation {
  if (!snapshot) return { enabled, status: "missing", markers: [] };

  const status: ArtworkGraphOverlayMarkerStatus = boundaryStatus === "current" ? "current" : "stale";
  const color = status === "current"
    ? ARTWORK_GRAPH_CURRENT_MARKER_COLOR
    : ARTWORK_GRAPH_STALE_MARKER_COLOR;
  const markers = snapshot.surfaceDraft.nodes.map((node) => ({
    nodeId: node.id,
    patchId: node.patch.id,
    position: representativePatchPoint(node.patch),
    status,
    color,
  }));
  return {
    enabled,
    status: boundaryStatus === "current" ? "current" : "stale",
    markers: enabled ? markers : [],
  };
}
