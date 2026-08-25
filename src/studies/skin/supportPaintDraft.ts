import { validateSupportPaint, type SupportPaintMode, type SupportPaintV1 } from "./supportPaint.ts";
import { validateSkinEditorViewDraft, type SkinEditorViewDraftV1 } from "./multiViewport.ts";

export const SUPPORT_PAINT_DRAFT_SCHEMA = "katachi.skin.support-paint-draft.v1" as const;

export interface SupportPaintDraftV1 {
  schema: typeof SUPPORT_PAINT_DRAFT_SCHEMA;
  savedAt: string;
  recipeSha256: string;
  seed: string;
  targetLongestMm: number;
  supportPaint: SupportPaintV1;
  brush: {
    mode: SupportPaintMode;
    radiusMm: number;
    paintBackfaces: boolean;
  };
  /** Editing-only viewport state. It is intentionally absent from Shape
   * Recipe, Print Profile, validation and 3MF. Older drafts omit it. */
  editorView?: SkinEditorViewDraftV1;
  printApproval: false;
}

export interface SupportPaintDraftBinding {
  recipeSha256: string;
  seed: string;
  targetLongestMm?: number;
}

function sha256(value: unknown): string {
  const text = String(value ?? "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(text)) throw new Error("Support Paint draft recipe SHA-256 is invalid");
  return text;
}

function finitePositive(value: unknown, label: string): number {
  const number = Number(value);
  if (!(Number.isFinite(number) && number > 0)) throw new Error(label + " must be positive");
  return number;
}

export function validateSupportPaintDraft(value: unknown): SupportPaintDraftV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Support Paint draft must be an object");
  const root = value as Record<string, unknown>;
  if (root.schema !== SUPPORT_PAINT_DRAFT_SCHEMA) throw new Error("Support Paint draft schema is invalid");
  if (root.printApproval !== false) throw new Error("Support Paint draft must keep printApproval=false");
  const savedAt = String(root.savedAt ?? "");
  if (!savedAt || !Number.isFinite(Date.parse(savedAt))) throw new Error("Support Paint draft savedAt is invalid");
  const seed = String(root.seed ?? "");
  if (!seed) throw new Error("Support Paint draft Seed is missing");
  if (!root.brush || typeof root.brush !== "object" || Array.isArray(root.brush)) throw new Error("Support Paint draft brush is invalid");
  const brush = root.brush as Record<string, unknown>;
  if (brush.mode !== "inside" && brush.mode !== "outside" && brush.mode !== "auto") throw new Error("Support Paint draft brush mode is invalid");
  if (typeof brush.paintBackfaces !== "boolean") throw new Error("Support Paint draft paintBackfaces is invalid");
  return {
    schema: SUPPORT_PAINT_DRAFT_SCHEMA,
    savedAt: new Date(savedAt).toISOString(),
    recipeSha256: sha256(root.recipeSha256),
    seed,
    targetLongestMm: finitePositive(root.targetLongestMm, "Support Paint draft targetLongestMm"),
    supportPaint: validateSupportPaint(root.supportPaint),
    brush: {
      mode: brush.mode,
      radiusMm: finitePositive(brush.radiusMm, "Support Paint draft brush radius"),
      paintBackfaces: brush.paintBackfaces,
    },
    ...(root.editorView === undefined ? {} : { editorView: validateSkinEditorViewDraft(root.editorView) }),
    printApproval: false,
  };
}

export function createSupportPaintDraft(input: {
  savedAt?: string;
  recipeSha256: string;
  seed: string;
  targetLongestMm: number;
  supportPaint: SupportPaintV1;
  brush: SupportPaintDraftV1["brush"];
  editorView?: SkinEditorViewDraftV1;
}): SupportPaintDraftV1 {
  return validateSupportPaintDraft({
    schema: SUPPORT_PAINT_DRAFT_SCHEMA,
    savedAt: input.savedAt ?? new Date().toISOString(),
    recipeSha256: input.recipeSha256,
    seed: input.seed,
    targetLongestMm: input.targetLongestMm,
    supportPaint: input.supportPaint,
    brush: input.brush,
    editorView: input.editorView,
    printApproval: false,
  });
}

export function assertSupportPaintDraftBinding(
  draft: SupportPaintDraftV1,
  binding: SupportPaintDraftBinding,
): void {
  const validated = validateSupportPaintDraft(draft);
  const recipeSha256 = sha256(binding.recipeSha256);
  if (validated.recipeSha256 !== recipeSha256) throw new Error("Support Paint draft recipe SHA-256 does not match the loaded Shape Recipe");
  if (validated.seed !== binding.seed) throw new Error("Support Paint draft Seed does not match the loaded Shape Recipe");
  if (binding.targetLongestMm !== undefined && Math.abs(validated.targetLongestMm - binding.targetLongestMm) > 1e-6) {
    throw new Error("Support Paint draft target size does not match the current shape");
  }
}

export function supportPaintDraftStorageKey(binding: SupportPaintDraftBinding): string {
  return SUPPORT_PAINT_DRAFT_SCHEMA + ":" + sha256(binding.recipeSha256) + ":" + encodeURIComponent(binding.seed);
}

export function serializeSupportPaintDraft(draft: SupportPaintDraftV1): string {
  return JSON.stringify(validateSupportPaintDraft(draft), null, 2) + "\n";
}
