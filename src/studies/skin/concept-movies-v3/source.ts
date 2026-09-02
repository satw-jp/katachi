import * as THREE from "three";
import type { InternalStructureGraph } from "../voronoi.ts";
import type { VisualStudySource } from "../visual-studies/catalog.ts";

export interface VisualSourceMetric {
  readonly sourceId: string;
  readonly position: THREE.Vector3;
  readonly density: number;
  readonly connectivity: number;
  readonly directionChange: number;
  readonly motifInfluence: number;
  readonly lengthInfluence: number;
  readonly supportRole: number;
  readonly direction: THREE.Vector3;
}

export interface V3Source {
  readonly graph: InternalStructureGraph;
  readonly metrics: readonly VisualSourceMetric[];
  readonly motifs: readonly THREE.Vector3[];
  readonly nodes: readonly THREE.Vector3[];
  readonly center: THREE.Vector3;
  readonly span: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function edgeDirection(graph: InternalStructureGraph, positions: readonly THREE.Vector3[], edgeIndex: number, nodeIndex: number): THREE.Vector3 {
  const edge = graph.edges[edgeIndex];
  const own = positions[nodeIndex] ?? new THREE.Vector3();
  const other = edge?.start === nodeIndex ? edge.end : edge?.start;
  return (positions[other ?? nodeIndex] ?? own).clone().sub(own).normalize();
}

export function projectV3Source(source: VisualStudySource): V3Source {
  const graph = source.graph;
  const nodes = graph.nodes.map((node) => new THREE.Vector3(node.position.x, node.position.y, node.position.z));
  const motifs = source.patterns.map((patch) => patch.points.reduce(
    (sum, point) => sum.add(new THREE.Vector3(point.x, point.y, point.z)),
    new THREE.Vector3(),
  ).multiplyScalar(1 / Math.max(1, patch.points.length)));
  const edgePositions = graph.edges.map((edge) => {
    const start = nodes[edge.start] ?? new THREE.Vector3();
    const end = nodes[edge.end] ?? start;
    return start.clone().add(end).multiplyScalar(0.5);
  });
  const degrees = Array.from({ length: nodes.length }, () => 0);
  const incident = new Map<number, number[]>();
  for (const [edgeIndex, edge] of graph.edges.entries()) {
    for (const nodeIndex of [edge.start, edge.end]) {
      if (degrees[nodeIndex] !== undefined) degrees[nodeIndex]++;
      const list = incident.get(nodeIndex) ?? [];
      list.push(edgeIndex);
      incident.set(nodeIndex, list);
    }
  }
  const lengths = graph.edges.map((edge) => (nodes[edge.start] ?? new THREE.Vector3()).distanceTo(nodes[edge.end] ?? new THREE.Vector3()));
  const minLength = Math.min(...lengths, 0);
  const maxLength = Math.max(...lengths, 1);
  const bounds = new THREE.Box3().setFromPoints([
    ...nodes,
    ...motifs,
    ...source.base.host.map((ball) => new THREE.Vector3(ball.x, ball.y, ball.z)),
  ]);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z, 1);
  const turnAt = (edgeIndex: number, nodeIndex: number): number => {
    const current = edgeDirection(graph, nodes, edgeIndex, nodeIndex);
    const neighbors = (incident.get(nodeIndex) ?? []).filter((candidate) => candidate !== edgeIndex);
    if (neighbors.length === 0) return 0;
    return clamp01(neighbors.reduce((sum, neighbor) => (
      sum + 1 - Math.abs(current.dot(edgeDirection(graph, nodes, neighbor, nodeIndex)))
    ), 0) / neighbors.length);
  };
  const metrics = graph.edges.map((edge, index): VisualSourceMetric => {
    const position = edgePositions[index] ?? center;
    const lengthInfluence = maxLength - minLength < 0.000001
      ? 0.5
      : clamp01(((lengths[index] ?? 0) - minLength) / (maxLength - minLength));
    const connectivity = clamp01(((degrees[edge.start] ?? 0) + (degrees[edge.end] ?? 0)) / 12);
    const directionChange = clamp01(turnAt(index, edge.start) * 0.56 + turnAt(index, edge.end) * 0.44);
    const nearby = edgePositions.reduce((count, other, otherIndex) => (
      otherIndex !== index && other.distanceTo(position) < span * 0.2 ? count + 1 : count
    ), 0);
    const density = clamp01(nearby / 14 + connectivity * 0.4);
    const nearestMotif = motifs.length === 0 ? span : Math.min(...motifs.map((motif) => motif.distanceTo(position)));
    const motifInfluence = 1 - clamp01(nearestMotif / (span * 0.72));
    const supportRole = clamp01(connectivity * 0.5 + density * 0.28 + motifInfluence * 0.22);
    return {
      sourceId: `edge-${index}`,
      position,
      density,
      connectivity,
      directionChange,
      motifInfluence,
      lengthInfluence,
      supportRole,
      direction: (nodes[edge.end] ?? position).clone().sub(nodes[edge.start] ?? position).normalize(),
    };
  });
  return { graph, metrics, motifs, nodes, center, span };
}
