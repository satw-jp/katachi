import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { projectV3Source } from "./source.ts";
import type { VisualStudySource } from "../visual-studies/catalog.ts";

test("V3 source mapping exposes deterministic graph-derived visual metrics", () => {
  const source = {
    graph: {
      kind: "voronoiEdge",
      nodes: [
        { id: 0, position: { x: -1, y: 0, z: 0 } },
        { id: 1, position: { x: 0, y: 0, z: 0 } },
        { id: 2, position: { x: 1, y: 1, z: 0 } },
      ],
      edges: [
        { start: 0, end: 1 },
        { start: 1, end: 2 },
      ],
      stats: {},
    },
    base: { host: [{ id: 1, x: 0, y: 0, z: 0, r: 0.3 }], hostK: 1 },
    patterns: [{ id: 1, shape: "flower", points: [{ x: 1, y: 1, z: 0, r: 0.1 }] }],
    project: undefined,
  } as unknown as VisualStudySource;

  const mapped = projectV3Source(source);
  assert.equal(mapped.metrics.length, 2);
  assert.equal(mapped.nodes.length, 3);
  assert.equal(mapped.motifs.length, 1);
  assert.ok(mapped.metrics.every((metric) => metric.sourceId.startsWith("edge-")));
  assert.ok(mapped.metrics.every((metric) => metric.position instanceof THREE.Vector3));
  assert.ok(mapped.metrics.every((metric) => metric.density >= 0 && metric.density <= 1));
  assert.ok(mapped.metrics.every((metric) => metric.connectivity >= 0 && metric.connectivity <= 1));
  assert.ok(mapped.metrics.every((metric) => metric.direction.length() > 0.99));
});
