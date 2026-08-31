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

process.stdout.write("geometry compute lab tests: 7/7 passed\n");
