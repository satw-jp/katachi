import {
  validateSkinEditorLayoutDraft,
  type SkinEditorLayoutDraftV1,
} from "./editorLayout.ts";

export const SKIN_EDITOR_VIEW_SCHEMA = "katachi.skin.editor-view.v1" as const;

export const SKIN_VIEW_DIRECTIONS = [
  "top", "bottom", "front", "back", "right", "left", "axome",
] as const;

export type SkinViewDirection = typeof SKIN_VIEW_DIRECTIONS[number];
export type SkinViewportMode = "one" | "four";

export const SKIN_VIEW_MENU_ITEMS = [...SKIN_VIEW_DIRECTIONS, "reset"] as const;

export function toggleSkinViewportMode(mode: SkinViewportMode): SkinViewportMode {
  return mode === "four" ? "one" : "four";
}

export interface SkinViewportCameraPose {
  position: [number, number, number];
  up: [number, number, number];
  target: [number, number, number];
  zoom: number;
}

export interface SkinEditorViewDraftV1 {
  schema: typeof SKIN_EDITOR_VIEW_SCHEMA;
  mode: SkinViewportMode;
  selectedViewport: number;
  viewports: Array<{
    direction: SkinViewDirection;
    camera: SkinViewportCameraPose;
  }>;
  /** Editor-only chrome. Never copied into Recipe, Print Profile, or 3MF. */
  layout?: SkinEditorLayoutDraftV1;
}

export interface SkinViewportRect {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_SKIN_VIEW_DIRECTIONS: readonly SkinViewDirection[] = [
  "top", "axome", "front", "right",
];

const DIRECTION_LABELS: Record<SkinViewDirection, string> = {
  top: "Top",
  bottom: "Bottom",
  front: "Front",
  back: "Back",
  right: "Right",
  left: "Left",
  axome: "Axome",
};

const DIRECTION_AXIS_LEGENDS: Record<SkinViewDirection, string> = {
  top: "+X →  +Y ↑",
  bottom: "−X →  +Y ↑",
  front: "+X →  +Z ↑",
  back: "−X →  +Z ↑",
  right: "+Y →  +Z ↑",
  left: "−Y →  +Z ↑",
  axome: "X / Y / Z",
};

export function skinViewDirectionLabel(direction: SkinViewDirection): string {
  return DIRECTION_LABELS[direction];
}

export function skinViewAxisLegend(direction: SkinViewDirection): string {
  return DIRECTION_AXIS_LEGENDS[direction];
}

export function skinViewportRects(
  width: number,
  height: number,
  mode: SkinViewportMode,
  selectedViewport: number,
  split: { x: number; y: number } = { x: 0.5, y: 0.5 },
): SkinViewportRect[] {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const selected = Math.max(0, Math.min(3, Math.trunc(selectedViewport)));
  if (mode === "one") return [{ index: selected, x: 0, y: 0, width: safeWidth, height: safeHeight }];
  const splitX = Math.max(0.2, Math.min(0.8, split.x));
  const splitY = Math.max(0.2, Math.min(0.8, split.y));
  const leftWidth = Math.floor(safeWidth * splitX);
  const topHeight = Math.floor(safeHeight * splitY);
  return [
    { index: 0, x: 0, y: 0, width: leftWidth, height: topHeight },
    { index: 1, x: leftWidth, y: 0, width: safeWidth - leftWidth, height: topHeight },
    { index: 2, x: 0, y: topHeight, width: leftWidth, height: safeHeight - topHeight },
    { index: 3, x: leftWidth, y: topHeight, width: safeWidth - leftWidth, height: safeHeight - topHeight },
  ];
}

export function skinViewportAtPoint(
  x: number,
  y: number,
  width: number,
  height: number,
  mode: SkinViewportMode,
  selectedViewport: number,
  split?: { x: number; y: number },
): SkinViewportRect | null {
  return skinViewportRects(width, height, mode, selectedViewport, split).find((rect) => (
    x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
  )) ?? null;
}

function finiteTuple(value: unknown, label: string): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(label + " must contain three coordinates");
  const tuple = value.map(Number);
  if (!tuple.every(Number.isFinite)) throw new Error(label + " must be finite");
  return tuple as [number, number, number];
}

export function validateSkinEditorViewDraft(value: unknown): SkinEditorViewDraftV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("editor view draft must be an object");
  const root = value as Record<string, unknown>;
  if (root.schema !== SKIN_EDITOR_VIEW_SCHEMA) throw new Error("editor view draft schema is invalid");
  if (root.mode !== "one" && root.mode !== "four") throw new Error("editor view mode is invalid");
  const selectedViewport = Number(root.selectedViewport);
  if (!Number.isInteger(selectedViewport) || selectedViewport < 0 || selectedViewport > 3) {
    throw new Error("selected viewport is invalid");
  }
  if (!Array.isArray(root.viewports) || root.viewports.length !== 4) throw new Error("editor view draft must contain four viewports");
  const viewports = root.viewports.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`viewport ${index} is invalid`);
    const row = value as Record<string, unknown>;
    if (!SKIN_VIEW_DIRECTIONS.includes(row.direction as SkinViewDirection)) throw new Error(`viewport ${index} direction is invalid`);
    if (!row.camera || typeof row.camera !== "object" || Array.isArray(row.camera)) throw new Error(`viewport ${index} camera is invalid`);
    const camera = row.camera as Record<string, unknown>;
    const zoom = Number(camera.zoom);
    if (!(Number.isFinite(zoom) && zoom > 0)) throw new Error(`viewport ${index} zoom must be positive`);
    return {
      direction: row.direction as SkinViewDirection,
      camera: {
        position: finiteTuple(camera.position, `viewport ${index} position`),
        up: finiteTuple(camera.up, `viewport ${index} up`),
        target: finiteTuple(camera.target, `viewport ${index} target`),
        zoom,
      },
    };
  });
  const layout = root.layout === undefined ? undefined : validateSkinEditorLayoutDraft(root.layout);
  return { schema: SKIN_EDITOR_VIEW_SCHEMA, mode: root.mode, selectedViewport, viewports, ...(layout ? { layout } : {}) };
}
