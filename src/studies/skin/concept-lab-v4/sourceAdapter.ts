import * as THREE from "three";
import { projectV3Source } from "../concept-movies-v3/source.ts";
import type { VisualStudySource } from "../visual-studies/catalog.ts";

export interface ConceptEdge {
  readonly id: string;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly start: THREE.Vector3;
  readonly end: THREE.Vector3;
  readonly midpoint: THREE.Vector3;
  readonly length: number;
  readonly direction: THREE.Vector3;
  readonly density: number;
  readonly connectivity: number;
  readonly directionChange: number;
  readonly motifInfluence: number;
  readonly supportRole: number;
}

export interface ConceptMotif {
  readonly id: string;
  readonly center: THREE.Vector3;
  readonly scale: number;
  readonly sourceIndex: number;
}

export interface ConceptSource {
  readonly fingerprint: string;
  readonly nodes: readonly THREE.Vector3[];
  readonly edges: readonly ConceptEdge[];
  readonly motifs: readonly ConceptMotif[];
  readonly center: THREE.Vector3;
}

function normalize(value: THREE.Vector3, center: THREE.Vector3, span: number): THREE.Vector3 {
  return value.clone().sub(center).multiplyScalar(4.2 / Math.max(1, span));
}

export function adaptConceptSource(source: VisualStudySource): ConceptSource {
  const mapped = projectV3Source(source);
  const nodes = mapped.nodes.map((node) => normalize(node, mapped.center, mapped.span));
  const motifs = mapped.motifs.map((motif, index) => ({
    id: `motif-${index}`,
    center: normalize(motif, mapped.center, mapped.span),
    scale: 0.12 + (index % 4) * 0.025,
    sourceIndex: index,
  }));
  const edges = mapped.metrics.map((metric, index) => {
    const edge = mapped.graph.edges[index];
    const start = nodes[edge?.start ?? -1]?.clone() ?? normalize(metric.position, mapped.center, mapped.span);
    const end = nodes[edge?.end ?? -1]?.clone() ?? start.clone();
    const midpoint = start.clone().add(end).multiplyScalar(0.5);
    return {
      id: metric.sourceId,
      startIndex: edge?.start ?? -1,
      endIndex: edge?.end ?? -1,
      start,
      end,
      midpoint,
      length: start.distanceTo(end),
      direction: end.clone().sub(start).normalize(),
      density: metric.density,
      connectivity: metric.connectivity,
      directionChange: metric.directionChange,
      motifInfluence: metric.motifInfluence,
      supportRole: metric.supportRole,
    };
  });
  return {
    fingerprint: `graph-${source.graph.kind}-${source.graph.nodes.length}-${source.graph.edges.length}-motifs-${source.patterns.length}`,
    nodes,
    edges,
    motifs,
    center: new THREE.Vector3(),
  };
}
