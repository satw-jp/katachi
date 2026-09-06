import type { Bounds, MeshBuildResult } from "../cloud-sculpt/meshExport.ts";
import type { SkinRebuildProject } from "../skin/rebuild/model.ts";
import type { InternalStructureGraph } from "../skin/voronoi.ts";

export interface GraphMetrics {
  nodes: number;
  edges: number;
  junctions: number;
  components: number;
  cycleRank: number;
}

/** Viewer-only summary of the canonical permanent graph. */
export function graphMetrics(graph: InternalStructureGraph): GraphMetrics {
  const parent = Int32Array.from({ length: graph.nodes.length }, (_, index) => index);
  const degree = new Uint32Array(graph.nodes.length);

  const find = (value: number): number => {
    let root = value;
    while (parent[root] !== root) root = parent[root];
    while (parent[value] !== value) {
      const next = parent[value];
      parent[value] = root;
      value = next;
    }
    return root;
  };
  const union = (left: number, right: number): void => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
  };

  for (const edge of graph.edges) {
    if (edge.start < 0 || edge.start >= graph.nodes.length || edge.end < 0 || edge.end >= graph.nodes.length) continue;
    degree[edge.start]++;
    degree[edge.end]++;
    union(edge.start, edge.end);
  }

  const roots = new Set<number>();
  for (let index = 0; index < graph.nodes.length; index++) roots.add(find(index));
  const components = roots.size;
  return {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    junctions: [...degree].filter((value) => value >= 3).length,
    components,
    cycleRank: graph.edges.length - graph.nodes.length + components,
  };
}

/** Keep the representation boundary explicit: finalGraph is the Permanent
 * Artwork Structure; project.printSupport is a separate removable graph. */
export function permanentGraphOnly(project: Pick<SkinRebuildProject, "finalGraph">): InternalStructureGraph {
  return project.finalGraph;
}

export interface SurfaceSummary {
  triangles: number;
  bounds: { x: number; y: number; z: number };
}

export function surfaceSummary(mesh: MeshBuildResult): SurfaceSummary {
  return {
    triangles: mesh.triangles.length,
    bounds: {
      x: mesh.sourceBounds.size.x,
      y: mesh.sourceBounds.size.y,
      z: mesh.sourceBounds.size.z,
    },
  };
}

export function sourceBoundsCenter(bounds: Bounds): { x: number; y: number; z: number } {
  return {
    x: (bounds.min.x + bounds.max.x) * 0.5,
    y: (bounds.min.y + bounds.max.y) * 0.5,
    z: (bounds.min.z + bounds.max.z) * 0.5,
  };
}
