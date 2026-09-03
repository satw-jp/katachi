import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { buildConceptCameraScore } from "../camera/scores/index.ts";
import { cameraParameters } from "../camera/cameraRuntime.ts";
import type { ConceptSource } from "../sourceAdapter.ts";

function source(): ConceptSource {
  const nodes = [-1.6, -0.4, 0.8, 1.7].map((x, index) => new THREE.Vector3(x, Math.sin(index) * 0.35, index % 2 ? 0.2 : -0.1));
  const edges = nodes.slice(0, -1).map((start, index) => {
    const end = nodes[index + 1]!;
    return {
      id: `edge-${index}`,
      startIndex: index,
      endIndex: index + 1,
      start: start.clone(),
      end: end.clone(),
      midpoint: start.clone().add(end).multiplyScalar(0.5),
      length: start.distanceTo(end),
      direction: end.clone().sub(start).normalize(),
      density: 0.45 + index * 0.18,
      connectivity: 0.5 + index * 0.12,
      directionChange: 0.2 + index * 0.15,
      motifInfluence: 0.7 - index * 0.1,
      supportRole: 0.35 + index * 0.2,
    };
  });
  return {
    fingerprint: "camera-test-source",
    nodes,
    edges,
    motifs: [
      { id: "motif-a", center: nodes[0]!.clone(), scale: 0.16, sourceIndex: 0 },
      { id: "motif-b", center: nodes[2]!.clone(), scale: 0.2, sourceIndex: 2 },
    ],
    center: new THREE.Vector3(),
  };
}

test("all ten V4 concepts have a source-derived camera score", () => {
  const sourceData = source();
  const params = cameraParameters({});
  const concepts = ["weight-of-hesitation", "mutual-rescue", "void-bouquet", "inside-out", "one-hand-many-flowers", "craft-strata", "shadow-room", "micro-landscape", "visible-mending", "structural-choir"];
  const scores = concepts.map((concept) => buildConceptCameraScore(concept, sourceData, 12345, params));
  assert.equal(new Set(scores.map((score) => score.id)).size, concepts.length);
  assert.ok(scores.every((score) => score.duration >= 10));
  assert.ok(scores.some((score) => score.segments.some((segment) => segment.kind === "pass-through")));
  assert.ok(scores.some((score) => score.segments.some((segment) => segment.kind === "hold")));
  assert.ok(scores.some((score) => score.segments.some((segment) => segment.kind === "target-shift")));
});

test("camera scores are deterministic for the same source, seed, and time", () => {
  const sourceData = source();
  const params = cameraParameters({});
  const first = buildConceptCameraScore("void-bouquet", sourceData, 67890, params).sample(4.75);
  const second = buildConceptCameraScore("void-bouquet", sourceData, 67890, params).sample(4.75);
  assert.deepEqual(first.position.toArray(), second.position.toArray());
  assert.deepEqual(first.target.toArray(), second.target.toArray());
  assert.equal(first.fov, second.fov);
});
