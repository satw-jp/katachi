import type { Patch } from "../field.ts";
import type { SkinRebuildPatternSide } from "./model.ts";
import type { Vector3Value } from "../voronoi.ts";

export type InteriorClassificationDebugCategory =
  | "inside"
  | "outside"
  | "boundary"
  | "unclassified";

export interface InteriorClassificationDebugMarker {
  readonly patchId: number;
  readonly category: InteriorClassificationDebugCategory;
  readonly position: Vector3Value;
  readonly signedDistance: number | null;
}

export interface InteriorClassificationDebugCounts {
  readonly motifCount: number;
  readonly inside: number;
  readonly outside: number;
  readonly boundary: number;
  readonly ambiguous: number;
  readonly unclassified: number;
}

export interface InteriorClassificationDebugPresentation {
  readonly markers: readonly InteriorClassificationDebugMarker[];
  readonly counts: InteriorClassificationDebugCounts;
}

/**
 * Presentation-only projection of the exact Stage 3 result. This function
 * deliberately does not sample the field or infer a new classification:
 * it only exposes the stored inside/outside/boundary positions and the
 * existing baseSideIsInside verdict. Missing Stage 3 rows remain gray.
 */
export function buildInteriorClassificationDebugPresentation(
  patterns: readonly Patch[],
  patternSides: readonly SkinRebuildPatternSide[],
): InteriorClassificationDebugPresentation {
  const sideByPatch = new Map(patternSides.map((side) => [side.patchId, side] as const));
  const markers: InteriorClassificationDebugMarker[] = [];
  let inside = 0;
  let outside = 0;
  let boundary = 0;
  let ambiguous = 0;
  let unclassified = 0;

  for (const patch of patterns) {
    const side = sideByPatch.get(patch.id);
    if (!side) {
      unclassified++;
      const point = patch.points[0];
      if (point) {
        markers.push({
          patchId: patch.id,
          category: "unclassified",
          position: { x: point.x, y: point.y, z: point.z },
          signedDistance: null,
        });
      }
      continue;
    }

    if (side.baseSideIsInside) {
      markers.push(
        {
          patchId: patch.id,
          category: "inside",
          position: { ...side.insidePosition },
          signedDistance: side.insideSignedDistance,
        },
        {
          patchId: patch.id,
          category: "outside",
          position: { ...side.outsidePosition },
          signedDistance: side.outsideSignedDistance,
        },
      );
      inside++;
      outside++;
    } else {
      ambiguous++;
    }
    markers.push({
      patchId: patch.id,
      category: "boundary",
      position: { ...side.surfacePosition },
      signedDistance: null,
    });
    boundary++;
  }

  return {
    markers,
    counts: {
      motifCount: patterns.length,
      inside,
      outside,
      boundary,
      ambiguous,
      unclassified,
    },
  };
}
