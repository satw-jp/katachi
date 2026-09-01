import assert from "node:assert/strict";
import { analyzeStage6MeshTopology } from "./stage6MeshTopologyDiagnostics.ts";

{
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      0, 0, 0, 0, 0, 1, 1, 0, 0,
      0, 0, 0, 0, 1, 0, 0, 0, 1,
      1, 0, 0, 0, 0, 1, 0, 1, 0,
      10, 0, 0, 10, 0, 0, 10, 1, 0,
    ]);
    const before = positions.slice();
    const result = analyzeStage6MeshTopology(positions, 100);

    assert.equal(result.componentCount, 2);
    assert.deepEqual(result.components.map((component) => component.triangleCount), [4, 1]);
    assert.deepEqual([...result.faceComponentIds], [0, 0, 0, 0, 1]);
    assert.deepEqual([...result.degenerateFaceIndices], [4]);
    assert.ok(result.components[0].volumeMm3 > 0);
    assert.equal(result.components[1].volumeMm3, 0);
    assert.ok(result.components[1].boundsMm.size[1] > 0);
    assert.deepEqual(positions, before);
}
