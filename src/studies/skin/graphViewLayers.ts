/**
 * Presentation-only registry for the SKIN GRAPH view.
 *
 * These layers deliberately keep their source graphs separate.  The registry
 * is only a view contract: it never merges, regenerates, persists, or edits a
 * graph.  A layer can therefore be extended later without changing the
 * authoring or export graph contracts.
 */

export const SKIN_GRAPH_LAYER_IDS = [
  "surface",
  "internal",
  "reinforcement",
  "dryWeb",
  "removableSupport",
] as const;

export type SkinGraphLayerId = (typeof SKIN_GRAPH_LAYER_IDS)[number];

export interface GraphViewPosition {
  x: number;
  y: number;
  z: number;
}

export type GraphViewNodeRole = "major" | "terminal" | "contact";
export type GraphViewEdgeRole = "edge" | "contact";

export interface GraphViewNode {
  id: string;
  position: GraphViewPosition;
  radius: number;
  role: GraphViewNodeRole;
  label?: string;
}

export interface GraphViewEdge {
  id: string;
  start: string;
  end: string;
  radius: number;
  role: GraphViewEdgeRole;
}

export interface GraphViewGraph {
  nodes: GraphViewNode[];
  edges: GraphViewEdge[];
}

export interface GraphLayer {
  id: SkinGraphLayerId;
  label: string;
  provenance: string;
  graph: GraphViewGraph | null;
  editable: false;
  visibility: boolean;
}

export interface GraphViewOptions {
  nodes: boolean;
  edges: boolean;
  contacts: boolean;
  provenance: boolean;
}

export const DEFAULT_GRAPH_VIEW_OPTIONS: GraphViewOptions = {
  nodes: true,
  edges: true,
  contacts: true,
  provenance: false,
};

export function createGraphLayer(
  id: SkinGraphLayerId,
  label: string,
  provenance: string,
  graph: GraphViewGraph | null,
  visibility = true,
): GraphLayer {
  return { id, label, provenance, graph, editable: false, visibility };
}

export function graphLayerIsGenerated(layer: GraphLayer): boolean {
  return layer.graph !== null;
}

export function graphLayerAvailability(layer: GraphLayer): "generated" | "not-generated" {
  return graphLayerIsGenerated(layer) ? "generated" : "not-generated";
}

export function graphViewLayerIds(): readonly SkinGraphLayerId[] {
  return SKIN_GRAPH_LAYER_IDS;
}
