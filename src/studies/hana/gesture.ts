export const HANA_GESTURE_FORMAT = "katachi.hana-viewport-gesture.v1a" as const;

export const HANA_VIEW_DIRECTIONS = ["top", "axome", "front", "right"] as const;

export type HanaViewDirection = typeof HANA_VIEW_DIRECTIONS[number];
export type HanaPointerType = "pen" | "mouse" | "touch";
export type HanaViewportMode = "one" | "four";
export type HanaInteractionMode = "draw" | "edit" | "view";

export interface HanaStrokePoint {
  x: number;
  y: number;
  pressure: number;
  time: number;
}

export interface HanaViewportStroke {
  id: string;
  viewportId: string;
  viewDirection: HanaViewDirection;
  pointerType: HanaPointerType;
  viewportSize: {
    width: number;
    height: number;
  };
  points: HanaStrokePoint[];
}

export interface HanaCameraState {
  position: [number, number, number];
  up: [number, number, number];
  target: [number, number, number];
  zoom: number;
}

export interface HanaEditorState {
  viewportMode: HanaViewportMode;
  selectedViewportId: string;
  split: { x: number; y: number };
  viewports: Array<{
    id: string;
    viewDirection: HanaViewDirection;
    interactionMode: HanaInteractionMode;
    camera: HanaCameraState;
  }>;
}

export interface HanaGesturePayload {
  format: typeof HANA_GESTURE_FORMAT;
  rawGesture: {
    strokes: HanaViewportStroke[];
  };
  editorState: HanaEditorState;
}

export interface PressureStats {
  min: number;
  max: number;
  distinct: number;
}

export function pointerTypeFromBrowser(pointerType: string): HanaPointerType {
  if (pointerType === "pen" || pointerType === "touch") return pointerType;
  return "mouse";
}

export function pressureDisplayWidth(pressure: number): number {
  return 1 + Math.min(1, Math.max(0, pressure)) * 9;
}

export function pressureStats(stroke: HanaViewportStroke | null): PressureStats | null {
  if (!stroke || stroke.points.length === 0) return null;
  const pressures = stroke.points.map((point) => point.pressure);
  return {
    min: Math.min(...pressures),
    max: Math.max(...pressures),
    distinct: new Set(pressures).size,
  };
}

function cloneStroke(stroke: HanaViewportStroke): HanaViewportStroke {
  return {
    ...stroke,
    viewportSize: { ...stroke.viewportSize },
    points: stroke.points.map((point) => ({ ...point })),
  };
}

export function createGesturePayload(
  strokes: readonly HanaViewportStroke[],
  editorState: HanaEditorState,
): HanaGesturePayload {
  return {
    format: HANA_GESTURE_FORMAT,
    rawGesture: {
      strokes: strokes.map(cloneStroke),
    },
    editorState: {
      ...editorState,
      split: { ...editorState.split },
      viewports: editorState.viewports.map((viewport) => ({
        ...viewport,
        camera: {
          ...viewport.camera,
          position: [...viewport.camera.position],
          up: [...viewport.camera.up],
          target: [...viewport.camera.target],
        },
      })),
    },
  };
}
