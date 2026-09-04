import type { HanaAuthoringDocument } from "./authoringDocument.ts";
import type { HanaAuthoringGraph } from "./authoringGraph.ts";
import type { HanaFlower } from "./flowerAuthoring.ts";
import { HanaUndoRedo } from "./undoRedo.ts";

/** Semantic authoring state only. Derived geometry, runtime state, and UI navigation stay out. */
export interface HanaAuthoringHistorySnapshot {
  document: HanaAuthoringDocument;
  flowers: HanaFlower[];
  graph: HanaAuthoringGraph;
  activeFlowerId: string | null;
}

/** One history owner for the live HANA authoring session. */
export class HanaAuthoringHistory {
  private history: HanaUndoRedo<HanaAuthoringHistorySnapshot>;
  private readonly maxDepth: number;

  constructor(root: HanaAuthoringHistorySnapshot, maxDepth = 100) {
    this.maxDepth = Math.max(1, Math.trunc(maxDepth));
    this.history = new HanaUndoRedo(root, this.maxDepth);
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  get current(): HanaAuthoringHistorySnapshot {
    return this.history.current;
  }

  commit(next: HanaAuthoringHistorySnapshot, label: string): HanaAuthoringHistorySnapshot {
    return this.history.commit(next, label);
  }

  undo(): HanaAuthoringHistorySnapshot | null {
    return this.history.undo();
  }

  redo(): HanaAuthoringHistorySnapshot | null {
    return this.history.redo();
  }

  reset(root: HanaAuthoringHistorySnapshot): void {
    this.history = new HanaUndoRedo(root, this.maxDepth);
  }
}

/**
 * Last-resort history root when a mutation commits without a session history.
 * Startup, New, Load and Recovery always initialize first, so this only fires
 * if that ordering ever regresses. The root preserves the document namespace
 * (documentId, identity high-water, editor state) but holds no authoring
 * content, so the first Draw keeps its Undo boundary back to empty instead of
 * rooting the session at the post-mutation snapshot.
 */
export function emptyHanaAuthoringHistoryRoot(
  next: HanaAuthoringHistorySnapshot,
): HanaAuthoringHistorySnapshot {
  const root = structuredClone(next);
  root.document.rawGestures = { strokes: [] };
  root.document.strokes = [];
  root.document.selectedStrokeIds = [];
  root.document.activeStrokeId = null;
  root.document.revision = 0;
  root.flowers = [];
  root.graph = { nodes: [], edges: [], revision: 0 };
  root.activeFlowerId = null;
  return root;
}
