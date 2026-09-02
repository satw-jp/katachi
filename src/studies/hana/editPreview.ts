import type { HanaStroke3D } from "./stroke3d.ts";

/** Presentation-only control budget for Mouse Edit. Authoritative controls are never reduced. */
export const HANA_MOUSE_EDIT_PREVIEW_MAX_CONTROLS = 128;

function previewControlIndices(count: number, maxControls: number): number[] {
  if (count <= maxControls) return Array.from({ length: count }, (_, index) => index);
  const previewCount = Math.max(2, maxControls);
  return Array.from({ length: previewCount }, (_, index) => Math.round(
    index * (count - 1) / (previewCount - 1),
  ));
}

/**
 * Makes a bounded, deterministic display copy of an edited Stroke3D.
 * Positions and provenance are copied from the current Control Stroke; the
 * returned object is never part of the document or the authoritative edit.
 */
export function createBoundedStrokePreview(
  stroke: HanaStroke3D,
  maxControls = HANA_MOUSE_EDIT_PREVIEW_MAX_CONTROLS,
): HanaStroke3D {
  const indices = previewControlIndices(
    stroke.controlPoints.length,
    Number.isFinite(maxControls) ? Math.floor(maxControls) : HANA_MOUSE_EDIT_PREVIEW_MAX_CONTROLS,
  );
  return {
    ...stroke,
    curve: { ...stroke.curve },
    controlPoints: indices.map((index) => {
      const point = stroke.controlPoints[index];
      return {
        ...point,
        position: { ...point.position },
        provenance: { ...point.provenance },
      };
    }),
  };
}
