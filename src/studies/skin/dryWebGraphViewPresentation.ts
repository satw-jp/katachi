import type { InternalObservationMode } from "./previewMeshBuffers.ts";
import type { SkinViewMode } from "./renderer.ts";

/** The small, display-only contract exposed by the Stage 4 author panel. */
export interface DryWebGraphViewGraph {
  readonly kind: string;
  readonly nodes: readonly unknown[];
  readonly edges: readonly unknown[];
}

export interface DryWebGraphViewInput {
  /** The frozen preview graph only after the caller has proved it current. */
  readonly graph: DryWebGraphViewGraph | null;
  /** The caller's existing dryWebPreviewIsCurrent() decision. */
  readonly current: boolean;
  /** True while the existing preview/exact-recheck work is running. */
  readonly running: boolean;
  /** A prior preview exists but failed the caller's current-boundary check. */
  readonly stale: boolean;
}

export type DryWebGraphViewState = "missing" | "running" | "stale" | "current";
export type DryWebGraphViewMode = "surface" | "ghostSkin" | "internalOnly";

export interface DryWebGraphViewPresentation {
  state: DryWebGraphViewState;
  nodeCount: number | null;
  edgeCount: number | null;
  buttonsEnabled: boolean;
  reason: string;
}

export interface DryWebGraphViewOption {
  readonly mode: DryWebGraphViewMode;
  readonly label: string;
  readonly viewMode: "beads";
  readonly observationMode: InternalObservationMode;
}

export interface DryWebGraphViewViewportState {
  readonly viewMode: SkinViewMode;
  readonly internalObservationMode: InternalObservationMode;
}

/**
 * Keep the three author actions as a data-only mapping to existing viewport
 * callbacks. No graph, line, mesh, or persistent state is created here.
 */
export const DRY_WEB_GRAPH_VIEW_OPTIONS: readonly DryWebGraphViewOption[] = [
  { mode: "surface", label: "Surface + Dry Web", viewMode: "beads", observationMode: "normal" },
  { mode: "ghostSkin", label: "Surface半透明 + Dry Web", viewMode: "beads", observationMode: "ghostSkin" },
  { mode: "internalOnly", label: "Dry Webだけ", viewMode: "beads", observationMode: "internalOnly" },
];

/**
 * Contact facts are a palette-only refresh. Keep the author's two existing
 * viewport choices unchanged; Stage 4 actions are the only policy allowed to
 * request a mode transition.
 */
export function preserveDryWebGraphViewState(input: DryWebGraphViewViewportState): DryWebGraphViewViewportState {
  return {
    viewMode: input.viewMode,
    internalObservationMode: input.internalObservationMode,
  };
}

/**
 * Exact-recheck completion has the same frozen, display-only state policy as a
 * Dry Web contact refresh: it preserves the author's existing viewport rather
 * than selecting a diagnosis-specific mode.
 */
export function preserveDryWebGraphViewForCompletion(
  input: DryWebGraphViewViewportState,
): DryWebGraphViewViewportState {
  return preserveDryWebGraphViewState(input);
}

/**
 * Present only facts from the already-generated current targeted-grid graph.
 * A stale graph is intentionally represented without its old counts so the
 * panel cannot make it look usable after a Surface edit.
 */
export function createDryWebGraphViewPresentation(
  input: DryWebGraphViewInput,
): DryWebGraphViewPresentation {
  if (input.running) {
    return {
      state: "running",
      nodeCount: null,
      edgeCount: null,
      buttonsEnabled: false,
      reason: "Dry Web生成中です。完了後にcurrent graphを観察できます。",
    };
  }

  const graph = input.graph;
  if (input.current && graph?.kind === "targetedGrid") {
    return {
      state: "current",
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      buttonsEnabled: true,
      reason: "generator facts only。mesh・printabilityは未判定で、Confirmed Artwork Connectionsではありません。",
    };
  }

  if (input.stale) {
    return {
      state: "stale",
      nodeCount: null,
      edgeCount: null,
      buttonsEnabled: false,
      reason: "Surface変更後の旧Dry Web Graphです。Stage 3を再Graph化し、Dry Webを再生成してください。",
    };
  }

  return {
    state: "missing",
    nodeCount: null,
    edgeCount: null,
    buttonsEnabled: false,
    reason: "Dry Web候補Graphは未生成です。先にDry Webを生成してください。",
  };
}
