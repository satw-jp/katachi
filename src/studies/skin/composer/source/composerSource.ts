import * as THREE from "three";
import { parseSkinRebuildFkei, projectFromSkinRebuildFkei } from "../../rebuild/fkei.ts";
import { adaptConceptSource, type ConceptEdge, type ConceptSource } from "../../concept-lab-v4/sourceAdapter.ts";

export interface ComposerStatistics {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly motifCount: number;
  readonly averageEdgeLength: number;
  readonly maxEdgeLength: number;
  readonly densityMean: number;
  readonly densityVariance: number;
  readonly maxConnectivity: number;
  readonly supportMean: number;
  readonly directionChangeMean: number;
}

export interface ComposerSource {
  readonly fingerprint: string;
  readonly nodes: readonly THREE.Vector3[];
  readonly edges: readonly ConceptEdge[];
  readonly motifs: readonly { id: string; center: THREE.Vector3; scale: number; sourceIndex: number }[];
  readonly bounds: THREE.Box3;
  readonly center: THREE.Vector3;
  readonly span: number;
  readonly statistics: ComposerStatistics;
}

function hashText(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function boundsFor(source: ConceptSource, project: ReturnType<typeof projectFromSkinRebuildFkei>): THREE.Box3 {
  const points = [
    ...project.finalGraph.nodes.map((node) => new THREE.Vector3(node.position.x, node.position.y, node.position.z)),
    ...project.patterns.flatMap((pattern) => pattern.points.map((point) => new THREE.Vector3(point.x, point.y, point.z))),
    ...project.base.host.map((ball) => new THREE.Vector3(ball.x, ball.y, ball.z)),
  ];
  return new THREE.Box3().setFromPoints(points.length ? points : [...source.nodes]);
}

function statistics(edges: readonly ConceptEdge[], nodes: readonly THREE.Vector3[], motifs: readonly unknown[]): ComposerStatistics {
  const lengths = edges.map((edge) => edge.length);
  const densities = edges.map((edge) => edge.density);
  const mean = densities.reduce((sum, value) => sum + value, 0) / Math.max(1, densities.length);
  const variance = densities.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, densities.length);
  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    motifCount: motifs.length,
    averageEdgeLength: lengths.reduce((sum, value) => sum + value, 0) / Math.max(1, lengths.length),
    maxEdgeLength: Math.max(0, ...lengths),
    densityMean: mean,
    densityVariance: variance,
    maxConnectivity: Math.max(0, ...edges.map((edge) => edge.connectivity)),
    supportMean: edges.reduce((sum, edge) => sum + edge.supportRole, 0) / Math.max(1, edges.length),
    directionChangeMean: edges.reduce((sum, edge) => sum + edge.directionChange, 0) / Math.max(1, edges.length),
  };
}

export function composerSourceFromFkeiText(text: string): ComposerSource {
  const document = parseSkinRebuildFkei(text);
  const project = projectFromSkinRebuildFkei(document);
  const mapped = adaptConceptSource({ graph: project.finalGraph, base: project.base, patterns: project.patterns, project });
  const bounds = boundsFor(mapped, project);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  return {
    fingerprint: `fkei-${hashText(text)}`,
    nodes: mapped.nodes,
    edges: mapped.edges,
    motifs: mapped.motifs,
    bounds,
    center,
    span: Math.max(size.x, size.y, size.z, 1),
    statistics: statistics(mapped.edges, mapped.nodes, mapped.motifs),
  };
}
