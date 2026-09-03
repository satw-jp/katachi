import assert from "node:assert/strict";
import test from "node:test";
import { adaptConceptSource } from "../sourceAdapter.ts";
import type { VisualStudySource } from "../../visual-studies/catalog.ts";

test("V4 source adapter does not mutate the source graph or patterns", () => {
  const source = {
    graph: { kind: "voronoiEdge", nodes: [{ id: 0, position: { x: -1, y: 0, z: 0 }, radius: 0.1 }, { id: 1, position: { x: 1, y: 0, z: 0 }, radius: 0.1 }], edges: [{ id: 0, start: 0, end: 1, radius: 0.05 }], stats: {} },
    base: { kind: "metaball-capsule", host: [{ id: 1, x: 0, y: 0, z: 0, r: 0.3 }], hostK: 1 },
    patterns: [{ id: 1, shape: "flower", points: [{ x: 1, y: 1, z: 0, r: 0.1 }] }],
    project: undefined,
  } as unknown as VisualStudySource;
  const before = JSON.stringify(source);
  const mapped = adaptConceptSource(source);
  assert.equal(JSON.stringify(source), before);
  mapped.nodes[0]!.x = 999;
  assert.equal(JSON.stringify(source), before);
});
