import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { CONCEPT_DEFINITIONS } from "../conceptRegistry.ts";
import { adaptConceptSource } from "../sourceAdapter.ts";
import { V4_PALETTES } from "../conceptTypes.ts";
import { defaultParameters } from "../parameterStore.ts";
import type { VisualStudySource } from "../../visual-studies/catalog.ts";

const source = {
  graph: {
    kind: "voronoiEdge",
    nodes: [
      { id: 0, position: { x: -1, y: 0, z: 0 }, radius: 0.1 },
      { id: 1, position: { x: 0, y: 1, z: 0 }, radius: 0.1 },
      { id: 2, position: { x: 1, y: 0, z: 0 }, radius: 0.1 },
      { id: 3, position: { x: 0, y: -1, z: 0 }, radius: 0.1 },
    ],
    edges: [{ id: 0, start: 0, end: 1, radius: 0.05 }, { id: 1, start: 1, end: 2, radius: 0.05 }, { id: 2, start: 2, end: 3, radius: 0.05 }, { id: 3, start: 3, end: 0, radius: 0.05 }],
    stats: {},
  },
  base: { kind: "metaball-capsule", host: [{ id: 1, x: 0, y: 0, z: 0, r: 1 }], hostK: 1 },
  patterns: [0, 1, 2, 3].map((id) => ({ id, shape: "flower", points: [{ x: Math.cos(id * Math.PI / 2), y: Math.sin(id * Math.PI / 2), z: 0, r: 0.1 }] })),
  project: undefined,
} as unknown as VisualStudySource;

test("every V4 concept can mount, update, and dispose repeatedly", () => {
  const mapped = adaptConceptSource(source);
  for (const definition of CONCEPT_DEFINITIONS) {
    for (let repeat = 0; repeat < 3; repeat += 1) {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(46, 1, 0.01, 100);
      const instance = definition.create({ source: mapped, scene, camera, seed: repeat + 11, quality: "desktop", parameters: defaultParameters(definition.parameters), palette: "rich", colors: V4_PALETTES.rich });
      instance.update({ elapsedSeconds: 2.1, deltaSeconds: 1 / 60, localTime: 2.1, eventEnergy: 0.5, paused: false });
      assert.doesNotThrow(() => instance.dispose(), definition.id);
    }
  }
});
