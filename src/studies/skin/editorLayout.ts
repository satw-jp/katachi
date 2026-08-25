export const SKIN_EDITOR_LAYOUT_SCHEMA = "katachi.skin.editor-layout.v1" as const;

export interface SkinEditorLayoutDraftV1 {
  schema: typeof SKIN_EDITOR_LAYOUT_SCHEMA;
  leftWidthPx: number;
  rightWidthPx: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  bottomHeightPx: number;
  bottomCollapsed: boolean;
  fourSplitX: number;
  fourSplitY: number;
}

export const DEFAULT_SKIN_EDITOR_LAYOUT: SkinEditorLayoutDraftV1 = {
  schema: SKIN_EDITOR_LAYOUT_SCHEMA,
  leftWidthPx: 292,
  rightWidthPx: 400,
  leftCollapsed: false,
  rightCollapsed: false,
  bottomHeightPx: 58,
  bottomCollapsed: false,
  fourSplitX: 0.5,
  fourSplitY: 0.5,
};

const finite = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function validateSkinEditorLayoutDraft(value: unknown): SkinEditorLayoutDraftV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("editor layout must be an object");
  const root = value as Record<string, unknown>;
  if (root.schema !== SKIN_EDITOR_LAYOUT_SCHEMA) throw new Error("editor layout schema is invalid");
  if (typeof root.leftCollapsed !== "boolean" || typeof root.rightCollapsed !== "boolean") {
    throw new Error("editor pane collapse state is invalid");
  }
  if (root.bottomCollapsed !== undefined && typeof root.bottomCollapsed !== "boolean") {
    throw new Error("editor bottom pane collapse state is invalid");
  }
  return {
    schema: SKIN_EDITOR_LAYOUT_SCHEMA,
    leftWidthPx: clamp(finite(root.leftWidthPx, DEFAULT_SKIN_EDITOR_LAYOUT.leftWidthPx), 180, 640),
    rightWidthPx: clamp(finite(root.rightWidthPx, DEFAULT_SKIN_EDITOR_LAYOUT.rightWidthPx), 280, 760),
    leftCollapsed: root.leftCollapsed,
    rightCollapsed: root.rightCollapsed,
    bottomHeightPx: clamp(finite(root.bottomHeightPx, DEFAULT_SKIN_EDITOR_LAYOUT.bottomHeightPx), 42, 240),
    bottomCollapsed: typeof root.bottomCollapsed === "boolean" ? root.bottomCollapsed : DEFAULT_SKIN_EDITOR_LAYOUT.bottomCollapsed,
    fourSplitX: clamp(finite(root.fourSplitX, 0.5), 0.2, 0.8),
    fourSplitY: clamp(finite(root.fourSplitY, 0.5), 0.2, 0.8),
  };
}

export function fitSkinEditorLayout(
  layout: SkinEditorLayoutDraftV1,
  workspaceWidth: number,
  dividerWidth = 8,
  minimumCenterWidth = 360,
): SkinEditorLayoutDraftV1 {
  const next = validateSkinEditorLayoutDraft(layout);
  const available = Math.max(0, workspaceWidth - dividerWidth * 2 - minimumCenterWidth);
  const wantedLeft = next.leftCollapsed ? 0 : next.leftWidthPx;
  const wantedRight = next.rightCollapsed ? 0 : next.rightWidthPx;
  const wanted = wantedLeft + wantedRight;
  if (wanted <= available || wanted <= 0) return next;
  const scale = available / wanted;
  if (!next.leftCollapsed) next.leftWidthPx = Math.max(180, Math.floor(wantedLeft * scale));
  if (!next.rightCollapsed) next.rightWidthPx = Math.max(280, Math.floor(wantedRight * scale));
  if (next.leftWidthPx + next.rightWidthPx > available) {
    if (!next.rightCollapsed) next.rightCollapsed = true;
    if (!next.leftCollapsed && next.leftWidthPx > available) next.leftCollapsed = true;
  }
  return next;
}

export function resizeSkinEditorPane(
  layout: SkinEditorLayoutDraftV1,
  side: "left" | "right",
  pointerX: number,
  workspaceLeft: number,
  workspaceRight: number,
): SkinEditorLayoutDraftV1 {
  const next = validateSkinEditorLayoutDraft(layout);
  if (side === "left") {
    next.leftCollapsed = false;
    next.leftWidthPx = clamp(pointerX - workspaceLeft, 180, 640);
  } else {
    next.rightCollapsed = false;
    next.rightWidthPx = clamp(workspaceRight - pointerX, 280, 760);
  }
  return next;
}

export function resizeSkinEditorBottomPane(
  layout: SkinEditorLayoutDraftV1,
  pointerY: number,
  workspaceBottom: number,
): SkinEditorLayoutDraftV1 {
  const next = validateSkinEditorLayoutDraft(layout);
  next.bottomCollapsed = false;
  next.bottomHeightPx = clamp(workspaceBottom - pointerY, 42, 240);
  return next;
}
