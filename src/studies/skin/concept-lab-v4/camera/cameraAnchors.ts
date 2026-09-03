import * as THREE from "three";
import type { ConceptSource } from "../sourceAdapter.ts";
import type { CameraAnchor } from "./cameraTypes.ts";

function degreeMap(source: ConceptSource): number[] {
  const degrees = source.nodes.map(() => 0);
  source.edges.forEach((edge) => {
    if (edge.startIndex >= 0) degrees[edge.startIndex] = (degrees[edge.startIndex] ?? 0) + 1;
    if (edge.endIndex >= 0) degrees[edge.endIndex] = (degrees[edge.endIndex] ?? 0) + 1;
  });
  return degrees;
}

function anchor(id: string, position: THREE.Vector3, kind: CameraAnchor["kind"], importance: number, radius: number): CameraAnchor {
  return { id, position: position.clone(), target: position.clone(), kind, importance, radius };
}

export function buildCameraAnchors(source: ConceptSource): readonly CameraAnchor[] {
  const degrees = degreeMap(source);
  const anchors: CameraAnchor[] = [];
  source.motifs.slice(0, 18).forEach((motif, index) => anchors.push(anchor(motif.id, motif.center, "motif", 0.78 + (18 - index) * 0.01, motif.scale * 5.2)));
  source.nodes
    .map((position, index) => ({ position, index, degree: degrees[index] ?? 0 }))
    .sort((a, b) => b.degree - a.degree || a.index - b.index)
    .slice(0, 18)
    .forEach((item, index) => anchors.push(anchor(`junction-${item.index}`, item.position, "junction", 0.98 - index * 0.018, 0.16 + item.degree * 0.018)));
  source.edges
    .map((edge, index) => ({ edge, index, score: edge.supportRole * 0.55 + edge.connectivity * 0.2 + edge.density * 0.25 }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 18)
    .forEach((item, index) => anchors.push(anchor(`support-${item.edge.id}`, item.edge.midpoint, "support", 0.9 - index * 0.02, 0.12 + item.edge.length * 0.12)));
  source.edges
    .map((edge, index) => ({ edge, index, score: edge.density * 0.55 + edge.connectivity * 0.35 + edge.length * 0.1 }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 12)
    .forEach((item, index) => anchors.push(anchor(`dense-${item.edge.id}`, item.edge.midpoint, "dense-region", 0.86 - index * 0.022, 0.18 + item.edge.length * 0.1)));
  source.edges
    .map((edge, index) => ({ edge, index, score: edge.directionChange * 0.65 + (1 - edge.connectivity) * 0.35 }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 12)
    .forEach((item, index) => anchors.push(anchor(`gap-${item.edge.id}`, item.edge.midpoint, index % 2 === 0 ? "void" : "wound", 0.82 - index * 0.024, 0.14 + item.edge.length * 0.08)));
  anchors.push(anchor("center", source.center, "center", 0.74, 0.9));
  anchors.push(anchor("edge-left", new THREE.Vector3(-3.3, 0, 0), "edge", 0.45, 0.5));
  anchors.push(anchor("edge-right", new THREE.Vector3(3.3, 0, 0), "edge", 0.44, 0.5));
  return anchors;
}

export function anchorsOfKind(anchors: readonly CameraAnchor[], kind: CameraAnchor["kind"]): readonly CameraAnchor[] {
  return anchors.filter((item) => item.kind === kind);
}

export function bestAnchor(anchors: readonly CameraAnchor[], kinds: readonly CameraAnchor["kind"][], fallback: CameraAnchor): CameraAnchor {
  const candidates = anchors.filter((item) => kinds.includes(item.kind));
  return [...candidates].sort((a, b) => b.importance - a.importance)[0] ?? fallback;
}
