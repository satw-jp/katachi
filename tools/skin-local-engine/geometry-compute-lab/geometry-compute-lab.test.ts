import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  GEOMETRY_COMPUTE_LAB_CONTRACT,
  MESH_ANALYSIS_FIELD_ALGORITHM,
  SHADOW_GEOMETRY_COMPUTE_POLICY,
  assertGeometryComputeIdentity,
  type MeshAnalysisFieldRequest,
} from "./contracts.ts";
import {
  classifyContinuousField,
  evaluateMeshAnalysisFieldOnWeb,
  fieldClassificationName,
} from "./web-reference.ts";
import { createFinishedBodyFieldSnapshotV1 } from "./finished-body-snapshot.ts";

const sha = (value: string): `sha256:${string}` =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

const request: MeshAnalysisFieldRequest = {
  contract: GEOMETRY_COMPUTE_LAB_CONTRACT,
  operation: "evaluateMeshAnalysisField",
  algorithmContract: MESH_ANALYSIS_FIELD_ALGORITHM,
  requestId: "mesh-analysis-test",
  projectFingerprint: sha("project"),
  topologyFingerprint: sha("topology"),
  coordinateFrame: "object",
  unitsPerMillimeter: 1,
  positions: new Float32Array([
    -0.25, -0.25, 0, 0.25, -0.25, 0, 0, 0.25, 0,
    -0.25, -0.25, 2, 0, 0.25, 2, 0.25, -0.25, 2,
  ]),
  baseField: {
    kind: "metaball-smooth-union",
    contractVersion: 1,
    balls: [{ id: 1, x: 0, y: 0, z: 0, r: 1 }],
    smoothness: 0.1,
  },
  buildAxis: "+z",
  requestedFields: ["insideScore", "overhangAngleDeg"],
};

assertGeometryComputeIdentity(request);
const result = evaluateMeshAnalysisFieldOnWeb(request);
assert.deepEqual([...result.faceIndices], [0, 1]);
assert.equal(result.insideScore[0] < 0, true);
assert.equal(result.insideScore[1] > 0, true);
assert.equal(result.overhangAngleDeg[0], 0);
assert.equal(result.overhangAngleDeg[1], 90);
assert.deepEqual(result.policy, SHADOW_GEOMETRY_COMPUTE_POLICY);
assert.equal(result.policy.productionApplied, false);

const first = classifyContinuousField(result.insideScore, 0, 0.01);
const biased = classifyContinuousField(result.insideScore, 1.5, 0.01);
assert.equal(fieldClassificationName(first[0]), "inside");
assert.equal(fieldClassificationName(first[1]), "outside");
assert.notDeepEqual([...first], [...biased]);
assert.equal(result.insideScore[0] < 0, true, "thresholding must not mutate the cached field");

assert.throws(() => assertGeometryComputeIdentity({ ...request, unitsPerMillimeter: 0 }));
assert.throws(() => evaluateMeshAnalysisFieldOnWeb({
  ...request,
  positions: new Float32Array([0, 0, 0]),
}));

const finishedBodyInput = {
  mode: "plate" as const,
  host: [{ id: 1, x: 0, y: 0, z: 0, r: 1 }],
  hostK: 0.1,
  thickness: 0.2,
  patches: [{ id: 1, shape: "coin" as const, points: [{ x: 1, y: 0, z: 0, r: 0.25 }] }],
  roundK: 0.05,
  coinBulge: 0,
  coinBulgeBalance: 0,
  quadMeshJoinWidth: 0,
  internalGraph: {
    kind: "targetedGrid" as const,
    nodes: [
      { id: 0, position: { x: -0.5, y: 0, z: 0 }, radius: 0.04 },
      { id: 1, position: { x: 0.5, y: 0, z: 0 }, radius: 0.04 },
    ],
    edges: [{ id: 0, start: 0, end: 1, radius: 0.04 }],
    stats: { inputPoints: 2, delaunayTetrahedra: 0, candidateEdges: 1, clippedEdges: 0,
      removedShortEdges: 0, removedOutsideEdges: 0, removedIsolatedEdges: 0 },
  },
};
const snapshotA = createFinishedBodyFieldSnapshotV1(finishedBodyInput, {
  projectFingerprint: sha("finished-body-project"),
  unitsPerMillimeter: 0.1,
});
const snapshotB = createFinishedBodyFieldSnapshotV1(finishedBodyInput, {
  projectFingerprint: sha("finished-body-project"),
  unitsPerMillimeter: 0.1,
});
assert.equal(snapshotA.geometryFingerprint, snapshotB.geometryFingerprint);
assert.equal(snapshotA.byteLength, snapshotA.payload.length);
assert.equal(snapshotA.sourceCounts.removableSupportPrimitives, 0);
assert.equal(snapshotA.capsules.length, 1);
assert.equal(Object.isFrozen(snapshotA), true);
assert.throws(() => createFinishedBodyFieldSnapshotV1({ ...finishedBodyInput, coinBulge: 0.1 }, {
  projectFingerprint: sha("finished-body-project"), unitsPerMillimeter: 0.1,
}));

process.stdout.write("geometry compute lab tests: 13/13 passed\n");
