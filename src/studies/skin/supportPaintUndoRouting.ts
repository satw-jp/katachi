export type SkinUndoOwner = "support-paint" | "shape" | null;

export interface SkinUndoKeyInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  typing: boolean;
  supportPaintEnabled: boolean;
}

export function resolveSkinUndoOwner(input: SkinUndoKeyInput): SkinUndoOwner {
  if (input.typing || input.shiftKey || !(input.ctrlKey || input.metaKey) || input.key.toLowerCase() !== "z") return null;
  return input.supportPaintEnabled ? "support-paint" : "shape";
}

export function canInvokeShapeUndo(supportPaintEnabled: boolean): boolean {
  return !supportPaintEnabled;
}

export interface ExclusiveUndoEvent {
  preventDefault(): void;
  stopPropagation(): void;
  stopImmediatePropagation?(): void;
}

export function invokeExclusiveSupportPaintUndo(event: ExclusiveUndoEvent, undo: () => void): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  undo();
}

export function supportPaintOperationLabel(operationCount: number, sampleCount: number): string {
  return `Paint操作 ${Math.max(0, Math.round(operationCount))} / sample ${Math.max(0, Math.round(sampleCount))}`;
}
