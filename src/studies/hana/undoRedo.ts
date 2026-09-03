export interface HanaUndoRedoSnapshot<T> {
  value: T;
  label: string;
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

/** Authoring-only history. Callers never push derived Field, Mesh, Proxy or diagnostics. */
export class HanaUndoRedo<T> {
  private currentValue: T;
  private readonly undoStack: HanaUndoRedoSnapshot<T>[] = [];
  private readonly redoStack: HanaUndoRedoSnapshot<T>[] = [];
  private readonly maxDepth: number;

  constructor(initialValue: T, maxDepth = 100) {
    this.currentValue = cloneValue(initialValue);
    this.maxDepth = Math.max(1, Math.trunc(maxDepth));
  }

  get current(): T {
    return cloneValue(this.currentValue);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  commit(nextValue: T, label = "authoring edit"): T {
    this.undoStack.push({ value: cloneValue(this.currentValue), label });
    while (this.undoStack.length > this.maxDepth) this.undoStack.shift();
    this.currentValue = cloneValue(nextValue);
    this.redoStack.length = 0;
    return this.current;
  }

  undo(): T | null {
    const previous = this.undoStack.pop();
    if (!previous) return null;
    this.redoStack.push({ value: cloneValue(this.currentValue), label: previous.label });
    this.currentValue = cloneValue(previous.value);
    return this.current;
  }

  redo(): T | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push({ value: cloneValue(this.currentValue), label: next.label });
    this.currentValue = cloneValue(next.value);
    return this.current;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
